// Giấy nháp Claude: bảng vô hạn đồng bộ với server qua SSE; khoanh vùng để gửi yêu cầu cho Claude trong terminal.
(() => {
const INK = ['ink', 'red', 'blue', 'green', 'amber', 'violet'];
const NOTE = ['yellow', 'pink', 'sky', 'mint', 'violet'];
const HEAD = 31;
const SVGNS = 'http://www.w3.org/2000/svg';
const $ = (s) => document.querySelector(s);
const app = $('#app'), board = $('#board'), world = $('#world'), gItems = $('#items'), gDraft = $('#draft');
const gRegionDraft = $('#regionDraft'), gRegions = $('#regions'), els = $('#els');

let tool = 'pen', ink = 'ink', noteColor = 'yellow';
let items = new Map(), chat = [], reqs = {};
let selected = null, editing = null;
const view = { x: 0, y: 0, k: 1 };
const undoStack = [];

/* ---------- server ---------- */
const post = (path, body) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const newId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function putItem(it, record = true) {
  const before = items.get(it.id) || null;
  if (record) pushUndo(before, it);
  items.set(it.id, it); render();
  return post('/api/items', { op: 'put', item: it });
}
function delItem(id, record = true) {
  const before = items.get(id); if (!before) return;
  if (record) pushUndo(before, null);
  items.delete(id); if (selected === id) selected = null; render();
  post('/api/items', { op: 'del', id });
}
function pushUndo(before, after) { undoStack.push({ before: before && { ...before }, after: after && { ...after } }); if (undoStack.length > 200) undoStack.shift(); }
function undo() {
  const u = undoStack.pop(); if (!u) return;
  if (u.before) putItem(u.before, false); else if (u.after) delItem(u.after.id, false);
}

function setStatus(kind, text) { const s = $('#status'); s.className = 'pill ' + kind; s.lastElementChild.textContent = text; }
async function loadState() {
  const s = await fetch('/api/state').then((r) => r.json());
  items = new Map(s.items.map((i) => [i.id, i])); chat = s.chat; reqs = s.reqs;
  render(); renderChat();
}
function connect() {
  const es = new EventSource('/api/events');
  es.onopen = () => { loadState().then(() => { setStatus('live', 'Đã kết nối'); updateBusy(); }); };
  es.onerror = () => setStatus('warn', 'Mất kết nối server…');
  es.onmessage = (e) => {
    const ev = JSON.parse(e.data);
    if (ev.type === 'put') { if (editing !== ev.item.id) { items.set(ev.item.id, ev.item); render(); } }
    else if (ev.type === 'del') { items.delete(ev.id); if (selected === ev.id) selected = null; render(); }
    else if (ev.type === 'clear') { items.clear(); render(); }
    else if (ev.type === 'chat') { if (!chat.some((m) => m.id === ev.msg.id)) chat.push(ev.msg); renderChat(); if (ev.msg.role === 'claude') { app.classList.remove('chat-closed'); flashRegion(ev.msg.region); } }
    else if (ev.type === 'req') { reqs[ev.id] = ev.status; renderChat(); updateBusy(); }
  };
}
function updateBusy() {
  const n = Object.values(reqs).filter((s) => s === 'pending' || s === 'seen').length;
  const seen = Object.values(reqs).includes('seen');
  if (n) setStatus('busy', seen ? 'Claude đang phân tích…' : `${n} yêu cầu chờ Claude`);
  else setStatus('live', 'Đã kết nối');
}

/* ---------- LaTeX + Markdown nhẹ ---------- */
let mathReady = !!(window.MathJax && MathJax.tex2svg);
addEventListener('mathjax-ready', () => { mathReady = true; richCache.clear(); render(true); renderChat(); });
const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<!\\)\$([^$\n]+?)\$/g;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function tex(src, display) {
  if (!mathReady) return `<code>${esc(display ? `$$${src}$$` : `$${src}$`)}</code>`;
  try {
    const node = MathJax.tex2svg(src, { display });
    node.querySelectorAll('mjx-assistive-mml').forEach((n) => n.remove());
    if (node.querySelector('[data-mjx-error]')) return `<code class="texerr" title="Lỗi LaTeX">${esc(src)}</code>`;
    return display ? `<span class="disp">${node.outerHTML}</span>` : node.outerHTML;
  } catch (e) { return `<code class="texerr">${esc(src)}</code>`; }
}
const inlineMd = (t) => t.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
const richCache = new Map();
function rich(text) {
  text = String(text || '');
  if (richCache.has(text)) return richCache.get(text);
  const math = [];
  const masked = text.replace(MATH_RE, (m, a, b, c, d) => { math.push(tex(a ?? b ?? c ?? d, a != null || b != null)); return `\u0000${math.length - 1}\u0000`; });
  const out = []; let list = null;
  for (const raw of masked.split('\n')) {
    const line = inlineMd(esc(raw));
    const li = /^\s*(?:[-*•]|\d+\.)\s+(.*)$/.exec(line);
    if (li) { if (!list) { list = []; } list.push(`<li>${li[1]}</li>`); continue; }
    if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; }
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    if (h) out.push(`<h4>${h[1]}</h4>`);
    else if (line.trim()) out.push(`<p>${line}</p>`);
  }
  if (list) out.push(`<ul>${list.join('')}</ul>`);
  const html = out.join('').replace(/\u0000(\d+)\u0000/g, (m, i) => math[+i]);
  if (richCache.size > 500) richCache.clear();
  richCache.set(text, html);
  return html;
}

/* ---------- view ---------- */
function applyView() {
  world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`;
  const s = 24 * view.k;
  board.style.backgroundSize = `${s}px ${s}px`;
  board.style.backgroundPosition = `${view.x}px ${view.y}px`;
  $('#zval').textContent = Math.round(view.k * 100) + '%';
  try { localStorage.setItem('wb-view', JSON.stringify(view)); } catch (e) {}
}
const toWorld = (cx, cy) => { const r = board.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k }; };
const toScreen = (x, y) => { const r = board.getBoundingClientRect(); return { x: r.left + view.x + x * view.k, y: r.top + view.y + y * view.k }; };
function zoomAt(cx, cy, f) {
  const r = board.getBoundingClientRect(), px = cx - r.left, py = cy - r.top;
  const k = Math.min(4, Math.max(0.15, view.k * f)), ratio = k / view.k;
  view.x = px - (px - view.x) * ratio; view.y = py - (py - view.y) * ratio; view.k = k; applyView();
}
function bbox(d) {
  if (d.type === 'arrow') return [Math.min(d.x, d.x + d.dx), Math.min(d.y, d.y + d.dy), Math.max(d.x, d.x + d.dx), Math.max(d.y, d.y + d.dy)];
  if (d.type === 'image') return [d.x, d.y, d.x + d.w, d.y + d.h + HEAD];
  return [d.x, d.y, d.x + (d.w || 200), d.y + (d.h || 60)];
}
function fitTo(x0, y0, x1, y1, maxK) {
  const r = board.getBoundingClientRect(), pad = 60;
  const k = Math.min(maxK, Math.max(0.15, Math.min((r.width - pad * 2) / (x1 - x0 || 1), (r.height - pad * 2) / (y1 - y0 || 1))));
  view.k = k; view.x = (r.width - (x1 - x0) * k) / 2 - x0 * k; view.y = (r.height - (y1 - y0) * k) / 2 - y0 * k; applyView();
}
function fit() {
  if (!items.size) { const r = board.getBoundingClientRect(); view.k = 1; view.x = r.width / 2; view.y = r.height / 3; applyView(); return; }
  let b = [1e9, 1e9, -1e9, -1e9];
  items.forEach((d) => { const c = bbox(d); b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[2]), Math.max(b[3], c[3])]; });
  fitTo(...b, 1.5);
}

/* ---------- render ---------- */
const col = (c) => `var(--c-${INK.includes(c) ? c : 'ink'})`;
function strokePath(p) {
  if (p.length < 4) return `M${p[0]} ${p[1]}l0.01 0`;
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length - 2; i += 2) d += `Q${p[i]} ${p[i + 1]} ${(p[i] + p[i + 2]) / 2} ${(p[i + 1] + p[i + 3]) / 2}`;
  return d + `L${p[p.length - 2]} ${p[p.length - 1]}`;
}
function arrowPath(d) {
  const L = Math.hypot(d.dx, d.dy) || 1, ux = d.dx / L, uy = d.dy / L, h = Math.min(16, L / 2);
  return `M0 0L${d.dx} ${d.dy}M${d.dx - ux * h - uy * h * 0.55} ${d.dy - uy * h + ux * h * 0.55}L${d.dx} ${d.dy}L${d.dx - ux * h + uy * h * 0.55} ${d.dy - uy * h - ux * h * 0.55}`;
}
function svgInner(d) {
  const c = col(d.color);
  if (d.type === 'stroke') { const p = strokePath(d.pts); return `<path d="${p}" fill="none" stroke="${c}" stroke-width="${d.width || 3}" stroke-linecap="round" stroke-linejoin="round"/><path class="hit" d="${p}"/>`; }
  if (d.type === 'rect') return `<rect width="${d.w}" height="${d.h}" rx="4" fill="none" stroke="${c}" stroke-width="2.5"/><rect class="hit" width="${d.w}" height="${d.h}" rx="4"/>`;
  if (d.type === 'arrow') return `<path d="${arrowPath(d)}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path class="hit" d="M0 0L${d.dx} ${d.dy}"/>`;
  return '';
}
const isEl = (t) => t === 'note' || t === 'text' || t === 'image';
const elOf = (id) => els.querySelector(`.el[data-id="${CSS.escape(id)}"]`);
function render(force) {
  const sorted = [...items.values()].sort((a, b) => (a.z || 0) - (b.z || 0));
  const seen = new Set();
  let zi = 1;
  for (const d of sorted) {
    seen.add(d.id);
    if (isEl(d.type)) { renderEl(d, zi++, force); continue; }
    let g = gItems.querySelector(`g[data-id="${CSS.escape(d.id)}"]`);
    if (!g) { g = document.createElementNS(SVGNS, 'g'); g.dataset.id = d.id; }
    const key = JSON.stringify([d.pts, d.w, d.h, d.dx, d.dy, d.color]);
    if (g._key !== key) { g.innerHTML = svgInner(d); g._key = key; }
    g.setAttribute('transform', `translate(${d.x} ${d.y})`);
    g.classList.toggle('sel', selected === d.id);
    gItems.appendChild(g);
  }
  gItems.querySelectorAll('g[data-id]').forEach((g) => { if (!seen.has(g.dataset.id)) g.remove(); });
  els.querySelectorAll('.el').forEach((e) => { if (!seen.has(e.dataset.id)) e.remove(); });
  $('#empty').hidden = items.size > 0;
}
function renderEl(d, zi, force) {
  let e = elOf(d.id);
  const claude = d.author === 'claude';
  if (!e) {
    e = document.createElement('div'); e.dataset.id = d.id; e.className = 'el ' + d.type;
    if (d.type === 'note') e.innerHTML = '<div class="grip"><span class="who"></span><span>⋮⋮</span></div><div class="body rich"></div>';
    else if (d.type === 'text') e.innerHTML = '<div class="rich"></div>';
    else { e.classList.add('media'); e.innerHTML = '<div class="mhead"><span class="who"></span><span class="ttl"></span></div><div class="mbody"></div><div class="rs"></div>'; }
    e.addEventListener('dblclick', (ev) => { ev.stopPropagation(); if (d.type !== 'image') startEdit(e.dataset.id); });
    els.appendChild(e);
  }
  e.style.left = d.x + 'px'; e.style.top = d.y + 'px'; e.style.zIndex = zi;
  e.classList.toggle('sel', selected === d.id);
  e.classList.toggle('by-claude', claude);
  if (editing === d.id) return;
  const key = JSON.stringify([d.text, d.svg, d.color, d.size, d.w, d.h, d.title, mathReady]);
  if (e._key === key && !force) return;
  e._key = key;
  if (d.type === 'note') {
    e.style.width = (d.w || 220) + 'px';
    e.style.background = `var(--n-${NOTE.includes(d.color) ? d.color : 'yellow'})`;
    e.querySelector('.who').innerHTML = 'Ghi chú'; // không ghi tên Claude lên hình
    e.querySelector('.body').innerHTML = rich(d.text) + (d.file ? `<a class="dl" href="/api/file/${encodeURIComponent(d.file)}" download>⬇ Tải về</a>` : '');
    const dl = e.querySelector('.dl'); if (dl) dl.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  } else if (d.type === 'text') {
    e.style.color = col(d.color); e.style.fontSize = (d.size || 24) + 'px';
    e.querySelectorAll(':scope>.tag').forEach((t) => t.remove());
    e.querySelector('.rich').innerHTML = rich(d.text);
    const t = e.querySelector('.tag'); if (t) e.appendChild(t);
  } else {
    e.style.width = d.w + 'px'; e.style.height = (d.h + HEAD) + 'px';
    e.querySelector('.who').innerHTML = '';
    e.querySelector('.ttl').textContent = d.title || 'Hình';
    const body = e.querySelector('.mbody'); body.innerHTML = '';
    const img = new Image(); img.alt = d.title || 'Hình'; img.draggable = false; img.src = svgUrl(d.svg); body.appendChild(img);
  }
  if (d.type !== 'image') requestAnimationFrame(() => syncSize(d.id));
}
// gửi kích thước thật về server để Claude đặt mục mới không đè lên
const sizeTimers = new Map();
function syncSize(id) {
  const e = elOf(id), d = items.get(id); if (!e || !d || editing === id) return;
  const w = Math.round(e.offsetWidth), h = Math.round(e.offsetHeight);
  if (Math.abs((d.w || 0) - w) < 6 && Math.abs((d.h || 0) - h) < 6) return;
  d.w = w; d.h = h;
  clearTimeout(sizeTimers.get(id));
  sizeTimers.set(id, setTimeout(() => post('/api/items', { op: 'patch', id, set: { w, h } }), 300));
}
function svgUrl(svg) {
  let s = String(svg || '');
  if (!/xmlns=/.test(s)) s = s.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  s = svgMath(s);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}
// <text> chứa $…$ trong SVG: render bằng MathJax thành <svg> lồng (ảnh <img> không chạy MathJax được).
// Phần chữ thường quanh công thức được bọc \text{}. Cỡ chữ lấy từ thuộc tính font-size (mặc định 14).
const svgMathCache = new Map();
function svgMath(s) {
  if (!mathReady || !/\$[^$]+\$/.test(s)) return s;
  if (svgMathCache.has(s)) return svgMathCache.get(s);
  let out = s;
  try {
    const doc = new DOMParser().parseFromString(s, 'image/svg+xml');
    if (!doc.querySelector('parsererror')) {
      doc.querySelectorAll('text').forEach((t) => {
        const raw = t.textContent;
        if (!/\$[^$]+\$/.test(raw)) return;
        const src = raw.split(/(\$[^$]+\$)/).filter(Boolean)
          .map((p) => (p.startsWith('$') ? p.slice(1, -1) : `\\text{${p.replace(/([{}\\])/g, '\\$1')}}`)).join('');
        const node = MathJax.tex2svg(src, { display: false });
        const m = node.querySelector('svg'); if (!m || node.querySelector('[data-mjx-error]')) return;
        const fs = parseFloat(t.getAttribute('font-size')) || 14, ex = fs * 0.5;
        const w = parseFloat(m.getAttribute('width')) * ex, h = parseFloat(m.getAttribute('height')) * ex;
        const depth = -parseFloat((/vertical-align:\s*([-\d.]+)ex/.exec(m.getAttribute('style') || '') || [0, 0])[1]) * ex;
        const x = parseFloat(t.getAttribute('x')) || 0, y = parseFloat(t.getAttribute('y')) || 0;
        const anchor = t.getAttribute('text-anchor') || 'start';
        const nm = doc.importNode(m, true);
        nm.removeAttribute('style');
        nm.setAttribute('x', (anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x).toFixed(1));
        nm.setAttribute('y', (y - h + depth).toFixed(1));
        nm.setAttribute('width', w.toFixed(1)); nm.setAttribute('height', h.toFixed(1));
        nm.setAttribute('color', t.getAttribute('fill') || '#222');
        t.replaceWith(nm);
      });
      out = new XMLSerializer().serializeToString(doc);
    }
  } catch (e) { out = s; }
  if (svgMathCache.size > 200) svgMathCache.clear();
  svgMathCache.set(s, out);
  return out;
}

/* ---------- editing ---------- */
function startEdit(id, caret) {
  const d = items.get(id), e = elOf(id); if (!d || !e) return;
  editing = id; selected = id;
  const ta = document.createElement('textarea'); ta.className = 'editor'; ta.value = d.text || ''; ta.spellcheck = false;
  ta.style.width = Math.max(240, d.type === 'note' ? (d.w || 220) - 16 : (d.w || 0) + 40) + 'px';
  const host = d.type === 'note' ? e.querySelector('.body') : e.querySelector('.rich');
  host.innerHTML = ''; host.appendChild(ta);
  const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 4 + 'px'; };
  ta.addEventListener('input', grow); grow();
  ta.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  ta.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Escape') { ta.dataset.cancel = '1'; ta.blur(); }
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) ta.blur();
  });
  ta.addEventListener('blur', () => {
    editing = null; e._key = null;
    const cur = items.get(id);
    if (!cur) return;
    const t = ta.dataset.cancel ? cur.text : ta.value;
    if (!t.trim() || /^\$\$\s*\$\$$/.test(t.trim())) { delItem(id); return; }
    if (t !== cur.text) putItem({ ...cur, text: t }); else render();
  });
  ta.focus();
  const pos = caret ?? ta.value.length; ta.setSelectionRange(pos, pos);
}

/* ---------- tools ---------- */
function setTool(t) {
  tool = t; app.dataset.tool = t;
  document.querySelectorAll('.tools .btn[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
  app.classList.toggle('drawing', ['pen', 'rect', 'arrow', 'hand', 'region'].includes(t));
  $('#hint').hidden = t !== 'region';
  if (t !== 'select') { selected = null; render(); }
  buildTray();
}
document.querySelectorAll('.tools .btn[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
$('#undo').addEventListener('click', undo);
function buildTray() {
  const tray = $('#tray'); tray.innerHTML = '';
  const sel = selected && items.get(selected);
  const isNote = tool === 'note' || (sel && sel.type === 'note');
  tray.hidden = tool === 'region' || tool === 'hand' || tool === 'eraser';
  const list = isNote ? NOTE : INK, cur = isNote ? (sel ? sel.color : noteColor) : (sel ? sel.color : ink);
  tray.insertAdjacentHTML('beforeend', `<span class="lbl">${isNote ? 'Màu giấy' : 'Màu mực'}</span>`);
  list.forEach((c) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'sw' + (isNote ? ' sq' : '');
    b.style.background = isNote ? `var(--n-${c})` : `var(--c-${c})`; b.setAttribute('aria-label', c); b.setAttribute('aria-pressed', String(c === cur));
    b.addEventListener('click', () => {
      if (isNote) noteColor = c; else ink = c;
      if (sel && sel.type !== 'image') putItem({ ...sel, color: c });
      buildTray();
    });
    tray.appendChild(b);
  });
}

/* ---------- pointer ---------- */
let action = null, spaceDown = false;
const pointers = new Map(); let pinch = null;
const hitId = (t) => { const n = t.closest && t.closest('[data-id]'); return n && items.has(n.dataset.id) ? n.dataset.id : null; };
function create(d) { const it = { id: newId(), author: 'user', z: Date.now(), ...d }; putItem(it); return it.id; }

board.addEventListener('pointerdown', (ev) => {
  if (ev.target.closest('.editor')) return;
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (pointers.size === 2) { action = null; gDraft.innerHTML = ''; const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; return; }
  if (document.activeElement && document.activeElement.classList.contains('editor')) document.activeElement.blur();
  const p = toWorld(ev.clientX, ev.clientY), hit = hitId(ev.target);
  const t = spaceDown || ev.button === 1 ? 'hand' : tool;
  const capture = () => board.setPointerCapture(ev.pointerId);
  if (t === 'hand') { action = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y }; app.classList.add('panning'); capture(); return; }
  if (t === 'region') { hideAsk(); action = { kind: 'region', x: p.x, y: p.y, ex: p.x, ey: p.y }; capture(); return; }
  if (t === 'select') {
    if (!hit) { selected = null; render(); buildTray(); action = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y }; capture(); return; }
    selected = hit; render(); buildTray();
    const d = items.get(hit);
    action = ev.target.closest('.rs') ? { kind: 'resize', id: hit, sx: p.x, sy: p.y, d: { ...d } } : { kind: 'move', id: hit, sx: p.x, sy: p.y, d: { ...d } };
    capture(); ev.preventDefault(); return;
  }
  if (t === 'eraser') { action = { kind: 'erase' }; if (hit) delItem(hit); capture(); return; }
  if (t === 'note') { const id = create({ type: 'note', x: Math.round(p.x - 20), y: Math.round(p.y - 12), w: 240, h: 80, text: '', color: noteColor }); setTool('select'); requestAnimationFrame(() => startEdit(id)); ev.preventDefault(); return; }
  if (t === 'text' || t === 'math') {
    if (hit && items.get(hit).type === 'text') { startEdit(hit); ev.preventDefault(); return; }
    const text = t === 'math' ? '$$  $$' : '';
    const id = create({ type: 'text', x: Math.round(p.x), y: Math.round(p.y - 16), w: 60, h: 36, text, color: ink, size: 24 });
    setTool('select'); requestAnimationFrame(() => startEdit(id, t === 'math' ? 3 : undefined)); ev.preventDefault(); return;
  }
  capture();
  if (t === 'pen') action = { kind: 'pen', pts: [p.x, p.y] };
  if (t === 'rect' || t === 'arrow') action = { kind: t, x: p.x, y: p.y, ex: p.x, ey: p.y };
  drawDraft();
});
board.addEventListener('pointermove', (ev) => {
  if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    view.x += cx - pinch.cx; view.y += cy - pinch.cy; zoomAt(cx, cy, d / pinch.d); pinch = { d, cx, cy }; return;
  }
  if (!action) return;
  if (action.kind === 'pan') { view.x = action.vx + ev.clientX - action.sx; view.y = action.vy + ev.clientY - action.sy; applyView(); return; }
  if (action.kind === 'erase') { const el = document.elementFromPoint(ev.clientX, ev.clientY); const id = el && hitId(el); if (id) delItem(id); return; }
  const p = toWorld(ev.clientX, ev.clientY);
  if (action.kind === 'move') { action.moved = true; items.set(action.id, { ...action.d, x: Math.round(action.d.x + p.x - action.sx), y: Math.round(action.d.y + p.y - action.sy) }); render(); return; }
  if (action.kind === 'resize') { action.moved = true; items.set(action.id, { ...action.d, w: Math.max(120, Math.round(action.d.w + p.x - action.sx)), h: Math.max(80, Math.round(action.d.h + p.y - action.sy)) }); render(); return; }
  if (action.kind === 'pen') { const n = action.pts.length; if (Math.hypot(p.x - action.pts[n - 2], p.y - action.pts[n - 1]) * view.k > 1.5) action.pts.push(p.x, p.y); }
  else { action.ex = p.x; action.ey = p.y; }
  drawDraft();
});
function endPointer(ev) {
  pointers.delete(ev.pointerId);
  if (pinch) { if (pointers.size < 2) pinch = null; return; }
  app.classList.remove('panning');
  const a = action; action = null; gDraft.innerHTML = ''; gRegionDraft.innerHTML = '';
  if (!a) return;
  if ((a.kind === 'move' || a.kind === 'resize') && a.moved) { const now = items.get(a.id); items.set(a.id, a.d); putItem(now); }
  if (a.kind === 'pen') {
    const xs = a.pts.filter((_, i) => i % 2 === 0), ys = a.pts.filter((_, i) => i % 2 === 1);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    create({ type: 'stroke', x: Math.round(x0), y: Math.round(y0), w: Math.round(Math.max(...xs) - x0) || 1, h: Math.round(Math.max(...ys) - y0) || 1,
      pts: a.pts.map((v, i) => Math.round((v - (i % 2 ? y0 : x0)) * 10) / 10), color: ink, width: 3 });
  }
  if (a.kind === 'rect') { const w = Math.abs(a.ex - a.x), h = Math.abs(a.ey - a.y); if (w > 4 && h > 4) create({ type: 'rect', x: Math.round(Math.min(a.x, a.ex)), y: Math.round(Math.min(a.y, a.ey)), w: Math.round(w), h: Math.round(h), color: ink }); }
  if (a.kind === 'arrow') { const dx = a.ex - a.x, dy = a.ey - a.y; if (Math.hypot(dx, dy) > 8) create({ type: 'arrow', x: Math.round(a.x), y: Math.round(a.y), dx: Math.round(dx), dy: Math.round(dy), color: ink }); }
  if (a.kind === 'region') {
    const w = Math.abs(a.ex - a.x), h = Math.abs(a.ey - a.y);
    if (w * view.k > 10 && h * view.k > 10) showAsk({ x: Math.round(Math.min(a.x, a.ex)), y: Math.round(Math.min(a.y, a.ey)), w: Math.round(w), h: Math.round(h) });
  }
}
board.addEventListener('pointerup', endPointer);
board.addEventListener('pointercancel', (ev) => { pointers.delete(ev.pointerId); pinch = null; action = null; gDraft.innerHTML = ''; gRegionDraft.innerHTML = ''; });
function regionRect(r, cls) { return `<rect class="${cls}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="4" stroke-width="${2 / view.k}"/>`; }
function drawDraft() {
  if (!action) return;
  const a = action;
  if (a.kind === 'pen') gDraft.innerHTML = `<path d="${strokePath(a.pts)}" fill="none" stroke="${col(ink)}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (a.kind === 'rect') gDraft.innerHTML = `<g transform="translate(${Math.min(a.x, a.ex)} ${Math.min(a.y, a.ey)})">${svgInner({ type: 'rect', w: Math.abs(a.ex - a.x), h: Math.abs(a.ey - a.y), color: ink })}</g>`;
  if (a.kind === 'arrow') gDraft.innerHTML = `<g transform="translate(${a.x} ${a.y})">${svgInner({ type: 'arrow', dx: a.ex - a.x, dy: a.ey - a.y, color: ink })}</g>`;
  if (a.kind === 'region') gRegionDraft.innerHTML = regionRect({ x: Math.min(a.x, a.ex), y: Math.min(a.y, a.ey), w: Math.abs(a.ex - a.x), h: Math.abs(a.ey - a.y) }, 'regionbox');
}
function flashRegion(r) {
  if (!r) return;
  gRegions.innerHTML = regionRect(r, 'regionbox');
  clearTimeout(flashRegion.t); flashRegion.t = setTimeout(() => { gRegions.innerHTML = ''; }, 2500);
}
board.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  if (ev.ctrlKey || ev.metaKey) zoomAt(ev.clientX, ev.clientY, Math.exp(-ev.deltaY * 0.01));
  else { view.x -= ev.deltaX; view.y -= ev.deltaY; applyView(); }
}, { passive: false });
addEventListener('keydown', (ev) => {
  const typing = /^(TEXTAREA|INPUT)$/.test(document.activeElement?.tagName);
  if (ev.key === ' ' && !typing) { spaceDown = true; ev.preventDefault(); return; }
  if (typing) return;
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { undo(); ev.preventDefault(); return; }
  if ((ev.key === 'Delete' || ev.key === 'Backspace') && selected) { delItem(selected); return; }
  if (ev.key === 'Escape') { hideAsk(); selected = null; render(); return; }
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const map = { v: 'select', h: 'hand', p: 'pen', n: 'note', t: 'text', m: 'math', r: 'rect', a: 'arrow', e: 'eraser', c: 'region' };
  if (map[ev.key.toLowerCase()]) setTool(map[ev.key.toLowerCase()]);
});
addEventListener('keyup', (ev) => { if (ev.key === ' ') spaceDown = false; });

/* ---------- hỏi Claude ---------- */
let askRegion = null;
function showAsk(r) {
  askRegion = r; gRegions.innerHTML = regionRect(r, 'regionbox');
  const box = $('#ask'), s = toScreen(r.x + r.w, r.y), st = $('#stage').getBoundingClientRect();
  box.hidden = false;
  box.style.left = Math.min(st.width - 352, Math.max(8, s.x - st.left + 12)) + 'px';
  box.style.top = Math.min(st.height - box.offsetHeight - 8, Math.max(60, s.y - st.top)) + 'px';
  $('#askInput').value = $('#chatInput').value; $('#chatInput').value = '';
  $('#askInput').focus();
}
function hideAsk() { $('#ask').hidden = true; askRegion = null; gRegions.innerHTML = ''; }
$('#askCancel').addEventListener('click', hideAsk);
$('#askInput').addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) sendAsk(); if (ev.key === 'Escape') hideAsk(); });
$('#askSend').addEventListener('click', sendAsk);
async function sendAsk() {
  const r = askRegion; if (!r) return;
  const question = $('#askInput').value.trim();
  hideAsk(); setTool('select');
  let png = null;
  try { png = await snapshot(r); } catch (e) { console.warn(e); }
  await post('/api/ask', { region: r, question, png });
  app.classList.remove('chat-closed');
}
async function sendPlain() {
  const t = $('#chatInput').value.trim(); if (!t) return;
  $('#chatInput').value = ''; autoGrow();
  await post('/api/ask', { region: null, question: t });
}
// ảnh PNG của vùng: chỉ nét vẽ, khung, mũi tên, hình; chữ đã được gửi dạng văn bản nên vẽ thành khối mờ
async function snapshot(r) {
  const scale = Math.min(2, 1400 / Math.max(r.w, r.h));
  const c = document.createElement('canvas'); c.width = Math.ceil(r.w * scale); c.height = Math.ceil(r.h * scale);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.scale(scale, scale); g.translate(-r.x, -r.y);
  const cs = getComputedStyle(document.documentElement);
  const color = (name) => cs.getPropertyValue(`--c-${INK.includes(name) ? name : 'ink'}`).trim() || '#000';
  const box = [r.x, r.y, r.x + r.w, r.y + r.h];
  const inside = (b) => b[0] < box[2] && b[2] > box[0] && b[1] < box[3] && b[3] > box[1];
  const list = [...items.values()].filter((d) => inside(bbox(d))).sort((a, b) => (a.z || 0) - (b.z || 0));
  for (const d of list) {
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    if (d.type === 'note' || d.type === 'text') {
      g.fillStyle = d.type === 'note' ? '#fff6c8' : 'rgba(0,0,0,0.04)'; g.fillRect(d.x, d.y, d.w || 200, d.h || 40);
      g.fillStyle = '#555'; g.font = '13px sans-serif'; g.fillText(`[${d.id}]`, d.x + 6, d.y + 16);
    } else if (d.type === 'image') {
      const img = new Image(); img.src = svgUrl(d.svg);
      await img.decode().catch(() => {});
      try { g.drawImage(img, d.x, d.y + HEAD, d.w, d.h); } catch (e) {}
    } else {
      g.translate(d.x, d.y); g.strokeStyle = d.color === 'ink' || !d.color ? '#111' : color(d.color);
      g.lineWidth = d.type === 'stroke' ? (d.width || 3) : 2.5;
      if (d.type === 'stroke') g.stroke(new Path2D(strokePath(d.pts)));
      if (d.type === 'rect') g.strokeRect(0, 0, d.w, d.h);
      if (d.type === 'arrow') g.stroke(new Path2D(arrowPath(d)));
    }
    g.restore();
  }
  return c.toDataURL('image/png');
}

/* ---------- chat ---------- */
const log = $('#log');
const ST = { pending: 'Đang chờ Claude', seen: 'Claude đang phân tích…', done: 'Đã trả lời' };
function renderChat() {
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  log.innerHTML = '';
  if (!chat.length) log.innerHTML = '<div class="foot">Khoanh vùng trên giấy nháp (phím C) rồi đặt câu hỏi. Claude trong terminal sẽ trả lời ở đây và vẽ lên bảng.</div>';
  for (const m of chat.slice(-120)) {
    const div = document.createElement('div'); div.className = 'msg ' + (m.role === 'user' ? 'user' : 'claude');
    if (m.role === 'user') {
      const st = reqs[m.req] || 'done';
      div.innerHTML = `${m.text ? `<div class="bub rich">${rich(m.text)}</div>` : ''}<div class="meta">${m.thumb ? `<img class="thumb" alt="vùng đã chọn" src="/api/request/${encodeURIComponent(m.req)}.png">` : ''}${m.region ? '<button class="chip" data-go>📍 Xem vùng</button>' : ''}<span class="st ${st}"><i></i>${ST[st] || ''}</span></div>`;
    } else {
      div.innerHTML = `<div class="lab">✦ Claude</div><div class="txt rich">${rich(m.text)}</div>${m.region ? '<div><button class="chip" data-go>📍 Vùng liên quan</button></div>' : ''}`;
    }
    div.querySelectorAll('[data-go],.thumb').forEach((b) => b.addEventListener('click', () => { const r = m.region; fitTo(r.x - 40, r.y - 40, r.x + r.w + 400, r.y + r.h + 40, 1.2); flashRegion(r); }));
    log.appendChild(div);
  }
  if (atBottom) log.scrollTop = log.scrollHeight;
}
const input = $('#chatInput');
function autoGrow() { input.style.height = 'auto'; input.style.height = Math.min(160, input.scrollHeight) + 'px'; }
input.addEventListener('input', autoGrow);
input.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); sendPlain(); } });
$('#send').addEventListener('click', sendPlain);
$('#grab').addEventListener('click', () => setTool('region'));
$('#chatClose').addEventListener('click', () => app.classList.add('chat-closed'));
$('#chatOpen').addEventListener('click', () => app.classList.remove('chat-closed'));
$('#clear').addEventListener('click', () => { if (confirm('Xoá toàn bộ nội dung trên giấy nháp?')) post('/api/clear', {}); });
$('#zin').addEventListener('click', () => { const r = board.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2); });
$('#zout').addEventListener('click', () => { const r = board.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.2); });
$('#zfit').addEventListener('click', fit);

/* ---------- tải file lên ---------- */
// gửi nội dung thô tới server; server lưu file, đặt thẻ lên bảng và báo cho Claude
async function uploadFiles(files, at) {
  const r = board.getBoundingClientRect();
  const p = at || toWorld(r.left + r.width / 2, r.top + r.height / 2);
  let i = 0;
  for (const f of files) {
    setStatus('busy', `Đang tải lên ${f.name}…`);
    const q = new URLSearchParams({ name: f.name, x: Math.round(p.x), y: Math.round(p.y + i++ * 110) });
    try {
      const res = await fetch('/api/upload?' + q, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: f }).then((x) => x.json());
      if (!res.ok) alert(`Không tải lên được ${f.name}: ${res.error}`);
    } catch (e) { alert(`Không tải lên được ${f.name}: ${e.message}`); }
  }
  setStatus('live', 'Đã kết nối'); updateBusy();
}
const fileInput = $('#fileInput'), dropzone = $('#dropzone');
$('#upload').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { if (fileInput.files.length) uploadFiles([...fileInput.files]); fileInput.value = ''; });
const hasFiles = (ev) => [...(ev.dataTransfer?.types || [])].includes('Files');
let dragDepth = 0;
board.addEventListener('dragenter', (ev) => { if (!hasFiles(ev)) return; dragDepth++; dropzone.hidden = false; });
board.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; dropzone.hidden = true; } });
board.addEventListener('dragover', (ev) => { if (hasFiles(ev)) ev.preventDefault(); });
board.addEventListener('drop', (ev) => {
  if (!hasFiles(ev)) return;
  ev.preventDefault(); dragDepth = 0; dropzone.hidden = true;
  uploadFiles([...ev.dataTransfer.files], toWorld(ev.clientX, ev.clientY));
});

/* ---------- boot ---------- */
setTool('pen');
try { const v = JSON.parse(localStorage.getItem('wb-view') || 'null'); if (v) Object.assign(view, v); else { const r = board.getBoundingClientRect(); view.x = r.width / 2; view.y = r.height / 3; } } catch (e) {}
applyView();
loadState().catch(() => setStatus('warn', 'Chưa kết nối được server'));
connect();
})();
