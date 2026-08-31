# Godskills typed-composition consumer v1 design

## decision

add one optional, separately pinned Godagents adapter for the exact Godskills
typed-composition v1 release at commit
`7c1a183d55616310ac96255dd996536c53c8b577`.

the adapter is not added to any default launch path. it does not replace the
existing router, adaptive-activation adapter, recoverable admission path,
mission vessel, OpenAI-compatible transports, or signed phase-resolution
boundary.

## purpose

Godskills can now prove that several selected capabilities form one exact,
typed, phase-owned graph rather than a list of compatible prompts. Godagents
needs a host boundary that can consume that graph without silently refreshing
the Godskills release, copying method bodies, or treating composition as new
authority.

v1 proves the narrow bridge:

1. verify one exact pushed Godskills release receipt and every file it binds;
2. import only the exact verified typed-composition module closure;
3. reconstruct the private-provenance registry from its pinned policy and
   parent receipts;
4. seal and compile an explicit host plan against an explicit activation
   result;
5. execute the compiled graph only through host-supplied capability functions;
6. preserve the Godskills method and execution digests without adding effects.

## static pin

one closed sidecar pins:

- source commit;
- repository root supplied by the operator;
- release receipt path, exact bytes, file SHA-256, and logical digest;
- typed-composition module path and SHA-256;
- policy path and SHA-256;
- both parent trust-root digests;
- registry, positive plan, method, and execution digests.

the pin can change only through a deliberate migration. the verifier does not
discover a newer sibling release and does not rewrite the sidecar.

## release verification

the verifier resolves the repository root and every referenced file through
real paths. paths must be repository-relative, canonical, regular files, and
remain beneath the exact root. it verifies:

- canonical release-receipt bytes and Godskills' canonical digest algorithm;
- exact receipt identity and `verified-build` status;
- exact source closure with no duplicate or conflicting descriptor;
- every declared design, policy, schema, and test artifact;
- every generated registry, activation, graph, method, execution, budget,
  compatibility, vocabulary, and rejection artifact;
- exact parent roots and positive-canary digests;
- zero embedded method bodies, zero transported source bodies, and no
  authority expansion;
- canonical and internally digest-valid plan, method, and execution artifacts.

successful verification returns a frozen public descriptor backed by
module-private provenance. a caller-created lookalike cannot authorize import
or adapter construction.

## import and registry boundary

only after verification may the adapter import the pinned
`src/typed-composition.mjs`. all local dependencies in its release closure have
already been checked byte-for-byte. the adapter requires the exact public
exports and asks the imported module to reconstruct its own trusted registry
from:

- the verified Godskills repository root;
- the exact policy path;
- the policy file SHA-256 from the release receipt.

registry construction performs the deeper capability-layer and activation
parent checks. method and reviewer bodies remain undisclosed.

## adapter API

the frozen adapter exposes only:

- a body-free descriptor;
- `compile`, which seals one explicit unsigned plan and compiles it with one
  explicit activation result;
- `execute`, which runs one adapter-compiled method with exact mission inputs
  and exactly one host-supplied function per selected capability.

the adapter does not classify, route, select, activate, retry, schedule,
persist, resolve providers, read credentials, or infer missing plan fields.
executors remain host capabilities. passing a function is not an authority
grant from Godskills or Godagents.

## deterministic canary

the retained canary consumes the exact checked Godskills activation and plan
artifacts, recompiles the Muse-to-Forge method to the published method digest,
and runs deterministic injected functions. the fixture requires:

- Muse owns design and Forge owns implementation;
- the acceptance contract crosses the exact typed handoff;
- all four terminal Forge outputs reproduce;
- the execution digest equals the Godskills canary digest;
- no capability method or reviewer body is read;
- no routing, provider, Realm, continuity, keel, evolution, Lunari,
  Inspiration, or Soul component is imported.

## failure matrix

verification fails before import for changed receipt, module, policy, source,
schema, generated artifact, parent root, path alias, byte count, source commit,
or canary digest. adapter construction rejects forged verification and missing
exports. compilation and execution preserve the Godskills rejection behavior
for plan, activation, type, graph, authority, context, method, input, executor,
and output drift.

## compatibility repair

the full release gate exposed one older sealed-transport fixture that recorded
ambient Godskills `HEAD` while executing an explicitly pinned routing release.
the fixture now records the routing sidecar's declared source commit. its
historical fixture bytes, artifact roots, execution result, and certification
receipt remain unchanged when the wider Godskills checkout advances.

## proof limits

v1 proves one local, exact, in-process consumer of the certified Godskills
typed-composition canary. it does not authenticate the origin process of a
structurally valid activation result, execute a model or real skill body,
persist or recover a graph after process death, provide exactly-once external
effects, change any default host path, migrate existing vessel receipts, grant
Realm or continuity authority, or protect against a hostile same-user
operating-system actor.
