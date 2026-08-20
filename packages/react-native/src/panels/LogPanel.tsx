import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text } from 'react-native';
import type { DebugEvent, LogPayload } from '@loupe/contract';
import type { EventBus } from '@loupe/core';
import { theme } from '../overlay/theme';
import { useEvents } from './useEvents';
import { ChipBar, CodeBlock, ListRow, PanelChrome } from './shared';

const LEVELS: LogPayload['level'][] = ['verbose', 'debug', 'info', 'warn', 'error'];

const LEVEL_COLORS: Record<LogPayload['level'], string> = {
  verbose: theme.colors.textMuted,
  debug: theme.colors.textMuted,
  info: theme.colors.text,
  warn: theme.colors.warn,
  error: theme.colors.error,
};

export const LogPanel: React.FC<{ bus: EventBus }> = ({ bus }) => {
  const { events, dropped, clear } = useEvents(bus, 'log');
  const [filter, setFilter] = useState('');
  const [minLevel, setMinLevel] = useState<LogPayload['level']>('verbose');
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const floor = LEVELS.indexOf(minLevel);
    return events
      .map((e: DebugEvent) => ({ id: e.id, payload: e.payload as LogPayload }))
      .filter(({ payload }) => LEVELS.indexOf(payload.level) >= floor)
      .filter(({ payload }) => (needle ? payload.message.toLowerCase().includes(needle) : true));
  }, [events, filter, minLevel]);

  return (
    <PanelChrome
      dropped={dropped}
      onClear={clear}
      filter={filter}
      onFilter={setFilter}
      placeholder="Filter messages"
    >
      <ChipBar>
        {LEVELS.map((level) => (
          <Pressable
            key={level}
            testID={`loupe-level-${level}`}
            onPress={() => setMinLevel(level)}
            style={[styles.chip, minLevel === level && styles.chipActive]}
          >
            <Text style={[styles.chipText, minLevel === level && styles.chipTextActive]}>
              {level}
            </Text>
          </Pressable>
        ))}
      </ChipBar>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => {
          const open = expanded === item.id;
          const color = LEVEL_COLORS[item.payload.level];
          return (
            <ListRow
              onPress={() => setExpanded(open ? null : item.id)}
              label={<Text style={[styles.level, { color }]}>{item.payload.level.toUpperCase()}</Text>}
            >
              {open ? (
                // Expanded, the message is the thing being read and quite
                // possibly a JSON payload, so it gets the formatted, copyable
                // treatment. Collapsed it stays a two-line summary — a scannable
                // list matters more than a formatted one.
                <CodeBlock value={item.payload.message} />
              ) : (
                <Text style={[styles.message, { color }]} numberOfLines={2}>
                  {item.payload.message}
                </Text>
              )}

              {open && item.payload.stackTrace && (
                <CodeBlock value={item.payload.stackTrace} previewLines={8} />
              )}
            </ListRow>
          );
        }}
      />
    </PanelChrome>
  );
};

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceRaised,
  },
  chipActive: { backgroundColor: theme.colors.accent },
  chipText: { color: theme.colors.textMuted, fontSize: theme.font.size.sm },
  chipTextActive: { color: theme.colors.surface, fontWeight: '600' },
  level: { fontSize: theme.font.size.xs, fontWeight: '700' },
  message: { flex: 1, fontSize: theme.font.size.md, fontFamily: theme.font.mono },
});
