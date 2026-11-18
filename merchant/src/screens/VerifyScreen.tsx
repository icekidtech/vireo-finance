import { useState } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { errorMessage, formatMoney, splitFullName } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import type { VerificationOutcome } from '../types';
import type { RootStackParamList } from '../navigation';
import { Button, Card, ErrorBanner, Field, Header, ListRow, Loading, NoticeBanner, Screen, StatusPill } from '../components/ui';
import FilePicker from '../components/FilePicker';
import SelfieCapture from '../components/SelfieCapture';
import { pickDocument, type PickedFile } from '../lib/documents';
import { clearDrafts, usePersistedState } from '../lib/sessionState';
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
  verified: { tone: 'success', message: 'Your business is verified. You can now receive payments and cash out.' },
  rejected: { tone: 'warn', message: 'Your business verification was rejected. Contact support.' },
  identity_required: { tone: 'warn', message: 'Verify your identity below to continue.' },
};

/** Identity (BVN) check for the owner, then automatic business verification. */
export default function VerifyScreen({ navigation }: Props) {
  const { data, loading, error, refreshing, refresh } = useLoad(async () => {
    const [kyc, merchant, levels] = await Promise.all([
      api.getKycStatus(),
      api.getMerchantProfile(),
      api.getBusinessLevels(),
    ]);
    return { kyc, merchant, levels };
  }, 'Could not load your verification status');
  // Pre-filled from the name given at signup; still editable, since the BVN record must match exactly.
  const { user } = useAuth();
  // Names, date of birth and CAC details survive a page reload (web). The BVN, selfie and documents never do.
  const [firstName, setFirstName] = usePersistedState('verify.firstName', splitFullName(user?.name).firstName);
  const [lastName, setLastName] = usePersistedState('verify.lastName', splitFullName(user?.name).lastName);
  const [dob, setDob] = usePersistedState('verify.dob', '');
  const [bvn, setBvn] = useState('');
  const [selfie, setSelfie] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [certificate, setCertificate] = useState<PickedFile | null>(null);
  const [cac, setCac] = usePersistedState('verify.cac', '');
  const [tin, setTin] = usePersistedState('verify.tin', '');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<VerificationOutcome | null>(null);

  const ready =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(dob) &&
    /^\d{11}$/.test(bvn) &&
    !!selfie;

  const run = async (work: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await work();
      setOutcome(await api.checkMerchantVerification());
      clearDrafts('verify.');
      refresh();
    } catch (e) {
      setActionError(errorMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    run(async () => {
      await api.verifyBvn({ bvn, firstName: firstName.trim(), lastName: lastName.trim(), dateOfBirth: dob, selfie: selfie! });
      setBvn(''); // never keep the BVN in memory longer than needed
      setSelfie(null);
      // After BVN verification, provision the merchant deposit account (Paga sub-account)
      try {
        await api.getDepositAccount();
      } catch (e) {
        // If it fails, it's not critical - user can get it later from ReceiveScreen
        console.warn('Could not provision deposit account:', e);
      }
    }, 'Could not verify your details');

  if (loading && !data) return <Loading />;

  if (capturing) {
    return (
      <SelfieCapture
        onCapture={(b64) => {
          setSelfie(b64);
          setCapturing(false);
        }}
        onCancel={() => setCapturing(false)}
      />
    );
  }

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

      <Text style={styles.heading}>Business levels</Text>
      {data?.levels.levels
        .filter((l) => l.level > 0)
        .map((l) => (
          <Card key={l.level} style={{ marginBottom: spacing.md }}>
            <View style={styles.levelHead}>
              <Text style={styles.levelName}>
                Level {l.level} · {l.name}
              </Text>
              <StatusPill status={l.state === 'completed' ? 'verified' : l.state === 'next' ? 'pending' : 'locked'} />
            </View>
            {l.cashoutDailyLimit ? (
              <Text style={styles.limit}>Cash out up to {formatMoney(l.cashoutDailyLimit)} per day</Text>
            ) : null}
            {l.requirements.map((r) => (
              <Text key={r.key} style={styles.req}>
                {l.state === 'completed' ? '✓' : '•'} {r.label}
              </Text>
            ))}
          </Card>
        ))}

      {shown ? <NoticeBanner tone={shown.tone} message={shown.message} /> : null}

      {kyb === 'verified' ? (
        <View style={{ marginTop: spacing.md }}>
          {data?.levels.currentLevel === 2 ? (
            <NoticeBanner tone="success" message="Your business registration is verified." />
          ) : data?.levels.registrationStatus === 'pending' ? (
            <NoticeBanner message={`Your registration (${data.levels.cacNumber}) is being reviewed. We'll update your level when it's done.`} />
          ) : (
            <>
              {data?.levels.registrationStatus === 'rejected' ? (
                <NoticeBanner message="Your last registration submission was not accepted. Check the number and submit again." />
              ) : null}
              <Text style={styles.lead}>
                Register your business to raise your daily cash-out limit. Enter your CAC number; we confirm it on the
                CAC register.
              </Text>
              <Field label="CAC NUMBER" placeholder="RC1234567" value={cac} onChangeText={(v) => setCac(v.toUpperCase())} autoCapitalize="characters" maxLength={12} hint="RC for companies, BN for business names, IT for incorporated trustees." />
              <FilePicker label="CAC CERTIFICATE" file={certificate} onPick={async () => { try { const f = await pickDocument(true); if (f) setCertificate(f); } catch { setActionError('Could not open the file picker'); } }} hint="JPG, PNG or PDF, up to 8 MB. Stored privately and only seen by our review team." />
              <Field label="TIN (OPTIONAL)" placeholder="12345678-0001" value={tin} onChangeText={setTin} keyboardType="number-pad" maxLength={20} />
              <Button
                title="Submit for review"
                variant="accent"
                loading={busy}
                disabled={!/^(RC|BN|IT)\s?\d{5,8}$/i.test(cac.trim()) || !certificate}
                onPress={() =>
                  run(async () => {
                    const doc = await api.uploadDocument('cac_certificate', certificate!);
                    await api.submitRegistration({ cacNumber: cac.trim(), tin: tin.trim() || undefined, certificateDocumentId: doc.id });
                  }, 'Could not submit your registration')
                }
              />
            </>
          )}
        </View>
      ) : identityDone ? (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={styles.lead}>
            Your identity is verified. Checking your business verification status...
          </Text>
          <Button title="Check again" variant="accent" loading={busy} onPress={() => run(async () => {
            // Trigger the verification check which auto-verifies after BVN
            await api.checkMerchantVerification();
          }, 'Could not check')} />
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
          <Text style={styles.selfieLabel}>LIVE SELFIE</Text>
          <Button title={selfie ? 'Retake selfie' : 'Take selfie'} variant="secondary" onPress={() => setCapturing(true)} />
          {selfie ? <Text style={styles.consent}>Selfie captured ✓</Text> : null}
          <Text style={styles.consent}>
            By continuing you allow us to check these details and your selfie against the banking BVN database
            through our identity-verification provider. We keep your BVN encrypted and never show it to anyone.
          </Text>
          <Button title="Verify" variant="accent" loading={busy} disabled={!ready} onPress={submit} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { ...type.body, color: colors.textMuted, marginBottom: spacing.xl },
  heading: { ...type.heading, color: colors.text, marginTop: spacing.xl, marginBottom: spacing.md },
  levelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  levelName: { ...type.bodyStrong, color: colors.text },
  limit: { ...type.body, color: colors.textMuted, marginVertical: spacing.sm },
  req: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  selfieLabel: { ...type.label, color: colors.textMuted, marginBottom: spacing.sm },
  consent: { ...type.caption, color: colors.textMuted, marginBottom: spacing.lg },
});
