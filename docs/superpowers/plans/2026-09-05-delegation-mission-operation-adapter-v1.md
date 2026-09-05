# delegation mission-operation adapter v1 implementation plan

## goal

certify the smallest provider-neutral bridge from the bounded delegation
lifecycle to one mission-program operation step.

## steps

1. add a red test file covering source identity, body-free dispatch, exact
   budget binding, drift rejection, pending and completed projection, and
   duplicate-free recovery and replay;
2. add the coordinator's read-only description surface and implement the
   smallest source-specific adapter around the existing bounded lifecycle;
3. build a deterministic fixture and receipt validator with a parent link to
   `bounded-delegation-lifecycle-v1` and no worker bodies in durable evidence;
4. register the receipt in the append-only ledger and bind it into the
   current-head compatibility profiles without changing historical receipts;
5. run focused tests, the full suite, direct ledger and lineage gates,
   independent source review, merge the verified branch, rebuild current-head,
   and push only after all post-merge gates pass.

## non-goals

do not add nested delegation, quorum, scheduling, child processes, remote
providers, Realm effects, default launch wiring, keel or memory writes,
identity or evolution authority, Inspiration, Soul, or Lunari integration.
