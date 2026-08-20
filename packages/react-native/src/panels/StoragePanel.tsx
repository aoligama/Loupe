import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import type { EventBus } from '@loupe/core';
import type { StorageAdapter } from '../storage/types';
import { detectStorageAdapters } from '../storage/detect';
import { theme } from '../overlay/theme';
import { ChipBar, ListRow, PanelChrome } from './shared';
import { copyValue } from './clipboard';

interface Props {
  bus: EventBus;
  adapters?: StorageAdapter[];
}

function confirm(title: string, message: string, onConfirm: () => void): void {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

// `bus` is accepted and deliberately unused: storage is not event-shaped
// (amendment A3), but DebugTool.Panel is typed ComponentType<{ bus: EventBus }>
// and every built-in goes through that same public type.
export const StoragePanel: React.FC<Props> = ({ bus: _bus, adapters }) => {
  const available = useMemo(() => adapters ?? detectStorageAdapters(), [adapters]);
  const [active, setActive] = useState<StorageAdapter | null>(available[0] ?? null);
  const [keys, setKeys] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [revealed, setRevealed] = useState(false);

  const refresh = useCallback(async () => {
    if (!active) return;
    try {
      setKeys(await active.list());
      setError(null);
    } catch (e) {
      // A present-but-broken backend is a real and confusing failure mode;
      // an empty list would look like "no data" instead of "it blew up".
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [active]);

  useEffect(() => {
    setSelected(null);
    setRevealed(false);
    void refresh();
  }, [refresh]);

  const open = useCallback(async (key: string) => {
    if (!active) return;
    setRevealed(false);
    setSelected(key);
    setDraft((await active.get(key)) ?? '');
  }, [active]);

  if (available.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          No storage backend detected. Install @react-native-async-storage/async-storage
          or react-native-mmkv to inspect storage.
        </Text>
      </View>
    );
  }

  const shown = keys.filter((k) =>
    filter.trim() ? k.toLowerCase().includes(filter.trim().toLowerCase()) : true,
  );

  return (
    <PanelChrome filter={filter} onFilter={setFilter} placeholder="Filter keys">
      <ChipBar>
        {available.map((adapter) => (
          <Pressable
            key={adapter.id}
            testID={`loupe-adapter-${adapter.id}`}
            onPress={() => setActive(adapter)}
            style={[styles.tab, active?.id === adapter.id && styles.tabActive]}
          >
            <Text style={[styles.tabText, active?.id === adapter.id && styles.tabTextActive]}>
              {adapter.label}
            </Text>
          </Pressable>
        ))}

        <Pressable testID="loupe-refresh" onPress={() => void refresh()} style={styles.tab}>
          <Text style={styles.tabText}>Refresh</Text>
        </Pressable>

        <Pressable
          testID="loupe-clear-all"
          onPress={() =>
            confirm('Clear all keys?', `This empties ${active?.label}. It cannot be undone.`, () => {
              void active?.clear().then(refresh);
            })
          }
          style={styles.tab}
        >
          <Text style={[styles.tabText, { color: theme.colors.error }]}>Clear all</Text>
        </Pressable>
      </ChipBar>

      {error && <Text style={styles.error}>{error}</Text>}

      {selected ? (
        <ScrollView contentContainerStyle={styles.detail}>
          <Pressable onPress={() => setSelected(null)} hitSlop={12}>
            <Text style={styles.back}>← Keys</Text>
          </Pressable>
          <Text style={styles.key}>{selected}</Text>

          {active?.sensitive && !revealed ? (
            // Masked until asked for. These are tokens and credentials, and a
            // dev build gets screen-shared; exposure should be a deliberate
            // act, not the default state of opening a row.
            <Pressable testID="loupe-reveal" onPress={() => setRevealed(true)}>
              <Text style={styles.masked}>{'•'.repeat(Math.min(draft.length, 32)) || '(empty)'}</Text>
              <Text style={styles.revealHint}>Tap to reveal</Text>
            </Pressable>
          ) : (
            <TextInput
              style={styles.editor}
              value={draft}
              onChangeText={setDraft}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}

          <View style={styles.actions}>
            {/* The editor is editable, so CodeBlock (read-only) is not the right
                shape here — but the value still needs to be copyable, which is
                the whole reason someone opens a 50KB entry. */}
            {(!active?.sensitive || revealed) && (
              <Pressable testID="loupe-copy" onPress={() => void copyValue(draft)}>
                <Text style={styles.action}>Copy</Text>
              </Pressable>
            )}

            <Pressable
              testID="loupe-save"
              onPress={() => void active?.set(selected, draft).then(refresh)}
            >
              <Text style={styles.action}>Save</Text>
            </Pressable>

            <Pressable
              testID="loupe-delete"
              onPress={() =>
                confirm('Delete key?', `"${selected}" will be removed.`, () => {
                  void active?.delete(selected).then(() => {
                    setSelected(null);
                    return refresh();
                  });
                })
              }
            >
              <Text style={[styles.action, { color: theme.colors.error }]}>Delete</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(k) => k}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {keys.length === 0 ? 'No keys stored.' : 'No keys match the filter.'}
            </Text>
          }
          renderItem={({ item }) => (
            <ListRow onPress={() => void open(item)}>
              <Text style={styles.key}>{item}</Text>
            </ListRow>
          )}
        />
      )}
    </PanelChrome>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  tab: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceRaised,
  },
  tabActive: { backgroundColor: theme.colors.accent },
  tabText: { color: theme.colors.textMuted, fontSize: theme.font.size.sm },
  tabTextActive: { color: theme.colors.surface, fontWeight: '600' },
  key: { color: theme.colors.text, fontSize: theme.font.size.md, fontFamily: theme.font.mono },
  detail: { padding: theme.spacing.md, gap: theme.spacing.md },
  back: { color: theme.colors.accent, fontSize: theme.font.size.md },
  editor: {
    minHeight: 120,
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.sm,
    color: theme.colors.text,
    fontFamily: theme.font.mono,
    fontSize: theme.font.size.md,
    padding: theme.spacing.md,
    textAlignVertical: 'top',
  },
  masked: {
    color: theme.colors.text,
    fontSize: theme.font.size.xl,
    fontFamily: theme.font.mono,
    letterSpacing: 2,
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
  },
  revealHint: { color: theme.colors.accent, fontSize: theme.font.size.sm, marginTop: theme.spacing.xs },
  actions: { flexDirection: 'row', gap: theme.spacing.xl },
  action: { color: theme.colors.accent, fontSize: theme.font.size.lg, fontWeight: '600' },
  error: {
    color: theme.colors.error,
    fontSize: theme.font.size.sm,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  empty: { flex: 1, justifyContent: 'center', padding: theme.spacing.xl },
  emptyText: { color: theme.colors.textMuted, fontSize: theme.font.size.md, textAlign: 'center' },
});
