// Ofícios e Notificações — PDF oficial, assinatura digital e envio por e-mail.
//
// - docGerarPdf: monta o PDF A4 direto no navegador (texto selecionável, várias páginas,
//   QR Code de conferência), sem depender de "Imprimir → Salvar como PDF".
// - Assinatura: usa o certificado A1 (.pfx) da aba Assinatura Digital (PAdES, ICP-Brasil).
//   O certificado e a senha nunca saem deste navegador.
// - Envio: o PDF (assinado ou não) segue por e-mail pela conta da Coordenação, por uma
//   função no servidor. A senha do e-mail fica só lá; o envio exige a "chave de envio".

const OFICIO_ENVIO_URL = 'https://bgvwaamwgcathojxtjqf.supabase.co/functions/v1/atlas-enviar-oficio';
const OFICIO_ENVIO_MAX_BYTES = 8 * 1024 * 1024;
const OFICIO_ENVIO_MAX_DEST = 10;
const OFICIO_CHAVE_LS = 'atlas_oficio_chave_envio';

let _docEnvio = null;       // { tipo, id, enviar }
let _docEnvioOcupado = false;

async function docPdfLib() {
  if (window.AtlasPades && window.AtlasPades.pdfLib) return window.AtlasPades.pdfLib;
  try {
    if (typeof dsCarregarBibliotecaPades === 'function') return (await dsCarregarBibliotecaPades()).pdfLib;
  } catch (e) { console.warn('Biblioteca PAdES indisponível; usando pdf-lib padrão.', e); }
  if (window.PDFLib) return window.PDFLib;
  throw new Error('Não foi possível carregar a biblioteca de PDF (verifique a internet).');
}

// Converte qualquer imagem (PNG, JPG, WEBP, link ou data:) em PNG pequeno para o cabeçalho
function docPdfImagemPng(src) {
  return new Promise(function (resolve) {
    if (!src) return resolve(null);
    const img = new Image();
    let pronto = false;
    const fim = function (v) { if (!pronto) { pronto = true; resolve(v); } };
    setTimeout(function () { fim(null); }, 7000);
    if (!/^data:/i.test(src)) img.crossOrigin = 'anonymous';
    img.onload = function () {
      try {
        const esc_ = Math.min(1, 360 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.naturalWidth * esc_));
        cv.height = Math.max(1, Math.round(img.naturalHeight * esc_));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(function (b) {
          if (!b) return fim(null);
          b.arrayBuffer().then(function (ab) { fim(new Uint8Array(ab)); }, function () { fim(null); });
        }, 'image/png');
      } catch (e) { fim(null); }
    };
    img.onerror = function () { fim(null); };
    img.src = src;
  });
}

function docNomeArquivo(doc, tipo, assinado) {
  const base = String(doc.codigo || DOC_CFG[tipo].nome).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\bn[ºo°]\s*(?=\d)/i, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return (base || 'documento') + (assinado ? '_assinado' : '') + '.pdf';
}

// ===================== GERAÇÃO DO PDF =====================
async function docGerarPdf(doc, tipo) {
  const L = await docPdfLib();
  const cfg = DOC_CFG[tipo];
  const x = docExtras(doc);
  const pdf = await L.PDFDocument.create();
  const F = await pdf.embedFont(L.StandardFonts.Helvetica);
  const B = await pdf.embedFont(L.StandardFonts.HelveticaBold);

  // As fontes padrão do PDF só têm os caracteres latinos (WinAnsi): troca ou remove o resto
  const conjunto = new Set(F.getCharacterSet());
  const TROCAS = { ' ': ' ', '\t': ' ', '→': '->', '←': '<-', '≥': '>=', '≤': '<=', '−': '-', '‑': '-', '‐': '-', '✅': '', '​': '', '﻿': '' };
  const T = function (s) {
    let out = '';
    for (const ch of String(s == null ? '' : s)) {
      if (TROCAS[ch] !== undefined) out += TROCAS[ch];
      else if (conjunto.has(ch.codePointAt(0))) out += ch;
    }
    return out;
  };
  const hex = function (h) { return L.rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255); };
  const PRETO = hex('#0f172a'), CINZA = hex('#475569'), CLARO = hex('#94a3b8'), LINHA = hex('#cbd5e1'), FUNDO = hex('#f1f5f9');

  const W = 595.28, H = 841.89, ML = 71, MR = 51, MT = 40, MB = 76;
  const CW = W - ML - MR;
  const pags = [];
  let pg, y;
  const larg = function (t, f, s) { return f.widthOfTextAtSize(t, s); };

  function nova() {
    pg = pdf.addPage([W, H]); pags.push(pg); y = H - MT;
    if (pags.length > 1) {
      pg.drawText(T((doc.codigo || cfg.nome) + ' — continuação'), { x: ML, y: y - 8, size: 8, font: F, color: CLARO });
      y -= 28;
    }
  }
  function cabe(h) { if (y - h < MB) nova(); }

  // Quebra o texto em linhas que cabem em maxW (a primeira linha pode ter recuo)
  function quebrar(txt, f, s, maxW, recuo) {
    recuo = recuo || 0;
    const esp = larg(' ', f, s);
    const palavras = [];
    T(txt).split(/\s+/).filter(Boolean).forEach(function (p) {
      while (larg(p, f, s) > maxW - recuo && p.length > 1) {   // palavra maior que a linha
        let k = p.length - 1;
        while (k > 1 && larg(p.slice(0, k), f, s) > maxW - recuo) k--;
        palavras.push(p.slice(0, k)); p = p.slice(k);
      }
      palavras.push(p);
    });
    const linhas = [];
    let atual = [], w = 0, lim = maxW - recuo;
    palavras.forEach(function (p) {
      const wp = larg(p, f, s);
      if (atual.length && w + esp + wp > lim) { linhas.push({ palavras: atual, w: w }); atual = []; w = 0; lim = maxW; }
      w += (atual.length ? esp : 0) + wp;
      atual.push(p);
    });
    if (atual.length) linhas.push({ palavras: atual, w: w });
    return linhas;
  }

  // Escreve um bloco de texto a partir de y (topo da linha) e avança y
  function texto(txt, o) {
    const f = o.f || F, s = o.s || 10, lead = o.lead || s * 1.35, cor = o.cor || PRETO;
    const x0 = o.x == null ? ML : o.x, maxW = o.maxW == null ? CW : o.maxW, recuo = o.recuo || 0;
    const linhas = quebrar(txt, f, s, maxW, recuo);
    linhas.forEach(function (ln, i) {
      if (!o.semQuebra) cabe(lead);
      const lx = x0 + (i === 0 ? recuo : 0), lw = maxW - (i === 0 ? recuo : 0);
      const base = y - s * 0.8;
      const ultima = i === linhas.length - 1;
      if (o.alinhar === 'justificar' && !ultima && ln.palavras.length > 1) {
        const soPalavras = ln.palavras.reduce(function (a, p) { return a + larg(p, f, s); }, 0);
        const vao = (lw - soPalavras) / (ln.palavras.length - 1);
        let cx = lx;
        ln.palavras.forEach(function (p) { pg.drawText(p, { x: cx, y: base, size: s, font: f, color: cor }); cx += larg(p, f, s) + vao; });
      } else {
        const t = ln.palavras.join(' ');
        let cx = lx;
        if (o.alinhar === 'centro') cx = lx + (lw - ln.w) / 2;
        else if (o.alinhar === 'direita') cx = lx + lw - ln.w;
        pg.drawText(t, { x: cx, y: base, size: s, font: f, color: cor });
      }
      y -= lead;
    });
    if (o.depois) y -= o.depois;
    return linhas.length;
  }
  function caixa(xx, yy, w, h, o) {
    pg.drawRectangle(Object.assign({ x: xx, y: yy, width: w, height: h }, o));
  }

  nova();

  // ---------- cabeçalho com logos ----------
  const logos = docLogos();
  const pngEsq = await docPdfImagemPng(logos.esq), pngDir = await docPdfImagemPng(logos.dir);
  const LOGO_W = 74, LOGO_H = 50, topo = y;
  const colX = ML + LOGO_W + 6, colW = CW - 2 * (LOGO_W + 6);
  texto(OFICIO_HEADER.titulo, { f: B, s: 10.5, lead: 13, x: colX, maxW: colW, alinhar: 'centro', depois: 1 });
  OFICIO_HEADER.linhas.forEach(function (l) { texto(l, { s: 7.2, lead: 9.4, cor: CINZA, x: colX, maxW: colW, alinhar: 'centro' }); });
  const baseCab = Math.min(y, topo - LOGO_H) - 6;
  for (const lado of [[pngEsq, 'e'], [pngDir, 'd']]) {
    if (!lado[0]) continue;
    try {
      const im = await pdf.embedPng(lado[0]);
      const k = Math.min(LOGO_W / im.width, LOGO_H / im.height);
      const w = im.width * k, h = im.height * k;
      const meio = (topo + baseCab + 6) / 2;
      pg.drawImage(im, { x: lado[1] === 'e' ? ML : W - MR - w, y: meio - h / 2, width: w, height: h });
    } catch (e) { console.warn('Logo não incluída no PDF:', e); }
  }
  pg.drawLine({ start: { x: ML, y: baseCab }, end: { x: W - MR, y: baseCab }, thickness: 1.3, color: hex('#222222') });
  y = baseCab - 18;

  if (tipo === 'ntf') {
    const tit = 'NOTIFICAÇÃO ADMINISTRATIVA', wt = larg(tit, B, 12);
    pg.drawText(tit, { x: ML + (CW - wt) / 2, y: y - 10, size: 12, font: B, color: PRETO });
    pg.drawLine({ start: { x: ML + (CW - wt) / 2, y: y - 14 }, end: { x: ML + (CW + wt) / 2, y: y - 14 }, thickness: 0.9, color: PRETO });
    y -= 20;
    if (NTF_TIPOS[x.tipoNtf]) texto(NTF_TIPOS[x.tipoNtf], { s: 9, cor: CINZA, alinhar: 'centro', lead: 12 });
    y -= 12;
  }

  // ---------- número e data ----------
  const cod = T(doc.codigo || ''), dat = T(doc.cidadeData || '');
  pg.drawText(cod, { x: ML, y: y - 9, size: 10.5, font: B, color: PRETO });
  if (larg(cod, B, 10.5) + larg(dat, F, 9.5) + 18 > CW) y -= 14;
  pg.drawText(dat, { x: W - MR - larg(dat, F, 9.5), y: y - 9, size: 9.5, font: F, color: hex('#334155') });
  y -= 30;

  // ---------- destinatários ----------
  docDests(doc).filter(function (d) { return (d.nome || '').trim() || (d.cargo || '').trim() || (d.orgao || '').trim(); }).forEach(function (d) {
    cabe(60);
    if (DOC_TRATAMENTOS[d.tratamento]) texto(DOC_TRATAMENTOS[d.tratamento], { s: 10, lead: 13.5 });
    if (d.nome) texto(d.nome, { f: B, s: 10, lead: 13.5 });
    if (d.cargo) texto(d.cargo, { s: 10, lead: 13.5 });
    if (d.matricula) texto('Matrícula: ' + d.matricula, { s: 10, lead: 13.5 });
    if (d.orgao) texto(d.orgao, { s: 10, lead: 13.5, cor: CINZA });
    y -= 7;
  });
  y -= 6;

  // ---------- assunto ----------
  const rotA = 'Assunto: ', wRot = larg(rotA, B, 10);
  const linhasA = quebrar(doc.assunto || '', F, 10, CW - 22, wRot);
  const hA = linhasA.length * 13.5 + 13;
  cabe(hA + 12);
  caixa(ML, y - hA, CW, hA, { color: FUNDO });
  caixa(ML, y - hA, 3, hA, { color: hex(cfg.cor) });
  y -= 7;
  pg.drawText(rotA, { x: ML + 12, y: y - 8, size: 10, font: B, color: PRETO });
  texto(doc.assunto || '', { s: 10, lead: 13.5, x: ML + 12, maxW: CW - 22, recuo: wRot, semQuebra: true });
  y -= 6;
  if (x.oficioRel) { y -= 6; texto('Ref.: ' + x.oficioRel, { s: 9.5, lead: 13, cor: hex('#334155') }); }
  y -= 18;

  // ---------- corpo ----------
  const sep = docSepararFecho(doc.texto);
  sep.paragrafos.forEach(function (p) {
    const n = quebrar(p, F, 11, CW, 32).length;
    cabe(n > 1 ? 34 : 17);   // não deixa uma linha órfã no pé da página
    texto(p, { s: 11, lead: 16.4, recuo: 32, alinhar: 'justificar', depois: 7 });
  });

  // ---------- fecho e assinatura (não se separam) ----------
  const SELO_W = 168, SELO_H = 56;
  cabe(128);
  y -= 16;
  texto(sep.fecho, { s: 11, lead: 14, alinhar: 'centro', cor: hex('#334155') });
  const seloX = ML + (CW - SELO_W) / 2, seloY = y - 4 - SELO_H;
  const sigPlace = { page: pags.length - 1, rect: [seloX, seloY, SELO_W, SELO_H] };
  y -= SELO_H + 10;
  pg.drawLine({ start: { x: ML + (CW - 230) / 2, y: y }, end: { x: ML + (CW + 230) / 2, y: y }, thickness: 0.9, color: PRETO });
  y -= 5;
  texto(doc.emissorNome || '', { f: B, s: 10.5, lead: 13.5, alinhar: 'centro', x: ML + 40, maxW: CW - 80, semQuebra: true });
  texto(doc.emissorCargo || '', { s: 9, lead: 12, alinhar: 'centro', cor: CINZA, x: ML + 40, maxW: CW - 80, semQuebra: true });

  // ---------- anexos e cópias ----------
  const anexos = docLinhas(x.anexos), cc = docLinhas(x.cc);
  if (anexos.length || cc.length) {
    y -= 14;
    if (anexos.length) texto('Anexo' + (anexos.length > 1 ? 's' : '') + ': ' + anexos.join('; ') + '.', { s: 9, lead: 12.5, cor: hex('#334155') });
    if (cc.length) texto('C/C: ' + cc.join('; ') + '.', { s: 9, lead: 12.5, cor: hex('#334155') });
  }

  // ---------- protocolo de recebimento / ciência do servidor ----------
  const borda = { borderColor: LINHA, borderWidth: 0.8 };
  if (tipo === 'ofi') {
    const bw = 196, bh = 64;
    cabe(bh + 22); y -= 20;
    const bx = W - MR - bw, by = y - bh;
    caixa(bx, by, bw, bh, borda);
    const tp = 'PROTOCOLO DE RECEBIMENTO';
    pg.drawText(tp, { x: bx + (bw - larg(tp, B, 7)) / 2, y: y - 12, size: 7, font: B, color: hex('#334155') });
    pg.drawLine({ start: { x: bx + 8, y: y - 16 }, end: { x: bx + bw - 8, y: y - 16 }, thickness: 0.5, color: LINHA });
    pg.drawText('Recebido por: ______________________________', { x: bx + 8, y: y - 29, size: 7, font: F, color: CINZA });
    pg.drawText('Matrícula: ________________', { x: bx + 8, y: y - 42, size: 7, font: F, color: CINZA });
    pg.drawText('Data: ____/____/______', { x: bx + 8, y: y - 55, size: 7, font: F, color: CINZA });
    pg.drawText('Assinatura: ______________', { x: bx + 100, y: y - 55, size: 7, font: F, color: CINZA });
    y = by;
  } else {
    const decl = 'Declaro que recebi a presente Notificação Administrativa, tomando ciência de seu conteúdo e das providências nela estabelecidas.';
    const prazo = x.prazoDias ? 'Prazo para manifestação por escrito: ' + x.prazoDias + ' dia(s) útil(eis), contado(s) da data da ciência.' : '';
    const nDecl = quebrar(decl, F, 9.5, CW - 24).length, nPrazo = prazo ? quebrar(prazo, B, 9.5, CW - 24).length : 0;
    const bh = 30 + nDecl * 12.5 + (nPrazo ? nPrazo * 12.5 + 4 : 0) + 30 + 16 + 34;
    cabe(bh + 22); y -= 20;
    const topoCx = y;
    caixa(ML, y - bh, CW, bh, borda);
    pg.drawText(T('CIÊNCIA DO SERVIDOR'), { x: ML + 12, y: y - 16, size: 9.5, font: B, color: PRETO });
    pg.drawLine({ start: { x: ML + 12, y: y - 21 }, end: { x: W - MR - 12, y: y - 21 }, thickness: 0.9, color: PRETO });
    y -= 30;
    texto(decl, { s: 9.5, lead: 12.5, x: ML + 12, maxW: CW - 24, semQuebra: true });
    if (prazo) { y -= 4; texto(prazo, { f: B, s: 9.5, lead: 12.5, x: ML + 12, maxW: CW - 24, semQuebra: true }); }
    y -= 20;
    pg.drawText('Assinatura do(a) Servidor(a): ________________________________________', { x: ML + 12, y: y, size: 9, font: F, color: hex('#334155') });
    pg.drawText('Data: ____/____/______', { x: W - MR - 112, y: y, size: 9, font: F, color: hex('#334155') });
    y -= 18;
    pg.drawText(T('Observação do(a) servidor(a), caso queira apresentar justificativa:'), { x: ML + 12, y: y, size: 8.5, font: B, color: hex('#334155') });
    pg.drawLine({ start: { x: ML + 12, y: y - 26 }, end: { x: W - MR - 12, y: y - 26 }, thickness: 0.5, color: LINHA });
    y = topoCx - bh;

    if (x.testemunhas) {
      const cert = 'Preencher somente se houver recusa: certificamos que o(a) servidor(a) recebeu cópia desta notificação e tomou conhecimento de seu conteúdo em ____/____/______, recusando-se a assinar.';
      const nC = quebrar(cert, F, 9, CW - 24).length;
      const th = 30 + nC * 12 + 62;
      cabe(th + 14); y -= 12;
      const topoT = y;
      caixa(ML, y - th, CW, th, borda);
      pg.drawText(T('RECUSA DE ASSINATURA — TESTEMUNHAS'), { x: ML + 12, y: y - 16, size: 9.5, font: B, color: PRETO });
      pg.drawLine({ start: { x: ML + 12, y: y - 21 }, end: { x: W - MR - 12, y: y - 21 }, thickness: 0.9, color: PRETO });
      y -= 30;
      texto(cert, { s: 9, lead: 12, x: ML + 12, maxW: CW - 24, semQuebra: true });
      y -= 22;
      const metade = (CW - 24) / 2;
      [0, 1].forEach(function (i) {
        const tx = ML + 12 + i * (metade + 6);
        pg.drawText('Testemunha ' + (i + 1) + ': ______________________________', { x: tx, y: y, size: 8.5, font: F, color: hex('#334155') });
        pg.drawText(T('Matrícula/CPF: ________________________'), { x: tx, y: y - 20, size: 8.5, font: F, color: hex('#334155') });
      });
      y = topoT - th;
    }
  }

  // ---------- rodapé de todas as páginas: autenticidade, QR Code e paginação ----------
  const link = doc.token ? docLinkPublico(tipo, doc.token) : '';
  const codAuth = docCodigoAuth(doc.token);
  let qrPath = '', qrN = 0;
  if (link && typeof qrcode === 'function') {
    try {
      const qr = qrcode(0, 'M'); qr.addData(link); qr.make();
      qrN = qr.getModuleCount();
      for (let r = 0; r < qrN; r++) for (let c = 0; c < qrN; c++) if (qr.isDark(r, c)) qrPath += 'M' + c + ' ' + r + 'h1v1h-1z';
    } catch (e) { qrPath = ''; }
  }
  pags.forEach(function (p, i) {
    const QR = 44;
    p.drawLine({ start: { x: ML, y: 62 }, end: { x: W - MR, y: 62 }, thickness: 0.5, color: LINHA });
    const rod = function (t, yy, f) { p.drawText(T(t), { x: ML, y: yy, size: 7, font: f || F, color: hex('#64748b') }); };
    rod('Documento emitido pelo Sistema Atlas Saúde · Coordenação de Atenção Primária à Saúde de Itacarambi/MG', 51);
    if (codAuth) {
      rod('Código de autenticidade: ' + codAuth + ' — confira pelo QR Code ou no endereço:', 41, B);
      rod(link, 31);
    }
    rod('Página ' + (i + 1) + ' de ' + pags.length, 20);
    if (qrPath) {
      const esc_ = QR / (qrN + 2);
      p.drawRectangle({ x: W - MR - QR, y: 14, width: QR, height: QR, color: L.rgb(1, 1, 1) });
      p.drawSvgPath(qrPath, { x: W - MR - QR + esc_, y: 14 + QR - esc_, scale: esc_, color: L.rgb(0, 0, 0), borderWidth: 0 });
    }
    if (x.cancelado) {
      p.drawText('SEM EFEITO', { x: 120, y: 250, size: 74, font: B, color: L.rgb(0.86, 0.15, 0.15), opacity: 0.14, rotate: L.degrees(38) });
    }
  });

  pdf.setTitle(T(doc.codigo || cfg.nome));
  pdf.setSubject(T(doc.assunto || ''));
  pdf.setAuthor(T(doc.emissorNome || 'Coordenação de Atenção Primária à Saúde'));
  pdf.setCreator('Atlas Saúde');
  pdf.setProducer('Atlas Saúde');
  if (doc.criadoEm) { try { pdf.setCreationDate(new Date(doc.criadoEm)); } catch (e) { /* data inválida */ } }

  const bytes = await pdf.save({ useObjectStreams: false });
  return { bytes: bytes, sigPlace: sigPlace, paginas: pags.length };
}

// ===================== BAIXAR / ABRIR =====================
function docBaixarBytes(bytes, nome) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 8000);
}

async function docPdfBaixar(tipo, id) {
  const o = docLista(tipo).find(function (d) { return d.id === id; });
  if (!o) return toastMsg('Documento não encontrado.', 'warning');
  try {
    const r = await docGerarPdf(o, tipo);
    docBaixarBytes(r.bytes, docNomeArquivo(o, tipo, false));
    toastMsg('PDF gerado: ' + docNomeArquivo(o, tipo, false), 'success');
  } catch (e) { console.error(e); toastMsg('Erro ao gerar o PDF: ' + (e.message || e), 'error'); }
}

async function docPdfAbrir(tipo, id) {
  const o = docLista(tipo).find(function (d) { return d.id === id; });
  if (!o) return toastMsg('Documento não encontrado.', 'warning');
  const win = window.open('', '_blank');   // aberta antes da espera, para o navegador não bloquear
  try {
    const r = await docGerarPdf(o, tipo);
    const url = URL.createObjectURL(new Blob([r.bytes], { type: 'application/pdf' }));
    if (win) win.location.href = url; else docBaixarBytes(r.bytes, docNomeArquivo(o, tipo, false));
    setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
  } catch (e) {
    if (win) win.close();
    console.error(e); toastMsg('Erro ao gerar o PDF: ' + (e.message || e), 'error');
  }
}

// Página pública de conferência
async function docPdfPublico() {
  const p = window._docPublico;
  if (!p) return;
  try {
    const r = await docGerarPdf(p.doc, p.tipo);
    docBaixarBytes(r.bytes, docNomeArquivo(p.doc, p.tipo, false));
  } catch (e) { console.error(e); alert('Não foi possível gerar o PDF agora. Use o botão Imprimir.'); }
}

// ===================== ASSINAR E ENVIAR =====================
function docCertCarregado() { return typeof _dsCert !== 'undefined' && !!_dsCert && !!_dsKey; }
function docCertNome() {
  try { const cn = _dsCert.subject.getField('CN'); return cn ? String(cn.value).split(':')[0] : ''; } catch (e) { return ''; }
}

function docEnvioMensagemPadrao(o, tipo) {
  const h = new Date().getHours();
  const saud = h < 12 ? 'Bom dia!' : (h < 18 ? 'Boa tarde!' : 'Boa noite!');
  return saud + '\n\nEncaminho, em anexo, o ' + (o.codigo || 'ofício') + ', que trata de: ' + (o.assunto || '') +
    '.\n\nPor gentileza, acusar o recebimento.\n\nAtenciosamente,\n' + (o.emissorNome || '') + (o.emissorCargo ? '\n' + o.emissorCargo : '');
}

function docEnvioFechar() {
  if (_docEnvioOcupado) return;
  const m = document.getElementById('modal-doc-envio');
  if (m) m.remove();
  _docEnvio = null;
}

async function docAbrirEnvio(tipo, id, enviar) {
  const o = docLista(tipo).find(function (d) { return d.id === id; });
  if (!o) return toastMsg('Documento não encontrado.', 'warning');
  if (docExtras(o).cancelado) return toastMsg('Documento sem efeito não pode ser assinado nem enviado.', 'warning');
  docEnvioFechar();
  _docEnvio = { tipo: tipo, id: id, enviar: !!enviar };

  let cofre = null;
  try { if (typeof dsCofreLer === 'function') cofre = await dsCofreLer(); } catch (e) { cofre = null; }
  const temCofre = !!(cofre && cofre.bytes);
  const temChave = !!localStorage.getItem(OFICIO_CHAVE_LS);
  const bloco = 'border:1px solid var(--border); border-radius:var(--r-sm); padding:12px; margin-bottom:12px; background:var(--surface);';

  const certHtml = docCertCarregado()
    ? '<div style="font-size:.8rem">✅ Certificado carregado: <strong>' + esc(docCertNome()) + '</strong></div>'
    : '<div style="font-size:.76rem; color:var(--muted); margin-bottom:8px">' +
        (temCofre ? 'Certificado salvo neste aparelho: <strong>' + esc(cofre.nome || '') + '</strong>. Informe só a senha.'
                  : 'Selecione o arquivo do certificado A1 (.pfx/.p12) e informe a senha. Ele não sai deste navegador.') + '</div>' +
      '<div class="form-row cols-2">' +
        (temCofre ? '' : '<div class="field"><label>Arquivo .pfx / .p12</label><input type="file" id="doc-envio-pfx" accept=".pfx,.p12,application/x-pkcs12"></div>') +
        '<div class="field"><label>Senha do certificado</label><input type="password" id="doc-envio-senha" autocomplete="off" placeholder="••••••••"></div>' +
      '</div>' +
      (temCofre ? '' : '<label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:.76rem;cursor:pointer"><input type="checkbox" id="doc-envio-lembrar" style="width:auto"><span>Lembrar o certificado neste aparelho (a senha continua sendo pedida)</span></label>');

  const envioHtml = !enviar ? '' :
    '<div style="' + bloco + '">' +
      '<div style="font-weight:700; font-size:.84rem; margin-bottom:8px">📧 Para quem enviar <span style="font-weight:400;color:var(--muted)">(marque um ou vários)</span></div>' +
      '<div id="doc-envio-emails" style="display:flex; flex-direction:column; gap:6px; max-height:170px; overflow:auto; margin-bottom:10px"></div>' +
      '<div style="display:flex; gap:6px; flex-wrap:wrap">' +
        '<input id="doc-envio-novo-nome" class="doc-ctl" placeholder="Nome / setor" style="flex:1; min-width:120px">' +
        '<input id="doc-envio-novo-email" type="email" class="doc-ctl" placeholder="e-mail@exemplo.gov.br" style="flex:1.4; min-width:160px">' +
        '<button type="button" class="btn btn-ghost btn-sm" onclick="docEnvioAdicionarEmail()">➕ Cadastrar</button>' +
      '</div>' +
    '</div>' +
    '<div style="' + bloco + '">' +
      '<div class="field"><label>Mensagem do e-mail</label><textarea id="doc-envio-msg" style="min-height:120px; line-height:1.5">' + esc(docEnvioMensagemPadrao(o, tipo)) + '</textarea></div>' +
      '<div style="font-size:.7rem; color:var(--muted); margin-top:4px">Assunto do e-mail: <strong>' + esc(((o.codigo || '') + ' – ' + (o.assunto || '')).slice(0, 160)) + '</strong>. O e-mail sai pela conta da Coordenação e fica guardado na pasta “Enviados” dela.</div>' +
    '</div>' +
    '<div style="' + bloco + '" id="doc-envio-chave-box">' +
      (temChave
        ? '<div style="font-size:.78rem">🔑 Chave de envio salva neste aparelho. <button type="button" class="btn btn-ghost btn-sm" onclick="docEnvioTrocarChave()">Trocar</button></div>'
        : '<div class="field"><label>🔑 Chave de envio</label><input type="password" id="doc-envio-chave" autocomplete="off" placeholder="Definida no painel do Supabase"></div>' +
          '<div style="font-size:.7rem; color:var(--muted); margin-top:4px">Protege a conta de e-mail da Coordenação: só quem tem a chave consegue enviar. Fica salva neste aparelho após o primeiro envio.</div>') +
    '</div>';

  const bg = document.createElement('div');
  bg.className = 'modal-bg open';
  bg.id = 'modal-doc-envio';
  bg.innerHTML =
    '<div class="modal" style="max-width:620px; width:100%; max-height:92vh; overflow:auto">' +
      '<h3 style="margin-bottom:4px">' + (enviar ? '🖋️ Assinar e ✉️ enviar' : '🖋️ Assinar digitalmente') + '</h3>' +
      '<div style="font-size:.8rem; color:var(--muted); margin-bottom:14px">' + esc(o.codigo || '') + ' — ' + esc(o.assunto || '') + '</div>' +
      '<div style="' + bloco + '">' +
        '<label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:.84rem;cursor:pointer;margin-bottom:8px">' +
          '<input type="checkbox" id="doc-envio-assinar" style="width:auto" ' + (enviar && !docCertCarregado() && !temCofre ? '' : 'checked') + (enviar ? '' : ' disabled') + ' onchange="docEnvioAlternarCert()">' +
          '<span>Assinar digitalmente com certificado ICP-Brasil (A1)</span></label>' +
        '<div id="doc-envio-cert">' + certHtml + '</div>' +
      '</div>' +
      envioHtml +
      (enviar ? '<label style="display:flex;align-items:center;gap:8px;font-size:.78rem;cursor:pointer;margin-bottom:12px"><input type="checkbox" id="doc-envio-copia" style="width:auto" checked><span>Baixar também uma cópia do PDF enviado</span></label>' : '') +
      '<div id="doc-envio-status" style="display:none; font-size:.8rem; margin-bottom:10px"></div>' +
      '<div class="modal-footer" style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap">' +
        '<button type="button" class="btn btn-ghost" onclick="docEnvioFechar()">Fechar</button>' +
        '<button type="button" class="btn ' + (enviar ? 'btn-ghost' : 'btn-primary') + '" id="doc-envio-btn-baixar" onclick="docEnvioExecutar(true)">⬇️ ' + (enviar ? 'Só baixar o PDF' : 'Assinar e baixar') + '</button>' +
        (enviar ? '<button type="button" class="btn btn-primary" id="doc-envio-btn-enviar" onclick="docEnvioExecutar(false)">📨 Enviar</button>' : '') +
      '</div>' +
    '</div>';
  bg.addEventListener('mousedown', function (ev) { if (ev.target === bg) docEnvioFechar(); });
  document.body.appendChild(bg);
  if (enviar) docEnvioRenderEmails(true);
  docEnvioAlternarCert();
}

function docEnvioAlternarCert() {
  const chk = document.getElementById('doc-envio-assinar'), box = document.getElementById('doc-envio-cert');
  if (chk && box) box.style.display = chk.checked ? 'block' : 'none';
}

function docEnvioTrocarChave() {
  localStorage.removeItem(OFICIO_CHAVE_LS);
  const box = document.getElementById('doc-envio-chave-box');
  if (box) box.innerHTML = '<div class="field"><label>🔑 Chave de envio</label><input type="password" id="doc-envio-chave" autocomplete="off" placeholder="Definida no painel do Supabase"></div>';
}

// Lista de e-mails cadastrados, com caixas de seleção (mantém o que já estava marcado)
function docEnvioRenderEmails(primeiraVez) {
  const cont = document.getElementById('doc-envio-emails');
  if (!cont || !_docEnvio) return;
  const marcados = new Set(Array.from(cont.querySelectorAll('input:checked')).map(function (i) { return i.value; }));
  const o = docLista(_docEnvio.tipo).find(function (d) { return d.id === _docEnvio.id; });
  const nomesDest = o ? docDests(o).map(function (d) { return docNorm(d.nome); }).filter(Boolean) : [];
  const lista = ofiEmails();
  if (!lista.length) {
    cont.innerHTML = '<div style="font-size:.76rem; color:var(--muted)">Nenhum e-mail cadastrado ainda. Cadastre abaixo — ele fica salvo para os próximos ofícios.</div>';
    return;
  }
  cont.innerHTML = lista.map(function (m) {
    // na abertura, já marca o e-mail cujo nome coincide com o do destinatário do ofício
    const sugerido = primeiraVez && nomesDest.some(function (n) { const mn = docNorm(m.nome); return mn && (n.indexOf(mn) >= 0 || mn.indexOf(n) >= 0); });
    const on = marcados.has(m.email) || sugerido;
    return '<label style="display:flex; align-items:center; gap:8px; font-size:.8rem; cursor:pointer; padding:4px 6px; border-radius:6px; background:var(--card)">' +
      '<input type="checkbox" value="' + esc(m.email) + '" style="width:auto"' + (on ? ' checked' : '') + '>' +
      '<span style="flex:1; min-width:0; word-break:break-word"><strong>' + esc(m.nome) + '</strong> <span style="color:var(--muted)">&lt;' + esc(m.email) + '&gt;</span></span></label>';
  }).join('');
}

async function docEnvioAdicionarEmail() {
  const n = document.getElementById('doc-envio-novo-nome'), e = document.getElementById('doc-envio-novo-email');
  const novo = await ofiCadastrarEmail(n.value, e.value);
  if (!novo) return;
  n.value = ''; e.value = '';
  docEnvioRenderEmails(false);
  const chk = document.querySelector('#doc-envio-emails input[value="' + novo.email.replace(/"/g, '') + '"]');
  if (chk) chk.checked = true;
  if (typeof renderCadastrosOficio === 'function') renderCadastrosOficio();
}

function docEnvioStatus(html, cor) {
  const st = document.getElementById('doc-envio-status');
  if (!st) return;
  st.style.display = html ? 'block' : 'none';
  st.style.color = cor || 'var(--text)';
  st.innerHTML = html || '';
}

// Abre o certificado informado no próprio diálogo (arquivo ou o salvo neste aparelho)
async function docEnvioAbrirCertificado() {
  if (docCertCarregado()) return;
  if (typeof forge === 'undefined') throw new Error('Biblioteca de certificado não carregou (verifique a internet).');
  const senha = (document.getElementById('doc-envio-senha') || {}).value || '';
  const inputArq = document.getElementById('doc-envio-pfx');
  const arq = inputArq && inputArq.files[0];
  let buffer = null, nome = '';
  if (arq) { buffer = await arq.arrayBuffer(); nome = arq.name; }
  else { const reg = await dsCofreLer(); if (reg && reg.bytes) { buffer = reg.bytes; nome = reg.nome; } }
  if (!buffer) throw new Error('Selecione o arquivo do certificado (.pfx).');
  if (!senha) throw new Error('Informe a senha do certificado.');
  await dsAbrirCertificado(buffer, senha);
  const lembrar = document.getElementById('doc-envio-lembrar');
  if (arq && lembrar && lembrar.checked) { try { await dsCofreSalvar(buffer, nome); if (typeof dsCofreAtualizarUI === 'function') dsCofreAtualizarUI(); } catch (e) { console.warn('Cofre:', e); } }
  const campo = document.getElementById('doc-envio-senha'); if (campo) campo.value = '';
}

function docBytesBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function docSha256Hex(bytes) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(d).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

async function docEnvioExecutar(soBaixar) {
  if (_docEnvioOcupado || !_docEnvio) return;
  const tipo = _docEnvio.tipo, id = _docEnvio.id, enviar = _docEnvio.enviar && !soBaixar;
  const o = docLista(tipo).find(function (d) { return d.id === id; });
  if (!o) return toastMsg('Documento não encontrado.', 'warning');
  const assinar = !!(document.getElementById('doc-envio-assinar') || {}).checked;

  let para = [], mensagem = '', chave = '';
  if (enviar) {
    para = Array.from(document.querySelectorAll('#doc-envio-emails input:checked')).map(function (i) { return i.value; });
    mensagem = ((document.getElementById('doc-envio-msg') || {}).value || '').trim();
    chave = ((document.getElementById('doc-envio-chave') || {}).value || '').trim() || localStorage.getItem(OFICIO_CHAVE_LS) || '';
    if (!para.length) return toastMsg('Marque pelo menos um e-mail para enviar.', 'warning');
    if (para.length > OFICIO_ENVIO_MAX_DEST) return toastMsg('No máximo ' + OFICIO_ENVIO_MAX_DEST + ' e-mails por envio.', 'warning');
    if (!mensagem) return toastMsg('Escreva a mensagem do e-mail.', 'warning');
    if (!chave) return toastMsg('Informe a chave de envio.', 'warning');
    if (!assinar && !confirm('Enviar o ofício SEM assinatura digital?')) return;
    if (!confirm('Enviar ' + (o.codigo || 'o ofício') + (assinar ? ' ASSINADO' : '') + ' por e-mail para:\n\n' + para.join('\n') + '\n\nConfirma?')) return;
  }

  _docEnvioOcupado = true;
  const botoes = Array.from(document.querySelectorAll('#modal-doc-envio button'));
  botoes.forEach(function (b) { b.disabled = true; });
  try {
    if (assinar) {
      docEnvioStatus('⏳ Abrindo o certificado...');
      await docEnvioAbrirCertificado();
      if (new Date() > _dsCert.validity.notAfter) throw new Error('O certificado digital está expirado. Renove-o para assinar.');
    }
    docEnvioStatus('⏳ Gerando o PDF...');
    const gerado = await docGerarPdf(o, tipo);
    let bytes = gerado.bytes;
    if (assinar) {
      docEnvioStatus('⏳ Assinando digitalmente...');
      bytes = await dsAssinarPdfBytes(bytes, gerado.sigPlace, { motivo: 'Assinatura de ' + (o.codigo || 'documento oficial') });
    }
    if (bytes.length > OFICIO_ENVIO_MAX_BYTES) throw new Error('O PDF passou de 8 MB.');
    const nomeArq = docNomeArquivo(o, tipo, assinar);
    const patch = {};
    if (assinar) { patch.assinadoEm = new Date().toISOString(); patch.assinadoPor = docCertNome(); patch.sha256 = await docSha256Hex(bytes); }

    const assinante = (typeof getAssinanteAtual === 'function') ? getAssinanteAtual() : {};
    if (enviar) {
      docEnvioStatus('⏳ Enviando o e-mail...');
      const resp = await fetch(OFICIO_ENVIO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chave: chave, para: para, codigo: o.codigo || '', assunto: o.assunto || '', mensagem: mensagem,
          nomeArquivo: nomeArq, pdfBase64: docBytesBase64(bytes), assinado: assinar,
          link: docLinkPublico(tipo, o.token), enviadoPor: assinante.nome || o.emissorNome || ''
        })
      });
      let dados = {};
      try { dados = await resp.json(); } catch (e) { /* resposta sem corpo */ }
      if (resp.status === 401) { localStorage.removeItem(OFICIO_CHAVE_LS); docEnvioTrocarChave(); }
      if (!resp.ok || !dados.ok) throw new Error(dados.erro || 'Falha no envio (código ' + resp.status + ').');
      localStorage.setItem(OFICIO_CHAVE_LS, chave);
      const x = docExtras(o);
      patch.envios = (x.envios || []).concat([{ em: new Date().toISOString(), para: para, assinado: assinar, por: assinante.nome || '' }]);
      if (docSituacao(o, tipo) === 'emitido') patch.status = 'enviado';
      try { DB.saveLog('Documento', 'Enviou ' + o.codigo + (assinar ? ' assinado' : '') + ' por e-mail para ' + para.join(', '), 'oficios', o.id); } catch (e) { /* opcional */ }
    }
    if (Object.keys(patch).length) await docAtualizarExtras(tipo, id, patch);
    const copia = document.getElementById('doc-envio-copia');
    if (!enviar || (copia && copia.checked)) docBaixarBytes(bytes, nomeArq);

    docRenderHistorico(tipo);
    if (enviar) docEnvioMostrarZap(o, tipo, { para: para, em: new Date().toISOString(), assinado: assinar, por: assinante.nome || '', bytes: bytes, nomeArq: nomeArq });
    docEnvioStatus('✅ ' + (enviar ? 'E-mail enviado para ' + para.map(esc).join(', ') + '.' : 'PDF ' + (assinar ? 'assinado e ' : '') + 'baixado: ' + esc(nomeArq)) +
      (assinar ? '<br>Assinado por <strong>' + esc(docCertNome()) + '</strong>. Abra no Adobe Reader para ver o painel de assinatura.' : ''), 'var(--success)');
    toastMsg(enviar ? 'Ofício enviado por e-mail!' : 'PDF pronto!', 'success');
    const certBox = document.getElementById('doc-envio-cert');
    if (certBox && docCertCarregado()) certBox.innerHTML = '<div style="font-size:.8rem">✅ Certificado carregado: <strong>' + esc(docCertNome()) + '</strong></div>';
  } catch (err) {
    console.error(err);
    const senhaErrada = /mac|password|invalid|pkcs#?12/i.test(String(err && err.message));
    docEnvioStatus('❌ ' + esc(senhaErrada ? 'Senha do certificado incorreta (ou arquivo inválido).' : (err.message || String(err))), 'var(--danger)');
  } finally {
    _docEnvioOcupado = false;
    botoes.forEach(function (b) { b.disabled = false; });
  }
}

// ===================== ENCAMINHAR PELO WHATSAPP =====================
// O WhatsApp não aceita anexo por link (wa.me só leva texto). Então há dois caminhos:
//  - "Enviar o PDF": usa o compartilhamento do próprio aparelho (navigator.share) e manda o
//    arquivo assinado de verdade para a conversa escolhida — funciona no celular e no app Android.
//  - "Abrir conversa": abre o WhatsApp (ou o WhatsApp Web, no computador) com o texto pronto,
//    incluindo o link público de conferência, de onde o destinatário baixa o PDF assinado.

let _docZap = null; // { texto, bytes, nomeArq, codigo }

function docZapContatos() {
  const l = DB.config().whatsOficios;
  return Array.isArray(l) ? l.filter(function (c) { return c && c.numero; }) : [];
}

function docZapNumeroLimpo(valor) {
  let num = String(valor || '').replace(/\D/g, '');
  if (num && num.length <= 11) num = '55' + num;
  return num;
}

async function docZapCadastrarContato() {
  const n = document.getElementById('doc-zap-novo-nome'), t = document.getElementById('doc-zap-novo-num');
  if (!n || !t) return;
  const nome = (n.value || '').trim();
  const bruto = (t.value || '').replace(/\D/g, '');
  if (!nome) return toastMsg('Informe o nome do contato.', 'warning');
  if (bruto.length < 10 || bruto.length > 13) return toastMsg('Número inválido. Use DDD + número, ex.: 38 99999-9999.', 'warning');
  const cfg = DB.config();
  const lista = Array.isArray(cfg.whatsOficios) ? cfg.whatsOficios.slice() : [];
  const num = docZapNumeroLimpo(bruto);
  if (lista.some(function (c) { return docZapNumeroLimpo(c.numero) === num; })) return toastMsg('Esse número já está cadastrado.', 'warning');
  lista.push({ nome: nome, numero: num });
  cfg.whatsOficios = lista;
  await DB.saveConfig(cfg);
  n.value = ''; t.value = '';
  docZapRenderContatos(num);
  toastMsg('Contato de WhatsApp cadastrado!', 'success');
}

async function docZapRemoverContato() {
  const sel = document.getElementById('doc-zap-contato');
  const num = sel ? sel.value : '';
  if (!num) return toastMsg('Escolha um contato cadastrado para remover.', 'warning');
  const cfg = DB.config();
  const lista = (Array.isArray(cfg.whatsOficios) ? cfg.whatsOficios : []).filter(function (c) { return docZapNumeroLimpo(c.numero) !== num; });
  if (!confirm('Remover esse contato de WhatsApp do cadastro?')) return;
  cfg.whatsOficios = lista;
  await DB.saveConfig(cfg);
  docZapRenderContatos('');
  toastMsg('Contato removido.', 'success');
}

function docZapRenderContatos(selecionar) {
  const sel = document.getElementById('doc-zap-contato');
  if (!sel) return;
  const atual = selecionar !== undefined ? selecionar : sel.value;
  sel.innerHTML = '<option value="">— Escolher a conversa no próprio WhatsApp —</option>' +
    docZapContatos().map(function (c) {
      const n = docZapNumeroLimpo(c.numero);
      return '<option value="' + esc(n) + '">' + esc(c.nome) + ' — ' + esc(docZapNumeroBonito(n)) + '</option>';
    }).join('');
  sel.value = atual || '';
}

function docZapNumeroBonito(num) {
  const n = String(num || '').replace(/\D/g, '').replace(/^55/, '');
  if (n.length === 11) return '(' + n.slice(0, 2) + ') ' + n.slice(2, 7) + '-' + n.slice(7);
  if (n.length === 10) return '(' + n.slice(0, 2) + ') ' + n.slice(2, 6) + '-' + n.slice(6);
  return num || '';
}

// Texto do encaminhamento: o que foi enviado, para quem, quando e onde conferir
function docZapTexto(o, tipo, dados) {
  const d = dados || {};
  const h = new Date().getHours();
  const saud = h < 12 ? 'Bom dia!' : (h < 18 ? 'Boa tarde!' : 'Boa noite!');
  const quando = d.em ? new Date(d.em) : new Date();
  const linhas = [saud, ''];
  linhas.push('Encaminho o *' + (o.codigo || DOC_CFG[tipo].nome) + '*' + (d.assinado ? ' (assinado digitalmente — ICP-Brasil)' : '') + '.');
  if (o.assunto) linhas.push('Assunto: ' + o.assunto + '.');
  if ((d.para || []).length) linhas.push('Enviado por e-mail em ' + quando.toLocaleDateString('pt-BR') + ' às ' +
    quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' para: ' + (d.para || []).join(', ') + '.');
  if (o.token) {
    linhas.push('');
    linhas.push('Conferência e download do documento:');
    linhas.push(docLinkPublico(tipo, o.token));
  }
  const assinante = (typeof getAssinanteAtual === 'function') ? getAssinanteAtual() : {};
  const nome = (d.por || assinante.nome || o.emissorNome || '').trim();
  if (nome) { linhas.push(''); linhas.push(nome); if (assinante.cargo || o.emissorCargo) linhas.push(assinante.cargo || o.emissorCargo); }
  linhas.push('Coordenação de Atenção Primária à Saúde — Itacarambi/MG');
  return linhas.join('\n');
}

function docZapTextoAtual() {
  const ta = document.getElementById('doc-zap-msg');
  return ((ta && ta.value) || (_docZap && _docZap.texto) || '').trim();
}

function docZapLink(texto, num) {
  const celular = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const q = (num ? (celular ? '' : 'phone=' + num + '&') : '') + 'text=' + encodeURIComponent(texto);
  if (celular) return 'https://wa.me/' + (num || '') + '?text=' + encodeURIComponent(texto);
  return 'https://web.whatsapp.com/send?' + q;
}

function docZapAbrirConversa() {
  const texto = docZapTextoAtual();
  if (!texto) return toastMsg('Escreva a mensagem do WhatsApp.', 'warning');
  const sel = document.getElementById('doc-zap-contato');
  const w = window.open(docZapLink(texto, sel ? sel.value : ''), '_blank', 'noopener');
  if (w) w.opener = null;
  else toastMsg('O navegador bloqueou a janela. Libere os pop-ups deste site.', 'warning');
}

// Manda o PDF em si para o WhatsApp, pelo compartilhamento do aparelho
async function docZapEnviarPdf() {
  if (!_docZap || !_docZap.bytes) return toastMsg('O PDF deste envio não está mais em memória. Use "Abrir conversa" — o link leva ao documento.', 'warning');
  const texto = docZapTextoAtual();
  try {
    const arquivo = new File([_docZap.bytes], _docZap.nomeArq || 'oficio.pdf', { type: 'application/pdf' });
    if (!navigator.canShare || !navigator.canShare({ files: [arquivo] })) {
      throw new Error('Este navegador não compartilha arquivos. No computador, use "Abrir conversa" e anexe o PDF baixado.');
    }
    await navigator.share({ files: [arquivo], text: texto, title: _docZap.codigo || 'Documento oficial' });
    toastMsg('PDF entregue ao WhatsApp.', 'success');
  } catch (e) {
    if (e && e.name === 'AbortError') return; // o usuário fechou a escolha do aplicativo
    toastMsg(e.message || 'Não foi possível compartilhar o arquivo.', 'warning');
  }
}

// Bloco que aparece no diálogo depois do e-mail enviado
function docZapBloco(o, tipo, dados) {
  _docZap = {
    texto: docZapTexto(o, tipo, dados),
    bytes: dados && dados.bytes ? dados.bytes : null,
    nomeArq: dados && dados.nomeArq ? dados.nomeArq : '',
    codigo: o.codigo || '',
  };
  let podeArquivo = false;
  try {
    podeArquivo = !!(_docZap.bytes && navigator.canShare &&
      navigator.canShare({ files: [new File([new Uint8Array([1])], 'teste.pdf', { type: 'application/pdf' })] }));
  } catch (e) { podeArquivo = false; }
  return '' +
    '<div id="doc-zap-box" style="border:1px solid var(--border); border-radius:var(--r-sm); padding:12px; margin-bottom:12px; background:var(--surface)">' +
      '<div style="font-weight:700; font-size:.84rem; margin-bottom:8px">💬 Encaminhar pelo WhatsApp</div>' +
      '<div class="field"><label>Contato</label>' +
        '<select id="doc-zap-contato" class="doc-ctl"></select>' +
      '</div>' +
      '<div style="display:flex; gap:6px; flex-wrap:wrap; margin:8px 0">' +
        '<input id="doc-zap-novo-nome" class="doc-ctl" placeholder="Nome / setor" style="flex:1; min-width:110px">' +
        '<input id="doc-zap-novo-num" class="doc-ctl" placeholder="38 99999-9999" style="flex:1; min-width:130px">' +
        '<button type="button" class="btn btn-ghost btn-sm" onclick="docZapCadastrarContato()">➕ Cadastrar</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" onclick="docZapRemoverContato()" title="Remover o contato escolhido">🗑️</button>' +
      '</div>' +
      '<div class="field"><label>Mensagem</label><textarea id="doc-zap-msg" style="min-height:120px; line-height:1.5">' + esc(_docZap.texto) + '</textarea></div>' +
      '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px">' +
        (podeArquivo ? '<button type="button" class="btn btn-success btn-sm" onclick="docZapEnviarPdf()">📎 Enviar o PDF pelo WhatsApp</button>' : '') +
        '<button type="button" class="btn btn-primary btn-sm" onclick="docZapAbrirConversa()">💬 Abrir conversa com o texto</button>' +
      '</div>' +
      '<div style="font-size:.7rem; color:var(--muted); margin-top:8px">' +
        (podeArquivo
          ? 'O botão do PDF usa o compartilhamento do aparelho — escolha o WhatsApp e a conversa. No computador, o WhatsApp não aceita anexo por link: use “Abrir conversa” (o texto já leva o link de onde o documento é baixado).'
          : 'No computador o WhatsApp não aceita anexo por link. A mensagem já leva o link público, de onde o destinatário baixa o PDF assinado.') +
      '</div>' +
    '</div>';
}

// 💬 do histórico: reaproveita o bloco, só sem o arquivo (o PDF assinado fica no link)
function docZapDoHistorico(tipo, id) {
  const o = docLista(tipo).find(function (d) { return d.id === id; });
  if (!o) return toastMsg('Documento não encontrado.', 'warning');
  const x = docExtras(o);
  const u = (x.envios && x.envios.length) ? x.envios[x.envios.length - 1] : null;
  const anterior = document.getElementById('modal-doc-zap');
  if (anterior) anterior.remove();
  const bg = document.createElement('div');
  bg.className = 'modal-bg open';
  bg.id = 'modal-doc-zap';
  bg.innerHTML =
    '<div class="modal" style="max-width:560px; width:100%; max-height:92vh; overflow:auto">' +
      '<h3 style="margin-bottom:4px">💬 Encaminhar pelo WhatsApp</h3>' +
      '<div style="font-size:.8rem; color:var(--muted); margin-bottom:14px">' + esc(o.codigo || '') + ' — ' + esc(o.assunto || '') + '</div>' +
      docZapBloco(o, tipo, {
        para: u ? (u.para || []) : [], em: u ? u.em : null,
        assinado: !!(u ? u.assinado : x.assinadoEm), por: u ? u.por : '',
      }) +
      '<div class="modal-footer" style="display:flex; justify-content:flex-end">' +
        '<button type="button" class="btn btn-ghost" onclick="docZapFechar()">Fechar</button>' +
      '</div>' +
    '</div>';
  bg.addEventListener('mousedown', function (ev) { if (ev.target === bg) docZapFechar(); });
  document.body.appendChild(bg);
  docZapRenderContatos('');
}

function docZapFechar() {
  const m = document.getElementById('modal-doc-zap');
  if (m) m.remove();
}

// Insere o bloco do WhatsApp no diálogo, logo depois do envio do e-mail
function docEnvioMostrarZap(o, tipo, dados) {
  const st = document.getElementById('doc-envio-status');
  if (!st || !st.parentNode) return;
  const antigo = document.getElementById('doc-zap-box');
  if (antigo) antigo.remove();
  const div = document.createElement('div');
  div.innerHTML = docZapBloco(o, tipo, dados);
  st.parentNode.insertBefore(div.firstChild, st);
  docZapRenderContatos('');
}
