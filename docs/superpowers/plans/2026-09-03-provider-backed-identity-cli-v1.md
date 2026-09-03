# provider-backed identity cli v1 implementation plan

**Goal:** expose the certified provider-backed identity launcher through one
explicit, credential-free operator CLI without widening its authority.

**Spec:** `docs/superpowers/specs/2026-09-03-provider-backed-identity-cli-v1-design.md`

**Branch:** `feat/provider-backed-identity-cli-v1`

**Base:** `dd2466d09d985df68f201106a1d0545feb1c7948`

## task 1: lock the argument contract with red tests

**Create:** `tests/provider-backed-identity-cli-contracts.test.mjs`

Test the parser before implementation:

- accept the exact required options in any order and return a stable object;
- reject missing, duplicate, unknown, odd-length, malformed, and newline/
  nul-containing tokens;
- reject credential-shaped option names and invalid provider families;
- validate identifiers and bounded decimal materialization values;
- preserve the supplied paths as strings without reading them.

Run:

```text
node --test tests/provider-backed-identity-cli-contracts.test.mjs
```

Expected first result: fail because the CLI contract module does not exist.

## task 2: implement closed parsing and request loading

**Create:** `src/host/provider-backed-cli-contracts.mjs`

Implement `ProviderBackedIdentityCliError`,
`parseProviderBackedIdentityCliArgs`, and bounded helpers for canonical JSON
request loading and integer parsing. Keep error codes closed and messages
non-sensitive. Use `verifyIdentityBoundMissionVesselRequest` for the complete
request and require `request.mission.missionId === requestId`.

Run the focused contract tests and then add parser edge cases until green.

Commit: `test: define provider-backed identity cli contract` and
`feat: add provider-backed identity cli contract`.

## task 3: lock runner behavior with injected-service tests

**Create:** `tests/provider-backed-identity-cli.test.mjs`

Use a small injectable host factory and launcher factory so tests never contact
a provider. Test:

- canonical provider policy hashing and family-specific pin environment;
- admission and identity policy preflight before host construction;
- executor-prefix derivation only from a paired policy;
- exact structured request and explicit identity digest reaching the launcher;
- success projection from a verified completion-shaped result;
- closed failure projection and exit codes;
- no secret, path, raw artifact, or provider response in stdout/stderr.

Run:

```text
node --test tests/provider-backed-identity-cli.test.mjs
```

Expected first result: fail because the runner module and projection do not
exist.

## task 4: implement the runner and production entrypoint

**Create:** `src/host/provider-backed-cli.mjs`

Implement `runProviderBackedIdentityCli` with injectable filesystem, host, and
launcher factories for deterministic tests. Production defaults must be:

- `createProviderPhaseHost`;
- `createAdmittedProviderBackedIdentityLauncher`;
- `readFile` and `realpath` only where supported by existing dependency IO;
- canonical JSON output streams.

Preflight admission and policy before provider host construction. Use an
admission-owned runtime path for host operations. Construct the launcher with
the identity policy Godskills release pin, explicit byte limits, and the
derived common executor prefix. Never pass credentials through argv or output.

Run the focused parser and runner tests after each coherent change.

## task 5: add end-to-end fixture coverage without live providers

**Create:** `tests/provider-backed-identity-cli-integration.test.mjs`

Build on the existing admitted provider-backed fixture or create a minimal
service seam that supplies a certified host and launcher. Prove both supported
families select the correct policy pin and that the CLI's output is exactly
the safe terminal projection. Prove construction itself performs no provider
call and that failure paths remain closed.

Run:

```text
node --test tests/provider-backed-identity-cli*.test.mjs
```

## task 6: document and expose the command

**Modify:** `package.json`, `README.md`, `docs/architecture.md`

Add `launch:provider-backed`, document the canonical structured request and
required flags, distinguish it from `launch:local`, and state the live-provider
and credential boundary. Do not claim live availability or add model routing.

Run `git diff --check` and the focused tests.

## task 7: fresh repository gates and review

Run:

```text
npm test
npm run verify:certifications
npm run verify:release-lineage
git diff --check dd2466d09d985df68f201106a1d0545feb1c7948..HEAD
```

Request a read-only Godagents/Terra review of only this worktree after the
first complete implementation slice. If feedback arrives, evaluate it with
the receiving-code-review workflow before changing code. Do not regenerate
existing certification receipts unless the implementation becomes part of a
separately proven receipt protocol.

## task 8: integrate only after verification

Confirm the worktree is clean, the full suite and release gates pass, and the
review has no critical or important findings. Refetch both canonical
repositories, verify Godskills is untouched and canonical Godagents main has
not advanced incompatibly, then fast-forward `feat/provider-backed-identity-cli-v1`
into `C:\dev\eternities-godagents` main and push `origin/main`. Rerun the full
suite and both release gates on merged main. Remove only this clean worktree
and branch. Preserve the unrelated untracked `package-lock.json` on canonical
main and all historical Godskills/Godagents worktrees.
