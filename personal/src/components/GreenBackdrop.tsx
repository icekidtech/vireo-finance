import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

/** Full-screen green backdrop: light green top-left sinking into deep green, with a lime glow at the bottom. */
export default function GreenBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="base" x1="0" y1="0" x2="0.9" y2="1">
            <Stop offset="0" stopColor="#6BC27A" />
            <Stop offset="0.35" stopColor="#2F9444" />
            <Stop offset="0.75" stopColor="#0C5A1C" />
            <Stop offset="1" stopColor="#03300F" />
          </LinearGradient>
          <RadialGradient id="lime" cx="0.55" cy="1.02" rx="0.75" ry="0.4">
            <Stop offset="0" stopColor="#C5E91E" stopOpacity={0.85} />
            <Stop offset="0.55" stopColor="#7FCB1A" stopOpacity={0.3} />
            <Stop offset="1" stopColor="#7FCB1A" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#base)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#lime)" />
      </Svg>
    </View>
  );
}
