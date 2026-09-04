import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Text, sha256Value } from '../core/digest.mjs';

const registry = Object.freeze({
  'admitted-provider-backed-identity-launcher-v1.json': 'admitted-provider-backed-identity-launcher-v1',
  'admitted-sealed-identity-host-v1.json': 'admitted-sealed-identity-host-v1',
  'admitted-sealed-typed-execution-host-v1.json': 'admitted-sealed-typed-execution-host-v1',
  'codex-bound-turn-v1.json': 'codex-bound-turn-v1',
  'codex-recoverable-turn-coordinator-v1.json': 'codex-recoverable-turn-coordinator-v1',
  'codex-recoverable-turn-journal-v1.json': 'codex-recoverable-turn-journal-v1',
  'creation-forge-phase1-certification.json': 'creation-forge-phase1',
  'cortex-binding-contracts-v1.json': 'cortex-binding-contracts-v1',
  'cortex-binding-registry-v1.json': 'cortex-binding-registry-v1',
  'creator-protocol-phase3-certification.json': 'creator-protocol-phase3',
  'deferred-godskills-review-executor-v1.json': 'deferred-godskills-review-executor-v1',
  'deferred-godskills-review-materializer-v1.json': 'deferred-godskills-review-materializer-v1',
  'durable-anthropic-messages-phase-transport-v1.json': 'durable-anthropic-messages-phase-transport-v1',
  'godagent-v0-certification.json': 'godagent-v0',
  'godskills-adaptive-activation-v1.json': 'godskills-adaptive-activation-v1',
  'godskills-specialist-preference-v1.json': 'godskills-specialist-preference-v1',
  'godskills-typed-composition-consumer-v1.json': 'godskills-typed-composition-consumer-v1',
  'godskills-v3-integration.json': 'godskills-v3-mission-binding',
  'identity-bound-mission-vessel-v1.json': 'identity-bound-mission-vessel-v1',
  'local-admission-shell-certification.json': 'local-admission-shell-v1',
  'networked-cortex-certification.json': 'networked-cortex-v1',
  'provider-backed-identity-cli-v1.json': 'provider-backed-identity-cli-v1',
  'provider-neutral-phase-protocol-v1.json': 'provider-neutral-phase-protocol-v1',
  'provider-neutral-phase-resolution-v1.json': 'provider-neutral-phase-resolution-v1',
  'provider-backed-mission-dependencies-v1.json': 'provider-backed-mission-dependencies-v1',
  'provider-phase-host-sdk-v1.json': 'provider-phase-host-sdk-v1',
  'portable-phase-host-conformance-v1.json': 'portable-phase-host-conformance-v1',
  'provider-resolution-authority-handoff-v1.json': 'provider-resolution-authority-handoff-v1',
  'provider-resolution-authority-outbox-v1.json': 'provider-resolution-authority-outbox-v1',
  'provider-resolution-decision-preparer-v1.json': 'provider-resolution-decision-preparer-v1',
  'provider-resolution-profile-v1.json': 'provider-resolution-profile-v1',
  'recoverable-godskills-admission-v1.json': 'recoverable-godskills-admission-v1',
  'recoverable-mission-native-executor-v1.json': 'recoverable-mission-native-executor-v1',
  'recoverable-mission-revision-executor-v1.json': 'recoverable-mission-revision-executor-v1',
  'recoverable-typed-execution-journal-v1.json': 'recoverable-typed-execution-journal-v1',
  'realm-negotiation-v1.json': 'realm-negotiation-v1',
  'recoverable-typed-composition-compiler-v1.json': 'recoverable-typed-composition-compiler-v1',
  'receipt-bound-typed-executor-bundle-v1.json': 'receipt-bound-typed-executor-bundle-v1',
  'resumable-mission-review-kernel-v1.json': 'resumable-mission-review-kernel-v1',
  'routing-evidence-activation-classifier-v1.json': 'routing-evidence-activation-classifier-v1',
  'sealed-local-godskills-transport-v1.json': 'sealed-local-godskills-transport-v1',
  'sealed-local-identity-vessel-v1.json': 'sealed-local-identity-vessel-v1',
  'sealed-local-typed-composition-compiler-v1.json': 'sealed-local-typed-composition-compiler-v1',
  'sealed-local-typed-execution-runner-v1.json': 'sealed-local-typed-execution-runner-v1',
  'sealed-openai-compatible-phase-transport-v1.json': 'sealed-openai-compatible-phase-transport-v1',
  'signed-openai-phase-resolution-v1.json': 'signed-openai-phase-resolution-v1',
  'transactional-genesis-phase2-certification.json': 'transactional-genesis-phase2',
  'visual-creator-shell-certification.json': 'visual-creator-shell-v1',
});
const expectedFiles = Object.freeze(Object.keys(registry).sort());
const expectedFilesBeforeRealmNegotiation = Object.freeze(expectedFiles.filter(
  (file) => file !== 'realm-negotiation-v1.json',
));
const expectedFilesBeforePortablePhaseHost = Object.freeze(expectedFilesBeforeRealmNegotiation.filter(
  (file) => file !== 'portable-phase-host-conformance-v1.json',
));
const expectedFilesBeforeProviderBackedIdentityCli = Object.freeze(expectedFilesBeforePortablePhaseHost.filter(
  (file) => file !== 'provider-backed-identity-cli-v1.json',
));
const expectedFilesBeforeAdmittedProviderLauncher = Object.freeze(expectedFilesBeforeProviderBackedIdentityCli.filter(
  (file) => file !== 'admitted-provider-backed-identity-launcher-v1.json',
));
const requiredHistoricalLinks = Object.freeze({
  'provider-neutral-phase-protocol-v1.json': Object.freeze(expectedFilesBeforeAdmittedProviderLauncher
    .filter((file) => ![
      'durable-anthropic-messages-phase-transport-v1.json',
      'provider-phase-host-sdk-v1.json',
      'provider-neutral-phase-protocol-v1.json',
      'provider-neutral-phase-resolution-v1.json',
      'provider-resolution-authority-handoff-v1.json',
      'provider-resolution-authority-outbox-v1.json',
      'provider-backed-mission-dependencies-v1.json',
      'provider-resolution-decision-preparer-v1.json',
      'provider-resolution-profile-v1.json',
    ].includes(file))
    .map((file) => `receipts/${file}`)),
  'receipt-bound-typed-executor-bundle-v1.json': Object.freeze(expectedFilesBeforeAdmittedProviderLauncher
    .filter((file) => ![
      'durable-anthropic-messages-phase-transport-v1.json',
      'provider-phase-host-sdk-v1.json',
      'provider-neutral-phase-protocol-v1.json',
      'provider-neutral-phase-resolution-v1.json',
      'provider-resolution-authority-handoff-v1.json',
      'provider-resolution-authority-outbox-v1.json',
      'provider-backed-mission-dependencies-v1.json',
      'provider-resolution-decision-preparer-v1.json',
      'provider-resolution-profile-v1.json',
      'receipt-bound-typed-executor-bundle-v1.json',
    ].includes(file))
    .map((file) => `receipts/${file}`)),
  'durable-anthropic-messages-phase-transport-v1.json': Object.freeze(expectedFilesBeforeAdmittedProviderLauncher
    .filter((file) => ![
      'durable-anthropic-messages-phase-transport-v1.json',
      'provider-phase-host-sdk-v1.json',
      'provider-neutral-phase-resolution-v1.json',
      'provider-resolution-authority-handoff-v1.json',
      'provider-resolution-authority-outbox-v1.json',
      'provider-backed-mission-dependencies-v1.json',
      'provider-resolution-decision-preparer-v1.json',
      'provider-resolution-profile-v1.json',
    ].includes(file))
    .map((file) => `receipts/${file}`)),
  'provider-phase-host-sdk-v1.json': Object.freeze(expectedFilesBeforeAdmittedProviderLauncher
    .filter((file) => ![
      'provider-phase-host-sdk-v1.json', 'provider-neutral-phase-resolution-v1.json',
      'provider-resolution-authority-handoff-v1.json',
      'provider-resolution-authority-outbox-v1.json',
      'provider-backed-mission-dependencies-v1.json',
      'provider-resolution-decision-preparer-v1.json',
      'provider-resolution-profile-v1.json',
    ].includes(file))
    .map((file) => `receipts/${file}`)),
  'provider-neutral-phase-resolution-v1.json': Object.freeze(expectedFilesBeforeAdmittedProviderLauncher
    .filter((file) => ![
      'provider-neutral-phase-resolution-v1.json',
      'provider-resolution-authority-handoff-v1.json',
      'provider-resolution-authority-outbox-v1.json',
      'provider-backed-mission-dependencies-v1.json',
      'provider-resolution-decision-preparer-v1.json', 'provider-resolution-profile-v1.json',
    ].includes(file))
    .map((file) => `receipts/${file}`)),
  'provider-resolution-profile-v1.json': Object.freeze(expectedFilesBeforeAdmittedProviderLauncher
    .filter((file) => ![
      'provider-resolution-authority-handoff-v1.json',
      'provider-resolution-authority-outbox-v1.json',
      'provider-backed-mission-dependencies-v1.json',
      'provider-resolution-decision-preparer-v1.json', 'provider-resolution-profile-v1.json',
    ].includes(file))
    .map((file) => `receipts/${file}`)),
  'provider-resolution-decision-preparer-v1.json': Object.freeze(expectedFilesBeforeAdmittedProviderLauncher
    .filter((file) => ![
      'provider-resolution-authority-handoff-v1.json',
      'provider-resolution-authority-outbox-v1.json',
      'provider-backed-mission-dependencies-v1.json',
      'provider-resolution-decision-preparer-v1.json',
    ].includes(file))
    .map((file) => `receipts/${file}`)),
  'provider-resolution-authority-handoff-v1.json': Object.freeze(expectedFilesBeforeAdmittedProviderLauncher
    .filter((file) => ![
      'provider-resolution-authority-handoff-v1.json',
      'provider-resolution-authority-outbox-v1.json',
      'provider-backed-mission-dependencies-v1.json',
    ].includes(file))
    .map((file) => `receipts/${file}`)),
  'provider-resolution-authority-outbox-v1.json': Object.freeze(expectedFilesBeforeAdmittedProviderLauncher
    .filter((file) => ![
      'provider-resolution-authority-outbox-v1.json',
      'provider-backed-mission-dependencies-v1.json',
    ].includes(file))
    .map((file) => `receipts/${file}`)),
  'provider-backed-mission-dependencies-v1.json': Object.freeze(expectedFilesBeforeAdmittedProviderLauncher
    .filter((file) => file !== 'provider-backed-mission-dependencies-v1.json')
    .map((file) => `receipts/${file}`)),
  'admitted-provider-backed-identity-launcher-v1.json': Object.freeze(expectedFilesBeforePortablePhaseHost
    .filter((file) => file !== 'admitted-provider-backed-identity-launcher-v1.json'
      && file !== 'provider-backed-identity-cli-v1.json')
    .map((file) => `receipts/${file}`)),
  'provider-backed-identity-cli-v1.json': Object.freeze(expectedFilesBeforeProviderBackedIdentityCli
    .map((file) => `receipts/${file}`)),
  'admitted-sealed-identity-host-v1.json': Object.freeze([
    'receipts/codex-bound-turn-v1.json',
    'receipts/codex-recoverable-turn-coordinator-v1.json',
    'receipts/codex-recoverable-turn-journal-v1.json',
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/deferred-godskills-review-executor-v1.json',
    'receipts/deferred-godskills-review-materializer-v1.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/identity-bound-mission-vessel-v1.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/recoverable-godskills-admission-v1.json',
    'receipts/recoverable-mission-native-executor-v1.json',
    'receipts/recoverable-mission-revision-executor-v1.json',
    'receipts/resumable-mission-review-kernel-v1.json',
    'receipts/routing-evidence-activation-classifier-v1.json',
    'receipts/sealed-local-godskills-transport-v1.json',
    'receipts/sealed-local-identity-vessel-v1.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'admitted-sealed-typed-execution-host-v1.json': Object.freeze([
    'receipts/admitted-sealed-identity-host-v1.json',
    'receipts/codex-bound-turn-v1.json',
    'receipts/codex-recoverable-turn-coordinator-v1.json',
    'receipts/codex-recoverable-turn-journal-v1.json',
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/deferred-godskills-review-executor-v1.json',
    'receipts/deferred-godskills-review-materializer-v1.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-typed-composition-consumer-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/identity-bound-mission-vessel-v1.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/recoverable-godskills-admission-v1.json',
    'receipts/recoverable-mission-native-executor-v1.json',
    'receipts/recoverable-mission-revision-executor-v1.json',
    'receipts/recoverable-typed-composition-compiler-v1.json',
    'receipts/recoverable-typed-execution-journal-v1.json',
    'receipts/resumable-mission-review-kernel-v1.json',
    'receipts/routing-evidence-activation-classifier-v1.json',
    'receipts/sealed-local-godskills-transport-v1.json',
    'receipts/sealed-local-identity-vessel-v1.json',
    'receipts/sealed-local-typed-composition-compiler-v1.json',
    'receipts/sealed-local-typed-execution-runner-v1.json',
    'receipts/sealed-openai-compatible-phase-transport-v1.json',
    'receipts/signed-openai-phase-resolution-v1.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'codex-bound-turn-v1.json': Object.freeze([
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'codex-recoverable-turn-coordinator-v1.json': Object.freeze([
    'receipts/codex-bound-turn-v1.json',
    'receipts/codex-recoverable-turn-journal-v1.json',
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'codex-recoverable-turn-journal-v1.json': Object.freeze([
    'receipts/codex-bound-turn-v1.json',
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'creation-forge-phase1-certification.json': Object.freeze([
    'receipts/godagent-v0-certification.json',
    'receipts/networked-cortex-certification.json',
  ]),
  'cortex-binding-contracts-v1.json': Object.freeze([
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'cortex-binding-registry-v1.json': Object.freeze([
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'creator-protocol-phase3-certification.json': Object.freeze([
    'receipts/creation-forge-phase1-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/transactional-genesis-phase2-certification.json',
  ]),
  'deferred-godskills-review-executor-v1.json': Object.freeze([
    'receipts/codex-bound-turn-v1.json',
    'receipts/codex-recoverable-turn-coordinator-v1.json',
    'receipts/codex-recoverable-turn-journal-v1.json',
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/deferred-godskills-review-materializer-v1.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/resumable-mission-review-kernel-v1.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'deferred-godskills-review-materializer-v1.json': Object.freeze([
    'receipts/codex-bound-turn-v1.json',
    'receipts/codex-recoverable-turn-coordinator-v1.json',
    'receipts/codex-recoverable-turn-journal-v1.json',
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/resumable-mission-review-kernel-v1.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'godagent-v0-certification.json': Object.freeze([]),
  'godskills-adaptive-activation-v1.json': Object.freeze([
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-v3-integration.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'godskills-specialist-preference-v1.json': Object.freeze([
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'godskills-typed-composition-consumer-v1.json': Object.freeze([
    'receipts/admitted-sealed-identity-host-v1.json',
    'receipts/codex-bound-turn-v1.json',
    'receipts/codex-recoverable-turn-coordinator-v1.json',
    'receipts/codex-recoverable-turn-journal-v1.json',
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/deferred-godskills-review-executor-v1.json',
    'receipts/deferred-godskills-review-materializer-v1.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/identity-bound-mission-vessel-v1.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/recoverable-godskills-admission-v1.json',
    'receipts/recoverable-mission-native-executor-v1.json',
    'receipts/recoverable-mission-revision-executor-v1.json',
    'receipts/resumable-mission-review-kernel-v1.json',
    'receipts/routing-evidence-activation-classifier-v1.json',
    'receipts/sealed-local-godskills-transport-v1.json',
    'receipts/sealed-local-identity-vessel-v1.json',
    'receipts/sealed-openai-compatible-phase-transport-v1.json',
    'receipts/signed-openai-phase-resolution-v1.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'godskills-v3-integration.json': Object.freeze([
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'identity-bound-mission-vessel-v1.json': Object.freeze([
    'receipts/codex-bound-turn-v1.json',
    'receipts/codex-recoverable-turn-coordinator-v1.json',
    'receipts/codex-recoverable-turn-journal-v1.json',
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/deferred-godskills-review-executor-v1.json',
    'receipts/deferred-godskills-review-materializer-v1.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/recoverable-mission-native-executor-v1.json',
    'receipts/recoverable-mission-revision-executor-v1.json',
    'receipts/resumable-mission-review-kernel-v1.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'local-admission-shell-certification.json': Object.freeze([
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'networked-cortex-certification.json': Object.freeze([
    'receipts/godagent-v0-certification.json',
  ]),
  'recoverable-godskills-admission-v1.json': Object.freeze([
    'receipts/codex-bound-turn-v1.json',
    'receipts/codex-recoverable-turn-coordinator-v1.json',
    'receipts/codex-recoverable-turn-journal-v1.json',
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/deferred-godskills-review-executor-v1.json',
    'receipts/deferred-godskills-review-materializer-v1.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/identity-bound-mission-vessel-v1.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/recoverable-mission-native-executor-v1.json',
    'receipts/recoverable-mission-revision-executor-v1.json',
    'receipts/resumable-mission-review-kernel-v1.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'recoverable-mission-native-executor-v1.json': Object.freeze([
    'receipts/codex-bound-turn-v1.json',
    'receipts/codex-recoverable-turn-coordinator-v1.json',
    'receipts/codex-recoverable-turn-journal-v1.json',
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/deferred-godskills-review-executor-v1.json',
    'receipts/deferred-godskills-review-materializer-v1.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/recoverable-mission-revision-executor-v1.json',
    'receipts/resumable-mission-review-kernel-v1.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'recoverable-mission-revision-executor-v1.json': Object.freeze([
    'receipts/codex-bound-turn-v1.json',
    'receipts/codex-recoverable-turn-coordinator-v1.json',
    'receipts/codex-recoverable-turn-journal-v1.json',
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/deferred-godskills-review-executor-v1.json',
    'receipts/deferred-godskills-review-materializer-v1.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/resumable-mission-review-kernel-v1.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'recoverable-typed-composition-compiler-v1.json': Object.freeze([
    'receipts/admitted-sealed-identity-host-v1.json',
    'receipts/codex-bound-turn-v1.json',
    'receipts/codex-recoverable-turn-coordinator-v1.json',
    'receipts/codex-recoverable-turn-journal-v1.json',
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/deferred-godskills-review-executor-v1.json',
    'receipts/deferred-godskills-review-materializer-v1.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-typed-composition-consumer-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/identity-bound-mission-vessel-v1.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/recoverable-godskills-admission-v1.json',
    'receipts/recoverable-mission-native-executor-v1.json',
    'receipts/recoverable-mission-revision-executor-v1.json',
    'receipts/resumable-mission-review-kernel-v1.json',
    'receipts/routing-evidence-activation-classifier-v1.json',
    'receipts/sealed-local-godskills-transport-v1.json',
    'receipts/sealed-local-identity-vessel-v1.json',
    'receipts/sealed-openai-compatible-phase-transport-v1.json',
    'receipts/signed-openai-phase-resolution-v1.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'resumable-mission-review-kernel-v1.json': Object.freeze([
    'receipts/codex-bound-turn-v1.json',
    'receipts/codex-recoverable-turn-coordinator-v1.json',
    'receipts/codex-recoverable-turn-journal-v1.json',
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'routing-evidence-activation-classifier-v1.json': Object.freeze([
    'receipts/codex-bound-turn-v1.json',
    'receipts/codex-recoverable-turn-coordinator-v1.json',
    'receipts/codex-recoverable-turn-journal-v1.json',
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/deferred-godskills-review-executor-v1.json',
    'receipts/deferred-godskills-review-materializer-v1.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/identity-bound-mission-vessel-v1.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/recoverable-godskills-admission-v1.json',
    'receipts/recoverable-mission-native-executor-v1.json',
    'receipts/recoverable-mission-revision-executor-v1.json',
    'receipts/resumable-mission-review-kernel-v1.json',
    'receipts/sealed-local-godskills-transport-v1.json',
    'receipts/sealed-local-identity-vessel-v1.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'sealed-local-godskills-transport-v1.json': Object.freeze([
    'receipts/codex-bound-turn-v1.json',
    'receipts/codex-recoverable-turn-coordinator-v1.json',
    'receipts/codex-recoverable-turn-journal-v1.json',
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/deferred-godskills-review-executor-v1.json',
    'receipts/deferred-godskills-review-materializer-v1.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/identity-bound-mission-vessel-v1.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/recoverable-godskills-admission-v1.json',
    'receipts/recoverable-mission-native-executor-v1.json',
    'receipts/recoverable-mission-revision-executor-v1.json',
    'receipts/resumable-mission-review-kernel-v1.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'sealed-local-identity-vessel-v1.json': Object.freeze([
    'receipts/codex-bound-turn-v1.json',
    'receipts/codex-recoverable-turn-coordinator-v1.json',
    'receipts/codex-recoverable-turn-journal-v1.json',
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/deferred-godskills-review-executor-v1.json',
    'receipts/deferred-godskills-review-materializer-v1.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/identity-bound-mission-vessel-v1.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/recoverable-godskills-admission-v1.json',
    'receipts/recoverable-mission-native-executor-v1.json',
    'receipts/recoverable-mission-revision-executor-v1.json',
    'receipts/resumable-mission-review-kernel-v1.json',
    'receipts/sealed-local-godskills-transport-v1.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'recoverable-typed-execution-journal-v1.json': Object.freeze([
    'receipts/admitted-sealed-identity-host-v1.json',
    'receipts/codex-bound-turn-v1.json',
    'receipts/codex-recoverable-turn-coordinator-v1.json',
    'receipts/codex-recoverable-turn-journal-v1.json',
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/deferred-godskills-review-executor-v1.json',
    'receipts/deferred-godskills-review-materializer-v1.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-typed-composition-consumer-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/identity-bound-mission-vessel-v1.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/recoverable-godskills-admission-v1.json',
    'receipts/recoverable-mission-native-executor-v1.json',
    'receipts/recoverable-mission-revision-executor-v1.json',
    'receipts/recoverable-typed-composition-compiler-v1.json',
    'receipts/resumable-mission-review-kernel-v1.json',
    'receipts/routing-evidence-activation-classifier-v1.json',
    'receipts/sealed-local-godskills-transport-v1.json',
    'receipts/sealed-local-identity-vessel-v1.json',
    'receipts/sealed-local-typed-composition-compiler-v1.json',
    'receipts/sealed-openai-compatible-phase-transport-v1.json',
    'receipts/signed-openai-phase-resolution-v1.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'sealed-local-typed-composition-compiler-v1.json': Object.freeze([
    'receipts/admitted-sealed-identity-host-v1.json',
    'receipts/codex-bound-turn-v1.json',
    'receipts/codex-recoverable-turn-coordinator-v1.json',
    'receipts/codex-recoverable-turn-journal-v1.json',
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/deferred-godskills-review-executor-v1.json',
    'receipts/deferred-godskills-review-materializer-v1.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-typed-composition-consumer-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/identity-bound-mission-vessel-v1.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/recoverable-godskills-admission-v1.json',
    'receipts/recoverable-mission-native-executor-v1.json',
    'receipts/recoverable-mission-revision-executor-v1.json',
    'receipts/recoverable-typed-composition-compiler-v1.json',
    'receipts/resumable-mission-review-kernel-v1.json',
    'receipts/routing-evidence-activation-classifier-v1.json',
    'receipts/sealed-local-godskills-transport-v1.json',
    'receipts/sealed-local-identity-vessel-v1.json',
    'receipts/sealed-openai-compatible-phase-transport-v1.json',
    'receipts/signed-openai-phase-resolution-v1.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'sealed-local-typed-execution-runner-v1.json': Object.freeze([
    'receipts/admitted-sealed-identity-host-v1.json',
    'receipts/codex-bound-turn-v1.json',
    'receipts/codex-recoverable-turn-coordinator-v1.json',
    'receipts/codex-recoverable-turn-journal-v1.json',
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/deferred-godskills-review-executor-v1.json',
    'receipts/deferred-godskills-review-materializer-v1.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-typed-composition-consumer-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/identity-bound-mission-vessel-v1.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/recoverable-godskills-admission-v1.json',
    'receipts/recoverable-mission-native-executor-v1.json',
    'receipts/recoverable-mission-revision-executor-v1.json',
    'receipts/recoverable-typed-composition-compiler-v1.json',
    'receipts/recoverable-typed-execution-journal-v1.json',
    'receipts/resumable-mission-review-kernel-v1.json',
    'receipts/routing-evidence-activation-classifier-v1.json',
    'receipts/sealed-local-godskills-transport-v1.json',
    'receipts/sealed-local-identity-vessel-v1.json',
    'receipts/sealed-local-typed-composition-compiler-v1.json',
    'receipts/sealed-openai-compatible-phase-transport-v1.json',
    'receipts/signed-openai-phase-resolution-v1.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'sealed-openai-compatible-phase-transport-v1.json': Object.freeze([
    'receipts/admitted-sealed-identity-host-v1.json',
    'receipts/codex-bound-turn-v1.json',
    'receipts/codex-recoverable-turn-coordinator-v1.json',
    'receipts/codex-recoverable-turn-journal-v1.json',
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/deferred-godskills-review-executor-v1.json',
    'receipts/deferred-godskills-review-materializer-v1.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/identity-bound-mission-vessel-v1.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/recoverable-godskills-admission-v1.json',
    'receipts/recoverable-mission-native-executor-v1.json',
    'receipts/recoverable-mission-revision-executor-v1.json',
    'receipts/resumable-mission-review-kernel-v1.json',
    'receipts/routing-evidence-activation-classifier-v1.json',
    'receipts/sealed-local-godskills-transport-v1.json',
    'receipts/sealed-local-identity-vessel-v1.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'signed-openai-phase-resolution-v1.json': Object.freeze([
    'receipts/admitted-sealed-identity-host-v1.json',
    'receipts/codex-bound-turn-v1.json',
    'receipts/codex-recoverable-turn-coordinator-v1.json',
    'receipts/codex-recoverable-turn-journal-v1.json',
    'receipts/cortex-binding-contracts-v1.json',
    'receipts/cortex-binding-registry-v1.json',
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/deferred-godskills-review-executor-v1.json',
    'receipts/deferred-godskills-review-materializer-v1.json',
    'receipts/godagent-v0-certification.json',
    'receipts/godskills-adaptive-activation-v1.json',
    'receipts/godskills-specialist-preference-v1.json',
    'receipts/godskills-v3-integration.json',
    'receipts/identity-bound-mission-vessel-v1.json',
    'receipts/local-admission-shell-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/recoverable-godskills-admission-v1.json',
    'receipts/recoverable-mission-native-executor-v1.json',
    'receipts/recoverable-mission-revision-executor-v1.json',
    'receipts/resumable-mission-review-kernel-v1.json',
    'receipts/routing-evidence-activation-classifier-v1.json',
    'receipts/sealed-local-godskills-transport-v1.json',
    'receipts/sealed-local-identity-vessel-v1.json',
    'receipts/sealed-openai-compatible-phase-transport-v1.json',
    'receipts/transactional-genesis-phase2-certification.json',
    'receipts/visual-creator-shell-certification.json',
  ]),
  'transactional-genesis-phase2-certification.json': Object.freeze([
    'receipts/creation-forge-phase1-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/networked-cortex-certification.json',
  ]),
  'visual-creator-shell-certification.json': Object.freeze([
    'receipts/creation-forge-phase1-certification.json',
    'receipts/creator-protocol-phase3-certification.json',
    'receipts/godagent-v0-certification.json',
    'receipts/networked-cortex-certification.json',
    'receipts/transactional-genesis-phase2-certification.json',
  ]),
  'portable-phase-host-conformance-v1.json': Object.freeze([
    'receipts/provider-phase-host-sdk-v1.json',
  ]),
  'realm-negotiation-v1.json': Object.freeze(expectedFilesBeforeRealmNegotiation
    .map((file) => `receipts/${file}`)),
});
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const execFileAsync = promisify(execFile);

function localPath(value) {
  return value instanceof URL ? fileURLToPath(value) : resolve(value);
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function declaredLinks(file, receipt) {
  const sourceLinks = receipt.source?.historicalReceiptDigests;
  if (sourceLinks !== undefined) {
    if (!sourceLinks || typeof sourceLinks !== 'object' || Array.isArray(sourceLinks)) {
      throw new Error(`historical receipt map is invalid for ${file}`);
    }
    const links = Object.entries(sourceLinks);
    if (!sameArray(links.map(([path]) => path).sort(), requiredHistoricalLinks[file])) {
      throw new Error(`historical receipt set mismatch for ${file}`);
    }
    return links;
  }
  if (file === 'networked-cortex-certification.json') {
    const digest = receipt.proof?.historicalReceipt?.sha256;
    if (!DIGEST.test(digest)) throw new Error('historical receipt link is invalid for networked cortex');
    return [[requiredHistoricalLinks[file][0], digest]];
  }
  if (requiredHistoricalLinks[file].length > 0) throw new Error(`historical receipt set mismatch for ${file}`);
  return [];
}

async function requireCommit(repositoryRoot, commit, file, gitEnvironment) {
  try {
    await execFileAsync('git', ['-C', repositoryRoot, 'cat-file', '-e', `${commit}^{commit}`], {
      windowsHide: true,
      ...(gitEnvironment === undefined ? {} : { env: gitEnvironment }),
    });
  } catch {
    throw new Error(`certification source commit does not resolve: ${file}`);
  }
}

export async function verifyCertificationLedger({ receiptDirectory, repositoryRoot, gitEnvironment }) {
  const directory = localPath(receiptDirectory);
  const repository = repositoryRoot === undefined ? resolve(directory, '..') : localPath(repositoryRoot);
  const files = (await readdir(directory)).sort();
  if (!sameArray(files, expectedFiles)) throw new Error('certification receipt set mismatch');

  const loaded = new Map();
  for (const file of files) {
    const text = await readFile(join(directory, file), 'utf8');
    let receipt;
    try {
      receipt = JSON.parse(text);
    } catch {
      throw new Error(`certification receipt is invalid JSON: ${file}`);
    }
    if (text !== `${canonicalJson(receipt)}\n`) throw new Error(`certification receipt is not canonical: ${file}`);
    if (receipt.status !== 'certified' || !DIGEST.test(receipt.receiptDigest)) {
      throw new Error(`certification receipt is not certified: ${file}`);
    }
    const { receiptDigest, ...unsigned } = receipt;
    if (receiptDigest !== sha256Value(unsigned)) throw new Error(`certification receipt digest mismatch: ${file}`);
    const certificationId = receipt.certificationId ?? (file === 'godagent-v0-certification.json' ? 'godagent-v0' : null);
    if (certificationId !== registry[file]) throw new Error(`certification identity mismatch: ${file}`);
    const sourceCommit = receipt.source?.commit;
    if (!COMMIT.test(sourceCommit)) throw new Error(`certification source commit is invalid: ${file}`);
    await requireCommit(repository, sourceCommit, file, gitEnvironment);
    loaded.set(file, {
      receipt,
      fileSha256: sha256Text(text),
      row: {
        certificationId,
        file,
        sourceCommit,
        receiptDigest,
        fileSha256: sha256Text(text),
      },
    });
  }

  for (const [file, entry] of loaded) {
    for (const [path, expectedDigest] of declaredLinks(file, entry.receipt)) {
      if (typeof path !== 'string' || !path.startsWith('receipts/') || path.includes('..') || !DIGEST.test(expectedDigest)) {
        throw new Error(`historical receipt link is invalid for ${file}`);
      }
      const target = loaded.get(path.slice('receipts/'.length));
      if (!target || target.fileSha256 !== expectedDigest) {
        throw new Error(`historical receipt digest mismatch for ${file}`);
      }
    }
  }

  const receiptBound = loaded.get('receipt-bound-typed-executor-bundle-v1.json');
  if (receiptBound) {
    const { buildReceiptBoundTypedExecutorBundleReceiptFromSource } = await import(
      '../../scripts/build-receipt-bound-typed-executor-bundle-v1-receipt.mjs'
    );
    const rebuilt = await buildReceiptBoundTypedExecutorBundleReceiptFromSource({
      repositoryRoot: repository,
      sourceCommit: receiptBound.receipt.source.commit,
      testRuns: receiptBound.receipt.testRuns,
    });
    if (canonicalJson(rebuilt) !== canonicalJson(receiptBound.receipt)) {
      throw new Error('receipt-bound typed executor certification differs from exact source reconstruction');
    }
  }

  const providerNeutral = loaded.get('provider-neutral-phase-protocol-v1.json');
  if (providerNeutral) {
    const { buildProviderNeutralPhaseProtocolReceiptFromSource } = await import(
      '../../scripts/build-provider-neutral-phase-protocol-v1-receipt.mjs'
    );
    const rebuilt = await buildProviderNeutralPhaseProtocolReceiptFromSource({
      repositoryRoot: repository,
      sourceCommit: providerNeutral.receipt.source.commit,
      testRuns: providerNeutral.receipt.testRuns,
    });
    if (canonicalJson(rebuilt) !== canonicalJson(providerNeutral.receipt)) {
      throw new Error('provider-neutral phase protocol certification differs from exact source reconstruction');
    }
  }

  const durableAnthropic = loaded.get('durable-anthropic-messages-phase-transport-v1.json');
  if (durableAnthropic) {
    const { buildDurableAnthropicMessagesPhaseTransportReceiptFromSource } = await import(
      '../../scripts/build-durable-anthropic-messages-phase-transport-v1-receipt.mjs'
    );
    const rebuilt = await buildDurableAnthropicMessagesPhaseTransportReceiptFromSource({
      repositoryRoot: repository,
      sourceCommit: durableAnthropic.receipt.source.commit,
      testRuns: durableAnthropic.receipt.testRuns,
    });
    if (canonicalJson(rebuilt) !== canonicalJson(durableAnthropic.receipt)) {
      throw new Error('durable Anthropic phase transport certification differs from exact source reconstruction');
    }
  }

  const providerPhaseSdk = loaded.get('provider-phase-host-sdk-v1.json');
  if (providerPhaseSdk) {
    const { buildProviderPhaseHostSdkReceiptFromSource } = await import(
      '../../scripts/build-provider-phase-host-sdk-v1-receipt.mjs'
    );
    const rebuilt = await buildProviderPhaseHostSdkReceiptFromSource({
      repositoryRoot: repository,
      sourceCommit: providerPhaseSdk.receipt.source.commit,
      testRuns: providerPhaseSdk.receipt.testRuns,
    });
    if (canonicalJson(rebuilt) !== canonicalJson(providerPhaseSdk.receipt)) {
      throw new Error('provider phase host sdk certification differs from exact source reconstruction');
    }
  }

  const providerNeutralResolution = loaded.get('provider-neutral-phase-resolution-v1.json');
  if (providerNeutralResolution) {
    const { buildProviderNeutralPhaseResolutionReceiptFromSource } = await import(
      '../../scripts/build-provider-neutral-phase-resolution-v1-receipt.mjs'
    );
    const rebuilt = await buildProviderNeutralPhaseResolutionReceiptFromSource({
      repositoryRoot: repository,
      sourceCommit: providerNeutralResolution.receipt.source.commit,
      testRuns: providerNeutralResolution.receipt.testRuns,
    });
    if (canonicalJson(rebuilt) !== canonicalJson(providerNeutralResolution.receipt)) {
      throw new Error('provider-neutral phase resolution certification differs from exact source reconstruction');
    }
  }

  const providerResolutionProfile = loaded.get('provider-resolution-profile-v1.json');
  if (providerResolutionProfile) {
    const { buildProviderResolutionProfileReceiptFromSource } = await import(
      '../../scripts/build-provider-resolution-profile-v1-receipt.mjs'
    );
    const rebuilt = await buildProviderResolutionProfileReceiptFromSource({
      repositoryRoot: repository,
      sourceCommit: providerResolutionProfile.receipt.source.commit,
      testRuns: providerResolutionProfile.receipt.testRuns,
    });
    if (canonicalJson(rebuilt) !== canonicalJson(providerResolutionProfile.receipt)) {
      throw new Error('provider resolution profile certification differs from exact source reconstruction');
    }
  }

  const providerResolutionDecisionPreparer = loaded.get('provider-resolution-decision-preparer-v1.json');
  if (providerResolutionDecisionPreparer) {
    const { buildProviderResolutionDecisionPreparerReceiptFromSource } = await import(
      '../../scripts/build-provider-resolution-decision-preparer-v1-receipt.mjs'
    );
    const rebuilt = await buildProviderResolutionDecisionPreparerReceiptFromSource({
      repositoryRoot: repository,
      sourceCommit: providerResolutionDecisionPreparer.receipt.source.commit,
      testRuns: providerResolutionDecisionPreparer.receipt.testRuns,
    });
    if (canonicalJson(rebuilt) !== canonicalJson(providerResolutionDecisionPreparer.receipt)) {
      throw new Error('provider resolution decision preparer certification differs from exact source reconstruction');
    }
  }

  const providerResolutionAuthorityHandoff = loaded.get('provider-resolution-authority-handoff-v1.json');
  if (providerResolutionAuthorityHandoff) {
    const { buildProviderResolutionAuthorityHandoffReceiptFromSource } = await import(
      '../../scripts/build-provider-resolution-authority-handoff-v1-receipt.mjs'
    );
    const rebuilt = await buildProviderResolutionAuthorityHandoffReceiptFromSource({
      repositoryRoot: repository,
      sourceCommit: providerResolutionAuthorityHandoff.receipt.source.commit,
      testRuns: providerResolutionAuthorityHandoff.receipt.testRuns,
    });
    if (canonicalJson(rebuilt) !== canonicalJson(providerResolutionAuthorityHandoff.receipt)) {
      throw new Error('provider resolution authority handoff certification differs from exact source reconstruction');
    }
  }

  const providerResolutionAuthorityOutbox = loaded.get('provider-resolution-authority-outbox-v1.json');
  if (providerResolutionAuthorityOutbox) {
    const { buildProviderResolutionAuthorityOutboxReceiptFromSource } = await import(
      '../../scripts/build-provider-resolution-authority-outbox-v1-receipt.mjs'
    );
    const rebuilt = await buildProviderResolutionAuthorityOutboxReceiptFromSource({
      repositoryRoot: repository,
      sourceCommit: providerResolutionAuthorityOutbox.receipt.source.commit,
      testRuns: providerResolutionAuthorityOutbox.receipt.testRuns,
    });
    if (canonicalJson(rebuilt) !== canonicalJson(providerResolutionAuthorityOutbox.receipt)) {
      throw new Error('provider resolution authority outbox certification differs from exact source reconstruction');
    }
  }

  const providerBackedMissionDependencies = loaded.get('provider-backed-mission-dependencies-v1.json');
  if (providerBackedMissionDependencies) {
    const { buildProviderBackedMissionDependenciesReceiptFromSource } = await import(
      '../../scripts/build-provider-backed-mission-dependencies-v1-receipt.mjs'
    );
    const rebuilt = await buildProviderBackedMissionDependenciesReceiptFromSource({
      repositoryRoot: repository,
      sourceCommit: providerBackedMissionDependencies.receipt.source.commit,
      testRuns: providerBackedMissionDependencies.receipt.testRuns,
    });
    if (canonicalJson(rebuilt) !== canonicalJson(providerBackedMissionDependencies.receipt)) {
      throw new Error('provider-backed mission dependency certification differs from exact source reconstruction');
    }
  }

  const admittedProviderBackedIdentityLauncher = loaded.get(
    'admitted-provider-backed-identity-launcher-v1.json',
  );
  if (admittedProviderBackedIdentityLauncher) {
    const { buildAdmittedProviderBackedIdentityLauncherReceiptFromSource } = await import(
      '../../scripts/build-admitted-provider-backed-identity-launcher-v1-receipt.mjs'
    );
    const rebuilt = await buildAdmittedProviderBackedIdentityLauncherReceiptFromSource({
      repositoryRoot: repository,
      sourceCommit: admittedProviderBackedIdentityLauncher.receipt.source.commit,
      testRuns: admittedProviderBackedIdentityLauncher.receipt.testRuns,
    });
    if (canonicalJson(rebuilt) !== canonicalJson(admittedProviderBackedIdentityLauncher.receipt)) {
      throw new Error('admitted provider-backed identity launcher certification differs from exact source reconstruction');
    }
  }

  const providerBackedIdentityCli = loaded.get('provider-backed-identity-cli-v1.json');
  if (providerBackedIdentityCli) {
    const { buildProviderBackedIdentityCliReceiptFromSource } = await import(
      '../../scripts/build-provider-backed-identity-cli-v1-receipt.mjs'
    );
    const rebuilt = await buildProviderBackedIdentityCliReceiptFromSource({
      repositoryRoot: repository,
      sourceCommit: providerBackedIdentityCli.receipt.source.commit,
      testRuns: providerBackedIdentityCli.receipt.testRuns,
    });
    if (canonicalJson(rebuilt) !== canonicalJson(providerBackedIdentityCli.receipt)) {
      throw new Error('provider-backed identity cli certification differs from exact source reconstruction');
    }
  }

  const receipts = [...loaded.values()].map(({ row }) => row);
  const unsigned = { schemaVersion: 1, status: 'verified', receipts };
  return Object.freeze({ ...unsigned, ledgerDigest: sha256Value(unsigned) });
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  try {
    const result = await verifyCertificationLedger({ receiptDirectory: join(root, 'receipts') });
    process.stdout.write(`${canonicalJson(result)}\n`);
  } catch {
    process.stderr.write(`${canonicalJson({ schemaVersion: 1, status: 'failed', code: 'ledger-invalid' })}\n`);
    process.exitCode = 1;
  }
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) await main();
