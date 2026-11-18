import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, TextInput } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

export type Bank = { code: string; name: string };

type Props = {
  banks: Bank[];
  value: Bank | null;
  onChange: (bank: Bank) => void;
  loading?: boolean;
  label?: string;
};

/** Dropdown-style bank selector: tap to open a searchable list. */
export default function BankPicker({ banks, value, onChange, loading, label = 'BANK' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? banks.filter((b) => b.name.toLowerCase().includes(q)) : banks;
  }, [banks, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(true)}
        disabled={loading || banks.length === 0}
        accessibilityRole="button"
      >
        <Text style={[styles.triggerText, !value && { color: colors.textFaint }]} numberOfLines={1}>
          {loading ? 'Loading banks…' : value ? value.name : banks.length ? 'Select a bank' : 'No banks available'}
        </Text>
        <Text style={styles.chevron}>⌄</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Select bank</Text>
              <TouchableOpacity onPress={close} hitSlop={12}>
                <Text style={styles.close}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.search}
              placeholder="Search banks"
              placeholderTextColor={colors.textFaint}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <FlatList
              data={filtered}
              keyExtractor={(b) => b.code}
              // The whole list (about 110 banks) renders at once: lazy rendering stops at the first screenful
              // when the list sits inside a height-limited sheet, which made most banks look missing.
              initialNumToRender={banks.length || 1}
              windowSize={21}
              style={{ flexShrink: 1 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.empty}>No bank matches “{query}”.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    onChange(item);
                    close();
                  }}
                >
                  <Text style={[styles.rowText, value?.code === item.code && { color: colors.accent }]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, color: colors.textMuted, marginBottom: spacing.sm },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    height: 58,
  },
  triggerText: { ...type.body, color: colors.text, flex: 1 },
  chevron: { color: colors.textMuted, fontSize: 22, marginLeft: spacing.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '80%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  sheetTitle: { ...type.heading, color: colors.text },
  close: { color: colors.textMuted, fontSize: 20 },
  search: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    height: 48,
    marginBottom: spacing.md,
    fontSize: 16,
  },
  row: { paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowText: { ...type.body, color: colors.text },
  empty: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl },
});
