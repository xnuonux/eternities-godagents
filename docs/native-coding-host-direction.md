# Native coding hosts, not another coding harness

Decision: September 13, 2026. Based on main `0a1123d` and Dom's request to
give Godagents a real coding environment comparable to the current Codex host.

## What was actually limiting the experiment

The current Codex session has unrestricted local filesystem execution, network
access and an approval policy of `never`. That describes host permissions, not
unlimited authority over the user's data or external services.

The older Godagents comparison was much narrower:

| Dimension | Existing structured worker | Native coding-host direction |
| --- | --- | --- |
| Workspace | Source text serialized inside a mission | Real files retrieved using host tools |
| Source/context | `mission.objective` maximum 4,096 characters | Native context management; brief and source remain separate |
| Action | Return replacement-file JSON | Read, search, edit, run commands and tests through the host |
| Iteration | One inference, tools disabled | Native multi-turn read/edit/test/repair loop |
| Continuity | Godagent admission plus sealed proposal journal | Godagent continuity plus an explicitly associated native session |
| Permissions | Small declared effect set | Explicit host-issued profile, never authority granted by a prompt |

Evidence: `src/host/workspace-owner.mjs` serializes source into the objective;
`schemas/identity-bound-mission-vessel-request.schema.json` caps it at 4,096;
`src/transports/grok-cli-phase-process.mjs` requires `--max-turns 1`, an empty
tool list, and a tool-free system-prompt override. These were test constraints,
not measured limits of Grok, Codex, or Pi.

The Codex bound-turn implementation is useful but not a native tool integration.
`src/host/codex-bound-turn.mjs` emits `modelAuthority: proposal-only` and
`realmEffects: none`. Its recovery certificate explicitly qualifies a
deterministic injected transport, not public Codex controls or Realm effects.
Do not route a native shell through that certificate and call it covered.

## Selected architecture

Godagents provides the persistent actor, purpose, capability policy, selected
Godskills, continuity references and mission status. A mature host provides its
normal model loop, native tools, context handling, sessions and cancellation.
Use a small adapter at that boundary, not a replacement tool executor or a copy
of Codex. Keep the default host system instructions and append bounded actor
context through the host's supported interface.

Broad host access is a legitimate operator profile. Ordinary authorized work
should not acquire a separate human approval gate for every edit. Other agents
can receive narrower profiles. Neither profile may silently expand itself.
Do not claim that a working directory, text instruction, Git worktree, or Pi's
project-trust setting is an OS sandbox.

Keep credentials in the host's credential mechanism. Reuse the subscribed model
route where available. Never add paid fallback, a token proxy, global model
changes, or personal Grok keel inheritance as an incidental implementation step.

## Host choices verified locally

- **Native Grok CLI** is installed and its help exposes native tools, append-only
  `--rules`, working directory, session identity/resume, permission mode and
  native turn limits. It uses the existing subscription. This is the immediate
  tool-using feasibility experiment, not a replacement for the certified worker.
  The fetched local model catalog for `grok-4.6` advertises a 500,000-token context
  window and an 80% automatic-compaction threshold. This is provider metadata,
  not an experimentally established capacity. Maximum completion tokens are not
  specified there. The current Codex config's compaction trigger is 333,333
  tokens; no context-window override was present in that config. Do not confuse
  a compaction trigger with a model's supported context limit.
- **Pi 0.85.1** is installed as `@earendil-works/pi-coding-agent`. Its bundled
  SDK exposes `createAgentSession`, lifecycle/events, persistence and compaction.
  Its `before_agent_start` hook accepts actor context; `tool_call` can block a
  pending native action; `tool_result` observes the result. This is a strong
  first implementation target for a provider-neutral governed host adapter.
  Pi supports xAI subscription login, but `pi auth check --provider xai --model
  grok-4.6 --json --no-refresh` returned `credentials_not_configured` here.
- **Codex App Server / SDK** is the supported Codex embedding route. The public
  interface exposes native thread/turn lifecycle, working directory, sandbox and
  approval configuration. Desktop-specific plugins/tools are not automatically
  present in a standalone CLI or SDK process. The currently installed protocol
  and available credentials must be checked before claiming parity.

Sources: installed Pi `docs/sdk.md`, `docs/extensions.md`, `docs/security.md`,
`docs/providers.md`; installed `grok --help`; [Codex App Server](https://learn.chatgpt.com/docs/app-server)
and [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk), read September 13.

## Next implementation boundary and acceptance

1. Associate one verified actor and host-issued mission with one native session.
   Use a fresh, explicit native-host admission/profile. The inert projection and
   old zero-effect receipts must not become tool authorization by relabelling.
2. Project actor/method context before native inference. Leave source on disk;
   use the host's retrieval and compaction. Do not lift global model windows.
3. Use supported native action hooks for the declared integration. Prove action
   attribution, host cancellation/revocation, failure reporting and recovery.
   Unknown terminal state must not cause automatic redispatch. Shell permission
   is broad process authority, not a reliably parsed list of individual effects.
4. Run a real multi-file change, observe native reads/edits/tests and a repair
   after failure, independently rerun checks, then resume the same actor/session.
5. Only after that compare plain-host and Godagent-assisted task performance
   under equivalent model, tools, context, budget and starting source.

The native-host feasibility probe lives at
`D:/00-INDEX/operations/2026-09-13-native-grok-host`. It uses a verified inert
identity projection as context, not an activated governed tool binding. Its
results cannot certify that Godagents improves coding quality or enforces every
native effect. Historical structured-worker receipts remain unchanged.
The [feasibility closeout](audits/2026-09-13-native-grok-host-feasibility.md)
records a native-produced feature that passed independent browser checks, along
with the timeout, erroneous generated test expectation and remaining holds.

Non-goals: another agent loop, a new shell, a JSON source transport, global
permission changes, OS sandbox construction, automatic package installation,
Lunari/Soul integration, or claims that prompts alone enforce permissions.

Reconsider the host choice if its supported hooks cannot provide the required
pre-action authority check or its persisted sessions cannot establish recovery.
An unsupported host can remain a clearly labelled host-owned experiment; do not
invent receipt assurances to conceal the missing integration.
