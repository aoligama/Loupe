/**
 * Public type surface, re-exported by both entry points.
 *
 * Kept apart from the modules that implement these so a consumer importing a
 * type cannot drag runtime code into their bundle: everything here erases at
 * compile time.
 */
export type { StorageAdapter } from './storage/types';
export type { ShakeOptions, ShakeSource } from './shake/types';
export type { DebugTool, ToolIcon } from './registry';
export type { EventBus } from '@loupe/core';
export type {
  DebugEvent,
  Body,
  NetworkPayload,
  LogPayload,
  DeepLinkPayload,
  Subscription,
} from '@loupe/contract';
