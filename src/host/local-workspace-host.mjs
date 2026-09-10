import { mkdir, realpath, lstat } from 'node:fs/promises';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { createProviderPhaseHost } from './provider-phase-host-sdk.mjs';
import { createGrokCliPortablePhaseHost } from '../transports/grok-cli-phase-transport.mjs';
import { createWorkspaceOwner, prepareWorkspaceReview, createReviewedWorkspaceTestOwner,
  loadWorkspaceReviewApproval, readWorkspaceHostRecord } from './workspace-owner.mjs';
import { compileBrowserTestSuite } from '../workspace/browser-test-contracts.mjs';
import { publishFileExclusive } from '../state/atomic-publication.mjs';
import { acquireFileLock } from '../state/file-lock.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const pins = { 'openai-compatible-chat-completions-v1': 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256',
  'anthropic-messages-v1': 'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256', 'grok-cli-subscription-v1': 'GODAGENT_GROK_PHASE_POLICY_SHA256' };
const ensure = (ok, message) => { if (!ok) throw new Error(`workspace host ${message}`); };
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
function exact(v, keys) { ensure(v && typeof v === 'object' && !Array.isArray(v)
  && same(Object.keys(v).sort(), [...keys].sort()), 'configuration fields are invalid'); }
const pathKey = p => process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p);
function inside(root, path) { const rel = relative(pathKey(root), pathKey(path)); return !rel || (rel !== '..' && !rel.startsWith(`..\\`) && !rel.startsWith('../') && !isAbsolute(rel)); }
async function directory(path) { const s = await lstat(path); ensure(s.isDirectory() && !s.isSymbolicLink()
  && pathKey(await realpath(path)) === pathKey(path), 'directory alias rejected'); }
async function pinned(path, digest) {
  ensure(typeof path === 'string' && isAbsolute(path) && !/[\0\r\n]/.test(path), 'pinned path is invalid');
  ensure(typeof digest === 'string' && DIGEST.test(digest), 'external pin is required');
  const value = await readWorkspaceHostRecord(path); ensure(value && sha256Value(value) === digest, 'file pin mismatch'); return value;
}

// Operator application boundary. Configuration and review pins are host inputs,
// never inferred from model text. The returned handle exposes no constructors,
// approval writer, environment access or arbitrary operation arguments.
export async function openLocalWorkspaceHost({ configPath, env = process.env, fetchImpl, registryRoot } = {}) {
  const environment = { ...env }, configDigest = environment.GODAGENT_WORKSPACE_HOST_SHA256;
  const config = await pinned(configPath, configDigest);
  exact(config, ['schemaVersion', 'protocolId', 'workspacePolicy', 'provider', 'browser', 'reviewDirectory', 'exportDirectory']);
  ensure(config.schemaVersion === 1 && config.protocolId === 'eternities-local-workspace-host-v1', 'configuration protocol is invalid');
  exact(config.workspacePolicy, ['path', 'digest']); exact(config.provider, ['family', 'policyPath', 'policyDigest']);
  exact(config.browser, ['runtimePath', 'runtimeDigest', 'suitePath', 'suiteDigest', 'limits']);
  ensure(Object.hasOwn(pins, config.provider.family), 'provider family is unsupported');
  const policy = await pinned(config.workspacePolicy.path, config.workspacePolicy.digest);
  await pinned(config.provider.policyPath, config.provider.policyDigest);
  const runtime = await pinned(config.browser.runtimePath, config.browser.runtimeDigest);
  const suite = compileBrowserTestSuite(await pinned(config.browser.suitePath, config.browser.suiteDigest));
  for (const path of [config.reviewDirectory, config.exportDirectory]) ensure(typeof path === 'string' && isAbsolute(path) && !/[\0\r\n]/.test(path), 'output path is invalid');
  await directory(config.reviewDirectory);
  for (const root of [policy.source.sourceRoot, policy.admissionRoot, join(dirname(policy.admissionRoot), 'workspace-revisions')]) {
    ensure(!inside(root, config.reviewDirectory) && !inside(config.reviewDirectory, root)
      && !inside(root, config.exportDirectory) && !inside(config.exportDirectory, root), 'review/export roots overlap actor or source state');
  }
  ensure(!inside(config.reviewDirectory, config.exportDirectory) && !inside(config.exportDirectory, config.reviewDirectory), 'review and export roots overlap');
  const rawReviewPins = environment.GODAGENT_WORKSPACE_REVIEW_PINS ?? '{}';
  ensure(typeof rawReviewPins === 'string' && Buffer.byteLength(rawReviewPins) <= 2048, 'review pins exceed bound');
  const reviewPins = JSON.parse(rawReviewPins);
  ensure(reviewPins && typeof reviewPins === 'object' && !Array.isArray(reviewPins) && Object.keys(reviewPins).length <= 4
    && Object.entries(reviewPins).every(([key, value]) => DIGEST.test(key) && typeof value === 'string' && DIGEST.test(value)), 'review pins are invalid');
  const grok = config.provider.family === 'grok-cli-subscription-v1';
  const host = await (grok ? createGrokCliPortablePhaseHost : createProviderPhaseHost)({ ...(!grok ? { family: config.provider.family } : {}),
    policyPath: config.provider.policyPath, runtimeRoot: join(policy.admissionRoot, 'vessel', 'provider-phase'),
    env: { ...environment, [pins[config.provider.family]]: config.provider.policyDigest }, ...(!grok && fetchImpl ? { fetchImpl } : {}) });
  const original = await createWorkspaceOwner({ policy, expectedPolicyDigest: config.workspacePolicy.digest,
    host, hostKind: grok ? 'portable' : 'provider', ...(registryRoot ? { registryRoot } : {}) });
  async function revalidate() {
    ensure(same(await pinned(configPath, configDigest), config), 'configuration changed');
    await pinned(config.workspacePolicy.path, config.workspacePolicy.digest);
    await pinned(config.provider.policyPath, config.provider.policyDigest);
    await pinned(config.browser.runtimePath, config.browser.runtimeDigest);
    await pinned(config.browser.suitePath, config.browser.suiteDigest);
    await directory(config.reviewDirectory);
  }
  let active = false;
  return Object.freeze({ async run() {
    ensure(!active, 'is already running'); active = true;
    try {
      let owner = original;
      for (let attempt = 0; attempt < policy.repairBudget.maxAttempts; attempt++) {
        await revalidate(); const stage = await owner.propose();
        if (stage.status !== 'needs-review') return stage;
        const input = { owner, stage, runtime, suite, limits: config.browser.limits };
        const reviewCandidate = await prepareWorkspaceReview(input);
        const pin = reviewPins[reviewCandidate.reviewCandidateDigest];
        if (!pin) return Object.freeze({ status: 'needs-review', reviewCandidate, actor: stage.actor, attempt: stage.attempt,
          parent: stage.parent, revision: stage.revision });
        const approval = await loadWorkspaceReviewApproval({ path: join(config.reviewDirectory, `${reviewCandidate.reviewCandidateDigest}.json`),
          env: { GODAGENT_WORKSPACE_REVIEW_SHA256: pin } });
        await revalidate(); const tested = await createReviewedWorkspaceTestOwner({ ...input, approval });
        const result = await tested.run();
        if (result.status !== 'completed') return result;
        if (result.result.outcome === 'passed') {
          await revalidate(); const bundle = await tested.export();
          await directory(dirname(config.exportDirectory));
          try { await mkdir(config.exportDirectory); } catch (error) { if (error.code !== 'EEXIST') throw error; }
          await directory(config.exportDirectory);
          const exportPath = join(config.exportDirectory, `${stage.stageDigest}.json`), content = `${canonicalJson(bundle)}\n`;
          const ceiling = Math.min(16777216, policy.storeLimits.maxTotalBytes * 12 + 65536);
          ensure(Buffer.byteLength(content) <= ceiling, 'checked export exceeds bound');
          const lock = await acquireFileLock({ lockPath: `${exportPath}.lock` });
          try {
            const existing = await readWorkspaceHostRecord(exportPath, ceiling);
            if (existing) ensure(same(existing, bundle), 'checked export destination differs');
            else ensure(await publishFileExclusive({ destinationPath: exportPath, content }), 'checked export publication collision');
          } finally { await lock.release(); }
          return Object.freeze({ status: 'completed', stageDigest: stage.stageDigest, exportPath, exportDigest: sha256Value(bundle), testReceiptDigest: result.result.receiptDigest });
        }
        if (result.result.outcome !== 'failed') return Object.freeze({ status: 'needs-decision', reason: result.result.outcome });
        owner = await owner.continueAfter(tested);
      }
      return Object.freeze({ status: 'needs-decision', reason: 'repair-budget-exhausted' });
    } finally { active = false; }
  } });
}
