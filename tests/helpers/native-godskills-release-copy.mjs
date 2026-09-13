import { cp, mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyGodskillsRoutingExecutable } from '../../src/skills/routing-executable-verifier.mjs';
import { nativeSkillOptions } from './native-godskills-policy.mjs';

// Copy only verified source closure and three selected first-party artifacts.
// Mutation tests must never alter the canonical Godskills checkout.
export async function nativeSkillReleaseCopy(t) {
  const original=nativeSkillOptions(),paths=new Set();
  const verified=await verifyGodskillsRoutingExecutable({releasePin:original.policy.releasePin,routingPin:original.policy.routingPin,
    io:{realpath,async readFile(path){paths.add(path);return readFile(path);}}});
  for(const id of ['eternities-forge','eternities-muse','eternities-athena']) {
    const capability=verified.release.capabilitiesById.get(id);
    for(const ref of [capability.entrypoint,capability.contract])paths.add(join(verified.release.root,ref.path));
  }
  const root=await mkdtemp(join(tmpdir(),'native-skill-pins-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const path of paths) {
    const dest=join(root,relative(verified.release.root,path));await mkdir(dirname(dest),{recursive:true});await cp(path,dest);
  }
  return nativeSkillOptions({releasePin:{...original.policy.releasePin,repositoryRoot:root}});
}
