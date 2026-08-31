# sealed local Godskills transport v1 certification

## disposition

`sealed-local-godskills-transport-v1` is certified for deterministic local
Godskills routing and adaptive activation behind the existing recoverable
Godskills admission contract.

The release is additive. Historical release pins, runtime entrypoints,
schemas, fixtures, and receipts remain intact. Existing callers keep their
prior injected transport path unless they explicitly construct the new local
adapter.

## frozen coordinates

- Godagents source commit:
  `3647533c80df63f8c916d28842da58574bab2136`
- Godagents parent main:
  `f0b0d38962aea178511a62b7bfb3a059ba155cfe`
- Godskills canonical release commit:
  `7aad930bdb5408ba65e03acf8a56d1978021bcaf`
- receipt:
  `receipts/sealed-local-godskills-transport-v1.json`
- receipt logical digest:
  `b8ca0c1698f6a305db01dc74100138f7c25dc59c2182b2a864d0183b0c787f91`
- receipt file SHA-256:
  `9f6cfa6e85ddd68b0d4686b03f73f95f614c4e96e5bf705f4da665d0598f0288`
- deterministic fixture digest:
  `e94791866922e0c80df94948a6ab52d0f3edc0d7e4b6851bdea00122f4c8c60f`
- implementation manifest digest:
  `2c343c8170bd19f644305cfc8b1273fcb43b3b31eccd52fa0aea7897675f3d6c`
- test manifest digest:
  `af14a8f51b25e7a094954710c90f9b48f7437ae442a0f39744c8623c8a17159c`

The exact upstream executable roots are:

- routing receipt digest:
  `30ca5eb79e8935d8701f2fb466a22dd0007fc370f587c191fe03d065a930ff28`
- routing receipt file SHA-256:
  `27cd2bc10ab225f62916f684bd5a621a3ffeaec43ef93c36d8b5b53188193c7d`
- routing entrypoint SHA-256:
  `d739bfde833fb08e4675c4de5fe4ec8b46cfec29b3155a72bdf03550d45c60ce`
- adaptive activation receipt digest:
  `c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7`
- adaptive activation receipt file SHA-256:
  `98ebeb63db38b67608cf71b1b511b807cfe2d96e17e9b1bc54e7dbb536f8403f`
- adaptive activation entrypoint SHA-256:
  `e19ceef6a781d1d82a82fb17c519755526dc17fa979474b99f291d6eaa17788a`

## certified behavior

The exact Godskills routing and activation roots are verified before either
process transport can be constructed. Verification covers the routing
receipt, entrypoint, seventeen-module local dependency closure, routing
artifacts, parent receipts, adaptive activation root, and the historical
portable capability release. Only verifier-branded in-process objects can
cross into process construction.

Route and activation run in hidden shell-free Node children. The parent passes
only `SystemRoot` and `WINDIR`; the child bootstrap deletes every other
environment variable before importing the exact entrypoint. Routing mode is
fixed by the verified release, and timeout, result ceiling, stage, mode, and
trust root are bound into the transport descriptor.

Each dispatch owns immutable dispatch, request, execution, result, success,
and completion records. A raw result cannot be accepted unless a valid success
witness proves that the exact child exited successfully. Content mutation,
missing records, aliases, symlinks, noncanonical output, oversized output,
timeout, forged verifier provenance, or ambiguous terminal evidence fails
closed. Live lock contention returns a bounded pending result.

The fixture kills the first process after the real activation child publishes
its atomic result and success witness but before completion publication. A new
adapter reconstructs that exact operation, completes the binding without
another route or activation launch, and then replays and rehydrates the final
binding with no child work. The frozen descriptor digests are:

- route:
  `7e53e9f2c95b38535abe0832e7a7554a530162263ca079cad45f9fdd23514868`
- activation:
  `a8d239bf34c2aa1729c5213e85d3e57e6eb9554258cbc1cb87c16ab1c1497cd5`

The fixture records one route launch, one activation launch, two activation
classifications, two durable results, two success witnesses, two completions,
zero authority expansions, and zero Realm effects.

## historical evidence repair

The full release gate exposed that seven older certification builders recorded
the moving Godskills checkout head instead of their original certified
Godskills source. Advancing Godskills main therefore changed only their
reported commit and derived fixture digest even though every pinned artifact
byte remained unchanged.

The repair fixes those builders to the original certified source
`3a63c07322808b6958593bd765c0fb32023a2da5` and requires it to remain an
ancestor of current pushed Godskills main. The specialist preference rebuild
likewise requires its exact source to remain in current pushed lineage rather
than requiring that historical source to remain the branch head forever. All
seven historical fixtures and all historical receipt bytes remain unchanged.

## verification

- focused release gate: 44 tests passed
- complete repository gate: 597 tests passed
- final receipt, ledger, and release-lineage gate: 10 tests passed
- all twenty-three canonical receipts verified with exact historical links
- every certification source commit is an ancestor of the release head
- deterministic fixture reproduced from real route and activation processes
- receipt rebuilt from its exact source commit
- inline adversarial review retained all discovered regressions
- unresolved critical defects: 0

Independent review was not performed because the user required this milestone
to remain inline with no subagents. The receipt states that limitation rather
than implying independent review.

## proof limits

This certification does not prove live provider or model quality, a production
activation classifier, hostile same-user operating-system isolation,
cross-machine terminal replication, or universal exactly-once CPU execution
before output becomes observable. It does not silently migrate the admitted
host, local CLI, or identity-bound vessel. It grants no provider credential,
model-routing, Realm, continuity, personal-keel, identity-evolution,
Inspiration, Lunari, or Soul authority.
