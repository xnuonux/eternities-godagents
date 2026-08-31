# Recoverable mission native executor v1 certification

## certified source

The provider-neutral recoverable mission native executor is frozen at source
commit `9eb9c7d6b1c0d0124bbdcf69a43677987c04f998`.

- certification receipt: `receipts/recoverable-mission-native-executor-v1.json`
- receipt digest: `5f11ec0fef88b88883c6fa5a0d90db1c0c88bf3efc244333f98399ec3484f570`
- receipt file SHA-256: `82d910aa2f5360300c0d9bd7466c862ef8ce1c62d0778d92ce054b4446c13f82`
- deterministic fixture: `fixtures/recoverable-mission-native-executor-v1.json`
- fixture logical digest: `89d79b292cfcf5f0328079a876d723c22572ce3d8e58947e5adabf65ff29e7de`
- fixture file SHA-256: `7097efb1f41105e02b48ece12eaac4b5490a7b3752bb54b640f816277a8b0822`
- implementation manifest digest: `58e48647384898df2755a56f24d8fb7173ebcb975a96e2fee8023e03f9dfe61b`
- test manifest digest: `2cbaf825c0d6802394735db1af13682d0b7aab10d92359492f0e74bafed16ccd`

## pinned dependency and executor identities

- Godskills commit: `3a63c07322808b6958593bd765c0fb32023a2da5`
- verified release digest: `c72a0ce54f6c42f1542068e8fe61e046500587973b716f4c15effaac8c862f5f`
- activation trust root: `c5a086bb131ff7e1a9508f02b95796ae9066627be3e8e1f8b7e57421220e9bd7`
- native executor binding digest: `c6295a91553c941579968615486585e5b8f8bacdbfc9b47cbad29ce461f8101c`
- native executor descriptor digest: `86d723529f80b7973516ced0e4a28fb9e80d5d9b38e501d6731a95ea48ac225d`
- native materializer digest: `8fc9c5d1ca07b9f8dd7809702df5faf998c99d358825c2c1ef787f3e17054b75`
- native transport descriptor digest: `9de12682adc82049f147089e89cae27727088a969da50f1f53ae7ed7081abc7f`
- review executor binding digest: `a81448fc1f7c0450653fa28ca5c131309ddb3550a48f0a1f166cb433a9ed1041`
- review executor descriptor digest: `91e1b8ce611b9d90404d54e322516ed149ef32142bea7ecedee5f91ed7e038a6`
- revision executor binding digest: `e6e08376d4897be3e923dea7f31f113543e85c4f46d638c636c40199cdb55d9a`
- revision executor descriptor digest: `c2a0f6c545d07e379076d308a7751bedd347fbcb6c1f316220b633f7cc42dcb1`

## verified behavior

The mission kernel passes the exact immutable admission, mission, and compatible
Godskills projection to native reconciliation and execution. The native
materializer verifies the prepared request against that full admission and
emits one authority-empty content-generation package. Native-only admission
emits `godskills: null` and no phase input. A bound admission carries the exact
already-authorized cortex package while deferred review bodies remain absent.
The materializer performs no file read, capability load, provider selection, or
credential resolution.

The content-addressed executor identity binds its materializer and injected
transport descriptors. Only exact `absent` reconciliation grants one execution.
`pending` waits, `completed` recovers, and ambiguous state fails closed. Every
completion must bind the exact dispatch and package, contain one strict native
artifact, preserve separated input, cached-input, reasoning, visible-output,
and completion usage, fit artifact and completion byte ceilings, carry coherent
times, and remain authority-empty. Its completion digest is committed as
executor evidence in the native mission phase result.

The deterministic full-loop fixture interrupts after the native transport
finishes but before the mission journal commits its result. It discards and
reconstructs the kernel plus native, review, and revision executors, reproduces
native dispatch digest
`0ac8c57c8a4c908dc39a314a599c09aa0ad6f162d9fbd3fb02179196cb687f96`,
and recovers completion digest
`690c5af8b469056d7d079b09c95bc3c1f12b1b704be045a4dd09867597049d19`
without a second native execution. That exact recovered artifact enters the
actual first Godskills review, actual revision executor, and actual final
Godskills review before terminal acceptance at receipt digest
`52ca4a6bbdfd03fd699f19edca039ec9c0f2ee49b9ec0b96d4da7b8b9dd05919`.
Exact terminal replay makes no external call.

The independent native-only fixture records package digest
`01a18ae6f1325998b582de4c9dfe785284dfbc1519d1be05231fd1df0edcc612`,
dispatch digest
`b589fea9abf77c652358384c96f8b32b16af6a30b8cd7cc3cc99b7faed1076bd`,
and completion digest
`e565f4f8ca8536c1fd203f62e03e6614d9fe0ca836035e2ae8a183880f83a947`
with zero Godskills context, phase inputs, authority expansion, or Realm effect.

Inline adversarial review retained regressions for context and request drift,
coherent mission, admission, ceiling, and Godskills detachment, credential-shaped
context, ambiguous state, direct and concurrent duplicate execution, package
and completion mutation, token arithmetic, time coherence, byte ceilings,
authority expansion, late response mutation, component reconstruction,
recovery without redispatch, actual review and revision continuation, and
terminal replay.

## verification

- all 14 `NRE` requirement rows passed
- 114 focused integration tests passed
- 556 full repository tests passed with zero failures and zero skips
- repeated fixture builds reproduced logical digest `89d79b292cfcf5f0328079a876d723c22572ce3d8e58947e5adabf65ff29e7de`
- two receipt builds reproduced receipt digest `5f11ec0fef88b88883c6fa5a0d90db1c0c88bf3efc244333f98399ec3484f570`
- two receipt builds reproduced file SHA-256 `82d910aa2f5360300c0d9bd7466c862ef8ce1c62d0778d92ce054b4446c13f82`
- the bound native package, dispatch, and completion measure 3,850, 4,659, and 1,213 bytes
- the native-only package, dispatch, and completion measure 1,077, 1,885, and 1,213 bytes
- the crash proof performed two native reconciliations and exactly one native execution
- the completed loop performed two review executions and exactly one revision execution
- all 20 append-only certification receipts and declared historical links verified
- certification ledger digest: `ba5f293bc3a062883a68f236d64a1cb69c1848a22e976c5e707127f645ab1682`
- source-head release-lineage digest before the release-only commit: `597f091e67629dba840b5d91b3c6f0227af64585a12b62b9a5703745ed6ed3b4`
- inline adversarial review found no unresolved critical defect
- no independent reviewer or subagent was used, as required by the user

## proof limits

This receipt certifies the provider-neutral native adapter and local recovery
composition against injected transports that promise terminal lookup and atomic
deduplication by dispatch digest. It does not certify those transport
implementations, a live model or provider, native output or mission quality,
hostile same-user isolation, a concrete OpenAI, Anthropic, Codex, Claude Code,
local-model, or MCP adapter, provider credentials, model routing, default vessel
or Codex desktop wiring, Realm action or compensation, continuity admission,
personal-keel writes, Lunari integration, Inspiration, or Soul. The inherited
Godskills release digest remains bound to the configured local repository root.
