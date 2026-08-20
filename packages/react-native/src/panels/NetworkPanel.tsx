import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { DebugEvent, NetworkPayload, Body } from '@loupe/contract';
import type { EventBus } from '@loupe/core';
import { theme } from '../overlay/theme';
import { useEvents } from './useEvents';
import { CodeBlock, ListRow, PanelChrome, Row } from './shared';
import { operationLabel, parseGraphQLRequest, parseGraphQLResponse } from './graphql';
import { toCurl } from './curl';
import { copyValue } from './clipboard';
import type { GraphQLRequest, GraphQLResponse } from './graphql';

interface Entry {
  payload: NetworkPayload;
  gql: GraphQLRequest | null;
  gqlResponse: GraphQLResponse | null;
}

function pathOf(url: string): string {
  const withoutScheme = url.replace(/^[a-z]+:\/\/[^/]+/i, '');
  return withoutScheme || url;
}

/** QRY / MUT / SUB, or the HTTP verb for anything that is not GraphQL. */
function leadLabel(e: Entry): string {
  if (!e.gql) return e.payload.method;
  if (e.gql.type === 'mutation') return 'MUT';
  if (e.gql.type === 'subscription') return 'SUB';
  return 'QRY';
}

/**
 * What to call the row.
 *
 * A GraphQL app POSTs everything to one URL, so the path is the same on every
 * row and tells you nothing. The operation name is the only thing that makes
 * the list scannable.
 */
function titleOf(e: Entry): string {
  const label = e.gql ? operationLabel(e.gql) : null;
  return label ?? pathOf(e.payload.url);
}

/**
 * The second line: the path when the title is an operation name, plus timing.
 *
 * Deliberately omits "pending" — the status chip already says it, and printing
 * it twice on the same row is noise.
 */
function subtitleOf(e: Entry): string {
  const parts: string[] = [];
  // The path still matters when the title is an operation name: it is how you
  // tell two GraphQL endpoints apart.
  if (e.gql) parts.push(pathOf(e.payload.url));
  if (e.payload.durationMs !== null) parts.push(`${e.payload.durationMs} ms`);
  return parts.join(' · ');
}

function statusLabel(e: Entry): string {
  const { payload } = e;
  if (payload.status === 'pending') return 'pending';
  if (payload.statusCode === null) return 'ERR';

  // A GraphQL failure is an HTTP 200 with an errors array. Showing the status
  // code alone would render a failed operation in success green, which is the
  // most misleading thing this panel could do for an app whose traffic is all
  // GraphQL. The count goes next to the code rather than replacing it — the
  // transport really did succeed, and hiding that would be its own lie.
  const errors = e.gqlResponse?.errors.length ?? 0;
  if (errors > 0) return `${payload.statusCode} · ${errors} err`;

  return String(payload.statusCode);
}

function statusColor(e: Entry): string {
  const { payload } = e;
  if (payload.status === 'pending') return theme.colors.textMuted;
  if (payload.status === 'error') return theme.colors.error;
  if ((e.gqlResponse?.errors.length ?? 0) > 0) return theme.colors.error;
  if (payload.statusCode !== null && payload.statusCode >= 400) return theme.colors.error;
  return theme.colors.success;
}

const BodyView: React.FC<{ label: string; body: Body | null }> = ({ label, body }) => {
  if (!body || body.encoding === 'none') return <Row label={label} value="(empty)" />;
  return (
    <View>
      <Row label={label} value={body.content ?? '(binary)'} />
      <Text style={styles.meta}>
        {body.mimeType ?? 'unknown type'} · {body.size} bytes
        {body.truncated ? ' · truncated' : ''}
        {body.encoding === 'base64' ? ' · base64' : ''}
      </Text>
    </View>
  );
};

export const NetworkPanel: React.FC<{ bus: EventBus }> = ({ bus }) => {
  const { events, dropped, clear } = useEvents(bus, 'network');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const entries = useMemo<Entry[]>(
    () =>
      events.map((e: DebugEvent) => {
        const payload = e.payload as NetworkPayload;
        return {
          payload,
          gql: parseGraphQLRequest(payload.requestBody),
          gqlResponse: parseGraphQLResponse(payload.responseBody),
        };
      }),
    [events],
  );

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return entries;
    // Matches the operation name too, so filtering by "Appointments" finds the
    // request in an app where every URL is identical.
    return entries.filter(
      (e) =>
        e.payload.url.toLowerCase().includes(needle) ||
        titleOf(e).toLowerCase().includes(needle),
    );
  }, [entries, filter]);

  const detail = rows.find((e) => e.payload.requestId === selected) ?? null;

  if (detail) {
    const { payload, gql, gqlResponse } = detail;
    const errors = gqlResponse?.errors ?? [];

    return (
      <ScrollView contentContainerStyle={styles.detail}>
        <View style={styles.detailBar}>
          <Pressable testID="loupe-detail-back" onPress={() => setSelected(null)} hitSlop={12}>
            <Text style={styles.back}>← Requests</Text>
          </Pressable>

          {/* Credentials are redacted. A curl command gets pasted into a
              terminal, a ticket or a chat, and for most apps the Authorization
              header is a live session token. */}
          <Pressable
            testID="loupe-copy-curl"
            hitSlop={12}
            onPress={() => void copyValue(toCurl(payload))}
          >
            <Text style={styles.back}>copy as curl</Text>
          </Pressable>
        </View>

        {/* Errors first. In a GraphQL app this is the reason the request is
            being looked at, and burying it under headers means scrolling past
            everything that is working to reach the thing that is not. */}
        {errors.length > 0 && (
          <View testID="loupe-gql-errors">
            <Text style={styles.errorHeading}>
              {errors.length === 1 ? 'GraphQL error' : `${errors.length} GraphQL errors`}
            </Text>
            <CodeBlock value={JSON.stringify(errors)} />
          </View>
        )}

        {gql && (
          <>
            <Row label="operation" value={gql.name ?? '(anonymous)'} />
            <Row label="type" value={gql.type ?? 'unknown'} />
            {gql.count > 1 && <Row label="batched" value={`${gql.count} operations`} />}
            {gql.variables !== null && gql.variables !== undefined && (
              <Row label="variables" value={JSON.stringify(gql.variables)} />
            )}
          </>
        )}

        <Row label="url" value={payload.url} />
        <Row label="method" value={payload.method} />
        <Row label="status" value={statusLabel(detail)} />
        {payload.durationMs !== null && <Row label="duration" value={`${payload.durationMs} ms`} />}
        {payload.error && <Row label="error" value={payload.error} />}

        <Row label="request headers" value={JSON.stringify(payload.requestHeaders)} />
        <BodyView label="request body" body={payload.requestBody} />
        <Row
          label="response headers"
          value={payload.responseHeaders ? JSON.stringify(payload.responseHeaders) : '(none)'}
        />
        <BodyView label="response body" body={payload.responseBody} />
      </ScrollView>
    );
  }

  return (
    <PanelChrome
      dropped={dropped}
      onClear={clear}
      filter={filter}
      onFilter={setFilter}
      placeholder="Filter by URL or operation"
    >
      <FlatList
        data={rows}
        keyExtractor={(e) => e.payload.requestId}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {entries.length === 0 ? 'No requests yet.' : 'No requests match the filter.'}
          </Text>
        }
        renderItem={({ item }) => (
          <ListRow
            onPress={() => setSelected(item.payload.requestId)}
            label={<Text style={styles.method}>{leadLabel(item)}</Text>}
            actions={
              <Text style={[styles.status, { color: statusColor(item) }]}>
                {statusLabel(item)}
              </Text>
            }
          >
            <Text style={styles.path} numberOfLines={1}>{titleOf(item)}</Text>
            {subtitleOf(item) !== '' && (
              <Text style={styles.sub} numberOfLines={1}>{subtitleOf(item)}</Text>
            )}
          </ListRow>
        )}
      />
    </PanelChrome>
  );
};

const styles = StyleSheet.create({
  method: {
    color: theme.colors.accent,
    fontSize: theme.font.size.xs,
    fontWeight: '600',
  },
  status: { fontSize: theme.font.size.xs, fontWeight: '600' },
  path: { color: theme.colors.text, fontSize: theme.font.size.md },
  sub: { color: theme.colors.textMuted, fontSize: theme.font.size.xs, marginTop: 2 },
  detail: { padding: theme.spacing.md, gap: theme.spacing.sm },
  back: { color: theme.colors.accent, fontSize: theme.font.size.md },
  detailBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  errorHeading: {
    color: theme.colors.error,
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.font.size.md,
    padding: theme.spacing.xl,
    textAlign: 'center',
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: theme.font.size.xs,
    paddingHorizontal: theme.spacing.md,
  },
});
