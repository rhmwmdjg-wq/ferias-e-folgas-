// Módulo Enviar Atestado ao RH.
// Anexa o PDF de um atestado e envia por e-mail ao RH da Prefeitura, saindo pela
// conta de e-mail da Coordenação de Atenção Primária. Depois do envio, oferece
// mandar o comprovante pelo WhatsApp ao RH da Secretaria de Saúde.
//
// O envio do e-mail é feito por uma função no servidor (Supabase). O destinatário,
// o remetente e a senha do e-mail ficam somente lá — nada disso existe neste arquivo.
// O PDF não é armazenado: só fica o registro de que foi enviado (no log do sistema),
// que alimenta o histórico de atestados enviados desta tela.

const ATESTADO_RH_URL = 'https://bgvwaamwgcathojxtjqf.supabase.co/functions/v1/atlas-enviar-atestado';
const ATESTADO_RH_MAX_BYTES = 8 * 1024 * 1024;

// Regra de perícia médica conforme o vínculo do servidor
const AR_PERICIA_CONTRATADO_MIN_DIAS = 15; // contratado: 15 dias ou mais
const AR_PERICIA_EFETIVO_ACIMA_DE = 5;     // efetivo: acima de 5 dias

let _arEnviando = false;
let _arHistorico = [];      // atestados enviados (do log do sistema), mais recentes primeiro
let _arHistCarregado = false;

function arEsc(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function arVinculo(srv) {
  return String((srv && srv.vinculo) || '').toLowerCase() === 'contratado' ? 'contratado' : 'efetivo';
}

function arPrecisaPericia(srv, dias) {
  if (!srv || !dias) return false;
  return arVinculo(srv) === 'contratado'
    ? dias >= AR_PERICIA_CONTRATADO_MIN_DIAS
    : dias > AR_PERICIA_EFETIVO_ACIMA_DE;
}

function arSaudacao() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia!' : (h < 18 ? 'Boa tarde!' : 'Boa noite!');
}

function arTermos(genero) {
  if (genero === 'f') return { trat: 'da servidora', lotado: 'lotada', vinc: { efetivo: 'efetiva', contratado: 'contratada' } };
  if (genero === 'm') return { trat: 'do servidor', lotado: 'lotado', vinc: { efetivo: 'efetivo', contratado: 'contratado' } };
  return { trat: 'do(a) servidor(a)', lotado: 'lotado(a)', vinc: { efetivo: 'efetivo(a)', contratado: 'contratado(a)' } };
}

// Quem está enviando: nome e cargo do usuário logado (para gestores, o próprio cadastro;
// sem cair no nome/cargo do coordenador)
function arRemetenteAtual() {
  let sessao = {};
  try { sessao = JSON.parse(sessionStorage.getItem('ferias_sessao') || '{}'); } catch (e) { /* sem sessão */ }
  let gestor = null;
  try {
    gestor = DB.gestores().find(function (g) {
      return (sessao.id && g.id === sessao.id) || (sessao.usuario && String(g.usuario || '').toLowerCase() === String(sessao.usuario).toLowerCase());
    });
  } catch (e) { /* sem gestores */ }
  if (sessao.role !== 'admin' && gestor) {
    return { nome: String(gestor.nome || sessao.nome || '').trim(), cargo: String(gestor.cargo || sessao.cargo || '').trim() };
  }
  const a = (typeof getAssinanteAtual === 'function') ? getAssinanteAtual() : {};
  return { nome: String(a.nome || sessao.nome || '').trim(), cargo: String(a.cargo || '').trim() };
}

// Trecho comum: "do servidor FULANO, matrícula 123, lotado no setor X, de 3 dias"
function arDescricao(srv, dias, genero, turno) {
  const t = arTermos(genero);
  let s = t.trat + ' ' + srv.nome;
  if (srv.matricula) s += ', matrícula ' + srv.matricula;
  if (srv.setor) s += ', ' + t.lotado + ' no setor ' + srv.setor;
  s += ', de ' + arTextoDuracao(dias, turno);
  return s;
}

// "3 dias", "1 dia" ou "meio período (turno da manhã)"
function arTextoDuracao(dias, turno) {
  if (turno === undefined) turno = arTurnoInformado();
  if (dias === 0.5) return 'meio período' + (turno ? ' (turno da ' + (turno === 'tarde' ? 'tarde' : 'manhã') + ')' : '');
  return dias + (dias === 1 ? ' dia' : ' dias');
}

// Mesmo texto que a função do servidor monta para o e-mail
function arTextoEmail(srv, dias, genero, obs, turno, rem) {
  rem = rem || arRemetenteAtual();
  let txt = arSaudacao() + '\n\nSegue anexo o atestado ' + arDescricao(srv, dias, genero, turno) + '.';
  if (rem.nome) txt += '\nEncaminhado por: ' + rem.nome + (rem.cargo ? ' (' + rem.cargo + ')' : '') + '.';
  if (obs) txt += '\n\n' + obs;
  txt += '\n\nPor favor, acusar o recebimento.\n\nAtenciosamente,';
  if (rem.nome) txt += '\n' + rem.nome;
  if (rem.cargo) txt += '\n' + rem.cargo;
  return txt + '\nEnviado pelo e-mail da Coordenação de Atenção Primária à Saúde — Itacarambi/MG';
}

function arTextoWhatsApp(srv, dias, genero, quando, turno) {
  const t = arTermos(genero);
  let txt = arSaudacao() + '\n\nInformo que o atestado ' + arDescricao(srv, dias, genero, turno).replace(srv.nome, '*' + srv.nome + '*') +
    ', foi enviado ao e-mail do RH da Prefeitura em ' + quando + '.';
  txt += '\nVínculo: ' + t.vinc[arVinculo(srv)] + '.';
  if (arPrecisaPericia(srv, dias)) txt += '\n\n*Favor agendar perícia.*';
  return txt;
}

function arSrvSelecionado() {
  const id = document.getElementById('ar-servidor').value;
  return id ? DB.servidores().find(function (s) { return s.id === id; }) : null;
}

// Turno do meio período ('manha' ou 'tarde'); vazio quando o atestado é de dias inteiros
function arTurnoInformado() {
  const el = document.getElementById('ar-duracao');
  const v = el ? el.value : 'dias';
  return (v === 'manha' || v === 'tarde') ? v : '';
}

function arDiasInformados() {
  if (arTurnoInformado()) return 0.5;
  const n = Math.floor(Number(document.getElementById('ar-dias').value));
  return (n >= 1 && n <= 365) ? n : 0;
}

// Mostra ou esconde o campo de dias conforme a duração escolhida
function arMudarDuracao() {
  const meio = !!arTurnoInformado();
  const campo = document.getElementById('ar-dias-campo');
  if (campo) campo.style.display = meio ? 'none' : '';
  arAtualizarPrevia();
}

function renderAtestadoRH() {
  const sel = document.getElementById('ar-servidor');
  if (!sel) return;
  const atual = sel.value;
  const srvs = (typeof getServidoresAcessiveis === 'function' ? getServidoresAcessiveis() : DB.servidores())
    .slice().sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
  sel.innerHTML = '<option value="">Selecione o servidor...</option>' +
    srvs.map(function (s) {
      return '<option value="' + arEsc(s.id) + '">' + arEsc(s.nome) + ' (Mat. ' + arEsc(s.matricula || '-') + ')</option>';
    }).join('');
  if (atual) sel.value = atual;
  const zap = document.getElementById('ar-whats-rh');
  if (zap && document.activeElement !== zap) zap.value = (DB.config().whatsRhSaude || '');
  arAtualizarPrevia();
  arCarregarHistorico();
}

// Mostra os dados do servidor, o aviso de perícia e a prévia do e-mail
function arAtualizarPrevia() {
  const srv = arSrvSelecionado();
  const dias = arDiasInformados();
  const genero = document.getElementById('ar-genero').value;
  const info = document.getElementById('ar-srv-info');
  const previa = document.getElementById('ar-previa');
  const pericia = document.getElementById('ar-pericia');

  if (!srv) {
    info.style.display = 'none'; previa.style.display = 'none'; pericia.style.display = 'none';
    return;
  }
  const vinc = arVinculo(srv) === 'contratado' ? 'Contratado' : 'Efetivo';
  const campo = function (rot, val) {
    return '<div><span style="font-size:.7rem;color:var(--muted);text-transform:uppercase;display:block">' + rot + '</span><strong>' + arEsc(val || '-') + '</strong></div>';
  };
  info.style.display = 'block';
  info.innerHTML = '<div style="display:flex;gap:20px;flex-wrap:wrap">' +
    campo('Matrícula', srv.matricula) + campo('Setor', srv.setor) + campo('Cargo', srv.cargo) + campo('Vínculo', vinc) + '</div>';

  if (!dias) { previa.style.display = 'none'; pericia.style.display = 'none'; return; }

  const precisa = arPrecisaPericia(srv, dias);
  pericia.style.display = 'block';
  pericia.style.borderColor = precisa ? 'var(--warning, #f59e0b)' : 'var(--border)';
  pericia.innerHTML = precisa
    ? '⚠️ <strong>Precisa de perícia:</strong> servidor ' + vinc.toLowerCase() + ' com atestado de ' + dias + ' dias. A mensagem do WhatsApp sairá com "Favor agendar perícia".'
    : 'ℹ️ Sem perícia: servidor ' + vinc.toLowerCase() + ' com atestado de ' + arTextoDuracao(dias) + '.';

  previa.style.display = 'block';
  document.getElementById('ar-previa-texto').textContent =
    arTextoEmail(srv, dias, genero, document.getElementById('ar-obs').value.trim());
  const rem = arRemetenteAtual();
  const aviso = document.getElementById('ar-remetente-aviso');
  if (aviso) {
    aviso.style.display = rem.cargo ? 'none' : 'block';
    aviso.textContent = rem.cargo ? '' : '⚠️ Seu cargo não está cadastrado: o e-mail sairá só com o seu nome. Peça ao administrador para preencher o cargo em Gerenciar Gestores.';
  }
}

// ---------- Arquivo do atestado: PDF ou fotos (convertidas em PDF aqui mesmo) ----------
// Aceita um ou mais arquivos: PDFs e/ou imagens (JPG, PNG, WEBP…). Tudo vira um único PDF A4,
// na ordem em que foram escolhidos — útil para frente e verso. Nada sai do navegador antes do envio.
let _arArquivo = null;       // { bytes: Uint8Array, nome, paginas, convertido }
let _arArquivoUrl = '';
let _arPreparo = null;       // promessa em andamento

function arEhPdf(f) { return /\.pdf$/i.test(f.name) || f.type === 'application/pdf'; }
function arEhImagem(f) { return /^image\//i.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(f.name); }
function arEhHeic(f) { return /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name); }

function arNomeBase(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

// Lê a imagem já na orientação certa (fotos de celular) e reduz para até 2000 px, em JPEG
function arImagemParaJpeg(file) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      try {
        const lado = Math.max(img.naturalWidth, img.naturalHeight) || 1;
        const k = Math.min(1, 2000 / lado);
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.naturalWidth * k));
        cv.height = Math.max(1, Math.round(img.naturalHeight * k));
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cv.width, cv.height);   // fundo branco para PNG transparente
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(function (b) {
          if (!b) return reject(new Error('Não foi possível converter ' + file.name + '.'));
          b.arrayBuffer().then(function (ab) { resolve({ bytes: new Uint8Array(ab), w: cv.width, h: cv.height }); }, reject);
        }, 'image/jpeg', 0.85);
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error(arEhHeic(file)
        ? 'O navegador não abre fotos HEIC do iPhone (' + file.name + '). No iPhone, vá em Ajustes → Câmera → Formatos e escolha "Mais Compatível", ou envie um print/foto em JPG.'
        : 'Não foi possível abrir a imagem ' + file.name + '.'));
    };
    img.src = url;
  });
}

async function arMontarPdf(files, srv) {
  if (typeof PDFLib === 'undefined') throw new Error('Biblioteca de PDF não carregou. Verifique a internet e recarregue a página.');
  // Um único PDF: vai como está, sem regravar
  if (files.length === 1 && arEhPdf(files[0])) {
    return { bytes: new Uint8Array(await files[0].arrayBuffer()), nome: files[0].name, paginas: null, convertido: false };
  }
  const L = PDFLib;
  const doc = await L.PDFDocument.create();
  const A4 = [595.28, 841.89], M = 24;
  for (const f of files) {
    if (arEhPdf(f)) {
      let origem;
      try { origem = await L.PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true }); }
      catch (e) { throw new Error('Não foi possível abrir o PDF ' + f.name + '.'); }
      const pags = await doc.copyPages(origem, origem.getPageIndices());
      pags.forEach(function (p) { doc.addPage(p); });
    } else {
      const im = await arImagemParaJpeg(f);
      const jpg = await doc.embedJpg(im.bytes);
      // Página em pé ou deitada conforme a foto, com a imagem centralizada e inteira
      const deitada = im.w > im.h;
      const pw = deitada ? A4[1] : A4[0], ph = deitada ? A4[0] : A4[1];
      const k = Math.min((pw - 2 * M) / im.w, (ph - 2 * M) / im.h);
      const w = im.w * k, h = im.h * k;
      const pg = doc.addPage([pw, ph]);
      pg.drawImage(jpg, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
  }
  doc.setTitle('Atestado' + (srv ? ' - ' + srv.nome : ''));
  doc.setCreator('Atlas Saúde');
  doc.setProducer('Atlas Saúde');
  const bytes = await doc.save();
  const base = arNomeBase(srv ? srv.nome : '') || arNomeBase(files[0].name.replace(/\.[^.]+$/, '')) || 'documento';
  return { bytes: bytes, nome: 'Atestado_' + base + '.pdf', paginas: doc.getPageCount(), convertido: true };
}

function arLimparArquivo() {
  _arArquivo = null; _arPreparo = null;
  if (_arArquivoUrl) { URL.revokeObjectURL(_arArquivoUrl); _arArquivoUrl = ''; }
}

async function arArquivoSelecionado() {
  const input = document.getElementById('ar-pdf');
  const info = document.getElementById('ar-pdf-info');
  arLimparArquivo();
  const files = Array.from(input.files || []);
  if (!files.length) { info.textContent = ''; return; }
  const invalido = files.find(function (f) { return !arEhPdf(f) && !arEhImagem(f); });
  if (invalido) {
    info.innerHTML = '<span style="color:var(--danger)">⚠️ ' + arEsc(invalido.name) + ' não é PDF nem imagem.</span>';
    input.value = '';
    return;
  }
  const temImagem = files.some(arEhImagem);
  info.textContent = temImagem || files.length > 1 ? '⏳ Montando o PDF...' : '';
  const prep = arMontarPdf(files, arSrvSelecionado());
  _arPreparo = prep;
  try {
    const r = await prep;
    if (_arPreparo !== prep) return;   // o usuário trocou o arquivo enquanto montava
    _arArquivo = r;
    const mb = (r.bytes.length / 1024 / 1024).toFixed(2).replace('.', ',');
    _arArquivoUrl = URL.createObjectURL(new Blob([r.bytes], { type: 'application/pdf' }));
    const ver = ' <a href="' + _arArquivoUrl + '" target="_blank" rel="noopener" style="color:var(--primary);font-weight:600">👁️ Ver PDF</a>';
    if (r.bytes.length > ATESTADO_RH_MAX_BYTES) {
      info.innerHTML = '<span style="color:var(--danger)">⚠️ ' + arEsc(r.nome) + ' ficou com ' + mb + ' MB. O limite é 8 MB.</span>' + ver;
    } else if (r.convertido) {
      info.innerHTML = '✅ ' + files.length + ' arquivo(s) convertido(s) em PDF: <strong>' + arEsc(r.nome) + '</strong> (' + r.paginas + ' página' + (r.paginas > 1 ? 's' : '') + ', ' + mb + ' MB).' + ver;
    } else {
      info.innerHTML = '📎 ' + arEsc(r.nome) + ' (' + mb + ' MB)' + ver;
    }
  } catch (e) {
    if (_arPreparo !== prep) return;
    console.error(e);
    _arPreparo = null;
    info.innerHTML = '<span style="color:var(--danger)">⚠️ ' + arEsc(e.message || 'Não foi possível montar o PDF.') + '</span>';
  }
}

function arBytesBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ---------- WhatsApp do RH da Secretaria de Saúde ----------

async function arSalvarWhatsRH() {
  const num = document.getElementById('ar-whats-rh').value.replace(/\D/g, '');
  if (num && (num.length < 10 || num.length > 13)) return toastMsg('Número inválido. Use DDD + número, ex.: 38 99999-9999.', 'warning');
  const cfg = DB.config();
  cfg.whatsRhSaude = num;
  await DB.saveConfig(cfg);
  toastMsg(num ? 'WhatsApp do RH da Secretaria salvo!' : 'WhatsApp do RH removido.', 'success');
}

function arLinkWhatsApp(texto) {
  let num = String(DB.config().whatsRhSaude || '').replace(/\D/g, '');
  if (num && num.length <= 11) num = '55' + num;
  const celular = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (celular) return 'https://wa.me/' + num + '?text=' + encodeURIComponent(texto);
  // No computador abre direto o WhatsApp Web, já na conversa e com o texto pronto
  return 'https://web.whatsapp.com/send?' + (num ? 'phone=' + num + '&' : '') + 'text=' + encodeURIComponent(texto);
}

function arAbrirWhatsApp(idx) {
  const e = _arHistorico[idx];
  if (!e) return;
  const w = window.open(arLinkWhatsApp(arTextoWhatsAppDe(e)), '_blank', 'noopener');
  if (w) w.opener = null;
  arFecharPergunta();
}

function arFecharPergunta() {
  const box = document.getElementById('ar-pergunta-whats');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
}

// Texto do WhatsApp de um envio do histórico (o do envio atual já vem pronto, com o gênero escolhido)
function arTextoWhatsAppDe(e) {
  if (e.textoWhats) return e.textoWhats;
  const srv = DB.servidores().find(function (s) { return s.id === e.srvId; }) || { nome: e.profissional, matricula: '', setor: '' };
  const d = new Date(e.criadoEm);
  const quando = d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return arTextoWhatsApp(srv, e.dias, '', quando, e.turno || '');
}

function arPerguntarWhatsApp() {
  const box = document.getElementById('ar-pergunta-whats');
  const e = _arHistorico[0];
  if (!box || !e) return;
  const semNumero = !String(DB.config().whatsRhSaude || '').replace(/\D/g, '');
  box.style.display = 'block';
  box.innerHTML =
    '<div style="font-weight:800;margin-bottom:6px">✅ E-mail enviado ao RH da Prefeitura.</div>' +
    '<div style="margin-bottom:10px">Deseja enviar o comprovante para o WhatsApp do RH da Secretaria de Saúde?</div>' +
    '<pre style="white-space:pre-wrap;font:inherit;font-size:.82rem;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px;margin:0 0 10px">' + arEsc(arTextoWhatsAppDe(e)) + '</pre>' +
    (semNumero ? '<div style="font-size:.78rem;opacity:.75;margin-bottom:10px">O número do RH da Secretaria ainda não foi cadastrado (campo no fim desta tela). O WhatsApp vai abrir com o texto pronto para você escolher a conversa.</div>' : '') +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<button type="button" class="btn btn-success" onclick="arAbrirWhatsApp(0)">💬 Sim, abrir o WhatsApp</button>' +
    '<button type="button" class="btn btn-ghost" onclick="arFecharPergunta()">Agora não</button></div>';
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------- Histórico de atestados enviados ----------
// Cada envio grava no log do sistema: "Enviou atestado de NOME (DURAÇÃO[, com perícia]) por e-mail ao RH (ARQUIVO)",
// com o id do servidor. O histórico é montado a partir desses registros.

function arLerRegistroLog(l) {
  const m = /^Enviou atestado de (.+?) \((.+?)\) por e-mail ao RH \((.*)\)$/.exec(String(l.detalhes || ''));
  if (!m) return null;
  let dur = m[2], pericia = false;
  if (/, com perícia$/.test(dur)) { pericia = true; dur = dur.replace(/, com perícia$/, ''); }
  let dias = 0, turno = '';
  if (/^meio período/.test(dur)) { dias = 0.5; turno = /tarde/.test(dur) ? 'tarde' : (/manh/.test(dur) ? 'manha' : ''); }
  else { const n = parseInt(dur, 10); dias = isNaN(n) ? 0 : n; }
  return {
    id: l.id, srvId: l.registroId || '', profissional: m[1], dias: dias, turno: turno, pericia: pericia,
    arquivo: m[3], criadoEm: l.criadoEm, enviadoPor: l.usuarioNome || ''
  };
}

async function arCarregarHistorico() {
  const box = document.getElementById('ar-historico');
  if (box && !_arHistCarregado) box.innerHTML = '<div style="opacity:.6;font-size:.85rem">Carregando histórico...</div>';
  let logs = [];
  try {
    const { data, error } = await supabaseClient.from('logs').select('*')
      .ilike('detalhes', 'Enviou atestado de %').order('criadoEm', { ascending: false }).limit(1000);
    if (!error && Array.isArray(data)) logs = data;
  } catch (e) { /* sem conexão: usa os registros locais */ }
  try {
    const locais = JSON.parse(localStorage.getItem('srv_logs') || '[]').filter(function (l) { return /^Enviou atestado de /.test(String(l.detalhes || '')); });
    const ids = new Set(logs.map(function (l) { return l.id; }));
    locais.forEach(function (l) { if (!ids.has(l.id)) logs.push(l); });
  } catch (e) { /* ignora */ }
  const visiveis = new Set((typeof getServidoresAcessiveis === 'function' ? getServidoresAcessiveis() : DB.servidores()).map(function (s) { return s.id; }));
  let sessao = {};
  try { sessao = JSON.parse(sessionStorage.getItem('ferias_sessao') || '{}'); } catch (e) { /* sem sessão */ }
  const restrito = sessao.role !== 'admin';
  // Mantém os textos de WhatsApp já prontos dos envios feitos agora
  const prontos = {};
  _arHistorico.forEach(function (e) { if (e.textoWhats) prontos[e.id] = e.textoWhats; });
  _arHistorico = logs.map(arLerRegistroLog).filter(function (e) {
    return e && (!restrito || visiveis.has(e.srvId));
  }).sort(function (a, b) { return String(b.criadoEm).localeCompare(String(a.criadoEm)); });
  _arHistorico.forEach(function (e) { if (prontos[e.id]) e.textoWhats = prontos[e.id]; });
  _arHistCarregado = true;
  arRenderHistorico();
}

function arRenderHistorico() {
  const box = document.getElementById('ar-historico');
  if (!box) return;
  const busca = String((document.getElementById('ar-hist-busca') || {}).value || '').toLowerCase().trim();
  const mes = (document.getElementById('ar-hist-mes') || {}).value || '';
  const itens = _arHistorico.map(function (e, i) { return { e: e, i: i }; }).filter(function (x) {
    if (busca && String(x.e.profissional).toLowerCase().indexOf(busca) < 0) return false;
    if (mes && String(x.e.criadoEm).slice(0, 7) !== mes) return false;
    return true;
  });
  const total = document.getElementById('ar-hist-total');
  if (total) total.textContent = itens.length + (itens.length === 1 ? ' atestado' : ' atestados');
  if (!itens.length) {
    box.innerHTML = '<div style="opacity:.6;font-size:.85rem">' + (_arHistorico.length ? 'Nenhum atestado encontrado com esse filtro.' : 'Nenhum atestado enviado ainda.') + '</div>';
    return;
  }
  box.innerHTML = itens.slice(0, 200).map(function (x) {
    const e = x.e, d = new Date(e.criadoEm);
    const quando = isNaN(d) ? '' : d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const srv = DB.servidores().find(function (s) { return s.id === e.srvId; });
    return '<div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">' +
      '<span>📧</span><div style="flex:1;min-width:0"><strong>' + arEsc(e.profissional) + '</strong> — ' + arEsc(arTextoDuracao(e.dias, e.turno)) +
      (e.pericia ? ' · <span style="color:var(--warning, #f59e0b);font-weight:700">perícia</span>' : '') +
      '<div style="font-size:.75rem;opacity:.7">' + arEsc(quando) + (srv && srv.setor ? ' · ' + arEsc(srv.setor) : '') +
      (e.enviadoPor ? ' · enviado por ' + arEsc(e.enviadoPor) : '') + (e.arquivo ? ' · ' + arEsc(e.arquivo) : '') + '</div></div>' +
      '<button type="button" class="btn btn-success btn-sm" onclick="arAbrirWhatsApp(' + x.i + ')" title="Enviar comprovante pelo WhatsApp">💬 WhatsApp</button></div>';
  }).join('') + (itens.length > 200 ? '<div style="font-size:.75rem;opacity:.6;margin-top:8px">Mostrando os 200 mais recentes. Use a busca ou o mês para encontrar os demais.</div>' : '');
}

async function enviarAtestadoRH() {
  if (_arEnviando) return;
  const srv = arSrvSelecionado();
  const dias = arDiasInformados();
  const turno = arTurnoInformado();
  const genero = document.getElementById('ar-genero').value;
  const observacao = document.getElementById('ar-obs').value.trim();

  if (!srv) return toastMsg('Selecione o servidor.', 'warning');
  if (!dias) return toastMsg('Informe de quantos dias é o atestado.', 'warning');
  if (!(document.getElementById('ar-pdf').files || []).length) return toastMsg('Anexe o atestado (PDF ou foto).', 'warning');
  if (_arPreparo && !_arArquivo) { try { await _arPreparo; } catch (e) { /* mensagem já exibida */ } }
  if (!_arArquivo) return toastMsg('Não foi possível preparar o arquivo. Escolha-o novamente.', 'warning');
  if (_arArquivo.bytes.length > ATESTADO_RH_MAX_BYTES) return toastMsg('O PDF passa de 8 MB. Use menos fotos ou fotos menores.', 'warning');
  const file = { name: _arArquivo.convertido ? 'Atestado_' + (arNomeBase(srv.nome) || 'servidor') + '.pdf' : _arArquivo.nome };

  if (!confirm('Enviar o atestado de ' + srv.nome + ' (' + arTextoDuracao(dias, turno) + ') por e-mail ao RH da Prefeitura?\n\nArquivo: ' + file.name)) return;

  const btn = document.getElementById('ar-btn-enviar');
  const textoBtn = btn.innerHTML;
  _arEnviando = true;
  btn.disabled = true;
  btn.innerHTML = '⏳ Enviando...';
  arFecharPergunta();

  try {
    const assinante = arRemetenteAtual();
    const resp = await fetch(ATESTADO_RH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profissional: srv.nome,
        matricula: srv.matricula || '',
        setor: srv.setor || '',
        dias: dias,
        turno: turno,
        genero: genero,
        observacao: observacao,
        nomeArquivo: file.name,
        pdfBase64: arBytesBase64(_arArquivo.bytes),
        enviadoPor: assinante.nome || '',
        cargoEnviadoPor: assinante.cargo || ''
      })
    });
    let dados = {};
    try { dados = await resp.json(); } catch (e) { /* resposta sem corpo */ }
    if (!resp.ok || !dados.ok) throw new Error(dados.erro || 'Falha no envio (código ' + resp.status + ').');

    const agora = new Date();
    const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const pericia = arPrecisaPericia(srv, dias);
    const detalhesLog = 'Enviou atestado de ' + srv.nome + ' (' + arTextoDuracao(dias, turno) + (pericia ? ', com perícia' : '') + ') por e-mail ao RH (' + file.name + ')';
    _arHistorico.unshift({
      id: 'novo-' + Date.now(), srvId: srv.id, profissional: srv.nome, dias: dias, turno: turno, pericia: pericia,
      arquivo: file.name, criadoEm: agora.toISOString(), enviadoPor: assinante.nome || '',
      textoWhats: arTextoWhatsApp(srv, dias, genero, agora.toLocaleDateString('pt-BR') + ' às ' + hora, turno)
    });
    arRenderHistorico();
    try {
      DB.saveLog('Documento', detalhesLog, 'servidores', srv.id);
    } catch (e) { /* log é opcional */ }

    document.getElementById('ar-pdf').value = '';
    document.getElementById('ar-pdf-info').textContent = '';
    arLimparArquivo();
    document.getElementById('ar-obs').value = '';
    document.getElementById('ar-dias').value = '';
    document.getElementById('ar-duracao').value = 'dias';
    arMudarDuracao();
    document.getElementById('ar-servidor').value = '';
    arAtualizarPrevia();
    toastMsg('Atestado de ' + srv.nome + ' enviado ao RH!', 'success');
    arPerguntarWhatsApp();
  } catch (err) {
    console.error(err);
    toastMsg(err.message || 'Não foi possível enviar o atestado.', 'error');
  } finally {
    _arEnviando = false;
    btn.disabled = false;
    btn.innerHTML = textoBtn;
  }
}
