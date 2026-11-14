// Módulo Enviar Atestado ao RH.
// Anexa o PDF de um atestado e envia por e-mail ao RH da Prefeitura, saindo pela
// conta de e-mail da Coordenação de Atenção Primária. Depois do envio, oferece
// mandar o comprovante pelo WhatsApp ao RH da Secretaria de Saúde.
//
// O envio do e-mail é feito por uma função no servidor (Supabase). O destinatário,
// o remetente e a senha do e-mail ficam somente lá — nada disso existe neste arquivo.
// O PDF não é armazenado: só fica o registro de que foi enviado.

const ATESTADO_RH_URL = 'https://bgvwaamwgcathojxtjqf.supabase.co/functions/v1/atlas-enviar-atestado';
const ATESTADO_RH_MAX_BYTES = 8 * 1024 * 1024;

// Regra de perícia médica conforme o vínculo do servidor
const AR_PERICIA_CONTRATADO_MIN_DIAS = 15; // contratado: 15 dias ou mais
const AR_PERICIA_EFETIVO_ACIMA_DE = 5;     // efetivo: acima de 5 dias

let _arEnviando = false;
let _arEnviadosSessao = [];

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

// Trecho comum: "do servidor FULANO, matrícula 123, lotado no setor X, de 3 dias"
function arDescricao(srv, dias, genero) {
  const t = arTermos(genero);
  let s = t.trat + ' ' + srv.nome;
  if (srv.matricula) s += ', matrícula ' + srv.matricula;
  if (srv.setor) s += ', ' + t.lotado + ' no setor ' + srv.setor;
  s += ', de ' + dias + (dias === 1 ? ' dia' : ' dias');
  return s;
}

function arTextoEmail(srv, dias, genero, obs) {
  let txt = arSaudacao() + '\n\nSegue anexo o atestado ' + arDescricao(srv, dias, genero) + '.';
  if (obs) txt += '\n\n' + obs;
  return txt + '\n\nPor favor, acusar o recebimento.';
}

function arTextoWhatsApp(srv, dias, genero, quando) {
  const t = arTermos(genero);
  let txt = arSaudacao() + '\n\nInformo que o atestado ' + arDescricao(srv, dias, genero).replace(srv.nome, '*' + srv.nome + '*') +
    ', foi enviado ao e-mail do RH da Prefeitura em ' + quando + '.';
  txt += '\nVínculo: ' + t.vinc[arVinculo(srv)] + '.';
  if (arPrecisaPericia(srv, dias)) txt += '\n\n*Favor agendar perícia.*';
  return txt;
}

function arSrvSelecionado() {
  const id = document.getElementById('ar-servidor').value;
  return id ? DB.servidores().find(function (s) { return s.id === id; }) : null;
}

function arDiasInformados() {
  const n = Math.floor(Number(document.getElementById('ar-dias').value));
  return (n >= 1 && n <= 365) ? n : 0;
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
  arRenderEnviados();
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
    : 'ℹ️ Sem perícia: servidor ' + vinc.toLowerCase() + ' com atestado de ' + dias + (dias === 1 ? ' dia' : ' dias') + '.';

  previa.style.display = 'block';
  document.getElementById('ar-previa-texto').textContent =
    arTextoEmail(srv, dias, genero, document.getElementById('ar-obs').value.trim());
}

function arArquivoSelecionado() {
  const input = document.getElementById('ar-pdf');
  const info = document.getElementById('ar-pdf-info');
  const f = input.files[0];
  if (!f) { info.textContent = ''; return; }
  const mb = (f.size / 1024 / 1024).toFixed(2).replace('.', ',');
  if (f.size > ATESTADO_RH_MAX_BYTES) {
    info.innerHTML = '<span style="color:var(--danger)">⚠️ ' + arEsc(f.name) + ' tem ' + mb + ' MB. O limite é 8 MB.</span>';
  } else {
    info.textContent = '📎 ' + f.name + ' (' + mb + ' MB)';
  }
}

function arLerBase64(file) {
  return new Promise(function (resolve, reject) {
    const r = new FileReader();
    r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
    r.onerror = function () { reject(new Error('Não foi possível ler o arquivo.')); };
    r.readAsDataURL(file);
  });
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
  const e = _arEnviadosSessao[idx];
  if (!e) return;
  const w = window.open(arLinkWhatsApp(e.textoWhats), '_blank', 'noopener');
  if (w) w.opener = null;
  arFecharPergunta();
}

function arFecharPergunta() {
  const box = document.getElementById('ar-pergunta-whats');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
}

function arPerguntarWhatsApp() {
  const box = document.getElementById('ar-pergunta-whats');
  const e = _arEnviadosSessao[0];
  if (!box || !e) return;
  const semNumero = !String(DB.config().whatsRhSaude || '').replace(/\D/g, '');
  box.style.display = 'block';
  box.innerHTML =
    '<div style="font-weight:800;margin-bottom:6px">✅ E-mail enviado ao RH da Prefeitura.</div>' +
    '<div style="margin-bottom:10px">Deseja enviar o comprovante para o WhatsApp do RH da Secretaria de Saúde?</div>' +
    '<pre style="white-space:pre-wrap;font:inherit;font-size:.82rem;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px;margin:0 0 10px">' + arEsc(e.textoWhats) + '</pre>' +
    (semNumero ? '<div style="font-size:.78rem;opacity:.75;margin-bottom:10px">O número do RH da Secretaria ainda não foi cadastrado (campo no fim desta tela). O WhatsApp vai abrir com o texto pronto para você escolher a conversa.</div>' : '') +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<button type="button" class="btn btn-success" onclick="arAbrirWhatsApp(0)">💬 Sim, abrir o WhatsApp</button>' +
    '<button type="button" class="btn btn-ghost" onclick="arFecharPergunta()">Agora não</button></div>';
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function arRenderEnviados() {
  const box = document.getElementById('ar-enviados');
  if (!box) return;
  if (!_arEnviadosSessao.length) {
    box.innerHTML = '<div style="opacity:.6;font-size:.85rem">Nenhum atestado enviado nesta sessão.</div>';
    return;
  }
  box.innerHTML = _arEnviadosSessao.map(function (e, i) {
    return '<div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">' +
      '<span>✅</span><div style="flex:1"><strong>' + arEsc(e.profissional) + '</strong> — ' + e.dias + (e.dias === 1 ? ' dia' : ' dias') +
      (e.pericia ? ' · <span style="color:var(--warning, #f59e0b);font-weight:700">perícia</span>' : '') +
      '<div style="font-size:.75rem;opacity:.7">' + arEsc(e.arquivo) + ' · enviado às ' + arEsc(e.hora) + ' para ' + arEsc(e.destinatario) + '</div></div>' +
      '<button type="button" class="btn btn-success btn-sm" onclick="arAbrirWhatsApp(' + i + ')" title="Enviar comprovante pelo WhatsApp">💬 WhatsApp</button></div>';
  }).join('');
}

async function enviarAtestadoRH() {
  if (_arEnviando) return;
  const srv = arSrvSelecionado();
  const dias = arDiasInformados();
  const file = document.getElementById('ar-pdf').files[0];
  const genero = document.getElementById('ar-genero').value;
  const observacao = document.getElementById('ar-obs').value.trim();

  if (!srv) return toastMsg('Selecione o servidor.', 'warning');
  if (!dias) return toastMsg('Informe de quantos dias é o atestado.', 'warning');
  if (!file) return toastMsg('Anexe o PDF do atestado.', 'warning');
  const ehPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
  if (!ehPdf) return toastMsg('O arquivo precisa ser um PDF.', 'warning');
  if (file.size > ATESTADO_RH_MAX_BYTES) return toastMsg('O PDF passa de 8 MB. Reduza o arquivo.', 'warning');

  if (!confirm('Enviar o atestado de ' + srv.nome + ' (' + dias + (dias === 1 ? ' dia' : ' dias') + ') por e-mail ao RH da Prefeitura?\n\nArquivo: ' + file.name)) return;

  const btn = document.getElementById('ar-btn-enviar');
  const textoBtn = btn.innerHTML;
  _arEnviando = true;
  btn.disabled = true;
  btn.innerHTML = '⏳ Enviando...';
  arFecharPergunta();

  try {
    const assinante = (typeof getAssinanteAtual === 'function') ? getAssinanteAtual() : {};
    const resp = await fetch(ATESTADO_RH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profissional: srv.nome,
        matricula: srv.matricula || '',
        setor: srv.setor || '',
        dias: dias,
        genero: genero,
        observacao: observacao,
        nomeArquivo: file.name,
        pdfBase64: await arLerBase64(file),
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
    _arEnviadosSessao.unshift({
      profissional: srv.nome,
      dias: dias,
      pericia: pericia,
      arquivo: file.name,
      destinatario: dados.destinatario || 'RH',
      hora: hora,
      textoWhats: arTextoWhatsApp(srv, dias, genero, agora.toLocaleDateString('pt-BR') + ' às ' + hora)
    });
    arRenderEnviados();
    try {
      DB.saveLog('Documento', 'Enviou atestado de ' + srv.nome + ' (' + dias + ' dias' + (pericia ? ', com perícia' : '') + ') por e-mail ao RH (' + file.name + ')', 'servidores', srv.id);
    } catch (e) { /* log é opcional */ }

    document.getElementById('ar-pdf').value = '';
    document.getElementById('ar-pdf-info').textContent = '';
    document.getElementById('ar-obs').value = '';
    document.getElementById('ar-dias').value = '';
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
