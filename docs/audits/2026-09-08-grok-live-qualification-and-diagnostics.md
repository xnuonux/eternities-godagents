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
