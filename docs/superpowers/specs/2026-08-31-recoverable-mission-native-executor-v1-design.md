# Recoverable mission native executor v1 design

## status

Approved by the standing Godskills/Godagents perfection goal. This is one
bounded provider-neutral runtime milestone. It does not select a provider,
resolve credentials, route a model, invoke Realm, or integrate Lunari.

## problem

The certified mission kernel durably prepares, commits, and recovers native,
review, and revision phases. Real provider-neutral executors now exist for both
Godskills review rounds and for the bounded revision. Native generation remains
an injected opaque executor in every full-loop proof.

That leaves the first external inference call weaker than the later calls. A
process can disappear after native transport completion but before the mission
journal records the result, and no certified adapter currently proves exact
dispatch reconstruction and terminal recovery without another inference.

## decision

Add one native materializer, one native transport contract, and one native
executor. The mission kernel will pass the full immutable admission alongside
its existing native mission and Godskills projection. The executor will reduce
that trusted local context to one bounded transport package and will accept a
completion only when every identity, byte, token, time, and authority binding
matches.

This is a content-generation boundary. It emits the existing strict native
artifact `{ schemaVersion, artifactType: "native", content }`. It does not emit
or authorize a Realm proposal.

## native package

The canonical package contains only:

- materializer identity and byte ceiling;
- the exact admitted mission;
- admission, request, and executor descriptor digests;
- native completion-token and artifact-byte ceilings;
- either `null` Godskills context or the exact already-admitted binding digest,
  package digest, and cortex package;
- an all-false authority projection;
- the package digest.

The materializer reads no files and resolves no credentials. It never loads a
Godskill. It may carry bodies already present in an admitted `method` or
`guardrail` cortex package because that is the pre-inference disclosure the
Godskills activation result authorized. Deferred `review` bodies must remain
absent. Native-only missions carry `godskills: null`.

## context and cross-binding

The kernel native context is exactly:

```text
admission + mission + godskillsBinding
```

The existing mission and Godskills projection remain for compatibility. The
new full admission lets the native executor verify the prepared phase request
against the exact admission rather than trusting copied fields.

The materializer requires:

1. native phase, round one;
2. exact descriptor and admitted completion ceiling;
3. exact mission equality with the admission;
4. native-only admission, null Godskills context, and no phase inputs; or
5. exact admitted receipt and cortex package plus one `godskills-package`
   request input equal to the admitted package digest.

A coherently rehashed copy with a detached mission, admission, Godskills
package, completion ceiling, or artifact ceiling must fail against the supplied
request and admission.

## transport protocol

The injected transport exposes `descriptor`, `reconcile`, and `execute`.

- terminal reconciliation is by exact dispatch digest;
- atomic deduplication by dispatch digest is mandatory;
- descriptor authority is empty;
- provider, model, endpoint, credential, retry, Realm, continuity, identity,
  evolution, Inspiration, personal-keel, and Soul fields are outside the wire
  contract;
- only exact `absent` reconciliation permits execution;
- `pending` returns a stable pending projection;
- `completed` recovers the existing completion;
- any other state fails closed.

The dispatch binds the request, executor, materializer, transport, complete
package, completion ceiling, and empty authority. The completion binds those
same identities, one strict native artifact, separated token usage, coherent
times, empty authority, and its own digest. Both artifact and complete
completion bytes are bounded.

Transport responses are cloned before verification so mutation after return
cannot alter trusted state.

## recovery proof

The deterministic certification fixture must use the actual native, deferred
Godskills review, and revision executors. It will:

1. admit a mission with one deferred review;
2. execute the native transport once;
3. interrupt after native transport completion and before mission-journal
   commitment;
4. discard the kernel and all three executors;
5. reconstruct them from the same pinned descriptors;
6. reproduce the exact native package and dispatch;
7. reconcile the completed native result without redispatch;
8. run first review, revision, and second review through their real executors;
9. accept the exact revision and close one terminal receipt;
10. replay terminal state with zero external calls.

A second fixture path proves native-only admission carries no Godskills context
or disclosure.

## acceptance requirements

1. Full native context reaches reconciliation and execution immutably.
2. Materialization verifies the complete admission, request, descriptor, and
   context before transport use.
3. Native-only and Godskills-bound package forms are deterministic and exact.
4. No deferred review body enters the native wire package.
5. Executor identity binds materializer and transport identities.
6. Every execution follows exact absent reconciliation.
7. Pending, completed, and ambiguous reconciliation cannot dispatch again.
8. Completion artifact, usage, time, byte, and authority fields fail closed.
9. Mutated transport responses cannot alter accepted state.
10. Component reconstruction reproduces the exact native dispatch.
11. A completed native call recovers after process reconstruction without
    redispatch.
12. The recovered native artifact enters the actual two-review revision loop.
13. Exact terminal replay performs zero external calls.
14. Schemas, append-only receipt ledger, and release lineage remain gates.

## proof limits

- no live model or provider qualification;
- no native-output or mission-quality claim;
- terminal lookup and atomic deduplication remain trusted transport promises;
- no hostile same-user transport isolation;
- no concrete OpenAI, Anthropic, Codex, Claude Code, local-model, or MCP adapter;
- no provider credential or model-routing implementation;
- no default vessel, local CLI, or Codex desktop integration;
- no Realm action, compensation, or rollback;
- no continuity admission or personal-keel write;
- no Lunari, Inspiration, or Soul activation;
- no independent review while the user requires inline-only work.
