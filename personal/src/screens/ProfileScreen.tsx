import { Text, StyleSheet, View, Alert } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useLoad } from '../lib/useLoad';
import type { RootStackParamList, TabParamList } from '../navigation';
import { Avatar, Button, Card, ListRow, Screen, SectionTitle, StatusPill } from '../components/ui';
import { colors, spacing, type } from '../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Profile'>,
  StackScreenProps<RootStackParamList>
>;

export default function ProfileScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const kyc = useLoad(() => api.getKycStatus(), 'Could not load verification status');

  const confirmSignOut = () =>
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);

  return (
    <Screen refreshing={kyc.refreshing} onRefresh={kyc.refresh}>
      <View style={styles.hero}>
        <Avatar label={user?.name ?? '?'} size={88} tone="black" />
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.sub}>
          {user?.handle ? `$${user.handle}  ·  ` : ''}
          {user?.phone}
        </Text>
      </View>

      <SectionTitle>Verification</SectionTitle>
      <Card style={{ paddingVertical: spacing.sm }}>
        <ListRow
          title="Identity (KYC)"
          subtitle={kyc.data ? `Tier ${kyc.data.kycTier}` : undefined}
          trailing={kyc.data ? <StatusPill status={kyc.data.status} /> : '›'}
          onPress={() => navigation.navigate('Kyc')}
        />
      </Card>

      <SectionTitle>Security</SectionTitle>
      <Card style={{ paddingVertical: spacing.sm }}>
        <ListRow title="Signing devices" subtitle="Phones that can approve payments" trailing="›" onPress={() => navigation.navigate('Devices')} />
        <ListRow title="Face & voice" subtitle="Pay without your phone at merchant tills" trailing="›" onPress={() => navigation.navigate('Biometrics')} />
      </Card>

      {user?.role === 'admin' && (
        <>
          <SectionTitle>Staff</SectionTitle>
          <Card style={{ paddingVertical: spacing.sm }}>
            <ListRow title="Review queue" subtitle="Identity and business verification" trailing="›" onPress={() => navigation.navigate('Admin')} />
          </Card>
        </>
      )}

      <Button title="Sign out" variant="secondary" onPress={confirmSignOut} style={{ marginTop: spacing.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: spacing.xl, gap: spacing.sm },
  name: { ...type.title, color: colors.text, marginTop: spacing.md },
  sub: { ...type.body, color: colors.textMuted },
});
