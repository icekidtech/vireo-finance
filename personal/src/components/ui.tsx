import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, type } from '../theme';
import { initials, splitMoney } from '../lib/format';
import { FadeIn, Glow } from './motion';
import Logo from './Logo';
import { refreshAll } from '../lib/refreshBus';

/* ───────────── Layout ───────────── */

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  background?: string;
  /** Vertically centre the content (sign-in / short forms), still scrolling if it overflows. */
  center?: boolean;
}

/** How far (in px, after damping) the user must pull before letting go refreshes. */
const PULL_THRESHOLD = 64;

export function Screen({
  children,
  scroll = true,
  // Kept so existing screens compile. Pull-to-refresh is app-wide now and refreshes every
  // screen that loads data, so a screen's own refresh handler is no longer needed.
  refreshing: _refreshing,
  onRefresh: _onRefresh,
  padded = true,
  edges = ['top'],
  background = colors.bg,
  center = false,
}: ScreenProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [pull, setPull] = useState(0);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const busy = useRef(false);

  const trigger = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRefreshingAll(true);
    try {
      await refreshAll();
    } finally {
      busy.current = false;
      setRefreshingAll(false);
      setPull(0);
    }
  }, []);
  const triggerRef = useRef(trigger);
  triggerRef.current = trigger;

  // Web has no native pull-to-refresh (RefreshControl does nothing there), so drag-down at the top is handled here.
  useEffect(() => {
    if (Platform.OS !== 'web' || !scroll) return;
    const node = (scrollRef.current as unknown as { getScrollableNode?: () => HTMLElement } | null)?.getScrollableNode?.();
    if (!node) return;
    // Stop the browser's own pull-to-reload gesture from taking over (that is what resets the page).
    node.style.overscrollBehaviorY = 'contain';
    let startY = 0;
    let tracking = false;
    let dist = 0;
    const start = (y: number) => {
      if (busy.current || node.scrollTop > 0) return;
      startY = y;
      tracking = true;
      dist = 0;
    };
    const move = (y: number) => {
      if (!tracking) return;
      const dy = y - startY;
      if (node.scrollTop > 0 || dy <= 0) {
        if (dist !== 0) {
          dist = 0;
          setPull(0);
        }
        return;
      }
      dist = Math.min(dy * 0.5, 110);
      setPull(dist);
    };
    const end = () => {
      if (!tracking) return;
      tracking = false;
      if (dist >= PULL_THRESHOLD) void triggerRef.current();
      else setPull(0);
      dist = 0;
    };
    const ts = (e: TouchEvent) => start(e.touches[0].clientY);
    const tm = (e: TouchEvent) => move(e.touches[0].clientY);
    const md = (e: MouseEvent) => e.button === 0 && start(e.clientY);
    const mm = (e: MouseEvent) => move(e.clientY);
    node.addEventListener('touchstart', ts, { passive: true });
    node.addEventListener('touchmove', tm, { passive: true });
    node.addEventListener('touchend', end);
    node.addEventListener('touchcancel', end);
    node.addEventListener('mousedown', md);
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', end);
    return () => {
      node.removeEventListener('touchstart', ts);
      node.removeEventListener('touchmove', tm);
      node.removeEventListener('touchend', end);
      node.removeEventListener('touchcancel', end);
      node.removeEventListener('mousedown', md);
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('mouseup', end);
    };
  }, [scroll]);

  const indicatorHeight = refreshingAll ? 56 : pull;
  const body = <FadeIn style={scroll ? undefined : styles.fill}>{children}</FadeIn>;
  const content = scroll ? (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[
        styles.scrollContent,
        styles.column,
        padded && styles.padded,
        center && styles.centered,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      // Phones: the native pull-to-refresh spinner. Web draws its own indicator below.
      refreshControl={
        Platform.OS === 'web' ? undefined : (
          <RefreshControl refreshing={refreshingAll} onRefresh={trigger} tintColor={colors.text} />
        )
      }
    >
      {Platform.OS === 'web' && indicatorHeight > 0 ? (
        <View style={{ height: indicatorHeight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {refreshingAll ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>
              {pull >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
            </Text>
          )}
        </View>
      ) : null}
      {body}
    </ScrollView>
  ) : (
    <View style={[styles.fill, styles.column, padded && styles.padded]}>{body}</View>
  );
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: background, overflow: 'hidden' }]} edges={edges}>
      {background === colors.bg && (
        <>
          <Glow size={760} intensity={0.035} pulse style={{ top: -380, alignSelf: 'center', left: '50%', marginLeft: -380 }} />
          <Glow size={420} intensity={0.03} color={colors.accentDeep} style={{ bottom: -200, right: -160 }} />
        </>
      )}
      {content}
    </SafeAreaView>
  );
}

/**
 * Sign-in / onboarding frame: vertically centred, with the form in a card on
 * wide screens and edge-to-edge on phones. Scrolls when the keyboard or a short
 * window leaves too little room.
 */
export function AuthLayout({ children, onBack }: { children: ReactNode; onBack?: () => void }) {
  const { width } = useWindowDimensions();
  const wide = width >= 700;
  return (
    <Screen center>
      <View style={wide ? styles.authCard : styles.authFlat}>
        <View style={styles.authTop}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} hitSlop={12} accessibilityLabel="Back">
              <Text style={[styles.back, { marginBottom: 0 }]}>‹</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}
          <Logo height={30} />
          <View style={{ width: 24 }} />
        </View>
        {children}
      </View>
    </Screen>
  );
}

/**
 * Font size that keeps `text` on one line within the available width. Used for
 * hero amounts, because adjustsFontSizeToFit is not honoured on web.
 */
export function useFitFont(
  text: string,
  base: number,
  horizontalPadding = 2 * spacing.xl,
  /** Fraction of the content column the text may use (0.5 for a half-width card). */
  share = 1,
): number {
  const { width } = useWindowDimensions();
  const available = Math.min(width, 520) * share - horizontalPadding;
  const widest = Math.max(text.length, 1) * 0.6; // average glyph ≈ 0.6em for heavy numerals
  // Floor is proportional so small base sizes can still shrink to fit.
  return Math.max(Math.max(12, Math.round(base * 0.4)), Math.min(base, Math.floor(available / widest)));
}

/** Single-line text that shrinks to fit its box instead of wrapping or overflowing. */
export function FitText({
  children,
  base,
  padding,
  share,
  style,
}: {
  children: string;
  base: number;
  padding?: number;
  share?: number;
  style?: StyleProp<TextStyle>;
}) {
  const fontSize = useFitFont(children, base, padding, share);
  return (
    <Text numberOfLines={1} style={[style, { fontSize }]}>
      {children}
    </Text>
  );
}

export function Header({
  title,
  onBack,
  right,
  color = colors.text,
}: {
  title?: string;
  onBack?: () => void;
  right?: ReactNode;
  /** Override on coloured (e.g. green) screens where the default text colour has no contrast. */
  color?: string;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>
        {onBack && (
          <TouchableOpacity onPress={onBack} hitSlop={12} accessibilityLabel="Back">
            <Text style={[styles.back, { color }]}>‹</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={[styles.headerTitle, { color }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

export function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

export function Card({
  children,
  style,
  tone = 'surface',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'surface' | 'black' | 'accent';
}) {
  const bg = tone === 'black' ? '#181818' : tone === 'accent' ? colors.accent : colors.surface;
  const hero = tone === 'black' ? styles.heroCard : null;
  return <View style={[styles.card, { backgroundColor: bg }, hero, style]}>{children}</View>;
}

/* ───────────── Buttons ───────────── */

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  /** Tighter padding and type for buttons sharing a row, so titles stay on one line. */
  dense?: boolean;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
  small,
  dense,
}: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = (to: number) =>
    Animated.spring(scale, { toValue: to, friction: 6, tension: 200, useNativeDriver: Platform.OS !== 'web' }).start();
  const palette = {
    primary: { bg: colors.white, fg: colors.black },
    accent: { bg: colors.accent, fg: colors.black },
    secondary: { bg: colors.surface, fg: colors.text },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    ghost: { bg: 'transparent', fg: colors.text },
  }[variant];
  const inactive = disabled || loading;
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style as object]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => press(0.96)}
        onPressOut={() => press(1)}
        disabled={inactive}
        style={[
          styles.button,
          small && styles.buttonSmall,
          dense && { paddingHorizontal: spacing.sm },
          { backgroundColor: palette.bg, opacity: inactive ? 0.4 : 1 },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={palette.fg} />
        ) : (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={[styles.buttonText, small && { fontSize: 14 }, dense && { fontSize: 15 }, { color: palette.fg }]}
          >
            {title}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

/* ───────────── Inputs ───────────── */

export function Field({
  label,
  hint,
  ...props
}: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textFaint}
        {...props}
        style={[styles.input, props.style]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/* ───────────── Feedback ───────────── */

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function NoticeBanner({
  message,
  tone = 'warn',
}: {
  message: string | null;
  tone?: 'warn' | 'success';
}) {
  if (!message) return null;
  const bg = tone === 'warn' ? colors.warnSoft : colors.accentSoft;
  const fg = tone === 'warn' ? colors.warn : colors.accentDark;
  return (
    <View style={[styles.errorBanner, { backgroundColor: bg }]}>
      <Text style={[styles.errorText, { color: fg }]}>{message}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.accent} />
    </View>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </View>
  );
}

/* ───────────── Status ───────────── */

const PILL_TONES: Record<string, { bg: string; fg: string }> = {
  paid: { bg: colors.accentSoft, fg: colors.accentDark },
  completed: { bg: colors.accentSoft, fg: colors.accentDark },
  verified: { bg: colors.accentSoft, fg: colors.accentDark },
  set: { bg: colors.accentSoft, fg: colors.accentDark },
  not_set: { bg: colors.warnSoft, fg: colors.warn },
  open: { bg: colors.warnSoft, fg: colors.warn },
  pending: { bg: colors.warnSoft, fg: colors.warn },
  not_started: { bg: colors.surfaceStrong, fg: colors.textMuted },
  processing: { bg: colors.warnSoft, fg: colors.warn },
  draft: { bg: colors.surface, fg: colors.textMuted },
  expired: { bg: colors.surface, fg: colors.textMuted },
  cancelled: { bg: colors.surface, fg: colors.textMuted },
  failed: { bg: colors.dangerSoft, fg: colors.danger },
  rejected: { bg: colors.dangerSoft, fg: colors.danger },
};

export function StatusPill({ status }: { status: string }) {
  const tone = PILL_TONES[status] ?? { bg: colors.surface, fg: colors.textMuted };
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.pillText, { color: tone.fg }]}>{status.replace(/_/g, ' ').toUpperCase()}</Text>
    </View>
  );
}

/* ───────────── Money & rows ───────────── */

export function BigMoney({
  amount,
  size = 'hero',
  color = colors.text,
  symbol = '₦',
}: {
  amount: string | null | undefined;
  size?: 'hero' | 'display';
  color?: string;
  symbol?: string;
}) {
  const { whole, cents } = splitMoney(amount);
  const base = size === 'hero' ? type.hero : type.display;
  // Hero amounts sit inside a padded card, so reserve extra horizontal room.
  const fontSize = useFitFont(`${symbol}${whole}.${cents}`, base.fontSize, size === 'hero' ? 4 * spacing.xl : 2 * spacing.xl);
  return (
    <Text
      numberOfLines={1}
      style={[base, { color, fontSize }]}
      accessibilityLabel={`${symbol}${whole}.${cents}`}
    >
      {symbol}
      {whole}
      <Text style={{ fontSize: fontSize * 0.45, color: colors.textFaint }}>.{cents}</Text>
    </Text>
  );
}

export function Avatar({
  label,
  size = 44,
  tone = 'surface',
}: {
  label: string;
  size?: number;
  tone?: 'surface' | 'accent' | 'black';
}) {
  const bg = tone === 'accent' ? colors.accent : tone === 'black' ? colors.white : colors.surfaceStrong;
  const fg = tone === 'accent' || tone === 'black' ? colors.black : colors.text;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontWeight: '800', color: fg, fontSize: size * 0.36 }}>{initials(label)}</Text>
    </View>
  );
}

export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  trailingSub,
  onPress,
}: {
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  trailingSub?: ReactNode;
  onPress?: () => void;
}) {
  const body = (
    <View style={styles.row}>
      {leading ? <View style={{ marginRight: spacing.md }}>{leading}</View> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', marginLeft: spacing.md }}>
        {typeof trailing === 'string' ? <Text style={styles.rowTrailing}>{trailing}</Text> : trailing}
        {trailingSub}
      </View>
    </View>
  );
  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6}>
      {body}
    </TouchableOpacity>
  ) : (
    body
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <TouchableOpacity
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
          >
            <Text style={[styles.segmentText, active && { color: colors.black }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ───────────── Keypad (Cash App-style amount entry) ───────────── */

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

/**
 * Applies a key press to an amount string, enforcing the API's amount shape
 * (up to 2 decimals, no leading zeros, bounded length).
 */
export function applyKey(current: string, key: string): string {
  if (key === '⌫') return current.slice(0, -1);
  if (key === '.') {
    if (current.includes('.')) return current;
    return current === '' ? '0.' : `${current}.`;
  }
  if (current.includes('.') && current.split('.')[1].length >= 2) return current;
  if (current === '0') return key;
  if (current.replace('.', '').length >= 12) return current;
  return current + key;
}

export function Keypad({ onKey }: { onKey: (key: string) => void }) {
  return (
    <View style={styles.keypad}>
      {KEYS.map((k) => (
        <TouchableOpacity key={k} style={styles.key} onPress={() => onKey(k)} activeOpacity={0.5}>
          <Text style={styles.keyText}>{k}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/**
 * On wide screens (web, tablets) the app is a centred phone-width column
 * instead of stretching edge to edge.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  if (Platform.OS !== 'web' || width < 700) return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceStrong, alignItems: 'center' }}>
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 480,
          backgroundColor: colors.bg,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  authCard: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxl,
  },
  authFlat: { width: '100%' },
  authTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xl },
  authLogo: { fontSize: 26, fontWeight: '900', letterSpacing: -1.2, color: colors.text },
  centered: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.xl },
  scrollContent: { paddingBottom: spacing.xxl * 2 },
  padded: { paddingHorizontal: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: -spacing.xs,
  },
  headerSide: { width: 56 },
  headerTitle: { flex: 1, textAlign: 'center', ...type.bodyStrong, color: colors.text },
  back: { fontSize: 38, lineHeight: 40, color: colors.text, fontWeight: '300' },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionTitle: { ...type.heading, color: colors.text },
  card: { borderRadius: radius.lg, padding: spacing.xl, marginBottom: spacing.md },
  heroCard: { borderWidth: 1, borderColor: 'rgba(93,214,44,0.35)' },
  button: {
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  buttonSmall: { height: 40, paddingHorizontal: spacing.lg },
  buttonText: { fontSize: 17, fontWeight: '700' },
  fieldLabel: { ...type.label, color: colors.textMuted, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 15,
    fontSize: 17,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs },
  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  errorText: { ...type.body, color: colors.danger },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl * 1.5 },
  emptyTitle: { ...type.heading, color: colors.text },
  emptyBody: { ...type.body, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },
  pill: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  rowTitle: { ...type.bodyStrong, color: colors.text },
  rowSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  rowTrailing: { ...type.bodyStrong, color: colors.text },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: 4,
  },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: 'center' },
  segmentItemActive: { backgroundColor: colors.accent },
  segmentText: { fontSize: 14, fontWeight: '700', color: colors.text },
  keypad: { flexDirection: 'row', flexWrap: 'wrap' },
  key: { width: '33.333%', height: 68, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 30, fontWeight: '600', color: colors.text },
});
