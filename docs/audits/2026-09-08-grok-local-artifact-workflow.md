# Grok subscription local artifact workflow

## Scope

Base: `1978cac08421fc144ec281b6196c3334731267dc`.
The existing Grok portable host is now selectable as
`grok-cli-subscription-v1` in the native-only effect-bound v2 local workflow.
No kernel, provider phase protocol, Godskills body, admission rule or authority
policy changed. V1 explicitly rejects this family before creating a workspace.
Both HTTP families retain their existing paths.

## Verification

- Test-first: five scenarios failed at the missing family boundary before the
  production change. Fixture corrections accounted for the existing immutable
  effect assessment and the artifact writer's explicit `replayed` flag.
- New controlled tests: 5/5, 3344.8275 ms, exit 0.
- Combined workflow, CLI, process-recovery and Grok phase-transport tests:
  24/24, 63510.4778 ms, exit 0. The two actual process-death tests retained their
  30-second dead-owner lock grace periods.
- Independent read-only review by Banach
  `01a07e22-93d9-7c82-981e-91ea6f493e98`: no important boundary defect or blocking
  missing test. Reviewed source wiring and tests, not live model quality.
- `git diff --check` passed.

The new test uses real creation/admission, an issued portable host, a real Node
child returning synthetic provider data, effect routing, persistent mission
completion, checked artifact publication and fresh-process CLI replay. It proves
that absent effect authority causes no child call, uncertain dispatch is not
repeated, modified prepared policy fails before dispatch, and replay works without
an auth file or another child. Test-only configuration customization remains in
the fixture, not the public production interface.

## Limits and next gate

These are controlled workflow results, not a useful-task live qualification,
cross-model comparison, adaptive review qualification or product completion.
The previous live Grok result exercised only a native phase with synthetic outer
authority/vessel inputs. A full admitted useful-task call is still separate.
Full integration verification and any later live attempt must report their own
exact source, outcome and limits without rewriting historical receipts.
