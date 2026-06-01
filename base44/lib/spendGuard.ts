// base44/lib/spendGuard.ts
// Global monthly spend ceiling enforcement for ALL CEO-ecosystem agents.
// Single source of truth: sum of CampaignUnit.budget.spent_mtd_ils across all units must stay <= GLOBAL_CAP.

export const GLOBAL_MONTHLY_CAP_ILS = 500;

export interface SpendGuardResult {
  allowed: boolean;
  current_mtd_ils: number;
  cap_ils: number;
  reason?: string;
}

export async function canSpend(base44: any, amount_ils: number): Promise<SpendGuardResult> {
  if (amount_ils <= 0) {
    return { allowed: true, current_mtd_ils: 0, cap_ils: GLOBAL_MONTHLY_CAP_ILS };
  }
  const units = await base44.asServiceRole.entities.CampaignUnit.list();
  const current = units.reduce((sum: number, u: any) => sum + (u.budget?.spent_mtd_ils || 0), 0);
  const projected = current + amount_ils;
  if (projected > GLOBAL_MONTHLY_CAP_ILS) {
    return {
      allowed: false,
      current_mtd_ils: current,
      cap_ils: GLOBAL_MONTHLY_CAP_ILS,
      reason: `Projected ₪${projected} exceeds cap ₪${GLOBAL_MONTHLY_CAP_ILS}`,
    };
  }
  return { allowed: true, current_mtd_ils: current, cap_ils: GLOBAL_MONTHLY_CAP_ILS };
}

export async function recordSpend(base44: any, unit_id: string, amount_ils: number): Promise<void> {
  const matches = await base44.asServiceRole.entities.CampaignUnit.filter({ unit_id });
  if (!matches.length) throw new Error(`spendGuard: unknown unit_id ${unit_id}`);
  const u = matches[0];
  const budget = { ...(u.budget || {}) };
  budget.spent_mtd_ils = (budget.spent_mtd_ils || 0) + amount_ils;
  await base44.asServiceRole.entities.CampaignUnit.update(u.id, { budget });
}

export async function vetoAndLog(
  base44: any,
  trigger_agent: string,
  intended_amount: number,
  result: SpendGuardResult,
): Promise<void> {
  await base44.asServiceRole.entities.DecisionLog.create({
    trigger_agent,
    decision: 'spend_veto',
    decision_summary: `נחסם: ${result.reason}. ניסיון להוציא ₪${intended_amount}, MTD ₪${result.current_mtd_ils}/₪${result.cap_ils}`,
    priority_tier: 2,
    ils_impact_estimate: intended_amount,
    outcome: 'CANCELLED',
    owner_notified: false,
  });
}
