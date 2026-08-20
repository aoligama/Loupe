import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, FlatList, Linking, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import type { DebugEvent, DeepLinkPayload } from '@loupe/contract';
import type { EventBus } from '@loupe/core';
import { createLinkStore } from '../deeplink/links';
import type { LinkStore } from '../deeplink/links';
import { emitOutgoing, PLUGIN_ID } from '../deeplink/capture';
import { theme } from '../overlay/theme';
import { useEvents } from './useEvents';
import { ChipBar, ListRow, styles as shared } from './shared';

interface Props {
  bus: EventBus;
  store?: LinkStore;
}

type View_ = 'links' | 'history';

function confirmDelete(url: string, onConfirm: () => void): void {
  Alert.alert('Remove link?', `"${url}" will be removed.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: onConfirm },
  ]);
}

export const DeepLinkPanel: React.FC<Props> = ({ bus, store }) => {
  const linkStore = useMemo(() => store ?? createLinkStore(), [store]);
  const { events } = useEvents(bus, PLUGIN_ID);

  const [view, setView] = useState<View_>('links');
  const [links, setLinks] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLinks(await linkStore.list());
  }, [linkStore]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Shared by a successful fire and a remove, so a stale error can never
  // outlive the link it described in one path but not the other.
  const clearError = useCallback((url: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[url];
      return next;
    });
  }, []);

  const fire = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
      emitOutgoing(bus, url, true, null);
      clearError(url);
    } catch (e) {
      // A link that will not open is the normal case here — it is usually the
      // bug being chased — so it is recorded and shown, never thrown.
      const message = e instanceof Error ? e.message : String(e);
      emitOutgoing(bus, url, false, message);
      setErrors((prev) => ({ ...prev, [url]: message }));
    }
  }, [bus, clearError]);

  const add = useCallback(async () => {
    const url = draft.trim();
    if (!url) return;
    await linkStore.add(url);
    setDraft('');
    await refresh();
  }, [draft, linkStore, refresh]);

  return (
    <View style={styles.root}>
      <ChipBar>
        {(['links', 'history'] as View_[]).map((v) => (
          <Pressable
            key={v}
            testID={`loupe-chip-${v}`}
            onPress={() => setView(v)}
            style={[styles.chip, view === v && styles.chipActive]}
          >
            <Text style={[styles.chipText, view === v && styles.chipTextActive]}>{v}</Text>
          </Pressable>
        ))}
      </ChipBar>

      {view === 'links' ? (
        <>
          <View style={styles.composer}>
            <TextInput
              testID="loupe-link-input"
              style={shared.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="myapp://path"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={() => void add()}
            />
            <Pressable testID="loupe-link-add" onPress={() => void add()} hitSlop={8}>
              <Text style={styles.action}>Add</Text>
            </Pressable>
          </View>
          <FlatList
            data={links}
            keyExtractor={(url) => url}
            ListEmptyComponent={
              <Text style={styles.empty}>
                No links yet. Add one above, fire it, and watch it arrive under history.
              </Text>
            }
            renderItem={({ item }) => (
              <ListRow
                actions={
                  <>
                    <Pressable testID={`loupe-fire-${item}`} onPress={() => void fire(item)} hitSlop={8}>
                      <Text style={styles.action}>▶</Text>
                    </Pressable>
                    <Pressable
                      testID={`loupe-remove-${item}`}
                      hitSlop={8}
                      onPress={() =>
                        confirmDelete(item, () => {
                          clearError(item);
                          void linkStore.remove(item).then(refresh);
                        })
                      }
                    >
                      <Text style={[styles.action, { color: theme.colors.error }]}>✕</Text>
                    </Pressable>
                  </>
                }
              >
                <Text style={styles.url}>{item}</Text>
                {errors[item] && <Text style={styles.error}>{errors[item]}</Text>}
              </ListRow>
            )}
          />

        </>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e: DebugEvent) => e.id}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No deep links yet. Fire one from the links tab, or open a link from
              outside the app.
            </Text>
          }
          renderItem={({ item }) => {
            const p = item.payload as DeepLinkPayload;
            const outgoing = p.direction === 'outgoing';
            return (
              <ListRow
                label={
                  <Text
                    style={[
                      styles.direction,
                      { color: outgoing ? theme.colors.accent : theme.colors.success },
                    ]}
                  >
                    {outgoing ? 'OUT' : 'IN'}
                  </Text>
                }
              >
                <Text style={styles.url}>{p.url}</Text>
                <Text style={styles.meta}>
                  {outgoing ? (p.opened ? 'opened' : 'failed') : p.arrival}
                </Text>
                {p.error && <Text style={styles.error}>{p.error}</Text>}
              </ListRow>
            );
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.font.size.md,
    padding: theme.spacing.xl,
    textAlign: 'center',
  },
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceRaised,
  },
  chipActive: { backgroundColor: theme.colors.accent },
  chipText: { color: theme.colors.textMuted, fontSize: theme.font.size.sm },
  chipTextActive: { color: theme.colors.surface, fontWeight: '600' },
  url: { flex: 1, color: theme.colors.text, fontSize: theme.font.size.md, fontFamily: theme.font.mono },
  direction: { fontSize: theme.font.size.xs, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.size.xs, marginTop: theme.spacing.xs },
  action: { color: theme.colors.accent, fontSize: theme.font.size.lg },
  error: { color: theme.colors.error, fontSize: theme.font.size.xs, marginTop: theme.spacing.xs },
  // Above the list, not below it. React Native's LogBox notification banner is
  // pinned to the bottom of the screen above every view including this Modal,
  // so a bottom-anchored composer is occluded for the whole of a normal dev
  // session — the moment the app logs its first warning. Chasing it with
  // padding would be guesswork against a banner whose height is not ours.
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
});
