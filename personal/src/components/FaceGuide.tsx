import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { colors } from '../theme';

/**
 * Face-capture overlay: dims everything outside a portrait oval so the user
 * fits their face inside it. Purely visual; sits on top of the camera preview.
 */
export default function FaceGuide() {
  const { width } = useWindowDimensions();
  const w = Math.min(width * 0.7, 300);
  const h = w * 1.32;
  const ring = 1200; // wide enough to dim the whole preview around the oval
  return (
    <View pointerEvents="none" style={styles.fill}>
      {/* The thick translucent border is the dimmed area; the inside stays clear. */}
      <View
        style={{
          width: w + ring * 2,
          height: h + ring * 2,
          borderWidth: ring,
          borderRadius: w / 2 + ring,
          borderColor: 'rgba(0,0,0,0.55)',
          transform: [{ translateY: -h * 0.08 }],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: w,
            height: h,
            borderRadius: w / 2,
            borderWidth: 4,
            borderColor: colors.accent,
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
