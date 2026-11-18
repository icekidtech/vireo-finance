import { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { useLoad } from '../lib/useLoad';
import { formatMoney, formatRelative } from '../lib/format';
import type { ActivityItem } from '../types';
import type { RootStackParamList, TabParamList } from '../navigation';
import TransactionSheet, { activityLabel } from '../components/TransactionSheet';
import { Avatar, Empty, ErrorBanner, ListRow, Loading, Screen, SectionTitle, StatusPill } from '../components/ui';
import { colors, spacing, type } from '../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Activity'>,
  StackScreenProps<RootStackParamList>
>;

export default function ActivityScreen({ navigation }: Props) {
  const [selected, setSelected] = useState<ActivityItem | null>(null);
  const { data, loading, refreshing, error, refresh } = useLoad(async () => {
    const [activity, transfers] = await Promise.all([api.getActivity(100), api.listTransfers(50)]);
    return { activity, inFlight: transfers.filter((t) => t.status === 'pending' || t.status === 'failed') };
  }, 'Could not load your activity');

  if (loading && !data) return <Loading />;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Text style={styles.title}>Activity</Text>
      <ErrorBanner message={error} />

      {data && data.inFlight.length > 0 && (
        <>
          <SectionTitle>Needs attention</SectionTitle>
          {data.inFlight.map((t) => (
            <ListRow
              key={t.id}
              leading={<Avatar label={t.recipientName ?? 'Transfer'} />}
              title={t.recipientName ?? 'Transfer'}
              subtitle={t.failureReason ?? formatRelative(t.createdAt)}
              trailing={formatMoney(t.amount, t.currency)}
              trailingSub={<StatusPill status={t.status} />}
              onPress={() => navigation.navigate('TransferDetail', { transferId: t.id })}
            />
          ))}
        </>
      )}

      <SectionTitle>All activity</SectionTitle>
      {data && data.activity.length > 0 ? (
        data.activity.map((item) => (
          <ListRow
            key={item.id}
            leading={<Avatar label={item.counterparty} tone={item.direction === 'in' ? 'accent' : 'surface'} />}
            title={item.counterparty}
            subtitle={`${formatRelative(item.createdAt)} · ${activityLabel(item.type)}`}
            trailing={
              <Text style={[styles.amount, item.direction === 'in' && { color: colors.accentDark }]}>
                {item.direction === 'in' ? '+' : '−'}
                {formatMoney(item.amount, item.currency)}
              </Text>
            }
            onPress={() => setSelected(item)}
          />
        ))
      ) : (
        <Empty title="Nothing here yet" body="Payments you send and receive will show up here." />
      )}
      <TransactionSheet item={selected} onClose={() => setSelected(null)} loadTransfer={(id) => api.getTransfer(id)} />
    </Screen>
  );
}


const styles = StyleSheet.create({
  title: { ...type.title, color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  amount: { ...type.bodyStrong, color: colors.text },
});
