import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as Crypto from 'expo-crypto';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { approveAndSign, ensureDeviceRegistered } from '../lib/deviceKey';
import { addMoney, errorMessage, formatMoney, groupAmountInput, parseOrderReference } from '../lib/format';
import type { MerchantOrder, Transfer, TransferDraft } from '../types';
import type { RootStackParamList, TabParamList } from '../navigation';
import {
  Avatar,
  BigMoney,
  Button,
  Card,
  ErrorBanner,
  Field,
  FitText,
  Keypad,
  ListRow,
  NoticeBanner,
  Screen,
  SegmentedControl,
  applyKey,
} from '../components/ui';
import { Pop } from '../components/motion';
import { colors, spacing, type } from '../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Pay'>,
  StackScreenProps<RootStackParamList>
>;

type Kind = 'internal' | 'bank' | 'merchant';
type Stage = 'amount' | 'recipient' | 'review' | 'done';

export default function PayScreen({ navigation, route }: Props) {
  const [kind, setKind] = useState<Kind>('internal');
  const [stage, setStage] = useState<Stage>('amount');
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [orderInput, setOrderInput] = useState('');
  const [order, setOrder] = useState<MerchantOrder | null>(null);
  const [draft, setDraft] = useState<TransferDraft | null>(null);
  const [sent, setSent] = useState<Transfer | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => Crypto.randomUUID());
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [biometric, setBiometric] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureDeviceRegistered()
      .then((id) => !cancelled && setDeviceId(id))
      .catch((e) => !cancelled && setError(errorMessage(e, 'Could not register this device')));
    return () => {
      cancelled = true;
    };
  }, []);

  // Deep link / navigation param: pre-fill a merchant order reference.
  const presetRef = route.params?.orderReference;
  useEffect(() => {
    if (presetRef) {
      setKind('merchant');
      setOrderInput(presetRef);
    }
  }, [presetRef]);

  const reset = useCallback(() => {
    setStage('amount');
    setAmount('');
    setRecipient('');
    setBankCode('');
    setAccountNumber('');
    setOrderInput('');
    setOrder(null);
    setDraft(null);
    setSent(null);
    setError(null);
    setBiometric(true);
    setIdempotencyKey(Crypto.randomUUID());
  }, []);

  const lookupOrder = async () => {
    const reference = parseOrderReference(orderInput);
    if (!reference) return setError('Enter or paste the order reference');
    setLoading(true);
    setError(null);
    setOrder(null);
    try {
      const data = await api.getMerchantOrder(reference);
      if (data.status !== 'open') return setError(`This order is ${data.status}`);
      if (data.expiresAt && new Date(data.expiresAt).getTime() <= Date.now()) {
        return setError('This order has expired');
      }
      setOrder(data);
    } catch (e) {
      setError(errorMessage(e, 'Order not found'));
    } finally {
      setLoading(false);
    }
  };

  const createDraft = async () => {
    setLoading(true);
    setError(null);
    try {
      const id = deviceId ?? (await ensureDeviceRegistered());
      setDeviceId(id);
      const handleLike = recipient.trim().startsWith('@') || recipient.trim().startsWith('$');
      const data = await api.createTransferDraft({
        type: kind,
        // The order amount is authoritative: the backend rejects any mismatch.
        amount: kind === 'merchant' ? order!.amount : amount.replace(/\.$/, ''),
        idempotencyKey,
        deviceId: id,
        ...(kind === 'internal'
          ? handleLike
            ? { recipientHandle: recipient.trim().slice(1) }
            : { recipientPhone: recipient.trim() }
          : {}),
        ...(kind === 'bank' ? { bankCode: bankCode.trim(), accountNumber: accountNumber.trim() } : {}),
        ...(kind === 'merchant' ? { orderReference: order!.reference } : {}),
      });
      setDraft(data);
      setStage('review');
    } catch (e) {
      setError(errorMessage(e, 'Could not prepare this payment'));
    } finally {
      setLoading(false);
    }
  };

  const approve = async () => {
    if (!draft?.challenge) return setError('This payment has nothing left to sign');
    setLoading(true);
    setError(null);
    try {
      // The phone's biometric unlocks the device key, which signs the exact
      // payloadHash the server issued. The server verifies before posting.
      const approval = await approveAndSign(draft.challenge.payloadHash);
      setBiometric(approval.biometric);
      const result = await api.submitTransfer(draft.transfer.id, approval.signature);
      setSent(result.transfer);
      setStage('done');
    } catch (e) {
      setError(errorMessage(e, 'Payment failed'));
    } finally {
      setLoading(false);
    }
  };

  const numeric = Number(amount || '0');
  const amountValid = amount !== '' && numeric > 0;

  /* ── Done ── */
  if (stage === 'done' && sent) {
    const failed = sent.status === 'failed';
    return (
      <Screen background={failed ? colors.bg : colors.accent}>
        <View style={styles.done}>
          <Pop style={[styles.tick, failed && { backgroundColor: colors.danger }]}>
            <Text style={[styles.tickText, failed && { color: colors.white }]}>{failed ? '!' : '✓'}</Text>
          </Pop>
          <Text style={styles.doneTitle}>
            {failed ? 'Payment failed' : sent.status === 'completed' ? 'Payment sent' : 'Payment processing'}
          </Text>
          <BigMoney amount={sent.amount} color={colors.black} />
          <Text style={styles.doneTo}>to {sent.recipientName}</Text>
          {sent.failureReason ? <Text style={styles.reason}>{sent.failureReason}</Text> : null}
          {!biometric && (
            <NoticeBanner message="No biometric hardware on this device, so approval was not biometric-gated." />
          )}
        </View>
        <Button
          title="Done"
          onPress={() => {
            reset();
            navigation.navigate('Home');
          }}
        />
        <Button title="View receipt" variant="ghost" onPress={() => navigation.navigate('TransferDetail', { transferId: sent.id })} />
      </Screen>
    );
  }

  /* ── Review ── */
  if (stage === 'review' && draft) {
    const t = draft.transfer;
    return (
      <Screen>
        <View style={{ marginTop: spacing.xl }} />
        <ErrorBanner message={error} />
        <View style={styles.reviewTop}>
          <Avatar label={t.recipientName ?? 'Payment'} size={72} />
          <Text style={styles.to}>{t.recipientName}</Text>
          <BigMoney amount={t.amount} size="display" />
        </View>
        <Card>
          <ListRow title="Amount" trailing={formatMoney(t.amount, t.currency)} />
          <ListRow title="Fee" trailing={formatMoney(t.fee, t.currency)} />
          <ListRow title="Total" trailing={formatMoney(addMoney(t.amount, t.fee), t.currency)} />
        </Card>
        <Text style={styles.hint}>Approve with your fingerprint or face to sign this payment.</Text>
        <Button title="Approve & pay" variant="accent" onPress={approve} loading={loading} />
        <Button
          title="Cancel"
          variant="ghost"
          onPress={() => {
            setDraft(null);
            setStage(kind === 'merchant' ? 'amount' : 'recipient');
            // A fresh key: the old draft belongs to the abandoned details.
            setIdempotencyKey(Crypto.randomUUID());
          }}
        />
      </Screen>
    );
  }

  /* ── Recipient (person / bank) ── */
  if (stage === 'recipient') {
    return (
      <Screen>
        <TouchableOpacity onPress={() => { setStage('amount'); setError(null); }} hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <View style={styles.recipientTop}>
          <BigMoney amount={amount.replace(/\.$/, '') || '0'} size="display" />
        </View>
        <ErrorBanner message={error} />
        {kind === 'internal' ? (
          <Field label="TO" placeholder="Phone number or $handle" value={recipient} onChangeText={setRecipient} autoCapitalize="none" autoFocus />
        ) : (
          <>
            <Field label="BANK CODE" placeholder="058" value={bankCode} onChangeText={setBankCode} autoCapitalize="none" autoFocus />
            <Field label="ACCOUNT NUMBER" placeholder="0123456789" value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" />
          </>
        )}
        <Button
          title="Review"
          loading={loading}
          disabled={!deviceId || (kind === 'internal' ? !recipient.trim() : !bankCode.trim() || !accountNumber.trim())}
          onPress={createDraft}
        />
      </Screen>
    );
  }

  /* ── Amount (or merchant order lookup) ── */
  return (
    <Screen scroll={false} padded={false}>
      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md }}>
        <SegmentedControl
          value={kind}
          onChange={(k) => { setKind(k); setError(null); setOrder(null); }}
          options={[
            { key: 'internal', label: 'Person' },
            { key: 'bank', label: 'Bank' },
            { key: 'merchant', label: 'Merchant' },
          ]}
        />
      </View>

      {kind === 'merchant' ? (
        <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xxl }}>
          <ErrorBanner message={error} />
          <Field
            label="ORDER REFERENCE"
            placeholder="ord_… or paste the QR link"
            value={orderInput}
            onChangeText={(v) => { setOrderInput(v); setOrder(null); }}
            autoCapitalize="none"
            hint="Ask the merchant to show their payment QR code."
          />
          {order ? (
            <Card>
              <Text style={styles.merchantName}>{order.merchantName}</Text>
              <BigMoney amount={order.amount} size="display" />
              {order.note ? <Text style={styles.note}>{order.note}</Text> : null}
            </Card>
          ) : null}
          <View style={{ flex: 1 }} />
          {order ? (
            <Button title="Review payment" variant="accent" loading={loading} disabled={!deviceId} onPress={createDraft} />
          ) : (
            <Button title="Look up order" loading={loading} disabled={!orderInput.trim()} onPress={lookupOrder} />
          )}
          <View style={{ height: spacing.xl }} />
        </View>
      ) : (
        <>
          <View style={styles.amountBody}>
            <FitText base={72} style={[styles.amount, !amountValid && { color: colors.textFaint }]}>
              {`₦${groupAmountInput(amount)}`}
            </FitText>
            <View style={{ paddingHorizontal: spacing.xl, width: '100%', marginTop: spacing.lg }}>
              <ErrorBanner message={error} />
            </View>
          </View>
          <Keypad onKey={(k) => setAmount((a) => applyKey(a, k))} />
          <View style={{ padding: spacing.xl }}>
            <Button title="Next" variant="accent" disabled={!amountValid} onPress={() => { setError(null); setStage('recipient'); }} />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  amountBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  amount: { ...type.hero, fontSize: 72, color: colors.text, paddingHorizontal: spacing.xl },
  back: { fontSize: 38, lineHeight: 40, color: colors.text, marginTop: spacing.md },
  recipientTop: { alignItems: 'center', marginVertical: spacing.xl },
  reviewTop: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  to: { ...type.heading, color: colors.text, marginTop: spacing.sm },
  merchantName: { ...type.heading, color: colors.text, marginBottom: spacing.sm },
  note: { ...type.body, color: colors.textMuted, marginTop: spacing.sm },
  hint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginVertical: spacing.lg },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  doneTitle: { ...type.heading, color: colors.black, marginBottom: spacing.md },
  doneTo: { ...type.body, color: colors.black, marginTop: spacing.sm },
  reason: { ...type.body, color: colors.danger, marginTop: spacing.md, textAlign: 'center' },
  tick: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  tickText: { color: colors.accent, fontSize: 48, fontWeight: '800' },
});
