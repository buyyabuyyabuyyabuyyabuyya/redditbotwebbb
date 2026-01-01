/**
 * Utility for handling Pacific Time (PT) conversions
 */

/**
 * Gets the current time in Pacific Time as an ISO string or Date object
 */
export function getPacificTime(): Date {
    const now = new Date();
    // Use Intl.DateTimeFormat to get PT string and convert back to Date
    const ptString = now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
    return new Date(ptString);
}

/**
 * Formats a Date or ISO string to a Pacific Time string for logging
 */
export function formatToPacificTime(date?: Date | string | null): string {
    if (!date) return 'N/A';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        dateStyle: 'medium',
        timeStyle: 'medium'
    });
}

/**
 * Returns the current ISO string in Pacific Time offset (simulated for DB)
 * Note: Postgres 'timestamp with time zone' stores UTC, so usually we just use UTC.
 * But for 'last_used_at' as text or specific logging, this helps.
 */
export function getPacificTimeISO(): string {
    return new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        hour12: false
    }).replace(',', '');
}
