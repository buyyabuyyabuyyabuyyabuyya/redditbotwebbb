export type PlanType = 'free' | 'starter' | 'pro' | 'elite' | 'advanced';

export interface PlanLimits {
  maxWebsiteConfigs: number;
  maxAutoPosters: number;
  monthlyCommentLimit: number;
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  free: {
    maxWebsiteConfigs: 1,
    maxAutoPosters: 1,
    monthlyCommentLimit: 5,
  },
  starter: {
    maxWebsiteConfigs: 1,
    maxAutoPosters: 1,
    monthlyCommentLimit: 5,
  },
  pro: {
    maxWebsiteConfigs: 5,
    maxAutoPosters: 5,
    monthlyCommentLimit: 300,
  },
  elite: {
    maxWebsiteConfigs: 20,
    maxAutoPosters: 20,
    monthlyCommentLimit: 1500,
  },
  advanced: {
    maxWebsiteConfigs: 20,
    maxAutoPosters: 20,
    monthlyCommentLimit: 1500,
  },
};

export function normalizePlanType(plan?: string | null): PlanType {
  if (plan === 'pro') return 'pro';
  if (plan === 'elite' || plan === 'advanced') return 'elite';
  if (plan === 'starter') return 'starter';
  return 'free';
}

export function getPlanLimits(plan?: string | null): PlanLimits {
  return PLAN_LIMITS[normalizePlanType(plan)];
}
