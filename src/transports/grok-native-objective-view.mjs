import {canonicalJson} from '../core/canonical-json.mjs';
import {sha256Value} from '../core/digest.mjs';

const PROTOCOL = 'eternities-grok-native-objective-view-v1';
const REF = '/modelProjection/mission/objective';
const DIGEST = /^[a-f0-9]{64}$/;
function fail(reason = 'invalid') {
  const error = new Error('Grok native objective view rejected');
  error.code = 'view-invalid'; error.reason = reason; throw error;
}
function object(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function keys(v, expected) {
  if (!object(v) || Object.keys(v).sort().join('\0') !== [...expected].sort().join('\0')) fail();
}
function freeze(v) {
  if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); }
  return v;
}
function bound(view, maximumBytes) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 1048576) fail();
  if (Buffer.byteLength(canonicalJson(view),'utf8') > maximumBytes) fail('over-budget');
}
function shape(input) {
  keys(input,['schemaVersion','protocolId','phase','dispatchDigest','modelProjectionDigest','modelProjection','missionPackage']);
  if (input.schemaVersion !== 1 || input.protocolId !== 'eternities-grok-cli-phase-request-v1'
      || input.phase !== 'native' || typeof input.dispatchDigest !== 'string' || !DIGEST.test(input.dispatchDigest)
      || typeof input.modelProjectionDigest !== 'string' || !DIGEST.test(input.modelProjectionDigest)
      || !object(input.modelProjection?.mission) || !object(input.missionPackage?.mission)
      || typeof input.modelProjection.mission.objective !== 'string' || !input.modelProjection.mission.objective.length) fail();
}
function checked(fn) {
  try { return fn(); }
  catch (error) { if (error?.code === 'view-invalid') throw error; fail(); }
}

// Presentation codec, not admission validation. The caller must supply an
// independently verified phase input and hold its digest outside the view.
export function restoreGrokNativeObjectiveView(value, {expectedInputDigest, maximumBytes} = {}) {
  return checked(() => {
    const view = structuredClone(value);
    keys(view,['schemaVersion','protocolId','inputDigest','input','viewDigest']);
    bound(view, maximumBytes);
    if (view.schemaVersion !== 1 || view.protocolId !== PROTOCOL
        || typeof expectedInputDigest !== 'string' || !DIGEST.test(expectedInputDigest)
        || view.inputDigest !== expectedInputDigest) fail();
    const {viewDigest, ...unsigned} = view;
    if (sha256Value(unsigned) !== viewDigest) fail();
    shape(view.input);
    const target = view.input.missionPackage.mission;
    keys(target.objective,['$ref']);
    if (target.objective.$ref !== REF) fail();
    target.objective = view.input.modelProjection.mission.objective;
    if (sha256Value(view.input) !== expectedInputDigest) fail();
    return freeze(view.input);
  });
}

export function buildGrokNativeObjectiveView(value, {maximumBytes} = {}) {
  return checked(() => {
    const input = structuredClone(value);
    shape(input);
    if (input.modelProjection.mission.objective !== input.missionPackage.mission.objective) fail();
    const inputDigest = sha256Value(input);
    input.missionPackage.mission.objective = {$ref:REF};
    const unsigned = {schemaVersion:1, protocolId:PROTOCOL, inputDigest, input};
    const view = freeze({...unsigned, viewDigest:sha256Value(unsigned)});
    restoreGrokNativeObjectiveView(view,{expectedInputDigest:inputDigest,maximumBytes});
    return view;
  });
}
