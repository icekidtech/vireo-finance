import { useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { errorMessage, groupAmountInput } from '../lib/format';
import type { RootStackParamList, TabParamList } from '../navigation';
import { Button, ErrorBanner, Keypad, Screen, applyKey } from '../components/ui';
import { colors, radius, spacing, type } from '../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Charge'>,
  StackScreenProps<RootStackParamList>
>;

/** Cash App-style charge entry: big amount, keypad, one primary action. */
export default function CreateOrderScreen({ navigation }: Props) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numeric = Number(amount || '0');
  const valid = amount !== '' && Number.isFinite(numeric) && numeric > 0;
  const display = groupAmountInput(amount);

  const charge = async () => {
    setLoading(true);
    setError(null);
    try {
      // The API takes a decimal string; trailing "." is trimmed.
      const order = await api.createOrder(amount.replace(/\.$/, ''), note.trim() || undefined);
      setAmount('');
      setNote('');
      navigation.navigate('OrderDetail', { reference: order.reference });
    } catch (e) {
      setError(errorMessage(e, 'Could not create the payment request'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.body}>
        <Text style={styles.title}>Charge</Text>
        <View style={styles.amountWrap}>
          <Text style={[styles.amount, !valid && { color: colors.textFaint }]} numberOfLines={1} adjustsFontSizeToFit>
            ₦{display}
          </Text>
        </View>
        <TextInput
          style={styles.note}
          value={note}
          onChangeText={setNote}
          placeholder="Add a note"
          placeholderTextColor={colors.textFaint}
          maxLength={255}
          textAlign="center"
        />
        <View style={{ paddingHorizontal: spacing.xl }}>
          <ErrorBanner message={error} />
        </View>
      </View>
      <Keypad onKey={(k) => setAmount((a) => applyKey(a, k))} />
      <View style={styles.footer}>
        <Button title="Request payment" variant="accent" onPress={charge} loading={loading} disabled={!valid} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center' },
  title: { ...type.bodyStrong, textAlign: 'center', color: colors.text, position: 'absolute', top: spacing.md, left: 0, right: 0 },
  amountWrap: { alignItems: 'center', paddingHorizontal: spacing.xl },
  amount: { ...type.hero, fontSize: 72, color: colors.text },
  note: {
    alignSelf: 'center',
    minWidth: 180,
    marginTop: spacing.lg,
    paddingVertical: 10,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    fontSize: 15,
    color: colors.text,
  },
  footer: { padding: spacing.xl },
});
