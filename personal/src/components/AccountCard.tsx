import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { ClipPath, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { spacing } from '../theme';

type Props = {
  /** Small line at the top, e.g. "Account number". */
  label: string;
  /** The big number. Null shows `emptyText` instead. */
  number: string | null;
  emptyText?: string;
  leftLabel?: string;
  leftValue?: string;
  rightLabel?: string;
  rightValue?: string;
  buttonTitle: string;
  onPress: () => void;
  busy?: boolean;
};

const INK = '#0B1F12';

/**
 * Account card: an aqua-to-lime gradient card with a raised tab on the top left, flowing
 * lines on the right and a black action button in a notch at the bottom right.
 */
export default function AccountCard({
  label,
  number,
  emptyText = 'No account number yet',
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
  buttonTitle,
  onPress,
  busy,
}: Props) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));

  const H = Math.max(Math.round(w * 0.62), 210);
  const r = 26;
  const step = H * 0.09; // the right-hand top edge sits a little lower than the tab
  const bodyBottom = H * 0.84; // bottom edge on the left
  const x = (p: number) => w * p;
  const body = w
    ? [
        `M ${r} 0`,
        `L ${x(0.47)} 0`,
        `Q ${x(0.54)} 0 ${x(0.56)} ${step * 0.55}`,
        `Q ${x(0.58)} ${step} ${x(0.65)} ${step}`,
        `L ${w - r} ${step}`,
        `Q ${w} ${step} ${w} ${step + r}`,
        `L ${w} ${H - r}`,
        `Q ${w} ${H} ${w - r} ${H}`,
        `L ${x(0.66)} ${H}`,
        `Q ${x(0.58)} ${H} ${x(0.55)} ${bodyBottom + (H - bodyBottom) * 0.35}`,
        `Q ${x(0.52)} ${bodyBottom} ${x(0.44)} ${bodyBottom}`,
        `L ${r} ${bodyBottom}`,
        `Q 0 ${bodyBottom} 0 ${bodyBottom - r}`,
        `L 0 ${r}`,
        `Q 0 0 ${r} 0`,
        'Z',
      ].join(' ')
    : '';

  // Flowing lines on the right, each stepping down once before running off the edge.
  // Kept to the right of the number and the text so nothing is struck through.
  const lines = [0.2, 0.29, 0.38, 0.47].map((fy, i) => {
    const y = H * fy;
    const a = w * (0.86 - i * 0.04);
    return `M ${a - w * 0.13} ${y + 12} H ${a} C ${a + 14} ${y + 12} ${a + 12} ${y} ${a + 28} ${y} H ${w}`;
  });

  return (
    <View onLayout={onLayout} style={[styles.glow, { height: w ? H : 210 }]}>
      {w > 0 && (
        <>
          <Svg width={w} height={H} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="acct" x1="0" y1="0.05" x2="1" y2="0.95">
                <Stop offset="0" stopColor="#52DCEB" />
                <Stop offset="0.45" stopColor="#8CE79C" />
                <Stop offset="1" stopColor="#C8F54B" />
              </LinearGradient>
              <ClipPath id="acctClip">
                <Path d={body} />
              </ClipPath>
            </Defs>
            <Path d={body} fill="url(#acct)" />
            {lines.map((d, i) => (
              <Path key={i} d={d} stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={1.6} fill="none" clipPath="url(#acctClip)" />
            ))}
          </Svg>

          <Text style={[styles.label, { left: 24, top: 22 }]}>{label}</Text>
          <Text
            numberOfLines={1}
            selectable
            style={[styles.number, { left: 24, top: 46, fontSize: number ? Math.min(36, Math.floor((w * 0.78) / 10.5)) : 20 }]}
          >
            {number ?? emptyText}
          </Text>

          {leftLabel ? (
            <View style={{ position: 'absolute', left: 24, top: H * 0.52, maxWidth: '40%' }}>
              <Text style={styles.small}>{leftLabel}</Text>
              <Text numberOfLines={1} style={styles.value}>
                {leftValue}
              </Text>
            </View>
          ) : null}
          {rightLabel ? (
            <View style={{ position: 'absolute', left: w * 0.46, top: H * 0.52, maxWidth: '44%' }}>
              <Text style={styles.small}>{rightLabel}</Text>
              <Text numberOfLines={1} style={styles.value}>
                {rightValue}
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={onPress}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, { right: 22, bottom: 14, opacity: pressed || busy ? 0.8 : 1 }]}
          >
            {busy ? <ActivityIndicator color="#8DEBC8" /> : <Text style={styles.buttonText}>{buttonTitle}</Text>}
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // A soft lime glow around the card (web and iOS; Android ignores the colour).
  glow: {
    width: '100%',
    marginBottom: spacing.md,
    shadowColor: '#B6F03C',
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 4 },
  },
  label: { position: 'absolute', color: INK, fontSize: 15, fontWeight: '600' },
  number: { position: 'absolute', color: INK, fontWeight: '800', letterSpacing: 1.5 },
  small: { color: INK, opacity: 0.8, fontSize: 13, fontWeight: '500' },
  value: { color: INK, fontSize: 17, fontWeight: '700', marginTop: 2 },
  button: {
    position: 'absolute',
    backgroundColor: '#050505',
    borderRadius: 18,
    minWidth: 130,
    height: 46,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#8DEBC8', fontSize: 16, fontWeight: '700' },
});
