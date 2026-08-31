# Receipt-Bound Typed Executor Bundle v1 Design

## purpose

The admitted sealed typed execution host verifies exact executor descriptors but
receives corresponding functions from its caller. This milestone adds a sibling
launcher that resolves those behaviors from one externally pinned, locally
verified bundle. It removes caller-selected executable code from the new path
without changing any certified host byte or existing launch path.

## boundary

The bundle is a canonical receipt plus one canonical declarative JSON program
per capability. The operator pins the receipt file SHA-256 through
`GODAGENT_TYPED_EXECUTOR_BUNDLE_SHA256`. The receipt binds:

- protocol and bundle identities
- an exact, sorted capability set
- each program's canonical repository-relative path, SHA-256, and byte count
- each authority-empty executor descriptor derived from the program digest
- a logical receipt digest over every preceding field

The public sibling launcher accepts only `admissionRoot`, `policyPath`,
`executorBundleRoot`, `executorBundleReceiptPath`, `request`, and `env`. It has
no executor, loader, import, filesystem, cache, clock, lock, registry, or runner
hook.

## declarative program

Every program has exactly five fields: schema version, protocol id, capability
id, bounded delay, and output template. The output template has exactly the
typed capability result header and a fixed JSON `slots` object. Its only dynamic
operation is the exact projection `{ "$input": "missionId" }` in the result's
mission field. No other input, branch, loop, call, expression, module, source,
loader, path, environment, credential, authority, or effect vocabulary exists.

The verifier rejects noncanonical JSON, extra fields, credential-shaped data,
prototype-affecting keys, unsupported projections, structural depth above 16,
more than 512 template nodes, delay above five seconds, and program files above
one MiB. JavaScript-looking strings in admitted output are inert JSON data.

## exact-byte interpretation

The verifier uses native filesystem operations. On a quiescent filesystem it
rejects absolute, noncanonical, escaping, observed symbolic-link, duplicate,
missing, or changed receipt and program paths. It reads each program once and
verifies its exact bytes before parsing and freezing it.

Verification performs no program behavior. The launcher first binds the
complete descriptor set to the externally pinned policy and verifies that
policy against the admitted genesis identity. Only then does host-owned code
construct frozen handles that materialize the fixed template, copy the admitted
mission id, and optionally wait through the host timer. No guest source is
evaluated and no module is loaded from the bundle.

## host composition

The sibling launcher verifies the bundle, authorizes all derived descriptors,
then calls the already certified `launchAdmittedSealedTypedExecutionMission`
with the privately branded handles. The existing host independently requires
their descriptors to match the externally pinned admitted policy exactly.

No historical host contract, fixture, runtime namespace, policy, receipt, or
default is reinterpreted. A policy that selects the bundle-backed descriptors
receives its normal distinct execution-binding namespace through the existing
host.

## failures

The public launcher exposes closed failure classes:

- `input-invalid`
- `bundle-integrity`
- `bundle-interface`
- existing admitted host failures after successful bundle resolution

Changed pins, receipt fields, receipt digest, program bytes, program path,
capability set, descriptor, grammar, template, or policy binding fail before
affected executor work.

## acceptance

- caller-selected executor functions are impossible on the sibling API
- one external digest pins one canonical receipt and exact program byte set
- native verifier I/O cannot be replaced by the caller
- no executable guest source or external dependency mechanism is admitted
- only a bounded delay, fixed JSON template, and exact mission-id projection exist
- receipt descriptors are authority-empty, sorted, unique, derived, and policy-matched
- one real admitted fixture completes the Muse-to-Forge graph through the bundle
- changed receipt, program, descriptor, path, grammar, or policy fails first
- persisted Muse recovery invokes only Forge and terminal replay invokes none
- recovery crosses a fresh Node process and does not depend on interrupted state
- all earlier certified host and runner artifacts remain byte-for-byte intact
- deterministic fixture, independent Terra review, full suite, ledger, and
  release lineage reproduce from exact source commits

## proof limits

- bundled programs are deterministic certification implementations, not live
  provider or model-quality certification
- the host-owned declarative interpreter remains trusted implementation
- hostile same-user filesystem replacement races and hard-link identity are not certified
- hostile mutation of already executing process memory is not certified
- executor return before durable publication may still repeat after process death
- external exactly-once effects remain unproved
- the narrow grammar is not a general-purpose agent executor
- no default adoption, CLI, provider transport, Realm action, continuity write,
  evolution, Inspiration, Lunari, or Soul activation is added
