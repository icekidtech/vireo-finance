import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { errorMessage, formatMoney } from '../lib/format';
import type { TerminalPaymentResult } from '../types';
import type { RootStackParamList } from '../navigation';
import { BigMoney, Button, ErrorBanner, Field, Header, NoticeBanner, Screen } from '../components/ui';
import { Pop } from '../components/motion';
import FaceGuide from '../components/FaceGuide';
import { colors, radius, spacing, type } from '../theme';

type Props = StackScreenProps<RootStackParamList, 'BiometricPayment'>;
type Stage = 'identify' | 'capture' | 'result';

/**
 * Pay-with-face at the till. The customer is identified and verified by the
 * server; this screen only captures the sample and reports the outcome.
 */
export default function BiometricPaymentScreen({ navigation, route }: Props) {
  const { orderReference, amount } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [stage, setStage] = useState<Stage>('identify');
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TerminalPaymentResult | null>(null);
  // null while checking; false when the server has no biometric vendor set up.
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .biometricStatus()
      .then((s) => setAvailable(s.available))
      .catch(() => setAvailable(false));
  }, []);

  const startCapture = async () => {
    setError(null);
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return setError('Camera permission is needed to take a payment by face');
    }
    setStage('capture');
  };

  const captureAndPay = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await camera.current.takePictureAsync({ base64: true, quality: 0.5, skipProcessing: true });
      if (!photo?.base64) throw new Error('Could not read the camera image');
      const outcome = await api.terminalPayment({
        orderReference,
        customerIdentifier: identifier.trim().replace(/^[@$]/, ''),
        biometricType: 'face',
        biometricSample: photo.base64,
      });
      setResult(outcome);
      setStage('result');
    } catch (e) {
      setError(errorMessage(e, 'Payment failed'));
      setStage('identify');
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'capture') {
    return (
      <View style={styles.cameraWrap}>
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="front" />
        <FaceGuide topInset={150} bottomInset={300} />
        <View style={styles.overlay}>
          <Text style={styles.cameraTitle}>{formatMoney(amount)}</Text>
          <View />
          <Text style={styles.cameraHint}>Ask the customer to look at the camera</Text>
          <Button title="Capture & pay" variant="accent" loading={busy} onPress={captureAndPay} style={{ alignSelf: 'stretch' }} />
          <Button title="Cancel" variant="ghost" onPress={() => setStage('identify')} />
        </View>
      </View>
    );
  }

  if (stage === 'result' && result) {
    const paid = result.status === 'paid';
    return (
      <Screen background={paid ? colors.accent : colors.bg} scroll={false}>
        <View style={styles.center}>
          <Pop style={[styles.badge, !paid && { backgroundColor: result.status === 'denied' ? colors.danger : colors.warn }]}>
            <Text style={[styles.badgeText, paid && { color: colors.accent }]}>{paid ? '✓' : '!'}</Text>
          </Pop>
          <Text style={styles.resultTitle}>
            {paid ? 'Payment received' : result.status === 'denied' ? 'Not verified' : 'Customer approval needed'}
          </Text>
          {paid ? <BigMoney amount={amount} color={colors.black} /> : <Text style={styles.resultBody}>{result.message}</Text>}
        </View>
        {paid ? (
          <Button title="Done" onPress={() => navigation.navigate('Tabs', { screen: 'Home' })} />
        ) : (
          <>
            {result.status === 'denied' && <Button title="Try again" onPress={() => setStage('identify')} />}
            <Button title="Back to QR" variant="ghost" onPress={() => navigation.goBack()} />
          </>
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Pay with face" onBack={() => navigation.goBack()} />
      <View style={styles.amountRow}>
        <BigMoney amount={amount} size="display" />
      </View>
      <ErrorBanner message={error} />
      {available === false ? (
        <NoticeBanner message="Face payments aren't available yet. Use the QR code instead." />
      ) : (
        <NoticeBanner message="The customer must have enrolled their face in the Vireo app." />
      )}
      <Field label="CUSTOMER PHONE OR $HANDLE" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" placeholder="+2348012345678" />
      <Button title="Continue to camera" disabled={!identifier.trim() || !available} onPress={startCapture} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  amountRow: { alignItems: 'center', marginVertical: spacing.xl },
  cameraWrap: { flex: 1, backgroundColor: colors.black },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: spacing.xl, paddingTop: 80, paddingBottom: 48 },
  cameraTitle: { ...type.display, color: colors.white },
  cameraHint: { ...type.bodyStrong, color: colors.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: spacing.md },
  badge: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.white, fontSize: 48, fontWeight: '800' },
  resultTitle: { ...type.heading, color: colors.text },
  resultBody: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.xl, borderRadius: radius.md },
});
