// Automatically create a 15-minute cron schedule in Upstash QStash
export async function ensureInboxSchedule(userId: string, baseUrl: string) {
    const QSTASH_URL = process.env.QSTASH_URL;
    const QSTASH_TOKEN = process.env.QSTASH_TOKEN;
    if (!QSTASH_URL || !QSTASH_TOKEN) return;
    const cron = '*/15 * * * *';
    const destination = `${baseUrl}/api/reddit/process-inbox`;
      const url = `${QSTASH_URL}/v2/schedules/${destination}`;
  
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${QSTASH_TOKEN}`,
        'Content-Type': 'application/json',
        'Upstash-Cron': cron,
        'Upstash-Method': 'POST',
        'Upstash-Schedule-Id': `inbox-${userId}`,
        'Upstash-Forward-X-Internal-API': 'true',
      },
      body: JSON.stringify({ userId }),
    });
    if (res.ok || res.status === 409) return; // 409 = already exists
    console.error('[inboxScheduler] failed', res.status, await res.text());
  }
  