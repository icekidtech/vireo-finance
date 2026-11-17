import { View, Text, StyleSheet } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useLoad } from '../lib/useLoad';
import { formatMoney, formatRelative } from '../lib/format';
import type { RootStackParamList, TabParamList } from '../navigation';
import {
  Avatar,
  BigMoney,
  Button,
  Card,
  ErrorBanner,
  ListRow,
  Loading,
  NoticeBanner,
  Screen,
  SectionTitle,
  StatusPill,
  Empty,
  FitText,
} from '../components/ui';
import InboxBanner from '../components/InboxBanner';
import { colors, spacing, type } from '../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Home'>,
  StackScreenProps<RootStackParamList>
>;

export default function DashboardScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { data, loading, refreshing, error, refresh } = useLoad(
    () => api.getDashboard(),
    'Could not load your dashboard',
  );

  if (loading && !data) return <Loading />;

  const merchant = data?.merchant;
  const kybPending = merchant && merchant.kybStatus !== 'verified';

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{merchant ? merchant.businessName : 'Dashboard'}</Text>
          <Text style={styles.handle}>
            {merchant ? `$${merchant.handle}` : ''}
            {user?.name ? `  ·  ${user.name}` : ''}
          </Text>
        </View>
        <Avatar label={merchant?.businessName ?? user?.name ?? '?'} tone="black" />
      </View>

      <ErrorBanner message={error} />
      <InboxBanner onNew={refresh} />
      {kybPending && (
        <NoticeBanner
          message={
            merchant!.kybStatus === 'rejected'
              ? 'Your business verification was rejected. Contact support to cash out.'
              : 'Business verification is pending. You can take payments now; cash out unlocks once verified.'
          }
        />
      )}
      {kybPending && merchant!.kybStatus !== 'rejected' && (
        <Button
          title="Verify your business"
          variant="accent"
          onPress={() => navigation.navigate('Verify')}
          style={{ marginBottom: spacing.md }}
        />
      )}

      {data && (
        <>
          <Card tone="black" style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Balance</Text>
            <BigMoney amount={data.balance.available} color={colors.white} />
            {data.balance.held !== '0.00' && (
              <Text style={styles.held}>
                {formatMoney(data.balance.held)} on hold for payouts
              </Text>
            )}
          </Card>

          <View style={styles.actions}>
            <Button
              title="Charge"
              dense
              variant="accent"
              style={{ flex: 1 }}
              onPress={() => navigation.navigate('Charge')}
            />
            <Button
              title="Receive"
              dense
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => navigation.navigate('Receive')}
            />
            <Button
              title="Cash out"
              dense
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => navigation.navigate('Settle')}
            />
          </View>

          <View style={styles.stats}>
            <Card style={styles.stat}>
              <Text style={styles.statLabel}>Sales today</Text>
              <FitText base={20} share={0.5} padding={62} style={styles.statValue}>
                {formatMoney(data.salesToday.amount)}
              </FitText>
            </Card>
            <Card style={styles.stat}>
              <Text style={styles.statLabel}>Orders paid</Text>
              <Text style={styles.statValue}>{data.salesToday.count}</Text>
            </Card>
          </View>

          <SectionTitle
            action={
              <Button
                title="See all"
                variant="ghost"
                small
                onPress={() => navigation.navigate('Activity')}
              />
            }
          >
            Recent activity
          </SectionTitle>
          {data.recentOrders.length === 0 ? (
            <Empty title="No sales yet" body="Tap Charge to create your first payment request." />
          ) : (
            data.recentOrders.map((order) => (
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
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.xl },
  greeting: { ...type.title, color: colors.text },
  handle: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  balanceCard: { paddingVertical: spacing.xxl },
  balanceLabel: { ...type.label, color: colors.textFaint, marginBottom: spacing.sm },
  held: { ...type.caption, color: colors.textFaint, marginTop: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.md },
  stat: { flex: 1, padding: spacing.lg, marginBottom: 0 },
  statLabel: { ...type.caption, color: colors.textMuted },
  statValue: { ...type.heading, color: colors.text, marginTop: 4 },
});
