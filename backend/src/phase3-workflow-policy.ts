export const PHASE3_WORKFLOW_STATUSES = [
  'NEW','ASSIGNED','IN_PROGRESS','SUBMITTED','REVISION_REQUIRED',
  'APPROVED','PUBLISHED','MONITORING','CLOSED',
] as const;

export type Phase3WorkflowStatus = typeof PHASE3_WORKFLOW_STATUSES[number];
export type Phase3ActorRole = 'super_admin'|'humas'|'executive'|'opd'|'viewer';

const TRANSITIONS: Record<Phase3WorkflowStatus, readonly Phase3WorkflowStatus[]> = {
  NEW: ['ASSIGNED'],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['SUBMITTED'],
  SUBMITTED: ['REVISION_REQUIRED','APPROVED'],
  REVISION_REQUIRED: ['IN_PROGRESS','SUBMITTED'],
  APPROVED: ['PUBLISHED'],
  PUBLISHED: ['MONITORING'],
  MONITORING: ['CLOSED'],
  CLOSED: [],
};

export function isPhase3WorkflowStatus(value: string): value is Phase3WorkflowStatus {
  return (PHASE3_WORKFLOW_STATUSES as readonly string[]).includes(value);
}

export function canTransitionPhase3(
  from: Phase3WorkflowStatus,
  to: Phase3WorkflowStatus,
  actorRole: Phase3ActorRole,
) {
  if (!TRANSITIONS[from].includes(to)) return false;

  if (actorRole === 'super_admin' || actorRole === 'humas') {
    return [
      'ASSIGNED','REVISION_REQUIRED','APPROVED','PUBLISHED','MONITORING','CLOSED',
    ].includes(to) || (from === 'REVISION_REQUIRED' && to === 'IN_PROGRESS');
  }

  if (actorRole === 'opd') {
    return (
      (from === 'ASSIGNED' && to === 'IN_PROGRESS') ||
      (from === 'IN_PROGRESS' && to === 'SUBMITTED') ||
      (from === 'REVISION_REQUIRED' && (to === 'IN_PROGRESS' || to === 'SUBMITTED'))
    );
  }

  return false;
}

export function canAssignPhase3(actorRole: Phase3ActorRole) {
  return actorRole === 'super_admin' || actorRole === 'humas';
}

export function canReviewPhase3(actorRole: Phase3ActorRole) {
  return actorRole === 'super_admin' || actorRole === 'humas';
}
