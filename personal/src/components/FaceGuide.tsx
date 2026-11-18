import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

type Props = {
  /** Space kept clear above the oval (title text). */
  topInset?: number;
  /** Space kept clear below the oval (buttons). */
  bottomInset?: number;
};

/**
 * Face-capture overlay: dims everything outside a portrait oval so the user
 * fits their face inside it. The oval is sized from the space actually left
 * between the insets, so it never runs under the title or the buttons.
 * Purely visual; sits on top of the camera preview.
 */
export default function FaceGuide({ topInset = 150, bottomInset = 230 }: Props) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) =>
    setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  let content = null;
  if (box) {
    const availH = Math.max(box.h - topInset - bottomInset, 160);
    // Wide enough for a whole head with some margin, as in other verification apps: most of the screen width.
    const w = Math.min(box.w * 0.86, 440, availH / 1.25);
    const h = Math.min(w * 1.28, availH);
    const ring = 1500; // wide enough to dim the whole preview around the oval
    // Centre of the free band, relative to the middle of the screen.
    const offsetY = (topInset - bottomInset) / 2;
    content = (
      <View
        style={{
          width: w + ring * 2,
          height: h + ring * 2,
          borderWidth: ring,
          borderRadius: w / 2 + ring,
          borderColor: 'rgba(0,0,0,0.55)',
          transform: [{ translateY: offsetY }],
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
    );
  }

  return (
    <View pointerEvents="none" style={styles.fill} onLayout={onLayout}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
