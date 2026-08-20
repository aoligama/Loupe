import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { EventBus } from '@loupe/core';
import { getTools } from '../registry';
import type { DebugTool } from '../registry';
import { Bubble } from './Bubble';
import { Launcher } from './Launcher';
import { theme } from './theme';

type Handle = { open(): void; close(): void };
let handle: Handle | null = null;

/** Imperative entry point for triggers that live outside React. */
export function openOverlay(): void {
  handle?.open();
}

export function closeOverlay(): void {
  handle?.close();
}

interface Props {
  bus: EventBus;
  showBubble?: boolean;
  children?: React.ReactNode;
}

export const OverlayRoot: React.FC<Props> = ({ bus, showBubble = true, children }) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<DebugTool | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    handle = {
      open: () => { if (mounted.current) setOpen(true); },
      close: () => { if (mounted.current) setOpen(false); },
    };
    return () => {
      mounted.current = false;
      handle = null;
    };
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setActive(null);
  }, []);

  const ActivePanel = active?.Panel;

  return (
    <View style={styles.fill}>
      {children}

      {showBubble && <Bubble onPress={() => setOpen(true)} />}

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <View style={styles.scrim}>
          <View style={styles.sheet}>
            {ActivePanel ? (
              <>
                <View style={styles.panelHeader}>
                  <Pressable testID="loupe-back" onPress={() => setActive(null)} hitSlop={12}>
                    <Text style={styles.action}>Back</Text>
                  </Pressable>
                  <Text style={styles.panelTitle}>{active.title}</Text>
                  <Pressable testID="loupe-close" onPress={close} hitSlop={12}>
                    <Text style={styles.action}>Close</Text>
                  </Pressable>
                </View>
                <ActivePanel bus={bus} />
              </>
            ) : (
              <Launcher tools={getTools()} onSelect={setActive} onClose={close} />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrim: { flex: 1, backgroundColor: theme.colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    height: '85%',
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.md,
    borderTopRightRadius: theme.radius.md,
    overflow: 'hidden',
    // The sheet is anchored to the bottom of the screen, so without this its
    // last row sits under the home indicator. Any panel with a bottom-anchored
    // control gets clipped — the deeplink composer's input and Add button were
    // half cut off. Inset here rather than in that one panel, so every panel
    // ends above the indicator. Hard-coded because React Native core exposes
    // no safe-area API and Loupe will not take a dependency for one; 34pt is
    // the indicator's height on the devices that have it.
    paddingBottom: Platform.OS === 'ios' ? 34 : theme.spacing.md,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  panelTitle: { color: theme.colors.text, fontSize: theme.font.size.lg, fontWeight: '600' },
  action: { color: theme.colors.accent, fontSize: theme.font.size.lg },
});
