// Módulo Gerador de Ofícios e Notificações Administrativas.
// Um único motor atende os dois documentos ('ofi' = ofício, 'ntf' = notificação):
// formulário, pré-visualização A4, numeração, histórico com situação, modelos,
// redação com IA e página pública de conferência (QR Code).
// A geração do PDF, a assinatura digital e o envio por e-mail ficam em oficios-pdf.js.

let _oficiosData = [];
let _notificacoesData = [];
let _oficiosModoPublico = false;
let _docEstado = { ofi: { dests: [] }, ntf: { dests: [] } };

const OFICIO_HEADER = {
  titulo: 'SECRETARIA MUNICIPAL DE SAÚDE - ITACARAMBI',
  linhas: [
    'ESTADO DE MINAS GERAIS - CNPJ: 18.283.101/0001-82',
    'Rua Alferes Propécio, Nº 39 - Centro – CEP: 39.470-000 - Tel: (38)3613-1148 – 1401/1957',
    'E-mail: smsitac@yahoo.com.br'
  ]
};

// Forma de endereçamento impressa acima do nome do destinatário
const DOC_TRATAMENTOS = {
  sr: 'Ao Senhor',
  sra: 'À Senhora',
  exmo: 'A Sua Excelência o Senhor',
  exma: 'A Sua Excelência a Senhora'
};

const DOC_CFG = {
  ofi: {
    tipo: 'ofi', nome: 'Ofício', esteDoc: 'este ofício', doDoc: 'do ofício', umDoc: 'um ofício', plural: 'ofícios',
    prefixo: 'Ofício nº', sigla: 'APS', param: 'oficio', cor: '#3b82f6', icone: '📜',
    lista: () => DB.oficios(), salvar: d => DB.saveOficios(d), excluir: id => DB.deleteOficio(id),
    proximo: ano => DB.proximoNumeroOficio(ano), lsExtras: 'srv_oficios_extras', listaEl: 'lista-oficios',
    situacoes: { emitido: 'Emitido', enviado: 'Enviado · aguardando resposta', respondido: 'Respondido', arquivado: 'Arquivado' },
    situacaoInicial: 'emitido'
  },
  ntf: {
    tipo: 'ntf', nome: 'Notificação', esteDoc: 'esta notificação', doDoc: 'da notificação', umDoc: 'uma notificação', plural: 'notificações',
    prefixo: 'Notificação nº', sigla: 'APS', param: 'notificacao', cor: '#b45309', icone: '⚠️',
    lista: () => DB.notificacoes(), salvar: d => DB.saveNotificacoes(d), excluir: id => DB.deleteNotificacao(id),
    proximo: ano => DB.proximoNumeroNotificacao(ano), lsExtras: 'srv_notificacoes_extras', listaEl: 'lista-notificacoes',
    situacoes: { emitido: 'Emitida · aguardando ciência', ciente: 'Ciência assinada', recusou: 'Recusou assinar (testemunhas)', respondido: 'Manifestação apresentada', arquivado: 'Arquivada' },
    situacaoInicial: 'emitido'
  }
};

const NTF_TIPOS = {
  orientacao: 'Orientação',
  ciencia: 'Ciência de fatos',
  esclarecimentos: 'Pedido de esclarecimentos',
  reiteracao: 'Reiteração'
};

// ===================== UTILIDADES =====================
function oficioHeaderHtml(escala = 1) {
  const titulo = escala >= 2 ? '15px' : '13.5px';
  const linha = escala >= 2 ? '10.5px' : '9.5px';
  return `
    <h1 style="font-size:${titulo}; font-weight:800; text-transform:uppercase; margin:0; color:#0f172a; letter-spacing:0.02em;">${esc(OFICIO_HEADER.titulo)}</h1>
    ${OFICIO_HEADER.linhas.map(l => `<div style="font-size:${linha}; font-weight:600; color:#475569; margin-top:3px;">${esc(l)}</div>`).join('')}
  `;
}

function uidOficio(size = 10) {
  return 'ofi_' + Math.random().toString(36).substring(2, 2 + size) + Date.now().toString(36);
}

function docTokenAleatorio(n) {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(n);
  (window.crypto || window.msCrypto).getRandomValues(bytes);
  let s = '';
  for (let i = 0; i < n; i++) s += alfabeto[bytes[i] % alfabeto.length];
  return s;
}
function gerarTokenOficio() { return 'ofc_' + docTokenAleatorio(12); }
function gerarTokenNotificacao() { return 'ntf_' + docTokenAleatorio(12); }

function obterDataExtenso(dataInput) {
  const dt = dataInput ? new Date(dataInput + 'T12:00:00') : new Date();
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return `${String(dt.getDate()).padStart(2, '0')} de ${meses[dt.getMonth()]} de ${dt.getFullYear()}`;
}

function docEl(tipo, sufixo) { return document.getElementById(tipo + '-' + sufixo); }
function docVal(tipo, sufixo) { const e = docEl(tipo, sufixo); return e ? String(e.value || '').trim() : ''; }
function docSet(tipo, sufixo, v) { const e = docEl(tipo, sufixo); if (e) e.value = v == null ? '' : v; }
function docHojeISO() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function docDataBR(iso) { if (!iso) return ''; const p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; }
function docNorm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function docCodigoPadrao(tipo, numero, ano) { return `${DOC_CFG[tipo].prefixo} ${String(numero).padStart(3, '0')}/${ano} - ${DOC_CFG[tipo].sigla}`; }

// Código de autenticidade legível (derivado do token do link público)
function docCodigoAuth(token) {
  const t = String(token || '').replace(/^(ofc|ntf)_/, '').toUpperCase();
  return t ? (t.match(/.{1,4}/g) || []).join('-') : '';
}
function docLinkPublico(tipo, token) {
  return `${window.location.origin}${window.location.pathname}?${DOC_CFG[tipo].param}=${token}`;
}

// ---------- dados extras (situação, prazo, anexos, envios, assinatura) ----------
// Ficam na coluna "extras" (JSONB). Enquanto o script sql_oficios_v2.sql não for
// executado na nuvem, uma cópia local garante que nada se perca neste aparelho.
function docExtrasLocal(tipo) {
  try { return JSON.parse(localStorage.getItem(DOC_CFG[tipo].lsExtras) || '{}') || {}; } catch (e) { return {}; }
}
function docGuardarExtrasLocal(tipo, lista) {
  const mapa = {};
  (lista || []).forEach(o => { if (o && o.id && o.extras && Object.keys(o.extras).length) mapa[o.id] = o.extras; });
  try { localStorage.setItem(DOC_CFG[tipo].lsExtras, JSON.stringify(mapa)); } catch (e) { /* sem espaço */ }
}
function docExtras(o) {
  let x = o && o.extras;
  if (typeof x === 'string') { try { x = JSON.parse(x); } catch (e) { x = null; } }
  return (x && typeof x === 'object' && !Array.isArray(x)) ? x : {};
}
function docLista(tipo) {
  const lista = DOC_CFG[tipo].lista() || [];
  const local = docExtrasLocal(tipo);
  lista.forEach(o => {
    const x = docExtras(o);
    o.extras = Object.keys(x).length ? x : (local[o.id] || {});
  });
  return lista;
}
function docDests(o) {
  if (Array.isArray(o.destinatarios) && o.destinatarios.length) return o.destinatarios;
  if (o.destinatario || o.cargoDestinatario || o.orgaoDestinatario) return [{ nome: o.destinatario || '', cargo: o.cargoDestinatario || '', orgao: o.orgaoDestinatario || '' }];
  return [];
}
function docDestsNomes(o) { return docDests(o).map(d => d.nome).filter(Boolean).join('; '); }
function docSituacao(o, tipo) { const s = docExtras(o).status; return DOC_CFG[tipo].situacoes[s] ? s : DOC_CFG[tipo].situacaoInicial; }

async function docPersistir(tipo, lista) {
  docGuardarExtrasLocal(tipo, lista);
  await DOC_CFG[tipo].salvar(lista);
  if (tipo === 'ofi') _oficiosData = lista; else _notificacoesData = lista;
}

// Altera só os dados extras de um documento já emitido
async function docAtualizarExtras(tipo, id, patch) {
  const lista = docLista(tipo);
  const o = lista.find(x => x.id === id);
  if (!o) return null;
  o.extras = Object.assign({}, docExtras(o), patch);
  Object.keys(o.extras).forEach(k => { if (o.extras[k] === null || o.extras[k] === undefined || o.extras[k] === '') delete o.extras[k]; });
  await docPersistir(tipo, lista);
  return o;
}

// Separa o fecho ("Atenciosamente,") quando ele já veio digitado no fim do texto
function docSepararFecho(texto) {
  const pars = String(texto || '').split('\n').map(p => p.trim()).filter(Boolean);
  let fecho = 'Atenciosamente,';
  if (pars.length) {
    const m = /^(atenciosamente|respeitosamente|cordialmente)\s*[,.]?$/i.exec(pars[pars.length - 1]);
    if (m) { pars.pop(); fecho = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() + ','; }
  }
  return { paragrafos: pars, fecho };
}

function docLinhas(txt) { return String(txt || '').split(/\n|;/).map(s => s.trim()).filter(Boolean); }

// QR Code como SVG (para a pré-visualização e a página pública)
function docQrSvg(texto, px) {
  if (typeof qrcode !== 'function' || !texto) return '';
  try {
    const qr = qrcode(0, 'M'); qr.addData(texto); qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${n + 2} ${n + 2}" width="${px}" height="${px}" shape-rendering="crispEdges" style="background:#fff"><path d="${d}" fill="#000"/></svg>`;
  } catch (e) { return ''; }
}

function docLogos() {
  const g = (l) => (typeof getImg === 'function' ? getImg(l) : null) || localStorage.getItem('srv_img_' + l) || '';
  return { esq: g('side') || g('esq'), dir: g('dir') || g('print') };
}

// ===================== FOLHA A4 (HTML) =====================
// Usada na pré-visualização, na impressão rápida e na página pública.
function docHtml(doc, tipo, o) {
  o = o || {};
  const cfg = DOC_CFG[tipo];
  const G = !!o.grande;
  const x = docExtras(doc);
  const logos = docLogos();
  const alt = G ? 65 : 60, larg = G ? 150 : 140;
  const img = (src, vazio) => src ? `<img src="${esc(src)}" style="max-height:${alt}px; max-width:${larg}px; object-fit:contain;">` : `<div style="font-size:24px;">${vazio}</div>`;
  const { paragrafos, fecho } = docSepararFecho(doc.texto);
  const corpo = paragrafos.map(p =>
    `<p style="text-align:justify; text-indent:2.5em; margin:0 0 14px; line-height:1.7; font-size:${G ? 15 : 14}px;">${esc(p)}</p>`).join('');

  const dests = docDests(doc).filter(d => (d.nome || '').trim() || (d.cargo || '').trim() || (d.orgao || '').trim());
  const destsHtml = dests.length ? dests.map(d => `
    <div style="margin-bottom:12px;">
      ${DOC_TRATAMENTOS[d.tratamento] ? `<div>${esc(DOC_TRATAMENTOS[d.tratamento])}</div>` : ''}
      <div><strong>${esc(d.nome || '')}</strong></div>
      ${d.cargo ? `<div>${esc(d.cargo)}</div>` : ''}
      ${d.matricula ? `<div>Matrícula: ${esc(d.matricula)}</div>` : ''}
      ${d.orgao ? `<div style="color:#475569;">${esc(d.orgao)}</div>` : ''}
    </div>`).join('')
    : (o.preview ? '<div style="color:#94a3b8; font-style:italic;">(nenhum destinatário adicionado)</div>' : '');

  const tituloNtf = tipo === 'ntf' ? `
    <div style="text-align:center; margin-bottom:22px;">
      <div style="font-size:${G ? 16 : 15}px; font-weight:800; text-transform:uppercase; letter-spacing:0.04em; color:#0f172a; border-bottom:1.5px solid #0f172a; display:inline-block; padding-bottom:4px;">Notificação Administrativa</div>
      ${NTF_TIPOS[x.tipoNtf] ? `<div style="font-size:12px; color:#475569; margin-top:5px; font-weight:600;">${esc(NTF_TIPOS[x.tipoNtf])}</div>` : ''}
    </div>` : '';

  const anexos = docLinhas(x.anexos), cc = docLinhas(x.cc);
  const complementos = (anexos.length || cc.length) ? `
    <div style="margin-top:26px; font-size:12px; color:#334155; line-height:1.55; page-break-inside:avoid;">
      ${anexos.length ? `<div><strong>Anexo${anexos.length > 1 ? 's' : ''}:</strong> ${anexos.map(esc).join('; ')}.</div>` : ''}
      ${cc.length ? `<div><strong>C/C:</strong> ${cc.map(esc).join('; ')}.</div>` : ''}
    </div>` : '';

  const rodapeBloco = tipo === 'ofi' ? `
    <div style="margin-top:40px; display:flex; justify-content:flex-end; page-break-inside:avoid;">
      <div style="text-align:center; width:230px; border:1px solid #cbd5e1; border-radius:5px; padding:8px 10px;">
        <div style="font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:0.03em; color:#334155; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:6px;">Protocolo de Recebimento</div>
        <div style="font-size:9px; color:#475569; text-align:left; margin-bottom:5px;">Recebido por: ____________________</div>
        <div style="font-size:9px; color:#475569; text-align:left; margin-bottom:2px;">Matrícula: ______________</div>
        <div style="display:flex; justify-content:space-between; font-size:9px; color:#475569; margin-top:6px;"><span>Data: __/__/____</span><span>Assinatura: ________</span></div>
      </div>
    </div>` : `
    <div style="margin-top:40px; border:1px solid #cbd5e1; border-radius:6px; padding:14px 16px; page-break-inside:avoid;">
      <div style="font-size:12px; font-weight:800; text-transform:uppercase; color:#0f172a; border-bottom:1.5px solid #0f172a; padding-bottom:6px; margin-bottom:12px;">Ciência do Servidor</div>
      <div style="font-size:12px; color:#1e293b; line-height:1.6; margin-bottom:${x.prazoDias ? 6 : 16}px;">Declaro que recebi a presente Notificação Administrativa, tomando ciência de seu conteúdo e das providências nela estabelecidas.</div>
      ${x.prazoDias ? `<div style="font-size:12px; color:#1e293b; line-height:1.6; margin-bottom:16px;"><strong>Prazo para manifestação por escrito:</strong> ${esc(String(x.prazoDias))} dia(s) útil(eis), contado(s) da data da ciência.</div>` : ''}
      <div style="display:flex; justify-content:space-between; gap:20px; flex-wrap:wrap; font-size:12px; color:#334155; margin-bottom:20px;">
        <span>Assinatura do(a) Servidor(a): ____________________________</span><span>Data: ____/____/______</span>
      </div>
      <div style="font-size:11px; color:#334155; font-weight:600;">Observação do(a) servidor(a), caso queira apresentar justificativa:</div>
      <div style="border-bottom:1px solid #cbd5e1; height:42px;"></div>
    </div>
    ${x.testemunhas ? `
    <div style="margin-top:14px; border:1px solid #cbd5e1; border-radius:6px; padding:14px 16px; page-break-inside:avoid;">
      <div style="font-size:12px; font-weight:800; text-transform:uppercase; color:#0f172a; border-bottom:1.5px solid #0f172a; padding-bottom:6px; margin-bottom:10px;">Recusa de Assinatura — Testemunhas</div>
      <div style="font-size:11.5px; color:#1e293b; line-height:1.6; margin-bottom:16px;">Preencher somente se houver recusa: certificamos que o(a) servidor(a) recebeu cópia desta notificação e tomou conhecimento de seu conteúdo em ____/____/______, recusando-se a assinar.</div>
      <div style="display:flex; gap:24px; flex-wrap:wrap; font-size:11.5px; color:#334155;">
        <div style="flex:1; min-width:200px;">Testemunha 1: __________________________<br><span style="display:inline-block; margin-top:10px;">Matrícula/CPF: ________________</span></div>
        <div style="flex:1; min-width:200px;">Testemunha 2: __________________________<br><span style="display:inline-block; margin-top:10px;">Matrícula/CPF: ________________</span></div>
      </div>
    </div>` : ''}`;

  const codAuth = docCodigoAuth(doc.token);
  const link = doc.token ? docLinkPublico(tipo, doc.token) : '';
  const qr = link ? docQrSvg(link, G ? 58 : 50) : '';
  const padH = G ? 50 : 44;

  return `
    <div class="doc-folha" style="background:#fff; color:#111; padding:${G ? '60px 50px 110px' : '48px 44px 100px'}; border-radius:${G ? 12 : 8}px; box-shadow:0 8px 30px rgba(0,0,0,0.3); font-family:'Sora','Helvetica Neue',Arial,sans-serif; min-height:${G ? 950 : 750}px; position:relative; overflow:hidden;">
      ${x.cancelado ? '<div style="position:absolute; top:38%; left:0; right:0; text-align:center; font-size:64px; font-weight:800; color:rgba(220,38,38,0.16); transform:rotate(-28deg); letter-spacing:0.08em; pointer-events:none;">SEM EFEITO</div>' : ''}
      <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #222; padding-bottom:14px; margin-bottom:${tipo === 'ntf' ? 18 : 24}px;">
        <div style="width:${larg}px; text-align:left;">${img(logos.esq, '🏛️')}</div>
        <div style="text-align:center; flex:1; padding:0 10px;">${oficioHeaderHtml(G ? 2 : 1)}</div>
        <div style="width:${larg}px; text-align:right;">${img(logos.dir, '🌴')}</div>
      </div>
      ${tituloNtf}
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:28px;">
        <div style="font-weight:700; font-size:14px; color:#0f172a;">${esc(doc.codigo || '')}</div>
        <div style="font-size:13px; color:#334155; font-weight:500;">${esc(doc.cidadeData || '')}</div>
      </div>
      <div style="margin-bottom:24px; line-height:1.5; font-size:13.5px; color:#1e293b;">${destsHtml}</div>
      <div style="margin-bottom:${x.oficioRel ? 10 : 28}px; background:#f8fafc; padding:10px 14px; border-left:4px solid ${cfg.cor}; font-size:13.5px;">
        <strong>Assunto:</strong> ${esc(doc.assunto || '')}
      </div>
      ${x.oficioRel ? `<div style="margin-bottom:24px; font-size:12.5px; color:#334155;"><strong>Ref.:</strong> ${esc(x.oficioRel)}</div>` : ''}
      <div style="min-height:${G ? 300 : 220}px; color:#0f172a;">
        ${corpo || '<p style="color:#94a3b8; font-style:italic;">Digite o texto no formulário ao lado...</p>'}
      </div>
      <div style="margin-top:40px; text-align:center; page-break-inside:avoid;">
        <div style="margin-bottom:48px; font-size:14px; color:#334155;">${esc(fecho)}</div>
        <div style="display:inline-block; border-top:1.5px solid #0f172a; padding-top:8px; min-width:280px;">
          <div style="font-weight:700; font-size:14px; color:#0f172a;">${esc(doc.emissorNome || '')}</div>
          <div style="font-size:12px; color:#64748b;">${esc(doc.emissorCargo || '')}</div>
        </div>
      </div>
      ${complementos}
      ${rodapeBloco}
      <div style="position:absolute; bottom:18px; left:${padH}px; right:${padH}px; border-top:1px solid #e2e8f0; padding-top:8px; display:flex; justify-content:space-between; align-items:center; gap:12px; font-size:10px; color:#64748b;">
        <div>
          <div>Documento emitido pelo Sistema Atlas Saúde · Coordenação de Atenção Primária à Saúde</div>
          <div>${codAuth ? 'Código de autenticidade: <strong>' + esc(codAuth) + '</strong> — confira pelo QR Code ao lado.' : 'O código de autenticidade e o QR Code são gerados ao salvar.'}</div>
        </div>
        <div style="flex-shrink:0; line-height:0;">${qr}</div>
      </div>
    </div>`;
}

// ===================== FORMULÁRIO =====================
function docDoFormulario(tipo) {
  const id = docVal(tipo, 'id');
  const antigo = id ? docLista(tipo).find(o => o.id === id) : null;
  const x = Object.assign({}, antigo ? docExtras(antigo) : {});
  const pega = (chave, sufixo) => { const v = docVal(tipo, sufixo); if (v) x[chave] = v; else delete x[chave]; };
  pega('anexos', 'anexos'); pega('cc', 'cc');
  if (tipo === 'ofi') pega('prazoResposta', 'prazo');
  if (tipo === 'ntf') {
    pega('tipoNtf', 'tipo'); pega('oficioRel', 'oficio-rel');
    const dias = parseInt(docVal(tipo, 'prazo-dias'), 10);
    if (dias > 0) x.prazoDias = dias; else delete x.prazoDias;
    const t = docEl(tipo, 'testemunhas');
    if (t && t.checked) x.testemunhas = true; else delete x.testemunhas;
  }
  return {
    id: id,
    token: antigo ? antigo.token : '',
    codigo: docVal(tipo, 'codigo'),
    cidadeData: docVal(tipo, 'cidade-data'),
    assunto: docVal(tipo, 'assunto'),
    texto: docVal(tipo, 'texto'),
    emissorNome: docVal(tipo, 'emissor-nome'),
    emissorCargo: docVal(tipo, 'emissor-cargo'),
    destinatarios: _docEstado[tipo].dests,
    extras: x
  };
}

function docPreview(tipo) {
  const cont = docEl(tipo, 'preview-container');
  if (!cont) return;
  const d = docDoFormulario(tipo);
  if (!d.assunto) d.assunto = tipo === 'ofi' ? 'Assunto da correspondência' : 'Assunto da notificação';
  if (!d.emissorNome) d.emissorNome = 'Nome do Emissor';
  if (!d.emissorCargo) d.emissorCargo = 'Cargo do Emissor';
  cont.innerHTML = docHtml(d, tipo, { preview: true });
  docAvisosFormulario(tipo);
}
function atualizarPreviewOficio() { docPreview('ofi'); }
function atualizarPreviewNotificacao() { docPreview('ntf'); }

function docNumeroManual(tipo, val) {
  const num = parseInt(val, 10) || 1;
  const ano = parseInt(docVal(tipo, 'ano'), 10) || new Date().getFullYear();
  docSet(tipo, 'codigo', docCodigoPadrao(tipo, num, ano));
  docPreview(tipo);
}
function atualizarNumeroOficioManual(v) { docNumeroManual('ofi', v); }
function atualizarNumeroNotificacaoManual(v) { docNumeroManual('ntf', v); }

// Emissor padrão: o cadastro de emissores vale mais que o cargo gravado no login
function docEmissorPadrao() {
  const sessao = JSON.parse(sessionStorage.getItem('ferias_sessao') || '{}');
  const cfg = DB.config();
  const nome = sessao.nome || cfg.coordenadorAPS || 'Coordenação APS';
  const cad = DB.emissores().find(e => docNorm(e.nome) === docNorm(nome));
  if (cad) return { id: cad.id, nome: cad.nome, cargo: cad.cargo || '' };
  return { id: '', nome, cargo: sessao.cargo || (sessao.role === 'admin' ? 'Administrador do Sistema' : (cfg.subtituloSidebar || 'Coordenador(a) da Atenção Primária à Saúde')) };
}

function docNovo(tipo) {
  const cfg = DOC_CFG[tipo];
  if (tipo === 'ofi') _oficiosData = docLista('ofi'); else _notificacoesData = docLista('ntf');
  _docEstado[tipo].dests = [];
  const ano = new Date().getFullYear();
  const num = cfg.proximo(ano);
  docSet(tipo, 'id', ''); docSet(tipo, 'ano', ano); docSet(tipo, 'numero', num);
  docSet(tipo, 'codigo', docCodigoPadrao(tipo, num, ano));
  docSet(tipo, 'assunto', ''); docSet(tipo, 'texto', '');
  docSet(tipo, 'cidade-data', `ITACARAMBI - MG, ${obterDataExtenso()}`);
  ['anexos', 'cc', 'prazo', 'tipo', 'prazo-dias', 'oficio-rel', 'modelo-select', 'ia-pedido'].forEach(s => docSet(tipo, s, ''));
  const t = docEl(tipo, 'testemunhas'); if (t) t.checked = false;

  docRenderSelectEmissores(tipo);
  const em = docEmissorPadrao();
  docSet(tipo, 'emissor-nome', em.nome); docSet(tipo, 'emissor-cargo', em.cargo); docSet(tipo, 'emissor-select', em.id);

  const titulo = docEl(tipo, 'form-title');
  if (titulo) titulo.textContent = tipo === 'ofi' ? 'Novo Ofício Oficial' : 'Nova Notificação Administrativa';
  const box = docEl(tipo, 'link-action-box'); if (box) box.style.display = 'none';
  const ia = docEl(tipo, 'ia-box'); if (ia) ia.style.display = 'none';

  if (tipo === 'ofi') { renderCadastrosOficio(); docRenderModelos(); }
  if (tipo === 'ntf') ntfRenderOficiosRel();
  docRenderSelectDest(tipo);
  docRenderDests(tipo);
  docRenderFiltros(tipo);
  docPreview(tipo);
  docVerificarColunaExtras(tipo);
}
function carregarNovoOficio() { docNovo('ofi'); }
function carregarNovaNotificacao() { docNovo('ntf'); }

// ---------- destinatários do documento ----------
function docTratamentoCadastro(id) { return (DB.config().destTratamentos || {})[id] || ''; }

function docRenderSelectDest(tipo) {
  const sel = docEl(tipo, 'dest-select');
  if (!sel) return;
  const cad = DB.destinatarios().slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const optCad = cad.map(d => `<option value="d:${esc(d.id)}">${esc(d.nome)}${d.cargo ? ' — ' + esc(d.cargo) : ''}</option>`).join('');
  if (tipo === 'ofi') {
    sel.innerHTML = '<option value="">Selecione um destinatário cadastrado...</option>' + optCad;
    return;
  }
  // Notificação: o destinatário natural é um servidor do cadastro
  const srvs = (typeof getServidoresAcessiveis === 'function' ? getServidoresAcessiveis() : DB.servidores())
    .slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  sel.innerHTML = '<option value="">Selecione o servidor...</option>' +
    '<optgroup label="Servidores">' + srvs.map(s => `<option value="s:${esc(s.id)}">${esc(s.nome)} (Mat. ${esc(s.matricula || '-')})</option>`).join('') + '</optgroup>' +
    (optCad ? '<optgroup label="Outros destinatários cadastrados">' + optCad + '</optgroup>' : '');
}

function docAdicionarDest(tipo) {
  const sel = docEl(tipo, 'dest-select');
  const v = sel ? sel.value : '';
  if (!v) return toastMsg('Selecione um destinatário para adicionar.', 'warning');
  const id = v.slice(2);
  let novo = null;
  if (v[0] === 's') {
    const s = DB.servidores().find(x => String(x.id) === id);
    if (s) novo = { nome: s.nome || '', cargo: s.cargo || '', orgao: s.setor || '', matricula: s.matricula ? String(s.matricula) : '', srvId: s.id };
  } else {
    const d = DB.destinatarios().find(x => x.id === id);
    if (d) novo = { nome: d.nome || '', cargo: d.cargo || '', orgao: d.orgao || '', tratamento: docTratamentoCadastro(d.id), cadId: d.id };
  }
  if (!novo) return;
  _docEstado[tipo].dests.push(novo);
  sel.value = '';
  docRenderDests(tipo);
  docPreview(tipo);
}
function adicionarDestinatarioOficio() { docAdicionarDest('ofi'); }
function adicionarDestinatarioNotificacao() { docAdicionarDest('ntf'); }

function docRemoverDest(tipo, i) { _docEstado[tipo].dests.splice(i, 1); docRenderDests(tipo); docPreview(tipo); }
function docAtualizarDest(tipo, i, campo, valor) {
  const d = _docEstado[tipo].dests[i];
  if (!d) return;
  d[campo] = valor;
  docPreview(tipo);
}

function docRenderDests(tipo) {
  const cont = docEl(tipo, 'dest-selecionados');
  if (!cont) return;
  const dests = _docEstado[tipo].dests;
  if (!dests.length) {
    cont.innerHTML = '<div style="font-size:0.72rem;color:var(--muted);padding:6px 0;">Nenhum destinatário adicionado.</div>';
    return;
  }
  const optTrat = (atual) => '<option value="">(sem forma de tratamento)</option>' +
    Object.keys(DOC_TRATAMENTOS).map(k => `<option value="${k}"${atual === k ? ' selected' : ''}>${esc(DOC_TRATAMENTOS[k])}</option>`).join('');
  cont.innerHTML = dests.map((d, i) => `
    <div style="border:1px solid var(--border); border-radius:var(--r-sm); padding:10px; margin-bottom:8px; background:var(--surface);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <strong style="font-size:.74rem; color:var(--primary);">Destinatário ${i + 1}</strong>
        <button class="btn btn-danger btn-sm" onclick="docRemoverDest('${tipo}', ${i})" title="Remover">🗑️</button>
      </div>
      <select onchange="docAtualizarDest('${tipo}', ${i}, 'tratamento', this.value)" style="margin-bottom:6px;" title="Forma de tratamento impressa acima do nome">${optTrat(d.tratamento || '')}</select>
      <input value="${esc(d.nome)}" placeholder="Nome" oninput="docAtualizarDest('${tipo}', ${i}, 'nome', this.value)" style="margin-bottom:6px;">
      <input value="${esc(d.cargo)}" placeholder="Cargo" oninput="docAtualizarDest('${tipo}', ${i}, 'cargo', this.value)" style="margin-bottom:6px;">
      ${tipo === 'ntf' ? `<input value="${esc(d.matricula || '')}" placeholder="Matrícula" oninput="docAtualizarDest('${tipo}', ${i}, 'matricula', this.value)" style="margin-bottom:6px;">` : ''}
      <input value="${esc(d.orgao)}" placeholder="${tipo === 'ntf' ? 'Setor / Equipe / Unidade' : 'Órgão / Secretaria / Empresa'}" oninput="docAtualizarDest('${tipo}', ${i}, 'orgao', this.value)">
    </div>`).join('');
}

// ---------- emissores ----------
function docRenderSelectEmissores(tipo) {
  const sel = docEl(tipo, 'emissor-select');
  if (!sel) return;
  const atual = sel.value;
  const lista = DB.emissores();
  sel.innerHTML = '<option value="">Selecione para preencher automaticamente...</option>' +
    lista.map(e => `<option value="${esc(e.id)}">${esc(e.nome)}${e.cargo ? ' — ' + esc(e.cargo) : ''}</option>`).join('');
  if (atual && lista.some(e => e.id === atual)) sel.value = atual;
}
function renderSelectEmissoresOficio() { docRenderSelectEmissores('ofi'); }
function renderSelectEmissoresNotificacao() { docRenderSelectEmissores('ntf'); }
function renderSelectDestinatariosOficio() { docRenderSelectDest('ofi'); }
function renderSelectDestinatariosNotificacao() { docRenderSelectDest('ntf'); }

function docSelecionarEmissor(tipo, id) {
  const e = id ? DB.emissores().find(x => x.id === id) : null;
  if (!e) return;
  docSet(tipo, 'emissor-nome', e.nome || ''); docSet(tipo, 'emissor-cargo', e.cargo || '');
  docPreview(tipo);
}
function selecionarEmissorOficio(id) { docSelecionarEmissor('ofi', id); }
function selecionarEmissorNotificacao(id) { docSelecionarEmissor('ntf', id); }

// ---------- avisos enquanto se preenche ----------
function docAvisosFormulario(tipo) {
  const box = docEl(tipo, 'avisos');
  if (!box) return;
  const avisos = [];
  const id = docVal(tipo, 'id');
  const ano = parseInt(docVal(tipo, 'ano'), 10);
  const num = parseInt(docVal(tipo, 'numero'), 10);
  const lista = docLista(tipo);
  const mesmoNum = lista.find(o => o.id !== id && parseInt(o.ano, 10) === ano && parseInt(o.numero, 10) === num);
  if (mesmoNum) avisos.push(`O número ${String(num).padStart(3, '0')}/${ano} já foi usado em “${mesmoNum.assunto || ''}”.`);
  if (tipo === 'ntf') {
    const srv = _docEstado.ntf.dests.find(d => d.nome);
    if (srv) {
      const ant = lista.filter(o => o.id !== id && !docExtras(o).cancelado && docDests(o).some(d => docNorm(d.nome) === docNorm(srv.nome)))
        .sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));
      if (ant.length) avisos.push(`${srv.nome} já recebeu ${ant.length} notificação(ões): ` +
        ant.slice(0, 4).map(o => (o.codigo || '').replace(/\s*-\s*\w+$/, '') + ' (' + (o.criadoEm ? new Date(o.criadoEm).toLocaleDateString('pt-BR') : '-') + ')').join(', ') + '.');
    }
  }
  box.style.display = avisos.length ? 'block' : 'none';
  box.innerHTML = avisos.map(a => '<div>⚠️ ' + esc(a) + '</div>').join('');
}

// ===================== SALVAR / EMITIR =====================
async function docSalvar(tipo) {
  const cfg = DOC_CFG[tipo];
  const d = docDoFormulario(tipo);
  const ano = parseInt(docVal(tipo, 'ano'), 10) || new Date().getFullYear();
  const numero = parseInt(docVal(tipo, 'numero'), 10) || cfg.proximo(ano);
  if (!d.assunto) return toastMsg(`Informe o assunto ${cfg.doDoc}.`, 'warning');
  if (!d.texto) return toastMsg(`Informe o texto ${cfg.doDoc}.`, 'warning');

  const lista = docLista(tipo);
  const antigo = d.id ? lista.find(o => o.id === d.id) : null;
  const dests = (d.destinatarios || []).map(x => {
    const r = { nome: (x.nome || '').trim(), cargo: (x.cargo || '').trim(), orgao: (x.orgao || '').trim() };
    if (x.tratamento) r.tratamento = x.tratamento;
    if (x.matricula) r.matricula = String(x.matricula).trim();
    return r;
  }).filter(x => x.nome || x.cargo || x.orgao);

  // Conferências antes de emitir
  if (!dests.length && !confirm(`${cfg.nome} sem destinatário.\n\nDeseja emitir assim mesmo?`)) return;
  const mesmoNum = lista.find(o => o.id !== d.id && parseInt(o.ano, 10) === ano && parseInt(o.numero, 10) === numero);
  if (mesmoNum && !confirm(`Já existe ${cfg.umDoc} com o número ${String(numero).padStart(3, '0')}/${ano}:\n“${mesmoNum.assunto || ''}”.\n\nEmitir outro com o MESMO número?`)) return;
  if (!antigo) {
    const dup = lista.find(o => !docExtras(o).cancelado && docNorm(o.assunto) === docNorm(d.assunto) &&
      docNorm(docDestsNomes(o)) === docNorm(dests.map(x => x.nome).join('; ')));
    if (dup && !confirm(`Parece duplicado: ${dup.codigo || cfg.umDoc} tem o mesmo assunto e o mesmo destinatário (emitido em ${dup.criadoEm ? new Date(dup.criadoEm).toLocaleDateString('pt-BR') : '-'}).\n\nEmitir mesmo assim?`)) return;
  } else {
    const xa = docExtras(antigo);
    if (((xa.envios && xa.envios.length) || xa.assinadoEm) && (antigo.texto !== d.texto || antigo.assunto !== d.assunto) &&
      !confirm(`${cfg.nome} já foi ${xa.envios && xa.envios.length ? 'enviado por e-mail' : 'assinado digitalmente'}.\nAlterar o texto muda o que aparece no link de conferência e deixa de corresponder ao PDF já entregue.\n\nSalvar a alteração mesmo assim?`)) return;
  }

  const btn = document.getElementById(tipo === 'ofi' ? 'btn-salvar-oficio' : 'btn-salvar-notificacao');
  const rotulo = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Salvando...'; }
  try {
    const extras = d.extras;
    if (antigo) extras.editadoEm = new Date().toISOString();
    if (!extras.status) extras.status = cfg.situacaoInicial;
    const primeiro = dests[0] || {};
    const dados = {
      id: d.id || uidOficio(),
      numero, ano,
      codigo: d.codigo || docCodigoPadrao(tipo, numero, ano),
      assunto: d.assunto,
      destinatarios: dests,
      destinatario: primeiro.nome || '',
      cargoDestinatario: primeiro.cargo || '',
      orgaoDestinatario: primeiro.orgao || '',
      cidadeData: d.cidadeData || `ITACARAMBI - MG, ${obterDataExtenso()}`,
      texto: d.texto,
      emissorNome: d.emissorNome,
      emissorCargo: d.emissorCargo,
      token: (antigo && antigo.token) || (tipo === 'ofi' ? gerarTokenOficio() : gerarTokenNotificacao()),
      criadoEm: (antigo && antigo.criadoEm) || new Date().toISOString(),
      extras
    };
    if (antigo) lista[lista.indexOf(antigo)] = dados; else lista.push(dados);
    await docPersistir(tipo, lista);
    try { DB.saveLog('Documento', (antigo ? 'Alterou ' : 'Emitiu ') + dados.codigo + ' — ' + dados.assunto, tipo === 'ofi' ? 'oficios' : 'notificacoes', dados.id); } catch (e) { /* log é opcional */ }

    docSet(tipo, 'id', dados.id);
    const titulo = docEl(tipo, 'form-title'); if (titulo) titulo.textContent = 'Editar ' + dados.codigo;
    const box = docEl(tipo, 'link-action-box');
    if (box) { docSet(tipo, 'link-input-display', docLinkPublico(tipo, dados.token)); box.style.display = 'flex'; }
    docRenderHistorico(tipo);
    docPreview(tipo);
    toastMsg(`${dados.codigo} salvo. Agora você pode baixar o PDF${tipo === 'ofi' ? ', assinar e enviar por e-mail' : ' ou assinar'}.`, 'success', 6000);
  } catch (err) {
    console.error('Erro ao salvar documento:', err);
    toastMsg('Erro ao salvar: ' + (err.message || err), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = rotulo; }
  }
}
function salvarOficio() { return docSalvar('ofi'); }
function salvarNotificacao() { return docSalvar('ntf'); }

function docCopiarLink(tipo, token) {
  const tok = token || (docLista(tipo).find(o => o.id === docVal(tipo, 'id')) || {}).token;
  if (!tok) return toastMsg('Salve o documento para gerar o link.', 'warning');
  const url = docLinkPublico(tipo, tok);
  navigator.clipboard.writeText(url).then(() => toastMsg('🔗 Link público copiado!', 'success')).catch(() => {
    const input = docEl(tipo, 'link-input-display');
    if (input) { input.value = url; input.select(); document.execCommand('copy'); toastMsg('🔗 Link público copiado!', 'success'); }
  });
}
function copiarLinkOficio(token) { docCopiarLink('ofi', token); }
function copiarLinkNotificacao(token) { docCopiarLink('ntf', token); }

// Impressão rápida da pré-visualização (o PDF oficial é gerado em oficios-pdf.js)
function docImprimirHtml(tipo) {
  const cont = docEl(tipo, 'preview-container');
  if (!cont || !cont.innerHTML) return toastMsg('Preencha o documento para imprimir.', 'warning');
  const win = window.open('', '_blank');
  if (!win) return toastMsg('O navegador bloqueou a janela de impressão.', 'warning');
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Impressão</title>
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>body{font-family:'Sora',sans-serif;background:#fff;margin:0;padding:20px}
  @media print{body{padding:0}.no-print{display:none}.doc-folha{box-shadow:none!important}}</style></head><body>
  <div class="no-print" style="text-align:right;margin-bottom:15px"><button onclick="window.print()" style="padding:10px 20px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-weight:bold;cursor:pointer">🖨️ Imprimir</button></div>
  ${cont.innerHTML}</body></html>`);
  win.document.close();
}
function imprimirOficioAtual() { docAcaoFormulario('ofi', 'abrir'); }
function imprimirNotificacaoAtual() { docAcaoFormulario('ntf', 'abrir'); }

// Botões do formulário que dependem do documento salvo (PDF, assinar, enviar)
async function docAcaoFormulario(tipo, acao) {
  const id = docVal(tipo, 'id');
  const salvo = id ? docLista(tipo).find(o => o.id === id) : null;
  if (!salvo) {
    if (acao === 'abrir') return docImprimirHtml(tipo);
    return toastMsg(`Salve ${DOC_CFG[tipo].esteDoc} primeiro (botão “Salvar & Emitir”).`, 'warning');
  }
  const f = docDoFormulario(tipo);
  if (salvo.texto !== f.texto || salvo.assunto !== f.assunto || salvo.codigo !== f.codigo) {
    if (!confirm('Há alterações no formulário que ainda não foram salvas.\nO PDF usa a versão SALVA do documento.\n\nContinuar com a versão salva?')) return;
  }
  if (acao === 'abrir') return docPdfAbrir(tipo, id);
  if (acao === 'baixar') return docPdfBaixar(tipo, id);
  if (acao === 'assinar') return docAbrirEnvio(tipo, id, false);
  if (acao === 'enviar') return docAbrirEnvio(tipo, id, true);
}

// ===================== HISTÓRICO =====================
function docRenderFiltros(tipo) {
  const selAno = docEl(tipo, 'filtro-ano');
  if (selAno) {
    const atual = selAno.value;
    const anos = Array.from(new Set(docLista(tipo).map(o => parseInt(o.ano, 10)).filter(Boolean))).sort((a, b) => b - a);
    selAno.innerHTML = '<option value="">Todos os anos</option>' + anos.map(a => `<option value="${a}">${a}</option>`).join('');
    if (atual) selAno.value = atual;
  }
  const selSit = docEl(tipo, 'filtro-status');
  if (selSit && !selSit.dataset.pronto) {
    const s = DOC_CFG[tipo].situacoes;
    selSit.innerHTML = '<option value="">Todas as situações</option>' + Object.keys(s).map(k => `<option value="${k}">${esc(s[k])}</option>`).join('') +
      '<option value="_vencido">Prazo de resposta vencido</option><option value="_cancelado">Sem efeito</option>';
    selSit.dataset.pronto = '1';
  }
}

function docPrazoVencido(o, tipo) {
  const x = docExtras(o);
  if (!x.prazoResposta || x.cancelado) return false;
  const s = docSituacao(o, tipo);
  return s !== 'respondido' && s !== 'arquivado' && x.prazoResposta < docHojeISO();
}

// Números que ficaram sem documento na sequência do ano
function docLacunas(tipo, ano) {
  const nums = docLista(tipo).filter(o => parseInt(o.ano, 10) === ano).map(o => parseInt(o.numero, 10)).filter(n => n > 0);
  if (nums.length < 2) return [];
  const usados = new Set(nums), faltam = [];
  for (let n = Math.min.apply(null, nums); n < Math.max.apply(null, nums) && faltam.length < 30; n++) if (!usados.has(n)) faltam.push(n);
  return faltam;
}

function docRenderHistorico(tipo) {
  const cfg = DOC_CFG[tipo];
  const cont = document.getElementById(cfg.listaEl);
  if (!cont) return;
  let lista = docLista(tipo).slice();
  if (tipo === 'ofi') _oficiosData = lista; else _notificacoesData = lista;
  docRenderFiltros(tipo);

  const busca = docNorm(docVal(tipo, 'busca'));
  const fAno = docVal(tipo, 'filtro-ano'), fSit = docVal(tipo, 'filtro-status');
  if (busca) lista = lista.filter(o => docNorm([o.codigo, o.assunto, docDestsNomes(o), o.emissorNome, o.texto].join(' ')).includes(busca));
  if (fAno) lista = lista.filter(o => String(o.ano) === fAno);
  if (fSit === '_vencido') lista = lista.filter(o => docPrazoVencido(o, tipo));
  else if (fSit === '_cancelado') lista = lista.filter(o => docExtras(o).cancelado);
  else if (fSit) lista = lista.filter(o => !docExtras(o).cancelado && docSituacao(o, tipo) === fSit);
  lista.sort((a, b) => (parseInt(b.ano, 10) - parseInt(a.ano, 10)) || (parseInt(b.numero, 10) - parseInt(a.numero, 10)) || String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));

  const lac = docEl(tipo, 'lacunas');
  if (lac) {
    const ano = parseInt(fAno, 10) || new Date().getFullYear();
    const faltam = docLacunas(tipo, ano);
    lac.style.display = faltam.length ? 'block' : 'none';
    lac.textContent = faltam.length ? `Numeração de ${ano}: sem registro ${faltam.length > 1 ? 'dos números' : 'do número'} ${faltam.map(n => String(n).padStart(3, '0')).join(', ')} (não emitido${faltam.length > 1 ? 's' : ''} ou excluído${faltam.length > 1 ? 's' : ''}).` : '';
  }

  if (!lista.length) {
    cont.innerHTML = `<div class="empty"><div class="icon">${cfg.icone}</div><p>Nenhum registro encontrado.</p></div>`;
    return;
  }
  const pub = _oficiosModoPublico;
  cont.innerHTML = lista.map(o => {
    const x = docExtras(o), sit = docSituacao(o, tipo);
    const tags = [];
    if (x.cancelado) tags.push('<span class="tag tag-red">🚫 Sem efeito</span>');
    if (x.assinadoEm) tags.push(`<span class="tag tag-green" title="Assinado por ${esc(x.assinadoPor || '')} em ${esc(new Date(x.assinadoEm).toLocaleString('pt-BR'))}">🖋️ Assinado</span>`);
    if (x.envios && x.envios.length) {
      const u = x.envios[x.envios.length - 1];
      tags.push(`<span class="tag tag-blue" title="${esc(x.envios.map(e => new Date(e.em).toLocaleString('pt-BR') + ' → ' + (e.para || []).join(', ')).join('\n'))}">✉️ Enviado ${esc(new Date(u.em).toLocaleDateString('pt-BR'))} (${(u.para || []).length})</span>`);
    }
    if (x.prazoResposta) tags.push(`<span class="tag ${docPrazoVencido(o, tipo) ? 'tag-red' : 'tag-blue'}">⏳ Resposta até ${esc(docDataBR(x.prazoResposta))}</span>`);
    if (x.oficioRel) tags.push(`<span class="tag tag-blue">↪ ${esc(x.oficioRel)}</span>`);
    const selSit = (pub || x.cancelado) ? `<span class="tag tag-blue">${esc(cfg.situacoes[sit])}</span>` :
      `<select onchange="docMudarSituacao('${tipo}','${esc(o.id)}',this.value)" title="Situação" class="doc-ctl" style="padding:3px 6px; font-size:.72rem; width:auto; max-width:240px;">` +
      Object.keys(cfg.situacoes).map(k => `<option value="${k}"${k === sit ? ' selected' : ''}>${esc(cfg.situacoes[k])}</option>`).join('') + '</select>';
    const b = (rot, on, tit, cls) => `<button class="btn ${cls || 'btn-ghost'} btn-sm" onclick="${on}" title="${tit}">${rot}</button>`;
    const acoes = [
      b('🔗', `docCopiarLink('${tipo}','${esc(o.token)}')`, 'Copiar link público de conferência'),
      b('📄 PDF', `docPdfBaixar('${tipo}','${esc(o.id)}')`, 'Baixar o PDF')
    ];
    if (!pub) {
      if (!x.cancelado) {
        acoes.push(b(tipo === 'ofi' ? '🖋️ Assinar / ✉️ Enviar' : '🖋️ Assinar', `docAbrirEnvio('${tipo}','${esc(o.id)}',${tipo === 'ofi'})`,
          tipo === 'ofi' ? 'Assinar digitalmente e enviar por e-mail' : 'Assinar digitalmente e baixar', 'btn-primary'));
      }
      if (x.envios && x.envios.length) {
        acoes.push(b('💬', `docZapDoHistorico('${tipo}','${esc(o.id)}')`, 'Encaminhar pelo WhatsApp (texto com o link do documento)'));
      }
      acoes.push(b('📑', `docUsarComoModelo('${tipo}','${esc(o.id)}')`, 'Usar como base para um novo documento'));
      acoes.push(b('✏️', `docEditar('${tipo}','${esc(o.id)}')`, 'Editar'));
      acoes.push(x.cancelado
        ? b('↩️', `docCancelar('${tipo}','${esc(o.id)}',false)`, 'Reativar (desfazer “sem efeito”)')
        : b('🚫', `docCancelar('${tipo}','${esc(o.id)}',true)`, 'Tornar sem efeito (mantém o número no histórico)'));
      acoes.push(b('🗑️', `docExcluir('${tipo}','${esc(o.id)}')`, 'Excluir definitivamente', 'btn-danger'));
    }
    return `
    <div class="ev-list-item completo" style="margin-bottom:10px;${x.cancelado ? 'opacity:.7;' : ''}">
      <div class="ev-list-header" style="align-items:flex-start; gap:10px; flex-wrap:wrap;">
        <div style="flex:1; min-width:220px;">
          <div class="ev-list-nome" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span${x.cancelado ? ' style="text-decoration:line-through"' : ''}>${cfg.icone} ${esc(o.codigo)}</span>${tags.join('')}
          </div>
          <div style="font-size:.8rem; margin-top:4px;">${esc(o.assunto)}</div>
          <div class="ev-list-meta" style="margin-top:4px; font-size:0.75rem;">
            <span>👤 ${esc(docDestsNomes(o) || 'sem destinatário')}</span>
            <span>✍️ ${esc(o.emissorNome || '-')}</span>
            <span>📅 ${o.criadoEm ? new Date(o.criadoEm).toLocaleDateString('pt-BR') : '-'}</span>
            ${x.cancelado && x.cancelado.motivo ? `<span>Motivo: ${esc(x.cancelado.motivo)}</span>` : ''}
          </div>
          <div style="margin-top:6px;">${selSit}</div>
        </div>
        <div class="ev-list-actions" style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">${acoes.join('')}</div>
      </div>
    </div>`;
  }).join('');
}
function renderHistoricoOficios() { docRenderHistorico('ofi'); }
function renderHistoricoNotificacoes() { docRenderHistorico('ntf'); }

async function docMudarSituacao(tipo, id, valor) {
  await docAtualizarExtras(tipo, id, { status: valor });
  docRenderHistorico(tipo);
  toastMsg('Situação atualizada.', 'success', 2000);
}

function docCarregarNoFormulario(tipo, o, comoNovo) {
  const cfg = DOC_CFG[tipo];
  const x = docExtras(o);
  docRenderSelectEmissores(tipo);
  if (tipo === 'ntf') ntfRenderOficiosRel();
  if (comoNovo) {
    const ano = new Date().getFullYear(), num = cfg.proximo(ano);
    docSet(tipo, 'id', ''); docSet(tipo, 'ano', ano); docSet(tipo, 'numero', num);
    docSet(tipo, 'codigo', docCodigoPadrao(tipo, num, ano));
    docSet(tipo, 'cidade-data', `ITACARAMBI - MG, ${obterDataExtenso()}`);
    docSet(tipo, 'prazo', '');
  } else {
    docSet(tipo, 'id', o.id); docSet(tipo, 'ano', o.ano || new Date().getFullYear()); docSet(tipo, 'numero', o.numero || 1);
    docSet(tipo, 'codigo', o.codigo || ''); docSet(tipo, 'cidade-data', o.cidadeData || '');
    docSet(tipo, 'prazo', x.prazoResposta || '');
  }
  docSet(tipo, 'assunto', o.assunto || ''); docSet(tipo, 'texto', o.texto || '');
  docSet(tipo, 'emissor-nome', o.emissorNome || ''); docSet(tipo, 'emissor-cargo', o.emissorCargo || '');
  const em = DB.emissores().find(e => docNorm(e.nome) === docNorm(o.emissorNome));
  docSet(tipo, 'emissor-select', em ? em.id : '');
  docSet(tipo, 'anexos', x.anexos || ''); docSet(tipo, 'cc', x.cc || '');
  docSet(tipo, 'tipo', x.tipoNtf || ''); docSet(tipo, 'prazo-dias', x.prazoDias || ''); docSet(tipo, 'oficio-rel', x.oficioRel || '');
  const t = docEl(tipo, 'testemunhas'); if (t) t.checked = !!x.testemunhas;
  _docEstado[tipo].dests = docDests(o).map(d => Object.assign({}, d));

  const titulo = docEl(tipo, 'form-title');
  if (titulo) titulo.textContent = comoNovo ? (tipo === 'ofi' ? 'Novo Ofício (a partir de ' : 'Nova Notificação (a partir de ') + (o.codigo || '') + ')' : 'Editar ' + o.codigo;
  const box = docEl(tipo, 'link-action-box');
  if (box) {
    if (comoNovo) box.style.display = 'none';
    else { docSet(tipo, 'link-input-display', docLinkPublico(tipo, o.token)); box.style.display = 'flex'; }
  }
  docRenderDests(tipo);
  docPreview(tipo);
  const card = document.getElementById(tipo === 'ofi' ? 'card-form-oficio' : 'card-form-notificacao');
  if (card) card.scrollIntoView({ behavior: 'smooth' });
}
function docEditar(tipo, id) { const o = docLista(tipo).find(x => x.id === id); if (o) docCarregarNoFormulario(tipo, o, false); }
function docUsarComoModelo(tipo, id) {
  const o = docLista(tipo).find(x => x.id === id);
  if (!o) return;
  docCarregarNoFormulario(tipo, o, true);
  toastMsg('Texto copiado para um novo documento, com o próximo número. Revise antes de salvar.', 'info', 5000);
}
function carregarOficioParaEditar(id) { docEditar('ofi', id); }
function carregarNotificacaoParaEditar(id) { docEditar('ntf', id); }

async function docCancelar(tipo, id, cancelar) {
  const o = docLista(tipo).find(x => x.id === id);
  if (!o) return;
  if (cancelar) {
    const motivo = prompt(`Tornar SEM EFEITO ${o.codigo}?\nO número continua registrado no histórico e o link público passa a mostrar o aviso.\n\nMotivo (opcional):`, '');
    if (motivo === null) return;
    await docAtualizarExtras(tipo, id, { cancelado: { em: new Date().toISOString(), motivo: motivo.trim().slice(0, 200) } });
    try { DB.saveLog('Documento', 'Tornou sem efeito ' + o.codigo, tipo === 'ofi' ? 'oficios' : 'notificacoes', id); } catch (e) { /* opcional */ }
    toastMsg(o.codigo + ' marcado como sem efeito.', 'info');
  } else {
    await docAtualizarExtras(tipo, id, { cancelado: null });
    toastMsg(o.codigo + ' reativado.', 'success');
  }
  docRenderHistorico(tipo);
}

async function docExcluir(tipo, id) {
  const o = docLista(tipo).find(x => x.id === id);
  if (!o) return;
  if (!confirm(`EXCLUIR definitivamente ${o.codigo}?\n\nO número ficará sem registro e o link público deixará de funcionar. Não é possível desfazer.\nPara apenas anular o documento mantendo o histórico, use “🚫 Tornar sem efeito”.`)) return;
  await DOC_CFG[tipo].excluir(id);
  docGuardarExtrasLocal(tipo, docLista(tipo));
  try { DB.saveLog('Documento', 'Excluiu ' + o.codigo + ' — ' + (o.assunto || ''), tipo === 'ofi' ? 'oficios' : 'notificacoes', id); } catch (e) { /* opcional */ }
  if (docVal(tipo, 'id') === id) docNovo(tipo);
  docRenderHistorico(tipo);
  toastMsg(o.codigo + ' excluído.', 'info');
}
function excluirOficio(id) { return docExcluir('ofi', id); }
function excluirNotificacao(id) { return docExcluir('ntf', id); }

// Avisa quando a coluna "extras" ainda não existe na nuvem
let _docColunaExtras = {};
async function docVerificarColunaExtras(tipo) {
  if (_docColunaExtras[tipo] !== undefined || typeof supabaseClient === 'undefined') return;
  _docColunaExtras[tipo] = true;
  try {
    const { error } = await supabaseClient.from(tipo === 'ofi' ? 'oficios' : 'notificacoes').select('extras').limit(1);
    if (error && /extras/i.test(error.message || '')) _docColunaExtras[tipo] = false;
  } catch (e) { /* offline: não avisa */ }
  const box = docEl(tipo, 'aviso-sql');
  if (box) box.style.display = _docColunaExtras[tipo] === false ? 'block' : 'none';
}

// ===================== CADASTROS (destinatários, emissores, e-mails) =====================
async function salvarCadastroDestinatario() {
  const g = id => document.getElementById(id);
  const idEdit = g('dest-cad-id') ? g('dest-cad-id').value : '';
  const nome = g('dest-cad-nome').value.trim();
  const cargo = g('dest-cad-cargo').value.trim();
  const orgao = g('dest-cad-orgao').value.trim();
  const trat = g('dest-cad-tratamento') ? g('dest-cad-tratamento').value : '';
  if (!nome) return toastMsg('Informe o nome do destinatário.', 'warning');

  const lista = DB.destinatarios().slice();
  let id = idEdit;
  const atual = idEdit ? lista.find(d => d.id === idEdit) : null;
  if (atual) { atual.nome = nome; atual.cargo = cargo; atual.orgao = orgao; }
  else { id = uidOficio(); lista.push({ id, nome, cargo, orgao }); }
  await DB.saveDestinatarios(lista);

  const cfg = DB.config();
  const mapa = Object.assign({}, cfg.destTratamentos || {});
  if (trat) mapa[id] = trat; else delete mapa[id];
  if (JSON.stringify(mapa) !== JSON.stringify(cfg.destTratamentos || {})) { cfg.destTratamentos = mapa; await DB.saveConfig(cfg); }

  cancelarEdicaoDestinatario();
  renderCadastrosOficio();
  docRenderSelectDest('ofi'); docRenderSelectDest('ntf');
  toastMsg(atual ? 'Destinatário atualizado!' : 'Destinatário cadastrado com sucesso!', 'success');
}

function editarDestinatarioCadastro(id) {
  const d = DB.destinatarios().find(x => x.id === id);
  if (!d) return;
  const g = i => document.getElementById(i);
  g('dest-cad-id').value = d.id; g('dest-cad-nome').value = d.nome || '';
  g('dest-cad-cargo').value = d.cargo || ''; g('dest-cad-orgao').value = d.orgao || '';
  g('dest-cad-tratamento').value = docTratamentoCadastro(d.id);
  const c = g('dest-cad-cancelar'); if (c) c.style.display = '';
  g('dest-cad-nome').focus();
}
function cancelarEdicaoDestinatario() {
  ['dest-cad-id', 'dest-cad-nome', 'dest-cad-cargo', 'dest-cad-orgao', 'dest-cad-tratamento'].forEach(i => { const e = document.getElementById(i); if (e) e.value = ''; });
  const c = document.getElementById('dest-cad-cancelar'); if (c) c.style.display = 'none';
}

async function excluirDestinatarioCadastro(id) {
  const d = DB.destinatarios().find(x => x.id === id);
  if (!confirm(`Excluir o destinatário "${d ? d.nome : ''}"?`)) return;
  if (typeof DB.deleteDestinatario === 'function') await DB.deleteDestinatario(id);
  else await DB.saveDestinatarios(DB.destinatarios().filter(x => x.id !== id));
  renderCadastrosOficio();
  docRenderSelectDest('ofi'); docRenderSelectDest('ntf');
  toastMsg('Destinatário excluído.', 'info');
}

async function salvarCadastroEmissor() {
  const nome = document.getElementById('emi-cad-nome').value.trim();
  const cargo = document.getElementById('emi-cad-cargo').value.trim();
  if (!nome) return toastMsg('Informe o nome do emissor.', 'warning');
  const lista = DB.emissores().slice();
  lista.push({ id: uidOficio(), nome, cargo });
  await DB.saveEmissores(lista);
  document.getElementById('emi-cad-nome').value = '';
  document.getElementById('emi-cad-cargo').value = '';
  renderCadastrosOficio();
  docRenderSelectEmissores('ofi'); docRenderSelectEmissores('ntf');
  toastMsg('Emissor cadastrado com sucesso!', 'success');
}

async function excluirEmissorCadastro(id) {
  const e = DB.emissores().find(x => x.id === id);
  if (!confirm(`Excluir o emissor "${e ? e.nome : ''}"?`)) return;
  if (typeof DB.deleteEmissor === 'function') await DB.deleteEmissor(id);
  else await DB.saveEmissores(DB.emissores().filter(x => x.id !== id));
  renderCadastrosOficio();
  docRenderSelectEmissores('ofi'); docRenderSelectEmissores('ntf');
  toastMsg('Emissor excluído.', 'info');
}

// E-mails para envio de ofícios (guardados na configuração do sistema)
function ofiEmails() { const l = DB.config().oficioEmails; return Array.isArray(l) ? l : []; }
function ofiEmailValido(e) { return /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[a-z]{2,}$/i.test(String(e || '').trim()); }

async function ofiCadastrarEmail(nome, email) {
  nome = String(nome || '').trim(); email = String(email || '').trim().toLowerCase();
  if (!ofiEmailValido(email)) { toastMsg('E-mail inválido.', 'warning'); return null; }
  const lista = ofiEmails().slice();
  if (lista.some(x => x.email === email)) { toastMsg('Este e-mail já está cadastrado.', 'info'); return null; }
  const novo = { id: uidOficio(), nome: nome || email, email };
  lista.push(novo);
  const cfg = DB.config(); cfg.oficioEmails = lista;
  await DB.saveConfig(cfg);
  return novo;
}
async function salvarCadastroEmail() {
  const n = document.getElementById('mail-cad-nome'), e = document.getElementById('mail-cad-email');
  const novo = await ofiCadastrarEmail(n.value, e.value);
  if (!novo) return;
  n.value = ''; e.value = '';
  renderCadastrosOficio();
  toastMsg('E-mail cadastrado!', 'success');
}
async function excluirEmailCadastro(id) {
  const x = ofiEmails().find(m => m.id === id);
  if (!x || !confirm(`Excluir o e-mail ${x.email}?`)) return;
  const cfg = DB.config(); cfg.oficioEmails = ofiEmails().filter(m => m.id !== id);
  await DB.saveConfig(cfg);
  renderCadastrosOficio();
  if (typeof docEnvioRenderEmails === 'function') docEnvioRenderEmails();
}

function renderCadastrosOficio() {
  const item = (titulo, sub, botoes) => `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:8px 10px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-sm);">
      <div style="min-width:0;"><div style="font-size:.78rem; font-weight:600; word-break:break-word;">${titulo}</div><div style="font-size:.68rem; color:var(--muted); word-break:break-word;">${sub}</div></div>
      <div style="display:flex; gap:4px; flex-shrink:0;">${botoes}</div>
    </div>`;
  const vazio = t => `<div style="font-size:.74rem;color:var(--muted);">${t}</div>`;

  const contDest = document.getElementById('lista-destinatarios-cadastro');
  if (contDest) {
    const lista = DB.destinatarios();
    contDest.innerHTML = lista.length ? lista.map(d => item(
      (DOC_TRATAMENTOS[docTratamentoCadastro(d.id)] ? '<span style="font-weight:400;color:var(--muted)">' + esc(DOC_TRATAMENTOS[docTratamentoCadastro(d.id)]) + '</span> ' : '') + esc(d.nome),
      esc([d.cargo, d.orgao].filter(Boolean).join(' · ')),
      `<button class="btn btn-ghost btn-sm" onclick="editarDestinatarioCadastro('${esc(d.id)}')" title="Editar">✏️</button>
       <button class="btn btn-danger btn-sm" onclick="excluirDestinatarioCadastro('${esc(d.id)}')" title="Excluir">🗑️</button>`)).join('') : vazio('Nenhum destinatário cadastrado.');
  }
  const contEmi = document.getElementById('lista-emissores-cadastro');
  if (contEmi) {
    const lista = DB.emissores();
    contEmi.innerHTML = lista.length ? lista.map(e => item(esc(e.nome), esc(e.cargo || ''),
      `<button class="btn btn-danger btn-sm" onclick="excluirEmissorCadastro('${esc(e.id)}')" title="Excluir">🗑️</button>`)).join('') : vazio('Nenhum emissor cadastrado.');
  }
  const contMail = document.getElementById('lista-emails-cadastro');
  if (contMail) {
    const lista = ofiEmails();
    contMail.innerHTML = lista.length ? lista.map(m => item(esc(m.nome), esc(m.email),
      `<button class="btn btn-danger btn-sm" onclick="excluirEmailCadastro('${esc(m.id)}')" title="Excluir">🗑️</button>`)).join('') : vazio('Nenhum e-mail cadastrado. Cadastre aqui e escolha um ou vários na hora de enviar.');
  }
}

// ===================== MODELOS DE OFÍCIO =====================
const OFI_MODELOS_PADRAO = [
  { id: 'm_solic', nome: 'Solicitação à Secretária', assunto: 'Solicitação de [o que se pede]',
    texto: 'Senhora Secretária,\nCumprimentando-a cordialmente, a Coordenação de Atenção Primária à Saúde vem solicitar [descrever o pedido de forma objetiva].\nA solicitação se justifica porque [explicar a necessidade, com números ou fatos].\nDiante do exposto, solicitamos [providência esperada], se possível até [data].\nColocamo-nos à disposição para os esclarecimentos que se fizerem necessários.' },
  { id: 'm_compras', nome: 'Compras — aquisição de material ou serviço', assunto: 'Solicitação de aquisição de [item]',
    texto: 'Senhor Coordenador,\nSolicitamos a aquisição de [item, com especificação], na quantidade de [quantidade], para atender [unidade ou equipe].\nA necessidade decorre de [justificativa: estoque zerado, demanda, programação].\nSolicitamos que a entrega ocorra até [data], em [local de entrega].\nSeguem em anexo [orçamentos / termo de referência], quando houver.' },
  { id: 'm_cnes', nome: 'Regulação — alteração no CNES', assunto: 'Solicitação de alteração cadastral no CNES',
    texto: 'Senhora Coordenadora,\nSolicitamos as seguintes alterações no Cadastro Nacional de Estabelecimentos de Saúde (CNES):\n1. [Profissional — CPF/CNS]: [inclusão / exclusão / alteração de CBO / transferência de lotação] na [unidade — CNES nº], equipe [nome — INE], com carga horária de [horas] semanais, a partir de [data].\nAs alterações são necessárias para [motivo: adequação da equipe, cumprimento de portaria, financiamento].\nSolicitamos a confirmação por escrito após a atualização, para acompanhamento no sistema.' },
  { id: 'm_deputado', nome: 'Parlamentar — pedido de apoio', assunto: 'Solicitação de apoio para [pleito] do Município de Itacarambi/MG',
    texto: 'Senhor(a) Deputado(a),\nCumprimentando-o(a) respeitosamente, a Coordenação de Atenção Primária à Saúde de Itacarambi/MG vem solicitar o apoio de Vossa Excelência para [descrever o pleito].\nO Município [contextualizar: população, equipes, situação atual do pedido junto ao órgão].\nA medida permitirá [benefício para a população].\nCertos de contar com a atenção de Vossa Excelência, permanecemos à disposição.\nRespeitosamente,' },
  { id: 'm_encam', nome: 'Encaminhamento de documentos', assunto: 'Encaminhamento de [documento]',
    texto: 'Senhor(a) [cargo],\nEncaminhamos, em anexo, [documento], referente a [assunto / período], para [conhecimento / análise / providências].\nPermanecemos à disposição para esclarecimentos.' },
  { id: 'm_ouvidoria', nome: 'Resposta a manifestação da Ouvidoria', assunto: 'Resposta à manifestação – Protocolo nº [número]',
    texto: 'Senhor(a) Ouvidor(a),\nEm resposta à manifestação registrada sob o Protocolo nº [número], de [data], informamos o que segue.\nApós apuração junto à equipe responsável, constatou-se que [resumo objetivo dos fatos apurados].\nForam adotadas as seguintes providências: [listar].\nA Coordenação permanece à disposição do(a) manifestante e desta Ouvidoria.' }
];
function ofiModelosUsuario() { const l = DB.config().oficioModelos; return Array.isArray(l) ? l : []; }

function docRenderModelos() {
  const sel = docEl('ofi', 'modelo-select');
  if (!sel) return;
  const meus = ofiModelosUsuario();
  sel.innerHTML = '<option value="">Começar de um modelo...</option>' +
    (meus.length ? '<optgroup label="Meus modelos">' + meus.map(m => `<option value="${esc(m.id)}">${esc(m.nome)}</option>`).join('') + '</optgroup>' : '') +
    '<optgroup label="Modelos do sistema">' + OFI_MODELOS_PADRAO.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('') + '</optgroup>';
  const btnDel = docEl('ofi', 'modelo-excluir'); if (btnDel) btnDel.style.display = 'none';
}

function ofiAplicarModelo(id) {
  const btnDel = docEl('ofi', 'modelo-excluir');
  if (btnDel) btnDel.style.display = ofiModelosUsuario().some(m => m.id === id) ? '' : 'none';
  if (!id) return;
  const m = ofiModelosUsuario().concat(OFI_MODELOS_PADRAO).find(x => x.id === id);
  if (!m) return;
  if (docVal('ofi', 'texto') && !confirm('Substituir o assunto e o texto atuais pelo modelo?')) { docSet('ofi', 'modelo-select', ''); return; }
  docSet('ofi', 'assunto', m.assunto || ''); docSet('ofi', 'texto', m.texto || '');
  docPreview('ofi');
  toastMsg('Modelo aplicado. Troque os trechos entre [colchetes].', 'info', 5000);
}

async function ofiSalvarComoModelo() {
  const texto = docVal('ofi', 'texto');
  if (!texto) return toastMsg('Escreva o texto antes de salvar como modelo.', 'warning');
  const nome = prompt('Nome do modelo:', docVal('ofi', 'assunto').slice(0, 60));
  if (!nome || !nome.trim()) return;
  const cfg = DB.config();
  cfg.oficioModelos = ofiModelosUsuario().concat([{ id: 'u_' + uidOficio(6), nome: nome.trim().slice(0, 80), assunto: docVal('ofi', 'assunto'), texto }]);
  await DB.saveConfig(cfg);
  docRenderModelos();
  toastMsg('Modelo salvo em “Meus modelos”.', 'success');
}

async function ofiExcluirModelo() {
  const id = docVal('ofi', 'modelo-select');
  const m = ofiModelosUsuario().find(x => x.id === id);
  if (!m || !confirm(`Excluir o modelo “${m.nome}”?`)) return;
  const cfg = DB.config(); cfg.oficioModelos = ofiModelosUsuario().filter(x => x.id !== id);
  await DB.saveConfig(cfg);
  docRenderModelos();
  toastMsg('Modelo excluído.', 'info');
}

// ===================== REDAÇÃO COM IA =====================
function docIaAlternar(tipo) {
  const box = docEl(tipo, 'ia-box');
  if (!box) return;
  box.style.display = box.style.display === 'none' || !box.style.display ? 'block' : 'none';
  if (box.style.display === 'block') { const p = docEl(tipo, 'ia-pedido'); if (p) p.focus(); }
}

async function docIaPedir(corpo) {
  if (typeof iaChamar === 'function') return iaChamar(corpo);
  const url = typeof IA_GESTAO_URL !== 'undefined' ? IA_GESTAO_URL : '';
  if (!url) throw new Error('A Central de IA não está disponível.');
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const d = await resp.json().catch(() => ({}));
  if (!resp.ok || !d.texto) throw new Error(d.erro || 'A IA não respondeu.');
  return d.texto;
}

// modo 'redigir': escreve a partir dos pontos · modo 'revisar': melhora o texto que já está no formulário
async function docIaGerar(tipo, modo) {
  const pedido = docVal(tipo, 'ia-pedido');
  const textoAtual = docVal(tipo, 'texto');
  if (modo === 'redigir' && pedido.length < 15) return toastMsg('Descreva em uma ou duas frases o que o documento deve comunicar.', 'warning');
  if (modo === 'revisar' && textoAtual.length < 30) return toastMsg('Escreva o texto primeiro; a IA revisa o que estiver no campo.', 'warning');
  if (modo === 'redigir' && textoAtual && !confirm('Substituir o texto atual pelo texto da IA?')) return;

  const dests = _docEstado[tipo].dests.filter(d => d.nome).map(d => [d.nome, d.cargo, d.orgao].filter(Boolean).join(', ')).join(' | ');
  const ehNtf = tipo === 'ntf';
  let contexto = `Pedido de redação feito no ${ehNtf ? 'módulo de Notificação Administrativa' : 'Gerador de Ofícios'} (texto livre, sem números do sistema).\n` +
    `Destinatário: ${dests || 'não informado'}.\nEmissor: ${docVal(tipo, 'emissor-nome')}, ${docVal(tipo, 'emissor-cargo')}.\nAssunto informado: ${docVal(tipo, 'assunto') || 'não informado'}.\n` +
    (ehNtf ? 'ATENÇÃO: o documento é uma NOTIFICAÇÃO ADMINISTRATIVA dirigida a um servidor (não é punição): relate os fatos de forma objetiva e sem juízo de valor, indique a orientação ou providência esperada e o prazo, se houver. Vocativo "Prezado(a) Servidor(a),".\n' : '') +
    'Neste pedido, nomes de pessoas e de órgãos informados acima podem ser usados normalmente no texto.';
  let foco;
  if (modo === 'revisar') {
    contexto += '\n\nTEXTO ATUAL A REVISAR:\n' + textoAtual;
    foco = 'Reescreva o TEXTO ATUAL do contexto em linguagem oficial, clara e objetiva, corrigindo português e organizando os parágrafos. Não acrescente fatos, números, datas, nomes ou leis que não estejam no texto.' + (pedido ? ' Orientação adicional: ' + pedido : '');
  } else {
    foco = 'Pontos a comunicar: ' + pedido + '. Não invente números, datas, nomes ou leis além dos informados; onde faltar um dado, deixe um marcador entre [colchetes].';
  }

  const btns = Array.from((docEl(tipo, 'ia-box') || document).querySelectorAll('button'));
  const st = docEl(tipo, 'ia-status');
  btns.forEach(b => { b.disabled = true; });
  if (st) st.textContent = '⏳ A IA está escrevendo...';
  try {
    const txt = String(await docIaPedir({ tarefa: 'oficio', contexto, foco: foco.slice(0, 1500) })).replace(/\*\*/g, '').trim();
    let assunto = '', corpo = txt;
    const m = /^\s*ASSUNTO:\s*(.+)\s*\n/i.exec(txt);
    if (m) { assunto = m[1].trim(); corpo = txt.slice(m[0].length).replace(/^\s+/, ''); }
    corpo = corpo.split('\n').map(l => l.trim()).filter(Boolean).join('\n');
    if (assunto && (!docVal(tipo, 'assunto') || modo === 'redigir')) docSet(tipo, 'assunto', assunto);
    docSet(tipo, 'texto', corpo);
    docPreview(tipo);
    if (st) st.textContent = '✅ Texto gerado. Revise antes de salvar — a IA pode errar.';
  } catch (e) {
    console.error(e);
    if (st) st.textContent = '';
    toastMsg(e.message || 'A IA não respondeu.', 'error');
  } finally {
    btns.forEach(b => { b.disabled = false; });
  }
}

// ===================== NOTIFICAÇÃO: APOIOS =====================
function ntfRenderOficiosRel() {
  const sel = docEl('ntf', 'oficio-rel');
  if (!sel) return;
  const atual = sel.value;
  const ofs = docLista('ofi').filter(o => !docExtras(o).cancelado)
    .sort((a, b) => (parseInt(b.ano, 10) - parseInt(a.ano, 10)) || (parseInt(b.numero, 10) - parseInt(a.numero, 10))).slice(0, 80);
  sel.innerHTML = '<option value="">Nenhum</option>' + ofs.map(o => `<option value="${esc(o.codigo)}">${esc(o.codigo)} — ${esc(String(o.assunto || '').slice(0, 60))}</option>`).join('');
  if (atual) sel.value = atual;
}

function ntfInserirEstrutura() {
  if (docVal('ntf', 'texto') && !confirm('Substituir o texto atual pela estrutura sugerida?')) return;
  const dias = parseInt(docVal('ntf', 'prazo-dias'), 10);
  docSet('ntf', 'texto', [
    'Prezado(a) Servidor(a),',
    'A Coordenação de Atenção Primária à Saúde, no exercício de suas atribuições de acompanhamento das equipes, vem NOTIFICÁ-LO(A) do que segue.',
    'DOS FATOS: [descrever de forma objetiva o que ocorreu, com datas, locais e registros que comprovam — sem juízo de valor].',
    'DA ORIENTAÇÃO: [informar a regra, atribuição ou rotina que deve ser observada e onde ela está prevista].',
    'DA PROVIDÊNCIA: [dizer exatamente o que o(a) servidor(a) deve fazer e a partir de quando].',
    dias > 0
      ? `Fica facultada a apresentação de manifestação por escrito no prazo de ${dias} dia(s) útil(eis), contado(s) da ciência desta notificação.`
      : 'Fica facultada a apresentação de manifestação por escrito, no campo próprio ao final deste documento.',
    'Esta notificação tem caráter orientativo e de registro, não constituindo penalidade.'
  ].join('\n'));
  docPreview('ntf');
}

// ===================== PÁGINAS PÚBLICAS (sem login) =====================
async function docRenderPublico(tipo, token) {
  const cfg = DOC_CFG[tipo];
  const app = document.querySelector('.app-container'), login = document.getElementById('login-screen');
  if (app) app.style.display = 'none';
  if (login) login.style.display = 'none';

  let doc = docLista(tipo).find(o => o.token === token);
  if (!doc) {
    try {
      const { data } = await supabaseClient.from(tipo === 'ofi' ? 'oficios' : 'notificacoes').select('*').eq('token', token).single();
      if (data) doc = normalizarCamposObjeto(data);
    } catch (e) { console.warn('Erro ao buscar documento público:', e); }
  }
  if (!doc) {
    document.body.innerHTML = `
      <div style="min-height:100vh; background:#060b14; color:#fff; display:flex; align-items:center; justify-content:center; flex-direction:column; padding:20px; font-family:sans-serif; text-align:center;">
        <div style="font-size:48px; margin-bottom:16px;">${cfg.icone}</div>
        <h2 style="font-size:22px; margin-bottom:8px;">Documento não encontrado ou inválido</h2>
        <p style="color:#94a3b8; font-size:14px; margin-bottom:24px;">O código informado não corresponde a nenhum documento emitido pelo sistema.</p>
        <a href="index.html.html" style="padding:10px 20px; background:#3b82f6; color:#fff; text-decoration:none; border-radius:8px; font-weight:bold;">Acessar o Sistema Atlas Saúde</a>
      </div>`;
    return;
  }
  doc.extras = docExtras(doc);
  const x = doc.extras;
  window._docPublico = { tipo, doc };
  const aviso = (cor, html) => `<div class="no-print" style="width:100%; max-width:800px; background:${cor}; color:#fff; border-radius:10px; padding:12px 16px; margin-bottom:14px; font-size:13px; line-height:1.5;">${html}</div>`;
  document.body.innerHTML = `
    <style>@media print{.no-print{display:none!important}body>div{background:#fff!important;padding:0!important}.doc-folha{box-shadow:none!important}}</style>
    <div style="min-height:100vh; background:#0f172a; padding:30px 15px; font-family:'Sora', sans-serif; display:flex; flex-direction:column; align-items:center;">
      <div style="width:100%; max-width:800px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:16px; color:#fff;" class="no-print">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:20px;">${cfg.icone}</span>
          <div>
            <div style="font-weight:700; font-size:15px;">Conferência de documento</div>
            <div style="font-size:12px; color:#94a3b8;">Atlas Saúde · Coordenação de Atenção Primária à Saúde de Itacarambi/MG</div>
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button onclick="docPdfPublico()" style="padding:10px 18px; background:#3b82f6; color:#fff; border:none; border-radius:8px; font-weight:700; cursor:pointer; font-family:'Sora', sans-serif;">📄 Baixar PDF</button>
          <button onclick="window.print()" style="padding:10px 18px; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:8px; font-weight:700; cursor:pointer; font-family:'Sora', sans-serif;">🖨️ Imprimir</button>
        </div>
      </div>
      ${x.cancelado ? aviso('#b91c1c', `<strong>🚫 Documento tornado SEM EFEITO</strong> em ${esc(new Date(x.cancelado.em).toLocaleDateString('pt-BR'))}${x.cancelado.motivo ? ' — ' + esc(x.cancelado.motivo) : ''}.`)
        : aviso('#166534', `<strong>✅ Documento autêntico.</strong> ${esc(doc.codigo || '')} consta nos registros da Coordenação, emitido em ${doc.criadoEm ? esc(new Date(doc.criadoEm).toLocaleDateString('pt-BR')) : '-'}. Compare o conteúdo abaixo com a via que você recebeu.` +
          (x.assinadoEm ? `<br>🖋️ Assinado digitalmente por <strong>${esc(x.assinadoPor || '')}</strong> em ${esc(new Date(x.assinadoEm).toLocaleString('pt-BR'))}. A assinatura pode ser validada no próprio PDF recebido (Adobe Reader ou validar.iti.gov.br).` : ''))}
      <div style="width:100%; max-width:800px;">${docHtml(doc, tipo, { grande: true })}</div>
    </div>`;
}
function renderOficioPublico(token) { return docRenderPublico('ofi', token); }
function renderNotificacaoPublico(token) { return docRenderPublico('ntf', token); }

// ===================== MODO PÚBLICO: APENAS GERADOR DE OFÍCIOS =====================
// Acesso via ?modulo=oficios (sem login). Oculta os demais módulos e carrega os dados da nuvem.
async function renderOficiosPublico() {
  _oficiosModoPublico = true;
  const appContainer = document.querySelector('.app-container');
  const loginScreen = document.getElementById('login-screen');
  if (appContainer) appContainer.style.display = 'flex';
  if (loginScreen) loginScreen.style.display = 'none';

  const sidebar = document.getElementById('main-sidebar');
  if (sidebar) sidebar.style.display = 'none';
  const backdrop = document.getElementById('sidebar-backdrop');
  if (backdrop) backdrop.style.display = 'none';
  const header = document.querySelector('.content-area > header');
  if (header) header.style.display = 'none';
  const bnav = document.getElementById('bottom-nav');
  if (bnav) bnav.style.display = 'none';

  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const painel = document.getElementById('panel-oficios');
  if (painel) painel.classList.add('active');
  // Assinar e enviar ficam só para quem entrou com login
  document.querySelectorAll('#panel-oficios .so-logado').forEach(e => { e.style.display = 'none'; });

  await carregarDadosOficiosPublico();
  carregarNovoOficio();
  renderHistoricoOficios();
}

async function carregarDadosOficiosPublico() {
  if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
  try {
    const { data: ofs } = await supabaseClient.from('oficios').select('*');
    if (Array.isArray(ofs)) _remoteData.oficios = (typeof normalizarCamposObjeto === 'function' ? normalizarCamposObjeto(ofs) : ofs);
  } catch (e) { console.warn('Modo público de ofícios: falha ao carregar ofícios.', e); }
  try {
    const { data: dest } = await supabaseClient.from('destinatarios').select('*');
    if (Array.isArray(dest)) _remoteData.destinatarios = dest;
  } catch (e) { console.warn('Modo público de ofícios: falha ao carregar destinatários.', e); }
  try {
    const { data: emi } = await supabaseClient.from('emissores').select('*');
    if (Array.isArray(emi)) _remoteData.emissores = emi;
  } catch (e) { console.warn('Modo público de ofícios: falha ao carregar emissores.', e); }
  try {
    const { data: cfgRows } = await supabaseClient.from('configuracoes').select('chave,valor');
    if (Array.isArray(cfgRows)) {
      const cfgObj = { ...(_remoteData.config || {}) };
      cfgRows.forEach(item => {
        if (item && item.chave && item.chave.startsWith('img_') &&
            typeof item.valor === 'string' && (item.valor.startsWith('http') || item.valor.startsWith('data:image'))) {
          cfgObj[item.chave] = item.valor;
        }
      });
      _remoteData.config = cfgObj;
    }
  } catch (e) { console.warn('Modo público de ofícios: falha ao carregar logos.', e); }
}
