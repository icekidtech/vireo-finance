import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../api';
import { errorMessage } from '../lib/format';
import PinPad from './PinPad';
import { Button } from './ui';
import { spacing } from '../theme';

type Props = {
  /** Called once the PIN is saved. */
  onDone: () => void;
  /** When given, shows a "Skip for now" button. */
  onSkip?: () => void;
  /** Required when replacing an existing PIN. */
  currentPin?: string;
  title?: string;
};

/** Choose a 4-digit PIN, then enter it again to confirm. */
export default function PinSetup({ onDone, onSkip, currentPin, title = 'Create your PIN' }: Props) {
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onComplete = async (pin: string) => {
    if (first === null) {
      setFirst(pin);
      setError(null);
      return;
    }
    if (pin !== first) {
      setFirst(null);
      setError('The PINs did not match. Start again.');
      return;
    }
    setSaving(true);
    try {
      await api.setPin(pin, currentPin);
      onDone();
    } catch (e) {
      setFirst(null);
      setError(errorMessage(e, 'Could not save your PIN'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ alignItems: 'center', gap: spacing.md }}>
      <PinPad
        title={first === null ? title : 'Confirm your PIN'}
        subtitle={
          first === null
            ? 'You can use it to approve payments when fingerprint or face isn’t available.'
            : 'Enter the same 4 digits again.'
        }
        error={error}
        onComplete={onComplete}
        disabled={saving}
      />
      {onSkip ? <Button title="Skip for now" variant="ghost" onPress={onSkip} /> : null}
    </View>
  );
}
