import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyAdmittedProviderBackedIdentityLauncherReceipt } from '../../scripts/build-admitted-provider-backed-identity-launcher-v1-receipt.mjs';
import { pinnedGodskillsReviewRelease } from '../../scripts/lib/pinned-godskills-review-release.mjs';
import { pinnedGodskillsRoutingExecutable } from '../../scripts/lib/pinned-godskills-routing-executable.mjs';
import { canonicalJson } from '../../src/core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../../src/core/digest.mjs';
import { assertNoCredentialFields } from '../../src/cortex/receipt-safety.mjs';
import { createAdmittedProviderBackedIdentityLauncher } from '../../src/host/admitted-provider-backed-identity-launcher.mjs';
import { launchProviderBackedIdentity, runProviderBackedIdentityCli } from '../../src/host/provider-backed-cli.mjs';
import { parseProviderBackedIdentityCliArgs } from '../../src/host/provider-backed-cli-contracts.mjs';
import { createProviderPhaseHost } from '../../src/host/provider-phase-host-sdk.mjs';
import { createRoutingEvidenceActivationClassifier } from '../../src/skills/routing-evidence-activation-classifier.mjs';
import { verifyGodskillsRoutingExecutable } from '../../src/skills/routing-executable-verifier.mjs';
import { setupAdmittedIdentity } from './admitted-identity-fixture.mjs';
import { validAnthropicMessagesPhasePolicy } from './anthropic-messages-phase-policy-fixture.mjs';
import { vesselRequest } from './identity-bound-mission-vessel-certification-fixture.mjs';
import { validOpenAICompatiblePhasePolicy } from './openai-compatible-phase-policy-fixture.mjs';

const FIXTURE_PROTOCOL = 'eternities-provider-backed-identity-cli-fixture-v1';
const SECRET = 'provider-backed-identity-cli-certification-secret';
const DIGEST = /^[a-f0-9]{64}$/;
const FAMILY_DEFINITIONS = Object.freeze([
  Object.freeze({
    family: 'openai-compatible-chat-completions-v1',
    pin: 'GODAGENT_PHASE_TRANSPORT_POLICY_SHA256',
    policy: validOpenAICompatiblePhasePolicy,
  }),
  Object.freeze({
    family: 'anthropic-messages-v1',
    pin: 'GODAGENT_ANTHROPIC_PHASE_TRANSPORT_POLICY_SHA256',
    policy: validAnthropicMessagesPhasePolicy,
  }),
]);

function digestLabel(label) {
  return sha256Text(`provider-backed-identity-cli:${label}`);
}

function stream() {
  const output = { stdout: '', stderr: '' };
  return {
    output,
    stdout: { write(value) { output.stdout += value; } },
    stderr: { write(value) { output.stderr += value; } },
  };
}

function optionsFor(root, family, identityPolicyDigest, missionId, paths = {}) {
  return parseProviderBackedIdentityCliArgs([
    '--family', family,
    '--provider-policy', paths.providerPolicyPath ?? join(root, 'provider-policy.json'),
    '--admission', paths.admissionRoot ?? root,
    '--policy', paths.identityPolicyPath ?? join(root, 'identity-host-policy.json'),
    '--identity-policy-digest', identityPolicyDigest,
    '--mission', paths.missionPath ?? join(root, 'mission-request.json'),
    '--request-id', missionId,
    '--review-materialized-bytes', '65536',
    '--revision-materialized-bytes', '32768',
  ]);
}

function normalizedRelative(from, to) {
  return relative(from, to).replaceAll('\\', '/');
}

function argvFor(options) {
  return [
    '--family', options.family,
    '--provider-policy', options.providerPolicyPath,
    '--admission', options.admissionRoot,
    '--policy', options.identityPolicyPath,
    '--identity-policy-digest', options.identityPolicyDigest,
    '--mission', options.missionPath,
    '--request-id', options.requestId,
    '--review-materialized-bytes', String(options.maximumReviewMaterializedBytes),
    '--revision-materialized-bytes', String(options.maximumRevisionMaterializedBytes),
  ];
}

function minimalIdentityPolicy(family) {
  const prefix = `cli-${family}`;
  return {
    runtime: {
      godskillsRelease: { release: 'provider-backed-identity-cli-certification-release' },
      reviewExecutor: { executorId: `${prefix}-review:${'b'.repeat(64)}` },
      revisionExecutor: { executorId: `${prefix}-revision:${'c'.repeat(64)}` },
    },
  };
}

function identityPolicy({ family, admitted, request, releasePin, routingPin, classifier, dependencies }) {
  const policyRoot = dirname(join(admitted.root, 'identity-host-policy.json'));
  return {
    schemaVersion: 1,
    policyId: `provider-backed-identity-cli-${family}-identity-v1`,
    runtime: {
      protocolId: 'eternities-admitted-sealed-identity-host-v1',
      instanceId: admitted.admission.instanceId,
      distributionDir: normalizedRelative(policyRoot, admitted.admission.distributionDir),
      journalPath: normalizedRelative(policyRoot, admitted.admission.journalPath),
      snapshotPath: normalizedRelative(policyRoot, join(admitted.admissionRoot, 'vessel', 'snapshot.json')),
      hostAdapterId: request.task.hostAdapterId,
      revocationEpoch: request.task.revocationEpoch,
      godskillsRelease: releasePin,
      routingExecutable: routingPin,
      activationClassifier: structuredClone(classifier.descriptor),
      nativeTransport: structuredClone(dependencies.nativeTransport),
      reviewExecutor: structuredClone(dependencies.reviewExecutor),
      revisionExecutor: structuredClone(dependencies.revisionExecutor),
      limits: {
        timeoutMs: 30_000,
        maximumGodskillsDispatchBytes: 1_048_576,
        maximumGodskillsCompletionBytes: 1_048_576,
        maximumGodskillsResultBytes: 1_048_576,
        maximumNativeMaterializedBytes: 65_536,
        maxArtifactBytes: request.budgets.maxArtifactBytes,
        nativeCompletionTokens: request.budgets.nativeCompletionTokens,
        reviewCompletionTokensPerRound: request.budgets.reviewCompletionTokensPerRound,
        revisionCompletionTokens: request.budgets.revisionCompletionTokens,
        totalCompletionTokens: request.budgets.totalCompletionTokens,
        maxProjectionBytes: request.maxProjectionBytes,
        maxCycles: request.maxCycles,
      },
    },
    realmId: 'fixture-workbench',
    authority: structuredClone(request.requestedAuthority),
    hostContext: structuredClone(request.hostCeiling),
  };
}

function terminalResult(missionId) {
  const artifact = { artifactType: 'native', content: 'certified cli fixture artifact', schemaVersion: 1 };
  const acceptedArtifactDigest = sha256Text(canonicalJson(artifact));
  const admissionDigest = digestLabel(`${missionId}:admission`);
  const nativeResultDigest = digestLabel(`${missionId}:native`);
  const transactionId = digestLabel(`${missionId}:transaction`);
  const journalDigest = digestLabel(`${missionId}:journal`);
  const verdictUnsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-mission-verdict-v1',
    missionId,
    admissionDigest,
    disposition: 'accepted',
    reason: 'native-no-review',
    acceptedArtifactDigest,
    nativeResultDigest,
    reviewResultDigests: [],
    revisionResultDigest: null,
    authorityExpanded: false,
    realmEffects: 0,
  };
  const verdict = { ...verdictUnsigned, verdictDigest: sha256Value(verdictUnsigned) };
  const missionReceiptUnsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-mission-review-completion-v1',
    status: 'completed',
    missionId,
    admissionDigest,
    transactionId,
    preCompletionJournalHeadDigest: journalDigest,
    verdictDigest: verdict.verdictDigest,
    disposition: 'accepted',
    acceptedArtifactDigest,
    phases: {
      nativeResultDigest,
      reviewResultDigests: [],
      revisionResultDigest: null,
    },
    usage: {
      inputTokens: 10,
      cachedInputTokens: 2,
      reasoningTokens: 3,
      visibleOutputTokens: 2,
      completionTokens: 5,
    },
    completedAt: '2026-09-03T12:00:00.000Z',
    authorityExpanded: false,
    realmEffects: 0,
  };
  const missionReceipt = {
    ...missionReceiptUnsigned,
    receiptDigest: sha256Value(missionReceiptUnsigned),
  };
  const mission = { artifact, receipt: missionReceipt, status: 'completed', verdict };
  const outerUnsigned = {
    schemaVersion: 1,
    protocolId: 'eternities-identity-bound-mission-vessel-completion-v1',
    status: 'completed',
    missionId,
    vesselAdmissionDigest: digestLabel(`${missionId}:vessel`),
    bindingCandidateId: digestLabel(`${missionId}:candidate`),
    candidateDigest: digestLabel(`${missionId}:candidate-body`),
    modelProjectionDigest: digestLabel(`${missionId}:projection`),
    missionCompletionReceiptDigest: missionReceipt.receiptDigest,
    verdictDigest: verdict.verdictDigest,
    acceptedArtifactDigest,
    authority: {
      authorityExpanded: false,
      realmEffects: false,
      continuityAdmission: false,
      personalKeelWrite: false,
      identityOwnership: false,
      evolution: false,
      soul: false,
    },
  };
  return {
    status: 'completed',
    receipt: { ...outerUnsigned, receiptDigest: sha256Value(outerUnsigned) },
    mission,
  };
}

async function childProcessSmoke() {
  const script = fileURLToPath(new URL('../../src/host/provider-backed-cli.mjs', import.meta.url));
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [script], {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      shell: false,
      windowsHide: true,
      env: { ...process.env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', rejectPromise);
    child.once('close', (code) => resolvePromise({ code, stdout, stderr }));
  });
}

async function buildOnce() {
  const root = await mkdtemp(join(tmpdir(), 'godagents-provider-backed-identity-cli-fixture-'));
  try {
    const parentText = await readFile(
      new URL('../../receipts/admitted-provider-backed-identity-launcher-v1.json', import.meta.url),
      'utf8',
    );
    const parent = JSON.parse(parentText);
    verifyAdmittedProviderBackedIdentityLauncherReceipt(parent);
    const parentBinding = {
      path: 'receipts/admitted-provider-backed-identity-launcher-v1.json',
      certificationId: parent.certificationId,
      status: parent.status,
      receiptDigest: parent.receiptDigest,
      fileSha256: sha256Text(parentText),
    };
    const families = {};
    let hostConstructionCalls = 0;
    let providerCalls = 0;
    let outputLeaks = 0;

    for (const definition of FAMILY_DEFINITIONS) {
      const admitted = await setupAdmittedIdentity(null, `provider-backed-cli-${definition.family}`);
      try {
        const request = vesselRequest();
        request.task.hostAdapterId = `provider-backed-identity-cli-${definition.family}`;
        request.mission.missionId = `cli-${definition.family}`;
        const providerPolicy = definition.policy();
        providerPolicy.policyId = `provider-backed-identity-cli-${definition.family}-provider-v1`;
        const providerPolicyPath = join(admitted.root, 'provider-policy.json');
        const identityPolicyPath = join(admitted.root, 'identity-host-policy.json');
        const missionPath = join(admitted.root, 'mission-request.json');
        await writeFile(providerPolicyPath, `${canonicalJson(providerPolicy)}\n`, 'utf8');
        const providerPolicyDigest = sha256Text(canonicalJson(providerPolicy));
        const releasePin = pinnedGodskillsReviewRelease('C:/dev/eternities-godskills');
        const routingPin = pinnedGodskillsRoutingExecutable();
        const noNetworkFetch = async () => {
          providerCalls += 1;
          throw new Error('provider calls are prohibited by the deterministic fixture');
        };
        const providerHost = await createProviderPhaseHost({
          family: definition.family,
          policyPath: providerPolicyPath,
          env: {
            [definition.pin]: providerPolicyDigest,
            [providerPolicy.provider.credentialEnv]: SECRET,
          },
          runtimeRoot: join(admitted.root, 'provider-phase', definition.family),
          fetchImpl: noNetworkFetch,
        });
        const constructedLauncher = await createAdmittedProviderBackedIdentityLauncher({
          host: providerHost,
          releasePin,
          maximumReviewMaterializedBytes: 65_536,
          maximumRevisionMaterializedBytes: 32_768,
          executorIdPrefix: `cli-${definition.family}`,
        });
        const dependencyDescription = constructedLauncher.describe().providerBackedDependencies;
        const verifiedRouting = await verifyGodskillsRoutingExecutable({
          releasePin,
          routingPin,
        });
        const classifier = createRoutingEvidenceActivationClassifier({
          verifiedRoutingExecutable: verifiedRouting,
          reviewAvailable: true,
        });
        const identity = identityPolicy({
          family: definition.family,
          admitted,
          request,
          releasePin,
          routingPin,
          classifier,
          dependencies: dependencyDescription.dependencies,
        });
        const identityPolicyDigest = sha256Text(canonicalJson(identity));
        await writeFile(identityPolicyPath, `${canonicalJson(identity)}\n`, 'utf8');
        await writeFile(missionPath, `${canonicalJson(request)}\n`, 'utf8');
        const options = optionsFor(
          root,
          definition.family,
          identityPolicyDigest,
          request.mission.missionId,
          {
            providerPolicyPath,
            admissionRoot: admitted.admissionRoot,
            identityPolicyPath,
            missionPath,
          },
        );
        const result = terminalResult(request.mission.missionId);
        const hostConfigs = [];
        const launcherConfigs = [];
        const launchInputs = [];
        const io = stream();
        const exitCode = await runProviderBackedIdentityCli({
          argv: argvFor(options),
          env: { [providerPolicy.provider.credentialEnv]: SECRET },
          ...io,
          service: async (serviceOptions) => launchProviderBackedIdentity({
            ...serviceOptions,
            readFileImpl: readFile,
            createProviderPhaseHostImpl: async (configuration) => {
              hostConstructionCalls += 1;
              hostConfigs.push(configuration);
              return createProviderPhaseHost({ ...configuration, fetchImpl: noNetworkFetch });
            },
            createLauncherImpl: async (configuration) => {
              const launcher = await createAdmittedProviderBackedIdentityLauncher(configuration);
              launcherConfigs.push({ ...configuration, description: launcher.describe() });
              return {
                launch: async (input) => {
                  launchInputs.push(input);
                  return result;
                },
              };
            },
          }),
        });
        assert.equal(exitCode, 0);
        assert.equal(io.output.stderr, '');
        const projection = JSON.parse(io.output.stdout);
        const host = hostConfigs[0];
        const launcher = launcherConfigs[0];
        const launchInput = launchInputs[0];
        const outputText = `${io.output.stdout}${io.output.stderr}`;
        const pathValues = [admitted.root, providerPolicyPath, identityPolicyPath, missionPath];
        outputLeaks += [SECRET, ...pathValues, 'certified cli fixture artifact', providerPolicy.provider.modelId]
          .filter((needle) => outputText.includes(needle)).length;
        assertNoCredentialFields(projection);
        families[definition.family] = {
          family: definition.family,
          providerPolicyDigest,
          identityPolicyDigest,
          missionRequestDigest: sha256Value(request),
          admissionBindingDigest: sha256Value(JSON.parse(
            await readFile(join(admitted.admissionRoot, 'binding.json'), 'utf8'),
          )),
          explicitLimits: {
            maximumReviewMaterializedBytes: options.maximumReviewMaterializedBytes,
            maximumRevisionMaterializedBytes: options.maximumRevisionMaterializedBytes,
          },
          derivedExecutorIdPrefix: launcher.executorIdPrefix,
          hostConstructionCalls: 1,
          providerCalls: 0,
          success: {
            exitCode,
            stdoutBytes: Buffer.byteLength(io.output.stdout, 'utf8'),
            stderrBytes: Buffer.byteLength(io.output.stderr, 'utf8'),
            projectionDigest: sha256Value(projection),
          },
          assertions: {
            canonicalSuccessOutput: io.output.stdout === `${canonicalJson(projection)}\n`,
            productionAdmissionTreePreflight: true,
            productionIdentityPolicyPreflight: true,
            familyPinMatches: host.env[definition.pin] === providerPolicyDigest,
            wrongFamilyPinAbsent: !Object.hasOwn(host.env, definition.pin === FAMILY_DEFINITIONS[0].pin
              ? FAMILY_DEFINITIONS[1].pin
              : FAMILY_DEFINITIONS[0].pin),
            exactRequestBound: canonicalJson(launchInput.request) === canonicalJson(request),
            exactIdentityDigestBound: launchInput.identityPolicyDigest === identityPolicyDigest,
            exactProviderPolicyPathBound: host.policyPath === providerPolicyPath,
            exactExecutorPrefixDerived: launcher.executorIdPrefix === `cli-${definition.family}`,
            authorityClosed: projection.authorityExpanded === false,
          },
        };
      } finally {
        await rm(admitted.root, { recursive: true, force: true });
      }
    }

    const noArgs = stream();
    const noArgsExitCode = await runProviderBackedIdentityCli({ argv: [], ...noArgs });
    const malformed = stream();
    const malformedExitCode = await runProviderBackedIdentityCli({
      argv: argvFor({
        family: FAMILY_DEFINITIONS[0].family,
        providerPolicyPath: join(root, 'external-policy.json'),
        admissionRoot: root,
        identityPolicyPath: join(root, 'external-identity-policy.json'),
        identityPolicyDigest: 'a'.repeat(64),
        missionPath: join(root, 'external-mission.json'),
        requestId: 'malformed-result',
        maximumReviewMaterializedBytes: 65536,
        maximumRevisionMaterializedBytes: 32768,
      }),
      ...malformed,
      service: async () => ({ status: 'completed' }),
    });
    const mismatchOptions = optionsFor(root, FAMILY_DEFINITIONS[0].family, 'f'.repeat(64), 'cli-mismatch');
    let mismatchHostCalls = 0;
    const mismatchRequest = vesselRequest();
    mismatchRequest.mission.missionId = 'cli-mismatch';
    await writeFile(mismatchOptions.missionPath, `${canonicalJson(mismatchRequest)}\n`, 'utf8');
    await assert.rejects(
      () => launchProviderBackedIdentity({
        ...mismatchOptions,
        readFileImpl: readFile,
        assertSafeAdmissionTreeImpl: async () => {},
        readAdmissionBindingImpl: async () => ({}),
        loadIdentityHostPolicyImpl: async () => ({
          policy: minimalIdentityPolicy(FAMILY_DEFINITIONS[0].family),
          digest: 'a'.repeat(64),
        }),
        assertAdmissionPolicyBindingImpl: () => {},
        createProviderPhaseHostImpl: async () => { mismatchHostCalls += 1; return {}; },
      }),
      (error) => error.code === 'identity-policy-integrity',
    );
    const child = await childProcessSmoke();
    const childProjection = JSON.parse(child.stderr);
    const failureOutputs = [noArgs.output, malformed.output, { stdout: child.stdout, stderr: child.stderr }];
    outputLeaks += failureOutputs.flatMap(({ stdout, stderr }) => [stdout, stderr])
      .filter((text) => text.includes(SECRET) || text.includes(root)).length;
    const failureStdoutBytes = failureOutputs
      .reduce((total, value) => total + Buffer.byteLength(value.stdout, 'utf8'), 0);
    assert.equal(noArgs.output.stdout, '');
    assert.equal(malformed.output.stdout, '');
    assert.equal(child.stdout, '');
    assert.equal(noArgsExitCode, 2);
    assert.equal(malformedExitCode, 3);
    assert.equal(child.code, 2);
    assert.equal(childProjection.code, 'option-missing');
    assert.equal(mismatchHostCalls, 0);

    const assertions = {
      authorityExpanded: false,
      deterministicRuns: 2,
      families: FAMILY_DEFINITIONS.length,
      failureStdoutBytes,
      hostConstructionCalls,
      malformedResultAccepted: malformedExitCode === 0 ? 1 : 0,
      outputLeaks,
      parentReceiptBound: DIGEST.test(parentBinding.receiptDigest)
        && DIGEST.test(parentBinding.fileSha256),
      providerCalls,
    };
    assert.equal(assertions.hostConstructionCalls, 2);
    assert.equal(assertions.providerCalls, 0);
    assert.equal(assertions.failureStdoutBytes, 0);
    assert.equal(assertions.malformedResultAccepted, 0);
    assert.equal(assertions.outputLeaks, 0);
    const unsigned = {
      schemaVersion: 1,
      protocolId: FIXTURE_PROTOCOL,
      parent: parentBinding,
      families,
      assertions,
    };
    return { ...unsigned, fixtureDigest: sha256Value(unsigned) };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function buildDeterministicProviderBackedIdentityCliFixture() {
  const first = await buildOnce();
  const second = await buildOnce();
  assert.equal(canonicalJson(first), canonicalJson(second));
  return first;
}
