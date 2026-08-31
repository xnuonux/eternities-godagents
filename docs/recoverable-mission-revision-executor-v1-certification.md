# Recoverable mission revision executor v1 certification

## certified source

The provider-neutral recoverable mission revision executor is frozen at source
commit `d9ffd6f63a871868d33b88e64b74033f37ee4a6e`.

- certification receipt: `receipts/recoverable-mission-revision-executor-v1.json`
- receipt digest: `ac055e669d9ea123a1da5bb1c3587d291419abee68de8706204a7ca5729f811c`
- receipt file SHA-256: `fbd6e2bc2f5803f27b82d781694d5c29bedc840b556b91822b0da797b828c4f8`
- deterministic fixture: `fixtures/recoverable-mission-revision-executor-v1.json`
- fixture logical digest: `e4bb501b7d786818c46a845fa119b63d7ecc969a21475e874905a0384624ca3e`
- fixture file SHA-256: `ce7acab0900fd0a869bdd5c6291bc9746f5a15def7fe676d208fb1d9d0f806b1`
- implementation manifest digest: `9dc9264b61f46b9225e72761f00c1499b9f6d144d320bbe61499e48ba135c355`
- test manifest digest: `e09633767116937299bd4bba2dab76fb387b044011ba6d7055d9e1fb48dc95f2`

## pinned dependency and executor identities

- Godskills commit: `3a63c07322808b6958593bd765c0fb32023a2da5`
- verified release digest: `c72a0ce54f6c42f1542068e8fe61e046500587973b716f4c15effaac8c862f5f`
- activation trust root: `c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7`
- review executor binding digest: `8904f53553893f622572c405721489c59db10301bebe65312e3fef8eb8ac1039`
- review executor descriptor digest: `9e7993f582e06e21c49e58c88150cbc61dbdb5839e130fb33c50c060aa45f944`
- review materializer digest: `423f41b62d82169f1215887cc4de83e666ee8af837cc479d50dff5223ee719f3`
- review transport descriptor digest: `424a73092293f2caad5a43b001b5b2703f35abe1b7ea60ea6fbcd87b35c0a88e`
- revision executor binding digest: `7a2bec5f4a9c20a574b49d5636bc412cbf705af48a7c7e2e8e4241fc124e0d0e`
- revision executor descriptor digest: `db2b193636c1982828493d45f79d062dadbbb907b34cd21f7f7f7416a8bb4952`
- revision materializer digest: `34f329622db37702c1c019d0017deb0d5044ad38fc0b7d96e1bab3bde5b40cdd`
- revision transport descriptor digest: `59bc1a8f99523a79930618e0d9984900faadd01eee875fb0f25dd324d5afcade`

## verified behavior

The mission kernel now passes the exact immutable admission, native artifact,
and first review into revision reconciliation and execution. The revision
materializer constructs one compact, authority-empty package containing the
mission, admission and request bindings, exact native and review artifacts,
required finding identifiers, completion limits, and no Godskill bodies. The
revision executor then builds one content-addressed dispatch over that package
and its own materializer and transport identities.

Only exact `absent` reconciliation permits execution. `pending` waits,
`completed` recovers the existing completion, and ambiguous states fail closed.
Every completion must bind the exact dispatch and package, address every
required and only known finding, preserve separate input, cached-input,
reasoning, visible-output, and completion usage, fit both artifact and transport
byte ceilings, carry coherent times, and remain authority-empty. Its completion
digest is committed as executor evidence in the mission revision phase result.

The deterministic fixture runs the actual deferred Godskills review executor
for round one, receives a `revise` verdict, executes the actual revision
executor, and interrupts after its external transport completes but before the
mission journal commits the result. It discards and reconstructs the kernel and
both executors, reproduces revision dispatch digest
`4f5e6b723ca9909639c44463640f95710cbfce3b11b0ba83fb8e85f253a99a25`,
recovers completion digest
`0c41f555f95bf06e8413204b2b49349b6c2475916bfb03363ad292f97d80c186`
without redispatch, commits that digest as executor evidence, and submits the
exact recovered revision to the actual second Godskills review. The second
review accepts it and the journal closes terminal receipt digest
`da6782adb0c5e416e40e57fb8309e207750f0189a0aeb3881400a8694306f6d9`.
Exact terminal replay performs no further external calls.

Inline adversarial review found and closed a sibling cross-binding gap in both
review and revision dispatch verification: copied package fields could formerly
be coherently rehashed around a detached mission or admission while preserving
the original request digest. Both verifiers now bind copied package fields back
to the supplied request and admission. Retained regressions cover detachment,
substitution, ambiguous state, direct execution, findings, token arithmetic,
authority and credential fields, timestamp coherence, byte ceilings, response
mutation, component reconstruction, recovery without redispatch, and final
review binding.

## verification

- all 12 `RRE` requirement rows passed
- 97 focused integration tests passed
- 537 full repository tests passed with zero failures and zero skips
- repeated fixture builds reproduced logical digest `e4bb501b7d786818c46a845fa119b63d7ecc969a21475e874905a0384624ca3e`
- two receipt builds reproduced receipt digest `ac055e669d9ea123a1da5bb1c3587d291419abee68de8706204a7ca5729f811c`
- two receipt builds reproduced file SHA-256 `fbd6e2bc2f5803f27b82d781694d5c29bedc840b556b91822b0da797b828c4f8`
- revision package, dispatch, and completion measure 1,899, 2,709, and 1,483 bytes
- the crash proof performed two revision reconciliations and exactly one revision execution
- the complete loop performed two review reconciliations and exactly two review executions
- all 19 append-only certification receipts and declared historical links verified
- certification ledger digest: `bb2d65e57c71dba12df612e46a547f83c27423d80dc79d9256e76ffacdca061f`
- source-head release-lineage digest before the release-only commit: `a84953717f90c097711dcf99b971abec27771e117c790ef25e659e9b8b47c9be`
- inline adversarial review found no unresolved critical defect
- no independent reviewer or subagent was used, as required by the user

## proof limits

This receipt certifies the provider-neutral revision adapter and local recovery
composition against injected review and revision transports that promise
terminal lookup and atomic deduplication by dispatch digest. It does not certify
those transport implementations, a live model or provider, revision quality,
hostile same-user isolation, a generic native executor adapter, provider
credentials, model routing, default vessel or Codex desktop wiring, Realm
action or compensation, continuity admission, personal-keel writes, Lunari
integration, Inspiration, or Soul. The inherited Godskills release digest
remains bound to the configured local repository root.
