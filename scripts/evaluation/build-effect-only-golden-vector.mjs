// Independent interoperability vector, deliberately imports no runtime code.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const subject = JSON.parse(await readFile(new URL('../../fixtures/effect-only-subject-v2.json', import.meta.url)));
const canonical = value => JSON.stringify(order(value));
function order(value) {
  if (Array.isArray(value)) return value.map(order);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, order(value[key])]));
  return value;
}
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const producerDescriptor = {
  schemaVersion: 1, protocolId: 'eternities-structured-effect-producer-v1',
  producerId: 'local-artifact-output-v1', operation: 'publish-local-artifact',
  routeMode: 'effect-only', requestedEffects: ['local-read', 'local-write'],
};
const subjectDigest = hash(subject);
const producerDescriptorDigest = hash(producerDescriptor);
const effectAssessment = {
  protocolId: 'eternities-requested-effects-v1', subjectDigest, state: 'known',
  requestedEffects: ['local-read', 'local-write'], unresolvedDecisions: [], producerDescriptorDigest,
};
const request = {
  schemaVersion: 2, requestId: subject.mission.missionId, text: subject.mission.objective,
  context: subject.hostCeiling, routeMode: 'effect-only', effectAssessment,
};
const requestDigest = hash(request);
const vector = {
  schemaVersion: 1, producerDescriptor, subject, effectAssessment, request,
  expectedSource: { subjectDigest, producerDescriptorDigest, requestDigest },
  digests: { subjectDigest, producerDescriptorDigest, assessmentDigest: hash(effectAssessment), requestDigest },
  expected: { status: 'no-qualified-route', reasonCode: 'effect-only-no-skill-requested',
    requestedEffects: ['local-read', 'local-write'], unresolvedDecisions: [] },
};
await writeFile(new URL('../../fixtures/effect-only-golden-vector-v2.json', import.meta.url), `${canonical(vector)}\n`);
console.log(JSON.stringify(vector.digests));
