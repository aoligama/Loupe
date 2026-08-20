import type { Body } from '@loupe/contract';

export interface GraphQLRequest {
  /** Operation name, from operationName or parsed off the document. */
  name: string | null;
  type: 'query' | 'mutation' | 'subscription' | null;
  variables: unknown;
  /** Operations in the request. >1 when the client batches into an array. */
  count: number;
}

export interface GraphQLResponse {
  errors: unknown[];
  hasData: boolean;
}

function parseJson(body: Body | null): unknown {
  if (!body || body.encoding !== 'utf8' || body.content === null) return null;
  try {
    return JSON.parse(body.content);
  } catch {
    // Truncated bodies are the common case here: capture caps at a byte limit,
    // so a large query arrives as invalid JSON. Not GraphQL as far as we can
    // tell, and guessing from a fragment would be worse than saying nothing.
    return null;
  }
}

function isOperation(v: unknown): v is { query: string; operationName?: unknown; variables?: unknown } {
  return typeof v === 'object' && v !== null && typeof (v as { query?: unknown }).query === 'string';
}

/**
 * The document itself is the fallback source of the name, because plenty of
 * clients omit operationName even when the document names the operation.
 * Anonymous operations (`query { ... }`) legitimately have no name.
 */
function readDocument(query: string): { name: string | null; type: GraphQLRequest['type'] } {
  const match = /(^|\s)(query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(query);
  if (match) return { type: match[2] as GraphQLRequest['type'], name: match[3] ?? null };

  // Shorthand `{ field }` is a query by definition.
  const bare = /(^|\s)(query|mutation|subscription)\s*[({]/.exec(query);
  if (bare) return { type: bare[2] as GraphQLRequest['type'], name: null };
  if (/^\s*\{/.test(query)) return { type: 'query', name: null };

  return { type: null, name: null };
}

/**
 * Recognise a GraphQL request from its body.
 *
 * Worth the effort because a GraphQL app sends every request as a POST to one
 * URL: without this, every row in the panel reads the same and the list is
 * useless for finding anything.
 */
export function parseGraphQLRequest(body: Body | null): GraphQLRequest | null {
  const parsed = parseJson(body);

  if (Array.isArray(parsed)) {
    const ops = parsed.filter(isOperation);
    if (ops.length === 0) return null;
    const first = ops[0]!;
    const doc = readDocument(first.query);
    return {
      name: typeof first.operationName === 'string' ? first.operationName : doc.name,
      type: doc.type,
      variables: first.variables ?? null,
      count: ops.length,
    };
  }

  if (!isOperation(parsed)) return null;
  const doc = readDocument(parsed.query);
  return {
    name: typeof parsed.operationName === 'string' ? parsed.operationName : doc.name,
    type: doc.type,
    variables: parsed.variables ?? null,
    count: 1,
  };
}

/**
 * A GraphQL response carries its failures in an `errors` array under HTTP 200.
 * Reading only the status code makes a failed operation look successful, which
 * is the single most misleading thing the network panel can do in an app whose
 * traffic is all GraphQL.
 */
export function parseGraphQLResponse(body: Body | null): GraphQLResponse | null {
  const parsed = parseJson(body);
  const one = (v: unknown): GraphQLResponse | null => {
    if (typeof v !== 'object' || v === null) return null;
    const o = v as { errors?: unknown; data?: unknown };
    const hasErrors = Array.isArray(o.errors);
    if (!hasErrors && !('data' in o)) return null;
    return {
      errors: hasErrors ? (o.errors as unknown[]) : [],
      hasData: 'data' in o && o.data !== null && o.data !== undefined,
    };
  };

  if (Array.isArray(parsed)) {
    const parts = parsed.map(one).filter((x): x is GraphQLResponse => x !== null);
    if (parts.length === 0) return null;
    return {
      errors: parts.flatMap((p) => p.errors),
      hasData: parts.some((p) => p.hasData),
    };
  }

  return one(parsed);
}

/** `GetAppointments`, `mutation`, or null when there is nothing better to show. */
export function operationLabel(op: GraphQLRequest): string | null {
  if (op.count > 1) return `${op.count} operations`;
  return op.name ?? op.type ?? null;
}
