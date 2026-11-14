import { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, TouchableOpacity, ActivityIndicator, StyleSheet, FlatList } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import type { StackScreenProps } from '@react-navigation/stack';

type WalletScreenProps = StackScreenProps<{
  Wallet: undefined;
  Send: undefined;
  Transactions: undefined;
  Kyc: undefined;
}, 'Wallet'>;

export default function WalletScreen({ navigation }: WalletScreenProps) {
  const { user } = useAuth();
  const [balance, setBalance] = useState<{ available: string; held: string; currency: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getWalletBalance().then(setBalance).finally(() => setLoading(false));
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.welcome}>Welcome, {user?.name}</Text>
        <Text style={styles.balanceLabel}>Available Balance</Text>
        <Text style={styles.balanceAmount}>
          {loading ? '…' : balance ? `${balance.currency} ${balance.available}` : '–'}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button title="Send Money" onPress={() => navigation.navigate('Send')} />
        <Button title="Transactions" onPress={() => navigation.navigate('Transactions')} />
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>KYC</Text>
        <Button title="Submit KYC" onPress={() => navigation.navigate('Kyc')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: { marginBottom: 24 },
  welcome: { fontSize: 18, color: '#666', marginBottom: 4 },
  balanceLabel: { fontSize: 14, color: '#888', marginBottom: 4 },
  balanceAmount: { fontSize: 32, fontWeight: 'bold' },
  actions: { gap: 12, marginBottom: 24 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 8 },
});
