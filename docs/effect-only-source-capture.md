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
