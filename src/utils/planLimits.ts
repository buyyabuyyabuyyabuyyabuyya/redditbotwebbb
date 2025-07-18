export type PlanType = 'free' | 'pro' | 'advanced';

interface PlanLimits {
  maxAccounts: number | null; // null represents unlimited
  maxMessages: number | null; // For messages, null represents unlimited (advanced)
  maxTemplates: number | null;
  maxScanConfigs: number | null;
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  free: {
    maxAccounts: 1,
    maxMessages: 15, // lifetime limit
    maxTemplates: 1,
    maxScanConfigs: 1,
  },
  pro: {
    maxAccounts: 3,
    maxMessages: 200, // per calendar month
    maxTemplates: 3,
    maxScanConfigs: 3,
  },
  advanced: {
    maxAccounts: null,
    maxMessages: null,
    maxTemplates: null,
    maxScanConfigs: null,
  },
};

export function getPlanLimits(plan: PlanType): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}