// Módulo Gerador de Ofícios Profissional.
// Emissão de correspondências oficiais, numeração sequencial automática, logos municipais, links públicos e Supabase.

let _oficiosData = [];
let _oficioEditingId = null;
let _ofiDestinatarios = [];

const OFICIO_HEADER = {
  titulo: 'SECRETARIA MUNICIPAL DE SAÚDE - ITACARAMBI',
  linhas: [
    'ESTADO DE MINAS GERAIS - CNPJ: 18.283.101/0001-82',
    'Rua Alferes Propécio, Nº 39 - Centro – CEP: 39.470-000 - Centro - Tel: (38)3613-1148 – 1401/1957',
    'E-mail: smsitac@yahoo.com.br'
  ]
};

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

function gerarTokenOficio() {
  return 'ofc_' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 6);
}

function obterDataExtenso(dataInput) {
  const dt = dataInput ? new Date(dataInput + 'T12:00:00') : new Date();
  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const dia = String(dt.getDate()).padStart(2, '0');
  const mes = meses[dt.getMonth()];
  const ano = dt.getFullYear();
  return `${dia} de ${mes} de ${ano}`;
}

function atualizarNumeroOficioManual(val) {
  const num = parseInt(val) || 74;
  const ano = parseInt(document.getElementById('ofi-ano')?.value) || new Date().getFullYear();
  const numFmt = String(num).padStart(3, '0');
  document.getElementById('ofi-numero').value = num;
  document.getElementById('ofi-codigo').value = `Ofício nº ${numFmt}/${ano} - APS`;
  atualizarPreviewOficio();
}

function carregarNovoOficio() {
  _oficiosData = DB.oficios();
  _oficioEditingId = null;
  _ofiDestinatarios = [];

  const anoAtual = new Date().getFullYear();
  const proximoNum = DB.proximoNumeroOficio(anoAtual);
  const numFormatado = String(proximoNum).padStart(3, '0');
  const codigoCompleto = `Ofício nº ${numFormatado}/${anoAtual} - APS`;

  document.getElementById('ofi-id').value = '';
  document.getElementById('ofi-ano').value = anoAtual;
  document.getElementById('ofi-numero').value = proximoNum;
  document.getElementById('ofi-codigo').value = codigoCompleto;
  document.getElementById('ofi-assunto').value = '';
  document.getElementById('ofi-cidade-data').value = `ITACARAMBI - MG, ${obterDataExtenso()}`;
  document.getElementById('ofi-texto').value = '';

  const sessao = JSON.parse(sessionStorage.getItem('ferias_sessao') || '{}');
  const cfg = DB.config();
  document.getElementById('ofi-emissor-nome').value = sessao.nome || cfg.coordenadorAPS || 'Coordenação APS';
  document.getElementById('ofi-emissor-cargo').value = sessao.role === 'admin' ? 'Administrador do Sistema' : (cfg.subtituloSidebar || 'Coordenação da Atenção Primária à Saúde');
  const emissorSel = document.getElementById('ofi-emissor-select');
  if (emissorSel) emissorSel.value = '';

  const titleEl = document.getElementById('ofi-form-title');
  if (titleEl) titleEl.textContent = 'Novo Ofício Oficial';

  renderCadastrosOficio();
  renderSelectDestinatariosOficio();
  renderSelectEmissoresOficio();
  renderDestinatariosSelecionadosOficio();
  atualizarPreviewOficio();
}

// ===================== CADASTRO DE DESTINATÁRIOS =====================
async function salvarCadastroDestinatario() {
  const nome = document.getElementById('dest-cad-nome').value.trim();
  const cargo = document.getElementById('dest-cad-cargo').value.trim();
  const orgao = document.getElementById('dest-cad-orgao').value.trim();
  if (!nome) return toastMsg('Informe o nome do destinatário.', 'warning');

  const lista = DB.destinatarios();
  lista.push({ id: uidOficio(), nome, cargo, orgao });
  await DB.saveDestinatarios(lista);

  document.getElementById('dest-cad-nome').value = '';
  document.getElementById('dest-cad-cargo').value = '';
  document.getElementById('dest-cad-orgao').value = '';
  renderCadastrosOficio();
  renderSelectDestinatariosOficio();
  toastMsg('Destinatário cadastrado com sucesso!', 'success');
}

async function excluirDestinatarioCadastro(id) {
  const d = DB.destinatarios().find(x => x.id === id);
  if (!confirm(`Excluir o destinatário "${d ? d.nome : ''}"?`)) return;
  const lista = DB.destinatarios().filter(x => x.id !== id);
  await DB.saveDestinatarios(lista);
  renderCadastrosOficio();
  renderSelectDestinatariosOficio();
  toastMsg('Destinatário excluído.', 'info');
}

function renderSelectDestinatariosOficio() {
  const sel = document.getElementById('ofi-dest-select');
  if (!sel) return;
  const lista = DB.destinatarios();
  sel.innerHTML = '<option value="">Selecione um destinatário cadastrado...</option>' +
    lista.map(d => `<option value="${esc(d.id)}">${esc(d.nome)}${d.cargo ? ' — ' + esc(d.cargo) : ''}</option>`).join('');
}

function adicionarDestinatarioOficio() {
  const sel = document.getElementById('ofi-dest-select');
  const id = sel?.value;
  if (!id) return toastMsg('Selecione um destinatário cadastrado para adicionar.', 'warning');
  const d = DB.destinatarios().find(x => x.id === id);
  if (!d) return;
  _ofiDestinatarios.push({ nome: d.nome || '', cargo: d.cargo || '', orgao: d.orgao || '' });
  sel.value = '';
  renderDestinatariosSelecionadosOficio();
  atualizarPreviewOficio();
}

function removerDestinatarioOficio(idx) {
  _ofiDestinatarios.splice(idx, 1);
  renderDestinatariosSelecionadosOficio();
  atualizarPreviewOficio();
}

function atualizarDestinatarioOficio(idx, campo, valor) {
  if (!_ofiDestinatarios[idx]) return;
  _ofiDestinatarios[idx][campo] = valor;
  atualizarPreviewOficio();
}

function renderDestinatariosSelecionadosOficio() {
  const cont = document.getElementById('ofi-dest-selecionados');
  if (!cont) return;
  if (!_ofiDestinatarios.length) {
    cont.innerHTML = '<div style="font-size:0.72rem;color:var(--muted);padding:6px 0;">Nenhum destinatário adicionado. O ofício pode ser emitido sem destinatário.</div>';
    return;
  }
  cont.innerHTML = _ofiDestinatarios.map((d, i) => `
    <div style="border:1px solid var(--border); border-radius:var(--r-sm); padding:10px; margin-bottom:8px; background:var(--surface);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <strong style="font-size:.74rem; color:var(--primary);">Destinatário ${i + 1}</strong>
        <button class="btn btn-danger btn-sm" onclick="removerDestinatarioOficio(${i})" title="Remover">🗑️</button>
      </div>
      <input value="${esc(d.nome)}" placeholder="Nome / Tratamento" oninput="atualizarDestinatarioOficio(${i}, 'nome', this.value)" style="margin-bottom:6px;">
      <input value="${esc(d.cargo)}" placeholder="Cargo" oninput="atualizarDestinatarioOficio(${i}, 'cargo', this.value)" style="margin-bottom:6px;">
      <input value="${esc(d.orgao)}" placeholder="Órgão / Secretaria / Empresa" oninput="atualizarDestinatarioOficio(${i}, 'orgao', this.value)">
    </div>
  `).join('');
}

// ===================== CADASTRO DE EMISSORES =====================
async function salvarCadastroEmissor() {
  const nome = document.getElementById('emi-cad-nome').value.trim();
  const cargo = document.getElementById('emi-cad-cargo').value.trim();
  if (!nome) return toastMsg('Informe o nome do emissor.', 'warning');

  const lista = DB.emissores();
  lista.push({ id: uidOficio(), nome, cargo });
  await DB.saveEmissores(lista);

  document.getElementById('emi-cad-nome').value = '';
  document.getElementById('emi-cad-cargo').value = '';
  renderCadastrosOficio();
  renderSelectEmissoresOficio();
  toastMsg('Emissor cadastrado com sucesso!', 'success');
}

async function excluirEmissorCadastro(id) {
  const e = DB.emissores().find(x => x.id === id);
  if (!confirm(`Excluir o emissor "${e ? e.nome : ''}"?`)) return;
  const lista = DB.emissores().filter(x => x.id !== id);
  await DB.saveEmissores(lista);
  renderCadastrosOficio();
  renderSelectEmissoresOficio();
  toastMsg('Emissor excluído.', 'info');
}

function renderSelectEmissoresOficio() {
  const sel = document.getElementById('ofi-emissor-select');
  if (!sel) return;
  const atual = sel.value;
  const lista = DB.emissores();
  sel.innerHTML = '<option value="">Selecione para preencher automaticamente...</option>' +
    lista.map(e => `<option value="${esc(e.id)}">${esc(e.nome)}${e.cargo ? ' — ' + esc(e.cargo) : ''}</option>`).join('');
  if (atual && lista.some(e => e.id === atual)) sel.value = atual;
}

function selecionarEmissorOficio(id) {
  if (!id) return;
  const e = DB.emissores().find(x => x.id === id);
  if (!e) return;
  document.getElementById('ofi-emissor-nome').value = e.nome || '';
  document.getElementById('ofi-emissor-cargo').value = e.cargo || '';
  atualizarPreviewOficio();
}

function renderCadastrosOficio() {
  const contDest = document.getElementById('lista-destinatarios-cadastro');
  if (contDest) {
    const lista = DB.destinatarios();
    contDest.innerHTML = lista.length ? lista.map(d => `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:8px 10px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-sm);">
        <div style="min-width:0;">
          <div style="font-size:.78rem; font-weight:600;">${esc(d.nome)}</div>
          <div style="font-size:.68rem; color:var(--muted);">${esc([d.cargo, d.orgao].filter(Boolean).join(' · '))}</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="excluirDestinatarioCadastro('${esc(d.id)}')" title="Excluir">🗑️</button>
      </div>
    `).join('') : '<div style="font-size:.74rem;color:var(--muted);">Nenhum destinatário cadastrado.</div>';
  }

  const contEmi = document.getElementById('lista-emissores-cadastro');
  if (contEmi) {
    const lista = DB.emissores();
    contEmi.innerHTML = lista.length ? lista.map(e => `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:8px 10px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-sm);">
        <div style="min-width:0;">
          <div style="font-size:.78rem; font-weight:600;">${esc(e.nome)}</div>
          <div style="font-size:.68rem; color:var(--muted);">${esc(e.cargo || '')}</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="excluirEmissorCadastro('${esc(e.id)}')" title="Excluir">🗑️</button>
      </div>
    `).join('') : '<div style="font-size:.74rem;color:var(--muted);">Nenhum emissor cadastrado.</div>';
  }
}

function atualizarPreviewOficio() {
  const container = document.getElementById('ofi-preview-container');
  if (!container) return;

  const cfg = DB.config();
  const logoSide = (typeof getImg === 'function' ? getImg('side') : null) || localStorage.getItem('srv_img_side') || '';
  const logoEsq = logoSide || (typeof getImg === 'function' ? getImg('esq') : null) || localStorage.getItem('srv_img_esq') || '';
  const logoDir = (typeof getImg === 'function' ? getImg('dir') : null) || localStorage.getItem('srv_img_dir') || '';
  const logoPrint = (typeof getImg === 'function' ? getImg('print') : null) || localStorage.getItem('srv_img_print') || '';

  const orgNome = cfg.nomeOrganizacao || 'Coordenação da Atenção Primária à Saúde';
  const subTitle = cfg.subtituloSidebar || 'Gestão de RH & Administração';

  const codigo = document.getElementById('ofi-codigo')?.value || 'Ofício nº 001/2026 - APS';
  const cidadeData = document.getElementById('ofi-cidade-data')?.value || `ITACARAMBI - MG, ${obterDataExtenso()}`;
  const assunto = document.getElementById('ofi-assunto')?.value || 'Assunto da correspondência';
  const texto = document.getElementById('ofi-texto')?.value || 'Digite aqui o texto oficial do seu ofício...';
  const emissorNome = document.getElementById('ofi-emissor-nome')?.value || 'Nome do Emissor';
  const emissorCargo = document.getElementById('ofi-emissor-cargo')?.value || 'Cargo do Emissor';

  // Formatador de parágrafos do texto do ofício
  const paragrafosHtml = texto.split('\n').filter(p => p.trim()).map(p =>
    `<p style="text-align:justify; text-indent:2.5em; margin-bottom:14px; line-height:1.7; font-size:14px;">${esc(p)}</p>`
  ).join('');

  // Blocos de destinatários (suporta vários)
  const dests = (_ofiDestinatarios || []).filter(d => (d.nome || '').trim() || (d.cargo || '').trim() || (d.orgao || '').trim());
  const destsHtml = dests.length ? dests.map(d => `
    <div style="margin-bottom:12px;">
      <div><strong>${esc(d.nome || '')}</strong></div>
      ${d.cargo ? `<div>${esc(d.cargo)}</div>` : ''}
      ${d.orgao ? `<div style="color:#475569;">${esc(d.orgao)}</div>` : ''}
    </div>
  `).join('') : '<div><strong>À Sua Senhoria o Senhor Destinatário</strong></div>';

  // Logos HTML
  const logoEsqHtml = logoEsq ? `<img src="${logoEsq}" style="max-height:60px; max-width:140px; object-fit:contain;">` : '<div style="font-size:24px;">🏛️</div>';
  const logoDirHtml = logoDir ? `<img src="${logoDir}" style="max-height:60px; max-width:140px; object-fit:contain;">` : (logoPrint ? `<img src="${logoPrint}" style="max-height:60px; max-width:140px; object-fit:contain;">` : '<div style="font-size:24px;">🌴</div>');

  container.innerHTML = `
    <div style="background:#fff; color:#111; padding:48px 44px; border-radius:8px; box-shadow:0 8px 30px rgba(0,0,0,0.3); font-family:'Sora', 'Times New Roman', serif; min-height:750px; position:relative;">
      
      <!-- Cabeçalho Oficial com Logos -->
      <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #222; padding-bottom:14px; margin-bottom:24px;">
        <div style="width:140px; text-align:left;">${logoEsqHtml}</div>
        <div style="text-align:center; flex:1; padding:0 10px;">
          ${oficioHeaderHtml(1)}
        </div>
        <div style="width:140px; text-align:right;">${logoDirHtml}</div>
      </div>

      <!-- Número e Data -->
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:28px;">
        <div style="font-weight:700; font-size:14px; color:#0f172a;">${esc(codigo)}</div>
        <div style="font-size:13px; color:#334155; font-weight:500;">${esc(cidadeData)}</div>
      </div>

      <!-- Destinatário(s) -->
      <div style="margin-bottom:24px; line-height:1.5; font-size:13.5px; color:#1e293b;">
        ${destsHtml}
      </div>

      <!-- Assunto -->
      <div style="margin-bottom:28px; background:#f8fafc; padding:10px 14px; border-left:4px solid #3b82f6; font-size:13.5px;">
        <strong>Assunto:</strong> ${esc(assunto)}
      </div>

      <!-- Corpo do Ofício -->
      <div style="min-height:220px; color:#0f172a;">
        ${paragrafosHtml || '<p style="color:#94a3b8; font-style:italic;">Digite o texto no formulário ao lado...</p>'}
      </div>

      <!-- Fecho e Assinatura -->
      <div style="margin-top:40px; text-align:center; page-break-inside:avoid;">
        <div style="margin-bottom:45px; font-size:14px; color:#334155;">Atenciosamente,</div>
        <div style="display:inline-block; border-top:1.5px solid #0f172a; padding-top:8px; min-width:280px;">
          <div style="font-weight:700; font-size:14px; color:#0f172a;">${esc(emissorNome)}</div>
          <div style="font-size:12px; color:#64748b;">${esc(emissorCargo)}</div>
        </div>
      </div>

      <!-- Rodapé Oficial com Autenticação -->
      <div style="position:absolute; bottom:20px; left:44px; right:44px; border-top:1px solid #e2e8f0; padding-top:8px; display:flex; justify-content:space-between; font-size:10px; color:#94a3b8;">
        <div>Documento Oficial emitido pelo Sistema Atlas Saúde</div>
        <div>Código de Autenticidade: VERIFICADO</div>
      </div>
    </div>
  `;
}

async function salvarOficio() {
  const id = document.getElementById('ofi-id').value;
  const ano = parseInt(document.getElementById('ofi-ano').value) || new Date().getFullYear();
  const numero = parseInt(document.getElementById('ofi-numero').value) || DB.proximoNumeroOficio(ano);
  const codigo = document.getElementById('ofi-codigo').value.trim();
  const assunto = document.getElementById('ofi-assunto').value.trim();
  const texto = document.getElementById('ofi-texto').value.trim();

  if (!assunto) return toastMsg('Informe o assunto do ofício.', 'warning');
  if (!texto) return toastMsg('Informe o texto do corpo do ofício.', 'warning');

  const btnSalvar = document.getElementById('btn-salvar-oficio');
  if (btnSalvar) {
    btnSalvar.disabled = true;
    btnSalvar.textContent = '⏳ Salvando...';
  }

  try {
    _oficiosData = DB.oficios();
    let token = '';

    if (id) {
      const antigo = _oficiosData.find(o => o.id === id);
      token = antigo ? antigo.token : gerarTokenOficio();
    } else {
      token = gerarTokenOficio();
    }

    const dests = (_ofiDestinatarios || [])
      .map(d => ({ nome: (d.nome || '').trim(), cargo: (d.cargo || '').trim(), orgao: (d.orgao || '').trim() }))
      .filter(d => d.nome || d.cargo || d.orgao);
    const primeiro = dests[0] || {};

    const dados = {
      id: id || uidOficio(),
      numero,
      ano,
      codigo: codigo || `Ofício nº ${String(numero).padStart(3, '0')}/${ano} - APS`,
      assunto,
      destinatarios: dests,
      destinatario: primeiro.nome || '',
      cargoDestinatario: primeiro.cargo || '',
      orgaoDestinatario: primeiro.orgao || '',
      cidadeData: document.getElementById('ofi-cidade-data').value.trim() || `ITACARAMBI - MG, ${obterDataExtenso()}`,
      texto,
      emissorNome: document.getElementById('ofi-emissor-nome').value.trim(),
      emissorCargo: document.getElementById('ofi-emissor-cargo').value.trim(),
      token,
      criadoEm: new Date().toISOString()
    };

    if (id) {
      const idx = _oficiosData.findIndex(o => o.id === id);
      if (idx >= 0) _oficiosData[idx] = dados;
    } else {
      _oficiosData.push(dados);
    }

    await DB.saveOficios(_oficiosData);
    toastMsg('Ofício emitido e salvo com sucesso!', 'success');
    renderHistoricoOficios();

    // Copiar link público automaticamente após emissão
    const linkPublico = `${window.location.origin}${window.location.pathname}?oficio=${token}`;
    document.getElementById('ofi-id').value = dados.id;

    // Oferecer opções de link
    const actionBox = document.getElementById('ofi-link-action-box');
    if (actionBox) {
      document.getElementById('ofi-link-input-display').value = linkPublico;
      actionBox.style.display = 'flex';
    }

  } catch (err) {
    console.error("Erro ao salvar ofício:", err);
    toastMsg('Erro ao salvar ofício: ' + err.message, 'error');
  } finally {
    if (btnSalvar) {
      btnSalvar.disabled = false;
      btnSalvar.textContent = '💾 Salvar & Emitir Ofício';
    }
  }
}

function copiarLinkOficio(token) {
  const tok = token || (_oficiosData.find(o => o.id === document.getElementById('ofi-id').value)?.token);
  if (!tok) return toastMsg('Nenhum ofício selecionado para compartilhar.', 'warning');

  const url = `${window.location.origin}${window.location.pathname}?oficio=${tok}`;
  navigator.clipboard.writeText(url).then(() => {
    toastMsg('🔗 Link público copiado para a área de transferência!', 'success');
  }).catch(() => {
    const input = document.getElementById('ofi-link-input-display');
    if (input) {
      input.value = url;
      input.select();
      document.execCommand('copy');
      toastMsg('🔗 Link público copiado!', 'success');
    }
  });
}

function imprimirOficioAtual() {
  const container = document.getElementById('ofi-preview-container');
  if (!container || !container.innerHTML) return toastMsg('Preencha o ofício para imprimir.', 'warning');

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Impressão de Ofício Oficial</title>
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Sora', sans-serif; background: #fff; margin: 0; padding: 20px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:right; margin-bottom:15px;">
    <button onclick="window.print()" style="padding:10px 20px; background:#2563eb; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">🖨️ Imprimir Ofício</button>
  </div>
  ${container.innerHTML}
</body>
</html>`);
  win.document.close();
}

function renderHistoricoOficios() {
  _oficiosData = DB.oficios();
  const container = document.getElementById('lista-oficios');
  if (!container) return;

  const busca = (document.getElementById('ofi-busca')?.value || '').toLowerCase().trim();
  let lista = _oficiosData;

  const destsNomes = (o) => (o.destinatarios && o.destinatarios.length
    ? o.destinatarios.map(d => d.nome).filter(Boolean).join('; ')
    : (o.destinatario || ''));

  if (busca) {
    lista = lista.filter(o =>
      (o.codigo || '').toLowerCase().includes(busca) ||
      (o.assunto || '').toLowerCase().includes(busca) ||
      destsNomes(o).toLowerCase().includes(busca) ||
      (o.emissorNome || '').toLowerCase().includes(busca)
    );
  }

  lista.sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0));

  if (lista.length === 0) {
    container.innerHTML = '<div class="empty"><div class="icon">📜</div><p>Nenhum ofício emitido ainda.</p></div>';
    return;
  }

  container.innerHTML = lista.map(o => `
    <div class="ev-list-item completo" style="margin-bottom:10px">
      <div class="ev-list-header">
        <div style="flex:1; min-width:0;">
          <div class="ev-list-nome" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span>📜 ${esc(o.codigo)}</span>
            <span class="tag tag-purple">${esc(o.assunto)}</span>
          </div>
          <div class="ev-list-meta" style="margin-top:4px; font-size:0.75rem;">
            <span>👤 <strong>Destinatário:</strong> ${esc(destsNomes(o) || '-')}</span>
            <span>✍️ <strong>Emissor:</strong> ${esc(o.emissorNome || '-')}</span>
            <span>📅 ${o.criadoEm ? new Date(o.criadoEm).toLocaleDateString('pt-BR') : '-'}</span>
          </div>
        </div>
        <div class="ev-list-actions" style="display:flex; gap:6px;">
          <button class="btn btn-ghost btn-sm" onclick="copiarLinkOficio('${o.token}')" title="Copiar Link Público">🔗 Link</button>
          <button class="btn btn-ghost btn-sm" onclick="carregarOficioParaEditar('${o.id}')" title="Editar Ofício">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="excluirOficio('${o.id}')" title="Excluir Ofício">🗑️</button>
        </div>
      </div>
    </div>
  `).join('');
}

function carregarOficioParaEditar(id) {
  const o = _oficiosData.find(x => x.id === id);
  if (!o) return;

  document.getElementById('ofi-id').value = o.id;
  document.getElementById('ofi-ano').value = o.ano || new Date().getFullYear();
  document.getElementById('ofi-numero').value = o.numero || 1;
  document.getElementById('ofi-codigo').value = o.codigo || '';
  document.getElementById('ofi-assunto').value = o.assunto || '';
  document.getElementById('ofi-cidade-data').value = o.cidadeData || '';
  document.getElementById('ofi-texto').value = o.texto || '';
  document.getElementById('ofi-emissor-nome').value = o.emissorNome || '';
  document.getElementById('ofi-emissor-cargo').value = o.emissorCargo || '';

  if (Array.isArray(o.destinatarios) && o.destinatarios.length) {
    _ofiDestinatarios = o.destinatarios.map(d => ({ nome: d.nome || '', cargo: d.cargo || '', orgao: d.orgao || '' }));
  } else if (o.destinatario || o.cargoDestinatario || o.orgaoDestinatario) {
    _ofiDestinatarios = [{ nome: o.destinatario || '', cargo: o.cargoDestinatario || '', orgao: o.orgaoDestinatario || '' }];
  } else {
    _ofiDestinatarios = [];
  }

  const titleEl = document.getElementById('ofi-form-title');
  if (titleEl) titleEl.textContent = 'Editar Ofício - ' + o.codigo;

  renderDestinatariosSelecionadosOficio();
  atualizarPreviewOficio();
  const cardForm = document.getElementById('card-form-oficio');
  if (cardForm) cardForm.scrollIntoView({ behavior: 'smooth' });
}

async function excluirOficio(id) {
  const o = _oficiosData.find(x => x.id === id);
  if (!confirm(`Deseja realmente excluir o ${o ? o.codigo : 'ofício'}?`)) return;

  _oficiosData = _oficiosData.filter(x => x.id !== id);
  await DB.deleteOficio(id);
  renderHistoricoOficios();
  toastMsg('Ofício excluído com sucesso.', 'info');
}

// ===================== PÁGINA PÚBLICA DE OFÍCIO (SEM LOGIN) =====================
async function renderOficioPublico(token) {
  const appContainer = document.querySelector('.app-container');
  const loginScreen = document.getElementById('login-screen');
  if (appContainer) appContainer.style.display = 'none';
  if (loginScreen) loginScreen.style.display = 'none';

  // Buscar ofício no Supabase ou local
  let oficio = DB.oficios().find(o => o.token === token);

  if (!oficio) {
    try {
      const { data } = await supabaseClient.from('oficios').select('*').eq('token', token).single();
      if (data) oficio = normalizarCamposObjeto(data);
    } catch (e) { console.warn("Erro ao buscar ofício público:", e); }
  }

  if (!oficio) {
    document.body.innerHTML = `
      <div style="min-height:100vh; background:#060b14; color:#fff; display:flex; align-items:center; justify-content:center; flex-direction:column; padding:20px; font-family:sans-serif;">
        <div style="font-size:48px; margin-bottom:16px;">📜</div>
        <h2 style="font-size:22px; margin-bottom:8px;">Ofício não encontrado ou inválido</h2>
        <p style="color:#94a3b8; font-size:14px; margin-bottom:24px;">O documento solicitado não foi localizado no sistema.</p>
        <a href="index.html.html" style="padding:10px 20px; background:#3b82f6; color:#fff; text-decoration:none; border-radius:8px; font-weight:bold;">Acessar o Sistema Atlas Saúde</a>
      </div>
    `;
    return;
  }

  const cfg = DB.config();
  const logoSide = (typeof getImg === 'function' ? getImg('side') : null) || localStorage.getItem('srv_img_side') || '';
  const logoEsq = logoSide || (typeof getImg === 'function' ? getImg('esq') : null) || localStorage.getItem('srv_img_esq') || '';
  const logoDir = (typeof getImg === 'function' ? getImg('dir') : null) || localStorage.getItem('srv_img_dir') || '';
  const logoPrint = (typeof getImg === 'function' ? getImg('print') : null) || localStorage.getItem('srv_img_print') || '';

  const orgNome = cfg.nomeOrganizacao || 'Coordenação da Atenção Primária à Saúde';
  const subTitle = cfg.subtituloSidebar || 'Gestão de RH & Administração';

  const paragrafosHtml = (oficio.texto || '').split('\n').filter(p => p.trim()).map(p =>
    `<p style="text-align:justify; text-indent:2.5em; margin-bottom:14px; line-height:1.7; font-size:15px;">${esc(p)}</p>`
  ).join('');

  const dests = (Array.isArray(oficio.destinatarios) && oficio.destinatarios.length)
    ? oficio.destinatarios
    : ((oficio.destinatario || oficio.cargoDestinatario || oficio.orgaoDestinatario) ? [{ nome: oficio.destinatario, cargo: oficio.cargoDestinatario, orgao: oficio.orgaoDestinatario }] : []);
  const destsHtml = dests.length ? dests.map(d => `
    <div style="margin-bottom:12px;">
      <div><strong>${esc(d.nome || '')}</strong></div>
      ${d.cargo ? `<div>${esc(d.cargo)}</div>` : ''}
      ${d.orgao ? `<div style="color:#475569;">${esc(d.orgao)}</div>` : ''}
    </div>
  `).join('') : '';

  const logoEsqHtml = logoEsq ? `<img src="${logoEsq}" style="max-height:65px; max-width:150px; object-fit:contain;">` : '<div style="font-size:28px;">🏛️</div>';
  const logoDirHtml = logoDir ? `<img src="${logoDir}" style="max-height:65px; max-width:150px; object-fit:contain;">` : (logoPrint ? `<img src="${logoPrint}" style="max-height:65px; max-width:150px; object-fit:contain;">` : '<div style="font-size:28px;">🌴</div>');

  document.body.innerHTML = `
    <div style="min-height:100vh; background:#0f172a; padding:30px 15px; font-family:'Sora', sans-serif; display:flex; flex-direction:column; align-items:center;">
      
      <!-- Top Action Bar -->
      <div style="width:100%; max-width:800px; display:flex; justify-space-between; align-items:center; margin-bottom:20px; color:#fff;" class="no-print">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:20px;">📜</span>
          <div>
            <div style="font-weight:700; font-size:15px;">Documento Oficial Autêntico</div>
            <div style="font-size:12px; color:#94a3b8;">Atlas Saúde · Validação de Autenticidade</div>
          </div>
        </div>
        <button onclick="window.print()" style="padding:10px 18px; background:#3b82f6; color:#fff; border:none; border-radius:8px; font-weight:700; cursor:pointer; font-family:'Sora', sans-serif;">🖨️ Imprimir / Salvar PDF</button>
      </div>

      <!-- Printable A4 Document Sheet -->
      <div style="background:#fff; color:#111; width:100%; max-width:800px; padding:60px 50px; border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,0.5); min-height:950px; position:relative;">
        
        <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:2.5px solid #1e293b; padding-bottom:16px; margin-bottom:30px;">
          <div style="width:150px; text-align:left;">${logoEsqHtml}</div>
          <div style="text-align:center; flex:1; padding:0 15px;">
            ${oficioHeaderHtml(2)}
          </div>
          <div style="width:150px; text-align:right;">${logoDirHtml}</div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:30px;">
          <div style="font-weight:800; font-size:15px; color:#0f172a;">${esc(oficio.codigo)}</div>
          <div style="font-size:13.5px; color:#334155; font-weight:600;">${esc(oficio.cidadeData)}</div>
        </div>

        <div style="margin-bottom:28px; line-height:1.6; font-size:14px; color:#1e293b;">
          ${destsHtml}
        </div>

        <div style="margin-bottom:32px; background:#f1f5f9; padding:12px 16px; border-left:4px solid #2563eb; font-size:14px; border-radius:0 6px 6px 0;">
          <strong>Assunto:</strong> ${esc(oficio.assunto || '')}
        </div>

        <div style="min-height:300px; color:#0f172a;">
          ${paragrafosHtml}
        </div>

        <div style="margin-top:60px; text-align:center;">
          <div style="margin-bottom:50px; font-size:14px; color:#334155;">Atenciosamente,</div>
          <div style="display:inline-block; border-top:1.5px solid #0f172a; padding-top:8px; min-width:300px;">
            <div style="font-weight:800; font-size:14.5px; color:#0f172a;">${esc(oficio.emissorNome || '')}</div>
            <div style="font-size:12.5px; color:#64748b;">${esc(oficio.emissorCargo || '')}</div>
          </div>
        </div>

        <div style="position:absolute; bottom:25px; left:50px; right:50px; border-top:1px solid #cbd5e1; padding-top:10px; display:flex; justify-content:space-between; font-size:10.5px; color:#64748b;">
          <div>Documento Oficial · emitido em ${oficio.criadoEm ? new Date(oficio.criadoEm).toLocaleDateString('pt-BR') : '-'}</div>
          <div>Autenticidade Verificada pela Coordenação APS</div>
        </div>

      </div>
    </div>
  `;
}
