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
    maxMessages: 50, // per calendar month
    maxTemplates: 2,
    maxScanConfigs: 1,
  },
  pro: {
    maxAccounts: 5,
    maxMessages: 1000, // per calendar month
    maxTemplates: 10,
    maxScanConfigs: 10,
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
