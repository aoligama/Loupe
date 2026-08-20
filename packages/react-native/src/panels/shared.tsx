import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '../overlay/theme';
import { copyValue } from './clipboard';
import { JsonTree } from './JsonTree';
import type { Json } from './JsonTree';

interface Props {
  /** Event-backed panels only. Omitted where there is no buffer to report on. */
  dropped?: number;
  /**
   * Omit to hide the Clear button. Storage does: "Clear" there would sit beside
   * an actual destructive "Clear all" and read as "wipe my storage", when it
   * only ever meant "empty this panel's buffer".
   */
  onClear?(): void;
  filter: string;
  onFilter(value: string): void;
  placeholder: string;
  children: React.ReactNode;
}

export const PanelChrome: React.FC<Props> = ({
  dropped, onClear, filter, onFilter, placeholder, children,
}) => (
  <View style={styles.root}>
    <View style={styles.toolbar}>
      <TextInput
        testID="loupe-filter"
        style={styles.input}
        value={filter}
        onChangeText={onFilter}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {onClear && (
        <Pressable testID="loupe-clear" onPress={onClear} hitSlop={12}>
          <Text style={styles.clear}>Clear</Text>
        </Pressable>
      )}
    </View>

    {dropped !== undefined && dropped > 0 && (
      <Text style={styles.dropped}>{dropped} older entries dropped</Text>
    )}

    {children}
  </View>
);

/**
 * A horizontally scrolling row of chips, sized to its own content.
 *
 * Both style overrides are load-bearing. React Native gives every ScrollView
 * `flexGrow: 1`, so a horizontal one dropped into a panel's flex column
 * expands to swallow the vertical space the list below it leaves unused; a
 * content container then defaults to `alignItems: 'stretch'`, which stretches
 * each chip to that inflated height. Together they turn a chip row into pills
 * hundreds of points tall with clipped labels.
 *
 * The panels share this component rather than each configuring a ScrollView,
 * so the two properties cannot drift apart or be applied to only one panel.
 */
export const ChipBar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ScrollView
    testID="loupe-chip-bar"
    horizontal
    style={styles.chipBar}
    contentContainerStyle={styles.chipBarContent}
    showsHorizontalScrollIndicator={false}
  >
    {children}
  </ScrollView>
);

/**
 * One row of a panel's list.
 *
 * Every panel used to build its own row out of raw spacing tokens, which is
 * why they drifted apart on vertical rhythm and on where their text began.
 * The leading slot has a single fixed width shared by all of them, so `INFO`,
 * `POST` and `IN` all start their content at the same x — the alignment is a
 * property of this component, not of each panel remembering the same number.
 */
export const ListRow: React.FC<{
  label?: React.ReactNode;
  actions?: React.ReactNode;
  onPress?: () => void;
  children: React.ReactNode;
}> = ({ label, actions, onPress, children }) => {
  const body = (
    <View style={styles.listRow}>
      {label !== undefined && <View style={styles.listRowLabel}>{label}</View>}
      <View style={styles.listRowBody}>{children}</View>
      {actions !== undefined && <View style={styles.listRowActions}>{actions}</View>}
    </View>
  );

  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
};

/** Width of the leading slot: fits VERBOSE, the widest built-in label. */
const LABEL_WIDTH = 62;

/**
 * Parse only when the result is a container worth structuring.
 *
 * A bare scalar — `"hi"`, `42`, `null` — is technically valid JSON, but there
 * is nothing to explore in it and a tree would be noise around a single value.
 * Anything that fails to parse returns null and is rendered as the raw string:
 * a body that is not JSON must never be reshaped into something the app did
 * not send.
 */
function parseContainer(value: string): Json | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' ? (parsed as Json) : null;
  } catch {
    return null;
  }
}

/**
 * A string value: pretty-printed when it is JSON, copyable, and bounded until
 * the reader asks for the rest.
 *
 * Collapsed it renders at most `previewLines` lines. That cap is the point —
 * a 50KB response body rendered eagerly stalls the panel, and the example app
 * seeds exactly such a value to keep that honest.
 */
export const CodeBlock: React.FC<{ value: string; previewLines?: number }> = ({
  value,
  previewLines = 6,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [raw, setRaw] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const json = useMemo(() => parseContainer(value), [value]);
  const text = value;
  // Copying "GET" or "200" is never worth a button — the value is short enough
  // to read and retype, and an action on every field turns a detail view into
  // a wall of blue. Offer it where retyping is actually painful.
  const showCopy = json !== null || value.length > 40 || value.includes('\n');
  const lineCount = useMemo(() => text.split('\n').length, [text]);
  const truncated = lineCount > previewLines;

  const copy = useCallback(() => {
    void copyValue(value);
    // Acknowledge the tap. Without it the user cannot tell a copy happened and
    // taps again to be sure, which is the friction this exists to remove.
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }, [value]);

  // Closing the panel within the acknowledgement window would otherwise leave
  // the timer to fire setState on an unmounted component — and keeps the Jest
  // process alive after the suite finishes, which is how this was spotted.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <View style={styles.codeBlock}>
      {(json !== null || truncated || showCopy) && (
      <View style={styles.codeActions}>
        {json !== null && (
          // Structured by default, but the exact bytes stay one tap away.
          // Whitespace and key order are sometimes the thing being debugged,
          // and the tree cannot show either.
          <Pressable testID="loupe-code-raw" onPress={() => setRaw((r) => !r)} hitSlop={8}>
            <Text style={styles.codeAction}>{raw ? 'tree' : 'raw'}</Text>
          </Pressable>
        )}
        {json === null && truncated && (
          <Pressable testID="loupe-code-expand" onPress={() => setExpanded((e) => !e)} hitSlop={8}>
            <Text style={styles.codeAction}>
              {expanded ? 'collapse' : `expand (${lineCount} lines)`}
            </Text>
          </Pressable>
        )}
        {showCopy && (
          <Pressable testID="loupe-code-copy" onPress={copy} hitSlop={8}>
            <Text style={styles.codeAction}>{copied ? 'copied' : 'copy'}</Text>
          </Pressable>
        )}
      </View>
      )}

      {json !== null && !raw ? (
        <JsonTree value={json} />
      ) : (
        <Text
          testID="loupe-code-text"
          style={styles.codeText}
          numberOfLines={expanded ? undefined : previewLines}
          selectable
        >
          {text}
        </Text>
      )}
    </View>
  );
};

export const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <CodeBlock value={value} />
  </View>
);

export const styles = StyleSheet.create({
  root: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.sm,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: theme.font.size.md,
  },
  clear: { color: theme.colors.accent, fontSize: theme.font.size.md },
  chipBar: { flexGrow: 0 },
  chipBarContent: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    // Padded on both sides so the row is correctly spaced wherever it is
    // placed. It previously had bottom padding only, which looked right under
    // PanelChrome's toolbar and collided with the header in the one panel that
    // put it first.
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  listRowLabel: { width: LABEL_WIDTH },
  listRowBody: { flex: 1 },
  listRowActions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  codeBlock: { gap: theme.spacing.xs },
  codeActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.md,
  },
  codeAction: { color: theme.colors.accent, fontSize: theme.font.size.xs },
  codeText: { color: theme.colors.text, fontSize: theme.font.size.sm, fontFamily: theme.font.mono },
  dropped: {
    color: theme.colors.warn,
    fontSize: theme.font.size.sm,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  row: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs },
  rowLabel: { color: theme.colors.textMuted, fontSize: theme.font.size.xs, textTransform: 'uppercase' },
  rowValue: { color: theme.colors.text, fontSize: theme.font.size.md, fontFamily: theme.font.mono },
  listItem: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
});
