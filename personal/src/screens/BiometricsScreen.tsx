import { useState } from 'react';
import { Alert, Text, StyleSheet } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { errorMessage, formatDateTime } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import type { RootStackParamList } from '../navigation';
import { Avatar, Button, Card, Empty, ErrorBanner, Header, ListRow, Loading, NoticeBanner, Screen, SectionTitle, StatusPill } from '../components/ui';
import { colors, spacing, type } from '../theme';

type Props = StackScreenProps<RootStackParamList, 'Biometrics'>;

/**
 * Lists and manages face/voice enrollments and the recent verification log.
 * Capturing new samples needs the camera/microphone and ships with the
 * terminal-payment work.
 */
export default function BiometricsScreen({ navigation }: Props) {
  const { data, loading, error, refreshing, refresh } = useLoad(async () => {
    const [enrollments, attempts] = await Promise.all([
      api.listBiometricEnrollments(),
      api.listBiometricAttempts(),
    ]);
    return { enrollments, attempts };
  }, 'Could not load biometric data');
  const [actionError, setActionError] = useState<string | null>(null);

  const revoke = (kind: 'face' | 'voice') =>
    Alert.alert(`Remove ${kind} enrollment?`, 'You will no longer be able to pay with it.', [
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
    Alert.alert('Delete all biometric data?', 'This revokes your consent and deletes every enrollment.', [
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
      <Header title="Face & voice" onBack={() => navigation.goBack()} />
      <ErrorBanner message={error ?? actionError} />
      <Text style={styles.lead}>Enrolled biometrics let you pay at a till without a phone or card. You can delete them at any time.</Text>

      <SectionTitle>Enrollments</SectionTitle>
      {active.length > 0 ? (
        active.map((e) => (
          <ListRow
            key={e.id}
            leading={<Avatar label={e.type} tone="accent" />}
            title={e.type === 'face' ? 'Face' : 'Voice'}
            subtitle={`Enrolled ${formatDateTime(e.createdAt)}${e.qualityScore != null ? ` · quality ${e.qualityScore}` : ''}`}
            trailing={<Button title="Remove" variant="danger" small onPress={() => revoke(e.type)} />}
          />
        ))
      ) : (
        <Empty title="Not enrolled" body="No face or voice enrolled yet." />
      )}
      <NoticeBanner message="Enrolling a new face or voice sample is coming with merchant terminal payments." />

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
