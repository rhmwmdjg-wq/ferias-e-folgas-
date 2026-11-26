// Ouvidoria Anônima — sugestões, reclamações e denúncias recebidas pelo QR Code.
//
// O formulário público é a página ouvidoria.html. Nada que chega aqui identifica quem
// escreveu: não existe IP, aparelho, nome, telefone nem login guardado. O que vem é
// tipo, unidade de saúde, texto, data/hora e um protocolo sorteado.
//
// A leitura e a mudança de situação passam pela edge function atlas-ouvidoria e exigem
// a chave de acesso (a mesma chave de envio dos ofícios, enquanto não houver uma própria).

const OUVIDORIA_URL = 'https://bgvwaamwgcathojxtjqf.supabase.co/functions/v1/atlas-ouvidoria';
const OUVIDORIA_FORM_URL = 'https://ouvidoria-itacarambi.vercel.app/';
const OUV_CHAVE_LS = 'atlas_ouvidoria_chave';

const OUV_TIPOS = {
  sugestao: { rotulo: 'Sugestão', icone: '💡', cor: 'tag-blue' },
  reclamacao: { rotulo: 'Reclamação', icone: '⚠️', cor: 'tag-warn' },
  denuncia: { rotulo: 'Denúncia', icone: '🚨', cor: 'tag-red' },
};
const OUV_SITUACOES = {
  nova: 'Recebida, aguardando análise',
  em_analise: 'Em análise',
  providencia: 'Providência em andamento',
  concluida: 'Concluída',
  arquivada: 'Arquivada',
};

let _ouvRegistros = [];
let _ouvCarregando = false;

function ouvChave() {
  return localStorage.getItem(OUV_CHAVE_LS) || localStorage.getItem(OFICIO_CHAVE_LS) || '';
}

async function ouvChamar(corpo, precisaChave) {
  const payload = Object.assign({}, corpo);
  if (precisaChave) {
    const chave = ouvChave();
    if (!chave) throw new Error('Informe a chave de acesso da ouvidoria.');
    payload.chave = chave;
  }
  const r = await fetch(OUVIDORIA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let d = {};
  try { d = await r.json(); } catch (e) { /* sem corpo */ }
  if (r.status === 401) { localStorage.removeItem(OUV_CHAVE_LS); ouvPedirChave(); }
  if (!r.ok || !d.ok) throw new Error(d.erro || ('Falha de comunicação (código ' + r.status + ').'));
  return d;
}

function ouvPedirChave() {
  const box = document.getElementById('ouv-chave-box');
  if (box) box.style.display = 'block';
}

async function ouvSalvarChave() {
  const campo = document.getElementById('ouv-chave');
  const chave = (campo.value || '').trim();
  if (chave.length < 8) return toastMsg('A chave tem no mínimo 8 caracteres.', 'warning');
  localStorage.setItem(OUV_CHAVE_LS, chave);
  campo.value = '';
  document.getElementById('ouv-chave-box').style.display = 'none';
  await ouvCarregar();
}

// ---------- unidades oferecidas no formulário público ----------
function ouvUnidadesDoSistema() {
  const cfg = DB.config();
  const setores = Array.isArray(cfg.setores) ? cfg.setores.slice() : [];
  return setores.map(function (s) { return typeof s === 'string' ? s : (s && (s.nome || s.label)) || ''; })
    .map(function (s) { return String(s).trim(); }).filter(Boolean);
}

async function ouvSincronizarUnidades() {
  const lista = ouvUnidadesDoSistema();
  if (!lista.length) return toastMsg('Nenhum setor/unidade cadastrado nas Configurações.', 'warning');
  if (!confirm('Enviar estas ' + lista.length + ' unidades para o formulário público?\n\n' + lista.join('\n'))) return;
  try {
    const d = await ouvChamar({ acao: 'unidades_salvar', unidades: lista }, true);
    toastMsg(d.total + ' unidade(s) disponíveis no formulário.', 'success');
  } catch (e) { toastMsg(e.message, 'warning'); }
}

// ---------- carregar e listar ----------
async function ouvCarregar() {
  if (_ouvCarregando) return;
  const cont = document.getElementById('ouv-lista');
  if (!ouvChave()) { ouvPedirChave(); if (cont) cont.innerHTML = ''; return; }
  _ouvCarregando = true;
  if (cont) cont.innerHTML = '<div class="empty"><p>Carregando as manifestações...</p></div>';
  try {
    const filtros = {
      acao: 'listar',
      unidade: (document.getElementById('ouv-f-unidade') || {}).value || '',
      tipo: (document.getElementById('ouv-f-tipo') || {}).value || '',
      situacao: (document.getElementById('ouv-f-situacao') || {}).value || '',
    };
    const de = (document.getElementById('ouv-f-de') || {}).value;
    const ate = (document.getElementById('ouv-f-ate') || {}).value;
    if (de) filtros.de = new Date(de + 'T00:00:00').toISOString();
    if (ate) filtros.ate = new Date(ate + 'T23:59:59').toISOString();
    const d = await ouvChamar(filtros, true);
    _ouvRegistros = d.registros || [];
    ouvPopularFiltroUnidades();
    ouvRenderResumo();
    ouvRenderLista();
  } catch (e) {
    if (cont) cont.innerHTML = '<div class="empty"><p>' + esc(e.message) + '</p></div>';
  } finally {
    _ouvCarregando = false;
  }
}

// O filtro de unidades junta o cadastro do sistema com o que já chegou
function ouvPopularFiltroUnidades() {
  const sel = document.getElementById('ouv-f-unidade');
  if (!sel) return;
  const atual = sel.value;
  const nomes = Array.from(new Set(ouvUnidadesDoSistema().concat(_ouvRegistros.map(function (r) { return r.unidade; })))).sort();
  sel.innerHTML = '<option value="">Todas as unidades</option>' +
    nomes.map(function (u) { return '<option value="' + esc(u) + '">' + esc(u) + '</option>'; }).join('');
  sel.value = atual || '';
}

function ouvRenderResumo() {
  const cont = document.getElementById('ouv-resumo');
  if (!cont) return;
  const total = _ouvRegistros.length;
  const porTipo = { sugestao: 0, reclamacao: 0, denuncia: 0 };
  let novas = 0, abertas = 0;
  _ouvRegistros.forEach(function (r) {
    if (porTipo[r.tipo] !== undefined) porTipo[r.tipo]++;
    if (r.situacao === 'nova') novas++;
    if (r.situacao !== 'concluida' && r.situacao !== 'arquivada') abertas++;
  });
  const bloco = function (rot, val, cor) {
    return '<div style="flex:1; min-width:120px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-sm); padding:12px 14px">' +
      '<div style="font-size:1.5rem; font-weight:800; color:' + (cor || 'var(--text)') + '">' + val + '</div>' +
      '<div style="font-size:.74rem; color:var(--muted); text-transform:uppercase; letter-spacing:.04em">' + rot + '</div></div>';
  };
  cont.innerHTML = bloco('No filtro', total) + bloco('Novas', novas, 'var(--primary)') +
    bloco('Em aberto', abertas, 'var(--warning)') +
    bloco('💡 Sugestões', porTipo.sugestao) + bloco('⚠️ Reclamações', porTipo.reclamacao) +
    bloco('🚨 Denúncias', porTipo.denuncia, 'var(--danger)');
}

function ouvRenderLista() {
  const cont = document.getElementById('ouv-lista');
  if (!cont) return;
  const busca = docNorm ? docNorm((document.getElementById('ouv-f-busca') || {}).value || '') : '';
  let lista = _ouvRegistros;
  if (busca) lista = lista.filter(function (r) { return docNorm([r.mensagem, r.unidade, r.protocolo].join(' ')).includes(busca); });
  if (!lista.length) {
    cont.innerHTML = '<div class="empty"><div class="icon">🗳️</div><p>Nenhuma manifestação encontrada com esses filtros.</p></div>';
    return;
  }
  cont.innerHTML = lista.map(function (r) {
    const t = OUV_TIPOS[r.tipo] || { rotulo: r.tipo, icone: '•', cor: 'tag-blue' };
    const d = new Date(r.criado_em);
    const sitSel = '<select class="doc-ctl" style="padding:3px 6px; font-size:.72rem; width:auto; max-width:230px" onchange="ouvMudarSituacao(\'' + r.id + '\', this.value)">' +
      Object.keys(OUV_SITUACOES).map(function (k) {
        return '<option value="' + k + '"' + (k === r.situacao ? ' selected' : '') + '>' + esc(OUV_SITUACOES[k]) + '</option>';
      }).join('') + '</select>';
    return '<div class="ev-list-item completo" style="margin-bottom:10px">' +
      '<div class="ev-list-header" style="align-items:flex-start; gap:10px; flex-wrap:wrap">' +
        '<div style="flex:1; min-width:240px">' +
          '<div class="ev-list-nome" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap">' +
            '<span>' + t.icone + ' ' + esc(t.rotulo) + '</span>' +
            '<span class="tag ' + t.cor + '">' + esc(r.unidade) + '</span>' +
            (r.situacao === 'nova' ? '<span class="tag tag-green">novo</span>' : '') +
          '</div>' +
          '<div style="font-size:.86rem; margin-top:8px; white-space:pre-wrap; line-height:1.55">' + esc(r.mensagem) + '</div>' +
          '<div class="ev-list-meta" style="margin-top:8px; font-size:.73rem">' +
            '<span>📅 ' + d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</span>' +
            '<span>🔖 ' + esc(r.protocolo) + '</span>' +
            '<span>🔒 sem identificação do autor</span>' +
          '</div>' +
          '<div style="margin-top:8px; display:flex; gap:6px; align-items:center; flex-wrap:wrap">' + sitSel +
            '<button class="btn btn-ghost btn-sm" onclick="ouvEditarNota(\'' + r.id + '\')">📝 Nota interna</button></div>' +
          (r.nota_interna ? '<div style="margin-top:8px; font-size:.8rem; background:var(--surface); border-left:3px solid var(--primary); border-radius:var(--r-sm); padding:8px 10px; white-space:pre-wrap">' + esc(r.nota_interna) + '</div>' : '') +
        '</div>' +
      '</div></div>';
  }).join('');
}

async function ouvMudarSituacao(id, situacao) {
  try {
    await ouvChamar({ acao: 'situacao', id: id, situacao: situacao }, true);
    const r = _ouvRegistros.find(function (x) { return x.id === id; });
    if (r) r.situacao = situacao;
    ouvRenderResumo();
    toastMsg('Situação atualizada.', 'success', 2000);
  } catch (e) { toastMsg(e.message, 'warning'); }
}

async function ouvEditarNota(id) {
  const r = _ouvRegistros.find(function (x) { return x.id === id; });
  if (!r) return;
  const nota = prompt('Nota interna (só a Coordenação vê; não vai para quem enviou):', r.nota_interna || '');
  if (nota === null) return;
  try {
    await ouvChamar({ acao: 'situacao', id: id, nota: nota }, true);
    r.nota_interna = nota.trim() || null;
    ouvRenderLista();
    toastMsg('Nota salva.', 'success', 2000);
  } catch (e) { toastMsg(e.message, 'warning'); }
}

function ouvLimparFiltros() {
  ['ouv-f-unidade', 'ouv-f-tipo', 'ouv-f-situacao', 'ouv-f-de', 'ouv-f-ate', 'ouv-f-busca'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ouvCarregar();
}

// ---------- relatório por unidade, para discutir estratégias ----------
function ouvRelatorio() {
  if (!_ouvRegistros.length) return toastMsg('Carregue as manifestações antes de emitir o relatório.', 'warning');
  const porUnidade = {};
  _ouvRegistros.forEach(function (r) {
    const u = r.unidade || 'Não informada';
    if (!porUnidade[u]) porUnidade[u] = { sugestao: [], reclamacao: [], denuncia: [] };
    (porUnidade[u][r.tipo] || (porUnidade[u][r.tipo] = [])).push(r);
  });
  const unidades = Object.keys(porUnidade).sort(function (a, b) {
    const n = function (u) { return porUnidade[u].sugestao.length + porUnidade[u].reclamacao.length + porUnidade[u].denuncia.length; };
    return n(b) - n(a) || a.localeCompare(b);
  });

  const de = (document.getElementById('ouv-f-de') || {}).value;
  const ate = (document.getElementById('ouv-f-ate') || {}).value;
  const periodo = (de || ate)
    ? 'Período: ' + (de ? docDataBR(de) : 'início') + ' a ' + (ate ? docDataBR(ate) : 'hoje')
    : 'Período: todas as manifestações recebidas';

  const linhas = unidades.map(function (u) {
    const g = porUnidade[u];
    const tot = g.sugestao.length + g.reclamacao.length + g.denuncia.length;
    const itens = ['denuncia', 'reclamacao', 'sugestao'].map(function (tp) {
      if (!g[tp] || !g[tp].length) return '';
      return '<div style="margin-top:10px"><strong>' + OUV_TIPOS[tp].icone + ' ' + OUV_TIPOS[tp].rotulo +
        ' (' + g[tp].length + ')</strong>' +
        g[tp].map(function (r) {
          return '<div class="manif"><div class="meta">' + new Date(r.criado_em).toLocaleDateString('pt-BR') +
            ' · ' + r.protocolo + ' · ' + esc(OUV_SITUACOES[r.situacao] || r.situacao) + '</div>' +
            esc(r.mensagem) + '</div>';
        }).join('') + '</div>';
    }).join('');
    return '<section><h2>' + esc(u) + ' <span class="cnt">' + tot + ' manifestaç' + (tot === 1 ? 'ão' : 'ões') + '</span></h2>' +
      '<div class="resumo">💡 ' + g.sugestao.length + ' sugestão(ões) · ⚠️ ' + g.reclamacao.length +
      ' reclamação(ões) · 🚨 ' + g.denuncia.length + ' denúncia(s)</div>' + itens + '</section>';
  }).join('');

  const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">' +
    '<title>Relatório da Ouvidoria Anônima</title><style>' +
    'body{font:12px/1.5 system-ui,sans-serif;color:#15213a;margin:26px}' +
    'h1{font-size:17px;margin:0 0 2px;text-align:center}' +
    '.sub{text-align:center;color:#5a6882;font-size:11px;margin-bottom:4px}' +
    '.obs{text-align:center;font-size:10px;color:#5a6882;border-top:1px solid #dde4f0;border-bottom:1px solid #dde4f0;padding:6px 0;margin:12px 0 18px}' +
    'section{margin-bottom:22px;page-break-inside:avoid}' +
    'h2{font-size:13px;margin:0 0 4px;border-bottom:2px solid #1d4ed8;padding-bottom:3px}' +
    '.cnt{float:right;font-weight:400;font-size:11px;color:#5a6882}' +
    '.resumo{font-size:11px;color:#5a6882}' +
    '.manif{margin:6px 0 0;padding:7px 10px;background:#f6f8fc;border-left:3px solid #c6d1e4;border-radius:5px;white-space:pre-wrap}' +
    '.meta{font-size:9.5px;color:#5a6882;margin-bottom:3px}' +
    'footer{margin-top:26px;border-top:1px solid #dde4f0;padding-top:8px;font-size:9.5px;color:#5a6882;text-align:center}' +
    '@media print{body{margin:14mm}}' +
    '</style></head><body>' +
    '<h1>Relatório da Ouvidoria Anônima</h1>' +
    '<div class="sub">Coordenação de Atenção Primária à Saúde — Secretaria Municipal de Saúde de Itacarambi/MG</div>' +
    '<div class="sub">' + esc(periodo) + ' · Emitido em ' + new Date().toLocaleString('pt-BR') + '</div>' +
    '<div class="obs">As manifestações são anônimas: o sistema não registra nome, telefone, e-mail, login, IP ou aparelho de quem envia. ' +
    'A unidade de saúde é a única informação de contexto exigida no formulário.</div>' +
    linhas +
    '<footer>Documento gerado pelo Sistema Atlas Saúde para discussão de estratégias por unidade.</footer>' +
    '</body></html>';

  const w = window.open('', '_blank');
  if (!w) return toastMsg('O navegador bloqueou a janela. Libere os pop-ups deste site.', 'warning');
  w.document.write(html);
  w.document.close();
  setTimeout(function () { try { w.print(); } catch (e) { /* o usuário imprime pelo menu */ } }, 400);
}

// ---------- cartaz com QR Code para imprimir e colar na unidade ----------
function ouvQrPath(texto) {
  if (typeof qrcode !== 'function') return null;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(texto);
    qr.make();
    const n = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += 'M' + c + ' ' + r + 'h1v1h-1z';
    return { path: path, n: n };
  } catch (e) { return null; }
}

async function ouvCartazPdf() {
  const unidade = ((document.getElementById('ouv-cartaz-unidade') || {}).value || '').trim();
  try {
    const L = await docPdfLib();
    const pdf = await L.PDFDocument.create();
    const pg = pdf.addPage([595.28, 841.89]); // A4
    const F = await pdf.embedFont(L.StandardFonts.Helvetica);
    const B = await pdf.embedFont(L.StandardFonts.HelveticaBold);
    const W = 595.28, H = 841.89;
    const hex = function (h) {
      return L.rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
    };
    const AZUL = hex('#1d4ed8'), ESCURO = hex('#15213a'), SUAVE = hex('#5a6882');
    const centro = function (t, y, size, font, cor) {
      const f = font || F;
      pg.drawText(t, { x: (W - f.widthOfTextAtSize(t, size)) / 2, y: y, size: size, font: f, color: cor || ESCURO });
    };

    pg.drawRectangle({ x: 0, y: H - 112, width: W, height: 112, color: AZUL });
    centro('OUVIDORIA ANONIMA', H - 58, 30, B, L.rgb(1, 1, 1));
    centro('Atencao Primaria a Saude - Itacarambi/MG', H - 84, 13, F, L.rgb(0.88, 0.92, 1));

    let y = H - 150;
    centro('Sua voz melhora o atendimento.', y, 19, B, ESCURO); y -= 26;
    centro('Aponte a camera do celular para o codigo abaixo.', y, 13, F, SUAVE); y -= 34;

    const qr = ouvQrPath(OUVIDORIA_FORM_URL);
    const LADO = 250;
    if (qr) {
      const x0 = (W - LADO) / 2, y0 = y - LADO;
      pg.drawRectangle({ x: x0 - 12, y: y0 - 12, width: LADO + 24, height: LADO + 24, color: L.rgb(1, 1, 1), borderColor: AZUL, borderWidth: 2 });
      const e = LADO / qr.n;
      pg.drawSvgPath(qr.path, { x: x0, y: y0 + LADO, scale: e, color: L.rgb(0, 0, 0), borderWidth: 0 });
      y = y0 - 40;
    } else {
      y -= 20;
    }

    centro('ouvidoria-itacarambi.vercel.app', y, 11, F, SUAVE); y -= 34;

    const opcoes = [
      ['SUGESTAO', 'uma ideia para melhorar o servico'],
      ['RECLAMACAO', 'algo que nao funcionou bem'],
      ['DENUNCIA', 'irregularidade ou desrespeito'],
    ];
    opcoes.forEach(function (o) {
      const t1 = o[0] + ' - ', t2 = o[1];
      const l = B.widthOfTextAtSize(t1, 13) + F.widthOfTextAtSize(t2, 13);
      const x = (W - l) / 2;
      pg.drawText(t1, { x: x, y: y, size: 13, font: B, color: AZUL });
      pg.drawText(t2, { x: x + B.widthOfTextAtSize(t1, 13), y: y, size: 13, font: F, color: ESCURO });
      y -= 21;
    });

    y -= 18;
    pg.drawRectangle({ x: 56, y: y - 108, width: W - 112, height: 112, color: hex('#ecfdf5'), borderColor: hex('#a7e3c8'), borderWidth: 1 });
    let yy = y - 20;
    centro('E TOTALMENTE ANONIMO', yy, 14, B, hex('#047857')); yy -= 22;
    [
      'Nao pedimos nome, telefone, e-mail nem login.',
      'Nao guardamos seu IP, seu aparelho nem sua localizacao.',
      'A unica informacao necessaria e de qual unidade voce fala.',
    ].forEach(function (t) { centro(t, yy, 11, F, hex('#17543c')); yy -= 16; });
    y = y - 130;

    if (unidade) {
      centro('Unidade: ' + unidade, y, 13, B, ESCURO);
      y -= 22;
    }
    centro('Coordenacao de Atencao Primaria a Saude - Secretaria Municipal de Saude de Itacarambi/MG', 44, 9, F, SUAVE);

    const bytes = await pdf.save();
    const nome = 'Cartaz_Ouvidoria_Anonima' + (unidade ? '_' + unidade.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_') : '') + '.pdf';
    docBaixarBytes(bytes, nome);
    toastMsg('Cartaz gerado: ' + nome, 'success');
  } catch (e) {
    console.error(e);
    toastMsg(e.message || 'Não foi possível gerar o cartaz.', 'warning');
  }
}

function ouvAbrirFormulario() {
  const w = window.open(OUVIDORIA_FORM_URL, '_blank', 'noopener');
  if (w) w.opener = null;
}

async function ouvCopiarLinkFormulario() {
  try {
    await navigator.clipboard.writeText(OUVIDORIA_FORM_URL);
    toastMsg('Link do formulário copiado!', 'success', 2000);
  } catch (e) { toastMsg('Copie manualmente: ' + OUVIDORIA_FORM_URL, 'info', 6000); }
}

function renderOuvidoria() {
  const sel = document.getElementById('ouv-cartaz-unidade');
  if (sel) {
    const atual = sel.value;
    sel.innerHTML = '<option value="">Cartaz geral (sem nome de unidade)</option>' +
      ouvUnidadesDoSistema().map(function (u) { return '<option value="' + esc(u) + '">' + esc(u) + '</option>'; }).join('');
    sel.value = atual || '';
  }
  ouvCarregar();
}
