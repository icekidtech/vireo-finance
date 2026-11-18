import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

type BlobProps = {
  id: string;
  color: string;
  size: number;
  /** Resting position (top-left corner of the blob). */
  left: number;
  top: number;
  /** How far it drifts, and how long one slow back-and-forth takes. */
  dx: number;
  dy: number;
  duration: number;
  scale?: number;
  opacity?: number;
  animate: boolean;
};

/** A soft glowing disc that drifts slowly back and forth (a still glow when motion is reduced). */
function Blob({ id, color, size, left, top, dx, dy, duration, scale = 0.15, opacity = 0.9, animate }: BlobProps) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!animate) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, duration, t]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left,
        top,
        width: size,
        height: size,
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
          { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + scale] }) },
        ],
      }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="0.5" cy="0.5" rx="0.5" ry="0.5">
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="0.55" stopColor={color} stopOpacity={opacity * 0.35} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * Green backdrop that keeps moving: light green sinking into deep green, with glowing lime, mint and
 * emerald light drifting slowly across it. Honours the "reduce motion" setting by holding still.
 */
export default function GreenBackdrop() {
  const { width: W, height: H } = useWindowDimensions();
  const animate = useReduceMotion() === false;
  const big = Math.max(W, H);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="base" x1="0" y1="0" x2="0.9" y2="1">
            <Stop offset="0" stopColor="#4FA862" />
            <Stop offset="0.4" stopColor="#1F7A35" />
            <Stop offset="0.8" stopColor="#0A4A17" />
            <Stop offset="1" stopColor="#03300F" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#base)" />
      </Svg>
      {/* mint light, top left */}
      <Blob id="mint" color="#8FE6A0" size={big * 0.9} left={-big * 0.35} top={-big * 0.25} dx={W * 0.45} dy={H * 0.12} duration={9000} opacity={0.75} animate={animate} />
      {/* emerald, middle right */}
      <Blob id="emerald" color="#22B35A" size={big * 0.8} left={W * 0.3} top={H * 0.2} dx={-W * 0.5} dy={H * 0.18} duration={11000} opacity={0.6} animate={animate} />
      {/* lime glow rising from the bottom */}
      <Blob id="lime" color="#C5E91E" size={big * 0.85} left={-W * 0.1} top={H * 0.62} dx={W * 0.4} dy={-H * 0.1} duration={7500} scale={0.22} opacity={0.85} animate={animate} />
      {/* a deeper shadow drifting through the bottom right keeps the contrast moving */}
      <Blob id="deep" color="#03300F" size={big * 0.7} left={W * 0.35} top={H * 0.35} dx={-W * 0.35} dy={H * 0.2} duration={13000} opacity={0.7} animate={animate} />
    </View>
  );
}

/** undefined until the system setting is known, then true when the user asked for less motion. */
function useReduceMotion(): boolean | undefined {
  const [reduce, setReduce] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(v))
      .catch(() => alive && setReduce(false));
    return () => {
      alive = false;
    };
  }, []);
  return reduce;
}
