import type { ComponentType } from 'react';
import type { ImageSourcePropType } from 'react-native';
import type { EventBus } from '@loupe/core';

export type ToolIcon = ImageSourcePropType | { glyph: string };

export interface DebugTool {
  id: string;
  title: string;
  icon: ToolIcon;
  Panel: ComponentType<{ bus: EventBus }>;
}

const tools: DebugTool[] = [];

export function registerTool(tool: DebugTool): void {
  if (!tool.id) {
    throw new Error('Loupe: a tool id must be a non-empty string.');
  }
  if (tools.some((t) => t.id === tool.id)) {
    throw new Error(
      `Loupe: a tool with id "${tool.id}" is already registered. ` +
        'Built-in ids network, log, storage, and deeplink are reserved.',
    );
  }
  tools.push(tool);
}

export function getTools(): DebugTool[] {
  return [...tools];
}

/** Test-only. Not part of the public API surface. */
export function resetRegistry(): void {
  tools.length = 0;
}
