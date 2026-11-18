import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, ClipPath, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { usePersistedState } from '../lib/sessionState';
import { colors, spacing } from '../theme';

type Props = {
  /** Already formatted, e.g. "₦2,000.00". */
  amount: string;
  title: string;
  subtitle: string;
  label?: string;
  /** Small lines under the subtitle (e.g. "₦500.00 on hold"). */
  notes?: string[];
};

const INK = '#050505';
const LIP = 16; // how much of the green lip and the bottom layer show under the card
const RADIUS = 34;

/**
 * Balance card: a black card with a glossy green panel (with a curved notch) on top, a green
 * lip and a second layer under it. The toggle hides the balance on screen.
 */
export default function BalanceCard({ amount, title, subtitle, label = 'TOTAL BALANCE', notes = [] }: Props) {
  const [w, setW] = useState(0);
  const [visible, setVisible] = usePersistedState('ui.balanceVisible', true);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));

  const H = Math.max(Math.round(w * 0.74), 200);
  const topH = H - LIP - 10; // height of the black card itself
  const pad = 14;
  const r = 30;
  const x0 = pad;
  const x1 = w - pad;
  const left = topH * 0.4; // panel's bottom edge on the left
  const right = topH * 0.56; // ...and on the right (the notch)
  const panel = w
    ? [
        `M ${x0 + r} ${pad}`,
        `L ${x1 - r} ${pad}`,
        `Q ${x1} ${pad} ${x1} ${pad + r}`,
        `L ${x1} ${right - r}`,
        `Q ${x1} ${right} ${x1 - r} ${right}`,
        `L ${w * 0.66} ${right}`,
        `C ${w * 0.56} ${right} ${w * 0.52} ${left} ${w * 0.42} ${left}`,
        `L ${x0 + r} ${left}`,
        `Q ${x0} ${left} ${x0} ${left - r}`,
        `L ${x0} ${pad + r}`,
        `Q ${x0} ${pad} ${x0 + r} ${pad}`,
        'Z',
      ].join(' ')
    : '';

  const shown = visible ? amount : '₦ ••••••';
  const fontSize = Math.max(20, Math.min(44, Math.floor((w * 0.62) / (shown.length * 0.56))));

  return (
    <View onLayout={onLayout} style={{ width: '100%', height: w ? H : 200, marginBottom: spacing.md }}>
      {w > 0 && (
        <>
          <Svg width={w} height={H} style={StyleSheet.absoluteFill}>
            <Defs>
              {/* Light on the left (behind the card mark), deepening to the right so white text stays readable. */}
              <LinearGradient id="gloss" x1="0" y1="0" x2="1" y2="0.35">
                <Stop offset="0" stopColor="#7EDB45" />
                <Stop offset="0.24" stopColor="#B4EC5C" />
                <Stop offset="0.5" stopColor="#3FAE1C" />
                <Stop offset="1" stopColor="#1B5A0E" />
              </LinearGradient>
              <LinearGradient id="sheen" x1="0" y1="0" x2="1" y2="0.55">
                <Stop offset="0.05" stopColor="#FFFFFF" stopOpacity="0" />
                <Stop offset="0.2" stopColor="#FFFFFF" stopOpacity="0.2" />
                <Stop offset="0.34" stopColor="#FFFFFF" stopOpacity="0" />
              </LinearGradient>
              <LinearGradient id="lip" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#6FD838" />
                <Stop offset="0.5" stopColor="#B5EA3C" />
                <Stop offset="1" stopColor="#4FBF1E" />
              </LinearGradient>
              <ClipPath id="panelClip">
                <Path d={panel} />
              </ClipPath>
            </Defs>
            {/* bottom layer, green lip, then the card itself */}
            <Rect x={0} y={LIP + 10} width={w} height={H - LIP - 10} rx={RADIUS} fill={INK} />
            <Rect x={0} y={LIP - 2} width={w} height={H - LIP - 8} rx={RADIUS} fill="url(#lip)" />
            <Rect x={0} y={0} width={w} height={topH} rx={RADIUS} fill={INK} />
            <Path d={panel} fill="url(#gloss)" />
            <Rect x={0} y={0} width={w} height={topH} fill="url(#sheen)" clipPath="url(#panelClip)" />
            <Circle cx={pad + 34} cy={pad + 36} r={17} fill="rgba(255,255,255,0.28)" stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} />
            <Circle cx={pad + 56} cy={pad + 36} r={17} fill="rgba(255,255,255,0.28)" stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} />
          </Svg>

          <View style={[styles.amountBox, { top: pad + 12, right: pad + 14 }]} pointerEvents="none">
            <Text numberOfLines={1} style={[styles.amount, { fontSize }]} accessibilityLabel={visible ? amount : 'Balance hidden'}>
              {shown}
            </Text>
            <Text style={styles.label}>{label}</Text>
          </View>

          <View style={[styles.info, { left: pad + 14, top: left + 22 }]} pointerEvents="none">
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
            {notes.map((n) => (
              <Text key={n} style={styles.note} numberOfLines={2}>
                {n}
              </Text>
            ))}
          </View>

          <Pressable
            onPress={() => setVisible(!visible)}
            accessibilityRole="switch"
            accessibilityState={{ checked: visible }}
            accessibilityLabel="Show balance"
            hitSlop={12}
            style={[styles.toggle, { right: pad + 14, top: topH - 56, backgroundColor: visible ? colors.accent : '#3A3A3A' }]}
          >
            <View style={[styles.knob, { alignSelf: visible ? 'flex-end' : 'flex-start' }]} />
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  amountBox: { position: 'absolute', alignItems: 'flex-end', maxWidth: '66%' },
  amount: {
    color: '#FFFFFF',
    fontWeight: '400',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  info: { position: 'absolute', maxWidth: '62%' },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  subtitle: { color: '#9A9A9A', fontSize: 18, fontWeight: '400', marginTop: 2 },
  note: { color: '#808080', fontSize: 12, marginTop: 6 },
  toggle: { position: 'absolute', width: 52, height: 30, borderRadius: 15, padding: 3, justifyContent: 'center' },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#F4FBEA' },
});
