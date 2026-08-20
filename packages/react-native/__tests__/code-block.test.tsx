const mockCopyValue = jest.fn();
jest.mock('../src/panels/clipboard', () => ({
  copyValue: (...args: unknown[]) => mockCopyValue(...args),
}));

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { CodeBlock, ListRow } from '../src/panels/shared';
import { Text } from 'react-native';

const textOf = (testID: string) => screen.getByTestId(testID).props.children as string;

beforeEach(() => {
  mockCopyValue.mockReset();
});

describe('CodeBlock JSON handling', () => {
  it('renders a JSON object as a structured tree, not text', () => {
    render(<CodeBlock value='{"a":1,"b":{"c":2}}' />);

    // No flat text node at all — the value is a tree of rows.
    expect(screen.queryByTestId('loupe-code-text')).toBeNull();
    expect(screen.getByText('a: ')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('keeps nested containers collapsed until opened', () => {
    // What keeps a large body cheap: a closed node renders a summary, not its
    // children. The 50KB seed entry depends on this staying true.
    render(<CodeBlock value='{"a":1,"b":{"c":2}}' />);

    expect(screen.getByText('{…} 1 key')).toBeTruthy();
    expect(screen.queryByText('c: ')).toBeNull();

    fireEvent.press(screen.getByTestId('loupe-json-node-b'));

    expect(screen.getByText('c: ')).toBeTruthy();
  });

  it('shows the exact original bytes behind the raw toggle', () => {
    // Whitespace and key order are sometimes the thing being debugged, and the
    // tree can show neither.
    const raw = '{"b":2,   "a":1}';
    render(<CodeBlock value={raw} />);

    fireEvent.press(screen.getByTestId('loupe-code-raw'));

    expect(textOf('loupe-code-text')).toBe(raw);
  });

  it('passes a non-JSON string through byte-identical', () => {
    // A formatter that "fixes" a body the app did not send makes the tool lie
    // about what actually crossed the wire. This is the case that matters most.
    const raw = 'not json at all { oops';

    render(<CodeBlock value={raw} />);

    expect(textOf('loupe-code-text')).toBe(raw);
  });

  it('leaves a bare JSON scalar as text rather than building a tree round it', () => {
    // JSON.parse('"hi"') succeeds and would round-trip to a quoted string;
    // re-stringifying a scalar changes the value the user is looking at.
    render(<CodeBlock value='"hi"' />);

    expect(textOf('loupe-code-text')).toBe('"hi"');
  });

  it('preserves an empty string', () => {
    render(<CodeBlock value="" />);

    expect(textOf('loupe-code-text')).toBe('');
  });
});

describe('CodeBlock bounding', () => {
  const long = Array.from({length: 40}, (_, i) => `line ${i}`).join('\n');

  it('caps the rendered lines until expanded', () => {
    render(<CodeBlock value={long} previewLines={6} />);

    expect(screen.getByTestId('loupe-code-text').props.numberOfLines).toBe(6);
  });

  it('removes the cap when expanded', () => {
    render(<CodeBlock value={long} previewLines={6} />);

    fireEvent.press(screen.getByTestId('loupe-code-expand'));

    expect(screen.getByTestId('loupe-code-text').props.numberOfLines).toBeUndefined();
  });

  it('offers no expand control when the value already fits', () => {
    render(<CodeBlock value={'a\nb'} previewLines={6} />);

    expect(screen.queryByTestId('loupe-code-expand')).toBeNull();
  });
});

describe('CodeBlock copying', () => {
  it('offers no copy button for a short scalar', () => {
    // A copy action on "GET" or "200" is noise — the value is already on
    // screen and shorter than the button offering to copy it.
    render(<CodeBlock value="GET" />);

    expect(screen.queryByTestId('loupe-code-copy')).toBeNull();
  });

  it('offers copy for a multiline value even when it is short', () => {
    render(<CodeBlock value={'a\nb'} />);

    expect(screen.getByTestId('loupe-code-copy')).toBeTruthy();
  });

  it('copies the original value, not the pretty-printed one', () => {
    // The user asked for what the app sent. Handing them the reformatted text
    // would silently alter bytes they may be about to paste into a bug report.
    render(<CodeBlock value='{"a":1}' />);

    fireEvent.press(screen.getByTestId('loupe-code-copy'));

    expect(mockCopyValue).toHaveBeenCalledWith('{"a":1}');
  });

  it('acknowledges the copy and reverts', () => {
    jest.useFakeTimers();
    // Long enough to earn a copy button: short scalars deliberately have none.
    render(<CodeBlock value={'x'.repeat(60)} />);

    fireEvent.press(screen.getByTestId('loupe-code-copy'));
    expect(screen.getByText('copied')).toBeTruthy();

    act(() => { jest.advanceTimersByTime(1600); });
    expect(screen.getByText('copy')).toBeTruthy();

    jest.useRealTimers();
  });
});

describe('ListRow', () => {
  it('gives every row the same leading slot width so bodies align', () => {
    const {UNSAFE_getAllByType} = render(
      <ListRow label={<Text>INFO</Text>}><Text>message</Text></ListRow>,
    );

    // The alignment guarantee is the slot's fixed width. Panels must not each
    // re-derive it, which is what caused the drift this component replaces.
    const slot = UNSAFE_getAllByType(require('react-native').View)
      .map((v: {props: {style?: unknown}}) => require('react-native').StyleSheet.flatten(v.props.style))
      .find((s: {width?: number} | undefined) => s?.width !== undefined);

    expect(slot?.width).toBe(62);
  });

  it('fires onPress when given one', () => {
    const onPress = jest.fn();
    render(<ListRow onPress={onPress}><Text>tap me</Text></ListRow>);

    fireEvent.press(screen.getByText('tap me'));

    expect(onPress).toHaveBeenCalled();
  });
});

describe('JsonTree with large content', () => {
  it('opens every level at once with expand all', () => {
    // A deep response is unreadable if reaching the interesting part means
    // tapping through each level by hand.
    render(<CodeBlock value={JSON.stringify({ a: { b: { c: { d: 'deep' } } } })} />);

    expect(screen.queryByText('d: ')).toBeNull();

    fireEvent.press(screen.getByTestId('loupe-json-expand-all'));

    expect(screen.getByText('d: ')).toBeTruthy();
  });

  it('collapses back again', () => {
    render(<CodeBlock value={JSON.stringify({ a: { b: { c: 1 } } })} />);

    fireEvent.press(screen.getByTestId('loupe-json-expand-all'));
    expect(screen.getByText('c: ')).toBeTruthy();

    fireEvent.press(screen.getByTestId('loupe-json-expand-all'));
    expect(screen.queryByText('c: ')).toBeNull();
  });

  it('reveals the whole of a long string value on tap', () => {
    // A GraphQL error message or a token is routinely longer than a row, and a
    // value you cannot finish reading is barely better than one you cannot see.
    const long = 'E'.repeat(400);
    render(<CodeBlock value={JSON.stringify({ message: long })} />);

    const clipped = screen.getByText(`"${long.slice(0, 120)}…"`);
    expect(clipped).toBeTruthy();

    fireEvent.press(screen.getByTestId('loupe-json-leaf-message'));

    expect(screen.getByText(`"${long}"`)).toBeTruthy();
  });

  it('leaves short values alone, with nothing extra to tap', () => {
    render(<CodeBlock value={JSON.stringify({ ok: 'short' })} />);

    expect(screen.queryByTestId('loupe-json-leaf-ok')).toBeNull();
  });
});
