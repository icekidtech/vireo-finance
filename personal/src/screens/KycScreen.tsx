import { useState } from 'react';
import { View, Text, TextInput, Button, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../navigation';

type KycScreenProps = StackScreenProps<RootStackParamList, 'Kyc'>;

export default function KycScreen({ navigation }: KycScreenProps) {
  const [provider, setProvider] = useState('');
  const [payload, setPayload] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const submitKyc = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.submitKyc(provider, payload || undefined);
      setStatus('pending');
    } catch (e: any) {
      setError(e.response?.data?.message || 'KYC submission failed');
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    setLoading(true);
    try {
      const data = await api.getKycStatus();
      setStatus(data.status);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to fetch KYC status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>KYC Verification</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {status && <Text style={styles.status}>Status: {status}</Text>}
      <Text style={styles.label}>Provider</Text>
      <TextInput style={styles.input} placeholder="e.g. smileid" value={provider} onChangeText={setProvider} />
      <Text style={styles.label}>Payload (optional)</Text>
      <TextInput style={styles.input} placeholder="KYC provider payload" value={payload} onChangeText={setPayload} />
      <Button title="Submit KYC" onPress={submitKyc} disabled={loading} />
      <Button title="Check Status" onPress={checkStatus} />
      {loading && <ActivityIndicator size="small" />}
      <TouchableOpacity style={styles.link} onPress={() => navigation.goBack()}>
        <Text style={styles.linkText}>Back to Wallet</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  error: { color: 'red', marginBottom: 12 },
  status: { fontSize: 14, color: '#666', marginBottom: 16 },
  label: { fontSize: 14, color: '#666', marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 8 },
  link: { marginTop: 20, alignItems: 'center' },
  linkText: { color: '#007AFF', fontSize: 14 },
});
