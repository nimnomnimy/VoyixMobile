/**
 * Platform-aware alert helper.
 * On web: uses window.alert / confirm / prompt.
 * On native: delegates to React Native's Alert.
 */
import { Alert, Platform } from 'react-native';

type Button = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export function showAlert(title: string, message?: string, buttons?: Button[]) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const body = [title, message].filter(Boolean).join('\n\n');

  if (!buttons || buttons.length === 0) {
    window.alert(body);
    return;
  }

  const cancelBtn = buttons.find((b) => b.style === 'cancel');
  const actionBtns = buttons.filter((b) => b.style !== 'cancel');

  if (actionBtns.length === 1) {
    // Simple confirm / cancel
    const ok = window.confirm(body);
    if (ok) actionBtns[0].onPress?.();
    else cancelBtn?.onPress?.();
    return;
  }

  // Multiple actions — numbered prompt
  const opts = actionBtns.map((b, i) => `${i + 1}) ${b.text}`).join('\n');
  const raw = window.prompt(`${body}\n\n${opts}\n\nEnter number:`);
  if (raw === null) {
    cancelBtn?.onPress?.();
    return;
  }
  const idx = parseInt(raw, 10) - 1;
  if (idx >= 0 && idx < actionBtns.length) actionBtns[idx].onPress?.();
}
