import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as Crypto from 'expo-crypto';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { approveAndSign, biometricAvailable, ensureDeviceRegistered, signWithoutBiometric } from '../lib/deviceKey';
import { showAlert } from '../lib/dialog';
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
  Screen,
  SegmentedControl,
  applyKey,
} from '../components/ui';
import { Pop } from '../components/motion';
import QrScanner from '../components/QrScanner';
import PinPad from '../components/PinPad';
import BankPicker, { type Bank } from '../components/BankPicker';
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
  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);
  // Bumped by "Retry"; the effect never re-runs on its own after a failure.
  const [banksAttempt, setBanksAttempt] = useState(0);
  const [banksFailed, setBanksFailed] = useState(false);
  const [bank, setBank] = useState<Bank | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [accountNumber, setAccountNumber] = useState('');
  const [orderInput, setOrderInput] = useState('');
  const [manual, setManual] = useState(false);
  const [order, setOrder] = useState<MerchantOrder | null>(null);
  const [draft, setDraft] = useState<TransferDraft | null>(null);
  const [sent, setSent] = useState<Transfer | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => Crypto.randomUUID());
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [approvedBy, setApprovedBy] = useState<'biometric' | 'pin'>('biometric');
  const [bioAvailable, setBioAvailable] = useState(false);
  const [pinSet, setPinSet] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
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

  // What can confirm a payment on this phone: fingerprint/face, and/or a PIN.
  useEffect(() => {
    let cancelled = false;
    biometricAvailable().then((v) => !cancelled && setBioAvailable(v));
    api.getPinStatus().then((s) => !cancelled && setPinSet(s.set)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [stage]);

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
    setBank(null);
    setAccountName(null);
    setAccountNumber('');
    setOrderInput('');
    setManual(false);
    setOrder(null);
    setDraft(null);
    setSent(null);
    setError(null);
    setApprovedBy('biometric');
    setPinOpen(false);
    setPinError(null);
    setIdempotencyKey(Crypto.randomUUID());
  }, []);

  // Load Paga's supported banks once when the bank form opens (retry is manual).
  useEffect(() => {
    if (stage !== 'recipient' || kind !== 'bank' || banks.length) return;
    let cancelled = false;
    setBanksLoading(true);
    setBanksFailed(false);
    api
      .listBanks()
      .then((list) => !cancelled && setBanks(list))
      .catch((e) => {
        if (cancelled) return;
        setBanksFailed(true);
        setError(errorMessage(e, 'Could not load the list of banks'));
      })
      .finally(() => !cancelled && setBanksLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, kind, banksAttempt]);

  // Resolve the account holder's name once bank + 10-digit account are set.
  useEffect(() => {
    setAccountName(null);
    if (kind !== 'bank' || !bank || !/^\d{10}$/.test(accountNumber)) return;
    let cancelled = false;
    setResolving(true);
    setError(null);
    api
      .lookupBankAccount({ bankCode: bank.code, accountNumber })
      .then((r) => !cancelled && setAccountName(r.accountName))
      .catch((e) => !cancelled && setError(errorMessage(e, 'Could not verify this account')))
      .finally(() => !cancelled && setResolving(false));
    return () => {
      cancelled = true;
    };
  }, [kind, bank, accountNumber, amount]);

  const lookupOrder = async (raw: string = orderInput) => {
    const reference = parseOrderReference(raw);
    if (!reference) return setError('Enter the order reference');
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

  const onScan = (data: string) => {
    const reference = parseOrderReference(data);
    // Only our own order codes: anything else is some other QR code.
    if (!/^ord_[A-Za-z0-9]{6,64}$/.test(reference)) {
      return setError('That is not a Vireo payment code');
    }
    setOrderInput(reference);
    lookupOrder(reference);
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
        ...(kind === 'bank' ? { bankCode: bank!.code, accountNumber: accountNumber.trim() } : {}),
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

  const finishPayment = (result: { transfer: Transfer }, by: 'biometric' | 'pin') => {
    setApprovedBy(by);
    setSent(result.transfer);
    setPinOpen(false);
    setStage('done');
  };

  /** Fingerprint or face when this phone has it; otherwise the PIN. */
  const approve = async () => {
    if (!draft?.challenge) return setError('This payment has nothing left to sign');
    if (!bioAvailable) {
      if (!pinSet) {
        return showAlert(
          'Set a PIN to pay',
          'This phone has no fingerprint or face unlock set up. Set a 4-digit PIN to confirm payments.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Set PIN', onPress: () => navigation.navigate('Pin') },
          ],
        );
      }
      return openPin();
    }
    setLoading(true);
    setError(null);
    try {
      // The phone's biometric unlocks the device key, which signs the exact
      // payloadHash the server issued. The server verifies before posting.
      const approval = await approveAndSign(draft.challenge.payloadHash);
      finishPayment(await api.submitTransfer(draft.transfer.id, approval.signature), 'biometric');
    } catch (e) {
      const message = errorMessage(e, 'Payment failed');
      setError(message === 'Approval cancelled' && pinSet ? 'Cancelled. You can use your PIN instead.' : message);
    } finally {
      setLoading(false);
    }
  };

  const openPin = () => {
    setPinError(null);
    setError(null);
    setPinOpen(true);
  };

  const approveWithPin = async (pin: string) => {
    if (!draft?.challenge) return;
    setLoading(true);
    setPinError(null);
    try {
      const signature = await signWithoutBiometric(draft.challenge.payloadHash);
      finishPayment(await api.submitTransfer(draft.transfer.id, signature, { approval: 'pin', pin }), 'pin');
    } catch (e) {
      // Wrong PIN etc.: stay on the pad so they can try again (the server counts attempts and locks).
      setPinError(errorMessage(e, 'Payment failed'));
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
      <Screen background={failed ? colors.bg : colors.accent} scroll={false}>
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
          <Text style={styles.doneVia}>Approved with {approvedBy === 'pin' ? 'your PIN' : 'fingerprint or face'}</Text>
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
  if (stage === 'review' && draft && pinOpen) {
    const t = draft.transfer;
    return (
      <Screen>
        <View style={{ marginTop: spacing.xl }} />
        <PinPad
          title="Enter your PIN"
          subtitle={`Confirm ${formatMoney(t.amount, t.currency)} to ${t.recipientName ?? 'this payee'}`}
          error={pinError}
          onComplete={approveWithPin}
          disabled={loading}
        />
        <Button title="Cancel" variant="ghost" onPress={() => { setPinOpen(false); setPinError(null); }} style={{ marginTop: spacing.lg }} />
      </Screen>
    );
  }

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
        <Text style={styles.hint}>
          {bioAvailable
            ? 'Confirm with your fingerprint or face to send this payment.'
            : pinSet
              ? 'Confirm with your 4-digit PIN to send this payment.'
              : 'Set a 4-digit PIN to confirm payments on this phone.'}
        </Text>
        <Button title={!bioAvailable && !pinSet ? 'Set a PIN to pay' : 'Confirm & pay'} variant="accent" onPress={approve} loading={loading} />
        {bioAvailable && pinSet ? <Button title="Use PIN instead" variant="ghost" onPress={openPin} /> : null}
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
            <BankPicker banks={banks} value={bank} onChange={(b) => { setBank(b); setError(null); }} loading={banksLoading} />
            <Field
              label="ACCOUNT NUMBER"
              placeholder="10-digit account number"
              value={accountNumber}
              onChangeText={(v) => setAccountNumber(v.replace(/\D/g, '').slice(0, 10))}
              keyboardType="number-pad"
              maxLength={10}
            />
            {banksFailed && !banksLoading ? (
              <Button title="Retry loading banks" variant="secondary" onPress={() => { setError(null); setBanksAttempt((n) => n + 1); }} />
            ) : null}
            {resolving ? <Text style={styles.hint}>Verifying account…</Text> : null}
            {accountName ? (
              <Card>
                <Text style={styles.resolvedLabel}>ACCOUNT NAME</Text>
                <Text style={styles.resolvedName}>{accountName}</Text>
              </Card>
            ) : null}
          </>
        )}
        <Button
          title="Review"
          loading={loading}
          disabled={!deviceId || (kind === 'internal' ? !recipient.trim() : !bank || !accountName)}
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
          onChange={(k) => { setKind(k); setError(null); setOrder(null); setManual(false); }}
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
          {!order && !manual ? (
            <>
              <QrScanner onScan={onScan} paused={loading} />
              <Text style={styles.hint}>Point your camera at the merchant’s payment QR code.</Text>
              <Button title="Enter code manually" variant="secondary" onPress={() => setManual(true)} />
            </>
          ) : null}
          {!order && manual ? (
            <>
              <Field
                label="ORDER REFERENCE"
                placeholder="ord_…"
                value={orderInput}
                onChangeText={(v) => { setOrderInput(v); setOrder(null); }}
                autoCapitalize="none"
              />
              <Button title="Scan QR instead" variant="secondary" onPress={() => { setManual(false); setError(null); }} />
            </>
          ) : null}
          {order ? (
            <Card>
              <Text style={styles.merchantName}>{order.merchantName}</Text>
              <BigMoney amount={order.amount} size="display" />
              {order.note ? <Text style={styles.note}>{order.note}</Text> : null}
            </Card>
          ) : null}
          <View style={{ flex: 1 }} />
          {order ? (
            <>
              <Button title="Review payment" variant="accent" loading={loading} disabled={!deviceId} onPress={createDraft} />
              <Button title="Scan a different code" variant="ghost" onPress={() => { setOrder(null); setOrderInput(''); setError(null); }} />
            </>
          ) : manual ? (
            <Button title="Look up order" loading={loading} disabled={!orderInput.trim()} onPress={() => lookupOrder()} />
          ) : null}
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
  resolvedLabel: { ...type.label, color: colors.textMuted, marginBottom: spacing.xs },
  resolvedName: { ...type.heading, color: colors.text },
  merchantName: { ...type.heading, color: colors.text, marginBottom: spacing.sm },
  note: { ...type.body, color: colors.textMuted, marginTop: spacing.sm },
  doneVia: { ...type.caption, color: colors.black, marginTop: spacing.md },
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
