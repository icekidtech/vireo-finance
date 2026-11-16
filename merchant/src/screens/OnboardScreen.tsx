import { useState } from 'react';
import { View, Text, TextInput, Button, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';

type Stage = 'account' | 'otp' | 'business';

export default function OnboardScreen() {
  const [stage, setStage] = useState<Stage>('account');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignIn, setIsSignIn] = useState(false);
  const { login } = useAuth();

  const onRegister = async () => {
    setLoading(true);
    setError(null);
    try {
      // Registration creates the account only; the OTP proves phone ownership.
      await api.register(phone, name, handle || undefined);
      const otp = await api.requestOtp(phone);
      setDevCode(otp?.devCode ?? null);
      setStage('otp');
    } catch (e: any) {
      setError(e.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.verifyOtp(phone, code);
      if (!data.accessToken) {
        setError('Verification failed');
        return;
      }
      api.setToken(data.accessToken);
      if (isSignIn) {
        const profile = await api.getProfile();
        login(data.accessToken, profile);
        return;
      }
      // Hold the token locally: calling login() here would swap the navigator
      // to the dashboard before the merchant profile exists.
      setToken(data.accessToken);
      setStage('business');
    } catch (e: any) {
      setError(e.response?.data?.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  /** Returning merchants skip registration and business setup entirely. */
  const onSignIn = async () => {
    setIsSignIn(true);
    setStage('otp');
    setError(null);
    if (phone) {
      await requestCode();
    }
  };

  const requestCode = async () => {
    if (!phone) {
      setError('Enter your phone number first');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const otp = await api.requestOtp(phone);
      setDevCode(otp?.devCode ?? null);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const onOnboard = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.onboardMerchant(
        businessName,
        handle,
        bankCode || undefined,
        accountNumber || undefined,
        accountName || undefined,
      );
      const profile = await api.getProfile();
      login(token, profile);
    } catch (e: any) {
      const message = e.response?.data?.message || 'Merchant onboarding failed';
      // A merchant profile already exists for this account: nothing left to do.
      if (e.response?.status === 409 && /already has a merchant profile/i.test(message)) {
        const profile = await api.getProfile();
        login(token, profile);
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Merchant Onboarding</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      {stage === 'account' && (
        <>
          <TextInput style={styles.input} placeholder="Phone (+234...)" value={phone} onChangeText={setPhone} autoCapitalize="none" />
          <TextInput style={styles.input} placeholder="Full name" value={name} onChangeText={setName} />
          <TextInput style={styles.input} placeholder="Merchant handle" value={handle} onChangeText={setHandle} autoCapitalize="none" />
          <Button title="Create Account" onPress={onRegister} disabled={loading} />
          <TouchableOpacity style={styles.link} onPress={onSignIn}>
            <Text style={styles.linkText}>Already registered? Sign in</Text>
          </TouchableOpacity>
        </>
      )}

      {stage === 'otp' && (
        <>
          <Text style={styles.sectionTitle}>{isSignIn ? 'Sign in' : `Verify ${phone}`}</Text>
          {isSignIn && (
            <>
              <TextInput style={styles.input} placeholder="Phone (+234...)" value={phone} onChangeText={setPhone} autoCapitalize="none" />
              <Button title="Send OTP" onPress={requestCode} disabled={loading} />
            </>
          )}
          {devCode && <Text style={styles.hint}>Dev code: {devCode}</Text>}
          <TextInput style={styles.input} placeholder="6-digit code" value={code} onChangeText={setCode} keyboardType="numeric" maxLength={6} />
          <Button title="Verify" onPress={onVerify} disabled={loading} />
        </>
      )}

      {stage === 'business' && (
        <>
          <Text style={styles.sectionTitle}>Business Details</Text>
          <TextInput style={styles.input} placeholder="Business name" value={businessName} onChangeText={setBusinessName} />
          <TextInput style={styles.input} placeholder="Settlement bank code" value={bankCode} onChangeText={setBankCode} autoCapitalize="none" />
          <TextInput style={styles.input} placeholder="Settlement account number" value={accountNumber} onChangeText={setAccountNumber} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Account name" value={accountName} onChangeText={setAccountName} />
          <Button title="Onboard Merchant" onPress={onOnboard} disabled={loading} />
        </>
      )}

      {loading && <ActivityIndicator size="small" />}
      {stage !== 'account' && (
        <TouchableOpacity
          style={styles.link}
          onPress={() => {
            setStage('account');
            setIsSignIn(false);
            setError(null);
          }}
        >
          <Text style={styles.linkText}>Start over</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  error: { color: 'red', marginBottom: 12, textAlign: 'center' },
  hint: { color: '#888', marginBottom: 12, textAlign: 'center', fontSize: 13 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginTop: 8, marginBottom: 8 },
  link: { marginTop: 16, alignItems: 'center' },
  linkText: { color: '#007AFF', fontSize: 14 },
});