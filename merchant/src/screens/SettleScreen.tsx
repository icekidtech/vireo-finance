import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { approveAndSign, ensureDeviceRegistered } from '../lib/deviceKey';
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
  const [biometric, setBiometric] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const approve = async () => {
    if (!draft) return;
    setLoading(true);
    setError(null);
    try {
      // The phone's biometric unlocks the device key, which signs the exact
      // payloadHash the server issued.
      const approval = await approveAndSign(draft.challenge.payloadHash);
      setBiometric(approval.biometric);
      setResult(await api.submitSettlement(draft.settlement.id, approval.signature));
      setStage('done');
    } catch (e) {
      setError(errorMessage(e, 'Payout failed'));
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
      <Screen background={failed ? colors.bg : colors.accent}>
        <View style={styles.done}>
          <Text style={styles.doneTitle}>
            {failed ? 'Payout failed' : result.status === 'completed' ? 'Cashed out' : 'Payout on its way'}
          </Text>
          <BigMoney amount={result.amount} color={colors.black} />
          <View style={{ marginTop: spacing.lg }}>
            <StatusPill status={result.status} />
          </View>
          {result.failureReason ? <Text style={styles.reason}>{result.failureReason}</Text> : null}
          {!biometric && (
            <NoticeBanner message="No biometric hardware on this device, so approval was not biometric-gated." />
          )}
        </View>
        <Button title="Done" onPress={() => navigation.goBack()} />
        <Button title="Cash out again" variant="ghost" onPress={reset} />
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
        <Text style={styles.hint}>Approve with your fingerprint or face to sign this payout.</Text>
        <Button title="Approve & cash out" variant="accent" onPress={approve} loading={loading} />
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
  hint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginVertical: spacing.lg },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  doneTitle: { ...type.heading, color: colors.black, marginBottom: spacing.md },
  reason: { ...type.body, color: colors.danger, marginTop: spacing.md, textAlign: 'center' },
});
