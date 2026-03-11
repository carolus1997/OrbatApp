const KEY = 'orbat_tree_expanded_v1';

function loadExpanded() {
  try { return new Set(JSON.parse(sessionStorage.getItem(KEY) || '[]')); }
  catch { return new Set(); }
}
function saveExpanded(set) {
  sessionStorage.setItem(KEY, JSON.stringify(Array.from(set)));
}

function echClass(type) {
  if (!type) return 'ech-default';
  const t = type.toLowerCase();
  if (t.includes('command') || t.includes('cmd')) return 'ech-command';
  if (t.includes('team') || t.includes('platoon') || t.includes('company')) return 'ech-team';
  if (t.includes('operator') || t.includes('agent')) return 'ech-operator';
  return 'ech-squad';
}

function statusClass(s) {
  if (!s) return 'inactive';
  const t = s.toLowerCase();
  if (t === 'active') return 'active';
  if (t === 'standby') return 'standby';
  return 'inactive';
}

export function renderOrbatTree(container, nodes) {
  container.innerHTML = '';
  const expanded = loadExpanded();

  function renderNode(node, depth) {
    const hasChildren = (node.children || []).length > 0;
    const isOpen = expanded.has(node.id);

    const wrap = document.createElement('div');
    wrap.className = 'tree-node';
    wrap.dataset.nodeId = node.id;
    /* Relative indentation: 16px per level (containers are nested, so values add up). */
    if (depth > 0) wrap.style.paddingLeft = '16px';

    const item = document.createElement('div');
    item.className = 'tree-item';
    item.title = node.path ? `${node.id}  ·  ${node.path}` : node.id;

    const dot = document.createElement('span');
    dot.className = 'ech-dot ' + echClass(node.type);

    const toggle = document.createElement('span');
    toggle.className = 'tree-icon';
    toggle.textContent = hasChildren ? (isOpen ? '▾' : '▸') : '·';

    const idEl = document.createElement('span');
    idEl.className = 'tree-id';
    idEl.textContent = node.id;

    const nameEl = document.createElement('span');
    nameEl.className = 'tree-name';
    nameEl.textContent = node.name || '—';

    const typeEl = document.createElement('span');
    typeEl.className = 'tree-type';
    typeEl.textContent = node.type || '';

    const staEl = document.createElement('span');
    staEl.className = 'tree-status ' + statusClass(node.status);
    staEl.textContent = node.status || 'unknown';

    item.appendChild(dot);
    item.appendChild(toggle);
    item.appendChild(idEl);
    item.appendChild(nameEl);
    item.appendChild(typeEl);
    item.appendChild(staEl);
    wrap.appendChild(item);

    if (hasChildren) {
      const childWrap = document.createElement('div');
      childWrap.className = 'tree-children';
      if (!isOpen) childWrap.style.display = 'none';
      node.children.forEach(child => childWrap.appendChild(renderNode(child, depth + 1)));
      wrap.appendChild(childWrap);

      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        const cur = loadExpanded();
        const opening = childWrap.style.display === 'none';
        childWrap.style.display = opening ? '' : 'none';
        toggle.textContent = opening ? '▾' : '▸';
        if (opening) cur.add(node.id); else cur.delete(node.id);
        saveExpanded(cur);
      });
    }

    return wrap;
  }

  nodes.forEach(node => container.appendChild(renderNode(node, 0)));
}
