import { mkdir, open, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { compileCortexBindingCandidate } from '../cortex/binding-compiler.mjs';
import { buildCortexBindingRequestFromVesselRequest } from '../runtime/identity-bound-mission-vessel-contracts.mjs';
import { buildEffectOnlyVesselAdmission, verifyEffectOnlyVesselAdmission } from '../runtime/effect-only-vessel-admission.mjs';
import { runEffectOnlyAdmittedMission } from '../runtime/effect-only-mission-runner.mjs';
import { buildEffectOnlyRoutingProjection } from '../skills/effect-only-routing-projection.mjs';
import { createEffectOnlyProcessAdapters } from '../skills/effect-only-process-adapters.mjs';
import { createEffectOnlyRoutingJournal } from '../skills/effect-only-routing-journal.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';
import { publishFileExclusive } from '../state/atomic-publication.mjs';

const key = path => process.platform === 'win32' ? path.toLowerCase() : path;
async function readAdmission(path) {
  let actual;
  try { actual = await realpath(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (key(actual) !== key(path)) throw new Error('effect admission alias rejected');
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    const limit = 4_194_304;
    if (!stat.isFile() || stat.size > limit) throw new Error('effect admission exceeds bound');
    const buffer = Buffer.alloc(limit + 1);
    let size = 0;
    while (size < buffer.length) { const read = await file.read(buffer, size, buffer.length - size, null); if (!read.bytesRead) break; size += read.bytesRead; }
    if (size > limit) throw new Error('effect admission exceeds bound');
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, size));
    const value = JSON.parse(text);
    if (text !== `${canonicalJson(value)}\n`) throw new Error('effect admission is not canonical');
    return value;
  } finally { await file.close(); }
}

// Called only after the public launcher authenticates policy, genesis, request,
// paired executable captures and native dependency. No alternate authority path.
export async function executeEffectOnlyIdentity({ root, policy, request, genesisAdmission,
  verifiedPair, nativeTransport, clock, checkpoint, lockOptions }) {
  const { routeMode, effectAssessment, ...legacy } = request;
  const candidate = await compileCortexBindingCandidate({ admission: genesisAdmission,
    request: buildCortexBindingRequestFromVesselRequest({ ...legacy, schemaVersion: 1 }) });
  const projection = buildEffectOnlyRoutingProjection({ request, policy, candidate });
  const runtimeRoot = resolve(root, 'vessel', 'effect-only-v2');
  await mkdir(runtimeRoot, { recursive: true });
  if (key(await realpath(runtimeRoot)) !== key(runtimeRoot)) throw new Error('effect runtime directory alias rejected');
  const adapters = await createEffectOnlyProcessAdapters({ ...verifiedPair,
    snapshotParent: runtimeRoot, timeoutMs: policy.runtime.limits.timeoutMs });
  const journal = createEffectOnlyRoutingJournal({ root: runtimeRoot, ...adapters,
    routingReceiptDigest: verifiedPair.routingExecutable.receipt.receiptDigest,
    verifierReceiptDigest: verifiedPair.verifierExecutable.receipt.receiptDigest });
  const slotId = sha256Value({ taskId: request.task.taskId, missionId: request.mission.missionId });
  const routingResult = await journal.run({ slotId, request: projection.request,
    expectedSource: projection.expectedSource, hostBindingDigest: projection.hostBinding.bindingDigest });
  if (routingResult.status !== 'no-qualified-route') return routingResult;
  const admissionPath = join(runtimeRoot, `${slotId}.admission.json`);
  const lock = await acquireFileLock({ ...lockOptions, lockPath: `${admissionPath}.lock` });
  let admission;
  let context;
  try {
    const existing = await readAdmission(admissionPath);
    context = { request, policy, candidate, routingResult, ...verifiedPair,
      admittedAt: existing?.missionAdmission?.admittedAt ?? new Date(clock()).toISOString() };
    admission = existing ? verifyEffectOnlyVesselAdmission(existing, context) : buildEffectOnlyVesselAdmission(context);
    if (!existing) {
      const content = `${canonicalJson(admission)}\n`;
      if (Buffer.byteLength(content) > 4_194_304) throw new Error('effect admission exceeds bound');
      if (!await publishFileExclusive({ destinationPath: admissionPath, content })) throw new Error('effect admission publication collision');
    }
  } finally { await lock.release(); }
  return runEffectOnlyAdmittedMission({ vesselAdmission: admission, admissionContext: context,
    journalRoot: join(runtimeRoot, 'missions'), nativeTransport,
    maximumNativeMaterializedBytes: policy.runtime.limits.maximumNativeMaterializedBytes,
    clock, checkpoint, lockOptions });
}
