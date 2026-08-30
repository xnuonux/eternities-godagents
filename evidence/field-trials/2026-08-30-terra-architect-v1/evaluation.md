# Terra architecture field trial v1 evaluation

## Result

The receipt-bound Godagent result wins narrowly, **44 to 43 out of 45**. Both Terra subjects produced strong, implementation-ready architecture. The measured advantage is meaningful but not yet causal proof because this is one mission and one run per condition.

| Dimension | Godagent + `eternities-architect` | Plain Terra | Evidence-based judgment |
| --- | ---: | ---: | --- |
| Requirement coverage | 5 | 5 | Both cover the requested hosts, alternatives, decision, interfaces, recovery, verification, non-goals, and handoff. |
| Repository grounding | 5 | 5 | Both provide valid local citations. Automated checking found 36 of 36 valid Godagent citations and 39 of 39 valid control citations. |
| Decision quality | 5 | 5 | Both compare three options, choose the session-scoped bridge, state tradeoffs, and name revisit conditions. |
| Boundary precision | 5 | 4 | The Godagent separates `HostAuthorityPort`, invocation capsule, native adapter, ledger, and verifier. The control treats the bridge mainly as a cortex adapter and does not require a host-observed effective-authority attestation. |
| Failure and recovery | 5 | 5 | Both fail closed, preserve exact package rehydration, and prevent uncertain delivery from silently executing twice. |
| Verification quality | 5 | 5 | Both provide ten adversarial, testable cases and preserve existing regressions. |
| Authority discipline | 5 | 4 | The Godagent makes absent host authority observation a launch refusal. The control preserves policy authority but leaves effective host permission observation implicit. |
| Implementation handoff | 5 | 5 | Both produce ordered bounded slices with clear verification surfaces. |
| Clarity and efficiency | 4 | 5 | The control reaches nearly the same result in about 2,060 words versus about 2,783 words. |
| **Total** | **44** | **43** | **Godagent wins narrowly.** |

## Distinguishing findings

The Godagent's strongest unique contribution is the rule that a profile or caller assertion cannot stand in for the host's effective authority. Codex, Claude Code, or Lunari must expose a verifiable session-specific authority observation, otherwise that host profile remains disabled. This closes a real gap between method injection and governed execution.

The plain control's strongest unique contribution is its direct inspection of the existing Godskills profile mechanism. It correctly identifies that the current junction-based global activation path conflicts with the mission and must not be reused. It is also materially more concise.

Neither result makes a major unsupported current-host compatibility claim. Both explicitly mark native Codex, Claude Code, and Lunari invocation and recovery interfaces as unknown and gate implementation on evidence.

## Trial integrity

- Both subjects used `gpt-5.6-terra` with high reasoning.
- Both received the same mission and repository access.
- The Godagent subject alone received the certified package selecting `eternities-architect` with package digest `1dd76261b10b826e77258388133bb623ce4edd1750f0705445a01e9519e08ddf`.
- The control was prohibited from reading the binding, selected skill body, capability contract, or Godagent result.
- The result files have disjoint write paths and all repository source files remained unchanged.
- Approximate completion from trial-file creation: control 3 minutes 24 seconds; Godagent final write 5 minutes 11 seconds.
- Godagent result SHA-256: `ea18cd1918199162993478a17afa3a52452214c3d881ad703430d91ea7784dcd`.
- Control result SHA-256: `522e0d3ffe1102ce5738d149929fad4b2ef1d5b03b6411fb1963462d22d9c7ec`.

## Interpretation and next gate

This run establishes that the certified router can select and bind a real Godskill for a commandless mission and that Terra can follow the resulting method envelope without authority drift. It does not establish a general quality advantage yet. A stronger claim requires a small crossed suite spanning implementation, investigation, recovery, and creative product work, with order randomized and at least three matched missions.

The architecture produced here should remain evidence, not become implementation automatically. Its first hard gate is verifying whether each named host can expose a session-local input path, effective-authority observation, and idempotent completion status without global configuration mutation.
