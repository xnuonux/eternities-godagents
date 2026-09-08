import { basename, dirname, resolve } from 'node:path';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text } from '../../src/core/digest.mjs';
import { deepFreeze } from '../../src/creation/contracts.mjs';
import { compileArtifactProgram, verifyArtifactProgram } from '../../src/runtime/artifact-program-contracts.mjs';
import { createMissionProgramCoordinator } from '../../src/runtime/mission-program.mjs';
import { withLocalWorkflowOwner } from './owner.mjs';
import { createArtifactProgramStore, publishProgramRecord, readProgramRecord } from './program-store.mjs';
import { artifactProgramDecision, createArtifactProgramSource, describeArtifactProgramSource } from './program-source.mjs';

const protocolId = 'eternities-local-artifact-program-v1';
const key = path => process.platform === 'win32' ? path.toLowerCase() : path;
function exact(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...fields].sort())) throw new Error('artifact program manifest fields are invalid');
}

export async function prepareArtifactProgram({ manifestPath, expectedManifestDigest, definition } = {}) {
  const snapshot = structuredClone(definition);
  return withLocalWorkflowOwner({ manifestPath, expectedManifestDigest, env: {} }, async owner => {
    const current = await owner.describeArtifactBinding();
    const program = compileArtifactProgram({ definition: snapshot, ...current });
    const sourceDescriptor = await describeArtifactProgramSource(program);
    const workflow = { manifestPath: resolve(manifestPath), manifestDigest: expectedManifestDigest };
    const record = { schemaVersion: 1, protocolId, workflow, program, sourceDescriptor };
    const store = await createArtifactProgramStore({ workspaceRoot: dirname(workflow.manifestPath), programId: program.programInput.programId, create: true });
    const saved = await publishProgramRecord(store.manifestPath, record);
    return Object.freeze({ programManifestPath: store.manifestPath, programManifestDigest: sha256Text(saved.text), programId: program.programInput.programId });
  });
}

export async function runArtifactProgram({ programManifestPath, expectedProgramManifestDigest, env = process.env, createProviderPhaseHostImpl } = {}) {
  if (typeof programManifestPath !== 'string' || /[\0\r\n]/.test(programManifestPath) || basename(programManifestPath) !== 'program.json'
      || !/^[a-f0-9]{64}$/.test(expectedProgramManifestDigest ?? '')) throw new Error('artifact program manifest reference is invalid');
  const path = resolve(programManifestPath);
  const saved = await readProgramRecord(path);
  if (sha256Text(saved.text) !== expectedProgramManifestDigest) throw new Error('artifact program manifest digest differs');
  const record = saved.value;
  exact(record, ['schemaVersion', 'protocolId', 'workflow', 'program', 'sourceDescriptor']);
  exact(record.workflow, ['manifestPath', 'manifestDigest']);
  if (record.schemaVersion !== 1 || record.protocolId !== protocolId) throw new Error('artifact program protocol is unsupported');
  return withLocalWorkflowOwner({ manifestPath: record.workflow.manifestPath, expectedManifestDigest: record.workflow.manifestDigest,
    env, createProviderPhaseHostImpl }, async owner => {
    const current = await owner.describeArtifactBinding();
    const program = verifyArtifactProgram(record.program, current);
    const programId = program.programInput.programId;
    const store = await createArtifactProgramStore({ workspaceRoot: dirname(resolve(record.workflow.manifestPath)), programId });
    if (key(store.manifestPath) !== key(path) || (await readProgramRecord(path)).text !== saved.text) throw new Error('artifact program manifest location or bytes differ');
    let coordinator;
    const source = await createArtifactProgramSource({ owner, program, sourceDescriptor: record.sourceDescriptor,
      manifestDigest: expectedProgramManifestDigest, getCoordinator: () => coordinator, store });
    coordinator = await createMissionProgramCoordinator({ programRoot: await store.ensureCoordinatorRoot(), adapters: [source.adapter] });
    try {
      await source.verifyCommittedSteps();
      const outcome = await coordinator.execute(program.programInput);
      if (outcome.status === 'pending') return deepFreeze({ ...outcome, instanceId: current.sourceBinding.actor.instanceId });
      const verified = await source.verifyCommittedSteps();
      return deepFreeze({ status: 'completed', programId, instanceId: current.sourceBinding.actor.instanceId,
        aggregateDigest: outcome.aggregateDigest, usage: outcome.usage,
        resultBytes: verified.reduce((n, step) => n + step.outcome.artifact.bytes, 0),
        results: verified.map(({ stepId, completion, outcome: result }) => ({ stepId, missionId: result.missionId,
          completionDigest: completion.completionDigest, missionReceiptDigest: result.mission.receipt.receiptDigest,
          artifact: result.artifact, usage: result.usage })) });
    } catch (error) {
      const decision = artifactProgramDecision(error);
      if (!decision) throw error;
      return Object.freeze({ ...decision, instanceId: current.sourceBinding.actor.instanceId });
    }
  });
}
