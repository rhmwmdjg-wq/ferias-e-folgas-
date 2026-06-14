// Módulo Eventos e Veículos.
// Cadastros, escalas, conflitos e badges.

// ===================== EVENTOS & VEÍCULOS MODULE =====================
// Categorias profissionais padrão
const CATEGORIAS_PROFISSIONAIS = [
  'Médico', 'Enfermeiro', 'Técnico de Enfermagem', 'Dentista',
  'Técnico em Saúde Bucal', 'Fisioterapeuta', 'Psicólogo',
  'Assistente Social', 'Farmacêutico', 'Nutricionista',
  'Agente Comunitário de Saúde', 'Agente de Combate às Endemias',
  'Motorista', 'Condutor de Ambulância', 'Vigilante',
  'Administrativo', 'Recepcionista', 'Auxiliar de Serviços Gerais',
  'Coordenador', 'Outro'
];

// ---- DATA STORAGE ----
let _eventosData = JSON.parse(localStorage.getItem('srv_eventos') || '[]');
let _veiculosData = JSON.parse(localStorage.getItem('srv_veiculos') || '[]');

function salvarEventosStorage() {
  DB.saveEventos(_eventosData);
}
function salvarVeiculosStorage() {
  DB.saveVeiculos(_veiculosData);
}

// ---- VEÍCULOS (painel independente) ----
function renderVeiculos() {
  const container = document.getElementById('lista-veiculos');
  if (!container) return;
  if (_veiculosData.length === 0) {
    container.innerHTML = '<div class="empty"><div class="icon">🚗</div><p>Nenhum veículo cadastrado.</p></div>';
    return;
  }
  container.innerHTML = _veiculosData.map(v => `
    <div class="ev-list-item completo">
      <div class="ev-list-header">
        <div>
          <div class="ev-list-nome">🚗 ${esc(v.nome)}</div>
          <div class="ev-list-meta">${esc(v.placa||'-')} · ${esc(v.modelo||'-')} · ${esc(v.cor||'-')}</div>
          ${v.obs ? `<div style="font-size:0.75rem;color:var(--muted);margin-top:4px">${esc(v.obs)}</div>` : ''}
        </div>
        <div class="ev-list-actions">
          <button class="btn btn-ghost btn-sm" onclick="editarVeiculo('${v.id}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="excluirVeiculo('${v.id}')">🗑️</button>
        </div>
      </div>
    </div>
  `).join('');
}

function salvarVeiculo() {
  const id = document.getElementById('veic-id').value;
  const nome = document.getElementById('veic-nome').value.trim();
  if (!nome) return toastMsg('Informe o nome do veículo.', 'warning');

  const dados = {
    nome,
    placa: document.getElementById('veic-placa').value.trim(),
    modelo: document.getElementById('veic-modelo').value.trim(),
    cor: document.getElementById('veic-cor').value.trim(),
    obs: document.getElementById('veic-obs').value.trim(),
    criadoEm: new Date().toISOString()
  };

  if (id) {
    const idx = _veiculosData.findIndex(v => v.id === id);
    if (idx >= 0) { _veiculosData[idx] = { ..._veiculosData[idx], ...dados }; }
    toastMsg('Veículo atualizado!', 'success');
  } else {
    dados.id = uid();
    _veiculosData.push(dados);
    toastMsg('Veículo cadastrado!', 'success');
  }
  salvarVeiculosStorage();
  limparFormVeiculo();
  renderVeiculos();
  popularSelectVeiculos('ev-veiculo');
  if (document.getElementById('ev-sub-veiculos')?.style.display !== 'none') renderVeiculosSub();
}

function editarVeiculo(id) {
  const v = _veiculosData.find(v => v.id === id);
  if (!v) return;
  document.getElementById('veic-id').value = v.id;
  document.getElementById('veic-nome').value = v.nome;
  document.getElementById('veic-placa').value = v.placa || '';
  document.getElementById('veic-modelo').value = v.modelo || '';
  document.getElementById('veic-cor').value = v.cor || '';
  document.getElementById('veic-obs').value = v.obs || '';
  document.getElementById('panel-veiculos').scrollIntoView({ behavior: 'smooth' });
}

async function excluirVeiculo(id) {
  if (!confirm('Excluir este veículo permanentemente?')) return;
  _veiculosData = _veiculosData.filter(v => v.id !== id);
  salvarVeiculosStorage();
  await DB.deleteVeiculo(id);
  renderVeiculos();
  popularSelectVeiculos('ev-veiculo');
  if (document.getElementById('ev-sub-veiculos')?.style.display !== 'none') renderVeiculosSub();
}

function limparFormVeiculo() {
  document.getElementById('veic-id').value = '';
  document.getElementById('veic-nome').value = '';
  document.getElementById('veic-placa').value = '';
  document.getElementById('veic-modelo').value = '';
  document.getElementById('veic-cor').value = '';
  document.getElementById('veic-obs').value = '';
}

function popularSelectVeiculos(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">Nenhum</option>' +
    _veiculosData.map(v => `<option value="${v.id}">${esc(v.nome)}${v.placa ? ' ('+esc(v.placa)+')' : ''}</option>`).join('');
  if (atual) sel.value = atual;
}

// ---- VEÍCULOS (sub-painel dentro de Eventos) ----
function renderVeiculosSub() {
  const container = document.getElementById('ev-sub-lista-veiculos');
  if (!container) return;
  renderVeiculosNoContainer(container);
}

function renderVeiculosNoContainer(container) {
  if (_veiculosData.length === 0) {
    container.innerHTML = '<div class="empty"><div class="icon">🚗</div><p>Nenhum veículo.</p></div>';
    return;
  }
  container.innerHTML = _veiculosData.map(v => `
    <div class="ev-list-item completo" style="cursor:default">
      <div class="ev-list-header">
        <div>
          <div class="ev-list-nome">🚗 ${esc(v.nome)}</div>
          <div class="ev-list-meta">${esc(v.placa||'-')} · ${esc(v.modelo||'-')} · ${esc(v.cor||'-')}</div>
        </div>
        <div class="ev-list-actions">
          <button class="btn btn-danger btn-sm" onclick="excluirVeiculoSub('${v.id}')">🗑️</button>
        </div>
      </div>
    </div>
  `).join('');
}

function salvarVeiculoEv() {
  const nome = document.getElementById('ev-veic-nome').value.trim();
  if (!nome) return toastMsg('Informe o nome do veículo.', 'warning');
  const dados = {
    id: uid(),
    nome,
    placa: document.getElementById('ev-veic-placa').value.trim(),
    modelo: document.getElementById('ev-veic-modelo').value.trim(),
    cor: document.getElementById('ev-veic-cor').value.trim(),
    obs: document.getElementById('ev-veic-obs').value.trim(),
    criadoEm: new Date().toISOString()
  };
  _veiculosData.push(dados);
  salvarVeiculosStorage();
  limparFormVeiculoEv();
  renderVeiculosSub();
  popularSelectVeiculos('ev-veiculo');
  toastMsg('Veículo cadastrado!', 'success');
}

async function excluirVeiculoSub(id) {
  if (!confirm('Excluir este veículo permanentemente?')) return;
  _veiculosData = _veiculosData.filter(v => v.id !== id);
  salvarVeiculosStorage();
  await DB.deleteVeiculo(id);
  renderVeiculosSub();
  popularSelectVeiculos('ev-veiculo');
}

function limparFormVeiculoEv() {
  document.getElementById('ev-veic-nome').value = '';
  document.getElementById('ev-veic-placa').value = '';
  document.getElementById('ev-veic-modelo').value = '';
  document.getElementById('ev-veic-cor').value = '';
  document.getElementById('ev-veic-obs').value = '';
}

// ---- SUBTAB NAVIGATION (dentro do painel Eventos) ----
function toggleEvSubtab(subtab, btn) {
  document.querySelectorAll('#ev-subtabs .ev-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('ev-sub-eventos').style.display = subtab === 'eventos' ? '' : 'none';
  document.getElementById('ev-sub-veiculos').style.display = subtab === 'veiculos' ? '' : 'none';
  if (subtab === 'veiculos') renderVeiculosSub();
  if (subtab === 'eventos') popularSelectVeiculos('ev-veiculo');
}

// ---- EVENTOS ----
let _evCategorias = [{ categoria: '', quantidade: 1 }];

function uid(size = 8) {
  return Math.random().toString(36).substring(2, 2 + size) + Date.now().toString(36);
}

function renderEventos() {
  popularSelectVeiculos('ev-veiculo');
  const container = document.getElementById('lista-eventos');
  if (!container) return;
  const busca = (document.getElementById('ev-busca')?.value || '').toLowerCase();
  const filtroStatus = document.getElementById('ev-filtro-status')?.value || '';

  let lista = _eventosData;
  if (busca) lista = lista.filter(e => e.nome.toLowerCase().includes(busca) || (e.local||'').toLowerCase().includes(busca));
  if (filtroStatus) lista = lista.filter(e => e.status === filtroStatus);
  lista.sort((a, b) => new Date(b.data) - new Date(a.data));

  if (lista.length === 0) {
    container.innerHTML = '<div class="empty"><div class="icon">📅</div><p>Nenhum evento encontrado.</p></div>';
    return;
  }

  const profNomes = {};
  const servList = DB.servidores();
  servList.forEach(s => { profNomes[s.id] = s.nome; });

  container.innerHTML = lista.map(e => {
    const categoriasOk = (e.categoriasNecessarias || []).every(c => {
      const qtd = (c.quantidade || 0);
      const escalados = (e.profissionais || []).filter(p => p.categoria === c.categoria).length;
      return qtd === 0 || escalados >= qtd;
    });
    const status = categoriasOk ? 'completo' : 'incompleto';
    const profsHtml = (e.profissionais || []).map(p =>
      `<span class="tag ${p.tipoPagamento === 'dinheiro' ? 'tag-warn' : 'tag-green'}" style="margin:2px">${esc(profNomes[p.srvId] || '?')} (${esc(p.categoria)})${p.diasFolga ? ' 🌴'+p.diasFolga+'d' : ''}${p.valorHE ? ' 💰'+p.valorHE+'h' : ''}</span>`
    ).join('');

    const veicNome = e.veiculoId ? (_veiculosData.find(v => v.id === e.veiculoId)?.nome || '?') : null;

    return `<div class="ev-list-item ${status}" onclick="editarEvento('${e.id}')">
      <div class="ev-list-header">
        <div>
          <div class="ev-list-nome">${status === 'completo' ? '✅' : '🔴'} ${esc(e.nome)}</div>
          <div class="ev-list-meta">
            <span>📅 ${e.data}</span>
            <span>⏰ ${e.hrInicio} - ${e.hrTermino}</span>
            ${e.local ? `<span>📍 ${esc(e.local)}</span>` : ''}
            ${veicNome ? `<span>🚗 ${esc(veicNome)}</span>` : ''}
          </div>
          ${profsHtml ? `<div style="margin-top:6px">${profsHtml}</div>` : ''}
          ${!categoriasOk ? `<div class="ev-list-faltam">⚠️ Faltam profissionais em alguma categoria</div>` : ''}
        </div>
        <div class="ev-list-actions">
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();imprimirEvento('${e.id}')">🖨️</button>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();excluirEvento('${e.id}')">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function addCategoriaRow(cat, qtd) {
  const container = document.getElementById('ev-categorias-container');
  const div = document.createElement('div');
  div.className = 'ev-cat-row';
  const idx = container.children.length;
  div.innerHTML = `
    <select id="ev-cat-${idx}" onchange="atualizarCategorias()">
      <option value="">Selecione...</option>
      ${CATEGORIAS_PROFISSIONAIS.map(c => `<option value="${c}" ${cat === c ? 'selected' : ''}>${c}</option>`).join('')}
    </select>
    <span style="font-size:0.72rem;color:var(--muted);font-weight:600">Qtd:</span>
    <input type="number" id="ev-cat-qtd-${idx}" min="1" max="99" value="${qtd || 1}" onchange="atualizarCategorias()" style="width:55px">
    <span class="ev-cat-remove" onclick="this.parentElement.remove();atualizarCategorias()">✕</span>
  `;
  container.appendChild(div);
  atualizarCategorias();
}

function atualizarCategorias() {
  const container = document.getElementById('ev-categorias-container');
  const rows = container.querySelectorAll('.ev-cat-row');
  _evCategorias = [];
  rows.forEach(row => {
    const sel = row.querySelector('select');
    const qtd = row.querySelector('input[type=number]');
    if (sel && sel.value) {
      _evCategorias.push({ categoria: sel.value, quantidade: parseInt(qtd?.value || 1) });
    }
  });
  popularSelectCategoriasProf();
  renderProfissionaisEvento();
}

function popularSelectCategoriasProf() {
  const sel = document.getElementById('ev-add-cat');
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">Selecione...</option>' +
    _evCategorias.map(c => `<option value="${c.categoria}">${c.categoria}</option>`).join('');
  if (atual) sel.value = atual;
}

function toggleEvPagtoCampos() {
  const tipo = document.getElementById('ev-add-pagto').value;
  const label = document.getElementById('ev-add-qtd-label');
  const input = document.getElementById('ev-add-qtd');
  if (tipo === 'dinheiro') {
    label.textContent = 'Horas Extras';
    input.placeholder = 'Ex: 4';
    input.step = '0.5';
  } else {
    label.textContent = 'Dias de Folga';
    input.placeholder = '';
    input.step = '0.5';
  }
}

function toggleEvPagtoCamposEdit() {
  const tipo = document.getElementById('eprof-pagto').value;
  const label = document.getElementById('eprof-qtd-label');
  const input = document.getElementById('eprof-qtd');
  if (tipo === 'dinheiro') {
    label.textContent = 'Horas Extras';
    input.placeholder = 'Ex: 4';
    input.step = '0.5';
  } else {
    label.textContent = 'Dias de Folga';
    input.placeholder = '';
    input.step = '0.5';
  }
}

function abrirAddProfissional(categoria) {
  document.getElementById('ev-add-prof-area').style.display = 'block';
  document.getElementById('ev-add-cat').value = categoria || '';
  popularSelectServidoresProf();
  popularSelectCategoriasProf();
  if (categoria) document.getElementById('ev-add-cat').value = categoria;
}

function cancelarAddProfissional() {
  document.getElementById('ev-add-prof-area').style.display = 'none';
}

function popularSelectServidoresProf() {
  const sel = document.getElementById('ev-add-srv');
  if (!sel) return;
  const servidores = DB.servidores();
  const atual = sel.value;
  sel.innerHTML = '<option value="">Selecione...</option>' +
    servidores.map(s => `<option value="${s.id}">${esc(s.nome)} (${esc(s.matricula)})</option>`).join('');
  if (atual) sel.value = atual;
}

function adicionarProfissionalEvento() {
  const srvId = document.getElementById('ev-add-srv').value;
  const categoria = document.getElementById('ev-add-cat').value;
  const tipoPagto = document.getElementById('ev-add-pagto').value;
  const qtd = parseFloat(document.getElementById('ev-add-qtd').value) || 0;

  if (!srvId) return toastMsg('Selecione um profissional.', 'warning');
  if (!categoria) return toastMsg('Selecione a categoria.', 'warning');

  // Verificar se já existe
  if ((_eventoEditingProf || []).some(p => p.srvId === srvId)) {
    return toastMsg('Este profissional já está escalado neste evento.', 'warning');
  }

  // Verificar conflito de data/horário
  const data = document.getElementById('ev-data').value;
  const hrInicio = document.getElementById('ev-hr-inicio').value;
  const hrFim = document.getElementById('ev-hr-fim').value;
  const evId = document.getElementById('ev-id').value;

  if (data && hrInicio && hrFim) {
    const conflito = verificarConflitoProfissional(srvId, data, hrInicio, hrFim, evId);
    if (conflito) {
      return toastMsg(`⚠️ ${conflito}`, 'error');
    }
  }

  const prof = { srvId, categoria, tipoPagamento: tipoPagto };
  if (tipoPagto === 'folga') prof.diasFolga = qtd;
  else prof.valorHE = qtd;

  _eventoEditingProf.push(prof);
  renderProfissionaisEvento();
  cancelarAddProfissional();
}

function removerProfissionalEvento(idx) {
  _eventoEditingProf.splice(idx, 1);
  renderProfissionaisEvento();
}

function editarProfEvento(idx) {
  const p = _eventoEditingProf[idx];
  if (!p) return;
  document.getElementById('eprof-idx').value = idx;
  document.getElementById('eprof-pagto').value = p.tipoPagamento || 'folga';
  document.getElementById('eprof-qtd').value = p.diasFolga || p.valorHE || 1;
  toggleEvPagtoCamposEdit();
  document.getElementById('modal-editar-prof-event').classList.add('open');
}

function salvarEdicaoProfEvento() {
  const idx = parseInt(document.getElementById('eprof-idx').value);
  const p = _eventoEditingProf[idx];
  if (!p) return;
  const tipo = document.getElementById('eprof-pagto').value;
  const qtd = parseFloat(document.getElementById('eprof-qtd').value) || 0;
  p.tipoPagamento = tipo;
  if (tipo === 'folga') { p.diasFolga = qtd; delete p.valorHE; }
  else { p.valorHE = qtd; delete p.diasFolga; }
  _eventoEditingProf[idx] = p;
  renderProfissionaisEvento();
  fecharModal('modal-editar-prof-event');
  toastMsg('Profissional atualizado!', 'success');
}

let _eventoEditingProf = [];

function renderProfissionaisEvento() {
  const container = document.getElementById('ev-profissionais-lista');
  if (!container) return;
  const servidores = DB.servidores();
  const srvMap = {};
  servidores.forEach(s => { srvMap[s.id] = s; });

  // Verificar categorias incompletas
  const catCount = {};
  _eventoEditingProf.forEach(p => {
    catCount[p.categoria] = (catCount[p.categoria] || 0) + 1;
  });
  const catNeeded = {};
  _evCategorias.forEach(c => { catNeeded[c.categoria] = c.quantidade; });

  if (_eventoEditingProf.length === 0) {
    container.innerHTML = '<div class="empty" style="padding:12px"><p>Nenhum profissional escalado ainda.</p></div>';
  } else {
    container.innerHTML = _eventoEditingProf.map((p, i) => {
      const srv = srvMap[p.srvId];
      const nome = srv ? srv.nome : '?';
      const setor = srv ? (srv.setor || '') : '';
      const needed = catNeeded[p.categoria] || 0;
      const actual = catCount[p.categoria] || 0;
      const ok = actual >= needed;
    const pagtoInfo = p.tipoPagamento === 'dinheiro'
      ? (p.valorHE ? `💰 ${p.valorHE}h extra` : '💰 Voluntário')
      : (p.diasFolga ? `🌴 ${p.diasFolga} dias de folga` : '🌴 Voluntário');
      return `<div class="ev-prof-item" style="${!ok ? 'border-left:3px solid var(--danger)' : ''}">
        <div class="ev-prof-info">
          <div class="ev-prof-nome">${esc(nome)}</div>
          <div class="ev-prof-cat">${esc(p.categoria)} ${setor ? '· '+esc(setor) : ''} · ${pagtoInfo}</div>
        </div>
        <span class="ev-prof-remove" onclick="editarProfEvento(${i})" title="Editar">✏️</span>
        <span class="ev-prof-remove" onclick="removerProfissionalEvento(${i})" title="Remover">✕</span>
      </div>`;
    }).join('');
  }

  // Botão "Adicionar Profissional" para cada categoria (sempre mostra se precisar)
  const addBtns = _evCategorias.map(c => {
    const actual = catCount[c.categoria] || 0;
    const needed = c.quantidade;
    if (actual >= needed) return '';
    return `<button class="btn btn-ghost btn-sm" onclick="abrirAddProfissional('${c.categoria}')" style="margin-top:4px;margin-right:6px">
      ➕ ${c.categoria} (${actual}/${needed})
    </button>`;
  }).filter(Boolean).join('');

  if (addBtns) {
    container.innerHTML += `<div style="margin-top:8px">${addBtns}</div>`;
  }
}

function verificarConflitoProfissional(srvId, data, hrInicio, hrFim, evIdIgnore) {
  const eventos = _eventosData.filter(e => e.id !== evIdIgnore && e.data === data);
  for (const e of eventos) {
    if (!e.hrInicio || !e.hrTermino) continue;
    // Conflito se horários se sobrepõem
    if (hrInicio < e.hrTermino && hrFim > e.hrInicio) {
      if ((e.profissionais || []).some(p => p.srvId === srvId)) {
        const srv = DB.servidores().find(s => s.id === srvId);
        return `"${srv ? srv.nome : '?'}" já está escalado em "${e.nome}" neste mesmo dia/horário.`;
      }
    }
  }
  return null;
}

function creditarFolgaAutomatica(srvId, dias, eventoNome) {
  if (!dias || dias <= 0) return;
  const folga = {
    id: uid(),
    srvId,
    tipo: 'credito',
    data: new Date().toISOString().split('T')[0],
    qtd: dias,
    motivo: `Evento: ${eventoNome}`,
    criadoEm: new Date().toISOString()
  };
  const folgas = DB.folgas();
  folgas.push(folga);
  DB.saveFolgas(folgas, [folga]);
}

function salvarEvento() {
  const id = document.getElementById('ev-id').value;
  const nome = document.getElementById('ev-nome').value.trim();
  const data = document.getElementById('ev-data').value;
  const hrInicio = document.getElementById('ev-hr-inicio').value;
  const hrFim = document.getElementById('ev-hr-fim').value;

  if (!nome) return toastMsg('Informe o nome do evento.', 'warning');
  if (!data) return toastMsg('Informe a data do evento.', 'warning');
  if (!hrInicio) return toastMsg('Informe o horário de início.', 'warning');
  if (!hrFim) return toastMsg('Informe o horário de término.', 'warning');

  // Verificar categorias
  const categorias = _evCategorias.filter(c => c.categoria && c.quantidade > 0);
  if (categorias.length === 0) return toastMsg('Adicione ao menos uma categoria de profissional.', 'warning');

  // Verificar se há profissionais para todas as categorias necessárias
  const profCount = {};
  _eventoEditingProf.forEach(p => {
    profCount[p.categoria] = (profCount[p.categoria] || 0) + 1;
  });
  const catFaltando = categorias.filter(c => (profCount[c.categoria] || 0) < c.quantidade);
  const status = catFaltando.length === 0 ? 'completo' : 'incompleto';

  // Verificar conflitos
  for (const p of _eventoEditingProf) {
    const conflito = verificarConflitoProfissional(p.srvId, data, hrInicio, hrFim, id);
    if (conflito) return toastMsg(conflito, 'error');
  }

  const dados = {
    nome,
    data,
    hrInicio,
    hrFim,
    local: document.getElementById('ev-local').value.trim(),
    descricao: document.getElementById('ev-desc').value.trim(),
    categoriasNecessarias: categorias,
    profissionais: _eventoEditingProf,
    veiculoId: document.getElementById('ev-veiculo').value || null,
    status,
    criadoEm: new Date().toISOString()
  };

  if (id) {
    const eventoAntigo = _eventoEditingProf || [];
    const idx = _eventosData.findIndex(e => e.id === id);
    if (idx >= 0) {
      _eventosData[idx] = { ..._eventosData[idx], ...dados };
      toastMsg('Evento atualizado!', 'success');
    }
  } else {
    dados.id = uid();
    // Creditar folgas automaticamente
    _eventoEditingProf.forEach(p => {
      if (p.tipoPagamento === 'folga' && p.diasFolga) {
        creditarFolgaAutomatica(p.srvId, p.diasFolga, nome);
      }
    });
    _eventosData.push(dados);
    toastMsg('Evento cadastrado!', 'success');
  }
  salvarEventosStorage();
  limparFormEvento();
  renderEventos();
  atualizarBadgeEventos();
}

function editarEvento(id) {
  const e = _eventosData.find(e => e.id === id);
  if (!e) return;
  document.getElementById('ev-id').value = e.id;
  document.getElementById('ev-nome').value = e.nome;
  document.getElementById('ev-data').value = e.data;
  document.getElementById('ev-hr-inicio').value = e.hrInicio;
  document.getElementById('ev-hr-fim').value = e.hrFim;
  document.getElementById('ev-local').value = e.local || '';
  document.getElementById('ev-desc').value = e.descricao || '';
  if (e.veiculoId) document.getElementById('ev-veiculo').value = e.veiculoId;

  document.getElementById('ev-form-title').textContent = 'Editar Evento';
  document.getElementById('ev-btn-imprimir').style.display = 'inline-flex';

  // Carregar categorias
  const container = document.getElementById('ev-categorias-container');
  container.innerHTML = '';
  (e.categoriasNecessarias || []).forEach(c => addCategoriaRow(c.categoria, c.quantidade));

  // Carregar profissionais
  _eventoEditingProf = JSON.parse(JSON.stringify(e.profissionais || []));
  renderProfissionaisEvento();

  // Scroll para o formulário
  document.getElementById('panel-eventos').scrollIntoView({ behavior: 'smooth' });
}

async function excluirEvento(id) {
  if (!confirm('Excluir este evento permanentemente?')) return;
  _eventosData = _eventosData.filter(e => e.id !== id);
  salvarEventosStorage();
  await DB.deleteEvento(id);
  renderEventos();
  atualizarBadgeEventos();
  toastMsg('Evento excluído permanentemente.', 'info');
}

function limparFormEvento() {
  document.getElementById('ev-id').value = '';
  document.getElementById('ev-nome').value = '';
  document.getElementById('ev-data').value = '';
  document.getElementById('ev-hr-inicio').value = '';
  document.getElementById('ev-hr-fim').value = '';
  document.getElementById('ev-local').value = '';
  document.getElementById('ev-desc').value = '';
  document.getElementById('ev-veiculo').value = '';
  document.getElementById('ev-form-title').textContent = 'Novo Evento';
  document.getElementById('ev-btn-imprimir').style.display = 'none';
  document.getElementById('ev-categorias-container').innerHTML = '';
  _evCategorias = [];
  _eventoEditingProf = [];
  renderProfissionaisEvento();
  // Adicionar uma linha de categoria vazia
  addCategoriaRow();
}

function atualizarBadgeEventos() {
  const incompletos = _eventosData.filter(e => e.status === 'incompleto').length;
  const badge = document.getElementById('badge-eventos');
  if (badge) {
    badge.textContent = incompletos;
    badge.style.display = incompletos > 0 ? 'inline-flex' : 'none';
    badge.style.background = incompletos > 0 ? 'var(--danger)' : 'var(--accent)';
  }
}
