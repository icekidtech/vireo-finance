import { View, Text, StyleSheet } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useLoad } from '../lib/useLoad';
import { formatMoney, formatRelative } from '../lib/format';
import type { RootStackParamList, TabParamList } from '../navigation';
import { Avatar, BigMoney, Button, Card, Empty, ErrorBanner, ListRow, Loading, NoticeBanner, Screen, SectionTitle } from '../components/ui';
import { colors, spacing, type } from '../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Home'>,
  StackScreenProps<RootStackParamList>
>;

export default function HomeScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { data, loading, refreshing, error, refresh } = useLoad(async () => {
    const [account, activity, kyc] = await Promise.all([
      api.getMyAccount(),
      api.getActivity(5),
      api.getKycStatus(),
    ]);
    return { account, activity, kyc };
  }, 'Could not load your wallet');

  if (loading && !data) return <Loading />;

  const account = data?.account;
  const kyc = data?.kyc;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>Hi, {user?.name?.split(' ')[0] ?? 'there'}</Text>
          {user?.handle ? <Text style={styles.handle}>${user.handle}</Text> : null}
        </View>
        <Avatar label={user?.name ?? '?'} tone="black" />
      </View>
      <ErrorBanner message={error} />
      {kyc && kyc.kycTier === 0 && (
        <NoticeBanner
          message={
            kyc.status === 'pending'
              ? 'Verify your identity to raise your limits.'
              : kyc.status === 'rejected'
                ? 'Your verification was rejected. Resubmit to raise your limits.'
                : 'Identity verified.'
          }
        />
      )}

      {account && (
        <>
          <Card tone="black" style={{ paddingVertical: spacing.xxl }}>
            <Text style={styles.cardLabel}>Cash balance</Text>
            <BigMoney amount={account.available} color={colors.white} />
            {account.held !== '0.00' && (
              <Text style={styles.held}>{formatMoney(account.held)} on hold</Text>
            )}
          </Card>

          <View style={styles.actions}>
            <Button title="Pay" variant="accent" style={{ flex: 1 }} onPress={() => navigation.navigate('Pay')} />
            <Button title="Activity" variant="secondary" style={{ flex: 1 }} onPress={() => navigation.navigate('Activity')} />
          </View>

          <Button title="Ask Vireo" variant="secondary" onPress={() => navigation.navigate('Assistant')} style={{ marginBottom: spacing.md }} />

          {account.virtualAccount && (
            <Card>
              <Text style={styles.cardLabelDark}>ADD MONEY · YOUR ACCOUNT NUMBER</Text>
              <Text style={styles.acct}>{account.virtualAccount.accountNumber}</Text>
              <Text style={styles.held2}>{account.virtualAccount.bankName} · transfer from any bank</Text>
            </Card>
          )}

          {kyc && kyc.kycTier === 0 && kyc.status !== 'verified' && (
            <Button title="Verify identity" variant="secondary" onPress={() => navigation.navigate('Kyc')} />
          )}

          <SectionTitle>Recent</SectionTitle>
          {data.activity.length === 0 ? (
            <Empty title="No activity yet" body="Add money with your account number, then send it anywhere." />
          ) : (
            data.activity.map((item) => (
              <ListRow
                key={item.id}
                leading={<Avatar label={item.counterparty} tone={item.direction === 'in' ? 'accent' : 'surface'} />}
                title={item.counterparty}
                subtitle={formatRelative(item.createdAt)}
                trailing={
                  <Text style={[styles.amount, item.direction === 'in' && { color: colors.accentDark }]}>
                    {item.direction === 'in' ? '+' : '−'}
                    {formatMoney(item.amount, item.currency)}
                  </Text>
                }
                onPress={item.transferId ? () => navigation.navigate('TransferDetail', { transferId: item.transferId! }) : undefined}
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
  cardLabel: { ...type.label, color: colors.textFaint, marginBottom: spacing.sm },
  cardLabelDark: { ...type.label, color: colors.textMuted, marginBottom: spacing.sm },
  held: { ...type.caption, color: colors.textFaint, marginTop: spacing.sm },
  held2: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs },
  acct: { fontSize: 30, fontWeight: '800', letterSpacing: 2, color: colors.text },
  actions: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  amount: { ...type.bodyStrong, color: colors.text },
});
