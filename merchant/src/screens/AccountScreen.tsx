import { Text, StyleSheet, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useLoad } from '../lib/useLoad';
import type { RootStackParamList, TabParamList } from '../navigation';
import { Avatar, Button, Card, ErrorBanner, ListRow, Loading, Screen, SectionTitle, StatusPill } from '../components/ui';
import { colors, spacing, type } from '../theme';
import { showAlert } from '../lib/dialog';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Account'>,
  StackScreenProps<RootStackParamList>
>;

export default function AccountScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
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
      <Button title="Edit business & bank" variant="secondary" small onPress={() => navigation.navigate('EditBusiness')} style={{ alignSelf: 'flex-start', marginBottom: spacing.md }} />
      <Card>
        <ListRow title="Account name" trailing={merchant?.settlementAccountName ?? '—'} />
        <ListRow title="Account number" trailing={merchant?.settlementAccountNumber ?? '—'} />
      </Card>

      <SectionTitle>You</SectionTitle>
      <Card>
        <ListRow title="Name" trailing={user?.name ?? '—'} />
        <ListRow title="Phone" trailing={user?.phone ?? '—'} />
      </Card>

      <SectionTitle>Security</SectionTitle>
      <Card style={{ paddingVertical: spacing.sm }}>
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
