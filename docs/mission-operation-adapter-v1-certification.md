# Descriptor-bound mission-operation adapter v1 certification

- status: certified
- source commit: `ab8802eda313fc1456ccf4f9fdde9cfc3b533059`
- receipt digest: `088ef6a2e2922cf166a52362d0d97706e8d3949e3fd005eb126501c1f584f33c`
- fixture digest: `9147db167dfaa56ad9156b733c3ca7fba722666fab7b6c01581d04de8003fe71`
- focused tests: 9
- full tests: 1029
- release gate: 3 bounded commands
- release focused tests: 2
- release receipt count: 61
- release head: `ab8802eda313fc1456ccf4f9fdde9cfc3b533059`
- release ledger digest: `4b9257f4670d021e0fe62e7208d09e60c588c5703bf136cf004d3b1f800a5ec8`
- release lineage digest: `188b63f368c4e983604b18744f8921aa2b0b4e99cb8fa36a02aef8d766337984`

This certifies a provider-neutral, descriptor-bound migration boundary that projects one exact mission-program dispatch into a bounded body-free request, revalidates the source descriptor before every call, preserves explicit reconcile and pending states, and emits a compact receipt without authority expansion. It does not certify a live provider, Realm, Godskills, delegation, review, host SDK, hosted durability, or Lunari integration.
