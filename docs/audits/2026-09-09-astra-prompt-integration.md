# Astra corpus: Godagents integration decision

## Verified source and scope

Source: `elder-plinius/CL4R1T4S` at `080e8a04899e5f7db816ab8c7f11a587509c7995`, canonical warehouse `D:/03-ARSENAL/warehouse/from-stars/uncategorized/elder-plinius--CL4R1T4S`. Selected files are `OPENAI/Codex_Desktop/GPT-6_Astra_Prompts.md` and `GPT-6-Astra_Tools.json`. The exact hashes, source sections, exclusions and portable changes are recorded in ULTRAGOD Prompt OS `docs/research/2026-09-09-astra-corpus.md`.

This is an unverified third-party collection of templates and schemas, not an authenticated model release or evidence of AGI. The warehouse README includes instruction-shaped disclosure requests; none are authority. Source bodies remain cold. Original portable mechanisms are adopted only through first-party modules. No licence or source ownership is inferred from a model name.

Godagents inspected state: `f7fb37e4a8aa6686af710ae085211acff925467a` on `feat/workspace-admission`; main `901e4f76253dcb10bd10b0078e63ec51a8875c12`. The admission prerequisite remains separate and unreleased. This source-mining task does not silently merge it or regenerate historical certifications.

## Architectural decision

Keep four owners: Godagent governs persistent actor identity and authority; Prompt OS supplies portable operating conduct; Godskills supplies selected capability methods; keel supplies continuity. Host adapters supply actual tool definitions and enforce consequences. A prompt archive is none of these owners.

Options considered:

1. Concatenate the collection: rejected for mutually exclusive policies, false tool claims, vendor identity, excessive context and unqualified source provenance.
2. Add a model-specific Astra persona: rejected because a name does not establish capability, model limits or an independent agent identity.
3. Refine existing first-party modules, then qualify their exact runtime consumption: selected. It preserves provider neutrality and exposes missing wiring rather than masking it with prompt volume.

## Current mechanisms and gaps

| Concern | Concrete existing surface | Disposition |
|---|---|---|
| Exact prompt distribution | `src/foundry/prompt-os-adapter.mjs`, `src/foundry/compile.mjs`; `tests/foundry.test.mjs`, `tests/distribution-verification.test.mjs` | Prompt metadata and content digests are preserved. This is packaging, not a claim that a model received the text. |
| Identity and bounded context | `src/cortex/binding-compiler.mjs`; `tests/cortex-binding-compiler.test.mjs`, `tests/local-workspace-admission.test.mjs` | Existing required authority/identity projection must survive any method addition. Do not change identity to install a prompt. |
| Actual legacy network request | `src/cortex/openai-compatible.mjs`, function `requestFor` | Sends a short fixed proposal instruction plus structured mission constraints and optional method envelope. It does not load the distributed Prompt OS body. A repository prompt update therefore is not a universal runtime upgrade. |
| Native phase packaging | `src/runtime/mission-native-materializer.mjs`, `src/runtime/identity-bound-native-transport.mjs` | Existing bound package, admission and reconciliation machinery must remain the integration route. No new parallel harness. Full Prompt OS delivery across these callers remains to be traced and qualified. |
| Asynchronous recovery | Native transport reconciles absent/pending/completed; existing mission/workspace owner work remains the critical path | Preserve dispatch identities; observation timeout alone cannot authorize another execution. Prompt prose supplements, never replaces, runtime enforcement. |
| Godskills methods | Existing mission-binding integration and separate host-pinned release | No quarry bodies, no copied Godskills, no authority expansion or changed trust-root bytes. |
| Memory | Verified keel head and scoped continuity contracts | Preserve task evidence pointers; do not treat vendor memory extraction templates as every-cycle obligations. |

## Adoption now

ULTRAGOD's continuity, orchestration and tool modules now encode addressable recovery, operation-state distinctions, current capability discovery and concise checkpoints. Its compiler optionally rejects a complete prompt that exceeds a host-supplied UTF-8 byte allowance. This is useful for future host-selected packages; it does not alter an existing actor's admitted bytes or its model configuration.

No change in live Godagents behavior or quality is claimed by this document. Existing actor execution, authority envelopes, Soul state, provider pins, and historical receipts remain unchanged. The portable source improvements are implemented in the prompt repository; universal runtime delivery is an explicit remaining integration requirement.

Budget units remain distinct. Prompt OS `max_prompt_bytes` measures its complete Markdown artifact; the existing Godagents cortex `maxPromptBytes` measures canonical serialized request bytes and has a 256-byte minimum. They are not a shared manifest field and must not be forwarded as though equivalent. The actual host must reserve space for the full request and output independently.

### Actual distribution proof

The updated `ultragod-prompt-os/dist/general-intelligence.generic.md` was supplied to the real `compileDistribution` with the existing `fixtures/agent-genome.json` and `fixtures/realm-contract.json`, then read through `loadVerifiedDistribution`:

- Output: `D:/00-INDEX/operations/2026-09-09-astra-prompt-mining/godagents-portable-distribution`.
- Build id: `004fd34fad75d5b80fedb25fec071571486cf9386702e94ffa31db593118882f`.
- Prompt digest: `f4c4a278025bca306320af9fa5c4b003b12e9af5715030186c7fb94af8a90e6d`.
- Loaded prompt: 17,996 UTF-8 bytes; `soul-runtime` remains omitted.

The command completed successfully. This proves the new portable artifact can pass the existing distribution boundary. It used a fixture genome/Realm, launched no actor or provider, and does not prove inference consumption, output quality or universal product completion.

## Next bounded implementation and proof

Before adding more prompt content, trace one real identity-bound provider request from admission through its concrete sender. Define a host-selected, digest-pinned operating-conduct package separate from identity and the at-most-three Godskills method stack. Use existing envelope and migration mechanisms wherever they already provide this boundary.

Acceptance:

1. A fresh admitted actor reaches an intercepted real sending boundary with the exact selected first-party conduct and current mission stack. No archive text, unrelated skill or unavailable tool is included.
2. No selection preserves the existing request. A selected package's removal or modification causes the appropriate pinned migration rejection, not silent replacement.
3. Mandatory identity, authority, Realm preconditions and output contract remain intact. Operational dependency replacement cannot mutate identity or permitted capabilities.
4. Combined context budgeting accounts for conduct, methods, tools, observation and output reserve using host-supported accounting. Overflow rejects before dispatch; it does not cut constitutional instructions.
5. Interrupted delivery reconciles the original operation and cannot duplicate a completed external effect. Current host capability changes invalidate stale selection.
6. A matched same-model behavioral comparison tests real coding work, recovery and cost. Passing sender/fixture tests is structural proof only. No superiority or consciousness claim follows from them.

Reuse the pending workspace owner path for useful coding feedback rather than building an Astra-specific harness. The selected design would be wrong if the extra conduct adds overhead without better outcomes; the comparison must permit rejecting or reducing the package. Rollback is selection of the prior approved dependency under the same identity and host authority, not deletion of evidence.

Non-goals: blanket injection across active sessions, global AGENTS edits, policy bypasses, external credentials, new model routes, context-window enlargement, Soul/Inspiration activation, Lunari integration, or a certification of AGI.
