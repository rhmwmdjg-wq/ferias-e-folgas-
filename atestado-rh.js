// Módulo Enviar Atestado ao RH.
// Anexa o PDF de um atestado e envia por e-mail ao RH da Prefeitura, saindo pela
// conta de e-mail da Coordenação de Atenção Primária.
//
// O envio é feito por uma função no servidor (Supabase). O destinatário, o remetente
// e a senha do e-mail ficam somente lá — nada disso existe neste arquivo.
// O PDF não é armazenado: só fica o registro de que foi enviado.

const ATESTADO_RH_URL = 'https://bgvwaamwgcathojxtjqf.supabase.co/functions/v1/atlas-enviar-atestado';
const ATESTADO_RH_MAX_BYTES = 8 * 1024 * 1024;
let _arEnviando = false;
let _arEnviadosSessao = [];

function arEsc(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function renderAtestadoRH() {
  const sel = document.getElementById('ar-servidor');
  if (!sel) return;
  const atual = sel.value;
  const srvs = (typeof getServidoresAcessiveis === 'function' ? getServidoresAcessiveis() : DB.servidores())
    .slice().sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
  sel.innerHTML = '<option value="">Selecione o profissional...</option>' +
    srvs.map(function (s) {
      return '<option value="' + arEsc(s.id) + '">' + arEsc(s.nome) + (s.setor ? ' — ' + arEsc(s.setor) : '') + '</option>';
    }).join('');
  if (atual) sel.value = atual;
  arRenderEnviados();
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

function arRenderEnviados() {
  const box = document.getElementById('ar-enviados');
  if (!box) return;
  if (!_arEnviadosSessao.length) {
    box.innerHTML = '<div style="opacity:.6;font-size:.85rem">Nenhum atestado enviado nesta sessão.</div>';
    return;
  }
  box.innerHTML = _arEnviadosSessao.map(function (e) {
    return '<div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">' +
      '<span>✅</span><div style="flex:1"><strong>' + arEsc(e.profissional) + '</strong>' +
      '<div style="font-size:.75rem;opacity:.7">' + arEsc(e.arquivo) + ' · enviado às ' + arEsc(e.hora) + ' para ' + arEsc(e.destinatario) + '</div></div></div>';
  }).join('');
}

async function enviarAtestadoRH() {
  if (_arEnviando) return;
  const srvId = document.getElementById('ar-servidor').value;
  const file = document.getElementById('ar-pdf').files[0];
  const genero = document.getElementById('ar-genero').value;
  const observacao = document.getElementById('ar-obs').value.trim();

  if (!srvId) return toastMsg('Selecione o profissional.', 'warning');
  if (!file) return toastMsg('Anexe o PDF do atestado.', 'warning');
  const ehPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
  if (!ehPdf) return toastMsg('O arquivo precisa ser um PDF.', 'warning');
  if (file.size > ATESTADO_RH_MAX_BYTES) return toastMsg('O PDF passa de 8 MB. Reduza o arquivo.', 'warning');

  const srv = DB.servidores().find(function (s) { return s.id === srvId; });
  if (!srv) return toastMsg('Profissional não encontrado.', 'error');

  if (!confirm('Enviar o atestado de ' + srv.nome + ' por e-mail ao RH da Prefeitura?\n\nArquivo: ' + file.name)) return;

  const btn = document.getElementById('ar-btn-enviar');
  const textoBtn = btn.innerHTML;
  _arEnviando = true;
  btn.disabled = true;
  btn.innerHTML = '⏳ Enviando...';

  try {
    const assinante = (typeof getAssinanteAtual === 'function') ? getAssinanteAtual() : {};
    const resp = await fetch(ATESTADO_RH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profissional: srv.nome,
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

    _arEnviadosSessao.unshift({
      profissional: srv.nome,
      arquivo: file.name,
      destinatario: dados.destinatario || 'RH',
      hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    });
    arRenderEnviados();
    try { DB.saveLog('Documento', 'Enviou atestado de ' + srv.nome + ' por e-mail ao RH (' + file.name + ')', 'servidores', srv.id); } catch (e) { /* log é opcional */ }

    document.getElementById('ar-pdf').value = '';
    document.getElementById('ar-pdf-info').textContent = '';
    document.getElementById('ar-obs').value = '';
    document.getElementById('ar-servidor').value = '';
    toastMsg('Atestado de ' + srv.nome + ' enviado ao RH!', 'success');
  } catch (err) {
    console.error(err);
    toastMsg(err.message || 'Não foi possível enviar o atestado.', 'error');
  } finally {
    _arEnviando = false;
    btn.disabled = false;
    btn.innerHTML = textoBtn;
  }
}
