import { View, Text, StyleSheet } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { useLoad } from '../lib/useLoad';
import { addMoney, formatDateTime, formatMoney } from '../lib/format';
import type { RootStackParamList } from '../navigation';
import { Avatar, BigMoney, Card, ErrorBanner, Header, ListRow, Loading, Screen, StatusPill } from '../components/ui';
import { colors, spacing, type } from '../theme';

type Props = StackScreenProps<RootStackParamList, 'TransferDetail'>;

export default function TransferDetailScreen({ navigation, route }: Props) {
  const { transferId } = route.params;
  const { data: t, loading, error, refreshing, refresh } = useLoad(() => api.getTransfer(transferId), 'Could not load this transfer');

  if (loading && !t) return <Loading />;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Header title="Payment" onBack={() => navigation.goBack()} />
      <ErrorBanner message={error} />
      {t && (
        <>
          <View style={styles.hero}>
            <Avatar label={t.recipientName ?? 'Transfer'} size={72} />
            <Text style={styles.to}>{t.recipientName ?? 'Transfer'}</Text>
            <BigMoney amount={t.amount} size="display" />
            <View style={{ marginTop: spacing.md }}>
              <StatusPill status={t.status} />
            </View>
            {t.failureReason ? <Text style={styles.reason}>{t.failureReason}</Text> : null}
          </View>
          <Card>
            <ListRow title="Type" trailing={t.type.replace(/_/g, ' ')} />
            <ListRow title="Amount" trailing={formatMoney(t.amount, t.currency)} />
            <ListRow title="Fee" trailing={formatMoney(t.fee, t.currency)} />
            <ListRow title="Total" trailing={formatMoney(addMoney(t.amount, t.fee), t.currency)} />
            {t.recipientAccountNumber ? <ListRow title="Account" trailing={t.recipientAccountNumber} /> : null}
            {t.recipientPhone ? <ListRow title="Phone" trailing={t.recipientPhone} /> : null}
            <ListRow title="Date" trailing={formatDateTime(t.createdAt)} />
            {t.pagaReference ? <ListRow title="Reference" trailing={t.pagaReference} /> : null}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginVertical: spacing.xl, gap: spacing.sm },
  to: { ...type.heading, color: colors.text, marginTop: spacing.sm },
  reason: { ...type.body, color: colors.danger, marginTop: spacing.md, textAlign: 'center' },
});
