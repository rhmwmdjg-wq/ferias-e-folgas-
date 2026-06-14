// Helpers globais de interface e formatação.
// Extraídos do HTML principal sem alterar comportamento.

function toastMsg(msg, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.innerHTML = '<i class="fa-solid ' + (icons[type] || icons.info) + '"></i><div class="toast-content">' + msg + '</div><div class="toast-progress"></div>';
  el.onclick = () => { el.classList.add('leaving'); setTimeout(() => el.remove(), 300); };
  container.appendChild(el);
  if (duration > 0) setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 300); }, duration);
  return el;
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getImg(lado) {
  const cfg = DB.config();
  const val = cfg['img_' + lado];
  if (val && val !== 'stored_locally') return val;
  return localStorage.getItem('srv_img_' + lado);
}

function getAssinaturaCoordenador() {
  const cfg = DB.config();
  const nome = cfg.coordenadorAPS || 'Ruan Pablo Ferreira dos Santos';
  return '<div style="margin-top:50px;page-break-inside:avoid;text-align:center">' +
    '<div style="border-top:1.5px solid #000;width:300px;margin:0 auto 8px"></div>' +
    '<div style="font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">' + esc(nome) + '</div>' +
    '<div style="font-size:9px;color:#444;font-weight:600">Coordenador da Atenção Primária à Saúde</div>' +
  '</div>';
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}
