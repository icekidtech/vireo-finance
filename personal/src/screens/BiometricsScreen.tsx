import { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { errorMessage, formatDateTime } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import type { RootStackParamList } from '../navigation';
import { Avatar, Button, Card, Empty, ErrorBanner, Header, ListRow, Loading, NoticeBanner, Screen, SectionTitle, StatusPill } from '../components/ui';
import { colors, spacing, type } from '../theme';
import { showAlert } from '../lib/dialog';

type Props = StackScreenProps<RootStackParamList, 'Biometrics'>;

/** Face enrollments, consent and the recent verification log. */
export default function BiometricsScreen({ navigation }: Props) {
  const { data, loading, error, refreshing, refresh } = useLoad(async () => {
    const [enrollments, attempts, status] = await Promise.all([
      api.listBiometricEnrollments(),
      api.listBiometricAttempts(),
      api.biometricStatus(),
    ]);
    return { enrollments, attempts, status };
  }, 'Could not load biometric data');
  const [actionError, setActionError] = useState<string | null>(null);

  const revoke = (kind: 'face') =>
    showAlert('Remove your face enrollment?', 'You will no longer be able to pay with it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.revokeBiometricEnrollment(kind, 'Removed by user');
            refresh();
          } catch (e) {
            setActionError(errorMessage(e, 'Could not remove the enrollment'));
          }
        },
      },
    ]);

  const deleteAll = () =>
    showAlert('Delete all biometric data?', 'This revokes your consent and deletes every enrollment.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.revokeBiometricConsent();
            refresh();
          } catch (e) {
            setActionError(errorMessage(e, 'Could not delete your biometric data'));
          }
        },
      },
    ]);

  if (loading && !data) return <Loading />;
  const active = data?.enrollments.filter((e) => !e.revokedAt && e.status !== 'revoked') ?? [];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Header title="Face payments" onBack={() => navigation.goBack()} />
      <ErrorBanner message={error ?? actionError} />
      <Text style={styles.lead}>Enroll your face to pay at a merchant till without your phone. You can delete it at any time.</Text>

      <SectionTitle>Enrollments</SectionTitle>
      {active.length > 0 ? (
        active.map((e) => (
          <ListRow
            key={e.id}
            leading={<Avatar label={e.type} tone="accent" />}
            title="Face"
            subtitle={`Enrolled ${formatDateTime(e.createdAt)}${e.qualityScore != null ? ` · quality ${e.qualityScore}` : ''}`}
            trailing={<Button title="Remove" variant="danger" small onPress={() => revoke(e.type)} />}
          />
        ))
      ) : (
        <Empty title="Not enrolled" body="No face enrolled yet." />
      )}
      {data?.status.testMode ? (
        <NoticeBanner message="Test mode: the face checker is in sandbox, so it accepts any image. Results here are not real." />
      ) : null}
      {data && !data.status.available ? (
        <NoticeBanner message="Face payments aren't available yet. We'll let you know when they are." />
      ) : null}
      <Button title={active.some((e) => e.type === 'face') ? 'Re-enroll face' : 'Enroll your face'} variant="accent" disabled={!data?.status.available} onPress={() => navigation.navigate('BiometricEnroll')} style={{ marginTop: spacing.md }} />

      <SectionTitle>Recent verifications</SectionTitle>
      {data && data.attempts.length > 0 ? (
        <Card style={{ paddingVertical: spacing.sm }}>
          {data.attempts.slice(0, 10).map((a) => (
            <ListRow
              key={a.id}
              title={`${a.type} · ${a.context}`}
              subtitle={formatDateTime(a.createdAt)}
              trailing={<StatusPill status={a.result === 'success' || a.result === 'pass' ? 'completed' : 'failed'} />}
            />
          ))}
        </Card>
      ) : (
        <Empty title="No attempts yet" />
      )}

      {active.length > 0 && (
        <Button title="Delete all biometric data" variant="danger" onPress={deleteAll} style={{ marginTop: spacing.xl }} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { ...type.body, color: colors.textMuted, marginBottom: spacing.md },
});
