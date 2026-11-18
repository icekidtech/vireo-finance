import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button, ErrorBanner } from './ui';
import FaceGuide from './FaceGuide';
import { colors, spacing, type } from '../theme';

type Props = {
  title?: string;
  /** Receives the photo as base64 JPEG. */
  onCapture: (base64: string) => void;
  onCancel: () => void;
};

/** Full-screen front-camera capture with the face oval. Asks for camera permission itself. */
export default function SelfieCapture({ title = 'Fit your face in the oval', onCapture, onCancel }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await camera.current.takePictureAsync({ base64: true, quality: 0.6, skipProcessing: true });
      if (!photo?.base64) throw new Error('empty');
      onCapture(photo.base64);
    } catch {
      setError('Could not take the photo. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!permission) return <View style={styles.wrap} />;
  if (!permission.granted) {
    return (
      <View style={[styles.wrap, styles.center]}>
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.hint}>Allow the camera to take your verification selfie.</Text>
        {permission.canAskAgain ? <Button title="Allow camera" onPress={requestPermission} /> : null}
        <Button title="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="front" />
      <FaceGuide />
      <View style={styles.overlay}>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint}>Look straight at the camera in good light</Text>
        </View>
        <View />
        <View style={{ alignSelf: 'stretch' }}>
          <ErrorBanner message={error} />
          <Button title="Take selfie" variant="accent" loading={busy} onPress={take} />
          <Button title="Cancel" variant="ghost" onPress={onCancel} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.black },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: spacing.xl, paddingTop: 80, paddingBottom: 48 },
  title: { ...type.title, color: colors.white, textAlign: 'center' },
  hint: { ...type.body, color: colors.white, marginTop: spacing.xs, textAlign: 'center' },
});
