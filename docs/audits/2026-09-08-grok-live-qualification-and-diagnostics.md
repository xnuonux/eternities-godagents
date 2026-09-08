# Live Grok qualification 1 and rejection diagnostics

## Observed, not inferred

One bounded live compatibility attempt used main `de91351`, whose adapter runtime
is `5d3d0ba`. The synthetic arithmetic mission requested artifact text
`19 + 23 = 42`, with low reasoning effort, at most one inference dispatch,
4,096 completion tokens, a 90-second timeout, and no automatic retry or paid
fallback. This exercises a real local genesis/cortex compiler and native phase
port, but uses synthetic outer vessel/authority digest bindings. It is not a
complete production effect-only host launch or a quality comparison.

The auth preflight reported fresh native authentication, available binary and
no refresh required. Executable and bridge pins matched before and after the
attempt. The subprocess returned a result, but the codec rejected it as
`response-invalid`; elapsed wall time was 7,170 ms. No output-quality or model
failure conclusion follows. No second inference was issued to investigate it.

Evidence root:
`D:/00-INDEX/operations/2026-09-08-controlled-comparison-integration/grok-phase-live-qualification-1`.

- intent SHA256 `d1ad0ebd15ea8fb188a8a4d741cd3bfd0e0c2f7745a0e89f43d0dd0a84c8eaf9`
- result SHA256 `923dbfafd4a6eda8cae5662b35eed39b16cb3aa0bfe1324ba4f30de8951b2a76`
- response digest in the terminal failure:
  `a8b75d3e13f706d8de6106c9ee60e3bdb983c7fb6c65b156bb6e1f8e15318587`
- failure record digest:
  `c1467a923a4d39a6483a3c9eb7eac2fb675d2ad400c5167eed71091700e42427`

The old record does not retain the failed acceptance stage or field-presence
facts. The exact rejection cause therefore remains unknown. Do not reconstruct
missing observations from documentation, guesses, or a later response.

## Diagnostic repair

The new feature branch adds a closed rejection-stage enum and a non-authoritative
projection of known field types, bounded numeric usage and presence/count facts.
No provider text, hidden reasoning, arbitrary model-row keys or unknown field
values are copied. Policy/dispatch/request/response digests bind the observation.

Diagnostics live outside the strict operation slot, under
`<runtimeRoot>/grok-rejection-diagnostics-v1/<phase>-<dispatchDigest>.json`.
Exclusive creation, exact idempotent comparison, bounded size, issued-only
objects and junction checks protect this optional output. Persistence is best
effort: conflicts or I/O failures cannot mask the original rejection, turn it
into success, change the historical failure protocol, or trigger redispatch.
The trusted host supplies the runtime root; the diagnostic is not an authority
or recovery capability and does not defend against privileged filesystem races.

Red tests first exposed missing stage/projection/publication behavior. A recovery
test then caught the mistake of adding an unknown file to the strict operation
slot; the corrected separate namespace preserved terminal failure replay.
Twenty-seven targeted tests passed, 7,603.7812 ms, exit 0, covering the existing
adapter plus diagnostic privacy, publication conflicts, junction refusal and
unchanged failure/replay. Independent scoped review approved the actual patch
with no critical or important finding; it did not rerun providers or tests.

This is targeted diagnostic evidence, not a merged release gate or successful
live deployment. A future diagnostic attempt requires a separate preserved
purpose/envelope and newly pinned source. Qualification 1 must remain unchanged.

## Diagnostic 2: exact rejection boundary

The reviewed diagnostic implementation was committed as `23b4bbe`. A separate
attempt under `grok-phase-live-diagnostic-2` used that exact source, unchanged
acceptance, fresh native auth and matching program pins. It failed in 5,250 ms
at `usage-accounting`. The safe diagnostic records one model ledger row but
`requestedModelPresent: false` for `grok-4.6`; terminal JSON and artifact JSON
were objects, stop reason was `end_turn`, and the reported round count was one.
All six additive usage counters were present and numeric. No reported model
label was retained by this projection. The result SHA256 is
`6c22e78055a6ea782c6ba1f9d3dbfc7e87ef39b5ce6d86a1c281285dcae5d38b`.

A non-inference `grok --no-auto-update models` check listed `grok-4.6` as
default and `grok-4.5` as another available selection, with no reported-name
mapping. A user-config warning was observed, but this listing did not run the
isolated inference transport and does not establish its rejection cause.

## Diagnostic 3: observed reported deployment

A separately reviewed one-shot script under `grok-phase-live-diagnostic-3`
used the same pinned source and durable engine with a local observation wrapper.
It retained only bounded vendor-shaped model labels, known numeric counters,
hash bindings and artifact shape/correctness facts. It did not persist raw
provider text, hidden reasoning or arbitrary metadata. The wrapper did not
change codec acceptance. Source/program pin checks were also placed before its
read-only reconciliation mode after review found a provenance gap in that mode.

One dispatch completed in 26,911 ms and was rejected by the unchanged codec.
The actual row label was `grok-4.6-build`, with one reported model call and:

- uncached input 14,440; cache read 128; cache creation 0
- output 49, including reasoning 33; total 14,617
- reported cost 0.00497046 USD; actual subscription charge remains unknown
- exactly one artifact field, string content, arithmetic check correct

Result SHA256:
`232659897ed4d07e3d853d3e03ab2643db2882e24c96657433c4630992ad43f4`.
Model-metadata file SHA256:
`b6a2256a5f48df69bf2a56109a641fe08c1095f0327d5da120b47b86bd5db744`.
Response digest:
`8f5e842df4ad40f0572ccafb269205b2f66774fefeab272d55ae6de13565d28e`.

All attempts remain separate and immutable. These later observations do not
retroactively establish the unknown response contents of qualification 1.

## Bounded compatibility change

`provider.reportedModelId` becomes an optional exact host pin. Only `grok-4.6`
and the observed `grok-4.6-build` are supported; omission retains the old exact
`grok-4.6` requirement. The requested model does not change. New build receipts
retain the real ledger key and carry a separate `reportedModelId`; legacy
receipt shape stays unchanged. Replay verification is closed over host policy,
not a receipt-supplied expected name. A changed pin requires a new policy digest.

Three new tests first failed on missing policy/codec admission. The full targeted
adapter group then passed 30/30, 7,578.8595 ms, exit 0. Tests cover pin changes,
unknown names, default rejection, tampered/mismatched evidence, strict top-level
name consistency and all-three-phase auth-free replay. This is not automatic
alias inference, an assertion of identical model weights, a billing guarantee,
or live task-quality proof. Independent review and a new production-suite live
qualification remain the next gates before final integration.

## Qualification 4: production native phase passes

Independent actual-diff review found no critical or important issue in the
explicit deployment-pin change, committed as
`4cd4cfae0dc0756cf0d5f19d609aa9060648f63c`. A new one-shot production-suite
qualification used this exact clean tracked source and unchanged binary/bridge
pins. The host policy explicitly selected reported `grok-4.6-build` while the
request selected `grok-4.6`. Fresh native OIDC auth was available.

Evidence root:
`D:/00-INDEX/operations/2026-09-08-controlled-comparison-integration/grok-phase-live-qualification-4`.

- one inference dispatch; no automatic retry or paid fallback; 5,596 ms
- correct synthetic arithmetic artifact; native completion verified
- normalized input 14,574, cached input 128, reasoning 27, visible output 16,
  inclusive completion 43; raw total 14,617
- requested and reported model names preserved separately in provider evidence
- fresh-process reconciliation returned the same completion without inference
- completion digest `71fc45792fd1eca06e426522e3eafc041a4822d1d42a9e9abb09447ddc1fb9fb`
- result file SHA256 `6b3495b528d452708a43ca3d5d410b8c0d2621ffc873840cb484f8f6b32927cd`
- intent file SHA256 `a112f96e4ff53e55886d7c3f34128da4788c3b75d883b8ed78e14a86f80f9098`
- reconciliation file SHA256 `27c918c877cb1639675a1cd790c7fb62a415ab4207710d4f2ccb5d1ac82087e9`

This qualifies the observed production native phase only. It still uses a real
synthetic creation/cortex fixture with synthetic outer vessel/authority digest
bindings, not a full admitted effect-only host launch. Review/revision live
qualification, useful-task quality, cross-provider equivalence, remote physical
exactly-once guarantees, and actual subscription charges remain unproven.

## Full integration gate

`node --test --test-reporter=tap` on runtime `4cd4cfa` passed **1,309/1,309**,
zero failed/cancelled/skipped/todo, exit 0, **662,913.6182 ms**. The top-level
TAP plan is 1..1303; the total includes nested tests. Both the 69-receipt ledger
and release-lineage/environment-redirection checks passed. No historical
receipt was regenerated or rewritten. The full gate process is complete.

Log:
`D:/00-INDEX/operations/2026-09-08-controlled-comparison-integration/godagents-4cd4cfa-full-suite-tap.log`.
SHA256 `02ff647c02532a8ec00e75dde30f0dce6907537dedce6f6f6732c72a562b3011`.

The subsequent documentation-only closeout does not alter runtime or test code.
Merge/push and post-merge targeted/published-head checks remain separate gates.
