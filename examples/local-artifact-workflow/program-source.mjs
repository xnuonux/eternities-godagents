import { readFile } from 'node:fs/promises';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../../src/core/digest.mjs';
import { deepFreeze } from '../../src/creation/contracts.mjs';
import { createMissionOperationAdapter } from '../../src/runtime/mission-operation-adapter.mjs';
import { assertMissionProgramCoordinator, MISSION_PROGRAM_PROTOCOL_ID } from '../../src/runtime/mission-program.mjs';
import { verifyArtifactProgram, materializeArtifactProgramStep, verifyArtifactProgramResolution } from '../../src/runtime/artifact-program-contracts.mjs';
import { assertLocalWorkflowOwner } from './owner.mjs';
import { readProgramRecord } from './program-store.mjs';

const equal = (a, b) => canonicalJson(a) === canonicalJson(b);
const decisions = new WeakSet();
class ProgramDecision extends Error {
  constructor(programId, stepId, reason) {
    super('artifact program mission needs a decision');
    this.result = Object.freeze({ status: 'needs-decision', programId, stepId, reason });
    decisions.add(this);
  }
}
export function artifactProgramDecision(error) {
  const seen = new Set();
  for (let current = error; current && !seen.has(current); current = current.cause) {
    if (decisions.has(current)) return current.result;
    seen.add(current);
  }
  return null;
}

export async function describeArtifactProgramSource(program) {
  return deepFreeze({ schemaVersion: 1, protocolId: 'eternities-local-artifact-program-source-v1',
    programId: program.programInput.programId, programDigest: program.programDigest,
    sourceBindingDigest: sha256Value(program.sourceBinding),
    publisherDigest: sha256Text(await readFile(new URL('./artifact.mjs', import.meta.url), 'utf8')),
    ownerDigest: sha256Text(await readFile(new URL('./owner.mjs', import.meta.url), 'utf8')),
    sourceDigest: sha256Text(await readFile(new URL('./program-source.mjs', import.meta.url), 'utf8')),
    runnerDigest: sha256Text(await readFile(new URL('./program.mjs', import.meta.url), 'utf8')),
    storeDigest: sha256Text(await readFile(new URL('./program-store.mjs', import.meta.url), 'utf8')),
    coordinatorDigest: sha256Text(await readFile(new URL('../../src/runtime/mission-program.mjs', import.meta.url), 'utf8')),
    adapterDigest: sha256Text(await readFile(new URL('../../src/runtime/mission-operation-adapter.mjs', import.meta.url), 'utf8')),
    contractsDigest: sha256Text(await readFile(new URL('../../src/runtime/artifact-program-contracts.mjs', import.meta.url), 'utf8')),
    genesisAssemblyDigest: sha256Text(await readFile(new URL('../../src/host/local-genesis-admission.mjs', import.meta.url), 'utf8')),
  });
}

// Private host wiring, not a JSON-configurable executor. Owner and coordinator
// must be actual issued objects. No credential, Realm or identity authority is added.
export async function createArtifactProgramSource({ owner, program, sourceDescriptor, manifestDigest, getCoordinator, store, clock = Date.now }) {
  assertLocalWorkflowOwner(owner);
  const compiled = structuredClone(program);
  const programId = compiled.programInput.programId;
  const now = () => new Date(clock()).toISOString();
  const coordinator = () => assertMissionProgramCoordinator(getCoordinator());
  async function authenticate() {
    assertLocalWorkflowOwner(owner);
    const current = await owner.describeArtifactBinding();
    verifyArtifactProgram(compiled, current);
    const actual = await describeArtifactProgramSource(compiled);
    if (!equal(actual, sourceDescriptor)) throw new Error('artifact program source descriptor differs');
    if (sha256Text((await readProgramRecord(store.manifestPath)).text) !== manifestDigest) throw new Error('artifact program manifest changed');
    return current;
  }
  function requireAccepted(outcome, stepId) {
    if (['rejected', 'needs-decision'].includes(outcome.status)) {
      throw new ProgramDecision(programId, stepId, outcome.status === 'rejected' ? 'mission-rejected' : 'route-needs-decision');
    }
    if (outcome.status !== 'completed') throw new Error('artifact program predecessor is not accepted');
  }
  async function committed(stepId, round = new Map()) {
    if (round.has(stepId)) return round.get(stepId);
    const entry = await coordinator().readCommittedStep(programId, stepId);
    if (entry.status !== 'committed') throw new Error('artifact program predecessor is not committed');
    const resolution = await resolveStep(stepId, true, round);
    const outcome = await owner.reconcileArtifactMission(resolution.request);
    requireAccepted(outcome, stepId);
    const completion = entry.completion;
    if (completion.resultDigest !== outcome.artifact.artifactDigest || completion.resultBytes !== outcome.artifact.bytes
        || !equal(completion.usage, outcome.usage) || completion.startedAt !== resolution.resolvedAt) {
      throw new Error('artifact program committed evidence differs from authenticated mission');
    }
    const verified = { stepId, completion, outcome, evidence: { stepId, programCompletion: completion,
      missionReceiptDigest: outcome.mission.receipt.receiptDigest, artifact: outcome.mission.artifact } };
    round.set(stepId, verified);
    return verified;
  }
  async function resolveStep(stepId, required = false, round = new Map()) {
    const current = await authenticate();
    const recipe = compiled.definition.steps.find(step => step.stepId === stepId);
    if (!recipe) throw new Error('artifact program step is missing');
    const existing = await store.readResolution(stepId, { required });
    const predecessors = [];
    for (const reference of recipe.predecessors) predecessors.push((await committed(reference.stepId, round)).evidence);
    const inputs = { program: compiled, stepId, baseRequest: current.baseRequest, policy: current.policy, predecessors };
    if (existing) return verifyArtifactProgramResolution(existing, inputs);
    const resolution = materializeArtifactProgramStep({ ...inputs, resolvedAt: now() });
    return store.publishResolution(stepId, resolution);
  }
  async function invoke(operation, request) {
    const step = compiled.programInput.steps[request.stepIndex];
    if (!step || request.programId !== programId || request.stepId !== step.stepId || request.operationKind !== step.kind
        || request.inputDigest !== step.inputDigest || request.authorityCeilingDigest !== compiled.programInput.authorityCeilingDigest
        || request.maxCompletionTokens !== step.maxCompletionTokens || request.maxResultBytes !== step.maxResultBytes) {
      throw new Error('artifact program dispatch binding differs');
    }
    const resolution = await resolveStep(step.stepId);
    const result = await (operation === 'reconcile' ? owner.reconcileArtifactMission : owner.launchArtifactMission)(resolution.request);
    await authenticate();
    if (['absent', 'pending'].includes(result.status)) return { status: result.status };
    requireAccepted(result, step.stepId);
    if (!equal(await resolveStep(step.stepId, true), resolution)) throw new Error('artifact program resolution changed during execution');
    const unsigned = { schemaVersion: 1, protocolId: MISSION_PROGRAM_PROTOCOL_ID,
      programId, stepId: step.stepId, stepIndex: step.stepIndex, kind: step.kind,
      dispatchId: request.dispatchId, dispatchDigest: request.dispatchDigest,
      resultDigest: result.artifact.artifactDigest, resultBytes: result.artifact.bytes,
      usage: result.usage, startedAt: resolution.resolvedAt, completedAt: now() };
    return { status: 'completed', completion: { ...unsigned, completionDigest: sha256Value(unsigned) } };
  }
  const adapter = await createMissionOperationAdapter({ operationKind: 'artifact-mission', adapterId: 'local-artifact-program',
    adapterVersion: '1.0.0', sourceDescriptor, source: {
      descriptor: async () => { await authenticate(); return sourceDescriptor; },
      reconcile: ({ request }) => invoke('reconcile', request), execute: ({ request }) => invoke('launch', request),
    } });
  return Object.freeze({ adapter,
    async verifyCommittedSteps() {
      const state = await coordinator().inspect(programId);
      if (state.status === 'absent') return [];
      const verified = [];
      // Only one read per shared ancestor within this bounded audit. Each later
      // dispatch/post-inference/replay starts a fresh round, never a stale cache.
      const round = new Map();
      for (const stepId of state.committedStepIds) verified.push(await committed(stepId, round));
      return verified;
    },
  });
}
