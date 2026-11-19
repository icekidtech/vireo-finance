import PhoneEditor from '../components/PhoneEditor';
import { Text, StyleSheet, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useLoad } from '../lib/useLoad';
import type { RootStackParamList, TabParamList } from '../navigation';
import AccountCard from '../components/AccountCard';
import { Avatar, Button, Card, ErrorBanner, ListRow, Loading, Screen, SectionTitle, StatusPill } from '../components/ui';
import { colors, spacing, type } from '../theme';
import { showAlert } from '../lib/dialog';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Account'>,
  StackScreenProps<RootStackParamList>
>;

export default function AccountScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const pin = useLoad(() => api.getPinStatus(), 'Could not load your PIN status');
  const { data: merchant, loading, error, refreshing, refresh } = useLoad(
    () => api.getMerchantProfile(),
    'Could not load your business',
  );

  if (loading && !merchant) return <Loading />;

  const confirmSignOut = () =>
    showAlert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.hero}>
        <Avatar label={merchant?.businessName ?? user?.name ?? '?'} size={88} tone="black" />
        <Text style={styles.name}>{merchant?.businessName}</Text>
        <Text style={styles.handle}>{merchant ? `$${merchant.handle}` : ''}</Text>
        {merchant && <StatusPill status={String(merchant.kybStatus)} />}
      </View>
      <ErrorBanner message={error} />

      {merchant && merchant.kybStatus !== 'verified' && (
        <Button title="Verify your business" variant="accent" small onPress={() => navigation.navigate('Verify')} style={{ alignSelf: 'flex-start', marginTop: spacing.md }} />
      )}

      <SectionTitle>Settlement bank</SectionTitle>
      <AccountCard
        label="Payout account"
        number={merchant?.settlementAccountNumber ?? null}
        emptyText="No payout account yet"
        leftLabel="Account name"
        leftValue={merchant?.settlementAccountName ?? '—'}
        buttonTitle={merchant?.settlementAccountNumber ? 'Edit' : 'Add bank'}
        onPress={() => navigation.navigate('EditBusiness')}
      />

      <SectionTitle>You</SectionTitle>
      <Card>
        <ListRow title="Name" trailing={user?.name ?? '—'} />
        <PhoneEditor />
      </Card>

      <SectionTitle>Security</SectionTitle>
      <Card style={{ paddingVertical: spacing.sm }}>
        <ListRow
          title="Transaction PIN"
          subtitle={pin.data?.set ? 'Change or reset your 4-digit PIN' : 'Set a PIN to confirm cash outs without biometrics'}
          trailing={pin.data ? <StatusPill status={pin.data.set ? 'set' : 'not_set'} /> : '›'}
          onPress={() => navigation.navigate('Pin')}
        />
        <ListRow
          title="Signing devices"
          subtitle="Phones allowed to approve payouts"
          trailing="›"
          onPress={() => navigation.navigate('Devices')}
        />
      </Card>

      <Button title="Sign out" variant="secondary" onPress={confirmSignOut} style={{ marginTop: spacing.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: spacing.xl, gap: spacing.sm },
  name: { ...type.title, color: colors.text, marginTop: spacing.md },
  handle: { ...type.body, color: colors.textMuted },
});
