import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleProp, View, ViewStyle } from 'react-native';
import { colors } from '../theme';

/** Native-driver animation is unavailable on web; the JS driver is used there. */
const native = Platform.OS !== 'web';

/** Fades and slides children in once, when they first mount. */
export function FadeIn({
  children,
  delay = 0,
  y = 14,
  duration = 420,
  style,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: native,
    }).start();
  }, [v, delay, duration]);
  return (
    <Animated.View
      style={[
        style,
        { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [y, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/* ───────── Scroll-triggered reveal (landing page) ───────── */

const RevealContext = createContext(true);

/**
 * A section that flips to "shown" once scrolled into view. Children that are
 * <Rise> animate in (staggered) at that moment.
 */
export function Reveal({
  visibleBottom,
  onMeasure,
  children,
  style,
}: {
  /** scrollY + viewport height: the bottom edge of what the user can see. */
  visibleBottom: number;
  onMeasure?: (y: number) => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const [y, setY] = useState<number | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!shown && y !== null && visibleBottom > y + 60) setShown(true);
  }, [visibleBottom, y, shown]);
  return (
    <View
      style={style}
      onLayout={(e) => {
        setY(e.nativeEvent.layout.y);
        onMeasure?.(e.nativeEvent.layout.y);
      }}
    >
      <RevealContext.Provider value={shown}>{children}</RevealContext.Provider>
    </View>
  );
}

export function Rise({
  children,
  delay = 0,
  y = 28,
  style,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const shown = useContext(RevealContext);
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!shown) return;
    Animated.timing(v, {
      toValue: 1,
      duration: 650,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: native,
    }).start();
  }, [shown, v, delay]);
  return (
    <Animated.View
      style={[
        style,
        { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [y, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/* ───────── Ambient loops ───────── */

function useLoop(duration: number, deps: unknown[] = []) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, duration, ...deps]);
  return v;
}

/** Gentle bob (and optional tilt) that never stops. */
export function Float({
  children,
  amplitude = 12,
  duration = 2600,
  tilt = 0,
  style,
}: {
  children: ReactNode;
  amplitude?: number;
  duration?: number;
  tilt?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const v = useLoop(duration);
  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-amplitude, amplitude] }) },
            { rotate: v.interpolate({ inputRange: [0, 1], outputRange: [`${-tilt}deg`, `${tilt}deg`] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Soft breathing scale + fade, for glows and "waiting" indicators. */
export function Pulse({
  children,
  from = 1,
  to = 1.08,
  duration = 2200,
  style,
}: {
  children: ReactNode;
  from?: number;
  to?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const v = useLoop(duration);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [from, to] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** A decorative ✦ that fades in and out. */
export function Twinkle({
  style,
  delay = 0,
  size = 22,
  color = colors.accent,
}: {
  style?: StyleProp<ViewStyle>;
  delay?: number;
  size?: number;
  color?: string;
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 1100, useNativeDriver: native }),
        Animated.timing(v, { toValue: 0.15, duration: 1100, useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);
  return (
    <Animated.Text
      style={[
        { position: 'absolute', color, fontSize: size, opacity: v },
        style as object,
        { transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.15] }) }] },
      ]}
    >
      ✦
    </Animated.Text>
  );
}

/** Springs its children in from small, for success moments (ticks, badges). */
export function Pop({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, friction: 5, tension: 90, useNativeDriver: native }).start();
  }, [v]);
  return (
    <Animated.View
      style={[
        style,
        { opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }), transform: [{ scale: v }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** An underline that draws itself left to right. */
export function DrawLine({ color = colors.accent, height = 6, delay = 600, style }: { color?: string; height?: number; delay?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 900, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [v, delay]);
  return (
    <Animated.View
      style={[
        { height, borderRadius: height, backgroundColor: color, width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
        style,
      ]}
    />
  );
}

/**
 * Radial glow faked with stacked translucent circles (no gradient dependency,
 * identical on web and native). Optionally breathes.
 */
export function Glow({
  size = 600,
  color = colors.accent,
  intensity = 0.05,
  pulse = false,
  style,
}: {
  size?: number;
  color?: string;
  intensity?: number;
  pulse?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  // Many faint rings read as a smooth falloff; few rings show as visible bands.
  const rings = 30;
  const body = (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
      {Array.from({ length: rings }, (_, i) => {
        const d = size * (1 - i / rings);
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: d,
              height: d,
              borderRadius: d / 2,
              backgroundColor: color,
              opacity: (intensity * 9) / rings,
            }}
          />
        );
      })}
    </View>
  );
  return (
    <View style={[{ position: 'absolute' }, style]} pointerEvents="none">
      {pulse ? <Pulse from={0.94} to={1.06} duration={3600}>{body}</Pulse> : body}
    </View>
  );
}
