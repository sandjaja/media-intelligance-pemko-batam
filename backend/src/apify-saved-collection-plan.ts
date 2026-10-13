import type {Pool} from 'pg';
import {loadApifyAdminCollectorSettings} from './apify-admin-collector-settings.js';
import {planApifyCollection,type ApifyCollectorKind} from './apify-collection-plan.js';
import type {ApifyBudgetInput} from './apify-budget-guard.js';

/** Read-only bridge from persisted Admin checkboxes to the guarded collection
 * plan. This is not a scheduler, does not reserve money, and cannot run Actors.
 */
export async function planSavedApifyCollection(pool:Pool,budget:ApifyBudgetInput):Promise<{
 ready:false;reason:string;scheduled:ApifyCollectorKind[];
}>{
 const settings=await loadApifyAdminCollectorSettings(pool);
 if(!settings.length)return{ready:false,reason:'APIFY_ADMIN_COLLECTORS_UNAVAILABLE',scheduled:[]};
 return planApifyCollection({settings,budget});
}
