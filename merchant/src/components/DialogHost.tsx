import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { registerDialogHost, type DialogButton, type DialogRequest } from '../lib/dialog';
import { colors, radius, spacing, type } from '../theme';

/** In-app popup for showAlert on web. Mount once, near the app root. */
export default function DialogHost() {
  const [request, setRequest] = useState<DialogRequest | null>(null);

  useEffect(() => {
    registerDialogHost(setRequest);
    return () => registerDialogHost(null);
  }, []);

  if (!request) return null;

  const close = () => setRequest(null);
  const choose = (button: DialogButton) => {
    close();
    void button.onPress?.();
  };
  const cancel = request.buttons.find((b) => b.style === 'cancel');
  // Cancel last, the rest in order, as on iOS.
  const ordered = [...request.buttons.filter((b) => b.style !== 'cancel'), ...(cancel ? [cancel] : [])];

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => (cancel ? choose(cancel) : close())}>
      <Pressable style={styles.backdrop} onPress={() => (cancel ? choose(cancel) : close())}>
        {/* Stops taps inside the card from reaching the backdrop. */}
        <Pressable style={styles.card} onPress={() => undefined} accessibilityRole="alert">
          <Text style={styles.title}>{request.title}</Text>
          {request.message ? <Text style={styles.message}>{request.message}</Text> : null}
          <View style={styles.buttons}>
            {ordered.map((b, i) => (
              <Pressable
                key={`${b.text}-${i}`}
                onPress={() => choose(b)}
                style={({ pressed }) => [
                  styles.button,
                  b.style === 'destructive' && styles.destructive,
                  b.style === 'cancel' && styles.cancel,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text
                  style={[
                    styles.buttonText,
                    b.style === 'destructive' && { color: colors.danger },
                    b.style !== 'destructive' && b.style !== 'cancel' && { color: colors.black },
                  ]}
                >
                  {b.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  title: { ...type.heading, color: colors.text, textAlign: 'center' },
  message: { ...type.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
  buttons: { marginTop: spacing.xl, gap: spacing.sm },
  button: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destructive: { backgroundColor: colors.dangerSoft },
  cancel: { backgroundColor: colors.surfaceStrong },
  buttonText: { ...type.bodyStrong, color: colors.text },
});
