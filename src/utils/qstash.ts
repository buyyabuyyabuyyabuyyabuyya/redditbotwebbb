// Utility helpers to interact with Upstash QStash
// Only used server-side (Next.js API routes or Edge Functions)

const QSTASH_URL = process.env.QSTASH_URL;
const QSTASH_TOKEN = process.env.QSTASH_TOKEN;

if (!QSTASH_URL || !QSTASH_TOKEN) {
  // eslint-disable-next-line no-console
  console.warn(
    '[qstash] Missing QSTASH_URL / QSTASH_TOKEN env vars – QStash integration disabled.'
  );
}

export interface PublishOptions<T> {
  /** Full HTTPS URL of the consumer endpoint that will receive the message. */
  destination: string;
  /** Payload that will be JSON.stringified. */
  body: T;
  /** Delay in milliseconds before the message is delivered. */
  delayMs?: number;
  /** Additional request headers to include when QStash forwards the message. */
  headers?: Record<string, string>;
}

/**
 * Publish a message to QStash with optional delay.
 * Throws on HTTP failure. Returns the Upstash messageId.
 */
export async function publishQStashMessage<T>(options: PublishOptions<T>) {
  if (!QSTASH_URL || !QSTASH_TOKEN) {
    throw new Error('QStash env vars not configured');
  }

  const { destination, body, delayMs, headers: extraHeaders } = options;

  // Publish using path-parameter style: /v2/publish/<urlencoded-destination>
  const url = `${QSTASH_URL}/v2/publish/${destination}`; // QStash REST endpoint

  const headers: Record<string, string> = {
    Authorization: `Bearer ${QSTASH_TOKEN}`,
    'Content-Type': 'application/json',
    'X-Internal-API': 'true',
    ...(extraHeaders || {}),
  };

  if (delayMs && delayMs > 0) {
    // Upstash expects a string ending with "s" or "m" etc; use seconds
    const delaySeconds = Math.round(delayMs / 1000);
    headers['Upstash-Delay'] = `${delaySeconds}s`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`QStash publish failed: ${res.status} – ${txt}`);
  }

  const json = (await res.json()) as { messageId: string };
  return json.messageId;
}

/**
 * Create a one-off schedule instead of immediate publish.
 * Schedules let us chain messages with a fixed spacing
 * (eg. next message 160 s after the previous one).
 * Provide either delaySeconds (relative) OR notBefore (absolute UNIX timestamp seconds).
 */
export interface ScheduleOptions<T> extends PublishOptions<T> {
  /** Relative delay in seconds */
  delaySeconds?: number;
  /** Absolute unix timestamp (seconds) */
  notBefore?: number;
}

export async function scheduleQStashMessage<T>(options: ScheduleOptions<T>) {
  if (!QSTASH_URL || !QSTASH_TOKEN) {
    throw new Error('QStash env vars not configured');
  }

  const { destination, body, delaySeconds, notBefore, headers: extraHeaders } = options;

  if (!delaySeconds && !notBefore) {
    throw new Error('Either delaySeconds or notBefore must be provided');
  }

  // Build headers
  const headers: Record<string, string> = {
    ...(extraHeaders || {}),
    'X-Internal-API': 'true',
  };
  if (delaySeconds) headers['Upstash-Delay'] = `${delaySeconds}s`;
  if (notBefore) headers['Upstash-Not-Before'] = `${notBefore}`;

  // Reuse publish path-param style endpoint
  return publishQStashMessage({
    destination,
    body,
    headers,
  });
}

