// Atlas Atestados — aplicativo de celular para enviar atestados ao RH.
//
// Usa os mesmos dados e regras do módulo "Enviar Atestado ao RH" do Atlas Saúde:
// - login com o usuário e a senha do Atlas (gestor com o módulo liberado, ou administrador);
// - servidores do banco do Atlas, limitados aos setores do gestor;
// - envio pela mesma função do servidor (e-mail da Coordenação → RH da Prefeitura);
// - cada envio é gravado no log do Atlas, no mesmo formato da tela do sistema, e aparece
//   no histórico de atestados enviados (marcado como enviado pelo app).
// O scanner (câmera, recorte com correção de perspectiva, filtros e PDF) roda inteiro no aparelho.

const APP_SB_URL = 'https://svzsdaaidmdmyitsrjau.supabase.co';
const APP_SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2enNkYWFpZG1kbXlpdHNyamF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMzc1NDAsImV4cCI6MjA5MDkxMzU0MH0.g2ZklKFxXzko7mGvgjuXpepACqLmGUBEUJiDoi9GC1Y';
const APP_ENVIO_URL = 'https://bgvwaamwgcathojxtjqf.supabase.co/functions/v1/atlas-enviar-atestado';
const APP_MAX_BYTES = 8 * 1024 * 1024;
const APP_SESSAO_LS = 'atlas_app_sessao';
const APP_SESSAO_DIAS = 30;
const APP_ACAO_LOG = 'Documento (app)';

// Regra de perícia (igual ao sistema)
const APP_PERICIA_CONTRATADO_MIN_DIAS = 15;
const APP_PERICIA_EFETIVO_ACIMA_DE = 5;

let _sessao = null;
let _servidores = [];
let _srv = null;
let _whatsRh = '';
let _paginas = [];        // { tipo: 'img', blob, url, w, h } | { tipo: 'pdf', bytes, nome, paginas }
let _historico = [];
let _enviando = false;

// ===================== UTILIDADES =====================
const $ = (id) => document.getElementById(id);
function esc(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

let _toastT = null;
function toast(msg, tipo, ms) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (tipo ? ' ' + tipo : '');
  t.hidden = false;
  clearTimeout(_toastT);
  _toastT = setTimeout(() => { t.hidden = true; }, ms || 3800);
}
function carregando(txt) {
  $('carregando').hidden = !txt;
  if (txt) $('carregando-txt').textContent = txt;
}

async function sha256Hex(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(texto)));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sb(caminho, opcoes) {
  opcoes = opcoes || {};
  const resp = await fetch(APP_SB_URL + '/rest/v1/' + caminho, {
    method: opcoes.method || 'GET',
    headers: Object.assign({ apikey: APP_SB_KEY, Authorization: 'Bearer ' + APP_SB_KEY, 'Content-Type': 'application/json' }, opcoes.headers || {}),
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined
  });
  if (!resp.ok) {
    let msg = 'Erro ' + resp.status;
    try { const d = await resp.json(); msg = d.message || msg; } catch (e) { /* sem corpo */ }
    throw new Error(msg);
  }
  if (resp.status === 204 || opcoes.semRetorno) return null;
  return resp.json();
}

function bytesBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ===================== LOGIN =====================
function arrayDe(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim().startsWith('[')) { try { return JSON.parse(v); } catch (e) { /* texto */ } }
  return [];
}

async function appEntrar(ev) {
  ev.preventDefault();
  const usuario = $('login-usuario').value.trim();
  const senha = $('login-senha').value;
  const btn = $('btn-entrar');
  $('login-erro').textContent = '';
  btn.disabled = true; btn.textContent = 'Verificando…';
  try {
    const gestores = await sb('gestores?select=id,usuario,nome,cargo,role,senha,setores,modulos');
    const hash = await sha256Hex(senha);
    const g = (gestores || []).find((x) => String(x.usuario || '').trim().toLowerCase() === usuario.toLowerCase());
    const senhaBanco = g ? String(g.senha || '').trim() : '';
    const ok = g && (senhaBanco === hash || (!/^[a-f0-9]{64}$/.test(senhaBanco) && senhaBanco === senha));
    if (!ok) throw new Error('Usuário ou senha incorretos.');
    const admin = g.role === 'admin' || String(g.usuario).toLowerCase() === 'admin';
    const modulos = arrayDe(g.modulos);
    if (!admin && modulos.length && !modulos.includes('atestadorh')) {
      throw new Error('Seu usuário não tem o módulo "Enviar Atestado ao RH" liberado. Peça ao administrador.');
    }
    _sessao = {
      id: g.id, usuario: g.usuario, nome: String(g.nome || g.usuario).trim(), cargo: String(g.cargo || '').trim(),
      role: admin ? 'admin' : 'gestor', setores: arrayDe(g.setores), digital: await sha256Hex(senhaBanco),
      ate: Date.now() + APP_SESSAO_DIAS * 864e5
    };
    localStorage.setItem(APP_SESSAO_LS, JSON.stringify(_sessao));
    $('login-senha').value = '';
    await appIniciar();
  } catch (e) {
    $('login-erro').textContent = /fetch|network/i.test(e.message) ? 'Sem conexão com a internet.' : e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
}

// Confere se a sessão salva ainda vale (usuário existe e a senha não mudou)
async function appValidarSessao() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(APP_SESSAO_LS) || 'null'); } catch (e) { s = null; }
  if (!s || !s.id || !s.ate || s.ate < Date.now()) return null;
  try {
    const r = await sb('gestores?select=id,usuario,nome,cargo,role,senha,setores,modulos&id=eq.' + encodeURIComponent(s.id));
    const g = r && r[0];
    if (!g || (await sha256Hex(String(g.senha || '').trim())) !== s.digital) return null;
    const admin = g.role === 'admin' || String(g.usuario).toLowerCase() === 'admin';
    const modulos = arrayDe(g.modulos);
    if (!admin && modulos.length && !modulos.includes('atestadorh')) return null;
    s.nome = String(g.nome || g.usuario).trim(); s.cargo = String(g.cargo || '').trim();
    s.role = admin ? 'admin' : 'gestor'; s.setores = arrayDe(g.setores);
    localStorage.setItem(APP_SESSAO_LS, JSON.stringify(s));
    return s;
  } catch (e) {
    return s;   // sem internet: mantém a sessão e o envio avisará quando falhar
  }
}

function appSair() {
  if (!confirm('Sair do aplicativo?')) return;
  localStorage.removeItem(APP_SESSAO_LS);
  _sessao = null;
  $('tela-app').hidden = true;
  $('tela-login').hidden = false;
}

async function appIniciar() {
  $('tela-login').hidden = true;
  $('tela-app').hidden = false;
  $('topo-usuario').textContent = _sessao.nome + (_sessao.cargo ? ' · ' + _sessao.cargo : '');
  carregando('Carregando servidores…');
  try {
    const lista = await sb('servidores?select=id,nome,matricula,setor,vinculo,cargo&order=nome.asc');
    const setores = _sessao.role === 'gestor' ? _sessao.setores : [];
    _servidores = (lista || []).filter((s) => !setores.length || setores.includes(s.setor));
    localStorage.setItem('atlas_app_servidores', JSON.stringify(_servidores));
  } catch (e) {
    try { _servidores = JSON.parse(localStorage.getItem('atlas_app_servidores') || '[]'); } catch (e2) { _servidores = []; }
    toast('Sem conexão: usando a última lista de servidores salva.', 'erro');
  }
  try {
    const cfg = await sb('configuracoes?select=valor&chave=eq.whatsRhSaude');
    _whatsRh = String((cfg && cfg[0] && cfg[0].valor) || '').replace(/[^\d]/g, '');
  } catch (e) { /* sem número: o WhatsApp abre para escolher a conversa */ }
  carregando('');
  appAtualizarPrevia();
  appRenderPaginas();
}

// ===================== FORMULÁRIO =====================
function appVinculo(srv) { return String((srv && srv.vinculo) || '').toLowerCase() === 'contratado' ? 'contratado' : 'efetivo'; }
function appPrecisaPericia(srv, dias) {
  if (!srv || !dias) return false;
  return appVinculo(srv) === 'contratado' ? dias >= APP_PERICIA_CONTRATADO_MIN_DIAS : dias > APP_PERICIA_EFETIVO_ACIMA_DE;
}
function appTurno() { const v = $('f-duracao').value; return v === 'manha' || v === 'tarde' ? v : ''; }
function appDias() {
  if (appTurno()) return 0.5;
  const n = Math.floor(Number($('f-dias').value));
  return n >= 1 && n <= 365 ? n : 0;
}
function appTextoDuracao(dias, turno) {
  if (dias === 0.5) return 'meio período' + (turno ? ' (turno da ' + (turno === 'tarde' ? 'tarde' : 'manhã') + ')' : '');
  return dias + (dias === 1 ? ' dia' : ' dias');
}
function appTermos(genero) {
  if (genero === 'f') return { trat: 'da servidora', lotado: 'lotada', vinc: { efetivo: 'efetiva', contratado: 'contratada' } };
  if (genero === 'm') return { trat: 'do servidor', lotado: 'lotado', vinc: { efetivo: 'efetivo', contratado: 'contratado' } };
  return { trat: 'do(a) servidor(a)', lotado: 'lotado(a)', vinc: { efetivo: 'efetivo(a)', contratado: 'contratado(a)' } };
}
function appSaudacao() { const h = new Date().getHours(); return h < 12 ? 'Bom dia!' : (h < 18 ? 'Boa tarde!' : 'Boa noite!'); }
function appDescricao(srv, dias, genero, turno) {
  const t = appTermos(genero);
  let s = t.trat + ' ' + srv.nome;
  if (srv.matricula) s += ', matrícula ' + srv.matricula;
  if (srv.setor) s += ', ' + t.lotado + ' no setor ' + srv.setor;
  return s + ', de ' + appTextoDuracao(dias, turno);
}
function appTextoEmail(srv, dias, genero, obs, turno) {
  let txt = appSaudacao() + '\n\nSegue anexo o atestado ' + appDescricao(srv, dias, genero, turno) + '.';
  txt += '\nEncaminhado por: ' + _sessao.nome + (_sessao.cargo ? ' (' + _sessao.cargo + ')' : '') + '.';
  if (obs) txt += '\n\n' + obs;
  txt += '\n\nPor favor, acusar o recebimento.\n\nAtenciosamente,\n' + _sessao.nome;
  if (_sessao.cargo) txt += '\n' + _sessao.cargo;
  return txt + '\nEnviado pelo e-mail da Coordenação de Atenção Primária à Saúde — Itacarambi/MG';
}
function appTextoWhatsApp(srv, dias, genero, quando, turno) {
  const t = appTermos(genero);
  let txt = appSaudacao() + '\n\nInformo que o atestado ' + appDescricao(srv, dias, genero, turno).replace(srv.nome, '*' + srv.nome + '*') +
    ', foi enviado ao e-mail do RH da Prefeitura em ' + quando + '.';
  txt += '\nVínculo: ' + t.vinc[appVinculo(srv)] + '.';
  if (appPrecisaPericia(srv, dias)) txt += '\n\n*Favor agendar perícia.*';
  return txt;
}

function appMudouDuracao() {
  $('campo-dias').style.display = appTurno() ? 'none' : '';
  appAtualizarPrevia();
}

function appAtualizarPrevia() {
  const btn = $('btn-servidor');
  btn.textContent = _srv ? _srv.nome : 'Toque para escolher o servidor…';
  btn.classList.toggle('vazio', !_srv);
  $('srv-info').textContent = _srv ? [_srv.matricula ? 'Mat. ' + _srv.matricula : '', _srv.setor, appVinculo(_srv)].filter(Boolean).join(' · ') : '';
  const dias = appDias();
  const aviso = $('aviso-pericia');
  aviso.hidden = !appPrecisaPericia(_srv, dias);
  aviso.textContent = '⚠️ Pela regra do vínculo (' + appVinculo(_srv) + '), este atestado precisa de perícia: o comprovante do WhatsApp sairá com "Favor agendar perícia".';
  $('previa-box').hidden = !(_srv && dias && _sessao);
  if (_srv && dias && _sessao) $('previa-email').textContent = appTextoEmail(_srv, dias, $('f-genero').value, $('f-obs').value.trim(), appTurno());
}

// ---------- busca de servidor ----------
function appAbrirBusca() {
  $('busca').hidden = false;
  $('busca-texto').value = '';
  appRenderBusca();
  setTimeout(() => $('busca-texto').focus(), 80);
}
function appFecharBusca() { $('busca').hidden = true; }
function appRenderBusca() {
  const q = norm($('busca-texto').value).trim();
  const lista = _servidores.filter((s) => !q || norm([s.nome, s.matricula, s.setor].join(' ')).includes(q)).slice(0, 150);
  $('busca-lista').innerHTML = lista.length ? lista.map((s) =>
    '<div class="busca-item" onclick="appEscolherServidor(\'' + esc(s.id) + '\')"><div class="n">' + esc(s.nome) + '</div>' +
    '<div class="m">Mat. ' + esc(s.matricula || '-') + (s.setor ? ' · ' + esc(s.setor) : '') + ' · ' + esc(appVinculo(s)) + '</div></div>').join('')
    : '<div class="dica" style="padding:16px">Nenhum servidor encontrado.</div>';
}
function appEscolherServidor(id) {
  _srv = _servidores.find((s) => String(s.id) === String(id)) || null;
  appFecharBusca();
  appAtualizarPrevia();
}

function appAba(qual) {
  $('aba-enviar').classList.toggle('ativa', qual === 'enviar');
  $('aba-historico').classList.toggle('ativa', qual === 'historico');
  $('painel-enviar').hidden = qual !== 'enviar';
  $('painel-historico').hidden = qual !== 'historico';
  if (qual === 'historico') appCarregarHistorico();
}

// ===================== PÁGINAS =====================
function appRenderPaginas() {
  const n = _paginas.reduce((t, p) => t + (p.tipo === 'pdf' ? p.paginas : 1), 0);
  $('paginas-resumo').textContent = n ? n + ' página' + (n > 1 ? 's' : '') : 'nenhuma página';
  $('paginas').innerHTML = _paginas.map((p, i) =>
    '<div class="pag">' +
      (p.tipo === 'img'
        ? '<img src="' + p.url + '" alt="" onclick="appVerPagina(' + i + ')">'
        : '<div class="pdf">📄 ' + esc(p.nome) + '<br>' + p.paginas + ' pág.</div>') +
      '<span class="num">' + (i + 1) + '</span>' +
      '<div class="acoes">' +
        '<button onclick="appMoverPagina(' + i + ',-1)" aria-label="Mover para a esquerda">◀</button>' +
        '<button onclick="appRemoverPagina(' + i + ')" aria-label="Remover">🗑</button>' +
        '<button onclick="appMoverPagina(' + i + ',1)" aria-label="Mover para a direita">▶</button>' +
      '</div></div>').join('');
}
function appVerPagina(i) { const p = _paginas[i]; if (!p || p.tipo !== 'img') return; $('ver-pagina-img').src = p.url; $('ver-pagina').hidden = false; }
function appMoverPagina(i, d) {
  const j = i + d;
  if (j < 0 || j >= _paginas.length) return;
  const t = _paginas[i]; _paginas[i] = _paginas[j]; _paginas[j] = t;
  appRenderPaginas();
}
function appRemoverPagina(i) {
  if (!confirm('Remover a página ' + (i + 1) + '?')) return;
  const p = _paginas.splice(i, 1)[0];
  if (p && p.url) URL.revokeObjectURL(p.url);
  appRenderPaginas();
}
function appLimparPaginas() {
  _paginas.forEach((p) => { if (p.url) URL.revokeObjectURL(p.url); });
  _paginas = [];
  appRenderPaginas();
}

// Arquivos da galeria: imagens passam pelo recorte; PDFs entram direto
let _filaImportacao = [];
async function appImportarArquivos(input) {
  const arqs = Array.from(input.files || []);
  input.value = '';
  for (const f of arqs) {
    if (/pdf/i.test(f.type) || /\.pdf$/i.test(f.name)) {
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
        _paginas.push({ tipo: 'pdf', bytes, nome: f.name, paginas: doc.getPageCount() });
      } catch (e) { toast('Não foi possível abrir o PDF ' + f.name + '.', 'erro'); }
    } else if (/^image\//i.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) {
      _filaImportacao.push(f);
    }
  }
  appRenderPaginas();
  scanProximoDaFila();
}
async function scanProximoDaFila() {
  const f = _filaImportacao.shift();
  if (!f) return;
  carregando('Abrindo imagem…');
  try {
    const img = await scanCarregarImagem(f);
    carregando('');
    scanIniciarRecorte(img);
  } catch (e) {
    carregando('');
    toast(e.message, 'erro', 6000);
    scanProximoDaFila();
  }
}

// ===================== SCANNER: CÂMERA =====================
let _stream = null, _flashLigado = false, _voltarParaCamera = false;

async function scanAbrirCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('in-camera').click(); return; }
  try {
    _stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }
    });
  } catch (e) {
    // Sem permissão ou sem câmera ao vivo: usa a câmera do sistema
    $('in-camera').click();
    return;
  }
  const v = $('scan-video');
  v.srcObject = _stream;
  $('scan-camera').hidden = false;
  scanAtualizarContador();
  try {
    const track = _stream.getVideoTracks()[0];
    const cap = track.getCapabilities ? track.getCapabilities() : {};
    $('btn-flash').hidden = !cap.torch;
    if (cap.focusMode && cap.focusMode.includes('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
  } catch (e) { /* recursos opcionais */ }
}
function scanAtualizarContador() {
  const n = _paginas.length;
  $('scan-contador').textContent = n ? n + ' página' + (n > 1 ? 's' : '') : '';
}
function scanPararCamera() {
  if (_stream) _stream.getTracks().forEach((t) => t.stop());
  _stream = null; _flashLigado = false;
  $('scan-video').srcObject = null;
}
function scanFecharCamera() { scanPararCamera(); $('scan-camera').hidden = true; }
function scanGaleriaDaCamera() { scanFecharCamera(); $('in-galeria').click(); }
async function scanFlash() {
  if (!_stream) return;
  _flashLigado = !_flashLigado;
  try { await _stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: _flashLigado }] }); } catch (e) { /* sem flash */ }
}

async function scanCapturar() {
  if (!_stream) return;
  const btn = $('btn-obturador');
  btn.disabled = true;
  try {
    const track = _stream.getVideoTracks()[0];
    let fonte = null;
    // Foto em resolução máxima quando o aparelho permite; senão, o quadro do vídeo
    if (window.ImageCapture) {
      try {
        const blob = await new ImageCapture(track).takePhoto();
        fonte = await scanCarregarImagem(blob);
      } catch (e) { fonte = null; }
    }
    if (!fonte) {
      const v = $('scan-video');
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      fonte = c;
    }
    _voltarParaCamera = true;
    scanFecharCamera();
    scanIniciarRecorte(scanLimitar(fonte, 2600));
  } catch (e) {
    toast('Não foi possível fotografar: ' + e.message, 'erro');
  } finally {
    btn.disabled = false;
  }
}

// Abre uma imagem (arquivo ou foto) já na orientação certa, como canvas
function scanCarregarImagem(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(scanLimitar(c, 2600));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(/heic|heif/i.test(arquivo.type || arquivo.name || '')
        ? 'Formato HEIC não suportado. No iPhone: Ajustes → Câmera → Formatos → "Mais Compatível".'
        : 'Não foi possível abrir a imagem.'));
    };
    img.src = url;
  });
}
function scanLimitar(cv, max) {
  const lado = Math.max(cv.width, cv.height);
  if (lado <= max) return cv;
  const k = max / lado, c = document.createElement('canvas');
  c.width = Math.round(cv.width * k); c.height = Math.round(cv.height * k);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cv, 0, 0, c.width, c.height);
  return c;
}

// ===================== SCANNER: DETECÇÃO DO DOCUMENTO =====================
// Procura a folha (região clara maior) numa versão reduzida da foto e devolve os 4 cantos.
function scanDetectar(cv) {
  const W = 360, k = Math.min(1, W / Math.max(cv.width, cv.height));
  const w = Math.max(8, Math.round(cv.width * k)), h = Math.max(8, Math.round(cv.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.filter = 'blur(2px)';
  ctx.drawImage(cv, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const n = w * h, cinza = new Uint8Array(n), hist = new Array(256).fill(0);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    // papel: claro e pouco saturado
    const v = Math.max(0, Math.min(255, (0.299 * r + 0.587 * g + 0.114 * b) - 0.5 * (Math.max(r, g, b) - Math.min(r, g, b))));
    cinza[i] = v; hist[v | 0]++;
  }
  // Limiar de Otsu
  let soma = 0; for (let t = 0; t < 256; t++) soma += t * hist[t];
  let sB = 0, wB = 0, melhor = 0, limiar = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = n - wB; if (!wF) break;
    sB += t * hist[t];
    const mB = sB / wB, mF = (soma - sB) / wF, entre = wB * wF * (mB - mF) * (mB - mF);
    if (entre > melhor) { melhor = entre; limiar = t; }
  }
  const bin = new Uint8Array(n);
  for (let i = 0; i < n; i++) bin[i] = cinza[i] > limiar ? 1 : 0;
  // Maior região clara (preferindo a que contém o centro)
  const rot = new Int32Array(n), fila = new Int32Array(n);
  let melhorRot = 0, melhorArea = 0, rotulo = 0;
  const centro = (h >> 1) * w + (w >> 1);
  for (let s = 0; s < n; s++) {
    if (!bin[s] || rot[s]) continue;
    rotulo++;
    let ini = 0, fim = 0, area = 0, temCentro = false;
    fila[fim++] = s; rot[s] = rotulo;
    while (ini < fim) {
      const p = fila[ini++]; area++;
      if (p === centro) temCentro = true;
      const x = p % w, y = (p / w) | 0;
      if (x > 0 && bin[p - 1] && !rot[p - 1]) { rot[p - 1] = rotulo; fila[fim++] = p - 1; }
      if (x < w - 1 && bin[p + 1] && !rot[p + 1]) { rot[p + 1] = rotulo; fila[fim++] = p + 1; }
      if (y > 0 && bin[p - w] && !rot[p - w]) { rot[p - w] = rotulo; fila[fim++] = p - w; }
      if (y < h - 1 && bin[p + w] && !rot[p + w]) { rot[p + w] = rotulo; fila[fim++] = p + w; }
    }
    const peso = area * (temCentro ? 1.6 : 1);
    if (peso > melhorArea) { melhorArea = peso; melhorRot = rotulo; }
  }
  if (!melhorRot) return null;
  // Cantos pelos extremos de x+y e x−y
  let tl = null, tr = null, br = null, bl = null, area = 0;
  let mTL = Infinity, mTR = -Infinity, mBR = -Infinity, mBL = Infinity;
  for (let p = 0; p < n; p++) {
    if (rot[p] !== melhorRot) continue;
    area++;
    const x = p % w, y = (p / w) | 0, s1 = x + y, s2 = x - y;
    if (s1 < mTL) { mTL = s1; tl = [x, y]; }
    if (s1 > mBR) { mBR = s1; br = [x, y]; }
    if (s2 > mTR) { mTR = s2; tr = [x, y]; }
    if (s2 < mBL) { mBL = s2; bl = [x, y]; }
  }
  if (area < n * 0.08) return null;
  const q = [tl, tr, br, bl].map((p) => [p[0] / k, p[1] / k]);
  return scanQuadValido(q, cv.width, cv.height) ? q : null;
}

function scanAreaQuad(q) {
  let a = 0;
  for (let i = 0; i < 4; i++) { const p = q[i], r = q[(i + 1) % 4]; a += p[0] * r[1] - r[0] * p[1]; }
  return Math.abs(a) / 2;
}
function scanQuadValido(q, w, h) {
  if (scanAreaQuad(q) < w * h * 0.08) return false;
  // convexo: produtos vetoriais com o mesmo sinal
  let sinal = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (!z) continue;
    if (!sinal) sinal = Math.sign(z); else if (Math.sign(z) !== sinal) return false;
  }
  return true;
}

// ===================== SCANNER: RECORTE =====================
let _fonte = null, _quad = null, _escalaRec = 1, _arrastando = -1;

function scanQuadInteiro(cv) { const w = cv.width, h = cv.height; return [[0, 0], [w, 0], [w, h], [0, h]]; }

function scanIniciarRecorte(cv) {
  _fonte = cv;
  _quad = scanDetectar(cv) || scanQuadInteiro(cv);
  $('scan-recorte').hidden = false;
  requestAnimationFrame(scanDesenharRecorte);
}

function scanDesenharRecorte() {
  const area = $('area-recorte'), canvas = $('cv-recorte'), svg = $('svg-recorte');
  const maxW = area.clientWidth - 24, maxH = area.clientHeight - 24;
  _escalaRec = Math.min(maxW / _fonte.width, maxH / _fonte.height, 1);
  canvas.width = Math.round(_fonte.width * _escalaRec);
  canvas.height = Math.round(_fonte.height * _escalaRec);
  canvas.getContext('2d').drawImage(_fonte, 0, 0, canvas.width, canvas.height);
  const r = canvas.getBoundingClientRect(), ra = area.getBoundingClientRect();
  svg.style.left = (r.left - ra.left) + 'px'; svg.style.top = (r.top - ra.top) + 'px';
  svg.setAttribute('width', canvas.width); svg.setAttribute('height', canvas.height);
  scanDesenharQuad();
}

function scanDesenharQuad() {
  const s = _escalaRec, p = _quad.map((c) => [c[0] * s, c[1] * s]);
  const W = $('cv-recorte').width, H = $('cv-recorte').height;
  const pts = p.map((c) => c.join(',')).join(' ');
  $('svg-recorte').innerHTML =
    '<path d="M0,0H' + W + 'V' + H + 'H0Z M' + p.map((c) => c.join(',')).join(' L') + 'Z" fill="rgba(0,0,0,.45)" fill-rule="evenodd"/>' +
    '<polygon points="' + pts + '" fill="rgba(77,124,255,.12)" stroke="#4d7cff" stroke-width="2.5"/>' +
    p.map((c, i) => '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="15" fill="rgba(77,124,255,.35)" stroke="#fff" stroke-width="3" data-i="' + i + '"/>').join('');
}

function scanPontoDoToque(ev) {
  const r = $('cv-recorte').getBoundingClientRect();
  const t = ev.touches ? ev.touches[0] : ev;
  const x = Math.max(0, Math.min(r.width, t.clientX - r.left)), y = Math.max(0, Math.min(r.height, t.clientY - r.top));
  return [x / _escalaRec, y / _escalaRec];
}
function scanIniciarArrasto(ev) {
  if ($('scan-recorte').hidden) return;
  const p = scanPontoDoToque(ev);
  let melhor = -1, dist = Infinity;
  _quad.forEach((c, i) => { const d = Math.hypot(c[0] - p[0], c[1] - p[1]); if (d < dist) { dist = d; melhor = i; } });
  if (dist * _escalaRec > 60) return;   // toque longe dos cantos
  _arrastando = melhor;
  ev.preventDefault();
}
function scanMoverArrasto(ev) {
  if (_arrastando < 0) return;
  ev.preventDefault();
  _quad[_arrastando] = scanPontoDoToque(ev);
  scanDesenharQuad();
}
function scanSoltarArrasto() { _arrastando = -1; }

function scanRecorteTudo() { _quad = scanQuadInteiro(_fonte); scanDesenharQuad(); }
function scanRecorteAuto() {
  const q = scanDetectar(_fonte);
  if (!q) toast('Não encontrei a folha. Ajuste os cantos com o dedo.', 'erro');
  _quad = q || scanQuadInteiro(_fonte);
  scanDesenharQuad();
}
function scanCancelarRecorte() {
  $('scan-recorte').hidden = true;
  _fonte = null;
  if (_voltarParaCamera) { _voltarParaCamera = false; scanAbrirCamera(); } else scanProximoDaFila();
}

// ===================== SCANNER: CORREÇÃO DE PERSPECTIVA =====================
// Homografia que leva o retângulo de saída (0,0)-(W,H) até o quadrilátero da foto.
function scanHomografia(q, W, H) {
  const dst = [[0, 0], [W, 0], [W, H], [0, H]];
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const x = dst[i][0], y = dst[i][1], u = q[i][0], v = q[i][1];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  // Eliminação de Gauss
  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  return b.map((v, i) => v / A[i][i]);
}

function scanEndireitar(fonte, q) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let W = Math.max(d(q[0], q[1]), d(q[3], q[2])), H = Math.max(d(q[0], q[3]), d(q[1], q[2]));
  const k = Math.min(1, 2000 / Math.max(W, H));
  W = Math.max(50, Math.round(W * k)); H = Math.max(50, Math.round(H * k));
  const h = scanHomografia(q, W, H);
  const sw = fonte.width, sh = fonte.height;
  const src = fonte.getContext('2d').getImageData(0, 0, sw, sh).data;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const octx = out.getContext('2d'), img = octx.createImageData(W, H), o = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const den = h[6] * x + h[7] * y + 1;
      let u = (h[0] * x + h[1] * y + h[2]) / den, v = (h[3] * x + h[4] * y + h[5]) / den;
      if (u < 0) u = 0; else if (u > sw - 1.001) u = sw - 1.001;
      if (v < 0) v = 0; else if (v > sh - 1.001) v = sh - 1.001;
      const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      const oi = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const a = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * fx;
        const b2 = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * fx;
        o[oi + c] = a + (b2 - a) * fy;
      }
      o[oi + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

// ===================== SCANNER: FILTROS =====================
let _endireitada = null, _filtroAtual = 'documento', _giro = 0;

function scanConfirmarRecorte() {
  if (!scanQuadValido(_quad, _fonte.width, _fonte.height)) return toast('Os cantos formam uma área inválida. Ajuste-os.', 'erro');
  carregando('Endireitando…');
  setTimeout(() => {
    try {
      _endireitada = scanEndireitar(_fonte, _quad);
      _giro = 0;
      $('scan-recorte').hidden = true;
      $('scan-filtro').hidden = false;
      scanFiltro(_filtroAtual);
    } catch (e) { toast('Erro ao processar a imagem: ' + e.message, 'erro'); }
    carregando('');
  }, 30);
}
function scanVoltarRecorte() { $('scan-filtro').hidden = true; $('scan-recorte').hidden = false; requestAnimationFrame(scanDesenharRecorte); }
function scanGirar() { _giro = (_giro + 90) % 360; scanFiltro(_filtroAtual); }

// Fundo estimado (desfoque forte) para clarear o papel e tirar sombras
function scanFundo(cv) {
  const p = document.createElement('canvas');
  p.width = Math.max(4, Math.round(cv.width / 24)); p.height = Math.max(4, Math.round(cv.height / 24));
  const pc = p.getContext('2d'); pc.filter = 'blur(2px)'; pc.drawImage(cv, 0, 0, p.width, p.height);
  const g = document.createElement('canvas'); g.width = cv.width; g.height = cv.height;
  const gc = g.getContext('2d'); gc.imageSmoothingQuality = 'high'; gc.drawImage(p, 0, 0, g.width, g.height);
  return gc.getImageData(0, 0, g.width, g.height).data;
}

function scanAplicarFiltro(base, filtro) {
  const c = document.createElement('canvas'); c.width = base.width; c.height = base.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(base, 0, 0);
  if (filtro === 'original') return c;
  const im = ctx.getImageData(0, 0, c.width, c.height), d = im.data;
  const fundo = filtro === 'cinza' ? null : scanFundo(base);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (filtro === 'cinza') {
      const v = 0.299 * r + 0.587 * g + 0.114 * b;
      const s = Math.min(255, Math.max(0, (v - 30) * 1.25));
      d[i] = d[i + 1] = d[i + 2] = s;
      continue;
    }
    const fr = Math.max(fundo[i], 40), fg = Math.max(fundo[i + 1], 40), fb = Math.max(fundo[i + 2], 40);
    if (filtro === 'documento') {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b, lf = 0.299 * fr + 0.587 * fg + 0.114 * fb;
      let v = lum / lf * 255;                        // papel → branco
      v = (v - 95) * 255 / (235 - 95);                // contraste para o texto
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      d[i] = d[i + 1] = d[i + 2] = v;
    } else {                                          // realçado: mantém a cor (carimbos, assinaturas)
      const ajusta = (x, f) => { let v = x / f * 255; v = (v - 40) * 255 / (245 - 40); return v < 0 ? 0 : v > 255 ? 255 : v; };
      d[i] = ajusta(r, fr); d[i + 1] = ajusta(g, fg); d[i + 2] = ajusta(b, fb);
    }
  }
  ctx.putImageData(im, 0, 0);
  return c;
}

function scanGirarCanvas(cv, graus) {
  if (!graus) return cv;
  const c = document.createElement('canvas');
  const deitado = graus === 90 || graus === 270;
  c.width = deitado ? cv.height : cv.width; c.height = deitado ? cv.width : cv.height;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2); ctx.rotate(graus * Math.PI / 180);
  ctx.drawImage(cv, -cv.width / 2, -cv.height / 2);
  return c;
}

let _resultado = null;
function scanFiltro(f) {
  _filtroAtual = f;
  document.querySelectorAll('.chip').forEach((b) => b.classList.toggle('ativo', b.dataset.f === f));
  carregando('Aplicando…');
  setTimeout(() => {
    _resultado = scanGirarCanvas(scanAplicarFiltro(_endireitada, f), _giro);
    const v = $('cv-filtro'), area = v.parentElement;
    const k = Math.min((area.clientWidth - 20) / _resultado.width, (area.clientHeight - 20) / _resultado.height, 1);
    v.width = Math.round(_resultado.width * k); v.height = Math.round(_resultado.height * k);
    v.getContext('2d').drawImage(_resultado, 0, 0, v.width, v.height);
    carregando('');
  }, 20);
}

function scanUsarPagina(outra) {
  if (!_resultado) return;
  const qualidade = _filtroAtual === 'documento' || _filtroAtual === 'cinza' ? 0.72 : 0.8;
  _resultado.toBlob((blob) => {
    _paginas.push({ tipo: 'img', blob, url: URL.createObjectURL(blob), w: _resultado.width, h: _resultado.height });
    appRenderPaginas();
    $('scan-filtro').hidden = true;
    _fonte = null; _endireitada = null;
    const daCamera = _voltarParaCamera;
    _voltarParaCamera = false;
    if (_filaImportacao.length) { scanProximoDaFila(); return; }
    if (outra) scanAbrirCamera();
    else toast('Página ' + _paginas.length + ' adicionada.', 'ok', 2000);
    if (!outra && daCamera) { /* volta ao formulário */ }
  }, 'image/jpeg', qualidade);
}

// ===================== PDF E ENVIO =====================
async function appMontarPdf() {
  const L = PDFLib;
  const doc = await L.PDFDocument.create();
  const A4 = [595.28, 841.89], M = 12;
  for (const p of _paginas) {
    if (p.tipo === 'pdf') {
      const origem = await L.PDFDocument.load(p.bytes, { ignoreEncryption: true });
      (await doc.copyPages(origem, origem.getPageIndices())).forEach((pg) => doc.addPage(pg));
      continue;
    }
    const jpg = await doc.embedJpg(new Uint8Array(await p.blob.arrayBuffer()));
    const deitada = p.w > p.h;
    const pw = deitada ? A4[1] : A4[0], ph = deitada ? A4[0] : A4[1];
    const k = Math.min((pw - 2 * M) / p.w, (ph - 2 * M) / p.h);
    const w = p.w * k, h = p.h * k;
    doc.addPage([pw, ph]).drawImage(jpg, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  }
  doc.setTitle('Atestado - ' + _srv.nome);
  doc.setCreator('Atlas Atestados (app)');
  doc.setProducer('Atlas Saúde');
  return doc.save();
}

function appNomeArquivo(srv) {
  const base = String(srv.nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return 'Atestado_' + (base || 'servidor') + '.pdf';
}

async function appEnviar() {
  if (_enviando) return;
  const srv = _srv, dias = appDias(), turno = appTurno(), genero = $('f-genero').value, obs = $('f-obs').value.trim();
  if (!srv) return toast('Escolha o servidor.', 'erro');
  if (!dias) return toast('Informe de quantos dias é o atestado.', 'erro');
  if (!_paginas.length) return toast('Escaneie ou anexe o atestado.', 'erro');
  if (!confirm('Enviar o atestado de ' + srv.nome + ' (' + appTextoDuracao(dias, turno) + ') ao RH da Prefeitura?')) return;

  _enviando = true;
  const btn = $('btn-enviar'); btn.disabled = true;
  try {
    carregando('Montando o PDF…');
    const pdf = await appMontarPdf();
    if (pdf.length > APP_MAX_BYTES) throw new Error('O PDF ficou com mais de 8 MB. Remova alguma página.');
    const nome = appNomeArquivo(srv);
    carregando('Enviando ao RH…');
    const resp = await fetch(APP_ENVIO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profissional: srv.nome, matricula: srv.matricula || '', setor: srv.setor || '',
        dias, turno, genero, observacao: obs, nomeArquivo: nome, pdfBase64: bytesBase64(pdf),
        enviadoPor: _sessao.nome || '', cargoEnviadoPor: _sessao.cargo || ''
      })
    });
    let dados = {};
    try { dados = await resp.json(); } catch (e) { /* sem corpo */ }
    if (!resp.ok || !dados.ok) throw new Error(dados.erro || 'Falha no envio (código ' + resp.status + ').');

    // Registro no Atlas Saúde (mesmo formato da tela do sistema)
    const agora = new Date();
    const pericia = appPrecisaPericia(srv, dias);
    const log = {
      id: uid(), usuarioId: _sessao.id, usuarioNome: _sessao.nome, usuarioRole: _sessao.role,
      acao: APP_ACAO_LOG,
      detalhes: 'Enviou atestado de ' + srv.nome + ' (' + appTextoDuracao(dias, turno) + (pericia ? ', com perícia' : '') + ') por e-mail ao RH (' + nome + ')',
      tabela: 'servidores', registroId: srv.id, criadoEm: agora.toISOString()
    };
    let registrado = true;
    try { await sb('logs', { method: 'POST', body: log, headers: { Prefer: 'return=minimal' }, semRetorno: true }); }
    catch (e) { registrado = false; console.warn('Log:', e); }

    const quando = agora.toLocaleDateString('pt-BR') + ' às ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const textoZap = appTextoWhatsApp(srv, dias, genero, quando, turno);
    carregando('');
    // Limpa o formulário
    _srv = null; $('f-dias').value = ''; $('f-obs').value = ''; $('f-duracao').value = 'dias';
    appMudouDuracao(); appLimparPaginas();
    appPerguntarWhatsApp(srv.nome, textoZap, registrado);
  } catch (e) {
    carregando('');
    toast(/fetch|network/i.test(e.message) ? 'Sem conexão com a internet. Nada foi enviado.' : e.message, 'erro', 7000);
  } finally {
    _enviando = false; btn.disabled = false;
  }
}

function appLinkWhatsApp(texto) {
  let num = _whatsRh;
  if (num && num.length <= 11) num = '55' + num;
  return 'https://wa.me/' + num + '?text=' + encodeURIComponent(texto);
}

function appPerguntarWhatsApp(nome, texto, registrado) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = '<div class="modal-caixa">' +
    '<h3>✅ Atestado enviado</h3>' +
    '<div class="dica" style="margin-bottom:8px">O e-mail com o atestado de <strong>' + esc(nome) + '</strong> foi enviado ao RH da Prefeitura' +
    (registrado ? ' e já aparece no histórico do Atlas Saúde.' : '. <span style="color:#fcd34d">Não consegui registrar no histórico do Atlas.</span>') + '</div>' +
    '<div style="font-weight:600;margin-top:10px">Enviar o comprovante ao WhatsApp do RH da Secretaria de Saúde?</div>' +
    '<pre>' + esc(texto) + '</pre>' +
    '<button class="btn btn-sucesso" id="btn-zap">💬 Abrir o WhatsApp</button>' +
    '<button class="btn" onclick="this.closest(\'.modal\').remove()">Agora não</button></div>';
  document.body.appendChild(m);
  m.querySelector('#btn-zap').onclick = () => { appAbrirExterno(appLinkWhatsApp(texto)); m.remove(); };
}

// No aplicativo Android, links externos (WhatsApp) saem do app; no navegador, abrem em nova aba
function appAbrirExterno(url) {
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) location.href = url;
  else window.open(url, '_blank', 'noopener');
}

// ===================== HISTÓRICO =====================
async function appCarregarHistorico() {
  $('historico').innerHTML = '<div class="dica">Carregando…</div>';
  try {
    const logs = await sb('logs?select=id,detalhes,criadoEm,usuarioNome,registroId,acao&detalhes=ilike.' +
      encodeURIComponent('Enviou atestado de*') + '&order=criadoEm.desc&limit=300');
    const permitidos = new Set(_servidores.map((s) => String(s.id)));
    _historico = (logs || []).map((l) => {
      const m = /^Enviou atestado de (.+?) \((.+?)\) por e-mail ao RH \((.*)\)$/.exec(String(l.detalhes || ''));
      if (!m) return null;
      return { srvId: String(l.registroId || ''), nome: m[1], duracao: m[2].replace(/, com perícia$/, ''), pericia: /, com perícia$/.test(m[2]),
        arquivo: m[3], em: l.criadoEm, por: l.usuarioNome || '', app: l.acao === APP_ACAO_LOG };
    }).filter((h) => h && (_sessao.role === 'admin' || permitidos.has(h.srvId)));
    appRenderHistorico();
  } catch (e) {
    $('historico').innerHTML = '<div class="dica">Não foi possível carregar (' + esc(e.message) + ').</div>';
  }
}

function appRenderHistorico() {
  const q = norm($('hist-busca').value).trim();
  const lista = _historico.filter((h) => !q || norm(h.nome).includes(q));
  $('historico').innerHTML = lista.length ? lista.map((h, i) => {
    const d = new Date(h.em);
    return '<div class="hist-item"><div class="hist-nome">' + esc(h.nome) +
      (h.pericia ? '<span class="tag alerta">perícia</span>' : '') + (h.app ? '<span class="tag">📱 app</span>' : '') + '</div>' +
      '<div class="hist-meta">' + esc(h.duracao) + ' · ' + esc(d.toLocaleDateString('pt-BR')) + ' às ' +
      esc(d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })) + (h.por ? '<br>Enviado por ' + esc(h.por) : '') + '</div>' +
      '<div class="hist-acoes"><button class="btn btn-mini" onclick="appZapHistorico(' + _historico.indexOf(h) + ')">💬 Comprovante no WhatsApp</button></div></div>';
  }).join('') : '<div class="dica">Nenhum atestado encontrado.</div>';
}

function appZapHistorico(i) {
  const h = _historico[i];
  if (!h) return;
  const srv = _servidores.find((s) => String(s.id) === h.srvId) || { nome: h.nome, matricula: '', setor: '', vinculo: '' };
  let dias = parseInt(h.duracao, 10), turno = '';
  if (/^meio período/.test(h.duracao)) { dias = 0.5; turno = /tarde/.test(h.duracao) ? 'tarde' : 'manha'; }
  const d = new Date(h.em);
  const texto = appTextoWhatsApp(srv, dias, '', d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), turno);
  appAbrirExterno(appLinkWhatsApp(texto));
}

// ===================== INÍCIO =====================
// Botão "voltar" do Android: fecha a tela aberta em vez de sair do aplicativo
function appBotaoVoltar() {
  const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (!P) return;
  P.addListener('backButton', () => {
    const modal = document.querySelector('.modal');
    if (modal) return modal.remove();
    if (!$('ver-pagina').hidden) { $('ver-pagina').hidden = true; return; }
    if (!$('scan-filtro').hidden) return scanVoltarRecorte();
    if (!$('scan-recorte').hidden) return scanCancelarRecorte();
    if (!$('scan-camera').hidden) return scanFecharCamera();
    if (!$('busca').hidden) return appFecharBusca();
    if (!$('painel-historico').hidden) return appAba('enviar');
    P.minimizeApp ? P.minimizeApp() : P.exitApp();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const area = $('area-recorte');
  area.addEventListener('touchstart', scanIniciarArrasto, { passive: false });
  area.addEventListener('touchmove', scanMoverArrasto, { passive: false });
  area.addEventListener('touchend', scanSoltarArrasto);
  area.addEventListener('mousedown', scanIniciarArrasto);
  window.addEventListener('mousemove', scanMoverArrasto);
  window.addEventListener('mouseup', scanSoltarArrasto);
  window.addEventListener('resize', () => { if (!$('scan-recorte').hidden && _fonte) scanDesenharRecorte(); });

  appBotaoVoltar();
  carregando('Abrindo…');
  const s = await appValidarSessao();
  carregando('');
  if (s) { _sessao = s; appIniciar(); }
  else { localStorage.removeItem(APP_SESSAO_LS); $('tela-login').hidden = false; }
});
