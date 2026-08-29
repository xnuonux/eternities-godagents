(() => {
  'use strict';

  const sessionToken = globalThis.__GODAGENT_LOCAL__?.sessionToken;
  const svgNamespace = `http${'://'}www.w3.org/2000/svg`;
  const state = { catalog: null, presetRef: null, preview: null, busy: false };
  const ui = Object.freeze({
    presetList: document.querySelector('#preset-list'),
    presetTemplate: document.querySelector('#preset-card-template'),
    creatorRef: document.querySelector('#creator-ref'),
    previewButton: document.querySelector('#preview-button'),
    pathStatus: document.querySelector('#path-status'),
    catalogDigest: document.querySelector('#catalog-digest'),
    footerProof: document.querySelector('#footer-proof'),
    designation: document.querySelector('#agent-designation'),
    halo: document.querySelector('#concordance-halo'),
    haloSpokes: document.querySelector('#halo-spokes'),
    haloCaption: document.querySelector('#halo-caption'),
    attributes: document.querySelector('#attribute-values'),
    emptyReview: document.querySelector('#empty-review'),
    reviewContent: document.querySelector('#review-content'),
    selectionLedger: document.querySelector('#selection-ledger'),
    exclusionList: document.querySelector('#exclusion-list'),
    previewDigest: document.querySelector('#preview-digest'),
    reviewAck: document.querySelector('#review-ack'),
    forgeButton: document.querySelector('#forge-button'),
    forgeResult: document.querySelector('#forge-result'),
    buildId: document.querySelector('#build-id'),
    globalStatus: document.querySelector('#global-status'),
  });
  const failureMessages = Object.freeze({
    'body-invalid': 'The creator request was not accepted.',
    'library-invalid': 'The configured creation library did not verify.',
    'operation-failed': 'The forge could not complete this operation.',
    'preview-digest-mismatch': 'The reviewed design changed. Preview it again before forging.',
    'preview-not-ready': 'This creation path is not ready to forge.',
    'preset-unavailable': 'This creation path is no longer available.',
    'review-confirmation-invalid': 'The review confirmation expired. Review and acknowledge the preview again.',
    'session-invalid': 'The local forge session expired. Restart the creator.',
    'transaction-occupied': 'This reviewed build already exists in the workspace.',
    'workspace-boundary-invalid': 'The configured forge workspace did not pass its boundary check.',
    'workflow-input-invalid': 'The creator identity or path is invalid.',
  });

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svgElement(name, attributes, className) {
    const node = document.createElementNS(svgNamespace, name);
    if (className) node.setAttribute('class', className);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  }

  function titleFromRef(ref) {
    const body = ref.includes(':') ? ref.split(':').slice(1).join(':') : ref;
    return body.split('@')[0].split('-').map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(' ');
  }

  function shortDigest(value) {
    return value ? `${value.slice(0, 12)}…${value.slice(-8)}` : 'unavailable';
  }

  function setStatus(node, message, tone = 'neutral') {
    node.textContent = message;
    node.dataset.tone = tone;
  }

  async function api(path, { method = 'GET', body } = {}) {
    const headers = { 'x-godagent-local-session': sessionToken };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      credentials: 'same-origin',
    });
    const value = await response.json();
    if (!response.ok) {
      const failure = new Error('creator request failed');
      failure.code = value.code;
      throw failure;
    }
    return value;
  }

  function clearReview() {
    state.preview = null;
    ui.emptyReview.hidden = false;
    ui.reviewContent.hidden = true;
    ui.forgeResult.hidden = true;
    ui.reviewAck.checked = false;
    ui.reviewAck.disabled = true;
    ui.forgeButton.disabled = true;
    ui.selectionLedger.replaceChildren();
    ui.exclusionList.replaceChildren();
    ui.attributes.replaceChildren();
    ui.haloSpokes.replaceChildren();
    ui.previewDigest.textContent = 'unavailable';
    ui.designation.textContent = state.presetRef ? titleFromRef(state.presetRef) : 'Select a path to begin';
    ui.haloCaption.textContent = 'Derived attributes appear after a compatible preview.';
    setStatus(ui.globalStatus, '');
  }

  function updateActions() {
    const creatorValid = ui.creatorRef.checkValidity();
    ui.previewButton.disabled = state.busy || !state.presetRef || !creatorValid;
    ui.forgeButton.disabled = state.busy || !state.preview || state.preview.status !== 'ready' || !ui.reviewAck.checked;
  }

  function selectPreset(ref) {
    state.presetRef = ref;
    for (const button of ui.presetList.querySelectorAll('.preset-card')) {
      button.setAttribute('aria-checked', String(button.dataset.ref === ref));
      button.tabIndex = button.dataset.ref === ref ? 0 : -1;
    }
    clearReview();
    setStatus(ui.pathStatus, `${titleFromRef(ref)} selected. Preview to resolve its full architecture.`);
    updateActions();
  }

  function renderPresets() {
    ui.presetList.replaceChildren();
    state.catalog.presets.forEach((preset, index) => {
      const fragment = ui.presetTemplate.content.cloneNode(true);
      const button = fragment.querySelector('.preset-card');
      button.dataset.ref = preset.ref;
      button.querySelector('.preset-index').textContent = String(index + 1).padStart(2, '0');
      button.querySelector('.preset-name').textContent = titleFromRef(preset.ref);
      button.querySelector('.preset-meta').textContent = `${preset.choiceCount} sealed choices · ${shortDigest(preset.sourceDigest)}`;
      button.addEventListener('click', () => selectPreset(preset.ref));
      button.addEventListener('keydown', (event) => {
        if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
        event.preventDefault();
        const cards = [...ui.presetList.querySelectorAll('.preset-card')];
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const next = cards[(cards.indexOf(button) + direction + cards.length) % cards.length];
        selectPreset(next.dataset.ref);
        next.focus();
      });
      ui.presetList.append(fragment);
    });
    if (state.catalog.presets[0]) selectPreset(state.catalog.presets[0].ref);
  }

  function polar(radius, angle) {
    const radians = (angle * Math.PI) / 180;
    return { x: 260 + Math.cos(radians) * radius, y: 260 + Math.sin(radians) * radius };
  }

  function renderHalo(attributes) {
    ui.haloSpokes.replaceChildren();
    ui.attributes.replaceChildren();
    const rows = Object.entries(attributes).sort(([left], [right]) => left.localeCompare(right));
    rows.forEach(([name, value], index) => {
      const angle = -90 + (360 / rows.length) * index;
      const start = polar(84, angle);
      const guideEnd = polar(192, angle);
      const valueEnd = polar(84 + (value / 100) * 108, angle);
      const label = polar(224, angle);
      const number = polar(207, angle);
      ui.haloSpokes.append(
        svgElement('line', { x1: start.x, y1: start.y, x2: guideEnd.x, y2: guideEnd.y }, 'halo-guide'),
        svgElement('line', { x1: start.x, y1: start.y, x2: valueEnd.x, y2: valueEnd.y }, 'halo-value-line'),
        svgElement('circle', { cx: valueEnd.x, cy: valueEnd.y, r: 4 }, 'halo-value-point'),
      );
      const labelNode = svgElement('text', {
        x: label.x, y: label.y,
        'text-anchor': Math.abs(label.x - 260) < 12 ? 'middle' : label.x > 260 ? 'start' : 'end',
        'dominant-baseline': 'middle',
      }, 'halo-label');
      labelNode.textContent = name.replace(/[A-Z]/g, (letter) => ` ${letter}`).trim();
      const numberNode = svgElement('text', { x: number.x, y: number.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, 'halo-number');
      numberNode.textContent = String(value);
      ui.haloSpokes.append(labelNode, numberNode);
      const card = element('div', 'attribute-value');
      card.append(element('span', '', name.replace(/[A-Z]/g, (letter) => ` ${letter}`)), element('strong', '', String(value)));
      ui.attributes.append(card);
    });
    ui.halo.classList.remove('halo-calibrating');
    requestAnimationFrame(() => ui.halo.classList.add('halo-calibrating'));
  }

  function ledgerRow(label, value) {
    const wrapper = element('div', 'selection-row');
    wrapper.append(element('dt', '', label), element('dd', '', value));
    return wrapper;
  }

  function renderReview(preview) {
    ui.emptyReview.hidden = true;
    ui.reviewContent.hidden = false;
    ui.selectionLedger.replaceChildren(ledgerRow('Expression', preview.selection.expressionRef));
    for (const [kind, ref] of Object.entries(preview.selection.moduleRefs).sort(([left], [right]) => left.localeCompare(right))) {
      ui.selectionLedger.append(ledgerRow(kind, ref));
    }
    ui.exclusionList.replaceChildren(...preview.excludedFromAuthority.map((value) => element('span', 'chip', value)));
    ui.previewDigest.textContent = preview.previewDigest;
    ui.reviewAck.checked = false;
    ui.reviewAck.disabled = preview.status !== 'ready';
    ui.designation.textContent = titleFromRef(state.presetRef);
    if (preview.status === 'ready') {
      renderHalo(preview.derivedAttributes);
      ui.haloCaption.textContent = `Thirteen bounded attributes · genome ${shortDigest(preview.genomeDigest)}`;
      setStatus(ui.globalStatus, 'Preview ready. Review the ledger and exact digest before forging.');
    } else {
      ui.haloCaption.textContent = preview.issues.map((issue) => issue.code).join(' · ');
      setStatus(ui.globalStatus, 'This path is blocked by compatibility evidence.', 'error');
    }
    updateActions();
  }

  async function previewSelection() {
    if (!state.presetRef || !ui.creatorRef.checkValidity()) return;
    state.busy = true;
    clearReview();
    updateActions();
    setStatus(ui.pathStatus, 'Resolving modules through the certified creator protocol.');
    try {
      const preview = await api('/api/preview-preset', { method: 'POST', body: { preset: state.presetRef, creator: ui.creatorRef.value } });
      state.preview = preview;
      renderReview(preview);
      setStatus(ui.pathStatus, `${titleFromRef(state.presetRef)} resolved as ${preview.status}.`);
    } catch (error) {
      setStatus(ui.pathStatus, failureMessages[error.code] ?? 'The preview could not be completed.', 'error');
    } finally {
      state.busy = false;
      updateActions();
    }
  }

  async function forgeSelection() {
    if (!state.preview || !ui.reviewAck.checked) return;
    state.busy = true;
    updateActions();
    ui.forgeResult.hidden = true;
    setStatus(ui.globalStatus, 'Verifying the review seal and compiling the immutable source snapshot.');
    try {
      const acknowledgement = await api('/api/acknowledge-preview', {
        method: 'POST',
        body: { preset: state.presetRef, creator: ui.creatorRef.value, expectedPreviewDigest: state.preview.previewDigest },
      });
      const result = await api('/api/finalize-preset', {
        method: 'POST',
        body: {
          preset: state.presetRef,
          creator: ui.creatorRef.value,
          expectedPreviewDigest: state.preview.previewDigest,
          reviewConfirmation: acknowledgement.reviewConfirmation,
        },
      });
      ui.buildId.textContent = result.creationBuildId;
      ui.forgeResult.hidden = false;
      ui.reviewAck.checked = false;
      ui.reviewAck.disabled = true;
      setStatus(ui.globalStatus, 'Verified pre-genesis build complete. No vessel or Soul was created.');
    } catch (error) {
      ui.reviewAck.checked = false;
      setStatus(ui.globalStatus, failureMessages[error.code] ?? 'The forge could not complete this build.', 'error');
    } finally {
      state.busy = false;
      updateActions();
    }
  }

  async function initialize() {
    if (!sessionToken) {
      setStatus(ui.pathStatus, 'The local forge session is unavailable.', 'error');
      return;
    }
    try {
      state.catalog = await api('/api/catalog');
      ui.catalogDigest.textContent = state.catalog.catalogDigest;
      ui.footerProof.textContent = `CATALOG ${shortDigest(state.catalog.catalogDigest)}`;
      renderPresets();
      setStatus(ui.pathStatus, `${state.catalog.presets.length} validated creation paths loaded.`);
      updateActions();
    } catch (error) {
      setStatus(ui.pathStatus, failureMessages[error.code] ?? 'The validated catalog could not be loaded.', 'error');
    }
  }

  ui.previewButton.addEventListener('click', previewSelection);
  ui.forgeButton.addEventListener('click', forgeSelection);
  ui.reviewAck.addEventListener('change', updateActions);
  ui.creatorRef.addEventListener('input', () => { clearReview(); updateActions(); });
  initialize();
})();
