import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, screen, act } from '@testing-library/react-native';
import { DebugEventBus } from '@loupe/core';
import { OverlayRoot, openOverlay } from '../src/overlay/OverlayRoot';
import { registerTool, resetRegistry } from '../src/registry';

const bus = new DebugEventBus();

function tool(id: string, body: string) {
  return {
    id,
    title: `${id} title`,
    icon: { uri: '' },
    Panel: () => <Text>{body}</Text>,
  };
}

describe('OverlayRoot', () => {
  beforeEach(() => {
    resetRegistry();
    registerTool(tool('network', 'network panel body'));
    registerTool(tool('log', 'log panel body'));
  });

  it('renders the host app children', () => {
    render(
      <OverlayRoot bus={bus}>
        <Text>host app</Text>
      </OverlayRoot>,
    );
    expect(screen.getByText('host app')).toBeTruthy();
  });

  it('shows the bubble by default and hides it when disabled', () => {
    const { rerender } = render(<OverlayRoot bus={bus} />);
    expect(screen.getByTestId('loupe-bubble')).toBeTruthy();

    rerender(<OverlayRoot bus={bus} showBubble={false} />);
    expect(screen.queryByTestId('loupe-bubble')).toBeNull();
  });

  it('keeps the launcher closed until the bubble is pressed', () => {
    render(<OverlayRoot bus={bus} />);
    expect(screen.queryByText('network title')).toBeNull();

    fireEvent.press(screen.getByTestId('loupe-bubble'));
    expect(screen.getByText('network title')).toBeTruthy();
    expect(screen.getByText('log title')).toBeTruthy();
  });

  it('opens via the imperative handle, for the shake trigger', () => {
    render(<OverlayRoot bus={bus} />);
    // openOverlay() is the out-of-React call path the shake trigger uses, so
    // its state update is not inside a React event and must be wrapped in act().
    act(() => {
      openOverlay();
    });
    expect(screen.getByText('network title')).toBeTruthy();
  });

  it('mounts the selected tool panel', () => {
    render(<OverlayRoot bus={bus} />);
    fireEvent.press(screen.getByTestId('loupe-bubble'));
    fireEvent.press(screen.getByText('network title'));

    expect(screen.getByText('network panel body')).toBeTruthy();
    expect(screen.queryByText('log title')).toBeNull();
  });

  it('goes back from a panel to the launcher', () => {
    render(<OverlayRoot bus={bus} />);
    fireEvent.press(screen.getByTestId('loupe-bubble'));
    fireEvent.press(screen.getByText('network title'));
    fireEvent.press(screen.getByTestId('loupe-back'));

    expect(screen.getByText('log title')).toBeTruthy();
    expect(screen.queryByText('network panel body')).toBeNull();
  });

  it('closes back to the host app', () => {
    render(<OverlayRoot bus={bus} />);
    fireEvent.press(screen.getByTestId('loupe-bubble'));
    fireEvent.press(screen.getByTestId('loupe-close'));

    expect(screen.queryByText('network title')).toBeNull();
    expect(screen.getByTestId('loupe-bubble')).toBeTruthy();
  });

  it('tells the developer when no tools are registered', () => {
    resetRegistry();
    render(<OverlayRoot bus={bus} />);
    fireEvent.press(screen.getByTestId('loupe-bubble'));
    expect(screen.getByText(/no tools registered/i)).toBeTruthy();
  });
});
