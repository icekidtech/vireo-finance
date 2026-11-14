import { useState } from 'react';
import { View, Text, TextInput, Button, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import type { StackScreenProps } from '@react-navigation/stack';

type SettleScreenProps = StackScreenProps<{
  Dashboard: undefined;
  Settle: undefined;
}, 'Settle'>;

export default function SettleScreen({ navigation }: SettleScreenProps) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const settle = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.settle(amount || undefined);
      setStatus(data.status || 'submitted');
    } catch (e: any) {
      setError(e.response?.data?.message || 'Settlement failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settle to Bank</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {status && <Text style={styles.status}>Status: {status}</Text>}
      <Text style={styles.label}>Amount (NGN)</Text>
      <TextInput style={styles.input} placeholder="Leave empty for full balance" value={amount} onChangeText={setAmount} keyboardType="numeric" />
      <Button title="Settle" onPress={settle} disabled={loading} />
      {loading && <ActivityIndicator size="small" />}
      <TouchableOpacity style={styles.link} onPress={() => navigation.goBack()}>
        <Text style={styles.linkText}>Back to Dashboard</Text>
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
