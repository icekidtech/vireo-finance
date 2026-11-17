import { useState } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { errorMessage, formatMoney, splitFullName } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import type { RootStackParamList } from '../navigation';
import { Button, Card, ErrorBanner, Field, Header, ListRow, Loading, NoticeBanner, Screen, StatusPill } from '../components/ui';
import { colors, spacing, type } from '../theme';

type Props = StackScreenProps<RootStackParamList, 'Kyc'>;

/** 2001-01-31 style input from digits only: "20010131" -> "2001-01-31". */
function formatDob(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

export default function KycScreen({ navigation }: Props) {
  const { data: all, loading, error, refreshing, refresh } = useLoad(async () => {
    const [status, tiers] = await Promise.all([api.getKycStatus(), api.getKycTiers()]);
    return { status, tiers };
  }, 'Could not load verification status');
  const data = all?.status;
  // Pre-filled from the name given at signup; still editable, since the BVN record must match exactly.
  const { user } = useAuth();
  const [firstName, setFirstName] = useState(() => splitFullName(user?.name).firstName);
  const [lastName, setLastName] = useState(() => splitFullName(user?.name).lastName);
  const [dob, setDob] = useState('');
  const [bvn, setBvn] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const ready =
    firstName.trim().length > 0 && lastName.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(dob) && /^\d{11}$/.test(bvn);

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.verifyBvn({ bvn, firstName: firstName.trim(), lastName: lastName.trim(), dateOfBirth: dob });
      setBvn(''); // never keep the BVN in memory longer than needed
      refresh();
    } catch (e) {
      setSubmitError(errorMessage(e, 'Could not verify your details'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !data) return <Loading />;

  const verified = !!data && data.kycTier >= 1;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Header title="Verify identity" onBack={() => navigation.goBack()} />
      <ErrorBanner message={error ?? submitError} />
      {data && (
        <Card>
          <ListRow title="Status" trailing={<StatusPill status={verified ? 'verified' : data.status} />} />
          <ListRow title="Your tier" trailing={`Tier ${data.kycTier}`} />
          {data.bvnLast4 ? <ListRow title="BVN" trailing={`•••••••${data.bvnLast4}`} /> : null}
        </Card>
      )}

      <Text style={styles.heading}>Tiers and limits</Text>
      {all?.tiers.tiers.map((t) => (
        <Card key={t.tier} style={{ marginBottom: spacing.md }}>
          <View style={styles.tierHead}>
            <Text style={styles.tierName}>
              Tier {t.tier} · {t.name}
            </Text>
            <StatusPill status={t.state === 'completed' ? 'verified' : t.state === 'next' ? 'pending' : 'locked'} />
          </View>
          <Text style={styles.limit}>Send up to {formatMoney(t.dailyLimit)} per day</Text>
          {t.requirements.map((r) => (
            <Text key={r.key} style={styles.req}>
              {t.state === 'completed' ? '✓' : '•'} {r.label}
              {t.state !== 'completed' && !r.available ? '  (not available yet)' : ''}
            </Text>
          ))}
        </Card>
      ))}

      {verified ? (
        <NoticeBanner tone="success" message="Your identity is verified. Your higher limits are active." />
      ) : data && !data.bvnAvailable ? (
        <NoticeBanner message="Identity verification isn't available yet. We'll let you know when it is." />
      ) : (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={styles.lead}>
            Check your name matches your BVN record, add your date of birth and BVN, and we'll raise your daily limits.
          </Text>
          <Field label="FIRST NAME" value={firstName} onChangeText={setFirstName} autoCapitalize="words" autoComplete="given-name" />
          <Field label="LAST NAME" value={lastName} onChangeText={setLastName} autoCapitalize="words" autoComplete="family-name" />
          <Field
            label="DATE OF BIRTH"
            placeholder="YYYY-MM-DD"
            value={dob}
            onChangeText={(v) => setDob(formatDob(v))}
            keyboardType="number-pad"
            maxLength={10}
          />
          <Field
            label="BVN"
            placeholder="11-digit BVN"
            value={bvn}
            onChangeText={(v) => setBvn(v.replace(/\D/g, '').slice(0, 11))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={11}
            hint="Dial *565*0# on the phone number linked to your bank to get your BVN."
          />
          <Text style={styles.consent}>
            By continuing you allow us to check these details against the banking BVN database through our
            identity-verification provider. We keep your BVN encrypted and never show it to anyone.
          </Text>
          <Button title="Verify" variant="accent" loading={submitting} disabled={!ready} onPress={submit} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { ...type.body, color: colors.textMuted, marginBottom: spacing.xl },
  heading: { ...type.heading, color: colors.text, marginTop: spacing.xl, marginBottom: spacing.md },
  tierHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tierName: { ...type.bodyStrong, color: colors.text },
  limit: { ...type.body, color: colors.textMuted, marginVertical: spacing.sm },
  req: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  consent: { ...type.caption, color: colors.textMuted, marginBottom: spacing.lg },
});
