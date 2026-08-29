# Godagent local creator CLI design

- **Status:** implementation design following certified creator protocol Phase 3
- **Recorded:** 2026-08-29
- **Repository:** `C:\dev\eternities-godagents`
- **Depends on:** certified creator protocol receipt `9b1baa7f0538c3148b65eaaaad8adf9ed21393b318beffd9b81d555ef85c62d4`

## Decision

Add one local, network-free operator shell over the certified creator protocol. The shell exposes catalog inspection, preset preview, and explicitly reviewed preset finalization. It is a replaceable client of the protocol, not a second creator engine.

The CLI is deliberately narrow. It proves that a real interface can consume the same catalog, command replay, preview, review seal, immutable source snapshot, compiler, and verifier without receiving a privileged path.

## Commands

All commands require these library options:

```text
--policy <file>
--policy-digest <sha256>
--modules <directory>
--expressions <directory>
--presets <directory>
```

The command surface is:

```text
catalog
preview-preset --preset <ref> --creator <ref>
finalize-preset --preset <ref> --creator <ref>
  --expected-preview-digest <sha256>
  --source-dir <empty-directory>
  --output-dir <empty-directory>
```

Unknown, duplicate, missing, empty, credential-shaped, or command-inapplicable options fail closed. The parser never echoes rejected values.

## Workflow service

The CLI delegates to a reusable local workflow service:

- `loadOperatorCatalog(options)` returns only the frozen bounded catalog;
- `previewOperatorPreset(options)` creates a revision-zero draft, replays the preset through ordinary commands, and returns a closed review projection;
- `finalizeOperatorPreset(options)` recomputes the same review from current sources, requires the operator-supplied preview digest, creates the exact review seal, and calls the certified finalizer.

This service is the future seam for visual and conversational shells. Those shells may decorate output or recommend choices, but they may not bypass commands, review, or finalization.

## Output

Successful stdout is one canonical JSON value. Catalog output contains only the certified bounded catalog. Preview output contains status, issue rows, selected references, derived attributes when ready, excluded authority fields, catalog digest, draft digest, and preview digest. It does not expose raw module bodies or host functions.

Finalization output contains only the reviewed identities and verified creation build identities. It does not serialize source-loader functions, raw filesystem exceptions, credentials, or a runnable vessel.

Failures emit one closed code and a non-sensitive constant message. They do not echo user arguments, paths, source content, or exception text.

## Trust boundary

```text
strict argv
  -> fixed local library paths + independent policy digest
  -> certified catalog loader
  -> ordinary preset command replay
  -> pure preview
  -> explicit expected preview digest
  -> certified review seal + immutable source finalizer
  -> verified Phase 1 creation build
```

The CLI has no network transport, model adapter, Realm hand, runtime credential, genesis coordinator, keel writer, evolution path, Inspiration state, or Soul activation surface.

## Acceptance requirements

| id | requirement | proof |
| --- | --- | --- |
| `GCLI-001` | argv accepts only the exact command-specific option set | parser matrix |
| `GCLI-002` | catalog output is the exact bounded certified catalog | fixture comparison |
| `GCLI-003` | preset preview is deterministic and uses ordinary command replay | workflow parity test |
| `GCLI-004` | finalization requires the exact current preview digest | stale and substituted digest tests |
| `GCLI-005` | failed review writes no source or output directories | filesystem-negative tests |
| `GCLI-006` | successful finalization preserves the certified creation build | end-to-end fixture test |
| `GCLI-007` | output and failures do not expose rejected values or raw exception text | canary tests |
| `GCLI-008` | the shell performs no network operation and preserves historical receipts | guarded suite and receipt digests |

## Explicit exclusions

This slice does not implement freeform manual editing, a browser UI, recommendation intelligence, hosted accounts, database persistence, genesis admission, model invocation, governed evolution, Inspiration, Lunari integration, or Soul activation.
