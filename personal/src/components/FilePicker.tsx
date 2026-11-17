import { StyleSheet, Text, View } from 'react-native';
import type { PickedFile } from '../lib/documents';
import { Button } from './ui';
import { colors, radius, spacing, type } from '../theme';

/** A labelled "choose a file" row that shows the chosen file's name. */
export default function FilePicker({
  label,
  file,
  onPick,
  hint,
}: {
  label: string;
  file: PickedFile | null;
  onPick: () => void;
  hint?: string;
}) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Text style={[styles.name, !file && { color: colors.textFaint }]} numberOfLines={1}>
          {file ? file.name : 'No file chosen'}
        </Text>
        <Button title={file ? 'Change' : 'Choose'} variant="secondary" small onPress={onPick} />
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, color: colors.textMuted, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    minHeight: 58,
  },
  name: { ...type.body, color: colors.text, flex: 1 },
  hint: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs },
});
