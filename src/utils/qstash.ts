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
  const url = `${QSTASH_URL}/v2/publish`; // JSON publish endpoint

  const headers: Record<string, string> = {
    Authorization: `Bearer ${QSTASH_TOKEN}`,
    'Content-Type': 'application/json',
  };

  if (delayMs && delayMs > 0) {
    // Upstash expects a string ending with "s" or "m" etc; use seconds
    const delaySeconds = Math.round(delayMs / 1000);
    headers['Upstash-Delay'] = `${delaySeconds}s`;
  }

  // Construct payload for QStash JSON publish
  const payload: Record<string, any> = {
    url: destination,
    method: 'POST',
    body,
  };
  if (extraHeaders && Object.keys(extraHeaders).length) {
    payload.headers = extraHeaders;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`QStash publish failed: ${res.status} – ${txt}`);
  }

  const json = (await res.json()) as { messageId: string };
  return json.messageId;
}
