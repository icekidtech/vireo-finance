import { useState } from 'react';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../navigation';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import { errorMessage } from '../lib/format';
import { AuthLayout, Button, ErrorBanner, Field, Screen } from '../components/ui';
import BankAccountFields, { type BankAccountValue } from '../components/BankAccountFields';
import PinSetup from '../components/PinSetup';
import { colors, spacing, type } from '../theme';

type Stage = 'welcome' | 'account' | 'otp' | 'business' | 'pin';

export default function OnboardScreen({ navigation, route }: StackScreenProps<RootStackParamList, 'Onboard'>) {
  const { login } = useAuth();
  const { height } = useWindowDimensions();
  // Arriving from the web landing page skips the welcome step.
  const mode = route.params?.mode;
  const [stage, setStage] = useState<Stage>(mode ? 'account' : 'welcome');
  const [isSignIn, setIsSignIn] = useState(mode === 'signin');
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof api.getProfile>> | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [handle, setHandle] = useState('');
  const [bankAccount, setBankAccount] = useState<BankAccountValue | null>(null);
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

  const onRegister = () =>
    guard(async () => {
      // Registration creates the account only; the OTP proves phone ownership.
      await api.register(phone.trim(), `${firstName.trim()} ${lastName.trim()}`);
      await sendCode();
    }, 'Could not create your account');

  const onSignIn = () => guard(sendCode, 'Could not send a code');

  const onVerify = () =>
    guard(async () => {
      const data = await api.verifyOtp(phone.trim(), code.trim());
      api.setToken(data.accessToken);
      // Returning merchants go straight in. A user with no merchant profile
      // (new, or registered but never finished setup) continues to business setup.
      try {
        await api.getMerchantProfile();
        login(data.accessToken, data.user);
      } catch (e) {
        if ((e as { response?: { status?: number } }).response?.status === 404) {
          // Hold the token locally: login() would swap to the dashboard
          // before the merchant profile exists.
          setToken(data.accessToken);
          setBusinessName((b) => b || '');
          setStage('business');
        } else {
          api.clearToken();
          throw e;
        }
      }
    }, 'Invalid or expired code');

  const onOnboard = () =>
    guard(async () => {
      await api.onboardMerchant({
        businessName: businessName.trim(),
        handle: handle.trim(),
        // Optional: when given, the server verifies it and fills in the name.
        ...(bankAccount?.verified
          ? { settlementBankCode: bankAccount.bankCode!, settlementAccountNumber: bankAccount.accountNumber }
          : {}),
      });
      // The business exists now; choose a PIN before entering the dashboard.
      setProfile(await api.getProfile());
      setStage('pin');
    }, 'Could not set up your business');

  const back = () => {
    setError(null);
    if (stage === 'otp') return setStage('account');
    if (mode && navigation.canGoBack()) return navigation.goBack();
    setStage('welcome');
  };

  if (stage === 'welcome') {
    return (
      <Screen>

        <View style={[styles.welcome, { minHeight: Math.max(520, height - 140) }]}>
          <Text style={styles.logo}>vireo</Text>
          <Text style={styles.tag}>Get paid the way{'\n'}your customers pay.</Text>
          <Text style={styles.point}>• Show a QR, get paid instantly</Text>
          <Text style={styles.point}>• Track every sale and payout</Text>
          <Text style={styles.point}>• Cash out to your bank, approved on your phone</Text>
          <View style={{ flex: 1 }} />
          <Button
            title="Create business account"
            variant="accent"
            onPress={() => {
              setIsSignIn(false);
              setStage('account');
            }}
          />
          <Button
            title="Sign in"
            variant="ghost"
            onPress={() => {
              setIsSignIn(true);
              setStage('account');
            }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <AuthLayout onBack={stage === 'business' || stage === 'pin' ? undefined : back}>
          <ErrorBanner message={error} />

          {stage === 'account' && (
            <>
              <Text style={styles.title}>{isSignIn ? 'Welcome back' : 'Your details'}</Text>
              <Field label="PHONE" placeholder="+2348012345678" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoCapitalize="none" />
              {!isSignIn && (
                <>
                  <Field label="FIRST NAME" placeholder="Ada" value={firstName} onChangeText={setFirstName} autoCapitalize="words" autoComplete="given-name" hint="Use your name as it appears on your BVN, so verification is quick." />
                  <Field label="LAST NAME" placeholder="Okafor" value={lastName} onChangeText={setLastName} autoCapitalize="words" autoComplete="family-name" />
                </>
              )}
              <Button
                title={isSignIn ? 'Send code' : 'Continue'}
                loading={loading}
                disabled={!phone.trim() || (!isSignIn && (!firstName.trim() || !lastName.trim()))}
                onPress={isSignIn ? onSignIn : onRegister}
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

          {stage === 'pin' && profile && (
            <PinSetup
              title="Create your PIN"
              onDone={() => login(token, profile)}
              onSkip={() => login(token, profile)}
            />
          )}

          {stage === 'business' && (
            <>
              <Text style={styles.title}>Set up your business</Text>
              <Field label="BUSINESS NAME" value={businessName} onChangeText={setBusinessName} placeholder="Ada's Kitchen" />
              <Field label="HANDLE" value={handle} onChangeText={setHandle} autoCapitalize="none" placeholder="adas_kitchen" hint="3–60 letters, numbers or underscores. Customers can find you by this." />
              <Text style={styles.section}>Where should we send your money?</Text>
              <BankAccountFields onChange={setBankAccount} />
              <Button title="Finish" variant="accent" loading={loading} disabled={!businessName.trim() || !handle.trim() || (!!bankAccount && (bankAccount.bankCode !== null || bankAccount.accountNumber !== '') && !bankAccount.verified)} onPress={onOnboard} />
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
  section: { ...type.heading, marginTop: spacing.md, marginBottom: spacing.lg, color: colors.text },
});
