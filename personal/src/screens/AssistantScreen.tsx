import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, FlatList, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { approveAndSign, biometricAvailable, ensureDeviceRegistered, signWithoutBiometric } from '../lib/deviceKey';
import { showAlert } from '../lib/dialog';
import PinPad from '../components/PinPad';
import { errorMessage, formatMoney } from '../lib/format';
import type { ChatDraft } from '../types';
import type { RootStackParamList } from '../navigation';
import { Button } from '../components/ui';
import GreenBackdrop from '../components/GreenBackdrop';
import { useAuth } from '../contexts/AuthContext';
import { colors, radius, spacing, type } from '../theme';

type Props = StackScreenProps<RootStackParamList, 'Assistant'>;

type Item =
  | { id: string; kind: 'user' | 'assistant'; text: string }
  | { id: string; kind: 'draft'; draft: ChatDraft; state: 'pending' | 'sending' | 'sent' | 'failed'; note?: string };

/**
 * Chat with the Vireo assistant. It can look things up and prepare a transfer,
 * but it can never send money: a draft appears here as a card that only moves
 * once you approve it with your biometric, like any other payment.
 */
export default function AssistantScreen({ navigation }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState('');
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { user } = useAuth();
  const [bioAvailable, setBioAvailable] = useState(false);
  const [pinSet, setPinSet] = useState(false);
  const [pinFor, setPinFor] = useState<Extract<Item, { kind: 'draft' }> | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);

  // How a payment prepared here can be confirmed on this phone: fingerprint/face, or the PIN.
  // Re-read whenever the screen is shown again (e.g. after setting a PIN).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      biometricAvailable().then((v) => !cancelled && setBioAvailable(v));
      api.getPinStatus().then((s) => !cancelled && setPinSet(s.set)).catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, []),
  );
  const list = useRef<FlatList<Item>>(null);
  const counter = useRef(0);
  const nextId = () => `m${(counter.current += 1)}`;

  const send = async (override?: string) => {
    const message = (override ?? text).trim();
    if (!message || sending) return;
    setText('');
    setItems((prev) => [...prev, { id: nextId(), kind: 'user', text: message }]);
    setSending(true);
    try {
      const deviceId = await ensureDeviceRegistered().catch(() => undefined);
      const res = await api.chat(message, sessionId, deviceId);
      setSessionId(res.sessionId);
      setItems((prev) => [
        ...prev,
        { id: nextId(), kind: 'assistant', text: res.reply },
        ...res.drafts.map((draft) => ({ id: nextId(), kind: 'draft' as const, draft, state: 'pending' as const })),
      ]);
    } catch (e) {
      setItems((prev) => [...prev, { id: nextId(), kind: 'assistant', text: errorMessage(e, 'The assistant is unavailable right now.') }]);
    } finally {
      setSending(false);
    }
  };

  const setDraftState = (id: string, state: 'pending' | 'sending' | 'sent' | 'failed', note?: string) =>
    setItems((prev) => prev.map((i) => (i.id === id && i.kind === 'draft' ? { ...i, state, note } : i)));

  const openPin = (item: Extract<Item, { kind: 'draft' }>) => {
    setPinError(null);
    setPinFor(item);
  };

  const approveWithPin = async (pin: string) => {
    const item = pinFor;
    if (!item) return;
    setPinBusy(true);
    setPinError(null);
    try {
      const signature = await signWithoutBiometric(item.draft.challenge.payloadHash);
      const result = await api.submitTransfer(item.draft.transferId, signature, { approval: 'pin', pin });
      setPinFor(null);
      setDraftState(item.id, result.transfer.status === 'failed' ? 'failed' : 'sent', result.transfer.failureReason ?? undefined);
    } catch (e) {
      // Wrong PIN etc.: stay on the pad (the server counts attempts and locks).
      setPinError(errorMessage(e, 'Could not send this payment'));
    } finally {
      setPinBusy(false);
    }
  };

  const approve = async (item: Extract<Item, { kind: 'draft' }>) => {
    if (!bioAvailable) {
      if (!pinSet) {
        return showAlert('Set a PIN to pay', 'This phone has no fingerprint or face unlock set up. Set a 4-digit PIN to confirm payments.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Set PIN', onPress: () => navigation.navigate('Pin') },
        ]);
      }
      return openPin(item);
    }
    setDraftState(item.id, 'sending');
    try {
      const approval = await approveAndSign(item.draft.challenge.payloadHash);
      const result = await api.submitTransfer(item.draft.transferId, approval.signature);
      setDraftState(item.id, result.transfer.status === 'failed' ? 'failed' : 'sent', result.transfer.failureReason ?? undefined);
    } catch (e) {
      setDraftState(item.id, 'failed', errorMessage(e, 'Could not send this payment'));
    }
  };

  const first = user?.name?.trim().split(/\s+/)[0] ?? 'there';
  const suggestions = ['What is my balance?', 'Show my recent activity', 'I want to send money', 'How much are bank fees?'];

  const ask = (message: string) => {
    setShowSuggestions(false);
    send(message);
  };

  return (
    <View style={styles.fill}>
      <GreenBackdrop />
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <Modal transparent animationType="fade" visible={!!pinFor} onRequestClose={() => setPinFor(null)}>
          <View style={styles.pinBackdrop}>
            <View style={styles.pinSheet}>
              {pinFor ? (
                <PinPad
                  title="Enter your PIN"
                  subtitle={`Confirm ${formatMoney(pinFor.draft.amount)} to ${pinFor.draft.recipientName ?? 'this payee'}`}
                  error={pinError}
                  onComplete={approveWithPin}
                  disabled={pinBusy}
                />
              ) : null}
              <Button title="Cancel" variant="ghost" onPress={() => setPinFor(null)} style={{ marginTop: spacing.lg }} />
            </View>
          </View>
        </Modal>

        <View style={styles.topBar}>
          <TouchableOpacity style={styles.glassCircle} onPress={() => navigation.goBack()} accessibilityLabel="Back">
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FlatList
            ref={list}
            data={items}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.md, gap: spacing.md }}
            onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
            ListHeaderComponent={
              <View style={styles.hero}>
                <Text style={styles.heroThin}>Hello {first}</Text>
                <Text style={styles.heroThin}>
                  Can <Text style={styles.heroBold}>I help you?</Text>
                </Text>
              </View>
            }
            renderItem={({ item }) =>
              item.kind === 'draft' ? (
                <View style={styles.draft}>
                  <Text style={styles.draftLabel}>PAYMENT READY TO APPROVE</Text>
                  <Text style={styles.draftAmount}>{formatMoney(item.draft.amount)}</Text>
                  <Text style={styles.draftTo}>
                    to {item.draft.recipientName}
                    {item.draft.bank ? ` · ${item.draft.bank}` : ''}
                  </Text>
                  {item.draft.fee !== '0.00' && <Text style={styles.draftTo}>Fee {formatMoney(item.draft.fee)}</Text>}
                  {item.state === 'sent' ? (
                    <Text style={styles.sent}>✓ Sent</Text>
                  ) : (
                    <>
                      {item.state === 'failed' && <Text style={styles.failed}>{item.note ?? 'Payment failed'}</Text>}
                      <Button
                        title={item.state === 'failed' ? 'Try approving again' : 'Approve & pay'}
                        variant="primary"
                        loading={item.state === 'sending'}
                        onPress={() => approve(item)}
                        style={{ marginTop: spacing.md }}
                      />
                      {bioAvailable && pinSet ? (
                        <Button title="Use PIN instead" variant="ghost" onPress={() => openPin(item)} />
                      ) : null}
                    </>
                  )}
                </View>
              ) : item.kind === 'user' ? (
                <View style={styles.userBubble}>
                  <Text style={styles.userText}>{item.text}</Text>
                </View>
              ) : (
                <View style={styles.botBubble}>
                  <Text style={styles.botText}>{item.text}</Text>
                </View>
              )
            }
            ListFooterComponent={
              sending ? (
                <View style={styles.typingBubble}>
                  <Text style={styles.typingDots}>• • •</Text>
                </View>
              ) : null
            }
          />

          {showSuggestions ? (
            <View style={styles.chips}>
              {suggestions.map((q) => (
                <TouchableOpacity key={q} style={styles.chip} onPress={() => ask(q)}>
                  <Text style={styles.chipText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <View style={styles.composer}>
            <TouchableOpacity style={styles.plus} onPress={() => setShowSuggestions((v) => !v)} accessibilityLabel="Suggestions">
              <Text style={styles.plusText}>{showSuggestions ? '×' : '+'}</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Ask anything"
              placeholderTextColor="rgba(255,255,255,0.7)"
              onSubmitEditing={() => send()}
              returnKeyType="send"
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.sendPill, (!text.trim() || sending) && { opacity: 0.5 }]}
              disabled={!text.trim() || sending}
              onPress={() => send()}
              accessibilityLabel="Send"
            >
              <Text style={styles.sendText}>↑</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const GLASS = 'rgba(255,255,255,0.16)';
const GLASS_BORDER = 'rgba(255,255,255,0.35)';

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  glassCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER, alignItems: 'center', justifyContent: 'center' },
  backArrow: { color: '#FFFFFF', fontSize: 22, fontWeight: '500' },
  hero: { marginTop: spacing.xl, marginBottom: spacing.xl },
  heroThin: { color: '#FFFFFF', fontSize: 30, fontWeight: '200', lineHeight: 38 },
  heroBold: { fontWeight: '800' },
  userBubble: { alignSelf: 'flex-end', maxWidth: '80%', backgroundColor: '#FFFFFF', borderRadius: 26, paddingHorizontal: 20, paddingVertical: 14 },
  userText: { color: '#101410', fontSize: 16, lineHeight: 22 },
  botBubble: { alignSelf: 'flex-start', maxWidth: '84%', backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER, borderRadius: 26, paddingHorizontal: 20, paddingVertical: 14 },
  botText: { color: '#FFFFFF', fontSize: 16, lineHeight: 22 },
  typingBubble: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderRadius: 26, paddingHorizontal: 22, paddingVertical: 12 },
  typingDots: { color: '#101410', fontSize: 14, letterSpacing: 2 },
  draft: { backgroundColor: 'rgba(0,0,0,0.28)', borderWidth: 1, borderColor: GLASS_BORDER, borderRadius: 28, padding: spacing.xl },
  draftLabel: { ...type.label, color: '#D6F047' },
  draftAmount: { ...type.display, color: '#FFFFFF', marginTop: spacing.sm },
  draftTo: { ...type.body, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  sent: { ...type.heading, color: '#D6F047', marginTop: spacing.md },
  failed: { ...type.caption, color: '#FFB4AC', marginTop: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  chip: { backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  chipText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    padding: 8,
    borderRadius: 999,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  plus: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#16C247', alignItems: 'center', justifyContent: 'center' },
  plusText: { color: '#FFFFFF', fontSize: 28, fontWeight: '300', marginTop: -2 },
  input: { flex: 1, color: '#FFFFFF', fontSize: 18, paddingVertical: 8 },
  sendPill: { width: 66, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#FFFFFF', fontSize: 22, fontWeight: '600' },
  pinBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  pinSheet: { width: '100%', maxWidth: 420, backgroundColor: colors.bg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.xl },
});
