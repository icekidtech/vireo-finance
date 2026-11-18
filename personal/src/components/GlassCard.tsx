import { useId, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

type Props = {
  label: string;
  /** The big value, e.g. the account number. */
  value: string;
  leftLabel?: string;
  leftValue?: string;
  rightLabel?: string;
  rightValue?: string;
  buttonTitle: string;
  onPress: () => void;
};

/**
 * Dark green frosted card with a bright green glow at the bottom and a soft green halo
 * around it. Used to show an account number inside the chat.
 */
export default function GlassCard({ label, value, leftLabel, leftValue, rightLabel, rightValue, buttonTitle, onPress }: Props) {
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const onLayout = (e: LayoutChangeEvent) => {
    setW(Math.round(e.nativeEvent.layout.width));
    setH(Math.round(e.nativeEvent.layout.height));
  };

  return (
    <View style={styles.halo}>
      <View style={styles.card} onLayout={onLayout}>
        {w > 0 && h > 0 && (
          <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <LinearGradient id={`base${uid}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#0B2A10" />
                <Stop offset="0.55" stopColor="#14551A" />
                <Stop offset="1" stopColor="#1F9A1E" />
              </LinearGradient>
              <RadialGradient id={`glow${uid}`} cx="0.5" cy="1.05" rx="0.75" ry="0.6">
                <Stop offset="0" stopColor="#3CD02E" stopOpacity="0.55" />
                <Stop offset="1" stopColor="#3CD02E" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect width={w} height={h} fill={`url(#base${uid})`} />
            <Rect width={w} height={h} fill={`url(#glow${uid})`} />
          </Svg>
        )}

        <Text style={styles.label}>{label}</Text>
        <Text selectable numberOfLines={1} adjustsFontSizeToFit style={styles.value}>
          {value}
        </Text>

        <View style={styles.row}>
          {leftLabel ? (
            <View style={styles.cell}>
              <Text style={styles.small}>{leftLabel}</Text>
              <Text numberOfLines={1} style={styles.cellValue}>
                {leftValue}
              </Text>
            </View>
          ) : null}
          {rightLabel ? (
            <View style={styles.cell}>
              <Text style={styles.small}>{rightLabel}</Text>
              <Text numberOfLines={2} style={styles.cellValue}>
                {rightValue}
              </Text>
            </View>
          ) : null}
        </View>

        <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.button, { opacity: pressed ? 0.75 : 1 }]}>
          <Text style={styles.buttonText}>{buttonTitle}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: {
    width: '100%',
    shadowColor: '#4CD22E',
    shadowOpacity: 0.55,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
  },
  card: {
    overflow: 'hidden',
    borderRadius: 34,
    borderWidth: 1.5,
    borderColor: 'rgba(120,230,100,0.35)',
    padding: 22,
  },
  label: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
  value: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 6,
    textShadowColor: 'rgba(255,255,255,0.55)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
  row: { flexDirection: 'row', gap: 16, marginTop: 22 },
  cell: { flex: 1 },
  small: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '500' },
  cellValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 2 },
  button: {
    alignSelf: 'flex-end',
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 18,
    paddingHorizontal: 26,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
