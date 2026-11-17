import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Button } from './ui';
import { colors, radius, spacing, type } from '../theme';

export interface LandingContent {
  headline: string;
  sub: string;
  primaryCta: string;
  secondaryCta: string;
  features: { title: string; body: string; tag?: string }[];
  stepsTitle: string;
  steps: { title: string; body: string }[];
  securityTitle: string;
  security: { title: string; body: string }[];
  closing: string;
}

interface Props {
  content: LandingContent;
  onPrimary: () => void;
  onSecondary: () => void;
}

const MAX_WIDTH = 1120;

/** Responsive marketing page: columns on wide screens, a single stack on narrow ones. */
export default function Landing({ content, onPrimary, onSecondary }: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const gutter = width >= 600 ? spacing.xxl : spacing.xl;
  const inner = [styles.inner, { paddingHorizontal: gutter }];

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ backgroundColor: colors.bg }}>
      {/* Nav */}
      <View style={inner}>
        <View style={styles.nav}>
          <Text style={styles.logo}>vireo</Text>
          <TouchableOpacity onPress={onSecondary} hitSlop={12}>
            <Text style={styles.navLink}>{content.secondaryCta}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Hero */}
      <View style={inner}>
        <View style={[styles.hero, wide && styles.heroWide]}>
          <View style={{ flex: wide ? 1.15 : undefined }}>
            <Text style={[styles.headline, wide && { fontSize: 68, lineHeight: 70 }]}>{content.headline}</Text>
            <Text style={styles.sub}>{content.sub}</Text>
            <View style={styles.ctaRow}>
              <Button title={content.primaryCta} variant="accent" onPress={onPrimary} style={styles.cta} />
              <Button title={content.secondaryCta} variant="secondary" onPress={onSecondary} style={styles.cta} />
            </View>
          </View>
          {wide && (
            <View style={{ flex: 0.85, alignItems: 'center' }}>
              <View style={styles.art}>
                <Text style={styles.artGlyph}>₦</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Features */}
      <View style={inner}>
        <View style={[styles.grid, wide && styles.gridWide]}>
          {content.features.map((f) => (
            <View key={f.title} style={[styles.card, wide && styles.cardWide]}>
              {f.tag ? <Text style={styles.tag}>{f.tag.toUpperCase()}</Text> : null}
              <Text style={styles.cardTitle}>{f.title}</Text>
              <Text style={styles.cardBody}>{f.body}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* How it works */}
      <View style={inner}>
        <Text style={styles.sectionTitle}>{content.stepsTitle}</Text>
        <View style={[styles.grid, wide && styles.gridWide]}>
          {content.steps.map((s, i) => (
            <View key={s.title} style={[styles.step, wide && styles.cardWide]}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.cardTitle}>{s.title}</Text>
              <Text style={styles.cardBody}>{s.body}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Security */}
      <View style={styles.dark}>
        <View style={inner}>
          <Text style={[styles.sectionTitle, { color: colors.white, marginTop: 0 }]}>{content.securityTitle}</Text>
          <View style={[styles.grid, wide && styles.gridWide]}>
            {content.security.map((s) => (
              <View key={s.title} style={[styles.darkItem, wide && styles.cardWide]}>
                <Text style={[styles.cardTitle, { color: colors.accent }]}>{s.title}</Text>
                <Text style={[styles.cardBody, { color: colors.textFaint }]}>{s.body}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Closing CTA */}
      <View style={styles.closing}>
        <View style={[inner, { alignItems: 'center' }]}>
          <Text style={[styles.closingText, wide && { fontSize: 44, lineHeight: 48 }]}>{content.closing}</Text>
          <Button title={content.primaryCta} variant="primary" onPress={onPrimary} style={{ minWidth: 240 }} />
        </View>
      </View>

      <View style={inner}>
        <Text style={styles.footer}>© {new Date().getFullYear()} Vireo Finance</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  inner: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xl },
  logo: { fontSize: 32, fontWeight: '900', letterSpacing: -1.5, color: colors.text },
  navLink: { ...type.bodyStrong, color: colors.text },
  hero: { paddingTop: spacing.xl, paddingBottom: spacing.xxl * 2, gap: spacing.xxl },
  heroWide: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.xxl * 2, paddingBottom: spacing.xxl * 3 },
  headline: { fontSize: 44, lineHeight: 46, fontWeight: '900', letterSpacing: -2, color: colors.text },
  sub: { ...type.body, fontSize: 19, lineHeight: 28, color: colors.textMuted, marginTop: spacing.xl, maxWidth: 560 },
  ctaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xxl },
  cta: { minWidth: 200 },
  art: { width: '100%', maxWidth: 420, aspectRatio: 1, borderRadius: 48, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  artGlyph: { fontSize: 220, fontWeight: '900', color: colors.black },
  grid: { gap: spacing.lg },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl },
  cardWide: { flexBasis: '31%', flexGrow: 1 },
  tag: { ...type.label, color: colors.accentDark, marginBottom: spacing.sm },
  cardTitle: { ...type.heading, fontSize: 22, color: colors.text },
  cardBody: { ...type.body, lineHeight: 24, color: colors.textMuted, marginTop: spacing.sm },
  sectionTitle: { ...type.title, fontSize: 34, color: colors.text, marginTop: spacing.xxl * 2, marginBottom: spacing.xl },
  step: { padding: spacing.xl, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.black },
  stepNum: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  stepNumText: { color: colors.accent, fontWeight: '800', fontSize: 18 },
  dark: { backgroundColor: colors.black, marginTop: spacing.xxl * 2, paddingVertical: spacing.xxl * 2 },
  darkItem: { padding: spacing.xl, borderRadius: radius.lg, backgroundColor: '#111' },
  closing: { backgroundColor: colors.accent, paddingVertical: spacing.xxl * 2 },
  closingText: { fontSize: 32, lineHeight: 36, fontWeight: '900', letterSpacing: -1, color: colors.black, textAlign: 'center', marginBottom: spacing.xl },
  footer: { ...type.caption, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xxl },
});
