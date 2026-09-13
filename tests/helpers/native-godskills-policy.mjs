import { pinnedGodskillsReviewRelease } from '../../scripts/lib/pinned-godskills-review-release.mjs';
import { pinnedGodskillsRoutingExecutable } from '../../scripts/lib/pinned-godskills-routing-executable.mjs';
import { sha256Value } from '../../src/core/digest.mjs';

export function nativeSkillOptions(overrides={}) {
  const policy={schemaVersion:1,protocolId:'eternities-native-godskills-policy-v1',
    releasePin:pinnedGodskillsReviewRelease('C:/dev/eternities-godskills'),
    routingPin:pinnedGodskillsRoutingExecutable(),sourceStateEpoch:0,
    hostEnvelope:{availableAuthority:['local-read','local-write','repository-write'],
      permittedEffects:['local-read','local-write'],availablePreconditions:['repository-present','settled-outcome'],
      forbiddenCapabilities:[],maximumRisk:'moderate',minimumEvidenceConfidence:'verified',contextBudget:16000,maxCompositionSize:3},
    explicitMethodRequests:[],reviewAvailable:false,maximumDisclosureBytes:32768,...overrides};
  return {policy,expectedPolicyDigest:sha256Value(policy)};
}
export const forgeObjective='coordinate implementation tests review verification and integration for the settled release';
