# Contributing to Godagents

Start with the [project overview](README.md), [concepts](docs/concepts.md), and
[current state](docs/current-state.md). Prefer a change that makes an actual actor
workflow easier to use or more reliable, with a clear completion condition.

## Development setup

- Node.js 24 or newer and Git.
- Use an isolated branch or worktree and preserve other work already present.
- The portable demo and its regression need no package installation or credentials.
- Live hosts and cross-repository integration tests have additional prerequisites;
  follow the relevant operator guide and [local execution instructions](AGENTS.md).

Start with:

```sh
npm run demo
node --test tests/demo.test.mjs tests/foundry.test.mjs tests/journal-recovery.test.mjs tests/scheduler-arbiter.test.mjs
```

For changes to a specific host or integration, also run the corresponding tests.
The full release suite is:

```sh
node --test --test-concurrency=4
```

That full suite includes optional installed-host and Godskills fixtures. It is
not a credential-free fresh-checkout smoke test. Consult [AGENTS.md](AGENTS.md)
for Pi setup and the Godskills current-main evidence root. Do not rewrite pinned
receipts, switch another project's active checkout, or weaken assertions to make
an unavailable integration appear green.

## Changes we can evaluate

Include the problem, expected behavior, smallest coherent change, and validation.
For a bug, supply a reproduction or regression that would catch it. For docs,
try the commands and check links. For a new model or host, distinguish adapter
mechanics from live task quality and preserve the existing identity boundaries.

Runtime work should preserve explicit grants, source attribution, durable action
records, and recovery without blindly replaying uncertain effects. Imported text
must remain data; skill selection cannot expand authority.

## Source reuse

Record the exact upstream revision, files, license, and adaptation. Retain required
notices for copied code. Prefer a narrow mechanism over an additional framework
that duplicates the existing execution host. This repository currently declares
no project-wide license; proposing or adopting one requires the owner's decision.

## Reporting a problem

Use the repository's issue templates for reproducible bugs and bounded proposals.
Include the revision, Node version, host if relevant, expected result, observed
result, and redacted diagnostics. Never include credentials, private session
histories, or unreviewed sensitive source in an issue.

For a suspected security issue, use GitHub's private vulnerability reporting if
the repository exposes it. Otherwise arrange a private channel with the owner
before sharing sensitive details publicly.
