# Recoverable Realm consequence vessel v1 certification

- status: certified
- source commit: `295d4451f3ac0fdcff636c4de28c2127075fb4a4`
- receipt digest: `881fa74f123826f84feaff8532f1204229a4ff9ec05bb148b9c50cd6d7e1ab30`
- fixture digest: `8c9b8434a0f0f1904dcf87903e230b25941a09e49d73a1debb6b25aa893682fb`
- focused tests: 1
- full tests: 941
- release gate: 3 bounded commands
- release focused tests: 1
- release receipt count: 51
- release head: `295d4451f3ac0fdcff636c4de28c2127075fb4a4`
- release ledger digest: `19b1a3c78dfac3daeaa19886ec2d28d188de9b4ee4286d3a1bfaf0550cf8eb5e`
- release lineage digest: `0839393c9aafe95f2b1048ad8ebed3b8370b03a89d00a4d90524f61d17b37740`

This certifies the explicit local durable host seam around the verified Realm consequence executor, including admission, recovery after the meaningful local process boundaries, child idempotency and reconciliation, and terminal replay. It does not certify default vessel adoption, a live external Realm, credentials, remote exactly-once effects, rollback, delegation, scheduling, Godskills integration, or Luna integration.
