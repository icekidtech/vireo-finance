import { View, Text, StyleSheet } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { useLoad } from '../lib/useLoad';
import { addMoney, formatDateTime, formatMoney } from '../lib/format';
import type { RootStackParamList } from '../navigation';
import { BigMoney, ErrorBanner, Header, Loading, Screen } from '../components/ui';
import ReceiptCard, { Pill, RECEIPT_BG } from '../components/ReceiptCard';
import { colors, spacing, type } from '../theme';

type Props = StackScreenProps<RootStackParamList, 'TransferDetail'>;

const STATUS: Record<string, { label: string; tone: 'purple' | 'coral' | 'amber' }> = {
  completed: { label: 'Payment sent', tone: 'purple' },
  processing: { label: 'Processing', tone: 'amber' },
  pending: { label: 'Processing', tone: 'amber' },
  failed: { label: 'Payment failed', tone: 'coral' },
  draft: { label: 'Not sent', tone: 'amber' },
};

/** The receipt for one payment: a frosted card with the headline status, the amount and the details as pills. */
export default function TransferDetailScreen({ navigation, route }: Props) {
  const { transferId } = route.params;
  const { data: t, loading, error, refreshing, refresh } = useLoad(() => api.getTransfer(transferId), 'Could not load this transfer');

  if (loading && !t) return <Loading />;

  const status = t ? (STATUS[t.status] ?? { label: t.status, tone: 'amber' as const }) : null;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} background={RECEIPT_BG}>
      <Header title="Receipt" onBack={() => navigation.goBack()} color={colors.white} />
      <ErrorBanner message={error} />
      {t && status && (
        <ReceiptCard>
          <Pill tone={status.tone}>{status.label}</Pill>
          <Text style={styles.to} numberOfLines={2}>
            {t.recipientName ?? 'Transfer'}
          </Text>
          <BigMoney amount={t.amount} size="display" color={colors.white} />
          {t.failureReason ? <Text style={styles.reason}>{t.failureReason}</Text> : null}

          <View style={styles.pills}>
            <Pill>{t.type.replace(/_/g, ' ')}</Pill>
            <Pill>Fee {formatMoney(t.fee, t.currency)}</Pill>
            <Pill>Total {formatMoney(addMoney(t.amount, t.fee), t.currency)}</Pill>
            {t.recipientAccountNumber ? <Pill>Account {t.recipientAccountNumber}</Pill> : null}
            {t.recipientPhone ? <Pill>Phone {t.recipientPhone}</Pill> : null}
            <Pill>{formatDateTime(t.createdAt)}</Pill>
            {t.pagaReference ? <Pill>Ref {t.pagaReference.slice(0, 22)}</Pill> : null}
          </View>
        </ReceiptCard>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  to: { ...type.heading, color: colors.white, marginTop: spacing.lg, marginBottom: spacing.xs },
  reason: { ...type.body, color: '#FFB4AC', marginTop: spacing.md },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xl },
});
