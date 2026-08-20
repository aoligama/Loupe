import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../overlay/theme';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Depth that starts expanded. Deeper nodes render only when asked for. */
const DEFAULT_OPEN_DEPTH = 1;

/** Characters of a string leaf shown before it is truncated on its row. */
const LEAF_PREVIEW = 120;

/**
 * Depth "expand all" opens to. Deliberately finite: a deeply recursive
 * document would otherwise render every node at once, which is the cost
 * collapsing exists to avoid.
 */
const MAX_OPEN_DEPTH = 12;

function isContainer(v: Json): v is Json[] | { [key: string]: Json } {
  return v !== null && typeof v === 'object';
}

function entriesOf(v: Json[] | { [key: string]: Json }): [string, Json][] {
  return Array.isArray(v)
    ? v.map((item, i) => [String(i), item] as [string, Json])
    : Object.entries(v);
}

/** `{…} 5 keys` / `[…] 12 items` — enough to decide whether to open it. */
function summarise(v: Json[] | { [key: string]: Json }): string {
  if (Array.isArray(v)) {
    return v.length === 1 ? '[…] 1 item' : `[…] ${v.length} items`;
  }
  const n = Object.keys(v).length;
  return n === 1 ? '{…} 1 key' : `{…} ${n} keys`;
}

function leafStyle(v: Json) {
  if (typeof v === 'string') return styles.string;
  if (typeof v === 'number') return styles.number;
  return styles.keyword; // boolean and null
}

function leafText(v: Json): string {
  if (typeof v !== 'string') return String(v);
  return v.length > LEAF_PREVIEW ? `"${v.slice(0, LEAF_PREVIEW)}…"` : `"${v}"`;
}

const Node: React.FC<{
  name: string | null;
  value: Json;
  depth: number;
  openDepth: number;
}> = ({ name, value, depth, openDepth }) => {
  const [open, setOpen] = useState(depth < openDepth);
  const [full, setFull] = useState(false);
  const indent = { paddingLeft: depth * theme.spacing.md };

  if (!isContainer(value)) {
    const long = typeof value === 'string' && value.length > LEAF_PREVIEW;
    const body = (
      <View style={[styles.row, indent]}>
        {name !== null && <Text style={styles.key}>{name}: </Text>}
        <Text
          style={[styles.leaf, leafStyle(value)]}
          // Clipped to one line until asked for, so a long token or error
          // message does not push everything else off the screen — but always
          // reachable, because a value you cannot finish reading is not much
          // better than one you cannot see.
          numberOfLines={full ? undefined : 1}
          selectable
        >
          {full && typeof value === 'string' ? `"${value}"` : leafText(value)}
        </Text>
      </View>
    );

    return long ? (
      <Pressable testID={`loupe-json-leaf-${name ?? 'root'}`} onPress={() => setFull((f) => !f)}>
        {body}
      </Pressable>
    ) : (
      body
    );
  }

  const entries = entriesOf(value);

  // An empty container has nothing to expand, so it reads as one token rather
  // than a chevron and two braces spread over two lines.
  if (entries.length === 0) {
    return (
      <View style={[styles.row, indent]}>
        {name !== null && <Text style={styles.key}>{name}: </Text>}
        <Text style={styles.summary}>{Array.isArray(value) ? '[]' : '{}'}</Text>
      </View>
    );
  }

  return (
    <View>
      <Pressable
        testID={`loupe-json-node-${name ?? 'root'}`}
        onPress={() => setOpen((o) => !o)}
        style={[styles.row, indent]}
      >
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
        {name !== null && <Text style={styles.key}>{name}: </Text>}
        {!open && <Text style={styles.summary}>{summarise(value)}</Text>}
        {open && <Text style={styles.summary}>{Array.isArray(value) ? '[' : '{'}</Text>}
      </Pressable>

      {/* Children are not rendered while collapsed. That is what keeps a large
          document cheap: a 50KB body costs one summarised row until opened,
          rather than thousands of Text nodes nobody asked for. */}
      {open && (
        <>
          {entries.map(([childName, child]) => (
            <Node
              key={childName}
              name={childName}
              value={child}
              depth={depth + 1}
              openDepth={openDepth}
            />
          ))}
          <Text style={[styles.summary, indent]}>{Array.isArray(value) ? ']' : '}'}</Text>
        </>
      )}
    </View>
  );
};

/**
 * A structured view of a JSON value: collapsible containers, typed colouring,
 * and child counts on anything closed.
 *
 * Only ever rendered for a value that already parsed — CodeBlock owns that
 * decision, so a body that is not JSON is never handed here and never gets
 * reshaped into something the app did not send.
 */
export const JsonTree: React.FC<{ value: Json }> = ({ value }) => {
  const root = useMemo(() => value, [value]);
  // Remounting the tree is what applies a new depth to every node at once:
  // each node owns its open state, so there is nothing to broadcast to.
  const [openDepth, setOpenDepth] = useState(DEFAULT_OPEN_DEPTH);
  const [generation, setGeneration] = useState(0);

  const applyDepth = (depth: number) => {
    setOpenDepth(depth);
    setGeneration((g) => g + 1);
  };

  const expanded = openDepth > DEFAULT_OPEN_DEPTH;

  return (
    <View style={styles.tree}>
      <View style={styles.treeActions}>
        <Pressable
          testID="loupe-json-expand-all"
          hitSlop={8}
          onPress={() => applyDepth(expanded ? DEFAULT_OPEN_DEPTH : MAX_OPEN_DEPTH)}
        >
          <Text style={styles.treeAction}>{expanded ? 'collapse all' : 'expand all'}</Text>
        </Pressable>
      </View>
      <Node key={generation} name={null} value={root} depth={0} openDepth={openDepth} />
    </View>
  );
};

const styles = StyleSheet.create({
  tree: { paddingVertical: theme.spacing.xs },
  treeActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  treeAction: { color: theme.colors.accent, fontSize: theme.font.size.xs },
  row: { flexDirection: 'row', alignItems: 'center' },
  chevron: {
    color: theme.colors.textMuted,
    fontSize: theme.font.size.xs,
    width: 14,
  },
  key: { color: theme.colors.accent, fontSize: theme.font.size.xs, fontFamily: theme.font.mono },
  leaf: { flex: 1, fontSize: theme.font.size.xs, fontFamily: theme.font.mono },
  string: { color: theme.colors.success },
  number: { color: theme.colors.warn },
  keyword: { color: theme.colors.textMuted },
  summary: {
    color: theme.colors.textMuted,
    fontSize: theme.font.size.xs,
    fontFamily: theme.font.mono,
  },
});
