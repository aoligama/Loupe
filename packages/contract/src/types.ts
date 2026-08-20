export interface DebugEvent {
  schemaVersion: number;
  id: string;
  type: string;
  timestamp: number;
  sourcePluginId: string;
  payload: unknown;
}

export interface Body {
  content: string | null;
  encoding: 'utf8' | 'base64' | 'none';
  size: number;
  truncated: boolean;
  mimeType: string | null;
}

export interface NetworkPayload {
  requestId: string;
  status: 'pending' | 'success' | 'error';
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: Body;
  startTime: number;
  statusCode: number | null;
  responseHeaders: Record<string, string> | null;
  responseBody: Body | null;
  endTime: number | null;
  durationMs: number | null;
  error: string | null;
  stack: 'native' | 'js';
  protocol: string | null;
}

export interface LogPayload {
  level: 'verbose' | 'debug' | 'info' | 'warn' | 'error';
  message: string;
  tag: string | null;
  source: 'native' | 'js';
  stackTrace: string | null;
  metadata: Record<string, unknown> | null;
}

export interface DeepLinkPayload {
  url: string;
  direction: 'outgoing' | 'incoming';
  /** How an incoming link arrived. null when outgoing. */
  arrival: 'cold-start' | 'running' | null;
  /** Whether the open call resolved. null when incoming. */
  opened: boolean | null;
  error: string | null;
}

export interface Subscription {
  dispose(): void;
}
