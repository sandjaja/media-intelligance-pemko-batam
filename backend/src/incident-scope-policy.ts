export type IncidentAuthUser = {
  role: 'admin' | 'operator' | 'viewer';
  opdId: string | null;
};

/**
 * Returns the SQL predicate and parameters needed to scope an incident query.
 * The caller must alias the incidents table as `i`.
 * Admins may see all incidents unless an explicit OPD filter is supplied.
 * Non-admins are always restricted to their authenticated OPD.
 */
export function incidentScope(user: IncidentAuthUser, requestedOpdId?: string) {
  if (user.role === 'admin') {
    if (requestedOpdId) return { sql: 'i.opd_id=$1', params: [requestedOpdId] as unknown[] };
    return { sql: 'TRUE', params: [] as unknown[] };
  }
  if (!user.opdId) return { sql: 'FALSE', params: [] as unknown[] };
  return { sql: 'i.opd_id=$1', params: [user.opdId] as unknown[] };
}
