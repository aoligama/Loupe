import type { Body } from '@loupe/contract';
import {
  operationLabel,
  parseGraphQLRequest,
  parseGraphQLResponse,
} from '../src/panels/graphql';

const body = (content: string | null, over: Partial<Body> = {}): Body => ({
  content,
  encoding: 'utf8',
  size: content?.length ?? 0,
  truncated: false,
  mimeType: 'application/json',
  ...over,
});

describe('parseGraphQLRequest', () => {
  it('reads the operation name the client sent', () => {
    const op = parseGraphQLRequest(
      body(JSON.stringify({ operationName: 'GetAppointments', query: 'query GetAppointments { me { id } }' })),
    );

    expect(op).toMatchObject({ name: 'GetAppointments', type: 'query', count: 1 });
  });

  it('falls back to the name on the document when operationName is omitted', () => {
    // Plenty of clients omit operationName even when the document names the
    // operation, and the name is the only thing that makes the row readable.
    const op = parseGraphQLRequest(body(JSON.stringify({ query: 'mutation SaveNote($id: ID!) { save(id: $id) }' })));

    expect(op).toMatchObject({ name: 'SaveNote', type: 'mutation' });
  });

  it('reads the type of an anonymous named-keyword operation', () => {
    expect(parseGraphQLRequest(body(JSON.stringify({ query: 'query { me { id } }' }))))
      .toMatchObject({ name: null, type: 'query' });
  });

  it('treats shorthand as a query', () => {
    expect(parseGraphQLRequest(body(JSON.stringify({ query: '{ me { id } }' }))))
      .toMatchObject({ type: 'query' });
  });

  it('carries variables through for display', () => {
    const op = parseGraphQLRequest(
      body(JSON.stringify({ query: 'query Q($id: ID!) { n(id: $id) }', variables: { id: 42 } })),
    );

    expect(op!.variables).toEqual({ id: 42 });
  });

  it('counts a batched array of operations', () => {
    const op = parseGraphQLRequest(
      body(JSON.stringify([{ query: 'query A { a }' }, { query: 'query B { b }' }])),
    );

    expect(op).toMatchObject({ count: 2, name: 'A' });
    expect(operationLabel(op!)).toBe('2 operations');
  });

  it('is not fooled by a plain REST body', () => {
    expect(parseGraphQLRequest(body(JSON.stringify({ name: 'Amanda', id: 7 })))).toBeNull();
  });

  it('returns null for a truncated body rather than guessing', () => {
    // Capture caps bodies by byte count, so a large query arrives as invalid
    // JSON. Guessing an operation from a fragment would be worse than silence.
    expect(parseGraphQLRequest(body('{"query":"query GetApp', { truncated: true }))).toBeNull();
  });

  it('returns null for an empty or binary body', () => {
    expect(parseGraphQLRequest(null)).toBeNull();
    expect(parseGraphQLRequest(body(null, { encoding: 'none' }))).toBeNull();
    expect(parseGraphQLRequest(body('AAAA', { encoding: 'base64' }))).toBeNull();
  });
});

describe('parseGraphQLResponse', () => {
  it('finds errors returned under HTTP 200', () => {
    // The reason this module exists. A GraphQL failure is a 200 with an errors
    // array, so reading the status code alone makes it look like a success.
    const res = parseGraphQLResponse(
      body(JSON.stringify({ data: null, errors: [{ message: 'Unauthorized' }] })),
    );

    expect(res!.errors).toHaveLength(1);
    expect(res!.hasData).toBe(false);
  });

  it('reports a partial success, where data and errors arrive together', () => {
    const res = parseGraphQLResponse(
      body(JSON.stringify({ data: { me: { id: 1 } }, errors: [{ message: 'field failed' }] })),
    );

    expect(res!.errors).toHaveLength(1);
    expect(res!.hasData).toBe(true);
  });

  it('reports a clean success', () => {
    const res = parseGraphQLResponse(body(JSON.stringify({ data: { me: { id: 1 } } })));

    expect(res!.errors).toEqual([]);
    expect(res!.hasData).toBe(true);
  });

  it('aggregates errors across a batched response', () => {
    const res = parseGraphQLResponse(
      body(JSON.stringify([{ data: { a: 1 } }, { data: null, errors: [{ message: 'boom' }] }])),
    );

    expect(res!.errors).toHaveLength(1);
    expect(res!.hasData).toBe(true);
  });

  it('is null for a body that is not a GraphQL response', () => {
    expect(parseGraphQLResponse(body(JSON.stringify({ items: [] })))).toBeNull();
    expect(parseGraphQLResponse(null)).toBeNull();
  });
});
