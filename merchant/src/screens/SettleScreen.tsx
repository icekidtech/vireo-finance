import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { approveAndSign, biometricAvailable, ensureDeviceRegistered, signWithoutBiometric } from '../lib/deviceKey';
import { showAlert } from '../lib/dialog';
import PinPad from '../components/PinPad';
import { errorMessage, formatMoney, groupAmountInput } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import type { SettlementDraft, Settlement } from '../types';
import type { RootStackParamList } from '../navigation';
import {
  BigMoney,
  Button,
  Card,
  ErrorBanner,
  FitText,
  Header,
  Keypad,
  ListRow,
  Loading,
  NoticeBanner,
  Screen,
  StatusPill,
  applyKey,
} from '../components/ui';
import { colors, spacing, type } from '../theme';

type Props = StackScreenProps<RootStackParamList, 'Settle'>;
type Stage = 'amount' | 'confirm' | 'done';

export default function SettleScreen({ navigation }: Props) {
  const dash = useLoad(() => api.getDashboard(), 'Could not load your balance');
  const [amount, setAmount] = useState('');
  const [stage, setStage] = useState<Stage>('amount');
  const [draft, setDraft] = useState<SettlementDraft | null>(null);
  const [result, setResult] = useState<Settlement | null>(null);
  const [approvedBy, setApprovedBy] = useState<'biometric' | 'pin'>('biometric');
  const [bioAvailable, setBioAvailable] = useState(false);
  const [pinSet, setPinSet] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What can confirm a payout on this phone: fingerprint/face, and/or a PIN. Re-read every time the screen
  // is shown again (e.g. coming back from setting a PIN), not just when this screen first mounts.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      biometricAvailable().then((v) => !cancelled && setBioAvailable(v));
      api.getPinStatus().then((s) => !cancelled && setPinSet(s.set)).catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, [stage]),
  );

  const merchant = dash.data?.merchant;
  const available = dash.data?.balance.available ?? '0.00';
  const kybBlocked = !!merchant && merchant.kybStatus !== 'verified';
  const noBank = !!merchant && (!merchant.settlementBankCode || !merchant.settlementAccountNumber);

  const numeric = Number(amount || '0');
  const valid = amount !== '' && numeric > 0 && numeric <= Number(available);

  const review = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const deviceId = await ensureDeviceRegistered();
      const data = await api.createSettlementDraft(deviceId, amount.replace(/\.$/, '') || undefined);
      setDraft(data);
      setStage('confirm');
    } catch (e) {
      setError(errorMessage(e, 'Could not prepare the payout'));
    } finally {
      setLoading(false);
    }
  }, [amount]);

  const finish = (settlement: Settlement, by: 'biometric' | 'pin') => {
    setApprovedBy(by);
    setResult(settlement);
    setPinOpen(false);
    setStage('done');
  };

  /** Fingerprint or face when this phone has it; otherwise the PIN. */
  const approve = async () => {
    if (!draft) return;
    if (!bioAvailable) {
      if (!pinSet) {
        return showAlert(
          'Set a PIN to cash out',
          'This phone has no fingerprint or face unlock set up. Set a 4-digit PIN to confirm payouts.',
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
      // payloadHash the server issued.
      const approval = await approveAndSign(draft.challenge.payloadHash);
      finish(await api.submitSettlement(draft.settlement.id, approval.signature), 'biometric');
    } catch (e) {
      const message = errorMessage(e, 'Payout failed');
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
    if (!draft) return;
    setLoading(true);
    setPinError(null);
    try {
      const signature = await signWithoutBiometric(draft.challenge.payloadHash);
      finish(await api.submitSettlement(draft.settlement.id, signature, { approval: 'pin', pin }), 'pin');
    } catch (e) {
      // Wrong PIN etc.: stay on the pad so they can try again (the server counts attempts and locks).
      setPinError(errorMessage(e, 'Payout failed'));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStage('amount');
    setDraft(null);
    setResult(null);
    setAmount('');
    setError(null);
    dash.refresh();
  };

  if (dash.loading && !dash.data) return <Loading />;

  if (stage === 'done' && result) {
    const failed = result.status === 'failed';
    return (
      <Screen background={failed ? colors.bg : colors.accent} scroll={false}>
        <View style={styles.done}>
          <Text style={styles.doneTitle}>
            {failed ? 'Payout failed' : result.status === 'completed' ? 'Cashed out' : 'Payout on its way'}
          </Text>
          <BigMoney amount={result.amount} color={colors.black} />
          <View style={{ marginTop: spacing.lg }}>
            <StatusPill status={result.status} />
          </View>
          {result.failureReason ? <Text style={styles.reason}>{result.failureReason}</Text> : null}
          <Text style={styles.doneVia}>Approved with {approvedBy === 'pin' ? 'your PIN' : 'fingerprint or face'}</Text>
        </View>
        <Button title="Done" onPress={() => navigation.goBack()} />
        <Button title="Cash out again" variant="ghost" onPress={reset} />
      </Screen>
    );
  }

  if (stage === 'confirm' && draft && pinOpen) {
    const p = draft.challenge.payload as Record<string, string>;
    return (
      <Screen>
        <View style={{ marginTop: spacing.xl }} />
        <PinPad
          title="Enter your PIN"
          subtitle={`Confirm cash out of ${formatMoney(draft.settlement.amount)} to ${p.accountName}`}
          error={pinError}
          onComplete={approveWithPin}
          disabled={loading}
        />
        <Button title="Cancel" variant="ghost" onPress={() => { setPinOpen(false); setPinError(null); }} style={{ marginTop: spacing.lg }} />
      </Screen>
    );
  }

  if (stage === 'confirm' && draft) {
    const p = draft.challenge.payload as Record<string, string>;
    return (
      <Screen>
        <Header title="Confirm cash out" onBack={() => { setStage('amount'); setDraft(null); }} />
        <ErrorBanner message={error} />
        <View style={styles.confirmTop}>
          <BigMoney amount={draft.settlement.amount} />
        </View>
        <Card>
          <ListRow title="To" trailing={p.accountName} />
          <ListRow title="Account" trailing={p.accountNumber} />
          <ListRow title="Bank code" trailing={p.bankCode} />
          <ListRow title="Fee" trailing={formatMoney('0')} />
        </Card>
        <Text style={styles.hint}>
          {bioAvailable
            ? 'Confirm with your fingerprint or face to send this payout.'
            : pinSet
              ? 'Confirm with your 4-digit PIN to send this payout.'
              : 'Set a 4-digit PIN to confirm payouts on this phone.'}
        </Text>
        <Button title={!bioAvailable && !pinSet ? 'Set a PIN to cash out' : 'Confirm & cash out'} variant="accent" onPress={approve} loading={loading} />
        {bioAvailable && pinSet ? <Button title="Use PIN instead" variant="ghost" onPress={openPin} /> : null}
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      <View style={{ paddingHorizontal: spacing.xl }}>
        <Header title="Cash out" onBack={() => navigation.goBack()} />
      </View>
      <View style={styles.entry}>
        <Text style={styles.availLabel}>Available {formatMoney(available)}</Text>
        <FitText base={72} style={[styles.amount, amount === '' && { color: colors.textFaint }]}>
          {`₦${groupAmountInput(amount)}`}
        </FitText>
        <TouchableOpacity onPress={() => setAmount(available)}>
          <Text style={styles.all}>Cash out everything</Text>
        </TouchableOpacity>
        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.lg, width: '100%' }}>
          <ErrorBanner message={error ?? dash.error} />
          {kybBlocked && (
            <NoticeBanner message="Cash out unlocks once your business is verified." />
          )}
          {!kybBlocked && noBank && (
            <NoticeBanner message="Add your settlement bank details before cashing out." />
          )}
        </View>
      </View>
      <Keypad onKey={(k) => setAmount((a) => applyKey(a, k))} />
      <View style={{ padding: spacing.xl }}>
        <Button
          title="Review"
          variant="accent"
          onPress={review}
          loading={loading}
          disabled={!valid || kybBlocked || noBank}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  entry: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  availLabel: { ...type.caption, color: colors.textMuted, marginBottom: spacing.sm },
  amount: { ...type.hero, fontSize: 72, color: colors.text, paddingHorizontal: spacing.xl },
  all: { ...type.bodyStrong, color: colors.accentDark, marginTop: spacing.md },
  confirmTop: { alignItems: 'center', marginVertical: spacing.xxl },
  doneVia: { ...type.caption, color: colors.black, marginTop: spacing.md },
  hint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginVertical: spacing.lg },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  doneTitle: { ...type.heading, color: colors.black, marginBottom: spacing.md },
  reason: { ...type.body, color: colors.danger, marginTop: spacing.md, textAlign: 'center' },
});
