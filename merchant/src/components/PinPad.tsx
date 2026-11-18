import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

type Props = {
  title: string;
  subtitle?: string;
  /** Shown under the dots (e.g. "Wrong PIN. 4 attempts left."). */
  error?: string | null;
  /** Called as soon as 4 digits are entered. Return after handling; the pad clears itself. */
  onComplete: (pin: string) => void;
  disabled?: boolean;
};

const ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', '⌫']];

/** Four dots and a numeric keypad. The digits are never shown on screen. */
export default function PinPad({ title, subtitle, error, onComplete, disabled }: Props) {
  const [pin, setPin] = useState('');

  const press = (key: string) => {
    if (disabled || key === '') return;
    if (key === '⌫') return setPin((p) => p.slice(0, -1));
    const next = (pin + key).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      // Let the fourth dot render, then hand over and clear for the next attempt.
      setTimeout(() => {
        onComplete(next);
        setPin('');
      }, 120);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.dots} accessibilityLabel={`${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotOn]} />
        ))}
      </View>
      <Text style={styles.error}>{error ?? ' '}</Text>
      <View style={styles.pad}>
        {ROWS.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((k, i) => (
              <TouchableOpacity
                key={`${r}-${i}`}
                style={[styles.key, k === '' && { opacity: 0 }]}
                disabled={disabled || k === ''}
                onPress={() => press(k)}
                activeOpacity={0.5}
                accessibilityRole="button"
                accessibilityLabel={k === '⌫' ? 'Delete' : k}
              >
                <Text style={styles.keyText}>{k}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', width: '100%' },
  title: { ...type.title, color: colors.text, textAlign: 'center' },
  subtitle: { ...type.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
  dots: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xl },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.textMuted },
  dotOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  error: { ...type.caption, color: colors.danger, marginTop: spacing.md, minHeight: 18, textAlign: 'center' },
  pad: { marginTop: spacing.lg, width: '100%', maxWidth: 320, gap: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  key: {
    width: 84,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { ...type.title, color: colors.text },
});
