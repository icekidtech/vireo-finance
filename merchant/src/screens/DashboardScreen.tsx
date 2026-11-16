import { useCallback, useState } from 'react';
import { View, Text, Button, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../navigation';

type DashboardScreenProps = StackScreenProps<RootStackParamList, 'Dashboard'>;

export default function DashboardScreen({ navigation }: DashboardScreenProps) {
  const { logout } = useAuth();
  const [balance, setBalance] = useState<{ available: string; held: string; currency: string } | null>(null);
  const [salesToday, setSalesToday] = useState<{ amount: string; count: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refresh on focus so a payment committed on the customer's phone shows up
  // here without restarting the app.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      api
        .getDashboard()
        .then((data: any) => {
          if (!cancelled) {
            setBalance(data.balance);
            setSalesToday(data.salesToday);
            setError(null);
          }
        })
        .catch((e: any) => {
          if (!cancelled) setError(e.response?.data?.message || 'Could not load your dashboard');
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
      <Text style={styles.title}>Merchant Dashboard</Text>
      {loading ? (
        <ActivityIndicator size="large" />
      ) : error ? (
        <View style={styles.card}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Available Balance</Text>
            <Text style={styles.cardAmount}>{balance?.currency} {balance?.available}</Text>
            <Text style={styles.cardHeld}>Held: {balance?.currency} {balance?.held}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Sales Today</Text>
            <Text style={styles.cardAmount}>{salesToday?.amount}</Text>
            <Text style={styles.cardHeld}>{salesToday?.count} orders</Text>
          </View>
          <View style={styles.actions}>
            <Button title="Create Order (QR)" onPress={() => navigation.navigate('CreateOrder')} />
            <Button title="View Orders" onPress={() => navigation.navigate('Orders')} />
            <Button title="Settle to Bank" onPress={() => navigation.navigate('Settle')} />
          </View>
        </>
      )}
      <TouchableOpacity style={styles.link} onPress={logout}>
        <Text style={styles.linkText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  card: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, marginBottom: 12 },
  cardLabel: { fontSize: 14, color: '#666', marginBottom: 4 },
  cardAmount: { fontSize: 22, fontWeight: 'bold' },
  cardHeld: { fontSize: 12, color: '#888', marginTop: 4 },
  actions: { gap: 10 },
  error: { color: 'red', fontSize: 14 },
  link: { marginTop: 20, alignItems: 'center' },
  linkText: { color: '#007AFF', fontSize: 14 },
});
