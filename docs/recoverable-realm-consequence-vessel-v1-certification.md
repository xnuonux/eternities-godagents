# Recoverable Realm consequence vessel v1 certification

- status: certified
- source commit: `36cb73c3f28ff66c6d9441756c58776b0ad6821e`
- receipt digest: `ee779d33cffd7966b5b03d2f7c208cbc4ce88fda50860b85faa80cd82fb69f4f`
- fixture digest: `8c9b8434a0f0f1904dcf87903e230b25941a09e49d73a1debb6b25aa893682fb`
- focused tests: 1
- full tests: 943
- release gate: 3 bounded commands
- release focused tests: 1
- release receipt count: 51
- release head: `36cb73c3f28ff66c6d9441756c58776b0ad6821e`
- release ledger digest: `ed33c1a4d9d73165498c59b11d26032feb8fafcb17ba578eb5ab21468e0f04f3`
- release lineage digest: `04a3b7593b00003d02dc4568ec07be21c9397e159c7c5d52acd769c6c666a9ff`

This certifies the explicit local durable host seam around the verified Realm consequence executor, including admission, recovery after the meaningful local process boundaries, child idempotency and reconciliation, and terminal replay. It does not certify default vessel adoption, a live external Realm, credentials, remote exactly-once effects, rollback, delegation, scheduling, Godskills integration, or Luna integration.
