import { Alert, Platform } from 'react-native';

export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void | Promise<void>;
}

/**
 * Alert.alert with buttons is a no-op in react-native-web, so on web this maps
 * to the browser's confirm (one action) or a numbered prompt (several).
 * On iOS/Android it is exactly Alert.alert.
 */
export function showAlert(title: string, message?: string, buttons?: DialogButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');
  const text = message ? `${title}\n\n${message}` : title;
  if (actions.length === 0) {
    window.alert(text);
    return;
  }
  if (actions.length === 1) {
    if (window.confirm(text)) void actions[0].onPress?.();
    return;
  }
  const list = actions.map((b, i) => `${i + 1}. ${b.text}`).join('\n');
  const answer = window.prompt(`${text}\n\n${list}\n\nEnter a number, or cancel to dismiss:`);
  const chosen = actions[Number.parseInt(answer ?? '', 10) - 1];
  if (chosen) void chosen.onPress?.();
}
