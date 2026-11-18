import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { spacing } from '../theme';

export const RECEIPT_BG = '#0B3A2C';
const LIME = '#D6F047';
const PURPLE = '#C9A7F2';
const INK = '#0B2A22';
const TAB = 22; // how much higher the top-right tab sits than the rest of the card

/** A pill: lime by default, purple for the headline, or tinted for problems. */
export function Pill({ children, tone = 'lime' }: { children: ReactNode; tone?: 'lime' | 'purple' | 'coral' | 'amber' }) {
  const bg = { lime: LIME, purple: PURPLE, coral: '#FF9E94', amber: '#F5C86B' }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={styles.pillText}>{children}</Text>
    </View>
  );
}

/**
 * Frosted-glass card with a raised tab at the top right, a lime glow behind it and a lime arc peeking
 * out above. Sized to its content: put the receipt rows inside.
 */
export default function ReceiptCard({ children }: { children: ReactNode }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: Math.round(width), h: Math.round(height) });
  };
  const { w, h } = size;
  const r = 28;
  const shape = w
    ? [
        `M ${r} ${TAB}`,
        `L ${w * 0.56} ${TAB}`,
        `Q ${w * 0.6} ${TAB} ${w * 0.615} ${TAB / 2}`,
        `Q ${w * 0.63} 0 ${w * 0.68} 0`,
        `L ${w - r} 0`,
        `Q ${w} 0 ${w} ${r}`,
        `L ${w} ${h - r}`,
        `Q ${w} ${h} ${w - r} ${h}`,
        `L ${r} ${h}`,
        `Q 0 ${h} 0 ${h - r}`,
        `L 0 ${TAB + r}`,
        `Q 0 ${TAB} ${r} ${TAB}`,
        'Z',
      ].join(' ')
    : '';

  return (
    <View style={{ marginTop: 34, marginBottom: spacing.xl }}>
      {w > 0 && (
        <Svg width={w} height={h} style={[StyleSheet.absoluteFill, { overflow: 'visible' }]}>
          <Defs>
            <RadialGradient id="glow" cx="0.3" cy="0.5" rx="0.6" ry="0.5">
              <Stop offset="0" stopColor={LIME} stopOpacity={0.6} />
              <Stop offset="0.6" stopColor="#7FD66A" stopOpacity={0.22} />
              <Stop offset="1" stopColor="#0B3A2C" stopOpacity={0} />
            </RadialGradient>
            <ClipPath id="receiptClip">
              <Path d={shape} />
            </ClipPath>
          </Defs>
          {/* lime arc and disc peeking out behind the card */}
          <Circle cx={w * 0.2} cy={TAB - 4} r={26} fill={LIME} />
          <Path d={`M ${w * 0.12} ${TAB + 6} C ${w * 0.1} -46 ${w * 0.5} -58 ${w * 0.64} -8`} stroke={LIME} strokeWidth={18} strokeLinecap="round" fill="none" />
          <Path d={shape} fill="rgba(255,255,255,0.1)" />
          <Path d={shape} fill="url(#glow)" clipPath="url(#receiptClip)" />
          <Path d={shape} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1.2} />
        </Svg>
      )}
      <View onLayout={onLayout} style={styles.content}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: TAB + 22, paddingBottom: 26, paddingHorizontal: 24 },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  pillText: { color: INK, fontSize: 16, fontWeight: '600' },
});
