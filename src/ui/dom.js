export const $ = id => document.getElementById(id);
export const fmt = n => Math.round(n).toLocaleString('ko-KR');
export const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer = 0;
export function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

export function show(id, visible) { $(id).classList.toggle('hidden', !visible); }
