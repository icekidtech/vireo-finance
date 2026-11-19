import { shrinkFaceImage } from '../lib/image';
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
type PaymentMode = 'deviceless' | 'legacy'; // deviceless = 1:N search, legacy = 1:1 with identifier

/**
 * Pay-with-face at the till. The customer is identified and verified by the
 * server; this screen only captures the sample and reports the outcome.
 * 
 * Supports TWO modes:
 * - Deviceless (1:N): Just capture face, no identifier needed [NEW]
 * - Legacy (1:1): Enter phone/handle first, then verify [OLD]
 */
export default function BiometricPaymentScreen({ navigation, route }: Props) {
  const { orderReference, amount } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [stage, setStage] = useState<Stage>('identify');
  const [mode, setMode] = useState<PaymentMode>('deviceless'); // Default to deviceless
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TerminalPaymentResult | null>(null);
  // null while checking; false when the server has no biometric vendor set up.
  const [available, setAvailable] = useState<boolean | null>(null);
  const [testMode, setTestMode] = useState(false);

  useEffect(() => {
    api
      .biometricStatus()
      .then((s) => {
        setAvailable(s.available);
        setTestMode(s.testMode);
      })
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
      const sample = await shrinkFaceImage(photo.base64);

      if (mode === 'deviceless') {
        // 1:N face search: no identifier needed. This only IDENTIFIES the customer. Taking payment
        // by face is not available yet, so a match is reported as "recognised", never as "paid".
        const identification = await api.identifyByFace({
          sampleBase64: sample,
          amountMinor: Math.round(Number(amount) * 100),
          metadata: {
            orderReference,
            terminalType: 'merchant_app',
          },
        });

        const outcome: TerminalPaymentResult =
          identification.decision === 'APPROVED'
            ? {
                status: 'identified',
                message:
                  'Customer recognised. No payment was taken: charging by face is not available yet, so ask them to pay with the QR code.',
              }
            : identification.decision === 'STEP_UP'
              ? {
                  status: 'step_up_required',
                  message: 'Additional verification is required for this customer or amount.',
                  orderReference,
                }
              : {
                  status: 'denied',
                  message: identification.reason || 'Face not recognised. The customer may not be enrolled.',
                };

        setResult(outcome);
        setStage('result');
      } else {
        // LEGACY: 1:1 verification with identifier
        const outcome = await api.terminalPayment({
          orderReference,
          customerIdentifier: identifier.trim().replace(/^[@$]/, ''),
          biometricType: 'face',
          biometricSample: sample,
        });
        setResult(outcome);
        setStage('result');
      }
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
          <Button title={mode === 'deviceless' ? 'Capture & identify' : 'Capture & pay'} variant="accent" loading={busy} onPress={captureAndPay} style={{ alignSelf: 'stretch' }} />
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
            {paid ? 'Payment received' : result.status === 'denied' ? 'Not verified' : result.status === 'identified' ? 'Customer recognised' : 'Customer approval needed'}
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
      {testMode ? (
        <NoticeBanner message="Test mode: the face checker accepts any image, so any face will pass." />
      ) : null}
      {available === false ? (
        <NoticeBanner message="Face payments aren't available yet. Use the QR code instead." />
      ) : (
        <NoticeBanner message="The customer must have enrolled their face in the Vireo app." />
      )}

      {/* Mode selection */}
      <View style={styles.modeSelector}>
        <Button
          title="🚀 Deviceless (just face)"
          variant={mode === 'deviceless' ? 'primary' : 'ghost'}
          onPress={() => setMode('deviceless')}
          style={{ flex: 1 }}
        />
        <Button
          title="📱 With phone number"
          variant={mode === 'legacy' ? 'primary' : 'ghost'}
          onPress={() => setMode('legacy')}
          style={{ flex: 1 }}
        />
      </View>

      {mode === 'deviceless' ? (
        <>
          <Text style={styles.instruction}>
            <Text style={styles.instructionBold}>TRUE DEVICELESS:</Text> Just capture the customer's face.
            No phone number needed!
          </Text>
          <Button
            title="Capture face & identify"
            disabled={!available}
            onPress={startCapture}
          />
        </>
      ) : (
        <>
          <Field
            label="CUSTOMER PHONE OR $HANDLE"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            placeholder="+2348012345678"
          />
          <Button
            title="Continue to camera"
            disabled={!identifier.trim() || !available}
            onPress={startCapture}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  amountRow: { alignItems: 'center', marginVertical: spacing.xl },
  modeSelector: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  instruction: {
    ...type.body,
    color: colors.textMuted,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  instructionBold: {
    ...type.bodyStrong,
    color: colors.accent,
  },
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
