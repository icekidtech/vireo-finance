import { useState } from 'react';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../navigation';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import { errorMessage } from '../lib/format';
import { AuthLayout, Button, ErrorBanner, Field, Screen } from '../components/ui';
import { colors, spacing, type } from '../theme';

type Stage = 'welcome' | 'details' | 'otp';

export default function AuthScreen({ navigation, route }: StackScreenProps<RootStackParamList, 'Auth'>) {
  const { login } = useAuth();
  const { height } = useWindowDimensions();
  // Arriving from the web landing page skips the welcome step.
  const mode = route.params?.mode;
  const [stage, setStage] = useState<Stage>(mode ? 'details' : 'welcome');
  const [isSignIn, setIsSignIn] = useState(mode === 'signin');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guard = async (fn: () => Promise<void>, fallback: string) => {
    setLoading(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e, fallback));
    } finally {
      setLoading(false);
    }
  };

  const sendCode = async () => {
    await api.requestOtp(phone.trim());
    setStage('otp');
  };

  const onContinue = () =>
    guard(async () => {
      if (!isSignIn) {
        // Registration creates the account only; the OTP proves phone ownership.
        await api.register(phone.trim(), name.trim(), handle.trim().replace(/^[@$]/, '') || undefined);
      }
      await sendCode();
    }, isSignIn ? 'Could not send a code' : 'Could not create your account');

  const onVerify = () =>
    guard(async () => {
      const data = await api.verifyOtp(phone.trim(), code.trim());
      login(data.accessToken, data.user);
    }, 'Invalid or expired code');

  const back = () => {
    setError(null);
    if (stage === 'otp') return setStage('details');
    if (mode && navigation.canGoBack()) return navigation.goBack();
    setStage('welcome');
  };

  if (stage === 'welcome') {
    return (
      <Screen>

        <View style={[styles.welcome, { minHeight: Math.max(520, height - 140) }]}>
          <Text style={styles.logo}>vireo</Text>
          <Text style={styles.tag}>Money that responds{'\n'}to you.</Text>
          <Text style={styles.point}>• Pay people, banks and merchants</Text>
          <Text style={styles.point}>• Ask the assistant about your money</Text>
          <Text style={styles.point}>• Approve every payment with your fingerprint or face</Text>
          <View style={{ flex: 1 }} />
          <Button
            title="Get started"
            variant="accent"
            onPress={() => {
              setIsSignIn(false);
              setStage('details');
            }}
          />
          <Button
            title="Sign in"
            variant="ghost"
            onPress={() => {
              setIsSignIn(true);
              setStage('details');
            }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <AuthLayout onBack={back}>
          <ErrorBanner message={error} />

          {stage === 'details' && (
            <>
              <Text style={styles.title}>{isSignIn ? 'Welcome back' : 'Create your account'}</Text>
              <Field label="PHONE" placeholder="+2348012345678" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoCapitalize="none" />
              {!isSignIn && (
                <>
                  <Field label="FULL NAME" placeholder="Ada Okafor" value={name} onChangeText={setName} />
                  <Field label="$HANDLE (OPTIONAL)" placeholder="ada" value={handle} onChangeText={setHandle} autoCapitalize="none" hint="3–20 letters, numbers or underscores. Friends can pay you by handle." />
                </>
              )}
              <Button
                title={isSignIn ? 'Send code' : 'Continue'}
                loading={loading}
                disabled={!phone.trim() || (!isSignIn && !name.trim())}
                onPress={onContinue}
              />
            </>
          )}

          {stage === 'otp' && (
            <>
              <Text style={styles.title}>Enter the code</Text>
              <Text style={styles.sub}>Sent to {phone}</Text>
              <Field label="6-DIGIT CODE" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
              <Button title="Verify" loading={loading} disabled={code.length !== 6} onPress={onVerify} />
              <Button title="Resend code" variant="ghost" onPress={() => guard(sendCode, 'Could not resend')} />
            </>
          )}
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  welcome: { minHeight: 620, paddingTop: 80, paddingBottom: spacing.xl },
  logo: { fontSize: 48, fontWeight: '900', letterSpacing: -2, color: colors.text },
  tag: { ...type.display, fontSize: 36, marginTop: spacing.xl, color: colors.text },
  point: { ...type.body, fontSize: 17, color: colors.textMuted, marginTop: spacing.md },
  back: { fontSize: 38, lineHeight: 40, color: colors.text, marginBottom: spacing.lg },
  title: { ...type.title, marginBottom: spacing.xl, color: colors.text },
  sub: { ...type.body, color: colors.textMuted, marginTop: -spacing.lg, marginBottom: spacing.xl },
});
