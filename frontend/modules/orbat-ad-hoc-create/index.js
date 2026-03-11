import { fetchTemplatePresets, parseJsonTemplate } from '../orbat-templates/index.js';
import { renderOrbatTree } from '../orbat-tree/index.js';

const inputEl = document.getElementById('template-input');
const formatEl = document.getElementById('template-format');
const outputEl = document.getElementById('template-output');
const treeWrap = document.getElementById('tree-wrap');
const searchEl = document.getElementById('tree-search');

function show(data) {
  outputEl.textContent = JSON.stringify(data, null, 2);
}

async function callApi(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail || data));
  return data;
}

function payloadFromInput() {
  const format = formatEl.value;
  if (format === 'json') {
    const parsed = parseJsonTemplate(inputEl.value);
    if (!parsed.ok) throw new Error(`JSON inválido: ${parsed.error}`);
    return { format, template: parsed.value, strict: true, single_root: false };
  }
  return { format, content: inputEl.value, strict: true, single_root: false };
}

async function refreshTree() {
  const q = encodeURIComponent(searchEl.value.trim());
  const url = q ? `/api/v1/orbat/tree?q=${q}` : '/api/v1/orbat/tree';
  const data = await callApi(url);
  renderOrbatTree(treeWrap, data.nodes || []);
}

document.getElementById('template-validate').addEventListener('click', async () => {
  try {
    const result = await callApi('/api/v1/orbat/templates/validate', payloadFromInput());
    show(result);
  } catch (err) {
    show({ error: String(err.message || err) });
  }
});

document.getElementById('template-import').addEventListener('click', async () => {
  try {
    const result = await callApi('/api/v1/orbat/templates/import', payloadFromInput());
    show(result);
    await refreshTree();
  } catch (err) {
    show({ error: String(err.message || err) });
  }
});

document.getElementById('load-preset').addEventListener('click', async () => {
  try {
    const presets = await fetchTemplatePresets();
    const preset = (presets.items || [])[0];
    if (!preset) throw new Error('No hay presets');
    formatEl.value = 'json';
    inputEl.value = JSON.stringify(preset.template, null, 2);
    show({ loaded_preset: preset.id });
  } catch (err) {
    show({ error: String(err.message || err) });
  }
});

document.getElementById('tree-refresh').addEventListener('click', async () => {
  try {
    await refreshTree();
  } catch (err) {
    show({ error: String(err.message || err) });
  }
});

searchEl.addEventListener('keydown', async (event) => {
  if (event.key !== 'Enter') return;
  await refreshTree();
});

refreshTree().catch((err) => show({ error: String(err.message || err) }));
