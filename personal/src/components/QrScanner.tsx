import { useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button } from './ui';
import { colors, radius, spacing, type } from '../theme';

type Props = {
  /** Called once per distinct code; the parent decides whether it is valid. */
  onScan: (data: string) => void;
  /** Pause scanning (e.g. while a scanned order is being looked up). */
  paused?: boolean;
};

/** Live camera view that reads QR codes. Asks for camera permission itself. */
export default function QrScanner({ onScan, paused }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const last = useRef<{ data: string; at: number } | null>(null);

  if (!permission) return <View style={styles.frame} />;

  if (!permission.granted) {
    return (
      <View style={[styles.frame, styles.center]}>
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.body}>
          {permission.canAskAgain
            ? 'Allow the camera to scan the merchant’s QR code.'
            : 'Camera access is blocked. Enable it in your browser or device settings, or enter the order reference below.'}
        </Text>
        {permission.canAskAgain ? <Button title="Allow camera" onPress={requestPermission} /> : null}
      </View>
    );
  }

  return (
    <View style={styles.frame}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={
          paused
            ? undefined
            : ({ data }) => {
                const now = Date.now();
                // The camera fires continuously: ignore repeats of the same code.
                if (last.current && last.current.data === data && now - last.current.at < 3000) return;
                last.current = { data, at: now };
                onScan(data);
              }
        }
      />
      <View pointerEvents="none" style={styles.reticleWrap}>
        <View style={styles.reticle} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 360,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  title: { ...type.heading, color: colors.text, textAlign: 'center' },
  body: { ...type.body, color: colors.textMuted, textAlign: 'center' },
  reticleWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  reticle: {
    width: '62%',
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: 3,
    borderColor: colors.accent,
  },
});
