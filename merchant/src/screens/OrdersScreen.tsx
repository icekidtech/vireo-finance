import { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import type { NativeStackScreenProps } from '@react-navigation/stack';

type OrdersScreenProps = NativeStackScreenProps<{
  Dashboard: undefined;
  Orders: undefined;
}, 'Orders'>;

export default function OrdersScreen({ navigation }: OrdersScreenProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listOrders().then((data: any) => setOrders(data || [])).finally(() => setLoading(false));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Orders</Text>
      {loading ? (
        <ActivityIndicator size="large" />
      ) : (
        <FlatList
          data={orders}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.item}>
              <View style={styles.itemBody}>
                <Text style={styles.itemTitle}>{item.reference}</Text>
                <Text style={styles.itemSub}>{item.merchantName} • {item.status}</Text>
              </View>
              <Text style={styles.itemAmount}>{item.amount}</Text>
            </TouchableOpacity>
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
        />
      )}
      <TouchableOpacity style={styles.link} onPress={() => navigation.goBack()}>
        <Text style={styles.linkText}>Back to Dashboard</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  list: { paddingBottom: 20 },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  itemBody: { flex: 1 },
  itemTitle: { fontSize: 16, fontWeight: '600' },
  itemSub: { fontSize: 12, color: '#888' },
  itemAmount: { fontSize: 16, fontWeight: 'bold' },
  link: { marginTop: 20, alignItems: 'center' },
  linkText: { color: '#007AFF', fontSize: 14 },
});
