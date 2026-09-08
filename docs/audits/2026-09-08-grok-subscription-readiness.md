# Grok subscription readiness probe

## Scope and observed outcome

Dom approved Grok 4.6 through the existing subscription route as a testing
candidate alongside MiniMax. No OpenRouter or paid direct xAI fallback was used.
This was one native compatibility probe, not a Godagents-versus-native trial,
not a held-out benchmark, and not completion of the live adapter milestone.

The bridge was `C:/dev/perseus-v2/perseus-grok-cli.js`, unchanged during the probe.
The installed executable reported `grok 1.0.5 (5115b46bc9) [stable]`. Initial
readiness found the binary and auth file but expired authentication.
`ensureGrokCliReady()` used the supported native `models` operation to refresh
OAuth state. Readiness then reported `authFresh: true`. Credential values were
not printed or placed in the evidence folder.

One CLI inference invocation requested `grok-4.6`, low reasoning effort, a
4,096-token completion ceiling, an 8,192-byte prompt ceiling, a 90-second process
timeout, and a 196,608-byte output ceiling. The bridge supplied a disposable
working directory, no native tools, no subagents, no web search, one turn, and a
strict JSON schema. The synthetic request asked for `status: "ready"` and the
sum of 19 and 23. It sent no repository or user-private task content.

Observed result:

- Compatible exact two-field JSON with the correct sum, in 7,124 ms wall time.
- Completion counter was present and within the requested ceiling.
- Stop reason `end_turn`; no stderr bytes.
- Requested model was explicit. The returned top-level model field was absent,
  so provider-observed model identity was not independently available.
- The disposable credential home was removed successfully.
- One CLI invocation was recorded before dispatch. Internal provider physical
  request count is not observable here; do not call this proven one-inference
  metering or provider-side exactly-once execution.
- The bridge source digest was unchanged after execution. Its full execution
  dependency closure was not certified by this probe.

## Raw usage and limits of interpretation

The probe bypassed the bridge's zero-defaulting usage normalizer for observation,
retaining only explicitly present finite nonnegative numeric fields:

| Raw field | Observed value |
| --- | ---: |
| `usage.input_tokens` | 11737 |
| `usage.output_tokens` | 45 |
| `usage.reasoning_tokens` | 31 |
| `usage.total_tokens` | 11910 |
| `usage.cache_read_input_tokens` | 128 |
| `total_cost_usd` | 0.00404736 |

For this event, `11737 + 45 + 128 = 11910`. Cached reads are additive in that
reported arithmetic, not a demonstrated subset of `input_tokens`. One event is
not a universal definition of CLI usage semantics. A qualified adapter must
establish the versioned mapping, retain raw provenance, and reject unsupported
accounting instead of inventing zero values or silently undercounting input.
If the provider defines input as uncached input, a future validated mapping
could include cache reads in canonical total input; that is not established
solely by this arithmetic.

The tiny task still produced 11,737 reported input tokens. The native CLI has an
additional prompt envelope, so direct HTTP and CLI input contexts must not be
declared identical. Compare native and Godagent arms through the same qualified
provider path and report the actual overhead.

The cost field is a provider-reported estimate, not independent proof of an
additional subscription charge. Subscription headroom, unlimited access, and
billing semantics remain unverified. No additional calls were made to resolve
these observations.

## Evidence

Local evidence root:
`D:/00-INDEX/operations/2026-09-08-controlled-comparison-integration/`

- `grok-readiness-probe.mjs`: one-shot diagnostic script, syntax-checked before
  execution. It refuses an existing attempt directory and has no retry loop.
- `grok-readiness-probe-1/intent.json`:
  SHA-256 `3ea91e6e0f6d139e091d2b3b569899b8c813ce662eb2200c7365628943ea2b2a`.
- `grok-readiness-probe-1/dispatch.json`: pre-invocation local dispatch record.
- `grok-readiness-probe-1/result.json`:
  SHA-256 `fb2cd00031bbb6f643041b40fedc69a6ba0f95b071c0fee951ac1ceedbcd36a4`.

The script is a diagnostic, not a production adapter. Native auth refresh is a
real local credential-state change; credentials themselves were neither logged
nor committed. Prior comparison receipts and the MiniMax failed trial remain
unchanged. MiniMax remains a candidate, not a failed-quality conclusion.

## Next bounded integration boundary

Reuse the existing governed mission semantics and durable dispatch machinery;
do not disguise the CLI as an HTTPS endpoint or build a second agent runtime.
The implicated seams are `src/transports/provider-neutral-phase-semantics.mjs`,
`src/transports/durable-phase-operation.mjs`, and
`src/sdk/portable-phase-host.mjs`. The durable engine currently has network-shaped
response and scalar-credential expectations, while the portable host requires
all three genuine phase ports. Those contracts require an explicit design
decision before a native-only CLI can honestly claim compatibility.

Acceptance must demonstrate a real admitted mission, terminal artifact and
receipt verification, reuse without redispatch, durable uncertainty after an
interrupted subprocess, credential-safe evidence, and versioned raw usage
mapping. A current runtime/compiler/source binding and a separately frozen fair
comparison task remain prerequisites for the live two-arm quality claim.
