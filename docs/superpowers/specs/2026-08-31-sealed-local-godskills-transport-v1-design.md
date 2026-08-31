# sealed local Godskills transport v1 design

## status

- date: 2026-08-31
- Godagents parent: `f0b0d38962aea178511a62b7bfb3a059ba155cfe`
- Godskills executable parent: `7aad930bdb5408ba65e03acf8a56d1978021bcaf`
- scope: opt-in exact local routing and activation processes with recoverable admission
- historical schemas, release pins, adapters, receipts, and ledger rows remain immutable

## problem

Godagents verifies the existing Godskills System v3, intent compiler, router,
portable manifest, specialist preference release, and adaptive activation root.
Its legacy local route transport still launches `scripts/intent.mjs` or
`scripts/intent-preference.mjs` directly, inherits ambient environment data,
has no timeout, has no result byte ceiling, and has no single executable trust
root. The recoverable admission layer can consume a terminally reconcilable
transport, but the repository has only injected fixture implementations.

Godskills now publishes `receipts/routing-executable-v1.json`, whose exact
17-module closure, routing artifacts, and five parents are certified at
`7aad930bdb5408ba65e03acf8a56d1978021bcaf`. Godagents must consume that trust
root without mutating the historical v1 release-pin schema or invalidating any
older receipt.

## decision

Add three strictly additive layers:

1. a routing-executable sidecar pin and verifier;
2. one durable local process transport shared by the verified routing and
   activation entrypoints;
3. one opt-in local recoverable adapter constructor that composes those
   transports with the already certified recoverable Godskills admission
   adapter.

The historical `godskills-release-pin` remains unchanged. The new sidecar is
required only by the new constructor. Existing callers retain their exact
behavior and evidence.

Historical certification fixtures continue to name the exact Godskills commit
that originally supplied their pinned release. Reproduction requires that
commit to remain an ancestor of the current pushed Godskills main and still
verifies every pinned artifact byte, but it no longer mistakes a legitimate
append-only Godskills release for historical evidence drift.

## sidecar trust root

The routing sidecar pins only:

- protocol `eternities-godskills-routing-executable-v1`;
- the exact executable receipt path, file SHA-256, and logical receipt digest;
- the exact `scripts/routing.mjs` path and file SHA-256.

Verification first verifies the ordinary Godskills release. It then verifies
the routing receipt's closed shape, logical digest, modes, complete module
closure, every module byte, three routing artifacts, five parent receipts,
parent identities and statuses, original parent digest algorithms, and the
entrypoint sidecar. The resulting object receives an in-process provenance
brand. Local process construction refuses structurally similar caller objects
that did not pass this verifier.

## durable process transport

The transport exposes the existing recoverable `descriptor`, `reconcile`, and
`execute` contract. Its descriptor identity binds:

- stage and executable trust-root digest;
- fixed routing mode when the stage is route;
- timeout and result-byte ceiling;
- dispatch and completion ceilings;
- authority-empty operation semantics.

Each dispatch owns one content-addressed terminal directory beneath the
configured admission root:

```text
local-process-terminal/<stage>/<dispatch-digest>/
  dispatch.json
  request.json
  execution.json
  result.json
  success.json
  completion.json
  execution.lock
```

The exact dispatch and request are published before process launch. The child
writes directly to the durable `result.json` path using the Godskills
entrypoint's atomic publication. A zero-exit child causes the parent to publish
an immutable `success.json` witness binding the execution and result digests.
The parent accepts or recovers a result only when that witness is present and
valid, then builds the existing closed completion receipt and publishes it
exclusively. A process interruption after the success witness but before local
completion publication leaves both atomic records in place. Reconstruction
materializes the completion from them without launching another child. A raw
result from a failed or killed child is not evidence of successful execution.

Per-dispatch locking prevents concurrent launch. A live or recent owner is
reported as pending. A dead owner with no result may be retried because both
entrypoints are local, deterministic, authority-empty compilers. The transport
claims atomic deduplication of the durable completion and no redispatch after a
complete atomic result, not universal exactly-once CPU execution across an
unobservable host power loss.

## child boundary

The child:

- uses the current Node executable with `shell: false` and a hidden window;
- receives only `SystemRoot` and `WINDIR`, then deletes every other environment
  variable again inside a bootstrap before importing the entrypoint;
- receives only the exact request, output, receipt, and fixed route-mode
  arguments;
- has no provider, model, endpoint, credential, Realm, continuity, identity,
  evolution, Inspiration, Soul, or personal-keel input;
- is killed after a bounded timeout;
- must produce one regular JSON file beneath the durable operation directory
  within the configured byte ceiling.

The Godskills entrypoint independently rebuilds its executable receipt before
reading the request. Godagents therefore verifies the same root before launch,
and Godskills verifies itself again inside the child.

## default recoverable composition

`createLocalRecoverableGodskillsAdapter` is the opt-in default constructor for
this boundary. It verifies the historical release plus routing sidecar, requires
the already verified adaptive activation root, derives `specialist` mode only
when the historical release also carries the certified preference root, builds
both local durable transports under the admission root, and delegates all
mission binding and rehydration to `createRecoverableGodskillsAdapter`.

It does not replace the admitted host, local CLI, or identity-bound vessel by
default in this milestone. Those product surfaces need their own migration
receipts rather than silently changing a historical runtime.

## acceptance claims

| id | claim |
|---|---|
| `SLT-001` | the new routing sidecar verifies the exact pushed Godskills receipt, entrypoint, 17-module closure, routing artifacts, and parents |
| `SLT-002` | changed receipt, module, routing artifact, parent, pin, identity, status, digest algorithm, or symlink alias fails before transport construction |
| `SLT-003` | only verifier-produced branded execution roots can construct the local process transports |
| `SLT-004` | child environment, shell, window, arguments, timeout, and result bytes are bounded |
| `SLT-005` | route mode is fixed from the verified release and cannot be selected per request |
| `SLT-006` | exact dispatch and request records exist before process launch |
| `SLT-007` | one atomic result, zero-exit success witness, and completion are addressed by the exact dispatch digest |
| `SLT-008` | process death after child completion recovers the result without another child launch |
| `SLT-009` | live contention is pending, changed evidence collides, and malformed or oversized output fails closed |
| `SLT-010` | the actual default and activation Godskills entrypoints execute through the new transport |
| `SLT-011` | the composed adapter routes, activates, binds, rehydrates, and terminally replays through existing validators |
| `SLT-012` | existing release pins, legacy transports, receipts, schemas, adapters, and tests remain byte-compatible |
| `SLT-013` | historical fixtures reproduce against their original certified Godskills source after append-only upstream releases |

## explicit non-goals

- no live provider, model, endpoint, credential, or network call;
- no general exactly-once process claim across power loss before observable
  output;
- no hostile same-user filesystem isolation;
- no model-quality or routing-quality superiority claim;
- no automatic migration of the admitted host, local CLI, identity-bound
  vessel, Codex, Claude Code, MCP, or Lunari;
- no Realm action, continuity admission, identity mutation, evolution,
  Inspiration, Soul, or personal-keel write.
