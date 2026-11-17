import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, type } from '../theme';
import { initials, splitMoney } from '../lib/format';

/* ───────────── Layout ───────────── */

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  background?: string;
}

export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  padded = true,
  edges = ['top'],
  background = colors.bg,
}: ScreenProps) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, padded && styles.padded]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.text} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, padded && styles.padded]}>{children}</View>
  );
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: background }]} edges={edges}>
      {content}
    </SafeAreaView>
  );
}

export function Header({
  title,
  onBack,
  right,
}: {
  title?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>
        {onBack && (
          <TouchableOpacity onPress={onBack} hitSlop={12} accessibilityLabel="Back">
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.headerTitle} numberOfLines={1}>
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
  const bg =
    tone === 'black' ? colors.black : tone === 'accent' ? colors.accent : colors.surface;
  return <View style={[styles.card, { backgroundColor: bg }, style]}>{children}</View>;
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
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
  small,
}: ButtonProps) {
  const palette = {
    primary: { bg: colors.black, fg: colors.white },
    accent: { bg: colors.accent, fg: colors.black },
    secondary: { bg: colors.surface, fg: colors.text },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    ghost: { bg: 'transparent', fg: colors.text },
  }[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: palette.bg, opacity: inactive ? 0.4 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text style={[styles.buttonText, small && { fontSize: 14 }, { color: palette.fg }]}>
          {title}
        </Text>
      )}
    </Pressable>
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
      <ActivityIndicator size="large" color={colors.text} />
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
  open: { bg: colors.warnSoft, fg: colors.warn },
  pending: { bg: colors.warnSoft, fg: colors.warn },
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
      <Text style={[styles.pillText, { color: tone.fg }]}>{status.toUpperCase()}</Text>
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
  return (
    <Text style={[base, { color }]} accessibilityLabel={`${symbol}${whole}.${cents}`}>
      {symbol}
      {whole}
      <Text style={{ fontSize: base.fontSize * 0.45, color: colors.textFaint }}>.{cents}</Text>
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
  const bg = tone === 'accent' ? colors.accent : tone === 'black' ? colors.black : colors.surfaceStrong;
  const fg = tone === 'black' ? colors.white : colors.text;
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
            <Text style={[styles.segmentText, active && { color: colors.white }]}>{o.label}</Text>
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
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
  segmentItemActive: { backgroundColor: colors.black },
  segmentText: { fontSize: 14, fontWeight: '700', color: colors.text },
  keypad: { flexDirection: 'row', flexWrap: 'wrap' },
  key: { width: '33.333%', height: 68, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 30, fontWeight: '600', color: colors.text },
});
