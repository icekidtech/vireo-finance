import { useState } from 'react';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../navigation';
import { View, Text, StyleSheet, useWindowDimensions, TouchableOpacity } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import { errorMessage } from '../lib/format';
import { AuthLayout, Button, ErrorBanner, Field, Screen } from '../components/ui';
import Logo from '../components/Logo';
import PinSetup from '../components/PinSetup';
import { colors, spacing, type } from '../theme';

type Stage = 'welcome' | 'details' | 'otp' | 'pin';
type AuthMethod = 'phone' | 'email';

export default function AuthScreen({ navigation, route }: StackScreenProps<RootStackParamList, 'Auth'>) {
  const { login } = useAuth();
  const { height } = useWindowDimensions();
  // Arriving from the web landing page skips the welcome step.
  const mode = route.params?.mode;
  const [stage, setStage] = useState<Stage>(mode ? 'details' : 'welcome');
  const [isSignIn, setIsSignIn] = useState(mode === 'signin');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('phone');
  const [session, setSession] = useState<{ token: string; user: Parameters<typeof login>[1] } | null>(null);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
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
    if (authMethod === 'email') {
      await api.requestEmailOtp(email.trim().toLowerCase());
    } else {
      await api.requestOtp(phone.trim());
    }
    setStage('otp');
  };

  const onContinue = () =>
    guard(async () => {
      if (!isSignIn) {
        // Registration creates the account only; the OTP proves phone/email ownership.
        await api.register(phone.trim(), `${firstName.trim()} ${lastName.trim()}`, handle.trim().replace(/^[@$]/, '') || undefined);
      }
      await sendCode();
    }, isSignIn ? 'Could not send a code' : 'Could not create your account');

  const onVerify = () =>
    guard(async () => {
      const data = authMethod === 'email'
        ? await api.verifyEmailOtp(email.trim().toLowerCase(), code.trim())
        : await api.verifyOtp(phone.trim(), code.trim());
      if (isSignIn) {
        login(data.accessToken, data.user);
        return;
      }
      // New account: choose a PIN before entering the app. The token is set on the API client
      // so the PIN call is authenticated, but the app only treats the user as signed in afterwards.
      api.setToken(data.accessToken);
      setSession({ token: data.accessToken, user: data.user });
      setStage('pin');
    }, 'Invalid or expired code');

  const back = () => {
    setError(null);
    if (stage === 'pin') return; // the account exists; finishing or skipping continues into the app
    if (stage === 'otp') return setStage('details');
    if (mode && navigation.canGoBack()) return navigation.goBack();
    setStage('welcome');
  };

  if (stage === 'welcome') {
    return (
      <Screen>

        <View style={[styles.welcome, { minHeight: Math.max(520, height - 140) }]}>
          <Logo height={64} />
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
              
              {isSignIn && (
                <View style={styles.methodSelector}>
                  <TouchableOpacity
                    style={[styles.methodButton, authMethod === 'phone' && styles.methodButtonActive]}
                    onPress={() => setAuthMethod('phone')}
                  >
                    <Text style={[styles.methodText, authMethod === 'phone' && styles.methodTextActive]}>Phone</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.methodButton, authMethod === 'email' && styles.methodButtonActive]}
                    onPress={() => setAuthMethod('email')}
                  >
                    <Text style={[styles.methodText, authMethod === 'email' && styles.methodTextActive]}>Email</Text>
                  </TouchableOpacity>
                </View>
              )}

              {authMethod === 'phone' ? (
                <Field label="PHONE" placeholder="+2348012345678" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoCapitalize="none" />
              ) : (
                <Field label="EMAIL" placeholder="ada@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
              )}

              {!isSignIn && (
                <>
                  <Field label="FIRST NAME" placeholder="Ada" value={firstName} onChangeText={setFirstName} autoCapitalize="words" autoComplete="given-name" hint="Use your name as it appears on your BVN, so verification is quick." />
                  <Field label="LAST NAME" placeholder="Okafor" value={lastName} onChangeText={setLastName} autoCapitalize="words" autoComplete="family-name" />
                  <Field label="$HANDLE (OPTIONAL)" placeholder="ada" value={handle} onChangeText={setHandle} autoCapitalize="none" hint="3–20 letters, numbers or underscores. Friends can pay you by handle." />
                </>
              )}
              <Button
                title={isSignIn ? 'Send code' : 'Continue'}
                loading={loading}
                disabled={
                  (authMethod === 'phone' && !phone.trim()) ||
                  (authMethod === 'email' && !email.trim()) ||
                  (!isSignIn && (!firstName.trim() || !lastName.trim()))
                }
                onPress={onContinue}
              />
            </>
          )}

          {stage === 'pin' && session && (
            <PinSetup
              title="Create your PIN"
              onDone={() => login(session.token, session.user)}
              onSkip={() => login(session.token, session.user)}
            />
          )}

          {stage === 'otp' && (
            <>
              <Text style={styles.title}>Enter the code</Text>
              <Text style={styles.sub}>Sent to {authMethod === 'email' ? email : phone}</Text>
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
  methodSelector: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  methodButton: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  methodButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  methodText: {
    ...type.body,
    fontWeight: '600',
    color: colors.textMuted,
  },
  methodTextActive: {
    color: colors.white,
  },
});
