import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from '../src/core/canonical-json.mjs';
import { sha256Text } from '../src/core/digest.mjs';
import { withLocalWorkflowOwner } from '../examples/local-artifact-workflow/owner.mjs';
import { prepareArtifactProgram } from '../examples/local-artifact-workflow/program.mjs';
import { prepareArtifactRealmFixture } from './helpers/local-artifact-realm-fixture.mjs';
import { artifactProgramDefinition } from './helpers/artifact-program-fixture.mjs';

test('artifact program source rejects changes to each pinned runner boundary before provider construction', async t => {
  const f = await prepareArtifactRealmFixture(t);
  const p = await prepareArtifactProgram({ manifestPath: f.manifestPath, expectedManifestDigest: f.manifestDigest, definition: artifactProgramDefinition() });
  const files = ['examples/local-artifact-workflow/program.mjs', 'examples/local-artifact-workflow/program-store.mjs',
    'examples/local-artifact-workflow/program-source.mjs', 'examples/local-artifact-workflow/owner.mjs',
    'examples/local-artifact-workflow/artifact.mjs', 'src/runtime/mission-program.mjs',
    'src/runtime/mission-operation-adapter.mjs', 'src/runtime/artifact-program-contracts.mjs', 'src/host/local-genesis-admission.mjs'];
  const mirror = join(f.workspace, 'owned-source-pin-fixture');
  for (const file of files) {
    const destination = join(mirror, file); await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(resolve(file), 'utf8'));
  }
  const sourceFile = 'examples/local-artifact-workflow/program-source.mjs';
  const originalURL = pathToFileURL(resolve(sourceFile));
  const mirrorPath = join(mirror, sourceFile);
  // Execute only the first-party source factory under test. Its imports use the
  // canonical verified components; its file-digest reads use isolated data copies.
  // Never edit active repository sources or execute a modified runner/store.
  const factorySource = (await readFile(mirrorPath, 'utf8')).replace(/(from\s+)(['"])(\.[^'"]+)\2/g,
    (_all, prefix, quote, relative) => `${prefix}${quote}${new URL(relative, originalURL).href}${quote}`);
  await writeFile(mirrorPath, factorySource);
  const factory = await import(pathToFileURL(mirrorPath).href);
  await assert.rejects(factory.createArtifactProgramSource({ owner: {} }), /not issued/);
  const manifest = JSON.parse(await readFile(p.programManifestPath, 'utf8'));
  manifest.sourceDescriptor = await factory.describeArtifactProgramSource(manifest.program);
  const text = `${canonicalJson(manifest)}\n`; await writeFile(p.programManifestPath, text);
  let hosts = 0;
  await withLocalWorkflowOwner({ manifestPath: f.manifestPath, expectedManifestDigest: f.manifestDigest, env: {},
    createProviderPhaseHostImpl: () => { hosts++; throw new Error('unexpected provider'); } }, async owner => {
    const options = { owner, program: manifest.program, sourceDescriptor: manifest.sourceDescriptor,
      manifestDigest: sha256Text(text), store: { manifestPath: p.programManifestPath }, getCoordinator: () => null };
    const source = await factory.createArtifactProgramSource(options);
    await assert.rejects(source.verifyCommittedSteps(), /coordinator.*authentic/);
    for (const file of files) {
      const path = join(mirror, file), original = await readFile(path, 'utf8');
      await writeFile(path, `${original}\n// controlled digest drift\n`);
      try { await assert.rejects(factory.createArtifactProgramSource(options), undefined, `${file} change must invalidate the source`); }
      finally { await writeFile(path, original); }
    }
  });
  assert.equal(hosts, 0);
});
