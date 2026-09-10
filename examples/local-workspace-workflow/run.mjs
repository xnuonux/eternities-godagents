import { openLocalWorkspaceHost } from '../../src/host/local-workspace-host.mjs';

if (process.argv.length !== 3) {
  process.stderr.write('usage: node examples/local-workspace-workflow/run.mjs <operator-host.json>\n');
  process.exitCode = 2;
} else {
  try {
    const host = await openLocalWorkspaceHost({ configPath: process.argv[2] });
    process.stdout.write(`${JSON.stringify(await host.run(), null, 2)}\n`);
  } catch (error) {
    // No provider response, credential, nested error or environment is printed.
    process.stderr.write(`workspace run stopped: ${error.code ?? error.name ?? 'error'}\n`);
    process.exitCode = 1;
  }
}
