import { link, lstat, open, rename, rm } from 'node:fs/promises';

async function destinationExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function writeSyncedPending(path, content) {
  let handle;
  try {
    handle = await open(path, 'wx');
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle?.close();
  }
}

export async function publishFileExclusive({ destinationPath, content }) {
  const pendingPath = `${destinationPath}.writing`;
  await rm(pendingPath, { force: true });
  if (await destinationExists(destinationPath)) return false;
  try {
    await writeSyncedPending(pendingPath, content);
    try {
      await link(pendingPath, destinationPath);
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') return false;
      throw error;
    }
  } finally {
    await rm(pendingPath, { force: true });
  }
}

export async function replaceFileAtomically({ destinationPath, content }) {
  const pendingPath = `${destinationPath}.writing`;
  await rm(pendingPath, { force: true });
  try {
    await writeSyncedPending(pendingPath, content);
    await rename(pendingPath, destinationPath);
  } finally {
    await rm(pendingPath, { force: true });
  }
}
