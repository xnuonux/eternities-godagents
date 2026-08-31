# trusted adaptive activation adapter v1 implementation plan

> **status:** approved for autonomous execution from the committed architecture.
> preserve this checklist as the execution record and record final exact heads in
> the certification receipt rather than rewriting historical evidence.

**goal:** replace Godagents' local copy of Godskills activation policy with one
receipt-bound, provider-neutral Godskills executable while preserving host
authority, exact recovery, legacy unbound behavior, and the zero-to-three
capability disclosure ceiling.

**architecture:** implementation crosses two repositories but uses sequential
merge gates. Godskills first publishes a complete executable activation trust
root. Godagents then pins that exact pushed release, validates all compiler
output without recomputing policy, and binds only the permitted mission package
before cortex inference. every historical receipt remains immutable.

**tech stack:** Node.js 24 ESM, `node:test`, JSON Schema 2020-12, canonical JSON,
SHA-256, non-shell child processes, existing Godskills and Godagents receipt
machinery.

**specification:**
`docs/superpowers/specs/2026-08-31-trusted-adaptive-activation-adapter-design.md`

**starting heads:**

- Godagents: `e39fcb16e2c4a008f0d39f493106f2cfa2f659c8`
- Godskills: `2bf9fb929337d9a9c2f66adcb66536a63bf003c5`
- Godskills capability-layer ABI v1: merged and pushed, 643 of 643 tests

the execution preflight must refresh these heads. if either main branch moves,
reconcile it before creating or continuing a feature worktree and record the
new exact base in the final receipt.

## global invariants

- Godagent is the persistent governed actor.
- Godskill is an evidence-qualified capability.
- keel is continuity.
- Realm Contract is the observable and actionable world boundary.
- Godskills owns activation policy, reviewed evidence, compiler behavior, and
  executable artifacts.
- Godagents owns classification, identity, authority, effect ceilings,
  disclosure, host enablement, receipts, and recovery.
- activation executes after the mission and host envelope are known and after
  routing selects exact capability identities, but before any selected method
  reaches cortex inference.
- Godskills never grants authority, effects, credentials, budget, identity,
  constitution, evolution, Realm hands, or keel ownership.
- no cold quarry, third-party body, unselected body, or complete catalog body
  enters an activation request, result, journal, or cortex package.
- a selected stack contains at most three capabilities.
- a release without an activation root and a host without activation
  dependencies preserves the historical System v3 path byte-for-byte.
- a partial activation configuration fails before routing or body reads.
- no route means no classification, no activation process, and no synthetic
  empty activation result.
- recovery performs no routing, classification, or activation compilation.
- executable receipt digest is the logical, location-independent
  `trustRootDigest`; do not define a digest over itself.
- generated build evidence may report `verified-build`, but may not certify its
  own independent review or model quality.
- do not implement specialist preference routing, executed deferred review,
  model routing, public SDKs, Lunari integration, Soul, or Inspiration here.

## proof model

the milestone must distinguish four forms of proof:

1. unit behavior: closed schemas, deterministic digests, mode disclosure, and
   authority monotonicity.
2. executable identity: every repository-local runtime dependency and declared
   data artifact is byte-bound by the Godskills receipt.
3. integration identity: Godagents pins the exact Godskills receipt and artifact
   set, then reproduces a cycle package and recovery package byte-for-byte.
4. release disposition: fresh full suites, historical ledger verification,
   exact-head integration receipt, and independent review with no unresolved
   critical or important defect.

passing structural tests does not prove model quality, completed review,
arbitrary-host equivalence, or Lunari readiness.

## repository and branch order

1. fetch and reconcile both mains.
2. create `feat/adaptive-activation-executable-v1` from Godskills main.
   do not modify or remove the separate clean `feat/adaptive-evidence-v2`
   worktree or its branch.
3. complete tasks 1 through 3, independently review, merge, rerun the Godskills
   suite on main, and push.
4. refresh Godagents main and create
   `feat/trusted-adaptive-activation-adapter-v1`.
5. complete tasks 4 through 8 against the exact pushed Godskills head.
6. independently review, merge, rerun every integrated gate on Godagents main,
   push, then remove only clean integrated worktrees and branches.

## file map

### Godskills

- create `schemas/adaptive-activation-request.v1.schema.json`
- create `schemas/adaptive-activation-result.v1.schema.json`
- create `src/adaptive-activation-protocol.mjs`
- create `src/static-module-closure.mjs`
- create `scripts/activation.mjs`
- create `scripts/build-adaptive-activation-executable-receipt.mjs`
- create `tests/adaptive-activation-protocol.test.mjs`
- create `tests/adaptive-activation-transport.test.mjs`
- create `tests/adaptive-activation-executable-receipt.test.mjs`
- create `receipts/adaptive-activation-executable-v1.json`
- create `docs/adaptive-activation-executable-v1-certification.md`
- modify `package.json`

### Godagents

- modify `schemas/godskills-release-pin.schema.json`
- modify `schemas/host-policy.schema.json`
- modify `schemas/godskills-cycle-receipt.schema.json`
- modify `src/skills/release-verifier.mjs`
- create `src/skills/activation-adapter.mjs`
- create `src/skills/contract-guardrails.mjs`
- modify `src/skills/mission-binder.mjs`
- delete `src/skills/activation-resolver.mjs` after all callers migrate
- modify `src/host/local-cli.mjs`
- modify `src/host/admitted-launch.mjs`
- modify `tests/godskills-release-verifier.test.mjs`
- create `tests/godskills-activation-adapter.test.mjs`
- modify `tests/godskills-adaptive-activation.test.mjs`
- modify `tests/godskills-mission-binder.test.mjs`
- modify `tests/host-policy.test.mjs`
- modify `tests/local-cli.test.mjs`
- modify `tests/admitted-launch.test.mjs`
- modify `tests/networked-secret-containment.test.mjs`
- create `tests/godskills-adaptive-integration.test.mjs`
- create `scripts/build-godskills-adaptive-integration-receipt.mjs`
- create `receipts/godskills-adaptive-activation-v1.json`
- modify `src/certification/verify-ledger.mjs`
- modify `tests/certification-ledger.test.mjs`
- modify `src/certification/verify-release-lineage.mjs` only if its closed
  release sequence requires the new certification identity
- modify `tests/release-lineage.test.mjs` only with the matching lineage change
- modify `package.json`
- update `README.md` and `docs/architecture.md` only for verified public behavior

## task 1: define the closed Godskills activation protocol

**files:**

- create `schemas/adaptive-activation-request.v1.schema.json`
- create `schemas/adaptive-activation-result.v1.schema.json`
- create `src/adaptive-activation-protocol.mjs`
- create `tests/adaptive-activation-protocol.test.mjs`

**public interfaces:**

```js
validateActivationRequest(value) -> frozen request
buildActivationResult({ request, decisions, policyDigest, evidenceDigest })
validateActivationResult(value) -> frozen result
```

the request contains exactly schema version, protocol id, request id,
trust-root digest, closed classification, one to three unique selected rows,
and the authority projection. each selected row contains only `selectedId` and
`explicitMethodRequest`.

the result contains exactly schema version, protocol id, request id, request
digest, trust-root digest, policy digest, evidence digest, echoed
classification, exact compiler decisions in selected order, and result digest.
compiler decisions retain `selectedId`; Godagents may not rename it to `id`.

- [ ] write request and result mutation tests first.

cover unknown or missing fields, unsupported versions, malformed digests,
duplicate selected ids, zero or four selections, invalid task or consequence
classes, non-boolean flags, unordered or duplicate authority arrays, authority
projection shape drift, selected or decision order drift, classifier echo drift,
policy or evidence drift, decision digest drift, result digest drift, and any
`authorityExpanded` value other than false.

- [ ] run the red test.

run:
`node --test tests/adaptive-activation-protocol.test.mjs`

expected: fail only because the protocol module and schemas do not exist.

- [ ] implement the minimal closed schemas and protocol module.

use the existing stable digest semantics. do not move mode selection into this
module. validation may validate a compiler decision but may not choose or
repair its mode.

- [ ] run focused tests and commit.

run:
`node --test tests/adaptive-activation-protocol.test.mjs tests/adaptive-activation.test.mjs`

commit message:
`feat: define adaptive activation protocol`

## task 2: define executable receipt identity and dependency closure

**files:**

- create `src/static-module-closure.mjs`
- create `scripts/build-adaptive-activation-executable-receipt.mjs`
- create `tests/adaptive-activation-executable-receipt.test.mjs`

**public interfaces:**

```js
discoverLocalModuleClosure({ repositoryRoot, roots, io? }) -> artifact rows
buildAdaptiveActivationExecutableReceipt({ repositoryRoot, entrypointPath, io? }) -> receipt
```

the builder must establish the executable receipt format before the real CLI
depends on it. focused tests use a temporary fixture module graph and a fixture
entrypoint, so they can prove receipt and closure behavior without pretending
the production `scripts/activation.mjs` already exists.

**receipt requirements:**

- identity `adaptive-activation-executable-v1`
- status `verified-build`
- protocol `eternities-godskills-activation-v1`
- exact parent path, file digest, and logical digest for
  `receipts/adaptive-activation-v1.json`
- exact bytes, file digests, and roles for the entrypoint, compiler, all
  repository-local transitive runtime dependencies, both schemas, policy,
  evidence, and neutral contract
- canonically ordered artifact rows without duplicates
- `receiptDigest` over the complete unsigned body
- proof limits that reject model-quality, executed-review, global-activation,
  arbitrary-host, and hostile-same-user-filesystem claims

the static module scanner is a build-time guard. it must discover static local
imports and re-exports from supplied roots, reject unresolved local specifiers,
reject unsupported dynamic local loading, and prove that the declared
dependency set is exactly complete. it is not part of runtime policy.

- [ ] write dependency-closure and deterministic receipt tests first.

use temporary fixture roots to prove nested imports, shared dependencies,
canonical ordering, duplicate roots, missing, extra, escaped, symlinked,
unresolved, and dynamic local imports. mutate parent, compiler, schemas, policy,
evidence, and contract declarations. include a test proving repository
relocation does not change `receiptDigest`.

- [ ] run the red test.

run:
`node --test tests/adaptive-activation-executable-receipt.test.mjs`

expected: fail only because the scanner and receipt builder do not exist.

- [ ] implement the scanner and injectable receipt builder.

the exported builder may receive a fixture entrypoint during tests. its command
line main path remains deferred until task 3 creates the production entrypoint.
do not generate or check in a production receipt in this task.

- [ ] run focused tests and commit.

run:
`node --test tests/adaptive-activation-executable-receipt.test.mjs tests/adaptive-activation-protocol.test.mjs tests/adaptive-activation.test.mjs`

commit message:
`feat: define activation executable trust roots`

## task 3: execute activation and generate the complete trust root

**files:**

- create `scripts/activation.mjs`
- create `tests/adaptive-activation-transport.test.mjs`
- modify `tests/adaptive-activation-executable-receipt.test.mjs`
- create `receipts/adaptive-activation-executable-v1.json`
- create `docs/adaptive-activation-executable-v1-certification.md`
- modify `package.json`

**entrypoint:**

```text
node scripts/activation.mjs \
  --request <absolute-json-path> \
  --output <absolute-json-path> \
  --receipt <absolute-json-path>
```

the entrypoint must:

1. reject unknown, duplicated, missing, empty, or newline-bearing arguments.
2. read and validate the executable receipt supplied by the host.
3. require request `trustRootDigest` to equal that receipt's logical digest.
4. verify the exact policy and evidence bytes named by the receipt before use.
5. call `compileActivationDecision()` once for every selected row, in order.
6. pass the full unchanged authority projection into every compiler task.
7. build one closed result through the protocol module.
8. atomically write canonical JSON only after every decision validates.

- [ ] write file-in and file-out subprocess tests first.

the test uses the task-2 builder to create a valid candidate receipt over the
production entrypoint bytes. before implementation it must fail because the
entrypoint is missing, not because the receipt format is unavailable.

cover all four activation modes, two selected capabilities in stable order,
explicit method request, stale trust root, stale receipt digest, substituted
policy, substituted evidence, malformed request, output non-creation on failure,
and byte-identical repeated output.

- [ ] run the red test.

run:
`node --test tests/adaptive-activation-transport.test.mjs`

- [ ] implement the narrow CLI without host inference or environment switches.

the CLI must not classify tasks, route skills, read a complete catalog, inspect
credentials, or infer authority. it receives only the already selected rows and
host classification.

- [ ] extend receipt tests to the real production dependency graph.

the exact closure must include `scripts/activation.mjs`,
`src/adaptive-activation.mjs`, `src/adaptive-activation-protocol.mjs`, and
`src/io.mjs`, plus every newly discovered local dependency. omission or an
undeclared extra must fail.

- [ ] generate the production receipt twice.

run twice:
`npm run build:adaptive-activation-executable`

expected: both runs emit the same receipt digest and leave the tree unchanged
after the first generated receipt is staged.

- [ ] run the complete Godskills gate.

run:

```text
node --test tests/adaptive-activation.test.mjs tests/adaptive-activation-protocol.test.mjs tests/adaptive-activation-transport.test.mjs tests/adaptive-activation-executable-receipt.test.mjs
npm test
git diff --check
```

- [ ] request an independent review of protocol closure, digest logic, path
  containment, receipt completeness, process behavior, and proof limits.

repair every confirmed critical or important finding test-first. record the
reviewed commit and exact passing counts in the certification document. the
document may certify structural executable integrity but must retain the
receipt's `verified-build` status and explicit quality limits.

- [ ] commit certification, merge the fully verified branch into Godskills
  main, rerun the builder and full suite on main, push, and verify clean parity.

suggested commit messages:

```text
feat: expose receipt bound activation entrypoint
test: bind adaptive activation executable closure
docs: certify adaptive activation executable
```

do not begin Godagents pinning until `git rev-parse main` exactly equals
`git rev-parse origin/main` for this merged Godskills release.

## task 4: verify the optional activation root in Godagents

**files:**

- modify `schemas/godskills-release-pin.schema.json`
- modify `schemas/host-policy.schema.json`
- modify `src/skills/release-verifier.mjs`
- modify `tests/godskills-release-verifier.test.mjs`
- modify `tests/host-policy.test.mjs`

the optional activation pin contains executable receipt, parent receipt,
entrypoint, compiler, canonically ordered dependency rows, request and result
schemas, policy with logical digest, evidence with logical digest, and contract.
every path is repository-relative and every file has an exact SHA-256.

- [ ] add failing schema and verifier tests first.

cover absent activation compatibility, a complete valid root, incomplete root,
unknown fields, duplicate or unordered dependencies, extra or missing receipt
artifact, substituted entrypoint, compiler, dependency, schema, policy,
evidence, contract, or parent, logical digest mismatch, lexical escape,
post-realpath escape, unsupported protocol, wrong receipt status, and artifact
cache isolation.

the only accepted executable receipt status in this milestone is
`verified-build`. host pinning establishes operational trust; neither the
generated receipt nor its status claims model quality or independent review.

- [ ] run the red tests.

run:
`node --test tests/godskills-release-verifier.test.mjs tests/host-policy.test.mjs`

- [ ] implement one-pass verification.

extend the existing contained artifact reader. parse and validate the
executable receipt, recompute its canonical digest, require the pin and receipt
artifact sets to match exactly, and return one frozen `activation` projection.
set `trustRootDigest` directly to the verified executable `receiptDigest`.

- [ ] run focused tests and commit.

commit message:
`feat: verify godskills activation roots`

## task 5: implement the provider-neutral activation adapter

**files:**

- create `src/skills/activation-adapter.mjs`
- create `tests/godskills-activation-adapter.test.mjs`

**public interfaces:**

```js
createGodskillsActivationAdapter({
  verifiedActivation,
  classifier,
  transport
}) -> { trustRootDigest, compile, rehydrate }

createLocalGodskillsActivationTransport({
  verifiedActivation,
  timeoutMs?,
  maximumResultBytes?
}) -> async request => result
```

- [ ] write adapter tests first.

cover classifier input freezing and field minimization, exact classifier output,
request identity, selected order, explicit request subset, classification echo,
trust-root, policy, evidence, authority, decision and aggregate digest checks,
unknown fields, overflow, mode and disclosure coherence, process nonzero exit,
timeout, missing output, oversized output, invalid JSON, cleanup after success or
failure, and non-shell hidden process invocation.

the local child receives a minimal allowlist of nonsecret operating-system
variables required to start Node. it must not inherit the host's credential,
model-provider, Node-options, or arbitrary process environment.

prove `rehydrate()` invokes neither classifier nor transport and rejects changed
mission, selected artifacts, explicit requests, authority, trust root, or stored
decision bytes.

- [ ] run the red test.

run:
`node --test tests/godskills-activation-adapter.test.mjs`

- [ ] implement validation without policy duplication.

Godagents may validate allowed enums and structural coherence. it may not carry
method thresholds, evidence profiles, trusted policy constants, capability
profiles, or code that chooses activation mode.

- [ ] run focused tests and commit.

commit message:
`feat: adapt trusted godskills activation`

## task 6: replace the internal resolver in mission binding

**files:**

- create `src/skills/contract-guardrails.mjs`
- modify `src/skills/mission-binder.mjs`
- modify `schemas/godskills-cycle-receipt.schema.json`
- modify `tests/godskills-adaptive-activation.test.mjs`
- modify `tests/godskills-mission-binder.test.mjs`
- delete `src/skills/activation-resolver.mjs`

- [ ] migrate contract guardrail tests first.

prove guardrails derive only from the already verified selected contract and
cannot carry activation policy, method prose, evidence profiles, or manifest
termination prose.

- [ ] add failing binder and receipt tests for the external adapter.

cover this order:

```text
mission and host envelope
  -> route
  -> exact selected artifacts
  -> classify
  -> external compile
  -> authority and disclosure validation
  -> selected package read
  -> cortex package
```

prove native and review read no selected body, guardrail reads only the
contract, method reads only the selected entrypoint and contract, no route calls
neither classifier nor activation transport, and unresolved routing returns
before activation.

the source envelope must bind the activation trust root and explicit method
requests whenever adaptive activation is configured. a selected adaptive cycle
must contain the complete versioned activation binding. a no-route adaptive
cycle must contain no activation binding but must retain the trust root in its
source envelope.

- [ ] add recovery tests before changing recovery code.

prove recovery performs no route, classify, or compile call and reproduces the
exact stack and cortex package digests. changed trust root, selection, mission,
authority, explicit method request, activation bytes, disclosure bytes, stack,
or package must fail closed.

- [ ] implement binder integration and remove the resolver.

`createGodskillsAdapter()` accepts `activationClassifier` and
`activationTransport`. it verifies the release once and constructs the
activation adapter internally. these are the only valid configuration states:

- no activation root, no classifier, no activation transport: legacy path
- activation root, classifier, activation transport: adaptive path

every partial state fails before routing.

- [ ] add a source-scan regression gate.

the gate must reject the old policy digest, old evidence digest, threshold
values, Muse profile, or local mode-selection branches anywhere in Godagents
runtime source. allow enum validation and contract-derived disclosure checks.

- [ ] run focused binder tests and commit.

run:

```text
node --test tests/godskills-adaptive-activation.test.mjs tests/godskills-activation-adapter.test.mjs tests/godskills-mission-binder.test.mjs tests/godskills-runtime-order.test.mjs
```

commit message:
`refactor: externalize godskills activation policy`

## task 7: wire explicit programmatic hosts without a global default

**files:**

- modify `src/host/local-cli.mjs`
- modify `src/host/admitted-launch.mjs`
- modify `tests/local-cli.test.mjs`
- modify `tests/admitted-launch.test.mjs`
- modify `tests/networked-secret-containment.test.mjs`

- [ ] write host configuration tests first.

prove `executeNetworkedVessel()` and `launchAdmittedLocalAgent()` can receive an
explicit classifier and activation transport through their programmatic
boundary. prove old policies without activation remain unchanged. prove a pin
with activation but no dependencies, dependencies without a pin, or only one
dependency fails before route or inference.

the command-line entrypoint must not invent heuristics, read an environment
activation switch, or silently enable the feature. programmatic tests may inject
a deterministic classifier.

- [ ] extend secret-containment tests.

place canaries in credentials, keel state, raw memory, Realm handles, and
unselected skill bodies. prove activation request, result, journal, cortex
request, stderr, and certification receipt contain none of them.

- [ ] run host and security tests and commit.

run:

```text
node --test tests/host-policy.test.mjs tests/local-cli.test.mjs tests/admitted-launch.test.mjs tests/networked-secret-containment.test.mjs tests/godskills-runtime-order.test.mjs
```

commit message:
`feat: wire explicit adaptive activation hosts`

## task 8: certify exact cross-repository integration

**files:**

- create `tests/godskills-adaptive-integration.test.mjs`
- create `scripts/build-godskills-adaptive-integration-receipt.mjs`
- create `receipts/godskills-adaptive-activation-v1.json`
- modify `src/certification/verify-ledger.mjs`
- modify `tests/certification-ledger.test.mjs`
- conditionally modify release-lineage verifier and test if required
- modify `package.json`
- update `README.md` and `docs/architecture.md`

the new certification receipt must bind:

- exact Godagents implementation commit, specification, plan, implementation
  manifest, and test manifest
- exact pushed Godskills commit
- exact executable receipt file digest and logical trust-root digest
- exact parent, entrypoint, compiler, dependency, schema, policy, evidence, and
  contract digests
- exact test counts from fresh Godskills focused and full suites
- exact test counts from fresh Godagents focused and full suites
- unchanged historical receipt file digests
- zero authority expansion, zero cold quarry reads, zero unselected body reads,
  zero recovery recompilations, and preserved legacy behavior
- explicit proof limits

- [ ] write receipt rejection and byte-rebuild tests first.

failed tests, missing requirements, stale source commits, changed artifact sets,
nonzero boundary violations, or historical receipt drift must prevent
certification.

- [ ] run all focused tests.

run:

```text
node --test tests/godskills-release-verifier.test.mjs tests/godskills-activation-adapter.test.mjs tests/godskills-adaptive-activation.test.mjs tests/godskills-mission-binder.test.mjs tests/godskills-runtime-order.test.mjs tests/host-policy.test.mjs tests/local-cli.test.mjs tests/admitted-launch.test.mjs tests/networked-secret-containment.test.mjs tests/godskills-adaptive-integration.test.mjs tests/certification-ledger.test.mjs tests/release-lineage.test.mjs
```

- [ ] run both complete suites and deterministic rebuilds.

Godskills:

```text
npm run build:adaptive-activation-executable
npm test
git status --short
```

Godagents:

```text
npm run build:godskills-adaptive-integration
npm test
npm run verify:certifications
npm run verify:release-lineage
git diff --check
```

- [ ] request independent review.

review trust ownership, executable closure, authority monotonicity, disclosure,
classification minimization, recovery, secret containment, compatibility,
receipt truthfulness, and cross-repository drift. repair every confirmed
critical or important finding test-first and rerun the exact affected and full
gates.

- [ ] commit the reviewed certification.

suggested commits:

```text
test: certify trusted adaptive activation
docs: document adaptive activation boundary
```

## final integration gate

1. fetch both origins and prove each target main is an ancestor of its feature
   branch or reconcile normally without force.
2. merge every fully verified branch into its main without rewriting history.
3. rerun each repository's deterministic builders and complete suite on the
   merged result.
4. rebuild the Godagents certification receipt only if the exact implementation
   commit it binds remains unchanged. otherwise regenerate against the new
   exact commit and rerun its byte-rebuild test.
5. verify the certification ledger and release lineage.
6. push both mains.
7. fetch again and prove local main equals `origin/main` in both repositories.
8. remove only clean integrated worktrees and delete only their merged local
   feature branches.
9. record final exact heads, test counts, receipt digest, review disposition,
   proof limits, and any deferred noncritical finding.

## completion conditions

this milestone is complete only when all of these are true:

- Godagents contains no local Godskills activation policy or evidence profile.
- the exact Godskills executable and every local runtime dependency are
  receipt-bound.
- adaptive mode cannot run under a partial configuration.
- every selected activation is tied to mission, classification, authority,
  exact selected artifacts, explicit requests, and trust root.
- native, guardrail, method, and review disclosure boundaries are proven with
  real read spies.
- recovery performs no routing, classification, or activation compilation.
- old release pins retain the historical System v3 behavior.
- both complete suites pass on merged mains.
- the new certification receipt joins the verified historical ledger without
  rewriting older receipts.
- independent review has no unresolved critical or important defect.
- both mains are pushed, clean, and exactly equal to origin.

completion does not prove executed review, model-quality improvement,
specialist preference routing, arbitrary-provider field equivalence, public SDK
readiness, or Lunari readiness.
