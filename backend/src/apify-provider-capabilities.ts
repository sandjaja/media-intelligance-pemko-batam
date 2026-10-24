/** Apify API evidence audit (2026-10-15).
 * GET /v2/users/me/limits documents maxMonthlyUsageUsd and monthlyUsageUsd.
 * Their difference is usage headroom, NOT cash credits or a prepaid balance.
 * GET /v2/users/me documents monthlyUsageCreditsUsd as plan allowance,
 * NOT a verified remaining cash balance or proof of prepaid/postpaid status.
 * POST /v2/actors/:actorId/runs documents maxTotalChargeUsd as a run cost cap.
 * Do not infer billing mode from plan name, monthly credits or card fields.
 *
 * Sources:
 * https://docs.apify.com/api/v2/users-me-limits-get
 * https://docs.apify.com/api/v2/users-me-get
 * https://docs.apify.com/api/v2/actors-runs-post
 *
 * This module performs no API calls and authorizes no paid runs.
 */
export const APIFY_VERIFIED_ACCOUNT_CAPABILITIES={
 monthlyUsageHeadroom:true,
 runTotalChargeCap:true,
 remainingCashBalance:false,
 prepaidPostpaidBillingMode:false
} as const;
