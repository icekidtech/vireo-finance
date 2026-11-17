import { useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Button } from './ui';
import { DrawLine, FadeIn, Float, Glow, Pulse, Reveal, Rise, Twinkle } from './motion';
import { colors, radius, spacing, type } from '../theme';

export interface LandingContent {
  headline: { before: string; highlight: string; after?: string };
  sub: string;
  primaryCta: string;
  secondaryCta: string;
  /** Short, verifiable facts about the product (never marketing statistics). */
  facts: { value: string; label: string }[];
  cardLabel: string;
  featuresTitle: string;
  featuresSub: string;
  features: { icon: string; title: string; body: string; tag?: string }[];
  stepsTitle: string;
  steps: { title: string; body: string }[];
  securityTitle: string;
  securitySub: string;
  security: { icon: string; title: string; body: string }[];
  closing: string;
  closingSub: string;
}

interface Props {
  content: LandingContent;
  onPrimary: () => void;
  onSecondary: () => void;
}

const MAX_WIDTH = 1160;
const isWeb = Platform.OS === 'web';
/** Frosted-glass look; the blur only exists on web. */
const glassBlur = (isWeb ? { backdropFilter: 'blur(16px)' } : {}) as object;

export default function Landing({ content, onPrimary, onSecondary }: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= 960;
  const compact = width < 600;
  const gutter = compact ? spacing.xl : spacing.xxl;
  const inner = [styles.inner, { paddingHorizontal: gutter }];

  const scroller = useRef<ScrollView>(null);
  const sectionY = useRef<Record<string, number>>({});
  const [scrollY, setScrollY] = useState(0);
  const [viewport, setViewport] = useState(800);
  const visibleBottom = scrollY + viewport;

  const go = (key: string) =>
    scroller.current?.scrollTo({ y: Math.max(0, (sectionY.current[key] ?? 0) - 90), animated: true });
  const measure = (key: string) => (y: number) => {
    sectionY.current[key] = y;
  };

  const { headline } = content;

  return (
    <View style={styles.page}>
      <ScrollView
        ref={scroller}
        scrollEventThrottle={32}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        onLayout={(e) => setViewport(e.nativeEvent.layout.height)}
        showsVerticalScrollIndicator={false}
      >
        {/* ───── Hero ───── */}
        <View style={styles.hero}>
          <Glow size={1100} intensity={0.04} pulse style={{ top: -520, left: -340 }} />
          <Glow size={760} intensity={0.05} color={colors.accentDeep} style={{ top: 40, right: -300 }} />

          <View style={inner}>
            <FadeIn y={-10}>
              <View style={styles.nav}>
                <Text style={styles.logo}>vireo</Text>
                {!compact && (
                  <View style={[styles.navPill, glassBlur]}>
                    {(
                      [
                        ['features', 'Features'],
                        ['steps', 'How it works'],
                        ['security', 'Security'],
                      ] as const
                    ).map(([key, label]) => (
                      <TouchableOpacity key={key} onPress={() => go(key)} style={styles.navItem}>
                        <Text style={styles.navText}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <TouchableOpacity onPress={onSecondary} hitSlop={10}>
                    <Text style={styles.navText}>{content.secondaryCta}</Text>
                  </TouchableOpacity>
                  <Button title={compact ? 'Start' : content.primaryCta} variant="accent" small onPress={onPrimary} />
                </View>
              </View>
            </FadeIn>

            <View style={[styles.heroBody, wide && styles.heroBodyWide]}>
              <View style={{ flex: wide ? 1.1 : undefined }}>
                <FadeIn delay={120} y={26}>
                  <Text style={[styles.headline, compact && { fontSize: 42, lineHeight: 46 }, wide && { fontSize: 72, lineHeight: 76 }]}>
                    {headline.before}{' '}
                    <Text style={{ color: colors.accent }}>{headline.highlight}</Text>
                    {headline.after ? ` ${headline.after}` : ''}
                  </Text>
                </FadeIn>
                <View style={styles.underline}>
                  <DrawLine delay={900} />
                </View>
                <FadeIn delay={320} y={20}>
                  <Text style={styles.sub}>{content.sub}</Text>
                </FadeIn>
                <FadeIn delay={480} y={20}>
                  <View style={styles.ctaRow}>
                    <Button title={content.primaryCta} variant="accent" onPress={onPrimary} style={styles.cta} />
                    <Button title={content.secondaryCta} variant="secondary" onPress={onSecondary} style={styles.cta} />
                  </View>
                </FadeIn>
              </View>

              <View style={[styles.artWrap, wide && { flex: 0.9 }]}>
                <Pulse from={0.97} to={1.04} duration={3400} style={styles.orb}>
                  <View style={styles.orbInner} />
                </Pulse>
                <Twinkle style={{ top: 10, left: 20 }} />
                <Twinkle style={{ top: 70, right: 10 }} size={16} delay={700} />
                <Twinkle style={{ bottom: 20, left: 60 }} size={14} delay={1300} />
                <Float amplitude={10} tilt={1.2} duration={3000} style={styles.cardStack}>
                  <View style={[styles.cardBack]} />
                  <View style={[styles.glassCard, glassBlur]}>
                    <View style={styles.cardTop}>
                      <Text style={styles.cardLogo}>vireo</Text>
                      <View style={styles.cardChip}>
                        <Text style={styles.cardChipText}>{content.cardLabel.toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={styles.cardGlyph}>₦</Text>
                    <Text style={styles.cardFoot}>Approved on your device</Text>
                  </View>
                </Float>
              </View>
            </View>
          </View>
        </View>

        {/* ───── Facts band ───── */}
        <Reveal visibleBottom={visibleBottom}>
          <View style={inner}>
            <Rise>
              <View style={[styles.facts, glassBlur, compact && { flexWrap: 'wrap' }]}>
                {content.facts.map((f, i) => (
                  <View key={f.label} style={[styles.fact, compact && { width: '50%', paddingVertical: spacing.md }, !compact && i > 0 && styles.factDivider]}>
                    <Text style={[styles.factValue, compact && { fontSize: 30 }]}>{f.value}</Text>
                    <Text style={styles.factLabel}>{f.label}</Text>
                  </View>
                ))}
              </View>
            </Rise>
          </View>
        </Reveal>

        {/* ───── Features ───── */}
        <Reveal visibleBottom={visibleBottom} onMeasure={measure('features')}>
          <View style={inner}>
            <Rise>
              <Text style={styles.sectionTitle}>{content.featuresTitle}</Text>
              <Text style={styles.sectionSub}>{content.featuresSub}</Text>
            </Rise>
            <View style={[styles.grid, wide && styles.gridWide]}>
              {content.features.map((f, i) => (
                <Rise key={f.title} delay={i * 90} style={wide ? styles.cell : undefined}>
                  <View style={styles.card}>
                    <View style={styles.cardHead}>
                      <View style={styles.icon}>
                        <Text style={styles.iconText}>{f.icon}</Text>
                      </View>
                      {f.tag ? (
                        <View style={styles.tag}>
                          <Text style={styles.tagText}>{f.tag.toUpperCase()}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.cardTitle}>{f.title}</Text>
                    <Text style={styles.cardBody}>{f.body}</Text>
                  </View>
                </Rise>
              ))}
            </View>
          </View>
        </Reveal>

        {/* ───── How it works ───── */}
        <Reveal visibleBottom={visibleBottom} onMeasure={measure('steps')}>
          <View style={inner}>
            <Rise>
              <Text style={styles.sectionTitle}>{content.stepsTitle}</Text>
            </Rise>
            <View style={[styles.grid, wide && styles.gridWide]}>
              {content.steps.map((s, i) => (
                <Rise key={s.title} delay={i * 120} style={wide ? styles.cell : undefined}>
                  <View style={styles.step}>
                    <Text style={styles.stepNum}>{String(i + 1).padStart(2, '0')}</Text>
                    <Text style={styles.cardTitle}>{s.title}</Text>
                    <Text style={styles.cardBody}>{s.body}</Text>
                  </View>
                </Rise>
              ))}
            </View>
          </View>
        </Reveal>

        {/* ───── Security ───── */}
        <Reveal visibleBottom={visibleBottom} onMeasure={measure('security')} style={styles.securityBand}>
          <Glow size={700} intensity={0.04} color={colors.accentDeep} style={{ top: -200, left: -200 }} />
          <View style={inner}>
            <Rise>
              <Text style={styles.sectionTitle}>{content.securityTitle}</Text>
              <Text style={styles.sectionSub}>{content.securitySub}</Text>
            </Rise>
            <View style={[styles.grid, wide && styles.gridWide, { marginTop: spacing.xl }]}>
              {content.security.map((s, i) => (
                <Rise key={s.title} delay={i * 90} style={wide ? styles.cell : undefined}>
                  <View style={styles.secItem}>
                    <View style={styles.secIcon}>
                      <Text style={styles.secIconText}>{s.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.secTitle}>{s.title}</Text>
                      <Text style={styles.secBody}>{s.body}</Text>
                    </View>
                  </View>
                </Rise>
              ))}
            </View>
          </View>
        </Reveal>

        {/* ───── Closing CTA ───── */}
        <Reveal visibleBottom={visibleBottom}>
          <View style={inner}>
            <Rise>
              <View style={styles.closing}>
                <Twinkle style={{ top: 24, left: 28 }} size={20} color={colors.black} />
                <Twinkle style={{ bottom: 28, right: 36 }} size={26} delay={900} color={colors.black} />
                <Text style={[styles.closingTitle, !compact && { fontSize: 46, lineHeight: 50 }]}>{content.closing}</Text>
                <Text style={styles.closingSub}>{content.closingSub}</Text>
                <Button title={content.primaryCta} variant="primary" onPress={onPrimary} style={{ minWidth: 240, marginTop: spacing.xl }} />
              </View>
            </Rise>
          </View>
        </Reveal>

        <View style={inner}>
          <Text style={styles.footer}>© {new Date().getFullYear()} Vireo Finance</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  inner: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  hero: { overflow: 'hidden' },

  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xl },
  logo: { fontSize: 30, fontWeight: '900', letterSpacing: -1.5, color: colors.text },
  navPill: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  navItem: { paddingVertical: 9, paddingHorizontal: 18, borderRadius: radius.pill },
  navText: { ...type.bodyStrong, fontSize: 14, color: colors.text },

  heroBody: { paddingTop: spacing.xl, paddingBottom: spacing.xxl * 2, gap: spacing.xxl },
  heroBodyWide: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.xxl * 2, paddingBottom: spacing.xxl * 3 },
  headline: { fontSize: 52, lineHeight: 56, fontWeight: '800', letterSpacing: -2.5, color: colors.text },
  underline: { width: 170, marginTop: spacing.sm },
  sub: { ...type.body, fontSize: 18, lineHeight: 28, color: colors.textMuted, marginTop: spacing.xl, maxWidth: 540 },
  ctaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xxl },
  cta: { minWidth: 200 },

  artWrap: { alignItems: 'center', justifyContent: 'center', minHeight: 360 },
  orb: { position: 'absolute', right: 0, top: 0 },
  orbInner: { width: 300, height: 300, borderRadius: 150, backgroundColor: colors.accent },
  cardStack: { width: 320, height: 200, marginTop: 70, transform: [{ rotate: '-9deg' }] },
  cardBack: {
    position: 'absolute',
    width: 320,
    height: 200,
    borderRadius: 28,
    backgroundColor: colors.accentDeep,
    transform: [{ translateX: 22 }, { translateY: 26 }, { rotate: '8deg' }],
  },
  glassCard: {
    width: 320,
    height: 200,
    borderRadius: 28,
    padding: spacing.xl,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    justifyContent: 'space-between',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLogo: { fontSize: 24, fontWeight: '900', letterSpacing: -1, color: colors.white },
  cardChip: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: 'rgba(0,0,0,0.35)' },
  cardChipText: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: colors.accent },
  cardGlyph: { fontSize: 64, fontWeight: '900', color: colors.white, lineHeight: 68 },
  cardFoot: { ...type.caption, color: 'rgba(255,255,255,0.8)' },

  facts: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    paddingVertical: spacing.xl,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    marginBottom: spacing.xxl,
  },
  fact: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.md },
  factDivider: { borderLeftWidth: 1, borderLeftColor: colors.glassBorder },
  factValue: { fontSize: 40, fontWeight: '800', letterSpacing: -1, color: colors.white },
  factLabel: { ...type.caption, color: colors.accent, marginTop: 4, textAlign: 'center' },

  sectionTitle: { ...type.title, fontSize: 36, lineHeight: 42, color: colors.text, marginTop: spacing.xxl * 2, textAlign: 'center' },
  sectionSub: { ...type.body, fontSize: 17, lineHeight: 26, color: colors.textMuted, textAlign: 'center', alignSelf: 'center', maxWidth: 620, marginTop: spacing.md, marginBottom: spacing.xl },

  grid: { gap: spacing.lg, marginTop: spacing.lg },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { flexBasis: '31.5%', flexGrow: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, minHeight: 190 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  icon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentDeep, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 20, fontWeight: '800', color: colors.accent },
  tag: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentDeep },
  tagText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: colors.accent },
  cardTitle: { ...type.heading, fontSize: 21, color: colors.text },
  cardBody: { ...type.body, lineHeight: 24, color: colors.textMuted, marginTop: spacing.sm },

  step: { borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.accentDeep, backgroundColor: 'rgba(51,116,24,0.12)', minHeight: 190 },
  stepNum: { fontSize: 44, fontWeight: '900', letterSpacing: -1, color: colors.accent, marginBottom: spacing.md },

  securityBand: { marginTop: spacing.xxl * 2, paddingBottom: spacing.xxl, backgroundColor: '#141414', overflow: 'hidden' },
  secItem: { flexDirection: 'row', gap: spacing.lg, paddingVertical: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  secIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  secIconText: { fontSize: 20, fontWeight: '800', color: colors.accent },
  secTitle: { ...type.heading, fontSize: 18, color: colors.text },
  secBody: { ...type.body, fontSize: 15, lineHeight: 22, color: colors.textMuted, marginTop: 4 },

  closing: { marginTop: spacing.xxl * 2, borderRadius: 40, padding: spacing.xxl * 1.5, backgroundColor: colors.accent, alignItems: 'center', overflow: 'hidden' },
  closingTitle: { fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -1.5, color: colors.black, textAlign: 'center' },
  closingSub: { ...type.body, fontSize: 17, color: 'rgba(15,15,15,0.75)', textAlign: 'center', marginTop: spacing.md, maxWidth: 520 },
  footer: { ...type.caption, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.xxl },
});
