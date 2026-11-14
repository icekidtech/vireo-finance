import { useEffect, useState } from 'react';
import { View, Text, Button, TouchableOpacity, ActivityIndicator, StyleSheet, FlatList } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import type { NativeStackScreenProps } from '@react-navigation/stack';

type DashboardScreenProps = NativeStackScreenProps<{
  Dashboard: undefined;
  CreateOrder: undefined;
  Orders: undefined;
  Settle: undefined;
}, 'Dashboard'>;

export default function DashboardScreen({ navigation }: DashboardScreenProps) {
  const [balance, setBalance] = useState<{ available: string; held: string; currency: string } | null>(null);
  const [salesToday, setSalesToday] = useState<{ amount: string; count: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDashboard().then((data: any) => {
      setBalance(data.balance);
      setSalesToday(data.salesToday);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Merchant Dashboard</Text>
      {loading ? (
        <ActivityIndicator size="large" />
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
});
