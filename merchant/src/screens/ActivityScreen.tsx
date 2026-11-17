import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { useLoad } from '../lib/useLoad';
import { formatMoney, formatRelative } from '../lib/format';
import type { RootStackParamList, TabParamList } from '../navigation';
import {
  Avatar,
  Empty,
  ErrorBanner,
  ListRow,
  Loading,
  Screen,
  SegmentedControl,
  StatusPill,
} from '../components/ui';
import { Text } from 'react-native';
import { colors, spacing, type } from '../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Activity'>,
  StackScreenProps<RootStackParamList>
>;

type Tab = 'sales' | 'payouts';

export default function ActivityScreen({ navigation, route }: Props) {
  const [tab, setTab] = useState<Tab>(route.params?.initialTab ?? 'sales');
  const orders = useLoad(() => api.listOrders(), 'Could not load sales');
  const payouts = useLoad(() => api.listSettlements(), 'Could not load payouts');

  const active = tab === 'sales' ? orders : payouts;
  const loading = active.loading && !active.data;

  return (
    <Screen refreshing={active.refreshing} onRefresh={active.refresh}>
      <Text style={styles.title}>Activity</Text>
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { key: 'sales', label: 'Sales' },
          { key: 'payouts', label: 'Payouts' },
        ]}
      />
      <View style={{ height: spacing.lg }} />
      <ErrorBanner message={active.error} />
      {loading ? (
        <Loading />
      ) : tab === 'sales' ? (
        orders.data && orders.data.length > 0 ? (
          orders.data.map((order) => (
            <ListRow
              key={order.id}
              leading={<Avatar label={order.note || order.reference} tone={order.status === 'paid' ? 'accent' : 'surface'} />}
              title={order.note || 'Payment request'}
              subtitle={`${formatRelative(order.createdAt)} · ${order.reference.slice(0, 12)}`}
              trailing={formatMoney(order.amount, order.currency)}
              trailingSub={<StatusPill status={order.status} />}
              onPress={() => navigation.navigate('OrderDetail', { reference: order.reference })}
            />
          ))
        ) : (
          <Empty title="No sales yet" body="Payment requests you create will appear here." />
        )
      ) : payouts.data && payouts.data.length > 0 ? (
        payouts.data.map((s) => (
          <ListRow
            key={s.id}
            leading={<Avatar label="Bank" tone="black" />}
            title="Cash out to bank"
            subtitle={s.failureReason ?? formatRelative(s.createdAt)}
            trailing={formatMoney(s.amount)}
            trailingSub={<StatusPill status={s.status} />}
          />
        ))
      ) : (
        <Empty title="No payouts yet" body="Cash outs to your bank account will appear here." />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...type.title, color: colors.text, marginTop: spacing.md, marginBottom: spacing.lg },
});
