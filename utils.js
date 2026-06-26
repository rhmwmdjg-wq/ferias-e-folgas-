// Módulo Utilitários.
// Funções auxiliares, filtragem, navegação e seletores globais.

function diffDays(d) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dt = new Date(d + 'T00:00:00');
  return Math.round((dt - hoje) / 86400000);
}

function showTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + tab).classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
  if (document.getElementById('busca-servidor')) document.getElementById('busca-servidor').value = '';
  if (document.getElementById('filtro-setor')) document.getElementById('filtro-setor').value = '';
  if (tab === 'alertas') renderDashboard();
  if (tab === 'servidores') { renderTabela(); atualizarSelectsSetores(); }
  if (tab === 'config') renderConfig();
  if (tab === 'gestores') renderGestores(), popularSetoresGestor();
  if (tab === 'ferias') renderProgramacoes(), popularSelectServidor();
  if (tab === 'calendario') iniciarCalendario();
  if (tab === 'relatorio') renderRelatorio(), popularSelectRelatorio();
  if (tab === 'presenca') atualizarSelectsSetores();
  if (tab === 'aniversariantes') renderAniversariantes();
  if (tab === 'mapaausencias') iniciarMapaAusencias();
  if (tab === 'folgas') { renderFolgas(); if (!fpGozo) initFlatpickrFolga(); }
  if (tab === 'solicitacoes') renderSolicitacoes();
  if (tab === 'autorizacoes') renderAutorizacoes();
  if (tab === 'auditoria') renderAuditoria();
  if (tab === 'coberturas') renderCoberturas();
  if (tab === 'bancohoras') renderBancoHoras();
  if (tab === 'eventos') { _eventosData = DB.eventos(); _veiculosData = DB.veiculos(); renderEventos(); popularSelectVeiculos('ev-veiculo'); }
  if (tab === 'veiculos') { _veiculosData = DB.veiculos(); renderVeiculos(); }
  if (tab === 'ponto') { renderPtSubtab('cargos'); renderCredenciados(); renderFechamentos(); }
  if (tab === 'protocolo') { renderProtocolos(); }
  currentPage = 1;
}

function sairSistema() {
  if (confirm('Deseja realmente sair do sistema?')) {
    teardownRealtime();
    sessionStorage.removeItem('ferias_sessao');
    verificarSessao();
  }
}

function getServidoresAcessiveis() {
  const sessaoStr = sessionStorage.getItem('ferias_sessao');
  if (!sessaoStr) return [];
  const sessao = JSON.parse(sessaoStr);
  const servidores = DB.servidores();
  if (sessao.role === 'admin') return servidores;
  if (sessao.role === 'gestor' && sessao.setores && sessao.setores.length) {
    return servidores.filter(s => sessao.setores.includes(s.setor));
  }
  return servidores;
}

function getProgramacoesAcessiveis() {
  const sessaoStr = sessionStorage.getItem('ferias_sessao');
  if (!sessaoStr) return [];
  const sessao = JSON.parse(sessaoStr);
  const programacoes = DB.programacoes();
  if (sessao.role === 'admin') return programacoes;
  if (sessao.role === 'gestor') {
    const srvIds = new Set(getServidoresAcessiveis().map(s => s.id));
    return programacoes.filter(p => srvIds.has(p.srvId));
  }
  return programacoes;
}

function getFolgasAcessiveis() {
  const sessaoStr = sessionStorage.getItem('ferias_sessao');
  if (!sessaoStr) return [];
  const sessao = JSON.parse(sessaoStr);
  const folgas = DB.folgas();
  if (sessao.role === 'admin') return folgas;
  if (sessao.role === 'gestor') {
    const srvIds = new Set(getServidoresAcessiveis().map(s => s.id));
    return folgas.filter(f => srvIds.has(f.srvId));
  }
  return folgas;
}

function renderPaginacao(containerId, total, callback) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (total <= 1) { el.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= total; i++) {
    html += '<button class="btn btn-ghost btn-sm ' + (i === currentPage ? 'active' : '') + '" onclick="currentPage=' + i + ';' + callback + '()">' + i + '</button>';
  }
  el.innerHTML = html;
}

function getAvatarHtml(foto, nome, size, extraStyle, extraAttr) {
  const sz = size || 50;
  if (foto && foto.length > 100) {
    return '<img src="' + foto + '" alt="' + esc(nome) + '" style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;object-fit:cover;' + (extraStyle||'') + '" ' + (extraAttr||'') + '>';
  }
  const inicial = (nome || '?').charAt(0).toUpperCase();
  return '<div style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;background:var(--bg-accent);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:' + Math.round(sz*0.4) + 'px;color:var(--primary);' + (extraStyle||'') + '" ' + (extraAttr||'') + '>' + inicial + '</div>';
}

function addDays(dataStr, dias) {
  if (!dataStr) return '';
  const dt = new Date(dataStr + 'T12:00:00');
  if (isNaN(dt.getTime())) return dataStr;
  dt.setDate(dt.getDate() + dias);
  return dt.toISOString().split('T')[0];
}

function popularSelectFerias(setor) {
  const sel = document.getElementById('fp-servidor'); if (!sel) return;
  const lista = getServidoresAcessiveis().filter(s => !setor || s.setor === setor);
  sel.innerHTML = '<option value="">Selecione...</option>' + lista.map(s => `<option value="${s.id}">${s.nome} (Mat. ${s.matricula})</option>`).join('');
}

function getTodosSetores() {
  const cfg = DB.config();
  const configSetores = cfg.setores || [];
  const servSetores = DB.servidores().map(function(s) { return s.setor; }).filter(Boolean);
  const todos = [...new Set(configSetores.concat(servSetores))];
  todos.sort(function(a, b) { return a.localeCompare(b); });
  return todos;
}

function atualizarSelectsSetores() {
  let setores = getTodosSetores();
  
  // Se for gestor, filtra os setores permitidos
  const sessaoStr = sessionStorage.getItem('ferias_sessao');
  if (sessaoStr) {
    const sessao = JSON.parse(sessaoStr);
    if (sessao.role === 'gestor') {
      const permitidos = sessao.setores || [];
      setores = setores.filter(s => permitidos.includes(s));
    }
  }
  
  const selectIds = ['f-setor', 'edit-setor', 'filtro-setor', 'filtro-setor-rel', 'rel-srv-setor', 'fp-filtro-setor', 'fg-filtro-setor-cred', 'fg-filtro-setor-deb', 'cb-setor', 'bh-filtro-setor', 'bh-saldo-setor', 'bh-ajuste-setor', 'fp-planilha-setor', 'presenca-setor'];
  
  selectIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    
    const valorAtual = el.value;
    const isFilter = id.startsWith('filtro') || id.includes('filtro') || id.includes('setor');
    
    let html = isFilter ? '<option value="">Todos os Setores</option>' : '<option value="">Selecione o setor...</option>';
    html += setores.map(s => `<option value="${s}">${s}</option>`).join('');
    
    el.innerHTML = html;
    if (setores.includes(valorAtual)) el.value = valorAtual;
  });

  // Re-popular os selects de servidores com o filtro atual
  popularSelectFerias(document.getElementById('fp-filtro-setor')?.value);
  popularSelectFolgasCred(document.getElementById('fg-filtro-setor-cred')?.value);
  popularSelectFolgasDeb(document.getElementById('fg-filtro-setor-deb')?.value);
  popularSelectBancoHoras(document.getElementById('bh-filtro-setor')?.value);
  popularSelectBancoHorasSaldo(document.getElementById('bh-saldo-setor')?.value);
  popularSelectBancoHorasAjuste(document.getElementById('bh-ajuste-setor')?.value);
  popularSelectRelatorio();
}

function fecharModal(id) { document.getElementById(id).classList.remove('open'); }

function popularSelects() {
  const srvs = getServidoresAcessiveis();
  const selectProg = document.getElementById('fp-servidor');
  if (selectProg) {
    const cur = selectProg.value;
    selectProg.innerHTML = '<option value="">Selecione...</option>' + srvs.map(s => `<option value="${s.id}" ${s.id===cur?'selected':''}>${s.nome} (Mat. ${s.matricula})</option>`).join('');
  }
}
