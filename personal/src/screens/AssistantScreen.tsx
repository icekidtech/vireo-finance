import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, FlatList, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { approveAndSign, biometricAvailable, ensureDeviceRegistered, signWithoutBiometric } from '../lib/deviceKey';
import { showAlert } from '../lib/dialog';
import PinPad from '../components/PinPad';
import { errorMessage, formatMoney } from '../lib/format';
import type { ChatDraft } from '../types';
import type { RootStackParamList } from '../navigation';
import { Button, Header } from '../components/ui';
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
  const [items, setItems] = useState<Item[]>([
    { id: 'hello', kind: 'assistant', text: 'Hi, I\'m Vireo. Ask about your balance, recent activity, or tell me who to pay.' },
  ]);
  const [text, setText] = useState('');
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [pinSet, setPinSet] = useState(false);
  const [pinFor, setPinFor] = useState<Extract<Item, { kind: 'draft' }> | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);

  // How a payment prepared here can be confirmed on this phone: fingerprint/face, or the PIN.
  useEffect(() => {
    biometricAvailable().then(setBioAvailable);
    api.getPinStatus().then((s) => setPinSet(s.set)).catch(() => undefined);
  }, []);
  const list = useRef<FlatList<Item>>(null);
  const counter = useRef(0);
  const nextId = () => `m${(counter.current += 1)}`;

  const send = async () => {
    const message = text.trim();
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

  return (
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
      <View style={{ paddingHorizontal: spacing.xl }}>
        <Header title="Assistant" onBack={() => navigation.goBack()} />
      </View>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={list}
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.xl, gap: spacing.md }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
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
                      variant="accent"
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
            ) : (
              <View style={[styles.bubble, item.kind === 'user' ? styles.userBubble : styles.botBubble]}>
                <Text style={[styles.bubbleText, item.kind === 'user' && { color: colors.black }]}>{item.text}</Text>
              </View>
            )
          }
          ListFooterComponent={sending ? <Text style={styles.typing}>Vireo is thinking…</Text> : null}
        />
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Ask Vireo…"
            placeholderTextColor={colors.textFaint}
            onSubmitEditing={send}
            returnKeyType="send"
            maxLength={2000}
          />
          <TouchableOpacity style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]} disabled={!text.trim() || sending} onPress={send}>
            <Text style={styles.sendText}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  bubble: { maxWidth: '85%', paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.lg },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.accent },
  botBubble: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  bubbleText: { ...type.body, color: colors.text },
  typing: { ...type.caption, color: colors.textMuted, marginTop: spacing.sm },
  pinBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  pinSheet: { width: '100%', maxWidth: 420, backgroundColor: colors.bg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.xl },
  draft: { backgroundColor: colors.accentSoft, borderRadius: radius.lg, padding: spacing.xl },
  draftLabel: { ...type.label, color: colors.accentDark },
  draftAmount: { ...type.display, color: colors.text, marginTop: spacing.sm },
  draftTo: { ...type.body, color: colors.textMuted, marginTop: 2 },
  sent: { ...type.heading, color: colors.accentDark, marginTop: spacing.md },
  failed: { ...type.body, color: colors.danger, marginTop: spacing.md },
  composer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 12, fontSize: 16, color: colors.text },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontSize: 22, fontWeight: '800', color: colors.black },
});
