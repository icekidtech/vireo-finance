import { Image, type ImageStyle, type StyleProp } from 'react-native';

// Mark + "Vireo Finance" wordmark, with the wordmark in off-white so it reads on the dark screens.
const source = require('../../assets/logo-light.png');
const ASPECT = 503 / 145;

/** The Vireo Finance logo at a given height (width follows the artwork's proportions). */
export default function Logo({ height = 40, style }: { height?: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={source}
      accessibilityLabel="Vireo Finance"
      resizeMode="contain"
      style={[{ height, width: Math.round(height * ASPECT) }, style]}
    />
  );
}
