import { useState } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { errorMessage } from '../lib/format';
import { useAuth } from '../contexts/AuthContext';
import { useLoad } from '../lib/useLoad';
import type { RootStackParamList } from '../navigation';
import PinPad from '../components/PinPad';
import PinSetup from '../components/PinSetup';
import { Button, ErrorBanner, Field, Header, Loading, NoticeBanner, Screen } from '../components/ui';
import { Pop } from '../components/motion';
import { colors, spacing, type } from '../theme';

type Props = StackScreenProps<RootStackParamList, 'Pin'>;
type Stage = 'menu' | 'current' | 'new' | 'reset-code' | 'reset-new' | 'done';

/** Create, change or reset the 4-digit transaction PIN. */
export default function PinScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useLoad(() => api.getPinStatus(), 'Could not load your PIN status');
  const [stage, setStage] = useState<Stage>('menu');
  const [currentPin, setCurrentPin] = useState('');
  const [code, setCode] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  if (loading && !data) return <Loading />;

  const finish = (message: string) => {
    setInfo(message);
    setStage('done');
    setCurrentPin('');
    setCode('');
    refresh();
  };

  // The current PIN is checked on the server when the new one is saved; here we only collect it.
  const sendResetCode = async () => {
    setBusy(true);
    setPinError(null);
    try {
      await api.requestPinResetCode();
      setStage('reset-code');
    } catch (e) {
      setPinError(errorMessage(e, 'Could not send a code'));
    } finally {
      setBusy(false);
    }
  };

  const body = (() => {
    if (stage === 'current') {
      return (
        <PinPad
          title="Enter your current PIN"
          onComplete={(pin) => {
            setCurrentPin(pin);
            setStage('new');
          }}
        />
      );
    }
    if (stage === 'new') {
      return <PinSetup title="Choose a new PIN" currentPin={currentPin} onDone={() => finish('Your PIN has been changed.')} />;
    }
    if (stage === 'reset-code') {
      return (
        <View>
          <Text style={styles.lead}>Enter the 6-digit code we emailed to {user?.email ?? 'you'}.</Text>
          <Field label="6-DIGIT CODE" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} />
          <Button title="Continue" variant="accent" disabled={code.length !== 6} onPress={() => setStage('reset-new')} />
        </View>
      );
    }
    if (stage === 'reset-new') {
      return (
        <ResetNewPin
          code={code}
          onDone={() => finish('Your PIN has been reset.')}
          onBadCode={() => {
            setCode('');
            setStage('reset-code');
            setPinError('That code is invalid or expired. Request a new one.');
          }}
        />
      );
    }
    // menu
    if (!data?.set) {
      return <PinSetup onDone={() => finish('Your PIN is set. You can use it to approve payments.')} />;
    }
    return (
      <View style={{ gap: spacing.md }}>
        <NoticeBanner tone="success" message="You have a PIN. It confirms payments when fingerprint or face isn’t available." />
        {data.locked ? <NoticeBanner message="Your PIN is locked for a few minutes after too many wrong tries." /> : null}
        <Button title="Change PIN" variant="accent" onPress={() => setStage('current')} />
        <Button title="I forgot my PIN" variant="ghost" loading={busy} onPress={sendResetCode} />
      </View>
    );
  })();

  if (stage === 'done') {
    // scroll={false} gives the body a bounded height so the content centres on the screen.
    return (
      <Screen background={colors.accent} scroll={false}>
        <View style={styles.doneWrap}>
          <Pop style={styles.tick}>
            <Text style={styles.tickText}>✓</Text>
          </Pop>
          <Text style={styles.doneTitle}>PIN saved</Text>
          <Text style={styles.doneBody}>{info}</Text>
        </View>
        <Button title="Done" onPress={() => navigation.goBack()} style={{ marginBottom: spacing.xl }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Transaction PIN" onBack={() => (stage === 'menu' ? navigation.goBack() : setStage('menu'))} />
      <ErrorBanner message={error ?? pinError} />
      {body}
    </Screen>
  );
}

/** New PIN after a reset code: the code is checked by the server together with the new PIN. */
function ResetNewPin({ code, onDone, onBadCode }: { code: string; onDone: () => void; onBadCode: () => void }) {
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onComplete = async (pin: string) => {
    if (first === null) return setFirst(pin);
    if (pin !== first) {
      setFirst(null);
      return setError('The PINs did not match. Start again.');
    }
    try {
      await api.resetPin(code, pin);
      onDone();
    } catch (e) {
      const message = errorMessage(e, 'Could not reset your PIN');
      if (/OTP|code/i.test(message)) return onBadCode();
      setFirst(null);
      setError(message);
    }
  };

  return (
    <PinPad
      title={first === null ? 'Choose a new PIN' : 'Confirm your PIN'}
      subtitle={first === null ? 'Pick 4 digits that are not easy to guess.' : 'Enter the same 4 digits again.'}
      error={error}
      onComplete={onComplete}
    />
  );
}

const styles = StyleSheet.create({
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.lg },
  tick: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  tickText: { color: colors.accent, fontSize: 48, fontWeight: '800' },
  doneTitle: { ...type.display, color: colors.black, textAlign: 'center' },
  doneBody: { ...type.body, color: colors.black, textAlign: 'center' },
  lead: { ...type.body, color: colors.textMuted, marginBottom: spacing.xl },
});
