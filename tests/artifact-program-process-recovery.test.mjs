import test from 'node:test';
import assert from 'node:assert/strict';
import { fork, spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { sha256Value } from '../src/core/digest.mjs';
import { prepareArtifactProgram } from '../examples/local-artifact-workflow/program.mjs';
import { prepareOperatorArtifactFixture } from './helpers/operator-artifact-fixture.mjs';
import { artifactProgramDefinition } from './helpers/artifact-program-fixture.mjs';

const harness = fileURLToPath(new URL('./helpers/artifact-program-recovery-child.mjs', import.meta.url));
const cli = fileURLToPath(new URL('../examples/local-artifact-workflow/cli.mjs', import.meta.url));
const witness = new URL('./helpers/local-workflow-network-witness.mjs', import.meta.url).href;
function environment() {
  return Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']
    .filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]));
}
function childRun(p, boundary) {
  const child = fork(harness, [], { windowsHide: true, env: environment(), execArgv: ['--import', witness],
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const closed = once(child, 'close'), calls = [], attempts = [];
  const outcome = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('owned program child timed out')); }, 30000);
    const finish = (error, value) => { clearTimeout(timer); error ? reject(error) : resolve(value); };
    child.once('error', error => finish(error));
    child.once('exit', () => finish(new Error('owned program child exited before its outcome')));
    child.on('message', message => {
      if (message.event === 'provider-call') calls.push(message);
      else if (message.event === 'network-attempt') attempts.push(message);
      else if (['kill-boundary', 'completed'].includes(message.event)) finish(null, message);
      else finish(new Error(`owned program child failed: ${message.code ?? 'unknown'}`));
    });
  });
  child.send({ ...p, boundary });
  return { child, closed, calls, attempts, outcome };
}
async function freshCli(p, credential = false) {
  const child = spawn(process.execPath, ['--import', witness, cli, 'program-run', '--program', p.programManifestPath,
    '--program-digest', p.programManifestDigest], { windowsHide: true,
    env: { ...environment(), ...(credential ? { GODAGENT_TEST_PHASE_KEY: 'synthetic-program-recovery-key' } : {}) },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let stdout = '', stderr = ''; const attempts = [];
  child.on('message', message => attempts.push(message));
  child.stdout.on('data', data => { stdout += data; if (stdout.length + stderr.length > 65536) child.kill('SIGKILL'); });
  child.stderr.on('data', data => { stderr += data; if (stdout.length + stderr.length > 65536) child.kill('SIGKILL'); });
  const timer = setTimeout(() => child.kill('SIGKILL'), 30000);
  try {
    const [code, signal] = await once(child, 'close');
    assert.equal(signal, null); assert.deepEqual(attempts, []);
    return { code, stdout, stderr };
  } finally { clearTimeout(timer); }
}

for (const boundary of ['first-completion-persisted', 'second-dispatch-uncertain']) {
  test(`fresh public-creator program survives real process death at ${boundary}`, { timeout: 180000 }, async t => {
    const f = await prepareOperatorArtifactFixture(t);
    const rootFiles = ['workflow.json', 'mission-request.json', 'identity-policy.json', 'provider-policy.json'];
    const originals = await Promise.all(rootFiles.map(name => readFile(join(f.workspace, name), 'utf8')));
    const p = await prepareArtifactProgram({ manifestPath: f.manifestPath, expectedManifestDigest: f.manifestDigest, definition: artifactProgramDefinition() });
    const programText = await readFile(p.programManifestPath, 'utf8');
    const binding = JSON.parse(programText).program.sourceBinding;
    const genesis = JSON.parse(await readFile(join(f.workspace, 'admission/transaction/genesis-receipt.json'), 'utf8'));
    assert.equal(binding.genesisId, genesis.genesisId); assert.equal(binding.keelId, genesis.keelId);
    assert.equal(binding.actor.genomeDigest, genesis.genomeValueDigest);
    assert.equal(binding.actor.keelHeadDigest, genesis.keelHeadDigest);
    assert.equal(binding.creationBuildId, f.creation.manifest.buildId);
    assert.equal(binding.distributionBuildId, f.distribution.manifest.buildId);
    assert.deepEqual(f.creation.genome.soulPort, { schemaVersion: 1, status: 'dormant' });
    const run = childRun(p, boundary);
    let continued;
    try {
      assert.deepEqual(await run.outcome, { event: 'kill-boundary', boundary, phase: 'native',
        stepId: boundary === 'first-completion-persisted' ? 'first' : 'second' });
      assert.deepEqual(run.attempts, []);
      assert.deepEqual(run.calls.map(c => c.stepId), boundary === 'first-completion-persisted' ? ['first'] : ['first', 'second']);
      if (boundary === 'second-dispatch-uncertain') assert.equal(run.calls[1].parentSeen, true);
      const lockPath = join(f.workspace, 'workflow-run.lock');
      const owner = await readFile(lockPath, 'utf8'); assert.equal(JSON.parse(owner).pid, run.child.pid);
      const programLockPath = join(dirname(p.programManifestPath), 'coordinator/programs', p.programId, 'operation.lock');
      const programOwner = await readFile(programLockPath, 'utf8'); assert.equal(JSON.parse(programOwner).pid, run.child.pid);
      const firstResolutionPath = join(dirname(p.programManifestPath), 'resolutions', `${sha256Value('first')}.json`);
      const firstResolution = await readFile(firstResolutionPath, 'utf8');
      if (boundary === 'first-completion-persisted') await assert.rejects(readdir(join(f.workspace, 'artifacts')), { code: 'ENOENT' });
      else assert.equal((await readdir(join(f.workspace, 'artifacts'))).length, 1);
      assert.equal(run.child.kill('SIGKILL'), true);
      const [code, signal] = await run.closed;
      assert.ok(signal === 'SIGKILL' || code !== 0);
      const deadAt = Date.now();
      assert.equal(await readFile(lockPath, 'utf8'), owner);
      const immediate = await freshCli(p);
      assert.equal(immediate.code, 1); assert.equal(immediate.stdout, '');
      assert.equal(await readFile(lockPath, 'utf8'), owner);
      assert.equal(await readFile(programLockPath, 'utf8'), programOwner);
      await delay(Math.max(0, deadAt + 30200 - Date.now()));
      if (boundary === 'first-completion-persisted') {
        continued = childRun(p, 'continue');
        const recovered = await continued.outcome;
        assert.equal(recovered.event, 'completed'); assert.equal(recovered.result.status, 'completed');
        assert.deepEqual(continued.calls, [{ event: 'provider-call', stepId: 'second', parentSeen: true }]);
        assert.deepEqual(continued.attempts, []);
        assert.equal((await continued.closed)[0], 0);
        const result = recovered.result;
        assert.equal(result.instanceId, f.instanceId); assert.equal(result.usage.completionTokens, 40);
        assert.equal(result.resultBytes, result.results.reduce((n, s) => n + s.artifact.bytes, 0));
        assert.equal(JSON.parse(await readFile(result.results[0].artifact.path, 'utf8')).content, 'ALPHA_7');
        assert.equal(JSON.parse(await readFile(result.results[1].artifact.path, 'utf8')).content, 'ALPHA_7_BETA_9');
        assert.notEqual(result.results[0].missionId, result.results[1].missionId);
        const replay = await freshCli(p, true);
        assert.equal(replay.code, 0); assert.equal(replay.stderr, '');
        assert.equal(JSON.parse(replay.stdout).aggregateDigest, result.aggregateDigest);
      } else {
        for (const credential of [false, true]) {
          const recovered = await freshCli(p, credential);
          assert.equal(recovered.code, 3); assert.equal(recovered.stderr, '');
          const result = JSON.parse(recovered.stdout);
          assert.equal(result.status, 'pending'); assert.deepEqual(result.pendingStepIds, ['second']);
          assert.equal(result.instanceId, f.instanceId);
        }
      }
      await assert.rejects(readFile(lockPath), { code: 'ENOENT' });
      await assert.rejects(readFile(programLockPath), { code: 'ENOENT' });
      assert.equal(await readFile(firstResolutionPath, 'utf8'), firstResolution);
      assert.equal(await readFile(p.programManifestPath, 'utf8'), programText);
      assert.deepEqual(await Promise.all(rootFiles.map(name => readFile(join(f.workspace, name), 'utf8'))), originals);
      assert.equal(JSON.parse(await readFile(join(f.workspace, 'admission/transaction/genesis-receipt.json'), 'utf8')).receiptDigest, genesis.receiptDigest);
    } finally {
      for (const owned of [run, continued].filter(Boolean)) {
        if (owned.child.exitCode === null && owned.child.signalCode === null) owned.child.kill('SIGKILL');
        await owned.closed;
      }
    }
  });
}
