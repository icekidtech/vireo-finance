import { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import type { NativeStackScreenProps } from '@react-navigation/stack';

type TransactionsScreenProps = NativeStackScreenProps<{
  Wallet: undefined;
  Transactions: undefined;
}, 'Transactions'>;

export default function TransactionsScreen({ navigation }: TransactionsScreenProps) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTransactions().then((data: any) => setTransactions(data || [])).finally(() => setLoading(false));
  }, []);

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity style={styles.item}>
      <View style={styles.itemBody}>
        <Text style={styles.itemTitle}>{item.recipientName || 'Transfer'}</Text>
        <Text style={styles.itemSub}>{item.type} • {item.status}</Text>
      </View>
      <Text style={styles.itemAmount}>-{item.amount}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Transactions</Text>
      {loading ? (
        <ActivityIndicator size="large" />
      ) : (
        <FlatList
          data={transactions}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
        />
      )}
      <TouchableOpacity style={styles.link} onPress={() => navigation.goBack()}>
        <Text style={styles.linkText}>Back to Wallet</Text>
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
  itemAmount: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  link: { marginTop: 20, alignItems: 'center' },
  linkText: { color: '#007AFF', fontSize: 14 },
});
