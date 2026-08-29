import { verifyGenesisReceipt } from '../genesis/verify.mjs';
import { createVessel } from './vessel.mjs';

function assertRuntime(runtime) {
  if (!runtime || typeof runtime !== 'object') throw new TypeError('persistent vessel runtime is required');
  if (!runtime.cortex || typeof runtime.cortex.adapterId !== 'string') throw new TypeError('runtime cortex is required');
  if (!runtime.realm || typeof runtime.realm.observe !== 'function') throw new TypeError('runtime Realm is required');
  if (typeof runtime.godskillsTransport !== 'function') throw new TypeError('Godskills transport is required');
  if (typeof runtime.clock !== 'function') throw new TypeError('runtime clock is required');
}

export async function createPersistentVessel({ genesis, runtime, keelAdapter }) {
  if (!genesis || typeof genesis !== 'object') throw new TypeError('admitted genesis inputs are required');
  assertRuntime(runtime);

  async function wake() {
    return verifyGenesisReceipt({ ...genesis, keelAdapter });
  }

  const genesisReceipt = await wake();
  const vessel = await createVessel({
    distributionDir: genesis.distributionDir,
    instanceId: genesis.instanceId,
    journalPath: genesis.journalPath,
    snapshotPath: genesis.snapshotPath,
    cortex: runtime.cortex,
    realm: runtime.realm,
    godskillsTransport: runtime.godskillsTransport,
    clock: runtime.clock,
    inferencePolicy: runtime.inferencePolicy ?? null,
  });

  function inspect() {
    const runtimeState = vessel.inspect();
    return structuredClone({
      ...runtimeState,
      persistent: true,
      genesisId: genesisReceipt.genesisId,
      keelId: genesisReceipt.keelId,
      creationBuildId: genesisReceipt.creationBuildId,
      distributionBuildId: genesisReceipt.distributionBuildId,
      genomeValueDigest: genesisReceipt.genomeValueDigest,
      genomeContentDigest: genesisReceipt.genomeContentDigest,
    });
  }

  async function runCycle(mission) {
    await wake();
    return vessel.runCycle(mission);
  }

  async function recover() {
    await wake();
    return vessel.recover();
  }

  async function replaceCortex(nextCortex) {
    await wake();
    return createPersistentVessel({
      genesis,
      runtime: { ...runtime, cortex: nextCortex },
      keelAdapter,
    });
  }

  return Object.freeze({
    genesisReceipt,
    inspect,
    runCycle,
    recover,
    replaceCortex,
  });
}
