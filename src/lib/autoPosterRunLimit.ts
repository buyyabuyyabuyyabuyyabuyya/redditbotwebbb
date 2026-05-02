export const AUTO_POSTER_MAX_RUNTIME_HOURS = 5;
export const AUTO_POSTER_MAX_RUNTIME_MS =
  AUTO_POSTER_MAX_RUNTIME_HOURS * 60 * 60 * 1000;

export interface AutoPosterRunLimitSource {
  enabled?: boolean | null;
  status?: string | null;
  created_at?: string | null;
}

export interface AutoPosterRunLimitState {
  runStartedAt: string | null;
  runExpiresAt: string | null;
  runtimeLimitReached: boolean;
  runtimeHours: number;
  statusLabel: string | null;
  statusMessage: string | null;
}

export function getAutoPosterRunLimitState(
  config?: AutoPosterRunLimitSource | null,
  now: Date = new Date()
): AutoPosterRunLimitState {
  const runStartedAt = config?.created_at || null;
  const startTime = runStartedAt ? new Date(runStartedAt).getTime() : NaN;
  const hasValidStart = Number.isFinite(startTime);
  const runExpiresAt = hasValidStart
    ? new Date(startTime + AUTO_POSTER_MAX_RUNTIME_MS).toISOString()
    : null;
  const runtimeLimitReached = Boolean(
    config?.enabled === true &&
      config?.status === 'active' &&
      hasValidStart &&
      now.getTime() >= startTime + AUTO_POSTER_MAX_RUNTIME_MS
  );

  return {
    runStartedAt,
    runExpiresAt,
    runtimeLimitReached,
    runtimeHours: AUTO_POSTER_MAX_RUNTIME_HOURS,
    statusLabel: runtimeLimitReached ? '5-hour run complete' : null,
    statusMessage: runtimeLimitReached
      ? `This auto-poster has completed its ${AUTO_POSTER_MAX_RUNTIME_HOURS}-hour run for this website config. Start it again when you want another run.`
      : null,
  };
}
