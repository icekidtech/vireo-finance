import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { getDeviceId } from '../lib/deviceKey';
import { shrinkFaceImage } from '../lib/image';
import { errorMessage, formatMoney } from '../lib/format';
import type { RootStackParamList } from '../navigation';
import { Button, Card, ErrorBanner, Header, Screen } from '../components/ui';
import { Pop } from '../components/motion';
import FaceGuide from '../components/FaceGuide';
import { colors, spacing, type } from '../theme';

type Props = StackScreenProps<RootStackParamList, 'BiometricEnroll'>;
type Stage = 'consent' | 'capture' | 'done';

// The wording differs when a merchant can charge you from your face alone, so the version recorded
// with your consent says which one you accepted.
const CONSENT_VERSION_BASIC = 'v1.1';
const CONSENT_VERSION_FACE_ONLY = 'v2.0';

export default function BiometricEnrollScreen({ navigation }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [stage, setStage] = useState<Stage>('consent');
  const [consentId, setConsentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null until the server says whether a face alone can pay at a till.
  const [faceOnly, setFaceOnly] = useState<{ available: boolean; maxAmount: string } | null>(null);
  useEffect(() => {
    api.biometricStatus().then((s) => setFaceOnly(s.faceOnly)).catch(() => setFaceOnly({ available: false, maxAmount: '0' }));
  }, []);
  const faceOnlyOn = faceOnly?.available === true;
  // True when a face is already enrolled: this run then replaces it (and its saved copy).
  const [replacing, setReplacing] = useState(false);
  useEffect(() => {
    api
      .listBiometricEnrollments()
      .then((list) => setReplacing(list.some((e) => e.type === 'face' && e.status === 'active' && !e.revokedAt)))
      .catch(() => undefined);
  }, []);
  const consentVersion = faceOnlyOn ? CONSENT_VERSION_FACE_ONLY : CONSENT_VERSION_BASIC;

  const agree = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!permission?.granted) {
        const res = await requestPermission();
        if (!res.granted) throw new Error('Camera permission is needed to enroll your face');
      }
      const deviceId = (await getDeviceId()) ?? undefined;
      const consent = await api.grantBiometricConsent(consentVersion, deviceId);
      setConsentId(consent.id);
      setStage('capture');
    } catch (e) {
      setError(errorMessage(e, 'Could not record your consent'));
    } finally {
      setBusy(false);
    }
  };

  const capture = async () => {
    if (!camera.current || !consentId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await camera.current.takePictureAsync({ base64: true, quality: 0.5, skipProcessing: true });
      if (!photo?.base64) throw new Error('Could not read the camera image');
      // A full-size webcam frame can take over a minute to upload on a weak connection.
      await api.enrollBiometric('face', await shrinkFaceImage(photo.base64), consentId);
      setStage('done');
    } catch (e) {
      setError(errorMessage(e, 'Enrollment failed. Try again in better light.'));
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'capture') {
    return (
      <View style={styles.cameraWrap}>
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="front" />
        <FaceGuide />
        <View style={styles.overlay}>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.cameraTitle}>Fit your face in the oval</Text>
            <Text style={styles.cameraHint}>Look straight at the camera in good light</Text>
          </View>
          <View />
          <View style={{ alignSelf: 'stretch' }}>
            <ErrorBanner message={error} />
            <Button title="Capture" variant="accent" loading={busy} onPress={capture} />
            <Button title="Cancel" variant="ghost" onPress={() => navigation.goBack()} />
          </View>
        </View>
      </View>
    );
  }

  if (stage === 'done') {
    return (
      // scroll={false} gives the body a bounded height so the content can centre.
      <Screen background={colors.accent} scroll={false}>
        <View style={styles.center}>
          <Pop style={styles.tick}>
            <Text style={styles.tickText}>✓</Text>
          </Pop>
          <Text style={styles.doneTitle}>Face enrolled</Text>
          <Text style={styles.doneBody}>
            {faceOnlyOn
              ? 'You can now pay at supporting tills with just your face, up to ' + formatMoney(faceOnly?.maxAmount ?? '0') + '.'
              : 'You can now pay at supporting tills with your face.'}
          </Text>
        </View>
        <Button title="Done" onPress={() => navigation.goBack()} style={{ marginBottom: spacing.xl }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title={replacing ? 'Re-enroll your face' : 'Enroll your face'} onBack={() => navigation.goBack()} />
      <ErrorBanner message={error} />
      <Card>
        <Text style={styles.consentTitle}>Biometric consent ({consentVersion})</Text>
        {replacing ? (
          <Text style={[styles.consent, { marginBottom: spacing.md }]}>
            <Text style={styles.consentBold}>This replaces your current face.</Text> The photo you
            enrolled before is removed once the new one is saved.
          </Text>
        ) : null}
        {faceOnlyOn ? (
          <Text style={styles.consent}>
            By continuing you allow Vireo Finance to collect your face photo, check that it shows a
            live person, and store an encrypted copy.{'\n\n'}
            <Text style={styles.consentBold}>Paying with just your face.</Text> A merchant can then
            charge your Vireo wallet when your face is scanned at their till, with no phone, number
            or PIN, for orders up to {formatMoney(faceOnly?.maxAmount ?? '0')}. Larger orders still
            need your approval on your phone. You will get a notification for every payment.{'\n\n'}
            <Text style={styles.consentBold}>Where your face is kept.</Text> So that you can be
            recognised, a copy is also kept by our identity-verification provider until you remove
            it.{'\n\n'}
            You can remove it at any time from Profile → Face payments, which deletes your stored
            photo, deletes the provider's copy and revokes this consent. You can see every
            verification attempt in the same place.
          </Text>
        ) : (
          <Text style={styles.consent}>
            By continuing you allow Vireo Finance to collect your face photo, check that it shows a
            live person, store an encrypted copy, and use it to verify you when you pay at a merchant
            till. Your photos are sent securely to our identity-verification provider only to run
            those checks, and the provider does not keep them.{'\n\n'}
            You can remove it at any time from Profile → Face payments, which deletes your stored
            photo and revokes this consent. You can see every verification attempt in the same place.
          </Text>
        )}
      </Card>
      <Button title="I agree, continue" variant="accent" loading={busy} disabled={faceOnly === null} onPress={agree} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  consentTitle: { ...type.heading, color: colors.text, marginBottom: spacing.md },
  consent: { ...type.body, color: colors.textMuted, lineHeight: 22 },
  consentBold: { fontWeight: '700', color: colors.text },
  cameraWrap: { flex: 1, backgroundColor: colors.black },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: spacing.xl, paddingTop: 80, paddingBottom: 48 },
  cameraTitle: { ...type.title, color: colors.white, textAlign: 'center' },
  cameraHint: { ...type.body, color: colors.white, marginTop: spacing.xs, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  tick: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  tickText: { color: colors.accent, fontSize: 48, fontWeight: '800' },
  doneTitle: { ...type.display, color: colors.black },
  doneBody: { ...type.body, color: colors.black, textAlign: 'center' },
});
