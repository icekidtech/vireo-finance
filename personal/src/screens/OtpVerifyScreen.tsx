import { useState } from 'react';
import { View, Text, TextInput, Button, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';

export default function OtpVerifyScreen() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();

  const requestOtp = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.requestOtp(phone);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.verifyOtp(phone, code);
      if (data.accessToken) {
        login(data.accessToken, data.user);
      } else {
        setError('Verification failed');
      }
    } catch (e: any) {
      setError(e.response?.data?.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verify Phone</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <TextInput
        style={styles.input}
        placeholder="Phone number (+234...)"
        value={phone}
        onChangeText={setPhone}
        autoCapitalize="none"
      />
      <Button title="Send OTP" onPress={requestOtp} disabled={loading} />
      <TextInput
        style={styles.input}
        placeholder="6-digit code"
        value={code}
        onChangeText={setCode}
        keyboardType="numeric"
        maxLength={6}
      />
      <Button title="Verify" onPress={verifyOtp} disabled={loading} />
      {loading && <ActivityIndicator size="small" />}
      <TouchableOpacity style={styles.link} onPress={() => {}}>
        <Text style={styles.linkText}>Need to register?</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' },
  error: { color: 'red', marginBottom: 12, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 },
  link: { marginTop: 16, alignItems: 'center' },
  linkText: { color: '#007AFF', fontSize: 14 },
});
