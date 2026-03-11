export async function fetchTemplatePresets() {
  const res = await fetch('/api/v1/orbat/templates/presets');
  if (!res.ok) throw new Error('Cannot load presets');
  return res.json();
}

export function parseJsonTemplate(raw) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}
