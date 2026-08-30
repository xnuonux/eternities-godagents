# crossed-suite v1, round 1 implementation control

## red baseline

Exact command:

```text
pnpm test
```

Baseline result: 1 passed, 6 failed, 0 cancelled, 0 skipped, 0 todo. Duration: 171.8747 ms.

The sole passing test was `rejects mismatched profile host and adapter identities`. The six failures all originated from the unimplemented `validateHostProfile` or `digestHostProfile` functions, which threw `Error: HostProfileV1 is not implemented`.

## implementation decision

Implemented the closed `HostProfileV1` schema in `src/host-profile.mjs`.

- allows only the nine declared own enumerable data fields
- accepts only the three exact host, profile-id, and adapter-id combinations
- requires the fixed schema, capsule, and authority-attestation values
- enforces `1 <= maxPackageBytes <= 65536`, a boolean recovery declaration, and `globalInstructionMutation === false`
- returns a new deeply frozen canonical object
- validates before computing sha-256 over the canonical field order, so insertion order cannot change the digest

## changed files

- `src/host-profile.mjs`
- `C:\dev\eternities-godagents\evidence\field-trials\2026-08-30-crossed-suite-v1\results\01-implementation\control.md`

No test files were changed.

## final verification

Exact command:

```text
pnpm test
```

Exact final output:

```text
$ node --test
✔ accepts and deeply freezes each exact supported host profile (1.7021ms)
✔ rejects unknown fields and executable or authority-shaped configuration (1.9323ms)
✔ rejects mismatched profile host and adapter identities (0.4422ms)
✔ requires the exact protocols and forbids global instruction mutation (0.3255ms)
✔ bounds package bytes and requires a boolean recovery declaration (0.3777ms)
✔ returns a canonical sha256 digest independent of key insertion order (1.5438ms)
✔ digest validation rejects invalid profiles rather than hashing them (0.1886ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 142.2385
```

Final count: 7 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo.

## self-review

Inspected `src/host-profile.mjs` after the final test run. The canonical output is constructed in fixed schema order before hashing. Validation rejects unknown string and symbol keys, non-enumerable fields, accessor fields, missing fields, unsupported host identities, and invalid fixed values before any digest is produced. The returned value is a fresh object, so validation does not freeze or mutate the caller input.

Exact review command:

```text
git diff --no-index --check -- NUL src\host-profile.mjs
```

The review command produced only Git's line-ending warning and no whitespace-error diagnostics.

## remaining limits

Only the sealed `node --test` suite was run. No broader or external integration suite was available or invoked. The implementation assumes the contract's demonstrated inclusive byte ceiling is 65536 bytes, based on the sealed test's rejection of 65537.

## integration state

Not integrated. No canonical repository was modified, no commit was made, no network was used, and no paired workspace or result was inspected.
