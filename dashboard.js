// Módulo Dashboard.
// Alertas, gráficos, coberturas, badges e WhatsApp.

function renderDashboard() {
  renderAlertas();
  renderCharts();
}

function renderCharts() {
  Object.values(_chartsInstances).forEach(c => { try { c.destroy(); } catch(e) {} });
  _chartsInstances = {};
  removerSkeletonsCharts();

  const isDark = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim().toLowerCase() !== '#f8fafc';
  const textoColor = isDark ? '#e6ecf8' : '#1e293b';
  const gridColor = isDark ? 'rgba(80,105,200,0.12)' : 'rgba(0,0,0,0.06)';

  // Dados
  const programacoes = getProgramacoesAcessiveis().filter(p => !p.concluido);
  const servidores = getServidoresAcessiveis();
  const folgas = getFolgasAcessiveis();
  const hoje = new Date();

  // --- 1. Férias por Mês (próximos 6 meses) ---
  (function() {
    const el = document.getElementById('chart-ferias-mes');
    if (!el) return;
    const meses = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
      meses.push({ label: MESES_PT[d.getMonth()] + '/' + d.getFullYear(), idx: d.getMonth(), ano: d.getFullYear(), count: 0 });
    }
    programacoes.forEach(p => {
      const d = new Date(p.inicio + 'T12:00:00');
      for (const m of meses) {
        if (d.getMonth() === m.idx && d.getFullYear() === m.ano) { m.count++; break; }
      }
    });
    _chartsInstances['chart-ferias-mes'] = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: {
        labels: meses.map(m => m.label),
        datasets: [{
          label: 'Programações',
          data: meses.map(m => m.count),
          backgroundColor: 'rgba(91, 127, 255, 0.5)',
          borderColor: '#5b7fff',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textoColor }, grid: { color: gridColor } },
          y: { beginAtZero: true, ticks: { stepSize: 1, color: textoColor }, grid: { color: gridColor } }
        }
      }
    });
  })();

  // --- 2. Distribuição por Setor ---
  (function() {
    const el = document.getElementById('chart-setores');
    if (!el) return;
    const setorCount = {};
    servidores.forEach(s => {
      const setor = s.setor || 'N/I';
      setorCount[setor] = (setorCount[setor] || 0) + 1;
    });
    const entries = Object.entries(setorCount).sort((a, b) => b[1] - a[1]);
    const top = entries.slice(0, 8);
    const outros = entries.slice(8).reduce((acc, e) => acc + e[1], 0);
    const labels = top.map(e => e[0]);
    const data = top.map(e => e[1]);
    if (outros > 0) { labels.push('Outros'); data.push(outros); }
    const cores = ['#5b7fff','#ff6b6b','#48bb78','#f6ad55','#9f7aea','#4fd1c5','#fc8181','#68d391','#a0aec0'];
    _chartsInstances['chart-setores'] = new Chart(el.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{ data: data, backgroundColor: cores.slice(0, labels.length), borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: textoColor, boxWidth: 12, padding: 8, font: { size: 11 } } }
        }
      }
    });
  })();

  // --- 3. Maiores Saldos de Folga ---
  (function() {
    const el = document.getElementById('chart-folgas-saldo');
    if (!el) return;
    const saldoMap = {};
    folgas.forEach(f => {
      const qtd = f.tipo === 'credito' ? (f.qtd || 0) : -(f.qtd || 0);
      saldoMap[f.srvId] = (saldoMap[f.srvId] || 0) + qtd;
    });
    const comSaldo = Object.entries(saldoMap)
      .map(([srvId, saldo]) => {
        const srv = servidores.find(s => s.id === srvId);
        return { srvId, saldo, nome: srv ? srv.nome : '?' };
      })
      .filter(x => x.saldo > 0)
      .sort((a, b) => b.saldo - a.saldo)
      .slice(0, 10);
    _chartsInstances['chart-folgas-saldo'] = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: {
        labels: comSaldo.map(x => x.nome.length > 18 ? x.nome.slice(0, 16) + '..' : x.nome),
        datasets: [{
          label: 'Saldo (dias)',
          data: comSaldo.map(x => x.saldo),
          backgroundColor: 'rgba(72, 187, 120, 0.5)',
          borderColor: '#48bb78',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { color: textoColor, stepSize: 1 }, grid: { color: gridColor } },
          y: { ticks: { color: textoColor, font: { size: 10 } }, grid: { color: gridColor } }
        }
      }
    });
  })();
}

function renderResumoAlertas() {
  const cont = document.getElementById('dashboard-alertas-resumo');
  if (!cont) return;
  
  const programacoes = getProgramacoesAcessiveis();
  const alertas = programacoes.filter(p => {
    if (p.concluido) return false;
    const diff = diffDays(p.inicio);
    return diff >= 0 && diff <= 15;
  }).sort((a,b) => diffDays(a.inicio) - diffDays(b.inicio)).slice(0, 8);
  
  if (!alertas.length) {
    cont.innerHTML = '<div class="empty" style="padding:40px 10px"><div class="icon" style="font-size:24px">✅</div><p style="font-size:0.75rem">Tudo em dia por aqui.</p></div>';
    return;
  }
  
  cont.innerHTML = alertas.map(p => {
    const srv = DB.servidores().find(s => s.id === p.srvId);
    const diff = diffDays(p.inicio);
    const cor = diff <= 5 ? 'var(--danger)' : diff <= 15 ? 'var(--warning)' : 'var(--primary)';
    return `
      <div style="padding:10px 12px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.01)">
        <div style="min-width:0; flex:1">
          <div style="font-weight:700; font-size:0.78rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text)">${esc(srv?.nome || 'Servidor')}</div>
          <div style="font-size:0.68rem; color:var(--muted)">${p.tipo === 'anual' ? '🌴 Anual' : '🏆 Prêmio'} • ${fmtDate(p.inicio)}</div>
        </div>
        <span class="tag" style="background:${cor}22; color:${cor}; border:1px solid ${cor}33; font-size:0.65rem">
          ${diff === 0 ? 'HOJE' : `${diff} dias`}
        </span>
      </div>
    `;
  }).join('');
}

function renderAlertas() {
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const programacoes = getProgramacoesAcessiveis();
  const servidores = getServidoresAcessiveis();

  const anuais = [], premium = [], emGozoHoje = [];
  const hojeIso = hoje.toISOString().split('T')[0];

  programacoes.forEach(p => {
    const srv = servidores.find(s => s.id === p.srvId);
    if (!srv) return;

    // Verificar se está em gozo HOJE
    if (!p.concluido && !p.autorizado && p.inicio <= hojeIso && (p.fim >= hojeIso)) {
       emGozoHoje.push({ ...p, srv });
    }

    if (p.concluido || p.autorizado) return;
    const diff = diffDays(p.inicio);
    const limite = p.tipo === 'anual' ? 35 : 65;
    if (diff >= 0 && diff <= limite) {
      const item = { ...p, srv, diff };
      if (p.tipo === 'anual') anuais.push(item);
      else premium.push(item);
    }
  });

  document.getElementById('stat-count-anual').textContent = anuais.length;
  document.getElementById('stat-count-premium').textContent = premium.length;
  // Servidores em gozo de folga HOJE
  const folgasEmGozoHoje = getFolgasAcessiveis().filter(f => {
    if (f.tipo !== 'debito') return false;
    if (f.dataItems) return f.dataItems.some(di => di.data === hojeIso);
    if (f.data) return f.data.split(',').map(x => x.trim()).includes(hojeIso);
    return false;
  }).map(f => {
    const srv = servidores.find(s => s.id === f.srvId);
    return srv ? { ...f, srv } : null;
  }).filter(Boolean);

  document.getElementById('stat-count-hoje').textContent = emGozoHoje.length + folgasEmGozoHoje.length;
  document.getElementById('stat-total').textContent = servidores.length;

  renderListaGozoHoje(emGozoHoje);
  renderListaFolgasEmGozoHoje(folgasEmGozoHoje);
  renderListaAlertas('lista-alertas-anual', anuais, 'anual');
  renderListaAlertas('lista-alertas-premium', premium, 'premium');
  document.getElementById('badge-alertas').textContent = anuais.length + premium.length;

  // Autorizações assinadas
  const autorizacoes = DB.autorizacoes();
  document.getElementById('stat-autorizacoes').textContent = autorizacoes.length;
}

function renderListaGozoHoje(lista) {
  const el = document.getElementById('lista-em-gozo-hoje');
  if (!el) return;
  if (!lista.length) {
    el.innerHTML = `<div class="empty"><div class="icon">🌴</div><p>Nenhum servidor em gozo de férias hoje.</p></div>`;
    return;
  }

  el.innerHTML = lista.map(item => {
    const retorno = item.retorno || (item.fim ? addDays(item.fim, 1) : '-');
    return `<div class="alert-card gozo" style="border-left: 4px solid var(--success)">
      <div class="alert-icon" style="background:var(--success)22; color:var(--success)">🌴</div>
      <div class="alert-info">
        <h4>${item.srv.nome} <span style="font-weight:400;color:var(--muted);font-size:.85rem">(Mat. ${item.srv.matricula})</span></h4>
        <p>📍 ${item.srv.setor || 'Setor não informado'} — ${item.srv.cargo || ''}</p>
        <p>📅 Período: <strong>${fmtDate(item.inicio)}</strong> até <strong>${fmtDate(item.fim)}</strong></p>
        <p style="color:var(--success)">🚀 Data de Retorno: <strong>${fmtDate(retorno)}</strong></p>
      </div>
      <div class="alert-actions">
         <button class="btn btn-primary btn-sm" onclick="avancarStatusProg('${item.id}')">✅ Dar Baixa</button>
      </div>
    </div>`;
  }).join('');
}

function renderListaFolgasEmGozoHoje(lista) {
  const el = document.getElementById('lista-folgas-em-gozo-hoje');
  if (!el) return;
  if (!lista.length) {
    el.innerHTML = `<div class="empty"><div class="icon">🏖️</div><p>Nenhum servidor em gozo de folga hoje.</p></div>`;
    return;
  }
  el.innerHTML = lista.map(item => {
    const datas = item.dataItems
      ? item.dataItems.map(di => `${fmtDate(di.data)}${di.peso === 1 ? '' : ` (${di.turno})`}`).join(', ')
      : item.data || '';
    return `<div class="alert-card gozo" style="border-left: 4px solid var(--warning)">
      <div class="alert-icon" style="background:var(--warning)22; color:var(--warning)">🏖️</div>
      <div class="alert-info">
        <h4>${item.srv.nome} <span style="font-weight:400;color:var(--muted);font-size:.85rem">(Mat. ${item.srv.matricula})</span></h4>
        <p>📍 ${item.srv.setor || 'Setor não informado'} — ${item.srv.cargo || ''}</p>
        <p>📅 Datas: <strong>${datas}</strong></p>
        <p style="color:var(--muted);font-size:.82rem">${esc(item.obs || '-')}</p>
      </div>
    </div>`;
  }).join('');
}

function atualizarSelectSetorCobertura() {
  const sel = document.getElementById('cb-setor');
  if (!sel) return;
  const setores = getTodosSetores();
  const atual = sel.value;
  sel.innerHTML = '<option value="">Todos os Setores</option>' + setores.map(s => `<option value="${s}">${s}</option>`).join('');
  if (setores.includes(atual)) sel.value = atual;
}

function renderCoberturas() {
  if (typeof atualizarSelectsSetores === 'function') atualizarSelectsSetores();
  const mesInput = document.getElementById('cb-mes');
  const setorFiltro = document.getElementById('cb-setor')?.value || '';
  const listaEl = document.getElementById('cb-lista');
  const statsEl = document.getElementById('cb-stats');
  if (!listaEl) return;

  // Se não selecionou mês, mostra todas as coberturas dos últimos 3 meses
  let mesAlvo = mesInput ? mesInput.value : '';
  if (!mesAlvo) {
    const d = new Date();
    mesAlvo = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (mesInput) mesInput.value = mesAlvo;
  }

  // Pega todos os débitos de folga + programações de férias que têm cobertura
  const servidores = DB.servidores();
  const folgas = getFolgasAcessiveis().filter(f => f.tipo === 'debito');
  const progs = getProgramacoesAcessiveis().filter(p => !p.concluido);

  const coberturas = [];

  // Folgas com cobertura
  folgas.forEach(f => {
    const parsed = parseFolgaObs(f.obs);
    if (!parsed.coberturaNome) return;
    const srvAusente = servidores.find(s => s.id === f.srvId);
    if (!srvAusente) return;
    if (setorFiltro && srvAusente.setor !== setorFiltro) return;
    const datas = f.dataItems ? f.dataItems.map(d => d.data) : [f.data];
    // Filtra pelo mês selecionado
    const datasNoMes = datas.filter(d => d && d.startsWith(mesAlvo));
    if (datasNoMes.length === 0) return;
    coberturas.push({
      tipo: 'folga',
      srvAusente,
      substitutoNome: parsed.coberturaNome,
      substitutoId: parsed.coberturaId,
      datas: datasNoMes,
      qtd: datasNoMes.length,
      obs: parsed.obs,
      id: f.id
    });
  });

  // Programações de férias com cobertura (mesmo formato: [Cobertura: Nome (ID: xxx)] na obs)
  progs.forEach(p => {
    const parsed = parseFolgaObs(p.obs || '');
    if (!parsed.coberturaNome) return;
    const srvAusente = servidores.find(s => s.id === p.srvId);
    if (!srvAusente) return;
    if (setorFiltro && srvAusente.setor !== setorFiltro) return;
    // Filtra se o período da programação cai no mês selecionado
    const dias = gerarDiasNoMes(p.inicio, p.fim, mesAlvo);
    if (dias === 0) return;
    coberturas.push({
      tipo: 'ferias',
      srvAusente,
      substitutoNome: parsed.coberturaNome,
      substitutoId: parsed.coberturaId,
      periodo: `${fmtDate(p.inicio)} a ${fmtDate(p.fim)}`,
      qtd: dias,
      obs: parsed.obs,
      id: p.id
    });
  });

  // Ordena por data (mais recente primeiro)
  coberturas.sort((a, b) => (b.datas ? b.datas[0] : '') < (a.datas ? a.datas[0] : '') ? 1 : -1);

  // Stats
  const totalCoberturas = coberturas.length;
  const servidoresUnicos = new Set(coberturas.map(c => c.substitutoNome)).size;
  statsEl.innerHTML = `
    <div class="stat" style="padding:10px 16px"><div class="val" style="font-size:1.2rem">${totalCoberturas}</div><div class="lbl">Coberturas no mês</div></div>
    <div class="stat" style="padding:10px 16px"><div class="val" style="font-size:1.2rem">${servidoresUnicos}</div><div class="lbl">Substitutos distintos</div></div>
    <div class="stat" style="padding:10px 16px"><div class="val" style="font-size:1.2rem">${coberturas.filter(c => c.tipo === 'folga').length}</div><div class="lbl">Folgas</div></div>
    <div class="stat" style="padding:10px 16px"><div class="val" style="font-size:1.2rem">${coberturas.filter(c => c.tipo === 'ferias').length}</div><div class="lbl">Férias</div></div>
  `;

  if (!coberturas.length) {
    listaEl.innerHTML = '<div class="empty"><div class="icon">🤝</div><p>Nenhuma cobertura registrada neste mês.</p></div>';
    atualizarBadgeCoberturas(0);
    return;
  }

  listaEl.innerHTML = coberturas.map(c => {
    const icone = c.tipo === 'folga' ? '🏖️' : '🌴';
    const tipoLabel = c.tipo === 'folga' ? 'Folga' : 'Férias';
    const periodo = c.tipo === 'folga' ? c.datas.map(d => fmtDate(d)).join(', ') : c.periodo;
    const substituto = servidores.find(s => s.id === c.substitutoId);
    const subNome = substituto ? `${substituto.nome} (Mat. ${substituto.matricula})` : c.substitutoNome;
    return `<div class="alert-card" style="border-left: 4px solid var(--accent)">
      <div class="alert-icon" style="background:var(--accent)22; color:var(--accent)">🤝</div>
      <div class="alert-info">
        <h4>${icone} ${c.srvAusente.nome} <span style="font-weight:400;color:var(--muted);font-size:.85rem">(Mat. ${c.srvAusente.matricula})</span></h4>
        <p>📍 ${c.srvAusente.setor || '-'} — ${tipoLabel}</p>
        <p>📅 <strong>${periodo}</strong> · ${c.qtd} dia(s)</p>
        <p style="color:var(--success)">👤 Coberto por: <strong>${subNome}</strong></p>
        ${c.obs ? `<p style="color:var(--muted);font-size:.8rem">📝 ${esc(c.obs)}</p>` : ''}
      </div>
    </div>`;
  }).join('');

  atualizarBadgeCoberturas(coberturas.length);
}

function gerarDiasNoMes(inicio, fim, mesAlvo) {
  if (!inicio || !fim) return 0;
  const dInicio = new Date(inicio + 'T00:00:00');
  const dFim = new Date(fim + 'T00:00:00');
  const [ano, mes] = mesAlvo.split('-').map(Number);
  let count = 0;
  const d = new Date(dInicio);
  while (d <= dFim) {
    if (d.getFullYear() === ano && d.getMonth() + 1 === mes) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function atualizarBadgeCoberturas(qtd) {
  const badge = document.getElementById('badge-coberturas');
  if (!badge) return;
  badge.style.display = qtd > 0 ? 'inline-block' : 'none';
  badge.textContent = qtd;
}

function renderListaAlertas(containerId, lista, tipo) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!lista.length) {
    el.innerHTML = `<div class="empty"><div class="icon">✅</div><p>Nenhum alerta de ${tipo==='anual'?'férias anuais':'férias prêmio'} no momento.</p></div>`;
    return;
  }
  lista.sort((a, b) => a.diff - b.diff);
  el.innerHTML = lista.map(item => {
    const urgente = item.diff <= 7;
    const tag = urgente ? 'tag-red' : item.diff <= 15 ? 'tag-warn' : 'tag-blue';
    const retorno = item.retorno || (item.fim ? addDays(item.fim, 1) : '-');
    return `<div class="alert-card ${tipo}">
      <div class="alert-icon">${tipo === 'anual' ? '🌴' : '🏆'}</div>
      <div class="alert-info">
        <h4>${item.srv.nome} <span style="font-weight:400;color:var(--muted);font-size:.85rem">(Mat. ${item.srv.matricula})</span></h4>
        <p>📍 ${item.srv.setor || 'Setor não informado'} — ${item.srv.cargo || ''}</p>
        <p>📅 Início: <strong>${fmtDate(item.inicio)}</strong> | Retorno: <strong>${fmtDate(retorno)}</strong></p>
        <p>📞 ${item.srv.telefone ? item.srv.telefone : '<span style="color:var(--danger)">Telefone não cadastrado</span>'}</p>
        <p>🏖️ Fér. Reg. Acum.: <strong>${item.srv.feriasReg}</strong> | Fér. Prêmio Acum.: <strong>${item.srv.feriasPrem}</strong></p>
        <span class="days-badge ${tag}">${item.diff === 0 ? '🚨 HOJE' : `⏳ ${item.diff} dia(s) restante(s)`}</span>
      </div>
      <div class="alert-actions" style="display:flex; gap:8px">
        ${item.srv.telefone
          ? `<button class="btn btn-success btn-sm" onclick="prepararWhatsApp('${item.srv.id}','${item.id}')" title="Enviar lembrete via WhatsApp">💬 WhatsApp</button>`
          : `<button class="btn btn-ghost btn-sm" title="Cadastre o telefone do servidor" disabled>📵 Sem Tel.</button>`}
        <button class="btn btn-primary btn-sm" onclick="avancarStatusProg('${item.id}')" title="Marcar como concluído/entregue">✅ Dar Baixa</button>
        <button class="btn btn-ghost btn-sm" onclick="ocultarAlerta('${item.id}')" title="Remover do dashboard" style="font-size:1rem;padding:4px 8px;opacity:.5">✕</button>
      </div>
    </div>`;
  }).join('');
}

function avancarStatusProg(id) {
  const programacoes = DB.programacoes();
  const prog = programacoes.find(p => p.id === id);
  if (!prog) return toastMsg('Programação não encontrada.', 'error');
  prog.concluido = true;
  DB.saveProgramacoes(programacoes);
  renderDashboard();
  toastMsg('✅ Programação marcada como concluída!');
}

function ocultarAlerta(id) {
  const programacoes = DB.programacoes();
  const prog = programacoes.find(p => p.id === id);
  if (!prog) return toastMsg('Programação não encontrada.', 'error');
  prog.autorizado = true;
  prog.autorizadoEm = new Date().toISOString();
  prog.autorizadoPor = 'Manual';
  DB.saveProgramacoes(programacoes);
  renderDashboard();
}

function atualizarBadge() {
  const programacoes = DB.programacoes();
  let cnt = 0;
  programacoes.forEach(p => {
    if (p.concluido) return;
    const diff = diffDays(p.inicio);
    const limite = p.tipo === 'anual' ? 35 : 65;
    if (diff >= 0 && diff <= limite) cnt++;
  });
  document.getElementById('badge-alertas').textContent = cnt;
}

function prepararWhatsApp(srvId, progId) {
  const srv = DB.servidores().find(s => s.id === srvId);
  const prog = DB.programacoes().find(p => p.id === progId);
  const cfg = DB.config();
  if (!srv) return;
  const retorno = prog?.retorno || (prog?.fim ? addDays(prog.fim, 1) : '-');
  const decreto = cfg.decreto || '[Decreto não configurado - acesse a aba Configurações]';
  const msg = `Olá, ${srv.nome}!\n\nInformamos que suas férias ${prog?.tipo === 'premio' ? 'prêmio' : 'anuais'} estão com início programado para ${fmtDate(prog?.inicio)} e seu retorno previsto é em ${fmtDate(retorno)}.\n\nVocê deve comparecer à Coordenação para solicitar suas férias, conforme:\n\n${decreto}\n\nSetor: ${srv.setor || 'Não informado'}\nMatrícula: ${srv.matricula}\nFérias Regulamentares Acumuladas: ${srv.feriasReg}\nFérias Prêmio Acumuladas: ${srv.feriasPrem}\n\nAtenciosamente,\nCoordenação da APS`;
  document.getElementById('wa-msg').value = msg;
  document.getElementById('wa-tel').value = srv.telefone || '';
  document.getElementById('modal-whatsapp').classList.add('open');
}

function prepararWhatsAppAniversario(srvId) {
  const srv = DB.servidores().find(s => s.id === srvId);
  if (!srv) return;
  const cfg = DB.config();
  const msg = `🎂 *FELIZ ANIVERSÁRIO!* 🥳\n\nOlá, *${srv.nome}*!\n\nA Coordenação da Atenção Primária à Saúde (APS) passa por aqui para desejar um dia maravilhoso e um novo ciclo repleto de saúde, alegrias e realizações.\n\nParabéns pelo seu dia! 🎉🎈✨\n\nAtenciosamente,\nCoordenação da APS`;
  document.getElementById('wa-msg').value = msg;
  document.getElementById('wa-tel').value = srv.telefone || '';
  document.getElementById('modal-whatsapp').classList.add('open');
}
