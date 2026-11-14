import { useState } from 'react';
import { View, Text, TextInput, Button, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';

export default function OnboardScreen() {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();

  const onRegister = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.register(phone, name, handle || undefined);
      if (data.token) {
        login(data.token, data.user);
      } else {
        setError('Registration failed');
      }
    } catch (e: any) {
      setError(e.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const onOnboard = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.onboardMerchant(businessName, handle, bankCode || undefined, accountNumber || undefined, accountName || undefined);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Merchant onboarding failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Merchant Onboarding</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <TextInput style={styles.input} placeholder="Phone (+234...)" value={phone} onChangeText={setPhone} autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Full name" value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="Merchant handle" value={handle} onChangeText={setHandle} />
      <Button title="Create Account" onPress={onRegister} disabled={loading} />
      {loading && <ActivityIndicator size="small" />}
      <Text style={styles.sectionTitle}>Business Details</Text>
      <TextInput style={styles.input} placeholder="Business name" value={businessName} onChangeText={setBusinessName} />
      <TextInput style={styles.input} placeholder="Settlement bank code" value={bankCode} onChangeText={setBankCode} />
      <TextInput style={styles.input} placeholder="Settlement account number" value={accountNumber} onChangeText={setAccountNumber} keyboardType="numeric" />
      <TextInput style={styles.input} placeholder="Account name" value={accountName} onChangeText={setAccountName} />
      <Button title="Onboard Merchant" onPress={onOnboard} disabled={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  error: { color: 'red', marginBottom: 12, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginTop: 16, marginBottom: 8 },
});
