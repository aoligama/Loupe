import { getTools, registerTool } from './registry';
import { NetworkPanel } from './panels/NetworkPanel';
import { LogPanel } from './panels/LogPanel';
import { StoragePanel } from './panels/StoragePanel';
import { DeepLinkPanel } from './panels/DeepLinkPanel';

/**
 * The built-ins go through the same public API a third party would use. If
 * `network` cannot be built with registerTool, nobody else's tool can either.
 */
export function registerBuiltIns(): void {
  const existing = new Set(getTools().map((t) => t.id));

  if (!existing.has('network')) {
    registerTool({ id: 'network', title: 'network', icon: { glyph: '⇅' }, Panel: NetworkPanel });
  }
  if (!existing.has('log')) {
    registerTool({ id: 'log', title: 'log', icon: { glyph: '≡' }, Panel: LogPanel });
  }
  if (!existing.has('storage')) {
    registerTool({ id: 'storage', title: 'storage', icon: { glyph: '▤' }, Panel: StoragePanel });
  }
  if (!existing.has('deeplink')) {
    // U+2197 needs the trailing U+FE0E or iOS renders it as a full-colour
    // emoji and ignores the accent tint the other three icons use.
    registerTool({
      id: 'deeplink',
      title: 'deeplink',
      icon: { glyph: '\u2197\uFE0E' },
      Panel: DeepLinkPanel,
    });
  }
}
