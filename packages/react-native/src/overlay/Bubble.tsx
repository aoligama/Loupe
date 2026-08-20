import React, { useRef } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, Text } from 'react-native';
import { theme } from './theme';

const SIZE = 48;
const MARGIN = 12;
const TAP_SLOP = 5;

export const Bubble: React.FC<{ onPress(): void }> = ({ onPress }) => {
  const { width, height } = Dimensions.get('window');
  const start = { x: width - SIZE - MARGIN, y: height / 2 };

  const position = useRef(new Animated.ValueXY(start)).current;
  // We track the resting position ourselves rather than reading it back out of
  // the Animated.Value: the only synchronous reader is __getValue, which is
  // private API and can change under an RN upgrade.
  const resting = useRef(start);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        position.setOffset(resting.current);
        position.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: position.x, dy: position.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_e, gesture) => {
        position.flattenOffset();

        const travelled = Math.abs(gesture.dx) + Math.abs(gesture.dy);
        if (travelled < TAP_SLOP) {
          position.setValue(resting.current);
          onPress();
          return;
        }

        // Snap to whichever vertical edge is nearer, and stay on screen.
        const landedX = resting.current.x + gesture.dx;
        const landedY = resting.current.y + gesture.dy;
        const snapped = {
          x: landedX + SIZE / 2 < width / 2 ? MARGIN : width - SIZE - MARGIN,
          y: Math.min(Math.max(landedY, MARGIN), height - SIZE - MARGIN),
        };

        resting.current = snapped;
        Animated.spring(position, {
          toValue: snapped,
          useNativeDriver: false,
          friction: 7,
        }).start();
      },
    }),
  ).current;

  return (
    <Animated.View
      testID="loupe-bubble"
      accessibilityRole="button"
      accessibilityLabel="Open Loupe"
      {...responder.panHandlers}
      style={[styles.bubble, { transform: position.getTranslateTransform() }]}
    >
      {/* U+2692 HAMMER AND PICK followed by U+FE0E VARIATION SELECTOR-15.
          Chosen over the U+1F528 hammer emoji so the glyph takes the accent
          colour below and matches the launcher's icons. The selector is not
          optional: iOS defaults U+2692 to its emoji presentation and renders
          it full-colour, ignoring the tint. Written as escapes because both
          characters are invisible or ambiguous in an editor. */}
      <Text style={styles.glyph}>{'\u2692\uFE0E'}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sized against SIZE rather than hard-coded, so the glyph keeps its
  // proportion if the bubble is ever resized. lineHeight matches the font size
  // to stop the taller line box from pushing the glyph off centre.
  glyph: { color: theme.colors.accent, fontSize: SIZE * 0.85, lineHeight: SIZE * 0.85 },
});
