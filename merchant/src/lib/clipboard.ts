import { Platform, Share } from 'react-native';

/** True when copyText puts the text on the clipboard (web); native opens the share sheet instead. */
export const canCopy = Platform.OS === 'web';

/**
 * Web: copies to the clipboard. iOS/Android: opens the system share sheet
 * (which includes Copy), so no extra native module is needed.
 */
export async function copyText(text: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  await Share.share({ message: text });
  return true;
}
