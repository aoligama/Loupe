import { registerTool, getTools, resetRegistry } from '../src/registry';
import type { DebugTool } from '../src/registry';

const tool = (id: string): DebugTool => ({
  id,
  title: id,
  icon: { uri: '' },
  Panel: () => null,
});

describe('plugin registry', () => {
  beforeEach(() => resetRegistry());

  it('starts empty', () => {
    expect(getTools()).toEqual([]);
  });

  it('returns tools in registration order', () => {
    registerTool(tool('network'));
    registerTool(tool('log'));
    expect(getTools().map((t) => t.id)).toEqual(['network', 'log']);
  });

  it('rejects a duplicate id rather than silently shadowing', () => {
    registerTool(tool('network'));
    expect(() => registerTool(tool('network'))).toThrow(/already registered/i);
  });

  it('rejects an empty id', () => {
    expect(() => registerTool(tool(''))).toThrow(/non-empty/i);
  });

  it('returns a copy so callers cannot mutate the registry', () => {
    registerTool(tool('network'));
    getTools().push(tool('injected'));
    expect(getTools().map((t) => t.id)).toEqual(['network']);
  });
});
