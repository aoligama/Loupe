import React from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { DebugTool } from '../registry';
import { theme } from './theme';

interface Props {
  tools: DebugTool[];
  onSelect(tool: DebugTool): void;
  onClose(): void;
}

export const Launcher: React.FC<Props> = ({ tools, onSelect, onClose }) => (
  <View style={styles.root}>
    <View style={styles.header}>
      <Text style={styles.title}>Loupe</Text>
      <Pressable testID="loupe-close" onPress={onClose} hitSlop={12}>
        <Text style={styles.close}>Close</Text>
      </Pressable>
    </View>

    {tools.length === 0 ? (
      <Text style={styles.empty}>
        No tools registered. Import react-native-loupe before your app code runs.
      </Text>
    ) : (
      <FlatList
        data={tools}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => onSelect(item)}>
            <View style={styles.iconSlot}>
              {typeof item.icon === 'object' && item.icon !== null && 'glyph' in item.icon ? (
                <Text style={styles.glyph}>{item.icon.glyph}</Text>
              ) : (
                <Image source={item.icon} style={styles.icon} resizeMode="contain" />
              )}
            </View>
            <Text style={styles.label}>{item.title}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      />
    )}
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: { color: theme.colors.text, fontSize: theme.font.size.xl, fontWeight: '600' },
  close: { color: theme.colors.accent, fontSize: theme.font.size.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  // Fixed width rather than intrinsic: the built-in glyphs (⇅ ≡ ▤ ↗) and any
  // third-party image icon all measure differently, and without a common slot
  // every title would start at a different x.
  iconSlot: { width: 28, alignItems: 'center' },
  icon: { width: 24, height: 24 },
  glyph: { fontSize: theme.font.size.xl, color: theme.colors.accent },
  label: { flex: 1, color: theme.colors.text, fontSize: theme.font.size.lg },
  chevron: { color: theme.colors.textMuted, fontSize: theme.font.size.xl },
  empty: { color: theme.colors.textMuted, padding: theme.spacing.xl, textAlign: 'center' },
});
