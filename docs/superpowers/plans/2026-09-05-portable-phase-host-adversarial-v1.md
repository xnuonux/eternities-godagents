# portable phase-host adversarial campaign v1 implementation plan

1. add the design, fixture-builder, certification-builder, test, and receipt
   paths without changing the portable host protocol;
2. write focused tests first for forged hosts, descriptor drift, authority and
   credential-shaped input, post-construction pinning, exact public surface,
   and inert provider-wrapper construction;
3. build a deterministic body-free fixture containing only case ids,
   dispositions, and aggregate proof metrics;
4. add a source-bound certification receipt that pins the fixture, manifests,
   focused/full/release test runs, and the prior portable phase-host receipt;
5. register the receipt in the certification ledger and add a current-head
   compatibility profile that changes only when the new receipt is committed;
6. update README and architecture with the exact proof boundary and explicit
   non-goals;
7. run focused tests, the complete suite, source certification, current-head
   rebuild, and all post-push certification gates before integration.

non-goals: no live provider request, no new transport, no SDK API expansion,
no credential loading, no Realm effect, no scheduler, no keel or memory write,
no identity or evolution behavior, and no Lunari integration.
