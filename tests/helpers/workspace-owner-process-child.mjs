import { readFile } from 'node:fs/promises';
import { createProviderPhaseHost } from '../../src/host/provider-phase-host-sdk.mjs';
import { createWorkspaceOwner, createReviewedWorkspaceTestOwner, loadWorkspaceReviewApproval } from '../../src/host/workspace-owner.mjs';
import { sha256Value } from '../../src/core/digest.mjs';

const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
const host = await createProviderPhaseHost({ family: 'openai-compatible-chat-completions-v1',
  policyPath: config.providerPolicyPath, runtimeRoot: config.runtimeRoot,
  env: { GODAGENT_PHASE_TRANSPORT_POLICY_SHA256: config.providerPolicyDigest },
  fetchImpl: async () => { throw new Error('credential-free recovery must not dispatch'); } });
const owner = await createWorkspaceOwner({ policy: config.policy, expectedPolicyDigest: sha256Value(config.policy),
  host, hostKind: 'provider', registryRoot: config.registryRoot });
const stage = await owner.propose();
const approval = await loadWorkspaceReviewApproval({ path: config.reviewPath,
  env: { GODAGENT_WORKSPACE_REVIEW_SHA256: config.reviewDigest } });
const testOwner = await createReviewedWorkspaceTestOwner({ owner, stage,
  runtime: config.runtime, suite: config.suite, limits: config.limits, approval, checkpoint: point => {
    if (point === config.exitAt) process.exit(73);
  } });
await testOwner.run();
