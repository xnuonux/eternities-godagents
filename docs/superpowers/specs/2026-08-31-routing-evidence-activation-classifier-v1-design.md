# routing-evidence activation classifier v1 design

## decision

add one deterministic, authority-empty activation classifier whose only semantic
inputs are the selected capability identities and the exact routing-card
projections captured while the pinned Godskills routing executable is verified.

the classifier is additive. existing injected classifiers, host launchers,
policies, CLIs, receipts, and sealed-vessel behavior remain unchanged.

## problem

the sealed local identity-bound vessel verifies and executes the exact pinned
Godskills route and activation binaries, but its activation classifier is still
an opaque injected function. that function chooses the task class, consequence
class, and review availability that the activation policy consumes. the
activation executable rejects malformed output and cannot receive authority
from the classifier, but the host still lacks a reproducible classifier identity
that policy can pin.

## boundary

the new classifier:

1. accepts only a verified routing executable carrying the private provenance
   brand issued by `verifyGodskillsRoutingExecutable`;
2. consumes a frozen projection containing mission identity and text plus one to
   three selected capability identities;
3. never interprets mission prose, chooses an activation mode, grants authority,
   reads the network, or invokes a model;
4. derives task class from the selected cards' verified families;
5. derives consequence class from the highest verified card risk;
6. receives review availability as one constructor boolean;
7. emits only the existing closed activation-classification triple.

## verified card projection

the routing executable verifier already reads and digest-checks
`artifacts/routing/cards.jsonl`. it will retain a minimal immutable projection
for every card:

```json
{"id":"eternities-muse","family":"visual-interface-narrative-media","riskClass":"moderate"}
```

the verifier rejects duplicate identities, invalid risk classes, empty family
names, cards not represented by the verified portable release, or any mismatch
between the captured projection and the receipt-bound cards artifact. callers
never receive mutable card bodies or filesystem paths.

## classification rules

task-class families are a closed classifier taxonomy:

- creative generation: audio, game design, visual media, writing and narrative
- debugging recovery: debugging and recovery
- implementation: architecture, automation, data, and implementation engineering
- research: model runtime, quarry discovery, repository research, and scientific epistemology
- continuity: knowledge, memory, and context
- verification: governance, security, release, and skill refinery
- general: agency services, marketing, product operations, social media, and any
  future verified family not yet assigned

one selected class is returned directly. a composition whose selected cards map
to different task classes returns `general`, independent of card order.

risk maps `low -> low`, `moderate -> consequential`, and `high -> critical`.
the highest selected risk wins.

## descriptor

construction produces a frozen classifier object with `classify` and
`descriptor`. the descriptor binds:

- protocol `eternities-routing-evidence-activation-classifier-v1`
- routing executable trust-root digest
- routing cards logical digest
- classifier taxonomy digest
- review-availability boolean
- `authorityExpanded: false`
- canonical descriptor digest

the descriptor does not claim that routing accuracy proves task quality. it
proves only deterministic classification from an already verified route.

## recovery and failure

classification is pure and repeatable. unknown selected identities, duplicate or
unordered malformed projections, missing verified provenance, unsupported risk,
or altered card evidence fail before activation transport. recovery continues to
rehydrate the recorded activation binding and therefore does not reclassify.

## acceptance

- exact Muse evidence yields creative-generation, consequential, and the pinned
  review availability
- Phoenix yields debugging-recovery; Oracle yields research; Aegis yields
  verification and critical
- mixed task classes collapse to general independent of selected order
- changed mission prose cannot change classification
- descriptor bytes and digest reproduce
- card projection is minimal, frozen, complete, and release-bound
- no classifier output contains mode, authority, paths, credentials, provider,
  Realm, continuity, keel, evolution, Inspiration, Lunari, or Soul fields
- focused tests, full repository tests, release gates, fixture, and receipt pass

## proof limit

this milestone removes an opaque classifier implementation from the future host
path. it does not yet make the classifier the default sealed-vessel or admitted
host path, validate semantic routing quality, construct a live model transport,
or grant any external authority.
