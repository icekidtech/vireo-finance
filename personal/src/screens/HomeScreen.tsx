import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useLoad } from '../lib/useLoad';
import { errorMessage, formatMoney, formatRelative } from '../lib/format';
import { canCopy, copyText } from '../lib/clipboard';
import type { RootStackParamList, TabParamList } from '../navigation';
import { Avatar, BigMoney, Button, Card, Empty, ErrorBanner, ListRow, Loading, NoticeBanner, Screen, SectionTitle } from '../components/ui';
import AccountCard from '../components/AccountCard';
import BalanceCard from '../components/BalanceCard';
import InboxBanner from '../components/InboxBanner';
import { colors, spacing, type } from '../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Home'>,
  StackScreenProps<RootStackParamList>
>;

/** The account number people pay into to add money. Created on the spot if signup could not create it. */
function AddMoneyCard({
  account,
  accountName,
  onCreated,
}: {
  account: { accountNumber: string; bankName: string } | null;
  accountName: string;
  onCreated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.getDepositAccount();
      onCreated();
    } catch (e) {
      setError(errorMessage(e, 'Could not get your account number'));
    } finally {
      setBusy(false);
    }
  };

  if (!account) {
    return (
      <View>
        <AccountCard label="Add money" number={null} emptyText="No account number yet" buttonTitle="Get account number" busy={busy} onPress={create} />
        <ErrorBanner message={error} />
        <Text style={styles.held2}>Get your own account number, then transfer to it from any bank.</Text>
      </View>
    );
  }
  return (
    <AccountCard
      label="Account number"
      number={account.accountNumber}
      leftLabel="Bank"
      leftValue={account.bankName}
      rightLabel="Account name"
      rightValue={accountName}
      buttonTitle={copied ? 'Copied' : canCopy ? 'Copy' : 'Share'}
      onPress={async () => {
        if (await copyText(account.accountNumber)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      }}
    />
  );
}

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
      <InboxBanner onNew={refresh} />
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
          <BalanceCard
            amount={formatMoney(account.available)}
            title="Vireo Wallet"
            subtitle={user?.name ?? 'Personal account'}
            notes={[
              ...(Number(account.held) - Number(account.restricted) > 0
                ? [`${formatMoney((Number(account.held) - Number(account.restricted)).toFixed(2))} on hold`]
                : []),
              ...(Number(account.restricted) > 0
                ? [`${formatMoney(account.restricted)} restricted until you verify more`]
                : []),
            ]}
          />

          <View style={styles.actions}>
            <Button title="Pay" variant="accent" style={{ flex: 1 }} onPress={() => navigation.navigate('Pay')} />
            <Button title="Activity" variant="secondary" style={{ flex: 1 }} onPress={() => navigation.navigate('Activity')} />
          </View>

          <Button title="Ask Vireo" variant="secondary" onPress={() => navigation.navigate('Assistant')} style={{ marginBottom: spacing.md }} />

          <AddMoneyCard
            account={account.virtualAccount}
            accountName={user?.name ?? ''}
            onCreated={refresh}
          />

          {kyc && kyc.kycTier === 0 && (
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
