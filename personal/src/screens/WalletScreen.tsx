import { useCallback, useState } from 'react';
import { View, Text, Button, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../navigation';

type WalletScreenProps = StackScreenProps<RootStackParamList, 'Wallet'>;

export default function WalletScreen({ navigation }: WalletScreenProps) {
  const { user, logout } = useAuth();
  const [account, setAccount] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refresh on focus so a payment made on the Send screen is reflected here.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      api
        .getMyAccount()
        .then((data) => {
          if (!cancelled) {
            setAccount(data);
            setError(null);
          }
        })
        .catch((e: any) => {
          if (!cancelled) setError(e.response?.data?.message || 'Could not load your wallet');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.welcome}>Welcome, {user?.name}</Text>
        <Text style={styles.balanceLabel}>Available Balance</Text>
        <Text style={styles.balanceAmount}>
          {loading ? '…' : account ? `${account.currency} ${account.available}` : '–'}
        </Text>
        {account?.held && account.held !== '0.00' && (
          <Text style={styles.held}>Held: {account.currency} {account.held}</Text>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      {account?.virtualAccount && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your account number</Text>
          <Text style={styles.accountNumber}>{account.virtualAccount.accountNumber}</Text>
          <Text style={styles.held}>{account.virtualAccount.bankName} · receive from any bank</Text>
        </View>
      )}

      <View style={styles.actions}>
        <Button title="Send Money" onPress={() => navigation.navigate('Send')} />
        <Button title="Transactions" onPress={() => navigation.navigate('Transactions')} />
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>KYC</Text>
        <Button title="Submit KYC" onPress={() => navigation.navigate('Kyc')} />
      </View>
      {loading && <ActivityIndicator size="small" />}
      <TouchableOpacity style={styles.link} onPress={logout}>
        <Text style={styles.linkText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: { marginBottom: 24 },
  welcome: { fontSize: 18, color: '#666', marginBottom: 4 },
  balanceLabel: { fontSize: 14, color: '#888', marginBottom: 4 },
  balanceAmount: { fontSize: 32, fontWeight: 'bold' },
  held: { fontSize: 12, color: '#888', marginTop: 4 },
  error: { color: 'red', marginTop: 8 },
  actions: { gap: 12, marginBottom: 24 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 8 },
  accountNumber: { fontSize: 20, fontWeight: '600', letterSpacing: 1 },
  link: { marginTop: 8, alignItems: 'center' },
  linkText: { color: '#007AFF', fontSize: 14 },
});