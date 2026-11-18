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
      <Card>
        <Text style={styles.cardLabelDark}>ADD MONEY</Text>
        <Text style={styles.held2}>Get your own account number, then transfer to it from any bank.</Text>
        <ErrorBanner message={error} />
        <Button title="Get my account number" variant="accent" loading={busy} onPress={create} style={{ marginTop: spacing.md }} />
      </Card>
    );
  }
  return (
    <Card>
      <Text style={styles.cardLabelDark}>ADD MONEY · YOUR ACCOUNT NUMBER</Text>
      <Text style={styles.acct} selectable>
        {account.accountNumber}
      </Text>
      <Text style={styles.held2}>
        {account.bankName} · {accountName}
      </Text>
      <Text style={styles.held2}>Transfer from any bank. It lands in your wallet.</Text>
      <Button
        title={copied ? 'Copied' : canCopy ? 'Copy account number' : 'Share account number'}
        variant="secondary"
        small
        style={{ alignSelf: 'flex-start', marginTop: spacing.md }}
        onPress={async () => {
          if (await copyText(account.accountNumber)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }
        }}
      />
    </Card>
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
          <Card tone="black" style={{ paddingVertical: spacing.xxl }}>
            <Text style={styles.cardLabel}>Cash balance</Text>
            <BigMoney amount={account.available} color={colors.white} />
            {Number(account.held) - Number(account.restricted) > 0 && (
              <Text style={styles.held}>{formatMoney((Number(account.held) - Number(account.restricted)).toFixed(2))} on hold</Text>
            )}
            {Number(account.restricted) > 0 && (
              <Text style={styles.held}>{formatMoney(account.restricted)} restricted until you verify more</Text>
            )}
          </Card>

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

          {kyc && kyc.kycTier < 3 && (
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
