export const PLAN_FREE = 'FREE';
export const PLAN_PRO = 'PRO';

export const ALL_PLANS = [PLAN_FREE, PLAN_PRO] as const;
export type PlanType = typeof ALL_PLANS[number];
