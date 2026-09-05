# mission economics ledger v1 design

## purpose

Add a small provider-neutral observation sidecar for completed mission review
evidence. The sidecar makes token and latency behavior inspectable without
changing the certified mission-phase or completion receipts, selecting a
provider, or adding a cache implementation.

## boundary

The input is the exact admission, verdict, completion receipt, and committed
phase evidence already recovered by the mission review journal. Every phase
must pass the existing mission request, executor descriptor, and phase-result
verifiers, and every committed result must be referenced by the terminal
completion receipt. The output contains only content digests, separated token
counters, derived cache coverage, bounded completion-budget headroom, stable
cache identity digests, and phase timing.

The ledger is an observation and planning artifact. It does not authorize a
cache read or write, replay a provider request, choose a model, infer model
quality, establish provider pricing, or claim that a provider cache was live.
The cache identity is deterministic for the admitted mission, phase request,
and executor descriptor, so a future host may use it as an input to an
independently governed cache policy.

## contract

The private package exposes the sidecar at the explicit subpath
`@eternities/godagents/economics`. Its closed exports are the two protocol
identifiers, `buildMissionEconomicsLedger`,
`buildMissionEconomicsLedgerFromEvidence`, and
`verifyMissionEconomicsLedger`.

`buildMissionEconomicsLedger` requires the exact source tuple and returns a
deeply frozen `eternities-mission-economics-ledger-v1` value. Phase rows are
sorted in mission order and include input, cached-input, uncached-input,
reasoning, visible-output, completion, completion budget, completion
headroom, completion-utilization basis points, cache-coverage basis points,
start, completion, latency, and three source digests. Totals use integer
basis points and integer milliseconds only.

`buildMissionEconomicsLedgerFromEvidence` is a lossless bridge from the
journal's recovered evidence shape. It projects phase wrappers and never
copies their artifact bodies into the returned ledger.

`verifyMissionEconomicsLedger` rebuilds the complete value from the same exact
source tuple and fails closed on source drift, missing or extra phases, digest
mismatch, usage mismatch, changed timing, changed ratios, authority-shaped
fields, or any extra ledger field.

## non-goals

- no modification of historical mission receipts or journal event schemas;
- no automatic invocation from the mission kernel;
- no cache storage, cache eviction, cache admission, or provider cache claim;
- no price card, cost estimate, quality score, or model comparison;
- no live provider call, retry, routing, Realm action, identity mutation,
  continuity write, keel write, evolution, Inspiration, Lunari, or Soul path;
- no public package publication or claim that external hosts are implemented.
