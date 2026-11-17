import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import { errorMessage } from '../lib/format';
import { Button, ErrorBanner, Field, NoticeBanner, Screen } from '../components/ui';
import { colors, spacing, type } from '../theme';

type Stage = 'welcome' | 'account' | 'otp' | 'business';

export default function OnboardScreen() {
  const { login } = useAuth();
  const [stage, setStage] = useState<Stage>('welcome');
  const [isSignIn, setIsSignIn] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [handle, setHandle] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
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
    const otp = await api.requestOtp(phone.trim());
    setDevCode(otp.devCode ?? null);
    setStage('otp');
  };

  const onRegister = () =>
    guard(async () => {
      // Registration creates the account only; the OTP proves phone ownership.
      await api.register(phone.trim(), name.trim());
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
        settlementBankCode: bankCode.trim() || undefined,
        settlementAccountNumber: accountNumber.trim() || undefined,
        settlementAccountName: accountName.trim() || undefined,
      });
      login(token, await api.getProfile());
    }, 'Could not set up your business');

  const back = () => {
    setError(null);
    setStage(stage === 'otp' ? 'account' : 'welcome');
    if (stage === 'otp' && isSignIn) setStage('account');
  };

  return (
    <Screen>
      {stage === 'welcome' ? (
        <View style={styles.welcome}>
          <Text style={styles.logo}>vireo</Text>
          <Text style={styles.tag}>Get paid the way{'\n'}your customers pay.</Text>
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
      ) : (
        <View style={{ paddingTop: spacing.xl }}>
          {stage !== 'business' && (
            <TouchableOpacity onPress={back} hitSlop={12}>
              <Text style={styles.back}>‹</Text>
            </TouchableOpacity>
          )}
          <ErrorBanner message={error} />

          {stage === 'account' && (
            <>
              <Text style={styles.title}>{isSignIn ? 'Welcome back' : 'Your details'}</Text>
              <Field label="PHONE" placeholder="+2348012345678" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoCapitalize="none" />
              {!isSignIn && <Field label="FULL NAME" placeholder="Ada Okafor" value={name} onChangeText={setName} />}
              <Button
                title={isSignIn ? 'Send code' : 'Continue'}
                loading={loading}
                disabled={!phone.trim() || (!isSignIn && !name.trim())}
                onPress={isSignIn ? onSignIn : onRegister}
              />
            </>
          )}

          {stage === 'otp' && (
            <>
              <Text style={styles.title}>Enter the code</Text>
              <Text style={styles.sub}>Sent to {phone}</Text>
              {devCode && <NoticeBanner tone="success" message={`Dev code: ${devCode}`} />}
              <Field label="6-DIGIT CODE" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
              <Button title="Verify" loading={loading} disabled={code.length !== 6} onPress={onVerify} />
              <Button title="Resend code" variant="ghost" onPress={() => guard(sendCode, 'Could not resend')} />
            </>
          )}

          {stage === 'business' && (
            <>
              <Text style={styles.title}>Set up your business</Text>
              <Field label="BUSINESS NAME" value={businessName} onChangeText={setBusinessName} placeholder="Ada's Kitchen" />
              <Field label="HANDLE" value={handle} onChangeText={setHandle} autoCapitalize="none" placeholder="adas_kitchen" hint="3–60 letters, numbers or underscores. Customers can find you by this." />
              <Text style={styles.section}>Where should we send your money?</Text>
              <Field label="BANK CODE" value={bankCode} onChangeText={setBankCode} autoCapitalize="none" placeholder="058" />
              <Field label="ACCOUNT NUMBER" value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" placeholder="0123456789" />
              <Field label="ACCOUNT NAME" value={accountName} onChangeText={setAccountName} />
              <Button title="Finish" variant="accent" loading={loading} disabled={!businessName.trim() || !handle.trim()} onPress={onOnboard} />
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  welcome: { minHeight: 620, paddingTop: 80, paddingBottom: spacing.xl },
  logo: { fontSize: 48, fontWeight: '900', letterSpacing: -2, color: colors.text },
  tag: { ...type.display, fontSize: 36, marginTop: spacing.xl, color: colors.text },
  back: { fontSize: 38, lineHeight: 40, color: colors.text, marginBottom: spacing.lg },
  title: { ...type.title, marginBottom: spacing.xl, color: colors.text },
  sub: { ...type.body, color: colors.textMuted, marginTop: -spacing.lg, marginBottom: spacing.xl },
  section: { ...type.heading, marginTop: spacing.md, marginBottom: spacing.lg, color: colors.text },
});
