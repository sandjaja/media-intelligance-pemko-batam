/** Historical files sometimes wrap their own transaction. The migration runner
 * owns the transaction, including schema_migrations, on one dedicated client. */
export function migrationBody(sql:string){
 const opening=/^((?:\s|--[^\n]*(?:\n|$))*)BEGIN;/i;
 if(!opening.test(sql))return sql;
 const body=sql.replace(opening,'$1');
 if(!/COMMIT;\s*(?:--[^\n]*(?:\n|$)\s*)*$/i.test(body))throw Error('MIGRATION_TRANSACTION_UNCLOSED');
 return body.replace(/COMMIT;\s*(?:--[^\n]*(?:\n|$)\s*)*$/i,'');
}
