import assert from 'node:assert/strict';
import test from 'node:test';
import {canonicalJson} from '../src/core/canonical-json.mjs';
import {sha256Value} from '../src/core/digest.mjs';
import {buildGrokNativeObjectiveView, restoreGrokNativeObjectiveView} from '../src/transports/grok-native-objective-view.mjs';

// Codec tests use synthetic JSON, not a claim of admitted identity. The real
// dispatch compiler integration is covered by grok-cli-phase-protocol.test.mjs.
function input(objective = 'λ 🌙 "quoted"\n\\path '.repeat(80)) {
  return {schemaVersion:1, protocolId:'eternities-grok-cli-phase-request-v1', phase:'native',
    dispatchDigest:'a'.repeat(64), modelProjectionDigest:'b'.repeat(64),
    modelProjection:{mission:{objective, observation:{content:'untrusted'}},
      identity:{name:'example'}, authority:{grantedEffects:[]}, sectionDigests:{identity:'c'.repeat(64)}},
    missionPackage:{mission:{objective, missionId:'task-1'}, packageDigest:'d'.repeat(64),
      authority:{soul:false}}};
}
const maximumBytes = 65536;
function rehash(view) { const {viewDigest, ...unsigned} = view; view.viewDigest = sha256Value(unsigned); return view; }

test('one explicit reference losslessly round-trips unicode and escaping with detached frozen output', () => {
  const original = input();
  const text = canonicalJson(original);
  const expectedInputDigest = sha256Value(original);
  const view = buildGrokNativeObjectiveView(original,{maximumBytes});
  assert.deepEqual(view.input.missionPackage.mission.objective,{$ref:'/modelProjection/mission/objective'});
  assert.equal(view.input.modelProjection.mission.objective, original.modelProjection.mission.objective);
  assert.equal(canonicalJson(restoreGrokNativeObjectiveView(view,{expectedInputDigest,maximumBytes})),text);
  assert.equal(canonicalJson(original),text);
  assert.ok(Buffer.byteLength(canonicalJson(view)) < Buffer.byteLength(text));
  original.modelProjection.identity.name = 'changed after construction';
  assert.equal(view.input.modelProjection.identity.name, 'example');
  assert.throws(() => {view.input.modelProjection.authority.grantedEffects.push('write');}, TypeError);
  assert.throws(() => {view.input.missionPackage.mission.objective.$ref = '/elsewhere';}, TypeError);
});

test('view cannot authenticate itself or alter retained metadata even when rehashed', () => {
  const original = input();
  const expectedInputDigest = sha256Value(original);
  const valid = buildGrokNativeObjectiveView(original,{maximumBytes});
  for (const mutate of [
    v=>{v.schemaVersion=2;}, v=>{v.protocolId='unknown';}, v=>{v.extra=true;},
    v=>{v.input.missionPackage.mission.objective.$ref='/modelProjection/identity/name';},
    v=>{v.input.missionPackage.mission.objective.extra=true;},
    v=>{v.input.missionPackage.mission.objective='not a reference';},
    v=>{v.input.modelProjection.mission.objective+='changed';},
    v=>{v.input.modelProjection.identity.name='different';},
    v=>{v.input.missionPackage.authority.soul=true;},
    v=>{v.input.modelProjection.sectionDigests.identity='e'.repeat(64);},
    v=>{v.input.phase='review';}, v=>{v.input.extra=true;},
    v=>{v.inputDigest='0'.repeat(64);},
  ]) {
    const changed=structuredClone(valid); mutate(changed); rehash(changed);
    assert.throws(() => restoreGrokNativeObjectiveView(changed,{expectedInputDigest,maximumBytes}),{code:'view-invalid'});
  }
  const altered = input('other objective');
  const other = buildGrokNativeObjectiveView(altered,{maximumBytes});
  assert.throws(() => restoreGrokNativeObjectiveView(other,{expectedInputDigest,maximumBytes}),{code:'view-invalid'});
  assert.throws(() => restoreGrokNativeObjectiveView(valid,{maximumBytes}),{code:'view-invalid'});
  const badHash = structuredClone(valid); badHash.viewDigest='0'.repeat(64);
  assert.throws(() => restoreGrokNativeObjectiveView(badHash,{expectedInputDigest,maximumBytes}),{code:'view-invalid'});
});

test('only exactly equal string objectives qualify, with explicit bounded encode and decode', () => {
  for (const objective of [null, {}, '', ['objective']]) {
    assert.throws(() => buildGrokNativeObjectiveView(input(objective),{maximumBytes}),{code:'view-invalid'});
  }
  for (const other of ['different', 'e\u0301', 'é ']) {
    const original=input('é'); original.missionPackage.mission.objective=other;
    assert.throws(() => buildGrokNativeObjectiveView(original,{maximumBytes}),{code:'view-invalid'});
  }
  const original=input();
  const view=buildGrokNativeObjectiveView(original,{maximumBytes});
  const bytes=Buffer.byteLength(canonicalJson(view));
  assert.deepEqual(buildGrokNativeObjectiveView(original,{maximumBytes:bytes}),view);
  for (const limit of [bytes-1,0,-1,NaN,Infinity,1.5,undefined]) {
    assert.throws(() => buildGrokNativeObjectiveView(original,{maximumBytes:limit}),{code:'view-invalid'});
    assert.throws(() => restoreGrokNativeObjectiveView(view,{expectedInputDigest:sha256Value(original),maximumBytes:limit}),{code:'view-invalid'});
  }
});
