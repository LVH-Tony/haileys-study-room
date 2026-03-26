import { Image } from 'expo-image';
import { StyleSheet, type ViewStyle } from 'react-native';

const BIG_LOGO = require('@/assets/big logo.png');

interface LogoProps {
  width?: number;
  style?: ViewStyle;
}

/** Hailey's Study Room horizontal logo. Width defaults to 240; height is auto-calculated from the image's aspect ratio. */
export function Logo({ width = 240, style }: LogoProps) {
  // big logo.png is 832×388 → aspect ratio ~2.14:1
  const height = Math.round(width / 2.14);
  return (
    <Image
      source={BIG_LOGO}
      style={[{ width, height }, style]}
      contentFit="contain"
    />
  );
}
