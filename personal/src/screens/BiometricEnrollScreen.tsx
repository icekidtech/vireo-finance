import { useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { getDeviceId } from '../lib/deviceKey';
import { errorMessage } from '../lib/format';
import type { RootStackParamList } from '../navigation';
import { Button, Card, ErrorBanner, Header, Screen } from '../components/ui';
import { Pop } from '../components/motion';
import { colors, spacing, type } from '../theme';

type Props = StackScreenProps<RootStackParamList, 'BiometricEnroll'>;
type Stage = 'consent' | 'capture' | 'done';

const CONSENT_VERSION = 'v1.1';

export default function BiometricEnrollScreen({ navigation }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [stage, setStage] = useState<Stage>('consent');
  const [consentId, setConsentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agree = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!permission?.granted) {
        const res = await requestPermission();
        if (!res.granted) throw new Error('Camera permission is needed to enroll your face');
      }
      const deviceId = (await getDeviceId()) ?? undefined;
      const consent = await api.grantBiometricConsent(CONSENT_VERSION, deviceId);
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
      await api.enrollBiometric('face', photo.base64, consentId);
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
        <View style={styles.overlay}>
          <Text style={styles.cameraTitle}>Centre your face</Text>
          <View style={styles.guide} />
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
          <Text style={styles.doneBody}>You can now pay at supporting tills with your face.</Text>
        </View>
        <Button title="Done" onPress={() => navigation.goBack()} style={{ marginBottom: spacing.xl }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Enroll your face" onBack={() => navigation.goBack()} />
      <ErrorBanner message={error} />
      <Card>
        <Text style={styles.consentTitle}>Biometric consent ({CONSENT_VERSION})</Text>
        <Text style={styles.consent}>
          By continuing you allow Vireo Finance to collect your face photo, check that it shows a
          live person, store an encrypted copy, and use it to verify you when you pay at a merchant
          till. Your photos are sent securely to our identity-verification provider only to run
          those checks, and the provider does not keep them.{'\n\n'}
          You can remove it at any time from Profile → Face payments, which deletes your stored
          photo and revokes this consent. You can see every verification attempt in the same place.
        </Text>
      </Card>
      <Button title="I agree, continue" variant="accent" loading={busy} onPress={agree} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  consentTitle: { ...type.heading, color: colors.text, marginBottom: spacing.md },
  consent: { ...type.body, color: colors.textMuted, lineHeight: 22 },
  cameraWrap: { flex: 1, backgroundColor: colors.black },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: spacing.xl, paddingTop: 80, paddingBottom: 48 },
  cameraTitle: { ...type.display, color: colors.white },
  guide: { width: 260, height: 260, borderRadius: 130, borderWidth: 4, borderColor: colors.accent },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  tick: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  tickText: { color: colors.accent, fontSize: 48, fontWeight: '800' },
  doneTitle: { ...type.display, color: colors.black },
  doneBody: { ...type.body, color: colors.black, textAlign: 'center' },
});
