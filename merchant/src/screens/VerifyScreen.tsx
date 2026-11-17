import { useState } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { errorMessage, splitFullName } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import type { VerificationOutcome } from '../types';
import type { RootStackParamList } from '../navigation';
import { Button, Card, ErrorBanner, Field, Header, ListRow, Loading, NoticeBanner, Screen, StatusPill } from '../components/ui';
import { colors, spacing, type } from '../theme';

type Props = StackScreenProps<RootStackParamList, 'Verify'>;

/** 2001-01-31 style input from digits only: "20010131" -> "2001-01-31". */
function formatDob(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

const OUTCOME_TEXT: Record<string, { tone: 'warn' | 'success'; message: string }> = {
  verified: { tone: 'success', message: 'Your business is verified. Cash out and your bank account number are unlocked.' },
  rejected: { tone: 'warn', message: 'Your business verification was rejected. Contact support.' },
  identity_required: { tone: 'warn', message: 'Verify your identity below to continue.' },
  bank_required: { tone: 'warn', message: 'Add your payout bank account in Account → Edit business & bank, then check again.' },
  name_mismatch: {
    tone: 'warn',
    message:
      'Your payout account name does not match your BVN name, so we need to review your business by hand. Use an account in your own name for instant verification.',
  },
};

/** Identity (BVN) check for the owner, then automatic business verification. */
export default function VerifyScreen({ navigation }: Props) {
  const { data, loading, error, refreshing, refresh } = useLoad(async () => {
    const [kyc, merchant] = await Promise.all([api.getKycStatus(), api.getMerchantProfile()]);
    return { kyc, merchant };
  }, 'Could not load your verification status');
  // Pre-filled from the name given at signup; still editable, since the BVN record must match exactly.
  const { user } = useAuth();
  const [firstName, setFirstName] = useState(() => splitFullName(user?.name).firstName);
  const [lastName, setLastName] = useState(() => splitFullName(user?.name).lastName);
  const [dob, setDob] = useState('');
  const [bvn, setBvn] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<VerificationOutcome | null>(null);

  const ready =
    firstName.trim().length > 0 && lastName.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(dob) && /^\d{11}$/.test(bvn);

  const run = async (work: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await work();
      setOutcome(await api.checkMerchantVerification());
      refresh();
    } catch (e) {
      setActionError(errorMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    run(async () => {
      await api.verifyBvn({ bvn, firstName: firstName.trim(), lastName: lastName.trim(), dateOfBirth: dob });
      setBvn(''); // never keep the BVN in memory longer than needed
    }, 'Could not verify your details');

  if (loading && !data) return <Loading />;

  const kyc = data?.kyc;
  const identityDone = !!kyc && kyc.kycTier >= 1;
  const kyb = data?.merchant.kybStatus ?? 'pending';
  const shown = outcome ? OUTCOME_TEXT[outcome.reason] : null;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Header title="Verify your business" onBack={() => navigation.goBack()} />
      <ErrorBanner message={error ?? actionError} />

      <Card>
        <ListRow title="Your identity" trailing={<StatusPill status={identityDone ? 'verified' : (kyc?.status ?? 'not_started')} />} />
        <ListRow title="Business" trailing={<StatusPill status={String(kyb)} />} />
        {kyc?.bvnLast4 ? <ListRow title="BVN" trailing={`•••••••${kyc.bvnLast4}`} /> : null}
      </Card>

      {shown ? <NoticeBanner tone={shown.tone} message={shown.message} /> : null}

      {kyb === 'verified' ? (
        <NoticeBanner tone="success" message="Your business is verified." />
      ) : identityDone ? (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={styles.lead}>
            Your identity is verified. We verify your business automatically when your payout bank account is in your
            own name.
          </Text>
          <Button title="Check again" variant="accent" loading={busy} onPress={() => run(async () => undefined, 'Could not check')} />
        </View>
      ) : kyc && !kyc.bvnAvailable ? (
        <NoticeBanner message="Identity verification isn't available yet. We'll let you know when it is." />
      ) : (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={styles.lead}>
            Enter your details exactly as they appear on your BVN record. This verifies you as the business owner.
          </Text>
          <Field label="FIRST NAME" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
          <Field label="LAST NAME" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
          <Field label="DATE OF BIRTH" placeholder="YYYY-MM-DD" value={dob} onChangeText={(v) => setDob(formatDob(v))} keyboardType="number-pad" maxLength={10} />
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
          <Button title="Verify" variant="accent" loading={busy} disabled={!ready} onPress={submit} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { ...type.body, color: colors.textMuted, marginBottom: spacing.xl },
  consent: { ...type.caption, color: colors.textMuted, marginBottom: spacing.lg },
});
