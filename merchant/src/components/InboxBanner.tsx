import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import type { AppNotification } from '../types';
import { Button } from './ui';
import { colors, radius, spacing, type } from '../theme';

const POLL_MS = 8000;

/**
 * Shows new in-app notifications (e.g. "You received NGN 200.00") while the
 * screen is open, and tells the screen to reload its figures when one arrives.
 * Dismissing marks it read. Push notifications are a separate, later channel.
 */
export default function InboxBanner({ onNew }: { onNew?: () => void }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  const poll = useCallback(async () => {
    try {
      const unread = await api.listUnreadNotifications();
      setItems(unread);
      if (unread.some((n) => !seen.current.has(n.id))) {
        // Anything not seen before means money (or a status) just changed.
        if (seen.current.size > 0) onNewRef.current?.();
        unread.forEach((n) => seen.current.add(n.id));
      }
    } catch {
      // A failed poll is not worth interrupting the screen for.
    }
  }, []);

  useEffect(() => {
    void poll();
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  const dismiss = async (id?: string) => {
    setItems((current) => (id ? current.filter((n) => n.id !== id) : []));
    try {
      await api.markNotificationsRead(id ? [id] : undefined);
    } catch {
      // It will reappear on the next poll if the request failed.
    }
  };

  if (items.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {items.slice(0, 3).map((n) => (
        <View key={n.id} style={styles.item}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{n.title}</Text>
            <Text style={styles.body}>{n.body}</Text>
          </View>
          <Button title="Dismiss" variant="ghost" small onPress={() => dismiss(n.id)} />
        </View>
      ))}
      {items.length > 3 ? <Button title={`Clear all (${items.length})`} variant="ghost" small onPress={() => dismiss()} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.md },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentDeep,
    padding: spacing.md,
  },
  title: { ...type.bodyStrong, color: colors.accent },
  body: { ...type.body, color: colors.text, marginTop: 2 },
});
