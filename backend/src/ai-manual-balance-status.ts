export type AiManualBalanceStatus = 'not_configured' | 'available' | 'near_limit' | 'exhausted';

export function calculateAiManualBalanceStatus(balanceInput: unknown, committedInput: unknown, baselineInput: unknown) {
  const balance = balanceInput == null ? null : Number(balanceInput);
  const committed = Number(committedInput);
  const baseline = Number(baselineInput ?? 0);
  const valid = balance != null && Number.isFinite(balance) && balance >= 0 &&
    Number.isFinite(committed) && committed >= 0 && Number.isFinite(baseline) && baseline >= 0;
  const used = valid ? Math.max(0, committed - baseline) : null;
  const remaining = valid ? Math.max(0, balance! - used!) : null;
  const ratio = valid && balance! > 0 ? used! / balance! : null;
  const status: AiManualBalanceStatus = !valid ? 'not_configured' :
    remaining === 0 ? 'exhausted' : ratio != null && ratio >= 0.8 ? 'near_limit' : 'available';
  return { status, initial_balance_usd: valid ? balance : null,
    used_since_update_usd: used, remaining_budget_usd: remaining,
    usage_percent: ratio == null ? null : Math.min(100, Math.round(ratio * 1000) / 10) };
}
