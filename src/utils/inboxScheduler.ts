// Automatically create a 15-minute cron schedule in Upstash QStash
export async function ensureInboxSchedule(userId: string, baseUrl: string) {
  const QSTASH_URL = process.env.QSTASH_URL;
  const QSTASH_TOKEN = process.env.QSTASH_TOKEN;
  if (!QSTASH_URL || !QSTASH_TOKEN) return;
  const cron = '*/15 * * * *';
  const destination = `${baseUrl}/api/reddit/process-inbox`;
  const payload = {
    name: `processInbox-${userId}`.slice(0, 64),
    cron,
    destination,
    body: { userId },
    headers: { 'X-Internal-API': 'true' },
    retries: 3,
  };
  const res = await fetch(`${QSTASH_URL}/v2/schedules`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${QSTASH_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });
  if (res.ok || res.status === 409) return; // 409 = already exists
  console.error('[inboxScheduler] failed', res.status, await res.text());
}
