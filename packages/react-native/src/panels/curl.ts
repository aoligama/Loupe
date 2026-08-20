import type { NetworkPayload } from '@loupe/contract';

/**
 * Single-quote for a POSIX shell.
 *
 * Everything is safe inside single quotes except a single quote itself, which
 * ends the string — so it is closed, escaped, and reopened. Getting this wrong
 * on a GraphQL body (full of quotes and braces) produces a command that looks
 * plausible and silently sends something different.
 */
function shellQuote(value: string): string {
  return `'${value.split("'").join(`'\\''`)}'`;
}

/** Headers that would be wrong, misleading, or dangerous to replay verbatim. */
function skipHeader(name: string): boolean {
  const n = name.toLowerCase();
  return (
    // Set by curl itself from the body it is given; a stale value makes the
    // request fail in ways that look like a server problem.
    n === 'content-length' ||
    n === 'host' ||
    n === 'connection' ||
    // React Native adds these; they describe the app's transport, not the API.
    n === 'accept-encoding'
  );
}

export interface CurlOptions {
  /**
   * Replace credential header values with a placeholder.
   *
   * On by default. A curl command is something you paste into a terminal, a
   * ticket, or a chat — and for most apps the Authorization header is a live
   * session token. Copying it verbatim by default would leak it somewhere it
   * was never meant to go.
   */
  redactAuth?: boolean;
}

const SENSITIVE = ['authorization', 'cookie', 'x-api-key', 'proxy-authorization'];

/**
 * Rebuild a captured request as a curl command.
 *
 * Only the request is reproducible: the response is what you are trying to
 * change by re-running it.
 */
export function toCurl(p: NetworkPayload, options: CurlOptions = {}): string {
  const redact = options.redactAuth !== false;
  const parts = ['curl'];

  if (p.method && p.method.toUpperCase() !== 'GET') {
    parts.push(`-X ${p.method.toUpperCase()}`);
  }

  for (const [name, value] of Object.entries(p.requestHeaders ?? {})) {
    if (skipHeader(name)) continue;
    const shown =
      redact && SENSITIVE.includes(name.toLowerCase()) ? '<redacted>' : value;
    parts.push(`-H ${shellQuote(`${name}: ${shown}`)}`);
  }

  const body = p.requestBody;
  if (body && body.encoding === 'utf8' && body.content) {
    // A truncated body would produce a command that runs and sends the wrong
    // thing, which is worse than one that obviously needs finishing.
    parts.push(`--data-raw ${shellQuote(body.content)}`);
    if (body.truncated) {
      parts.push('# NOTE: body truncated by capture; this is not the full request');
    }
  } else if (body && body.encoding === 'base64') {
    parts.push('# NOTE: binary body omitted');
  }

  parts.push(shellQuote(p.url));

  // One flag per line: a GraphQL request carries enough headers that a single
  // line is unreadable, and this pastes into a shell as-is.
  return parts.join(' \\\n  ');
}
