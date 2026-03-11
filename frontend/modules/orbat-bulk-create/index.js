const outputEl = document.getElementById('bulk-output');
const csvEl = document.getElementById('bulk-csv');

function show(data) {
  outputEl.textContent = JSON.stringify(data, null, 2);
}

async function callApi(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail || data));
  return data;
}

function payloadFromCsv() {
  return {
    format: 'csv',
    content: csvEl.value,
    strict: true,
    single_root: false,
  };
}

document.getElementById('bulk-prevalidate').addEventListener('click', async () => {
  try {
    const templateValidation = await callApi('/api/v1/orbat/templates/validate', payloadFromCsv());
    show(templateValidation);
  } catch (err) {
    show({ error: String(err.message || err) });
  }
});

document.getElementById('bulk-commit').addEventListener('click', async () => {
  try {
    const parsed = await callApi('/api/v1/orbat/templates/validate', payloadFromCsv());
    if (!parsed.valid) {
      show(parsed);
      return;
    }
    const nodes = parsed.normalized_nodes.map((n) => ({
      id: n.id,
      parent_id: n.parent_id,
      name: n.name,
      type: n.type,
      order: n.order,
      status: n.status,
      callsign: n.callsign,
      lat: n.geo?.lat ?? null,
      lon: n.geo?.lon ?? null,
    }));
    const result = await callApi('/api/v1/orbat/bulk/commit', { nodes, strict: true, single_root: false });
    show(result);
  } catch (err) {
    show({ error: String(err.message || err) });
  }
});
