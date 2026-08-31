# trusted adaptive activation adapter v1 design

## status

the two-gate architecture was approved by Dom on 2026-08-31. this document
defines the cross-repository trust boundary and decomposes it into two
independently certifiable implementation plans. it does not itself authorize
runtime enablement, Lunari integration, or a global activation default.

## decision

Godagents will stop compiling Godskills activation policy locally. Godskills
will own the executable activation compiler, policy, reviewed evidence, and
their complete executable trust root. Godagents will own mission
classification, identity, authority, effect ceilings, disclosure enforcement,
receipt admission, recovery, and host enablement.

the work is split into two subprojects:

1. **trusted adaptive activation adapter v1**: establish a complete Godskills
   executable receipt, verify it in Godagents, invoke it through a
   provider-neutral adapter, remove duplicated activation policy from
   Godagents, and preserve legacy operation when adaptive activation is not
   explicitly configured.
2. **specialist preference routing v1**: add a versioned preference-only field
   to the Godskills routing protocol after the activation adapter is certified.
   preferences may rank otherwise qualified candidates but can never remove
   eligibility, grant authority, weaken evidence requirements, or become
   prohibitions.

the first implementation plan covers subproject 1 only. subproject 2 receives
its own design confirmation and plan after the active Godskills capability-layer
ABI work reaches a stable, reviewed commit.

## evidence baseline

the design was derived from these exact states:

- Godagents `b2679a75c310d0363b6a4cd031f69dafbd064bba`, synchronized with
  `origin/main` when preparation began.
- Godagents design commit `46db9415054eebc98400505d3cc754b4e9b24037`,
  synchronized with `origin/main` after approval.
- Godskills design baseline `175f194640c807d7f9b78cfbdab3b1fba832bb21`,
  then pre-commit refresh `bc86dac31e6d8d428c5ff418ad40c4758d32e6c2`.
  both commits are docs-only and the refreshed head is two commits ahead of
  `origin/main` at `2c6a51733741ff06f44485331a14810cfb9fa1f1`.
- the active Godskills task now owns the committed plan at
  `docs/superpowers/plans/2026-08-30-capability-layer-abi-v1.md` and its future
  implementation. this design does not modify that file or claim its scope.
- Godagents had `332` passing tests and Godskills had `632` passing tests at
  the preceding gap-audit verification.
- after approval, the certified Godskills capability-layer canary was
  independently rebuilt, passed `643` of `643` tests, and was integrated and
  pushed at `2bf9fb929337d9a9c2f66adcb66536a63bf003c5`. it remains additive and
  changes no activation default.

the dependency-freeze gate must refresh both repositories before
implementation. no digest or source commit in this section is a permanent
future pin.

## problem

the current Godagents activation path in
`src/skills/activation-resolver.mjs` duplicates Godskills-owned values:

- trusted policy and evidence digests;
- method-evidence thresholds;
- disclosure modes;
- the current Muse evidence profile;
- policy decisions that choose `native`, `guardrail`, `method`, or `review`.

that duplication creates a two-repository policy fork. a Godskills policy or
evidence change can leave Godagents executing stale activation behavior while
both repositories still pass their own structural tests.

the present Godskills receipt also does not define a complete executable trust
root. `src/adaptive-activation.mjs` imports `src/io.mjs`, while
`receipts/adaptive-activation-v1.json` binds the activation compiler but not
that imported dependency. Godagents therefore cannot honestly claim to execute
the exact receipt-bound compiler until Godskills adds an additive executable
receipt that binds the complete local dependency closure.

specialist preferences are a separate protocol problem.
`compileCapabilityEligibility()` derives `preferredIds`, but the closed
Godskills v1 routing request accepts no preference field. translating
preferences into `forbiddenCapabilities` would create artificial quality loss
and is prohibited by this design.

## boundaries

```text
Godagent = persistent governed actor
Godskill = evidence-qualified capability
keel = continuity
Realm Contract = observable and actionable world boundary
```

Godskills may decide how much of a selected capability is justified by its
pinned policy and evidence. it may not grant authority, change identity, amend
a constitution, mutate a genome, own a keel, acquire credentials, enlarge a
context budget, or authorize a Realm effect.

Godagents may classify the mission and enforce the host envelope. it may not
copy Godskills thresholds, evidence profiles, method-eligibility logic, or
capability bodies into its own repository.

## scope

### subproject 1 in scope

- an additive Godskills executable activation receipt;
- a complete digest-bound executable dependency closure;
- a stable local activation CLI owned by Godskills;
- an optional activation trust-root block in the Godagents release pin;
- verification of the receipt, compiler, dependencies, policy, evidence, and
  CLI before invocation;
- a provider-neutral activation transport contract;
- closed validation of host classification and compiler output;
- authority, effect, precondition, risk, evidence, context, disclosure, and
  composition enforcement in Godagents;
- receipt-bound recovery without rerouting or reclassification;
- extraction of contract-derived guardrails from the duplicated resolver file;
- removal of Godskills policy, evidence, threshold, and profile copies from
  Godagents;
- explicit programmatic host wiring with legacy behavior preserved when the
  activation trust root is absent;
- exact-head fixture certification and independent review.

### subproject 2 in scope later

- a versioned Godskills routing request containing
  `preferredCapabilities`;
- preference-only ranking among already qualified routes;
- route receipts that record whether and how preferences affected a tie;
- Godagents forwarding `preferredIds` without converting them to exclusions;
- compatibility tests proving that non-preferred capabilities remain eligible;
- a separate protocol migration receipt.

### explicit non-goals

- executed post-native review;
- a resumable mission phase kernel;
- model selection or model routing;
- cross-model quality qualification;
- new Realm hands, effects, credentials, or rollback behavior;
- multi-agent delegation;
- a public SDK or MCP adapter;
- global Codex or Godagent activation defaults;
- automatic heuristic classification in a CLI;
- promotion of Muse or any other capability;
- rewriting historical receipts;
- copying Godskills capability bodies into Godagents;
- Lunari, Soul, Inspiration, sanctuary, billing, or governed evolution.

## ownership model

| concern | owner | forbidden transfer |
|---|---|---|
| mission identity and actor identity | Godagents | Godskills cannot create or mutate either identity |
| task and consequence classification | Godagents host | Godskills cannot infer new authority from classification |
| activation policy and reviewed evidence | Godskills | Godagents cannot reproduce or alter the policy |
| activation compilation | Godskills executable entrypoint | the host cannot forge a mode-bearing result |
| authority and effect intersection | Godagents | compiler output cannot widen the host envelope |
| capability layer disclosure | Godagents binder from verified Godskills artifacts | no cold quarry or unselected body may load |
| continuity and recovery | Godagents keel and journal | no classifier or compiler rerun may change a committed cycle |
| preference ranking | future Godskills routing protocol | preferences cannot become exclusions |

## selected architecture

### 1. Godskills executable activation receipt

Godskills adds, rather than rewrites, an
`adaptive-activation-executable-v1` receipt. the receipt binds:

- parent `adaptive-activation-v1` receipt path, file SHA-256, and logical
  receipt digest;
- `src/adaptive-activation.mjs`;
- every repository-local transitive import used by that compiler, initially
  `src/io.mjs`;
- `policies/adaptive-activation.v1.json`;
- `artifacts/adaptive-activation/evidence.v1.json`;
- `artifacts/adaptive-activation/neutral-contract.json`;
- the new `scripts/activation.mjs` local entrypoint;
- the activation protocol identifier;
- the exact request and result schemas;
- proof limits stating that the receipt certifies deterministic mechanism, not
  model quality, executed review, global activation, or hostile same-user
  filesystem isolation.

the receipt must enumerate the dependency closure explicitly. an unlisted
repository-local import fails certification. this prevents an apparently
pinned compiler from executing mutable helper code outside its trust root.

### 2. Godskills local activation entrypoint

`scripts/activation.mjs` accepts only explicit request, output, and executable
receipt file paths,
uses the same contained temporary-file conventions as `scripts/intent.mjs`,
loads the receipt-bound policy and evidence, invokes
`compileActivationDecision()` once per selected capability, and atomically
writes one canonical result.

the request shape is:

```js
{
  schemaVersion: 1,
  protocolId: "eternities-godskills-activation-v1",
  requestId,
  trustRootDigest,
  classification: {
    taskClass,
    consequenceClass,
    reviewAvailable
  },
  selected: [{
    selectedId,
    explicitMethodRequest
  }],
  authorityProjection
}
```

the result shape is:

```js
{
  schemaVersion: 1,
  protocolId: "eternities-godskills-activation-v1",
  requestId,
  requestDigest,
  trustRootDigest,
  policyDigest,
  evidenceDigest,
  classification,
  decisions,
  resultDigest
}
```

`decisions` contains the exact unmodified outputs of
`compileActivationDecision()`. no Godagents field rename or mode recomputation
occurs inside Godskills.

### 3. optional Godagents activation trust root

the Godagents Godskills release pin gains an optional `activation` object:

```js
{
  protocolId: "eternities-godskills-activation-v1",
  executableReceipt: { path, sha256, receiptDigest },
  parentReceipt: { path, sha256, receiptDigest },
  entrypoint: { path, sha256 },
  compiler: { path, sha256 },
  dependencies: [{ path, sha256 }],
  schemas: {
    request: { path, sha256 },
    result: { path, sha256 }
  },
  policy: { path, sha256, logicalDigest },
  evidence: { path, sha256, logicalDigest },
  contract: { path, sha256 }
}
```

all paths are repository-relative, forward-slash paths. every array is closed,
unique, and canonically ordered. the executable receipt must describe exactly
the same artifact set as the host pin. extra, missing, substituted, escaped,
or mismatched artifacts fail before any entrypoint executes.

the activation object is optional for compatibility. a release pin without it
uses the historical Godskills v3 mission-binding path. this milestone does not
silently change existing hosts or historical fixtures.

### 4. verified activation release projection

`verifyGodskillsRelease()` verifies the optional activation root with the same
containment and realpath checks used for the existing System v3 roots. when
present, it returns a frozen `activation` projection containing only verified
identities, digests, canonical policy and evidence values, the contained
entrypoint path, and `trustRootDigest`.

the executable receipt computes `receiptDigest` over its complete canonical
unsigned body, which already contains the protocol id, parent receipt identity,
and complete ordered artifact set. that `receiptDigest` is the
`trustRootDigest`; no second digest includes the executable receipt's own
identity. this avoids a circular digest definition while remaining independent
of repository location, so an exact copy of the certified release may move
without changing the trust root.

### 5. provider-neutral Godagents activation adapter

Godagents adds `src/skills/activation-adapter.mjs` with this public boundary:

```js
createGodskillsActivationAdapter({
  verifiedActivation,
  classifier,
  transport
}) -> {
  trustRootDigest,
  compile({ mission, selected, authority }),
  rehydrate({ binding, mission, selected, authority })
}
```

`classifier` is host-owned and receives a frozen projection containing only
the mission identity and text plus selected capability identities. it returns
exactly `taskClass`, `consequenceClass`, and `reviewAvailable`. mode-bearing or
authority-bearing classifier output is rejected before the transport runs.

`transport` owns only invocation of the already verified Godskills activation
entrypoint. its provider-neutral contract is canonical request in, canonical
result out. the local implementation uses a contained temporary directory and
a non-shell Node child process. neither request nor result contains credentials,
raw memory, keel records, Realm handles, or capability bodies.

the adapter validates:

- exact protocol, request, trust-root, policy, and evidence identities;
- exact selected capability order and cardinality;
- exact classification echo;
- exact authority projection equality;
- `authorityExpanded === false`;
- mode and disclosure coherence;
- explicit method requests refer only to selected capabilities;
- per-decision digest and aggregate result digest;
- no unknown fields;
- at most three decisions;
- no mode, policy, evidence, or authority mutation during recovery.

Godagents validates the result contract but does not reimplement the policy
that chose the mode.

`createGodskillsAdapter()` accepts `activationClassifier` and
`activationTransport`, verifies the release once, and constructs this adapter
internally from the verified activation projection. the direct constructor
remains available for focused tests and alternate programmatic hosts. callers
never supply an unverified activation projection to the mission binder.

### 6. mission binder integration

`createGodskillsAdapter()` receives optional host classification and activation
transport dependencies, not the current policy-bearing resolver. after the
host and genome envelopes are known and the router returns selected
capabilities:

1. Godagents resolves selected capabilities against the certified portable
   manifest.
2. the activation adapter classifies and compiles the selected set.
3. Godagents validates the compiler result against the host envelope.
4. only the mode-permitted capability layer is read.
5. the cortex package and cycle receipt bind the exact activation result.

contract-derived guardrails move to
`src/skills/contract-guardrails.mjs`. that module may transform only the
already verified capability contract. it contains no activation thresholds,
profiles, evidence, or mode-selection logic.

the existing `src/skills/activation-resolver.mjs` is removed after every caller
and test migrates. a source scan becomes a certification gate that rejects
copies of the old policy digest, evidence digest, threshold values, or Muse
profile in Godagents runtime code.

### 7. receipt versioning and recovery

historical cycle receipts remain valid and immutable. adaptive bindings emitted
through the new external compiler use a versioned activation-binding shape that
contains:

- protocol and trust-root digests;
- request digest;
- closed classification;
- exact unmodified compiler decisions;
- aggregate result digest;
- source envelope, selected artifact, authority ceiling, stack, and cortex
  package digests already required by the mission binder.

recovery performs no routing and no classification. it verifies the persisted
binding against the currently pinned exact trust root, mission, selected
artifacts, explicit requests, and authority. it then rebuilds only the allowed
disclosure package and compares stack and package digests. a changed trust root
requires an explicit operational migration before recovery. unsupported or
incompatible activation protocol changes fail closed.

when routing returns no qualified selection, the adapter records the configured
trust-root digest in the source envelope but emits no activation binding and
does not invoke classification or transport. recovery proves the same empty
selection and trust root without manufacturing an empty compiler result.

### 8. host enablement

programmatic local and admitted host constructors accept explicit
`activationClassifier` and `activationTransport` dependencies. adaptive
activation is enabled only when the release pin contains the verified
activation root and the host supplies both dependencies. a partial combination
is a configuration error.

the command-line host does not invent task classification heuristics in this
milestone. existing policies without an activation root preserve historical
behavior. there is no global Codex setting, environment-variable switch, or
implicit auto-enable path.

## data flow

```text
mission and host envelope
  -> Godskills v3 route under Godagents ceilings
  -> selected ids and certified entrypoints
  -> host classifier returns task and consequence only
  -> verified Godskills activation entrypoint compiles exact decisions
  -> Godagents validates trust root, identity, disclosure, and authority
  -> binder reads no body, contract only, or method plus contract
  -> cortex package and activation binding are journaled
  -> recovery validates the committed binding without rerouting or reclassifying
```

## failure behavior

- missing activation root plus no classifier or activation transport: preserve
  the historical adapter path.
- activation root without both classifier and activation transport: fail
  configuration before mission routing.
- classifier or activation transport without an activation root: fail
  configuration before mission routing.
- unsupported protocol: fail before reading selected capability artifacts.
- stale, missing, extra, escaped, or mismatched executable artifact: fail before
  spawning the entrypoint.
- malformed or mode-bearing classifier output: fail before activation
  transport.
- compiler process error, timeout, missing output, or oversized output: fail the
  binding and record no completed activation.
- request, trust-root, policy, evidence, classification, authority, decision,
  or result mismatch: reject the result and read no selected capability body.
- unresolved or empty route: do not classify or invoke activation.
- recovery under another trust root: require an explicit compatible migration
  or fail closed.

## security and privacy

- child processes use `shell: false` and hidden windows.
- child processes receive only the minimum nonsecret operating-system
  environment required to start Node, never the host's complete environment.
- request and output files live under a verified operating-system temporary
  root and are removed in `finally`.
- repository paths are verified through realpath containment before execution.
- activation output cannot add authority, effects, preconditions, risk,
  evidence leniency, context, or composition capacity.
- credentials remain inside the cortex credential resolver and never enter the
  activation request, result, journal, or receipt.
- raw memory, full keel state, and Realm handles are excluded.
- the milestone does not claim protection from a hostile same-user process that
  can mutate files between verification and execution. that remains an explicit
  local reference-runtime proof limit.

## testing and certification

### Godskills gate

- red-green tests for complete dependency-closure discovery and rejection;
- deterministic double build of the executable receipt;
- request and result schema mutation tests;
- contained-path and temporary-file tests;
- direct comparison between CLI decisions and
  `compileActivationDecision()` outputs;
- rejection of omitted `src/io.mjs`, substituted policy/evidence, stale parent
  receipt, unsupported protocol, duplicate selected ids, and output tampering;
- unchanged full Godskills suite.

### Godagents gate

- release-pin schema tests for absent, valid, incomplete, duplicate, and escaped
  activation roots;
- verifier tests for every artifact and logical digest;
- adapter tests for all four modes and every identity or authority mismatch;
- read-spy tests proving native and review read no body, guardrail reads only the
  contract, and method reads the exact selected entrypoint and contract;
- no-route tests proving classifier and activation transport are not called;
- recovery tests proving no reroute or reclassification and exact package
  reproduction;
- host configuration tests for both-missing compatibility and one-sided
  configuration failure;
- source scan proving no activation policy, evidence profile, or threshold copy
  remains in Godagents runtime source;
- unchanged historical fixture builds and eight receipts;
- unchanged full Godagents suite;
- exact-head integration receipt with explicit fixture and live-quality proof
  limits;
- independent review of trust ownership, authority monotonicity, recovery,
  disclosure, and cross-repository drift.

## migration and rollback

the migration is additive until the final cleanup commit:

1. certify the Godskills executable trust root without changing default
   activation.
2. add optional verification and transport support in Godagents.
3. run the new adapter only in focused fixtures with an explicit classifier.
4. migrate adaptive tests from the internal resolver to the external compiler.
5. remove duplicated policy code only after parity and mutation gates pass.
6. issue the exact-head receipt.

rollback removes the optional activation pin and classifier from a host policy,
returning that host to the historical v3 mission-binding path. historical
receipts and legacy fixtures are not rewritten. a failed Godskills executable
receipt does not affect ordinary unbound Godagent operation.

## specialist preference follow-up

subproject 2 cannot be emulated inside Godagents. its future Godskills protocol
extension must satisfy all of these invariants:

- `preferredCapabilities` is optional, unique, selected from otherwise eligible
  manifest ids, and bounded by the complete catalog.
- preferences affect only deterministic ranking or tie resolution after every
  ordinary qualification gate.
- a non-preferred candidate remains eligible and may win on stronger mission
  coverage, evidence, risk, context, or composition quality.
- the route receipt records supplied preferences and whether they affected the
  result.
- unknown or prohibited preferred ids fail closed.
- old v1 requests retain identical outputs.
- Godagents forwards `preferredIds` exactly and never maps them to
  `forbiddenCapabilities`.

## rejected approaches

### wait for the entire Godskills evolution arc

this would eventually offer a cleaner package and protocol surface, but it
would block Godagents on several later Godskills phases that the trust repair
does not require.

### modify both repositories simultaneously without independent gates

this would collide with the active capability-layer work and make compiler,
adapter, preference, and quality failures difficult to attribute or reverse.

### retain the Godagents policy copy and compare outputs

dual compilation would preserve the drift source and incorrectly make
Godagents a second activation-policy authority.

### translate preferences into prohibitions

this would make specialization an artificial capability loss and violate the
approved all-rounder and specialist model.

## completion boundary

subproject 1 is complete only when Godagents executes no local copy of
Godskills activation policy, the complete Godskills executable path is
receipt-bound, every activation decision is tied to the exact mission and host
envelope, historical operation remains available, both full suites pass, and
an independent reviewer finds no unresolved critical trust or authority defect.

that completion does not prove executed review, model-quality improvement,
provider neutrality beyond the adapter contract, specialist preference
routing, product usability, or Lunari readiness.
