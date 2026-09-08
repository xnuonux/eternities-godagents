import { withLocalWorkflowOwner } from './owner.mjs';

export function runLocalWorkflow(options) {
  return withLocalWorkflowOwner(options, owner => owner.runPrepared('launch'));
}

export function reconcileLocalWorkflow(options) {
  return withLocalWorkflowOwner(options, owner => owner.runPrepared('reconcile'));
}
