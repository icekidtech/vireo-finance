import { useState } from 'react';
import { View, Text, TextInput, Button, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';

export default function RegisterScreen() {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Join Vireo</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <TextInput
        style={styles.input}
        placeholder="Phone number (+234...)"
        value={phone}
        onChangeText={setPhone}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Full name"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Handle (optional)"
        value={handle}
        onChangeText={setHandle}
      />
      <Button title="Register" onPress={onRegister} disabled={loading} />
      {loading && <ActivityIndicator size="small" />}
      <TouchableOpacity style={styles.link} onPress={() => {}}>
        <Text style={styles.linkText}>Already have an account? Verify OTP</Text>
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
