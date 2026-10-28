import type {Pool} from 'pg';

/** Read the current persisted Apify budget. No defaults: missing or ambiguous
 * organization/provider settings block billable execution. Read-only. */
export async function loadApifyAdminBudget(pool:Pool):Promise<number|null>{
 const {rows}=await pool.query(`
  SELECT s.settings->>'monthlyBudgetUsd' AS budget
  FROM integration_settings s
  JOIN integration_providers p ON p.id=s.provider_id AND p.code='apify' AND p.active=true
  JOIN organizations o ON o.id=s.organization_id AND o.active=true
  LIMIT 2`);
 if(rows.length!==1)return null;
 const raw=rows[0]?.budget;
 if(typeof raw!=='string'||raw.trim()==='')return null;
 const budget=Number(raw);
 return Number.isFinite(budget)&&budget>=0.5&&budget<=5?budget:null;
}
