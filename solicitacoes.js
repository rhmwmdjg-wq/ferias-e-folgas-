// Módulo Solicitações.
// Criação, aprovação, cobertura e exclusão de solicitações.

let fpSolFolga = null;

let currentSolDates = {};

function initFlatpickrSolicitacao() {
  const el = document.getElementById('sol-data-folga');
  if (!el || typeof flatpickr === 'undefined') return;
  if (fpSolFolga) fpSolFolga.destroy();
  fpSolFolga = flatpickr(el, {
    mode: "multiple", dateFormat: "Y-m-d", locale: flatpickr.l10ns.pt,
    onChange: function(selectedDates) {
      const datesArr = selectedDates.map(d => d.toISOString().split('T')[0]);
      syncSolDates(datesArr);
    }
  });
}

function syncSolDates(datesArr) {
  const newMap = {};
  datesArr.forEach(d => {
    newMap[d] = currentSolDates[d] || { peso: 1, turno: 'Integral' };
  });
  currentSolDates = newMap;
  renderSolSelectedDates();
}

function setShiftSol(data, peso, turno) {
  currentSolDates[data] = { peso, turno };
  renderSolSelectedDates();
}

function renderSolSelectedDates() {
  const container = document.getElementById('sol-datas-selecionadas-list');
  if (!container) return;
  const entries = Object.entries(currentSolDates).sort((a,b) => a[0].localeCompare(b[0]));
  if (!entries.length) {
    container.innerHTML = '<div style="font-size:.75rem;color:var(--muted)">Nenhum dia selecionado.</div>';
    document.getElementById('sol-qtd-folga').value = 0;
    return;
  }
  let total = 0;
  container.innerHTML = entries.map(([data, obj]) => {
    const weight = typeof obj === 'object' ? obj.peso : obj;
    const shift = typeof obj === 'object' ? obj.turno : 'Integral';
    total += weight;
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;background:white;padding:5px 8px;border-radius:6px;border:1px solid var(--border)">
        <span style="font-weight:600;font-size:0.75rem">${fmtDate(data)}</span>
        <div style="display:flex;background:var(--bg);padding:2px;border-radius:4px;gap:2px">
          <button type="button" class="btn btn-sm ${weight === 1 ? 'btn-primary' : 'btn-ghost'}" style="font-size:0.6rem;padding:1px 5px" onclick="setShiftSol('${data}', 1, 'Integral')">Dia Todo</button>
          <button type="button" class="btn btn-sm ${weight === 0.5 && shift === 'Manhã' ? 'btn-warn' : 'btn-ghost'}" style="font-size:0.6rem;padding:1px 5px" onclick="setShiftSol('${data}', 0.5, 'Manhã')">☀️ Manhã</button>
          <button type="button" class="btn btn-sm ${weight === 0.5 && shift === 'Tarde' ? 'btn-warn' : 'btn-ghost'}" style="font-size:0.6rem;padding:1px 5px" onclick="setShiftSol('${data}', 0.5, 'Tarde')">🌗 Tarde</button>
        </div>
      </div>
    `;
  }).join('');
  document.getElementById('sol-qtd-folga').value = total;
  
  // Verificar saldo
  const sessao = JSON.parse(sessionStorage.getItem('ferias_sessao') || '{}');
  const saldo = saldoFolgas(sessao.id);
  const aviso = document.getElementById('sol-aviso-saldo');
  if (aviso) aviso.style.display = (total > 0 && saldo < total) ? 'block' : 'none';
}

function setPesoSol(data, peso) {
  currentSolDates[data] = peso;
  renderSolSelectedDates();
}

function limparDatasSolicitacao() {
  if (fpSolFolga) fpSolFolga.clear();
  currentSolDates = {};
  renderSolSelectedDates();
}

let solTipoPeriodo = 1;

function selecionarTipoPeriodoSolicitacao(num) {
  solTipoPeriodo = num;
  document.querySelectorAll('#sol-periodos-grid .periodo-option').forEach(opt => opt.classList.remove('selected'));
  const btn = document.getElementById('sol-per-' + num);
  if (btn) btn.classList.add('selected');
  renderCamposDatasSolicitacao();
}

function renderCamposDatasSolicitacao() {
  const container = document.getElementById('sol-datas-container');
  if (!container) return;
  
  let html = '';
  const qtdDias = solTipoPeriodo === 1 ? 30 : (solTipoPeriodo === 2 ? 15 : 10);
  
  for(let i=1; i<=solTipoPeriodo; i++) {
    html += `
      <div class="field">
        <label style="font-size:0.7rem">Início do ${i}º Período *</label>
        <input type="date" id="sol-inicio-${i}" onchange="calcularRetornoSolicitacao(${i}, ${qtdDias})">
        <div id="sol-info-retorno-${i}" style="font-size:0.65rem; color:var(--success); margin-top:2px; font-weight:600"></div>
      </div>
    `;
  }
  container.innerHTML = html;
}

function calcularRetornoSolicitacao(idx, dias) {
  const ini = document.getElementById('sol-inicio-' + idx).value;
  const info = document.getElementById('sol-info-retorno-' + idx);
  if (!ini || !info) return;
  
  const d = new Date(ini + 'T00:00:00');
  d.setDate(d.getDate() + dias);
  info.innerHTML = `Retorno: ${fmtDate(d.toISOString().split('T')[0])}`;
}

function toggleCamposSolicitacao() {
  const tipo = document.getElementById('sol-tipo').value;
  const isFolga = tipo === 'folga';
  
  document.getElementById('sol-campos-ferias').style.display = isFolga ? 'none' : 'block';
  document.getElementById('sol-campos-folga').style.display = isFolga ? 'block' : 'none';

  if (!isFolga) {
    if (document.getElementById('sol-datas-container').innerHTML === '') {
      selecionarTipoPeriodoSolicitacao(1);
    }
  }
}

async function criarSolicitacao() {
  const sessaoStr = sessionStorage.getItem('ferias_sessao');
  if (!sessaoStr) return;
  const sessao = JSON.parse(sessaoStr);
  const tipo = document.getElementById('sol-tipo').value;
  const obs = document.getElementById('sol-obs').value.trim();

  let dados = {
    id: uid(), srvId: sessao.id, srvNome: sessao.nome,
    tipo, obs, status: 'pendente', criadoEm: new Date().toISOString()
  };

  if (tipo === 'folga') {
    const entries = Object.entries(currentSolDates);
    if (!entries.length) return toastMsg('Selecione ao menos um dia de folga!', 'error');
    
    let qtdTotal = 0;
    dados.dataItems = entries.map(([data, obj]) => {
      const p = typeof obj === 'object' ? obj.peso : obj;
      const t = typeof obj === 'object' ? obj.turno : 'Manhã';
      qtdTotal += p;
      return { data, peso: p, turno: p === 0.5 ? t : 'Integral' };
    }).sort((a,b) => a.data.localeCompare(b.data));
    
    dados.qtd = qtdTotal;
    dados.inicio = dados.dataItems[0].data;
    dados.fim = dados.dataItems[dados.dataItems.length-1].data;
  } else {
    // Férias com parcelamento
    const periodos = [];
    const diasPorPer = solTipoPeriodo === 1 ? 30 : (solTipoPeriodo === 2 ? 15 : 10);
    
    for (let i = 1; i <= solTipoPeriodo; i++) {
      const val = document.getElementById('sol-inicio-' + i).value;
      if (!val) return toastMsg(`Informe o início do ${i}º período!`, 'error');
      
      const dIni = new Date(val + 'T00:00:00');
      const dFim = new Date(dIni);
      dFim.setDate(dFim.getDate() + diasPorPer);
      
      periodos.push({
        inicio: val,
        fim: dFim.toISOString().split('T')[0]
      });
    }
    
    dados.periodos = periodos;
    dados.inicio = periodos[0].inicio;
    dados.fim = periodos[periodos.length-1].fim;
    dados.parcelamento = solTipoPeriodo === 1 ? 'Integral' : (solTipoPeriodo === 2 ? '15/15' : '10/10/10');
  }

  // ==== DETECTOR DE CONFLITOS (SOLICITAÇÃO) ====
  const periodosCheck = tipo === 'folga'
    ? (dados.dataItems || []).map(di => ({ inicio: di.data, fim: di.data }))
    : (dados.periodos || []);
  const conflitos = verificarConflitosSetorFuncao(sessao.id, periodosCheck);
  if (conflitos.length > 0) {
    const msg = `⚠️ ALERTA DE CONFLITO\n\n` +
                `Servidores da mesma função e setor já ausentes neste período:\n\n` +
                conflitos.map(c => `• ${c}`).join('\n') +
                `\n\nDeseja enviar a solicitação mesmo assim?`;
    if (!confirm(msg)) return;
  }
  // ===============================================================

  // Salvar solicitação
  try {
    const result = await DB.saveSolicitacao(dados);
    
    if (result && result.mode === 'safe') {
      toastMsg('Solicitação enviada (Modo de Compatibilidade)', 'warning');
    } else {
      toastMsg('Solicitação enviada com sucesso!', 'success');
    }
    
    limparDatasSolicitacao();
    if (!tipo.includes('folga')) renderCamposDatasSolicitacao();
    document.getElementById('sol-obs').value = '';
    renderSolicitacoes();
    await atualizarBadgeSolicitacoes();
  } catch (e) {
     console.error("❌ Erro ao criar solicitação:", e);
     const msg = e.message || 'Erro desconhecido';
     if (msg.includes('column')) {
        toastMsg("Erro no banco: As colunas 'qtd', 'inicio' e 'fim' parecem faltar na tabela 'solicitacoes'. Use o modo offline ou atualize o banco.", "error");
     } else {
        toastMsg("Erro ao salvar solicitação: " + msg, "error");
     }
  }
}

function renderSolicitacoes() {
  const sessaoStr = sessionStorage.getItem('ferias_sessao');
  if (!sessaoStr) return;
  const sessao = JSON.parse(sessaoStr);
  const isAdmin = sessao.role === 'admin';
  const isGestor = sessao.role === 'gestor';
  const allSolic = DB.solicitacoes();
  const servidoresAcessiveis = getServidoresAcessiveis();
  const srvIds = servidoresAcessiveis.map(s => s.id);

  let lista;
  if (isAdmin || isGestor) {
    lista = allSolic.filter(s => srvIds.includes(s.srvId));
    document.getElementById('sol-lista-titulo').innerHTML = '<span class="icon">📋</span> Gerenciar Solicitações';
    document.getElementById('card-nova-solicitacao').style.display = isAdmin ? 'block' : 'none';
  } else {
    lista = allSolic.filter(s => s.srvId === sessao.id);
    document.getElementById('sol-lista-titulo').innerHTML = '<span class="icon">📋</span> Minhas Solicitações';
    document.getElementById('card-nova-solicitacao').style.display = 'block';
  }

  const container = document.getElementById('lista-solicitacoes');
  if (!container) return;
  if (!lista.length) {
    container.innerHTML = '<div class="empty"><div class="icon">📄</div><p>Nenhuma solicitação encontrada.</p></div>';
    return;
  }

  lista.sort((a,b) => new Date(b.criadoEm) - new Date(a.criadoEm));

  container.innerHTML = lista.map(s => {
    const statusCls = `tag-${s.status === 'pendente' ? 'warn' : s.status === 'autorizado' ? 'green' : 'red'}`;
    const statusLabel = s.status === 'pendente' ? 'AGUARDANDO' : s.status === 'autorizado' ? 'APROVADO' : 'NEGADO';
    const canApprove = (isAdmin || isGestor) && s.status === 'pendente';
    const canPrint = s.status === 'autorizado';

    return `
      <div class="card" style="margin-bottom:12px; border:1px solid var(--border); background:rgba(0,0,0,0.02); padding: 15px">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px">
          <div>
            <span class="tag ${statusCls}">${statusLabel}</span>
            <strong style="margin-left:8px; font-size: 0.85rem">${s.tipo.replace('_', ' ').toUpperCase()}</strong>
          </div>
          <small style="color:var(--muted); font-size: 0.75rem">${new Date(s.criadoEm).toLocaleDateString()}</small>
        </div>
        <p style="font-size:0.85rem; margin-bottom:4px"><strong>Servidor:</strong> ${s.srvNome} ${s.parcelamento ? ` <span class="tag tag-blue" style="font-size:10px">${s.parcelamento}</span>` : ''}</p>
        ${s.periodos ? `
          <div style="font-size:0.78rem; color:var(--text-mid); background:var(--surface); padding:8px; border-radius:6px; margin:6px 0">
            ${s.periodos.map((p, idx) => `<div><strong>${idx+1}º Per:</strong> ${fmtDate(p.inicio)} até ${fmtDate(p.fim)}</div>`).join('')}
          </div>
        ` : `
          <p style="font-size:0.8rem">📅 <strong>Início:</strong> ${fmtDate(s.inicio)} | <strong>Retorno/Fim:</strong> ${fmtDate(s.fim)}</p>
        `}
        ${(() => {
          if (!s.obs) return '';
          const parsed = parseFolgaObs(s.obs);
          const tagCob = parsed.coberturaNome ? `<br style="margin-bottom:4px"><span class="tag tag-purple" style="display:inline-block;margin-top:4px">👥 Substituto (Cobertura): ${esc(parsed.coberturaNome)}</span>` : '';
          return `<p style="font-size:0.75rem; color:var(--muted); margin-top:6px; background: white; padding: 6px; border-radius: 4px; border: 1px dashed var(--border)">"${esc(parsed.obs || '-')}"${tagCob}</p>`;
        })()}
        
        <div style="display:flex; gap:8px; margin-top:12px; border-top:1px solid var(--border); padding-top:10px; align-items: center">
          ${canApprove ? `
            <button class="btn btn-primary btn-sm" onclick="resolverSolicitacao('${s.id}', 'autorizado')">✅ Autorizar</button>
            <button class="btn btn-danger btn-sm" onclick="resolverSolicitacao('${s.id}', 'negado')">❌ Negar</button>
          ` : ''}
          ${canPrint ? `
            <button class="btn btn-ghost btn-sm" onclick="imprimirComSolicitacao('${s.id}')">🖨️ Imprimir Autorização</button>
          ` : s.status === 'pendente' && sessao.role === 'servidor' ? '<span style="font-size:0.7rem; color:var(--muted)">⏳ Aguardando aprovação para liberar impressão.</span>' : ''}
           ${(isAdmin || s.srvId === sessao.id) ? `
            <button class="btn btn-ghost btn-sm" style="color:var(--danger); margin-left:auto" onclick="excluirSolicitacao('${s.id}')" title="Excluir">🗑️</button>
          ` : ''}
          ${(s.status === 'pendente' && s.srvId === sessao.id) ? `
            <button class="btn btn-ghost btn-sm" style="color:var(--primary)" onclick="prepararEdicaoSolicitacao('${s.id}')">✏️ Editar</button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

let solicitacaoEditId = null;

function prepararEdicaoSolicitacao(id) {
  const sol = DB.solicitacoes().find(s => s.id === id);
  if (!sol) return;
  solicitacaoEditId = id;
  
  document.getElementById('sol-tipo').value = sol.tipo;
  toggleCamposSolicitacao();

  if (sol.tipo === 'folga') {
    currentSolDates = {};
    if (sol.dataItems) {
      sol.dataItems.forEach(di => currentSolDates[di.data] = di.peso);
    }
    if (fpSolFolga) {
      fpSolFolga.setDate(Object.keys(currentSolDates));
    }
    renderSolSelectedDates();
  } else {
    document.getElementById('sol-inicio').value = sol.inicio;
    document.getElementById('sol-fim').value = sol.fim;
  }
  
  document.getElementById('sol-obs').value = sol.obs || '';
  const btn = document.querySelector('#card-nova-solicitacao button');
  if (btn) btn.textContent = '💾 Atualizar Solicitação';
  
  window.scrollTo({ top: document.getElementById('card-nova-solicitacao').offsetTop - 20, behavior: 'smooth' });
}

let currentResolvingSolId = null;

function abrirModalCobertura(id) {
  const lista = DB.solicitacoes();
  const sol = lista.find(s => s.id === id);
  if (!sol) return;

  const srvs = DB.servidores();
  const servidor = srvs.find(s => s.id === sol.srvId);
  const servidorNome = servidor ? servidor.nome : 'Servidor';
  const setorOrigem = servidor ? (servidor.setor || '').trim().toLowerCase() : '';

  const inicio = sol.inicio;
  const fim = sol.fim;

  currentResolvingSolId = id;

  const mcNome = document.getElementById('mc-servidor-nome');
  if (mcNome) mcNome.textContent = servidorNome;

  const mcInfo = document.getElementById('mc-info-extra');
  if (mcInfo) {
    mcInfo.innerHTML = setorOrigem
      ? `<span style="display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="tag" style="background:var(--accent);color:#fff;padding:2px 10px;border-radius:12px;font-size:.75rem">Setor: ${servidor.setor}</span><span style="font-size:.78rem;color:var(--muted)">Período: ${fmtDate(inicio)} a ${fmtDate(fim)}</span></span>`
      : `<span style="font-size:.78rem;color:var(--muted)">Período: ${fmtDate(inicio)} a ${fmtDate(fim)}</span>`;
  }

  const cobSel = document.getElementById('mc-cobertura-select');
  if (cobSel) {
    const outrosServidores = getServidoresAcessiveis().filter(s => s.id !== sol.srvId);

    const mesmoSetorDisponivel = [];
    const mesmoSetorAusente = [];
    const outrosSetores = [];

    outrosServidores.forEach(s => {
      const setorSrv = (s.setor || '').trim().toLowerCase();
      const mesmoSetor = setorOrigem && setorSrv === setorOrigem;
      if (mesmoSetor) {
        if (inicio && fim && temAusenciaNoPeriodo(s.id, inicio, fim)) {
          mesmoSetorAusente.push(s);
        } else {
          mesmoSetorDisponivel.push(s);
        }
      } else {
        outrosSetores.push(s);
      }
    });

    const sortFn = (a, b) => a.nome.localeCompare(b.nome);
    mesmoSetorDisponivel.sort(sortFn);
    mesmoSetorAusente.sort(sortFn);
    outrosSetores.sort(sortFn);

    let html = '<option value="">— Sem substituto (nenhuma cobertura) —</option>';

    if (mesmoSetorDisponivel.length > 0) {
      html += '<optgroup label="✅ Mesmo setor — Disponível">';
      html += mesmoSetorDisponivel.map(s =>
        `<option value="${s.id}">${s.nome} (Mat. ${s.matricula})</option>`
      ).join('');
      html += '</optgroup>';
    }

    if (mesmoSetorAusente.length > 0) {
      html += '<optgroup label="⚠️ Mesmo setor — Também ausente no período">';
      html += mesmoSetorAusente.map(s =>
        `<option value="${s.id}">${s.nome} (Mat. ${s.matricula})</option>`
      ).join('');
      html += '</optgroup>';
    }

    if (outrosSetores.length > 0) {
      html += '<optgroup label="📌 Outros setores">';
      html += outrosSetores.map(s =>
        `<option value="${s.id}">${s.nome} (Mat. ${s.matricula})</option>`
      ).join('');
      html += '</optgroup>';
    }

    cobSel.innerHTML = html;

    if (mesmoSetorDisponivel.length > 0) {
      cobSel.value = mesmoSetorDisponivel[0].id;
    }
  }

  abrirModal('modal-cobertura');
}

async function confirmarCoberturaEAutorizar() {
  if (!currentResolvingSolId) return;

  const cobSel = document.getElementById('mc-cobertura-select');
  let cobId = null;
  let cobNome = null;

  if (cobSel && cobSel.value) {
    cobId = cobSel.value;
    const srv = DB.servidores().find(s => s.id === cobId);
    if (srv) {
      cobNome = srv.nome;
    }
  }

  fecharModal('modal-cobertura');
  const solId = currentResolvingSolId;
  currentResolvingSolId = null;

  await executarResolucaoSolicitacao(solId, 'autorizado', cobId, cobNome);
}

async function resolverSolicitacao(id, novoStatus) {
  if (novoStatus === 'autorizado') {
    abrirModalCobertura(id);
  } else {
    await executarResolucaoSolicitacao(id, novoStatus, null, null);
  }
}

async function executarResolucaoSolicitacao(id, novoStatus, coberturaId, coberturaNome) {
  const lista = DB.solicitacoes();
  const idx = lista.findIndex(s => s.id === id);
  if (idx < 0) return;

  const sol = lista[idx];
  sol.status = novoStatus;
  
  if (novoStatus === 'autorizado') {
     const srvs = DB.servidores();
     const sIdx = srvs.findIndex(s => s.id === sol.srvId);
     if (sIdx >= 0) {
        if (sol.tipo === 'ferias_anual') srvs[sIdx].feriasReg = Math.max(0, (srvs[sIdx].feriasReg || 0) - 1);
        if (sol.tipo === 'ferias_premio') srvs[sIdx].feriasPrem = Math.max(0, (srvs[sIdx].feriasPrem || 0) - 1);
        await DB.saveServidores(srvs);
     }

     let prefix = '';
     if (coberturaNome && coberturaId) {
       prefix = `[Cobertura: ${coberturaNome} (ID: ${coberturaId})] `;
       sol.obs = prefix + (sol.obs || '');
     }

     if (sol.tipo.includes('ferias')) {
        const progs = DB.programacoes();
        if (sol.periodos && sol.periodos.length > 0) {
          sol.periodos.forEach((p, pIdx) => {
            progs.push({
              id: uid(), srvId: sol.srvId, solId: sol.id,
              tipo: sol.tipo === 'ferias_anual' ? 'anual' : 'premio',
              inicio: p.inicio, fim: p.fim, retorno: p.fim,
              obs: prefix + `Autorizado via Solicitação (${pIdx+1}/${sol.periodos.length}). ${sol.obs || ''}`,
              criadoEm: new Date().toISOString()
            });
          });
        } else {
          progs.push({
            id: uid(), srvId: sol.srvId, solId: sol.id,
            tipo: sol.tipo === 'ferias_anual' ? 'anual' : 'premio',
            inicio: sol.inicio, fim: sol.fim, retorno: sol.fim,
            obs: prefix + `Autorizado via Solicitação. ${sol.obs || ''}`,
            criadoEm: new Date().toISOString()
          });
        }
        await DB.saveProgramacoes(progs);
      } else {
         const folgas = DB.folgas();
         const novaFolga = {
            id: uid(), srvId: sol.srvId, solId: sol.id, tipo: 'gozo', 
            data: sol.inicio, 
            dataItems: sol.dataItems || [{ data: sol.inicio, peso: 1 }],
            qtd: sol.qtd || 1,
            obs: prefix + `Folga autorizada via Solicitação. ${sol.obs || ''}`,
            criadoEm: new Date().toISOString()
         };
         folgas.push(novaFolga);
         await DB.saveFolgas(folgas, [novaFolga]);
      }
     atualizarBadge();
  }

  // Atualizar apenas esta solicitação
  await DB.saveSolicitacao(sol);
  renderSolicitacoes();
  await atualizarBadgeSolicitacoes();
  toastMsg(`Solicitação ${novoStatus === 'autorizado' ? 'autorizada' : 'negada'}!`);
  DB.saveLog('Solicitação', `Resolveu solicitação (ID: ${id}) para status: ${novoStatus.toUpperCase()}`, 'solicitacoes', id);
}

async function excluirSolicitacao(id) {
  const sol = DB.solicitacoes().find(s => s.id === id);
  if (!sol) return;

  const msg = sol.status === 'autorizado' 
    ? 'Esta solicitação já foi APROVADA e gerou registros oficiais. Ao excluir, você também removerá os registros de férias/folgas vinculados. Deseja continuar?'
    : 'Deseja excluir esta solicitação?';

  if (!confirm(msg)) return;

  // Remover oficiais vinculados e devolver saldo se for férias
  if (sol.status === 'autorizado') {
    const srvs = DB.servidores();
    const sIdx = srvs.findIndex(s => s.id === sol.srvId);
    if (sIdx >= 0) {
       if (sol.tipo === 'ferias_anual') srvs[sIdx].feriasReg = (srvs[sIdx].feriasReg || 0) + 1;
       if (sol.tipo === 'ferias_premio') srvs[sIdx].feriasPrem = (srvs[sIdx].feriasPrem || 0) + 1;
       await DB.saveServidores(srvs);
    }

    if (sol.tipo.includes('ferias')) {
      const progs = DB.programacoes().filter(p => p.solId !== id);
      await DB.saveProgramacoes(progs);
    } else {
      const folgas = DB.folgas().filter(f => f.solId !== id);
      await DB.saveFolgas(folgas);
      renderDashboard();
    }
    atualizarBadge();
  }

  _remoteData.solicitacoes = _remoteData.solicitacoes.filter(s => s.id !== id);
  localStorage.setItem('srv_solicitacoes', JSON.stringify(_remoteData.solicitacoes));
  await DB.deleteSolicitacao(id);
  renderSolicitacoes();
  await atualizarBadgeSolicitacoes();
  toastMsg('Solicitação e registros vinculados removidos.');
  DB.saveLog('Exclusão', `Excluiu solicitação (ID: ${id})`, 'solicitacoes', id);
}

function atualizarBadgeSolicitacoes() {
  const sessaoStr = sessionStorage.getItem('ferias_sessao');
  if (!sessaoStr) return;
  const sessao = JSON.parse(sessaoStr);
  const allSolic = DB.solicitacoes();
  
  let pendentes = 0;
  if (sessao.role === 'admin' || sessao.role === 'gestor') {
     const servAcessiveis = getServidoresAcessiveis();
     const srvIds = servAcessiveis.map(s => s.id);
     pendentes = allSolic.filter(s => s.status === 'pendente' && srvIds.includes(s.srvId)).length;
  }

  const badge = document.getElementById('badge-solic');
  if (badge) {
    badge.textContent = pendentes;
    badge.style.display = pendentes > 0 ? 'inline-flex' : 'none';
  }
}
