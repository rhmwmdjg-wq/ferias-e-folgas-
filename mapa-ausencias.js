// Módulo Mapa de Ausências.
// Tela, filtros, tooltip, modal e assinaturas do mapa.

// ===================== MAPA DE AUSÊNCIAS (HEATMAP) =====================
let maAno = new Date().getFullYear();
let maMes = new Date().getMonth();
let _maCache = new Map();

function iniciarMapaAusencias() {
  const sel = document.getElementById('ma-filtro-setor');
  if (!sel) return;
  const setores = getTodosSetores();
  sel.innerHTML = '<option value="">Todos os Setores</option>' +
    setores.map(s => `<option value="${s}">${s}</option>`).join('');
  const container = document.getElementById('ma-print-setores');
  if (container) {
    container.innerHTML = setores.map(s =>
      `<label style="display:inline-flex;align-items:center;gap:3px;font-size:.75rem;cursor:pointer;padding:2px 4px;background:var(--surface);border-radius:4px;border:1px solid var(--border-mid);white-space:nowrap">
        <input type="checkbox" value="${esc(s)}" style="cursor:pointer;accent-color:#1a73e8"> ${esc(s)}
      </label>`
    ).join('');
  }
  renderMapaAusencias();
}

function navegarMapaAusencias(dir) {
  maMes += dir;
  if (maMes > 11) { maMes = 0; maAno++; }
  if (maMes < 0)  { maMes = 11; maAno--; }
  renderMapaAusencias();
}

function irParaHojeMapaAusencias() {
  const hoje = new Date();
  maAno = hoje.getFullYear();
  maMes = hoje.getMonth();
  renderMapaAusencias();
}

function renderMapaAusencias() {
  const container = document.getElementById('ma-grid-container');
  const titulo = document.getElementById('ma-titulo-mes');
  if (!container || !titulo) return;

  titulo.textContent = `${MESES_PT[maMes]} de ${maAno}`;

  const filtroSetor = document.getElementById('ma-filtro-setor')?.value || '';
  const filtroTipo = document.getElementById('ma-filtro-tipo')?.value || '';
  const agruparSetor = document.getElementById('ma-agrupar-setor')?.checked !== false;

  const servidores = getServidoresAcessiveis();
  const programacoes = getProgramacoesAcessiveis();
  const folgas = getFolgasAcessiveis();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Gerar array de dias do mês
  const diasNoMes = new Date(maAno, maMes + 1, 0).getDate();
  const dias = [];
  for (let d = 1; d <= diasNoMes; d++) {
    dias.push(new Date(maAno, maMes, d));
  }

  _maCache.clear();

  // Se não agrupar — visão global única (total de ausentes por dia)
  if (!agruparSetor) {
    const totalServidores = servidores.filter(s => !filtroSetor || s.setor === filtroSetor).length;
    let html = '<div class="ma-sem-agrupamento">';
    dias.forEach(dia => {
      const diaISO = dia.toISOString().split('T')[0];
      const nomes = listarAusentes(dia, diaISO, servidores, programacoes, folgas, filtroSetor, filtroTipo);
      const ck = `ma_${diaISO}|`;
      _maCache.set(ck, nomes);
      const { ferias, folga, total } = contarAusenciasPorTipo(diaISO, servidores, programacoes, folgas, filtroSetor, filtroTipo);
      const ehHoje = dia.getTime() === hoje.getTime();
      html += `<div class="ma-cell${ehHoje ? ' hoje' : ''}" data-count="${total}" data-ck="${ck}" data-data="${fmtDate(diaISO)}" title="${fmtDate(diaISO)}: ${total} ausente(s)">
        <div class="ma-cell-half" style="background:${corHeatmapTipo(ferias, 'ferias')}"></div>
        <div class="ma-cell-half" style="background:${corHeatmapTipo(folga, 'folga')}"></div>
      </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
    document.getElementById('ma-total-info').textContent = `Total: ${totalServidores} servidor(es) · ${diasNoMes} dia(s)`;
    anexarTooltipMapa();
    return;
  }

  // Agrupado por setor
  const setores = [...new Set(servidores.map(s => s.setor).filter(Boolean))].sort();
  const setoresFiltrados = filtroSetor ? setores.filter(s => s === filtroSetor) : setores;

  // Cabeçalho dos dias
  let html = '<div class="ma-grid">';
  html += '<div class="ma-header-row">';
  html += '<div class="ma-row-label" style="font-size:0.65rem;color:var(--muted)">Setor</div>';
  dias.forEach(dia => {
    const diaSem = dia.getDay();
    html += `<div class="ma-header-cell${diaSem === 0 || diaSem === 6 ? ' weekend' : ''}">${dia.getDate()}</div>`;
  });
  html += '</div>';

  // Linhas por setor
  setoresFiltrados.forEach(setor => {
    html += '<div class="ma-row">';
    html += `<div class="ma-row-label">${esc(setor)}</div>`;
    dias.forEach(dia => {
      const diaISO = dia.toISOString().split('T')[0];
      const nomes = listarAusentes(dia, diaISO, servidores, programacoes, folgas, setor, filtroTipo);
      const ck = `ma_${diaISO}|${setor}`;
      _maCache.set(ck, nomes);
      const { ferias, folga, total } = contarAusenciasPorTipo(diaISO, servidores, programacoes, folgas, setor, filtroTipo);
      const ehHoje = dia.getTime() === hoje.getTime();
      html += `<div class="ma-cell${ehHoje ? ' hoje' : ''}" data-count="${total}" data-ck="${ck}" data-data="${fmtDate(diaISO)}" data-setor="${esc(setor)}">
        <div class="ma-cell-half" style="background:${corHeatmapTipo(ferias, 'ferias')}"></div>
        <div class="ma-cell-half" style="background:${corHeatmapTipo(folga, 'folga')}"></div>
      </div>`;
    });
    html += '</div>';
  });

  // Linha de total por dia
  html += '<div class="ma-row" style="border-top:2px solid var(--border-hi);background:var(--surface)">';
  html += '<div class="ma-row-label" style="font-weight:800;color:var(--text)">Total</div>';
  let totalGeral = 0;
  dias.forEach(dia => {
    const diaISO = dia.toISOString().split('T')[0];
    let totalDia = 0;
    setoresFiltrados.forEach(setor => {
      totalDia += contarAusencias(dia, diaISO, servidores, programacoes, folgas, setor, filtroTipo);
    });
    totalGeral += totalDia;
    const cor = corHeatmap(totalDia);
    const ehHoje = dia.getTime() === hoje.getTime();
    const ck = `ma_${diaISO}|__total__`;
    _maCache.set(ck, []);
    html += `<div class="ma-cell${ehHoje ? ' hoje' : ''}" style="background:${cor};cursor:default" data-count="${totalDia}" data-ck="${ck}" data-data="${fmtDate(diaISO)}"></div>`;
  });
  html += '</div>';

  html += '</div>';
  container.innerHTML = html;

  document.getElementById('ma-total-info').textContent =
    `Total: ${setoresFiltrados.length} setor(es) · ${servidores.length} servidor(es) · ${diasNoMes} dia(s)`;

  anexarTooltipMapa();
}

function contarAusencias(dia, diaISO, servidores, programacoes, folgas, filtroSetor, filtroTipo) {
  let count = 0;

  const servidoresSetor = filtroSetor
    ? servidores.filter(s => s.setor === filtroSetor)
    : servidores;

  if (filtroTipo !== 'folga') {
    // Contar férias
    programacoes.forEach(p => {
      const srv = servidores.find(s => s.id === p.srvId);
      if (!srv || !servidoresSetor.includes(srv)) return;
      if (p.concluido) return;
      const pInicio = p.inicio || '';
      const pFim = p.retorno ? addDays(p.retorno, -1) : (p.fim || '');
      if (pInicio && pFim && diaISO >= pInicio && diaISO <= pFim) {
        count++;
      }
    });
  }

  if (filtroTipo !== 'ferias') {
    // Contar folgas (usufruto/débito)
    folgas.forEach(f => {
      if (f.tipo !== 'debito') return;
      const srv = servidores.find(s => s.id === f.srvId);
      if (!srv || !servidoresSetor.includes(srv)) return;
      if (f.dataItems && Array.isArray(f.dataItems)) {
        if (f.dataItems.some(di => di.data === diaISO)) count++;
      } else if (f.data) {
        const datas = f.data.split(',').map(d => d.trim());
        if (datas.includes(diaISO)) count++;
      }
    });
  }

  return count;
}

function listarAusentes(dia, diaISO, servidores, programacoes, folgas, filtroSetor, filtroTipo) {
  const nomes = [];

  const servidoresSetor = filtroSetor
    ? servidores.filter(s => s.setor === filtroSetor)
    : servidores;

  if (filtroTipo !== 'folga') {
    programacoes.forEach(p => {
      const srv = servidores.find(s => s.id === p.srvId);
      if (!srv || !servidoresSetor.includes(srv)) return;
      if (p.concluido) return;
      const pInicio = p.inicio || '';
      const pFim = p.retorno ? addDays(p.retorno, -1) : (p.fim || '');
      if (pInicio && pFim && diaISO >= pInicio && diaISO <= pFim) {
        nomes.push({ nome: srv.nome, tipo: p.tipo === 'anual' ? 'Férias' : 'Prêmio', setor: srv.setor, cargo: srv.cargo });
      }
    });
  }

  if (filtroTipo !== 'ferias') {
    folgas.forEach(f => {
      if (f.tipo !== 'debito') return;
      const srv = servidores.find(s => s.id === f.srvId);
      if (!srv || !servidoresSetor.includes(srv)) return;
      if (f.dataItems && Array.isArray(f.dataItems)) {
        if (f.dataItems.some(di => di.data === diaISO)) nomes.push({ nome: srv.nome, tipo: 'Folga', setor: srv.setor, cargo: srv.cargo });
      } else if (f.data) {
        const datas = f.data.split(',').map(d => d.trim());
        if (datas.includes(diaISO)) nomes.push({ nome: srv.nome, tipo: 'Folga', setor: srv.setor, cargo: srv.cargo });
      }
    });
  }

  return nomes;
}

function contarAusenciasPorTipo(diaISO, servidores, programacoes, folgas, filtroSetor, filtroTipo) {
  const servidoresSetor = filtroSetor ? servidores.filter(s => s.setor === filtroSetor) : servidores;
  let ferias = 0, folga = 0;

  if (filtroTipo !== 'folga') {
    programacoes.forEach(p => {
      const srv = servidores.find(s => s.id === p.srvId);
      if (!srv || !servidoresSetor.includes(srv)) return;
      if (p.concluido) return;
      const pInicio = p.inicio || '';
      const pFim = p.retorno ? addDays(p.retorno, -1) : (p.fim || '');
      if (pInicio && pFim && diaISO >= pInicio && diaISO <= pFim) ferias++;
    });
  }

  if (filtroTipo !== 'ferias') {
    folgas.forEach(f => {
      if (f.tipo !== 'debito') return;
      const srv = servidores.find(s => s.id === f.srvId);
      if (!srv || !servidoresSetor.includes(srv)) return;
      if (f.dataItems && Array.isArray(f.dataItems)) {
        if (f.dataItems.some(di => di.data === diaISO)) folga++;
      } else if (f.data) {
        const datas = f.data.split(',').map(d => d.trim());
        if (datas.includes(diaISO)) folga++;
      }
    });
  }

  return { ferias, folga, total: ferias + folga };
}

function corHeatmapTipo(count, tipo) {
  if (count === 0) return 'transparent';
  const cores = tipo === 'ferias'
    ? ['rgba(77,123,255,0.12)','rgba(77,123,255,0.3)','rgba(77,123,255,0.5)','rgba(77,123,255,0.7)','rgba(77,123,255,0.88)']
    : ['rgba(15,212,136,0.12)','rgba(15,212,136,0.3)','rgba(15,212,136,0.5)','rgba(15,212,136,0.7)','rgba(15,212,136,0.88)'];
  if (count <= 2) return cores[0];
  if (count <= 5) return cores[1];
  if (count <= 8) return cores[2];
  if (count <= 12) return cores[3];
  return cores[4];
}

function corHeatmap(count) {
  if (count === 0) return 'var(--card)';
  if (count <= 2) return 'rgba(15,212,136,0.25)';
  if (count <= 5) return 'rgba(245,183,49,0.35)';
  if (count <= 8) return 'rgba(245,158,11,0.5)';
  if (count <= 12) return 'rgba(255,77,106,0.5)';
  return 'rgba(220,38,38,0.7)';
}

function anexarTooltipMapa() {
  const tooltip = document.getElementById('ma-tooltip');
  if (!tooltip) return;

  document.querySelectorAll('#ma-grid-container .ma-cell').forEach(cell => {
    cell.addEventListener('mouseenter', (e) => {
      const count = parseInt(cell.dataset.count || '0');
      const data = cell.dataset.data || '';
      const ck = cell.dataset.ck || '';
      const setor = cell.dataset.setor || '';
      const nomes = _maCache.get(ck) || [];

      let html = `<strong style="color:var(--primary)">${data}</strong>`;
      if (setor) html += ` · <span style="color:var(--text-mid)">${esc(setor)}</span>`;
      html += `<br><span style="font-size:0.9rem;font-weight:800">${count} ausente(s)</span>`;
      // Breakdown por tipo
      let feriasCount = 0, folgaCount = 0;
      nomes.forEach(n => { if (n.tipo === 'Folga') folgaCount++; else feriasCount++; });
      if (feriasCount > 0 || folgaCount > 0) {
        html += `<div style="margin-top:4px;font-size:.75rem;display:flex;gap:12px">
          ${feriasCount > 0 ? `<span>🔵 ${feriasCount} férias</span>` : ''}
          ${folgaCount > 0 ? `<span>🟢 ${folgaCount} folgas</span>` : ''}
        </div>`;
      }
      if (nomes.length > 0) {
        html += '<div style="margin-top:6px;border-top:1px solid var(--border);padding-top:6px;max-height:180px;overflow-y:auto">';
        nomes.forEach(n => {
          html += `<div style="display:flex;justify-content:space-between;gap:8px;font-size:.75rem;padding:2px 0">
            <span>${esc(n.nome)}${n.cargo ? ' <span style="color:var(--muted);font-weight:400;font-size:.7rem">'+esc(n.cargo)+'</span>' : ''}</span>
            <span style="color:var(--muted);font-weight:600">${n.tipo}</span>
          </div>`;
        });
        html += '</div>';
      }
      html += '<div style="margin-top:8px;font-size:.7rem;color:var(--primary);border-top:1px solid var(--border);padding-top:6px">👆 Clique para ver detalhes</div>';

      tooltip.innerHTML = html;
      tooltip.style.display = 'block';

      const rect = cell.getBoundingClientRect();
      let left = rect.left + window.scrollX;
      let top = rect.bottom + window.scrollY + 6;
      if (top + tooltip.offsetHeight > window.innerHeight + window.scrollY) {
        top = rect.top + window.scrollY - tooltip.offsetHeight - 6;
      }
      if (left + tooltip.offsetWidth > window.innerWidth + window.scrollX) {
        left = window.innerWidth + window.scrollX - tooltip.offsetWidth - 10;
      }
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
    });

    cell.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });

    cell.addEventListener('click', () => {
      abrirModalAusencias(cell);
    });
  });
}

// ===================== IMPRESSÃO MAPA DE AUSÊNCIAS =====================
let _maGestoresList = [];

function toggleMaGestores() {
  const area = document.getElementById('ma-gestores-area');
  area.style.display = area.style.display === 'none' ? 'block' : 'none';
  if (area.style.display === 'block') {
    renderMaGestores();
    const sel = document.getElementById('ma-gestor-add-select');
    if (sel) {
      const gestores = DB.gestores();
      sel.innerHTML = '<option value="">Selecione um gestor...</option>' +
        gestores.filter(g => !_maGestoresList.find(x => x.id === g.id))
          .map(g => `<option value="${g.id}">${esc(g.nome)}</option>`).join('');
    }
  }
}

function adicionarGestorMapa() {
  const sel = document.getElementById('ma-gestor-add-select');
  if (!sel || !sel.value) { toastMsg('Selecione um gestor.', 'warning'); return; }
  const id = sel.value;
  const gestores = DB.gestores();
  const g = gestores.find(x => x.id === id);
  if (!g) return;
  if (_maGestoresList.find(x => x.id === id)) return;
  _maGestoresList.push({ id: g.id, nome: g.nome, cargo: g.cargo || 'Gerente' });
  sel.value = '';
  renderMaGestores();
  const gestoresDisp = gestores.filter(x => !_maGestoresList.find(y => y.id === x.id));
  sel.innerHTML = '<option value="">Selecione um gestor...</option>' +
    gestoresDisp.map(g => `<option value="${g.id}">${esc(g.nome)}</option>`).join('');
}

function removerGestorMapa(id) {
  _maGestoresList = _maGestoresList.filter(x => x.id !== id);
  renderMaGestores();
  const sel = document.getElementById('ma-gestor-add-select');
  if (sel) {
    const gestores = DB.gestores();
    const gestoresDisp = gestores.filter(x => !_maGestoresList.find(y => y.id === x.id));
    sel.innerHTML = '<option value="">Selecione um gestor...</option>' +
      gestoresDisp.map(g => `<option value="${g.id}">${esc(g.nome)}</option>`).join('');
  }
}

function renderMaGestores() {
  const container = document.getElementById('ma-gestores-lista');
  if (!container) return;
  if (!_maGestoresList.length) {
    container.innerHTML = '<div style="font-size:.78rem;color:var(--muted);padding:6px 0">Nenhum gestor adicionado.</div>';
    return;
  }
  container.innerHTML = _maGestoresList.map(g =>
    `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:4px">
      <span style="flex:1;font-size:.82rem;font-weight:600">👤 ${esc(g.nome)}</span>
      <button class="btn btn-danger btn-sm" onclick="removerGestorMapa('${g.id}')" style="padding:3px 8px;font-size:.7rem">✕</button>
    </div>`
  ).join('');
}


// imprimirMapaAusencias movida para reports.js



// exportarRelatorioMensalPDF movida para reports.js


function abrirModalAusencias(cell) {
  const modal = document.getElementById('modal-ausencia-detalhes');
  const titulo = document.getElementById('ausencia-modal-titulo');
  const sub = document.getElementById('ausencia-modal-sub');
  const lista = document.getElementById('ausencia-modal-lista');
  if (!modal || !lista) return;

  const data = cell.dataset.data || '';
  const setor = cell.dataset.setor || '';
  const count = parseInt(cell.dataset.count || '0');
  const ck = cell.dataset.ck || '';
  const nomes = _maCache.get(ck) || [];

  titulo.textContent = `📋 Ausentes — ${data}`;
  sub.innerHTML = setor
    ? `<span style="font-weight:700;color:var(--text)">${esc(setor)}</span> · <strong>${count}</strong> ausente(s)`
    : `<strong>${count}</strong> ausente(s) no total`;

  if (nomes.length === 0) {
    lista.innerHTML = '<div class="empty" style="padding:30px"><div class="icon">✅</div><p>Nenhum ausente neste dia.</p></div>';
  } else {
    let html = '<div style="display:flex;flex-direction:column;gap:4px">';
    nomes.forEach(n => {
      const tipoClass = n.tipo === 'Férias' ? 'tag-blue' : n.tipo === 'Prêmio' ? 'tag-purple' : 'tag-warn';
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--card);border-radius:var(--r-sm);border:1px solid var(--border)">
        <span style="font-weight:600;font-size:.84rem;color:var(--text)">${esc(n.nome)}</span>
        <span class="tag ${tipoClass}">${n.tipo}</span>
      </div>`;
    });
    html += '</div>';
    lista.innerHTML = html;
  }

  modal.classList.add('open');
}
