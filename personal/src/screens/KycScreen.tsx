import { useState } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { errorMessage } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import type { RootStackParamList } from '../navigation';
import { Button, Card, ErrorBanner, Field, Header, ListRow, Loading, NoticeBanner, Screen, StatusPill } from '../components/ui';
import { colors, spacing, type } from '../theme';

type Props = StackScreenProps<RootStackParamList, 'Kyc'>;

export default function KycScreen({ navigation }: Props) {
  const { data, loading, error, refreshing, refresh } = useLoad(() => api.getKycStatus(), 'Could not load verification status');
  const [provider, setProvider] = useState('');
  const [payload, setPayload] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.submitKyc(provider.trim(), payload.trim() || undefined);
      setSubmitted(true);
      refresh();
    } catch (e) {
      setSubmitError(errorMessage(e, 'Could not submit your details'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !data) return <Loading />;

  const verified = data?.status === 'verified';

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Header title="Verify identity" onBack={() => navigation.goBack()} />
      <ErrorBanner message={error ?? submitError} />
      {data && (
        <Card>
          <ListRow title="Status" trailing={<StatusPill status={data.status} />} />
          <ListRow title="Tier" trailing={String(data.kycTier)} />
        </Card>
      )}
      {submitted && <NoticeBanner tone="success" message="Submitted. We'll review it and update your status." />}
      {!verified && (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={styles.lead}>Verify who you are to raise your daily limits.</Text>
          <Field label="PROVIDER" placeholder="e.g. bvn, nin" value={provider} onChangeText={setProvider} autoCapitalize="none" hint="2–40 letters, numbers, underscores or hyphens." />
          <Field label="ID NUMBER / DETAILS" value={payload} onChangeText={setPayload} multiline maxLength={5000} />
          <Button title="Submit for review" loading={submitting} disabled={provider.trim().length < 2} onPress={submit} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { ...type.body, color: colors.textMuted, marginBottom: spacing.xl },
});
