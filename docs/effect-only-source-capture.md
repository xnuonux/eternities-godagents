# Effect-only v2 source capture checkpoint

This is a development checkpoint, not release adoption or an end-to-end runtime
certification. The existing v1 launch path remains unchanged.

`src/skills/effect-only-executable-verifier.mjs` accepts a separately trusted host
pin and captures the exact five-module executable closure. It checks the receipt
file hash, canonical logical digest, protocol, source order, entrypoint and every
module hash. Reads are bounded to 1 MiB per regular file. Noncanonical aliases are
rejected. Returned source bytes are immutable base64 strings, with an in-process
provenance brand that is intentionally lost on cloning or serialization.

The helper does not execute source, authenticate a reviewer, rerun tests, prove
semantic quality, or decide whether a release is eligible for deployment. Those
remain separate host/issuance gates. Future dispatch must materialize these
captured bytes in a host-owned isolated directory and execute that snapshot, not
reopen the original checkout. A caller-supplied pin is not self-authentication.

## Evidence on 2026-09-07

- Initial six tests failed because the source-capture API was absent.
- Eleven verifier tests now pass, including post-verification checkout mutation,
  incorrect pins, extra/reordered modules, unsupported receipt version, size
  limits, a real source-directory junction/alias, and rejection of a cloned
  provenance object.
- Producer, projection and verifier combined: 32 passing, no failures or skips.
- Independent reviewer Hooke (`01a07df6-ac68-7a92-b52a-ce9a5298335d`)
  approved the verifier scope and identified missing host-side identity binding
  in the projection. A red-to-green regression and separate frozen `hostBinding`
  now retain full request, policy, verified candidate and routing request digests
  without leaking identity into the Godskills wire. Narrow re-review approved
  that correction. Admission/recovery consumption remains pending.
- Read-only interoperability with the actual Godskills receipt succeeded:
  five modules, 32,551 captured bytes. No code execution or policy adoption.

Reviewed Godskills implementation commit:
`7342a75f53d763be11fd85d856e38640561a5eca`.

Receipt `receipts/effect-only-executable-v2.json`:

- file SHA-256: `f4baee63d9d802f7a985b5570deb81bbf174dbad3d7aea3d3aba67d546851e04`
- logical digest: `03fe45aeb133b715354174867a05781fac9b3cfa5353edf020cecdafa1a88a73`
- entrypoint SHA-256: `12ae69b74a412ba711a1ae630eec0fc3bb3181a4a18df1810857a4e49df1ab3b`

Its captured full result is explicitly not green: 932 tests, 930 pass, one
installed-host-wording failure and one skip. The 89 targeted tests pass.

## Remaining vertical slice

1. Resolve independent review findings and verify snapshot materialization and
   bounded subprocess execution against the frozen source.
2. Connect explicit v2 policy, request, adapter binding and admission/recovery.
   Current `identity-bound-mission-vessel-contracts.mjs` still requires v1, and
   `admitted-sealed-identity-launch.mjs` still constructs the v1 sealed factory.
   Do not bypass those checks by discarding the assessment or rebranding v2 as v1.
3. Prove known permitted local work reaches one native inference and recovery
   reaches zero additional inferences. Unknown, conflicting, denied, stale or
   rebound inputs must not launch inference.
4. Run integrated review/release gates before merge. Preserve historical
   receipts and the unresolved full-suite ownership issue accurately.
5. Only then perform the separately bounded fresh real-task comparison.

This slice is a structured local-artifact path. It is not general natural-language
interpretation, the entire Godskills catalog, or the completion of Godagents.

## Isolated materialization and offline subprocess probe

`materializeEffectOnlyExecutable({ verifiedExecutable, parent })` creates a fresh
host-owned snapshot directory containing only the captured modules. It rejects
unbranded objects and aliased parents, writes exclusively, and verifies the
written bytes before returning. It never reopens the source checkout. Partial
failures are retained, not returned as executable handles or automatically
retried. This is not an OS sandbox against another process with the same access.

The added materialization test failed before implementation and now passes. It
changes the original checkout after capture, verifies the materialized original
bytes, checks two calls use distinct directories, and rejects cloned provenance.

The reusable offline probe `scripts/evaluation/effect-only-snapshot-smoke.mjs`
pins the reviewed receipt and both vectors, executes the CLI with a stripped
environment, no shell, hidden window, five-second timeout and 4 KiB captured
output limit. It compares the actual subprocess output against the pinned result
vector and retains the snapshot and report. This is not a production dispatcher.

Observed report:
`D:\00-INDEX\operations\2026-09-07-effect-only-snapshot-smoke\effect-only-RUKW8o\smoke-report.json`.
The probe passed with result digest
`2634cd2d2f5b780824869cb0b376c5d8acf002820730ffbcaeb0795efab33efe`,
zero provider calls, no host policy adoption and no mission launch.

Independent reviewer Peirce (`01a07dfc-a52c-7f11-8434-5ec39c626d71`)
approved the materialization scope and noted that the probe created its parent
before alias validation. A failing regression reproduced that early side effect;
the probe now requires an existing parent and never creates it. The three-file
focused set passes 34 tests after this correction. The zero-call fields in the
probe report describe its verified scope, not independent usage instrumentation.
This does not certify the still-missing v2 mission dispatch/recovery integration.

## Separately pinned recovery sidecar

The host now verifies `eternities-godskills-effect-only-verifier-v2` using a
separate provenance brand, exact parent receipt triple and identical four shared
consumer module hashes. Both captures can be materialized, but a sidecar cannot
satisfy the routing-executable assertion. Directory location is not authority:
identical pinned copies in separate canonical directories are intentionally
accepted. A positive mirror test protects that portability.

Issued sidecar file hash:
`1e027c1061fdb5bb482aae9d1a09409ba70ccb9f87bd834784fb3cf95e8f427a`;
logical digest: `a4c2ef29dc626d45e57cce361185b5c43a6065dd602236fe38385cc28b025f81`;
entrypoint hash: `bedfcf57bcff9b7d780c30c933cdef709a4a5c042973449d07fe0a4cc78857a8`.

`scripts/evaluation/effect-only-recovery-smoke.mjs` verified the original saved
golden result using a fresh sidecar snapshot. One verification subprocess, no
new routing subprocess, native inference, effect dispatch or host policy change.
Original request, expected-source and result file hashes remained unchanged.
Report: `D:\00-INDEX\operations\2026-09-07-effect-only-snapshot-smoke\effect-only-py3djD\recovery-smoke-report.json`.
The Godskills owner independently checked snapshot and original-file hashes.

Rawls (`01a07e0c-81f7-7351-bb58-ec2ddc80e8d8`) reviewed the host delta and probe.
An initial directory-identity objection was withdrawn after checking the
content-addressed trust model. No concrete trust-confusion regression remained.
The probe's `spawnSync maxBuffer:4096` is an overflow termination threshold, not
a strict peak allocation or truncation guarantee. A local 5,000-byte-output
probe produced ENOBUFS/SIGTERM with 5,000 bytes observed. Earlier references to
a 4 KiB output bound mean this threshold; the recovery probe emits no captured
child output and rejects errors. The successful verifier emitted zero bytes.
This limitation is not a claim of a hard memory sandbox.
