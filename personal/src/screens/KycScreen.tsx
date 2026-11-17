import { useState } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { errorMessage, formatMoney, splitFullName } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import type { RootStackParamList } from '../navigation';
import { Button, Card, ErrorBanner, Field, Header, ListRow, Loading, NoticeBanner, Screen, StatusPill } from '../components/ui';
import FilePicker from '../components/FilePicker';
import SelfieCapture from '../components/SelfieCapture';
import { pickDocument, type PickedFile } from '../lib/documents';
import { colors, spacing, type } from '../theme';

type Props = StackScreenProps<RootStackParamList, 'Kyc'>;

/** 2001-01-31 style input from digits only: "20010131" -> "2001-01-31". */
function formatDob(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

function SelfieRow({ selfie, onTake }: { selfie: string | null; onTake: () => void }) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.selfieLabel}>LIVE SELFIE</Text>
      <Button title={selfie ? 'Retake selfie' : 'Take selfie'} variant="secondary" onPress={onTake} />
      {selfie ? <Text style={styles.consent}>Selfie captured ✓</Text> : null}
    </View>
  );
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
  const [nin, setNin] = useState('');
  const [idFront, setIdFront] = useState<PickedFile | null>(null);
  const [idBack, setIdBack] = useState<PickedFile | null>(null);
  const [address, setAddress] = useState('');
  const [proof, setProof] = useState<PickedFile | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const choose = async (allowPdf: boolean, set: (f: PickedFile) => void) => {
    try {
      const f = await pickDocument(allowPdf);
      if (f) set(f);
    } catch {
      setSubmitError('Could not open the file picker');
    }
  };

  /** Runs a step, then forgets sensitive inputs so they do not linger in memory. */
  const run = async (work: () => Promise<unknown>, fallback: string) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await work();
      setBvn('');
      setNin('');
      setSelfie(null);
      refresh();
    } catch (e) {
      setSelfie(null); // a fresh selfie is needed for the next attempt
      setSubmitError(errorMessage(e, fallback));
    } finally {
      setSubmitting(false);
    }
  };

  const bvnReady =
    firstName.trim().length > 0 && lastName.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(dob) && /^\d{11}$/.test(bvn) && !!selfie;
  const submitBvn = () =>
    run(
      () => api.verifyBvn({ bvn, firstName: firstName.trim(), lastName: lastName.trim(), dateOfBirth: dob, selfie: selfie! }),
      'Could not verify your details',
    );
  const submitNin = () =>
    run(async () => {
      const front = await api.uploadDocument('id_front', idFront!);
      const back = idBack ? await api.uploadDocument('id_back', idBack) : undefined;
      await api.verifyNinAndId({ nin, idFrontDocumentId: front.id, idBackDocumentId: back?.id, selfie: selfie! });
    }, 'Could not verify your ID');
  const submitAddress = () =>
    run(async () => {
      const doc = await api.uploadDocument('proof_of_address', proof!);
      await api.verifyAddress({ address: address.trim(), proofDocumentId: doc.id });
    }, 'Could not verify your address');

  if (loading && !all) return <Loading />;

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

  const tier = data?.kycTier ?? 0;
  const next = all?.tiers.tiers.find((t) => t.tier === tier + 1);
  const nextAvailable = !!next?.requirements.every((r) => r.available);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Header title="Verify identity" onBack={() => navigation.goBack()} />
      <ErrorBanner message={error ?? submitError} />
      {data && (
        <Card>
          <ListRow title="Status" trailing={<StatusPill status={tier >= 1 ? 'verified' : data.status} />} />
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

      {tier >= 3 ? (
        <NoticeBanner tone="success" message="You are fully verified. Your highest limits are active." />
      ) : !next || !nextAvailable ? (
        <NoticeBanner message="This verification step isn't available yet. We'll let you know when it is." />
      ) : (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={styles.heading}>Step: Tier {next.tier} · {next.name}</Text>
          {tier === 0 ? (
            <>
              <Text style={styles.lead}>
                Enter your details exactly as they appear on your BVN record, then take a live selfie. We match it to
                your BVN photo.
              </Text>
              <Field label="FIRST NAME" value={firstName} onChangeText={setFirstName} autoCapitalize="words" autoComplete="given-name" />
              <Field label="LAST NAME" value={lastName} onChangeText={setLastName} autoCapitalize="words" autoComplete="family-name" />
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
              <SelfieRow selfie={selfie} onTake={() => setCapturing(true)} />
              <Text style={styles.consent}>
                By continuing you allow us to check these details and your selfie against the banking BVN database
                through our identity-verification provider. We keep your BVN encrypted and never show it to anyone.
              </Text>
              <Button title="Verify" variant="accent" loading={submitting} disabled={!bvnReady} onPress={submitBvn} />
            </>
          ) : null}

          {tier === 1 ? (
            <>
              <Text style={styles.lead}>
                Add your NIN and a photo of a valid government ID (national ID, driver's licence, passport or voter's
                card), then take a live selfie to match the photo on it.
              </Text>
              <Field
                label="NIN"
                placeholder="11-digit NIN"
                value={nin}
                onChangeText={(v) => setNin(v.replace(/\D/g, '').slice(0, 11))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={11}
              />
              <FilePicker label="ID — FRONT" file={idFront} onPick={() => choose(false, setIdFront)} hint="A clear JPG or PNG with all four corners visible." />
              <FilePicker label="ID — BACK (IF IT HAS ONE)" file={idBack} onPick={() => choose(false, setIdBack)} />
              <SelfieRow selfie={selfie} onTake={() => setCapturing(true)} />
              <Text style={styles.consent}>
                Your ID photo is encrypted and stored privately. It is only used to verify you.
              </Text>
              <Button title="Verify" variant="accent" loading={submitting} disabled={!/^\d{11}$/.test(nin) || !idFront || !selfie} onPress={submitNin} />
            </>
          ) : null}

          {tier === 2 ? (
            <>
              <Text style={styles.lead}>
                Add your home address and a utility bill or bank statement from the last 3 months in your name showing
                that address.
              </Text>
              <Field label="HOME ADDRESS" placeholder="12 Allen Avenue, Ikeja, Lagos" value={address} onChangeText={setAddress} multiline maxLength={200} />
              <FilePicker label="PROOF OF ADDRESS" file={proof} onPick={() => choose(true, setProof)} hint="JPG, PNG or PDF, up to 8 MB." />
              <Button title="Verify" variant="accent" loading={submitting} disabled={address.trim().length < 10 || !proof} onPress={submitAddress} />
            </>
          ) : null}
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
  selfieLabel: { ...type.label, color: colors.textMuted, marginBottom: spacing.sm },
  consent: { ...type.caption, color: colors.textMuted, marginBottom: spacing.lg },
});
