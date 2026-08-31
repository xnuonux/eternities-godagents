import { assertNoCredentialFields } from '../cortex/receipt-safety.mjs';
import { canonicalJson } from '../core/canonical-json.mjs';
import { sha256Value } from '../core/digest.mjs';
import { assertSchema } from '../core/schema-validator.mjs';
import {
  buildRecoverableGodskillsBindingIntent,
  verifyRecoverableGodskillsPending,
} from './recoverable-godskills-contracts.mjs';

const TOPOLOGY_PROTOCOL = 'eternities-recoverable-typed-composition-topology-v1';
const INTENT_PROTOCOL = 'eternities-recoverable-typed-composition-intent-v1';
const RECORD_PROTOCOL = 'eternities-recoverable-typed-composition-record-v1';
const PENDING_PROTOCOL = 'eternities-recoverable-typed-composition-pending-v1';
const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const RISK = new Set(['low', 'moderate', 'high']);
const EVIDENCE = new Set(['unverified', 'inferred', 'verified']);

export const RECOVERABLE_TYPED_COMPOSITION_AUTHORITY = Object.freeze({
  authorityExpanded: false,
  realmEffects: false,
  continuityAdmission: false,
  personalKeelWrite: false,
  identityOwnership: false,
  evolution: false,
  soul: false,
});

export class RecoverableTypedCompositionContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RecoverableTypedCompositionContractError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new RecoverableTypedCompositionContractError(code, message);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('object-invalid', `${label} must be an object`);
  return value;
}

function exactKeys(value, expected, label) {
  object(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('fields-invalid', `${label} fields are invalid`);
  }
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail('digest-invalid', `${label} digest is invalid`);
  return value;
}

function requireIdentifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) fail('identifier-invalid', `${label} is invalid`);
  return value;
}

function requireInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('integer-invalid', `${label} is invalid`);
  }
  return value;
}

function closedStrings(value, label, maximum = 64) {
  if (!Array.isArray(value) || value.length > maximum
      || value.some((entry) => typeof entry !== 'string' || entry.length < 1 || entry.length > 256
        || /[\0\r\n]/.test(entry))
      || new Set(value).size !== value.length) {
    fail('array-invalid', `${label} must be a bounded unique string array`);
  }
  return [...value];
}

function verifyAuthority(value) {
  exactKeys(value, [
    'availableAuthority', 'permittedEffects', 'availablePreconditions', 'maximumRisk',
    'minimumEvidenceConfidence', 'contextBudget',
  ], 'typed composition authority projection');
  const authority = {
    availableAuthority: closedStrings(value.availableAuthority, 'available authority'),
    permittedEffects: closedStrings(value.permittedEffects, 'permitted effects'),
    availablePreconditions: closedStrings(value.availablePreconditions, 'available preconditions'),
    maximumRisk: value.maximumRisk,
    minimumEvidenceConfidence: value.minimumEvidenceConfidence,
    contextBudget: value.contextBudget,
  };
  if (!RISK.has(authority.maximumRisk) || !EVIDENCE.has(authority.minimumEvidenceConfidence)) {
    fail('authority-invalid', 'typed composition authority classes are invalid');
  }
  requireInteger(authority.contextBudget, 'typed composition context budget', 1, 65_536);
  return authority;
}

function boundedRows(value, maximum, label) {
  if (!Array.isArray(value) || value.length > maximum) fail('array-invalid', `${label} is invalid`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256 || /[\0\r\n]/.test(value)) {
    fail('string-invalid', `${label} is invalid`);
  }
  return value;
}

function producer(value, label) {
  object(value, label);
  if (value.kind === 'mission-input') {
    exactKeys(value, ['kind', 'inputId'], label);
    return { kind: value.kind, inputId: requireString(value.inputId, `${label} input id`) };
  }
  if (value.kind === 'node-output') {
    exactKeys(value, ['kind', 'nodeId', 'slotId'], label);
    return {
      kind: value.kind,
      nodeId: requireString(value.nodeId, `${label} node id`),
      slotId: requireString(value.slotId, `${label} slot id`),
    };
  }
  fail('producer-invalid', `${label} kind is invalid`);
}

function producerIdentity(value) {
  return value.kind === 'mission-input'
    ? `mission-input:${value.inputId}`
    : `node-output:${value.nodeId}:${value.slotId}`;
}

function graphContainsCycle(nodes, edges) {
  const indegree = new Map(nodes.map(({ nodeId }) => [nodeId, 0]));
  const outgoing = new Map(nodes.map(({ nodeId }) => [nodeId, new Set()]));
  for (const [from, to] of edges) {
    if (!outgoing.get(from).has(to)) {
      outgoing.get(from).add(to);
      indegree.set(to, indegree.get(to) + 1);
    }
  }
  const ready = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([nodeId]) => nodeId);
  let visited = 0;
  while (ready.length > 0) {
    const current = ready.shift();
    visited += 1;
    for (const next of outgoing.get(current)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) ready.push(next);
    }
  }
  return visited !== nodes.length;
}

export function verifyRecoverableTypedCompositionTopology(value) {
  assertNoCredentialFields(value);
  assertSchema('recoverable-typed-composition-topology', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'missionId', 'authorityProjection',
    'maximumContextBytes', 'missionInputs', 'nodes', 'links', 'missionOutputs',
  ], 'recoverable typed composition topology');
  if (value.schemaVersion !== 1 || value.protocolId !== TOPOLOGY_PROTOCOL) {
    fail('topology-invalid', 'recoverable typed composition topology identity is invalid');
  }
  const missionId = requireIdentifier(value.missionId, 'typed composition mission id');
  const authorityProjection = verifyAuthority(value.authorityProjection);
  requireInteger(value.maximumContextBytes, 'typed composition byte ceiling', 1, 65_536);
  const missionInputs = boundedRows(value.missionInputs, 12, 'typed composition mission inputs').map((row, index) => {
    exactKeys(row, ['artifactId', 'typeId', 'jsonKind'], `mission input ${index}`);
    if (!['object', 'array'].includes(row.jsonKind)) fail('topology-invalid', `mission input ${index} kind is invalid`);
    return {
      artifactId: requireString(row.artifactId, `mission input ${index} artifact id`),
      typeId: requireString(row.typeId, `mission input ${index} type id`),
      jsonKind: row.jsonKind,
    };
  });
  const nodes = boundedRows(value.nodes, 3, 'typed composition nodes').map((row, index) => {
    exactKeys(row, ['nodeId', 'phase', 'capabilityId'], `composition node ${index}`);
    return {
      nodeId: requireString(row.nodeId, `composition node ${index} id`),
      phase: requireString(row.phase, `composition node ${index} phase`),
      capabilityId: requireString(row.capabilityId, `composition node ${index} capability`),
    };
  });
  if (nodes.length < 1) fail('topology-invalid', 'typed composition topology requires at least one node');
  const links = boundedRows(value.links, 24, 'typed composition links').map((row, index) => {
    exactKeys(row, ['artifactId', 'producer', 'consumer'], `composition link ${index}`);
    exactKeys(row.consumer, ['nodeId', 'slotId'], `composition link ${index} consumer`);
    return {
      artifactId: requireString(row.artifactId, `composition link ${index} artifact id`),
      producer: producer(row.producer, `composition link ${index} producer`),
      consumer: {
        nodeId: requireString(row.consumer.nodeId, `composition link ${index} consumer node`),
        slotId: requireString(row.consumer.slotId, `composition link ${index} consumer slot`),
      },
    };
  });
  const missionOutputs = boundedRows(value.missionOutputs, 12, 'typed composition outputs').map((row, index) => {
    exactKeys(row, ['outputId', 'nodeId', 'slotId'], `mission output ${index}`);
    return {
      outputId: requireString(row.outputId, `mission output ${index} id`),
      nodeId: requireString(row.nodeId, `mission output ${index} node`),
      slotId: requireString(row.slotId, `mission output ${index} slot`),
    };
  });
  const unique = (rows, field, label) => {
    if (new Set(rows.map((row) => row[field])).size !== rows.length) fail('topology-invalid', `${label} must be unique`);
  };
  unique(missionInputs, 'artifactId', 'mission input ids');
  unique(nodes, 'nodeId', 'composition node ids');
  unique(nodes, 'capabilityId', 'composition capability ids');
  unique(missionOutputs, 'outputId', 'mission output ids');
  unique(nodes, 'phase', 'composition phase owners');
  const nodeIds = new Set(nodes.map(({ nodeId }) => nodeId));
  const missionInputIds = new Set(missionInputs.map(({ artifactId }) => artifactId));
  const artifactOwners = new Map();
  const consumerBindings = new Set();
  const consumedNodeOutputs = new Set();
  const edges = [];
  for (const link of links) {
    if (!nodeIds.has(link.consumer.nodeId)) {
      fail('topology-invalid', 'composition link consumer node is unknown');
    }
    if (link.producer.kind === 'mission-input') {
      if (!missionInputIds.has(link.producer.inputId)) {
        fail('topology-invalid', 'composition mission input producer is unknown');
      }
    } else {
      if (!nodeIds.has(link.producer.nodeId)) {
        fail('topology-invalid', 'composition producer node is unknown');
      }
      edges.push([link.producer.nodeId, link.consumer.nodeId]);
      consumedNodeOutputs.add(`${link.producer.nodeId}\0${link.producer.slotId}`);
    }
    const owner = producerIdentity(link.producer);
    const knownOwner = artifactOwners.get(link.artifactId);
    if (knownOwner !== undefined && knownOwner !== owner) {
      fail('topology-invalid', `artifact ${link.artifactId} has multiple producers`);
    }
    artifactOwners.set(link.artifactId, owner);
    const consumer = `${link.consumer.nodeId}\0${link.consumer.slotId}`;
    if (consumerBindings.has(consumer)) {
      fail('topology-invalid', `input ${link.consumer.nodeId}.${link.consumer.slotId} has multiple links`);
    }
    consumerBindings.add(consumer);
  }
  if (graphContainsCycle(nodes, edges)) {
    fail('topology-invalid', 'composition graph contains a cycle');
  }
  for (const output of missionOutputs) {
    if (!nodeIds.has(output.nodeId)) {
      fail('topology-invalid', 'mission output node is unknown');
    }
    if (consumedNodeOutputs.has(`${output.nodeId}\0${output.slotId}`)) {
      fail('topology-invalid', 'mission outputs must be terminal unconsumed artifacts');
    }
  }
  const checked = {
    schemaVersion: 1,
    protocolId: TOPOLOGY_PROTOCOL,
    missionId,
    authorityProjection,
    maximumContextBytes: value.maximumContextBytes,
    missionInputs,
    nodes,
    links,
    missionOutputs,
  };
  canonicalJson(checked);
  return deepFreeze(checked);
}

function verifyCompositionRoot(value) {
  exactKeys(value, [
    'sourceCommit', 'trustRootDigest', 'policyDigest', 'capabilityLayerReceiptDigest',
    'activationTrustRootDigest', 'registryDigest',
  ], 'typed composition root');
  if (!/^[a-f0-9]{40}$/.test(value.sourceCommit ?? '')) fail('root-invalid', 'typed composition source commit is invalid');
  Object.entries(value).filter(([name]) => name !== 'sourceCommit')
    .forEach(([name, digest]) => requireDigest(digest, `typed composition ${name}`));
  return clone(value);
}

function verifyAuthorityBoundary(value) {
  if (!same(value, RECOVERABLE_TYPED_COMPOSITION_AUTHORITY)) {
    fail('authority-invalid', 'recoverable typed composition authority must remain empty');
  }
}

export function recoverableTypedCompositionSlot(missionId) {
  requireIdentifier(missionId, 'recoverable typed composition mission id');
  return sha256Value({ protocolId: INTENT_PROTOCOL, missionId });
}

export function buildRecoverableTypedCompositionIntent({
  bindingInput,
  topology,
  godskillsReleaseDigest,
  composition,
} = {}) {
  requireDigest(godskillsReleaseDigest, 'Godskills release');
  const checkedTopology = verifyRecoverableTypedCompositionTopology(clone(topology));
  const godskillsIntent = buildRecoverableGodskillsBindingIntent({
    input: clone(bindingInput),
    releaseDigest: godskillsReleaseDigest,
  });
  if (godskillsIntent.missionId !== checkedTopology.missionId) {
    fail('mission-mismatch', 'topology and Godskills binding mission identities differ');
  }
  const checkedComposition = verifyCompositionRoot(composition);
  const unsigned = {
    schemaVersion: 1,
    protocolId: INTENT_PROTOCOL,
    missionId: checkedTopology.missionId,
    godskillsReleaseDigest,
    composition: checkedComposition,
    bindingInput: clone(godskillsIntent.input),
    bindingInputDigest: godskillsIntent.inputDigest,
    topology: clone(checkedTopology),
    topologyDigest: sha256Value(checkedTopology),
    authority: clone(RECOVERABLE_TYPED_COMPOSITION_AUTHORITY),
  };
  assertNoCredentialFields(unsigned);
  return deepFreeze({ ...unsigned, intentDigest: sha256Value(unsigned) });
}

export function verifyRecoverableTypedCompositionIntent(value, {
  bindingInput = null,
  topology = null,
  godskillsReleaseDigest = null,
  composition = null,
} = {}) {
  assertNoCredentialFields(value);
  assertSchema('recoverable-typed-composition-intent', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'missionId', 'godskillsReleaseDigest', 'composition',
    'bindingInput', 'bindingInputDigest', 'topology', 'topologyDigest', 'authority', 'intentDigest',
  ], 'recoverable typed composition intent');
  const checkedTopology = verifyRecoverableTypedCompositionTopology(value.topology);
  const checkedComposition = verifyCompositionRoot(value.composition);
  const godskillsIntent = buildRecoverableGodskillsBindingIntent({
    input: clone(value.bindingInput), releaseDigest: value.godskillsReleaseDigest,
  });
  if (value.schemaVersion !== 1 || value.protocolId !== INTENT_PROTOCOL
      || value.missionId !== checkedTopology.missionId || value.missionId !== godskillsIntent.missionId
      || value.bindingInputDigest !== godskillsIntent.inputDigest
      || value.topologyDigest !== sha256Value(checkedTopology)) {
    fail('intent-binding-invalid', 'recoverable typed composition intent binding is invalid');
  }
  requireDigest(value.godskillsReleaseDigest, 'Godskills release');
  verifyAuthorityBoundary(value.authority);
  const { intentDigest, ...unsigned } = value;
  requireDigest(intentDigest, 'typed composition intent');
  if (intentDigest !== sha256Value(unsigned)) fail('intent-digest-invalid', 'typed composition intent digest mismatch');
  if (bindingInput !== null && !same(value.bindingInput, bindingInput)) fail('intent-collision', 'binding input changed');
  if (topology !== null && !same(checkedTopology, verifyRecoverableTypedCompositionTopology(topology))) {
    fail('intent-collision', 'typed composition topology changed');
  }
  if (godskillsReleaseDigest !== null && value.godskillsReleaseDigest !== godskillsReleaseDigest) {
    fail('intent-collision', 'Godskills release changed');
  }
  if (composition !== null && !same(checkedComposition, verifyCompositionRoot(composition))) {
    fail('intent-collision', 'typed composition root changed');
  }
  return value;
}

export function buildRecoverableTypedCompositionRecord({
  intent,
  binding,
  planDigest,
  methodDigest,
  activationResultDigest,
} = {}) {
  const checkedIntent = verifyRecoverableTypedCompositionIntent(intent);
  object(binding, 'recoverable Godskills binding');
  if (binding.status !== 'bound' || !binding.receipt || !binding.receipt.activation) {
    fail('composition-unavailable', 'recoverable Godskills binding is not composable');
  }
  for (const [name, value] of Object.entries({ planDigest, methodDigest, activationResultDigest })) {
    requireDigest(value, name);
  }
  const unsigned = {
    schemaVersion: 1,
    protocolId: RECORD_PROTOCOL,
    status: 'compiled',
    missionId: checkedIntent.missionId,
    intentDigest: checkedIntent.intentDigest,
    godskillsReleaseDigest: checkedIntent.godskillsReleaseDigest,
    compositionTrustRootDigest: checkedIntent.composition.trustRootDigest,
    registryDigest: checkedIntent.composition.registryDigest,
    bindingDigest: sha256Value(binding),
    bindingReceiptDigest: sha256Value(binding.receipt),
    activationResultDigest,
    planDigest,
    methodDigest,
    authorityExpanded: false,
  };
  return deepFreeze({ ...unsigned, compilationDigest: sha256Value(unsigned) });
}

export function verifyRecoverableTypedCompositionRecord(value, { intent = null } = {}) {
  assertSchema('recoverable-typed-composition-record', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'status', 'missionId', 'intentDigest',
    'godskillsReleaseDigest', 'compositionTrustRootDigest', 'registryDigest',
    'bindingDigest', 'bindingReceiptDigest', 'activationResultDigest', 'planDigest',
    'methodDigest', 'authorityExpanded', 'compilationDigest',
  ], 'recoverable typed composition record');
  if (value.schemaVersion !== 1 || value.protocolId !== RECORD_PROTOCOL
      || value.status !== 'compiled' || value.authorityExpanded !== false) {
    fail('record-invalid', 'recoverable typed composition record identity is invalid');
  }
  requireIdentifier(value.missionId, 'typed composition record mission id');
  for (const [name, digest] of Object.entries(value).filter(([name]) => name.endsWith('Digest'))) {
    requireDigest(digest, `typed composition record ${name}`);
  }
  const { compilationDigest, ...unsigned } = value;
  if (compilationDigest !== sha256Value(unsigned)) fail('record-digest-invalid', 'typed composition record digest mismatch');
  if (intent !== null) {
    const checked = verifyRecoverableTypedCompositionIntent(intent);
    if (value.missionId !== checked.missionId || value.intentDigest !== checked.intentDigest
        || value.godskillsReleaseDigest !== checked.godskillsReleaseDigest
        || value.compositionTrustRootDigest !== checked.composition.trustRootDigest
        || value.registryDigest !== checked.composition.registryDigest) {
      fail('record-binding-invalid', 'typed composition record differs from its intent');
    }
  }
  return value;
}

export function buildRecoverableTypedCompositionPending({ intent, pending } = {}) {
  const checkedIntent = verifyRecoverableTypedCompositionIntent(intent);
  const checkedPending = verifyRecoverableGodskillsPending(clone(pending));
  const unsigned = {
    schemaVersion: 1,
    protocolId: PENDING_PROTOCOL,
    status: 'pending',
    missionId: checkedIntent.missionId,
    intentDigest: checkedIntent.intentDigest,
    phase: checkedPending.phase,
    operationId: checkedPending.operationId,
    dispatchDigest: checkedPending.dispatchDigest,
    authorityExpanded: false,
  };
  requireDigest(unsigned.operationId, 'pending operation');
  requireDigest(unsigned.dispatchDigest, 'pending dispatch');
  return deepFreeze(verifyRecoverableTypedCompositionPending({
    ...unsigned, pendingDigest: sha256Value(unsigned),
  }));
}

export function verifyRecoverableTypedCompositionPending(value) {
  assertSchema('recoverable-typed-composition-pending', value);
  exactKeys(value, [
    'schemaVersion', 'protocolId', 'status', 'missionId', 'intentDigest', 'phase',
    'operationId', 'dispatchDigest', 'authorityExpanded', 'pendingDigest',
  ], 'recoverable typed composition pending projection');
  if (value.schemaVersion !== 1 || value.protocolId !== PENDING_PROTOCOL
      || value.status !== 'pending' || value.authorityExpanded !== false
      || !['route', 'activation'].includes(value.phase)) {
    fail('pending-invalid', 'recoverable typed composition pending identity is invalid');
  }
  requireIdentifier(value.missionId, 'typed composition pending mission id');
  for (const name of ['intentDigest', 'operationId', 'dispatchDigest', 'pendingDigest']) {
    requireDigest(value[name], `typed composition pending ${name}`);
  }
  const { pendingDigest, ...unsigned } = value;
  if (pendingDigest !== sha256Value(unsigned)) fail('pending-digest-invalid', 'typed composition pending digest mismatch');
  return value;
}

export function materializeRecoverableTypedCompositionPlan({ intent, binding } = {}) {
  const checked = verifyRecoverableTypedCompositionIntent(intent);
  object(binding, 'recoverable Godskills binding');
  if (binding.status !== 'bound' || !binding.receipt?.activation) {
    fail('composition-unavailable', 'recoverable Godskills binding has no activation result');
  }
  const activation = binding.receipt.activation;
  if (activation.trustRootDigest !== checked.composition.activationTrustRootDigest
      || activation.resultDigest === undefined) {
    fail('activation-mismatch', 'Godskills activation root does not match typed composition');
  }
  const selected = binding.receipt.selected?.map(({ id }) => id) ?? [];
  const topologyIds = checked.topology.nodes.map(({ capabilityId }) => capabilityId);
  if (!same([...selected].sort(), [...topologyIds].sort())) {
    fail('activation-mismatch', 'Godskills selected set differs from typed topology');
  }
  const decisions = new Map(activation.decisions?.map((decision) => [decision.selectedId, decision]) ?? []);
  if (!same([...decisions.keys()].sort(), [...topologyIds].sort())) {
    fail('activation-mismatch', 'Godskills activation decisions differ from typed topology');
  }
  const topology = checked.topology;
  return {
    schemaVersion: 1,
    protocolId: 'eternities-typed-composition-plan-v1',
    missionId: topology.missionId,
    policyDigest: checked.composition.policyDigest,
    capabilityLayerReceiptDigest: checked.composition.capabilityLayerReceiptDigest,
    activationTrustRootDigest: checked.composition.activationTrustRootDigest,
    activationResultDigest: activation.resultDigest,
    authorityProjection: clone(topology.authorityProjection),
    maximumContextBytes: topology.maximumContextBytes,
    missionInputs: clone(topology.missionInputs),
    nodes: topology.nodes.map((node) => ({
      ...clone(node),
      activationDecisionDigest: decisions.get(node.capabilityId).decisionDigest,
    })),
    links: clone(topology.links),
    missionOutputs: clone(topology.missionOutputs),
  };
}
