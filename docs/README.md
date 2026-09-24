# Godagents documentation

Choose the guide for the task you want to perform. The [project front page](../README.md)
is the concise introduction; historical implementation detail lives separately.

## Start here

| I want to… | Read |
| --- | --- |
| Run the first example | [Quickstart](quickstart.md) |
| Understand the design | [Concepts and boundaries](concepts.md) |
| Know what is demonstrated and what remains | [Current state](current-state.md) and [roadmap](roadmap.md) |
| Contribute a focused change | [Contributor guide](../CONTRIBUTING.md) |

## Use and integrate

- [Creator and local admission](superpowers/specs/2026-08-29-local-creation-admission-shell.md)
- [Native Pi operator: prepare, preflight, launch, resume, status, history](native-pi-operator.md)
- [Native Pi session binding](native-pi-session.md)
- [Optional native Godskills consumer](native-godskills-consumer.md)
- [Local artifact workflow](local-artifact-workflow.md)
- [Workspace owner and checked export](workspace-owner.md)
- [Read-only workspace export inspector](../examples/workspace-export-inspector/README.md)
- [Public SDK exports](../src/sdk/index.mjs) and [native SDK exports](../src/sdk/native-pi.mjs)

## Design and evidence

- [Technical architecture](architecture.md)
- [Native coding-host direction](native-coding-host-direction.md)
- [Dated implementation audits](audits/)
- [Historical implementation reference](reference/implementation-ledger.md)
- [Schemas](../schemas/) and [test cases](../tests/)
- [Warehouse source notes for this refinement](audits/2026-09-23-presentation-refinement.md)

Historical documents may contain workstation-specific paths and old status
statements. Use their revision and audit context. Start with the quickstart for
portable commands and the current operator guide for live-host setup.
