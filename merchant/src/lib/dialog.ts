import { Alert, Platform } from 'react-native';

export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void | Promise<void>;
}

export interface DialogRequest {
  title: string;
  message?: string;
  buttons: DialogButton[];
}

type Listener = (request: DialogRequest | null) => void;
let listener: Listener | null = null;

/** Used by <DialogHost/> to receive web dialogs. */
export function registerDialogHost(fn: Listener | null): void {
  listener = fn;
}

/**
 * Confirmation / choice popup. iOS and Android use the native Alert. Alert.alert
 * with buttons does nothing in react-native-web, so on web the request is
 * rendered by <DialogHost/> as an in-app modal (mounted once at the app root).
 */
export function showAlert(title: string, message?: string, buttons?: DialogButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  const request: DialogRequest = {
    title,
    message,
    buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
  };
  if (listener) {
    listener(request);
    return;
  }
  // No host mounted (should not happen): fall back to the browser's dialog.
  const text = message ? `${title}\n\n${message}` : title;
  const actions = request.buttons.filter((b) => b.style !== 'cancel');
  if (actions.length <= 1 && window.confirm(text)) void actions[0]?.onPress?.();
}
