// Módulo Folgas.
// Crédito, usufruto, saldo, histórico e edição de folgas.

function popularSelectFolgasCred(setor) {
  const sel = document.getElementById('fg-srv-cred'); if (!sel) return;
  const prev = sel.value;
  const lista = getServidoresAcessiveis().filter(s => !setor || s.setor === setor);
  sel.innerHTML = '<option value="">Selecione...</option>' + lista.map(s => `<option value="${s.id}">${s.nome} (Mat. ${s.matricula})</option>`).join('');
  if (prev && lista.some(s => s.id === prev)) sel.value = prev;
}

function popularSelectFolgasDeb(setor) {
  const sel = document.getElementById('fg-srv-deb'); if (!sel) return;
  const prev = sel.value;
  const lista = getServidoresAcessiveis().filter(s => !setor || s.setor === setor);
  sel.innerHTML = '<option value="">Selecione...</option>' + lista.map(s => `<option value="${s.id}">${s.nome} (Mat. ${s.matricula})</option>`).join('');
  if (prev && lista.some(s => s.id === prev)) sel.value = prev;
}

let fpGozo = null;

let currentGozoDates = {};

function initFlatpickrFolga() {
  const el = document.getElementById("fg-data-deb");
  if (!el || typeof flatpickr === 'undefined') return;
  
  if (fpGozo) fpGozo.destroy();

  fpGozo = flatpickr(el, {
    mode: "multiple",
    dateFormat: "Y-m-d",
    locale: flatpickr.l10ns.pt,
    onChange: function(selectedDates) {
      const datesArr = selectedDates.map(d => {
        const y = d.getFullYear();
        const m = (d.getMonth() + 1).toString().padStart(2, '0');
        const dia = d.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${dia}`;
      });
      syncGozoDates(datesArr);
    }
  });
}

function syncGozoDates(datesArr) {
  const newMap = {};
  datesArr.forEach(d => {
    newMap[d] = currentGozoDates[d] || { peso: 1, turno: 'Integral' };
  });
  currentGozoDates = newMap;
  renderSelectedDatesList();
}

function renderSelectedDatesList() {
  const container = document.getElementById('fg-datas-selecionadas-list');
  if (!container) return;
  const entries = Object.entries(currentGozoDates).sort((a,b) => a[0].localeCompare(b[0]));
  
  if (!entries.length) {
    container.innerHTML = '<div style="font-size:.8rem;color:var(--muted);background:var(--surface);padding:10px;border-radius:6px;border:1px dashed var(--border)">Nenhum dia selecionado no calendário.</div>';
    document.getElementById('fg-qtd-deb').value = 0;
    return;
  }
  let totalNum = 0;
  container.innerHTML = entries.map(([data, obj]) => {
    const weight = typeof obj === 'object' ? obj.peso : obj;
    const shift = typeof obj === 'object' ? obj.turno : 'Integral';
    totalNum += weight;
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;background:var(--surface);padding:8px 12px;border-radius:8px;border:1px solid var(--border)">
        <span style="font-weight:600;font-size:.85rem">${fmtDate(data)}</span>
        <div style="display:flex;background:var(--bg);padding:3px;border-radius:6px;gap:2px">
          <button type="button" class="btn btn-sm ${weight === 1 ? 'btn-primary' : 'btn-ghost'}" style="font-size:.65rem;padding:2px 8px" onclick="setShiftData('${data}', 1, 'Integral')">Dia Inteiro</button>
          <button type="button" class="btn btn-sm ${weight === 0.5 && shift === 'Manhã' ? 'btn-warn' : 'btn-ghost'}" style="font-size:.65rem;padding:2px 8px" onclick="setShiftData('${data}', 0.5, 'Manhã')">☀️ Manhã</button>
          <button type="button" class="btn btn-sm ${weight === 0.5 && shift === 'Tarde' ? 'btn-warn' : 'btn-ghost'}" style="font-size:.65rem;padding:2px 8px" onclick="setShiftData('${data}', 0.5, 'Tarde')">🌗 Tarde</button>
        </div>
      </div>
    `;
  }).join('');
  
  document.getElementById('fg-qtd-deb').value = totalNum;
}

function setShiftData(data, peso, turno) {
  currentGozoDates[data] = { peso, turno };
  renderSelectedDatesList();
}

function limparDatasUsufruto() {
  if (fpGozo) fpGozo.clear();
  currentGozoDates = {};
  renderSelectedDatesList();
}

function saldoFolgas(srvId) {
  return DB.folgas()
    .filter(f => f.srvId === srvId)
    .reduce((acc, f) => acc + (f.tipo === 'credito' ? f.qtd : -f.qtd), 0);
}

function renderFolgas() {
  popularSelectsFolgas();
  atualizarSaldoDisplay();
  carregarFolgasDisp();
  renderHistoricoFolgas();
  atualizarBadgeFolgas();
}

function popularSelectsFolgas() {
  const srvs = getServidoresAcessiveis();
  const opts = '<option value="">Selecione...</option>' + srvs.map(s => `<option value="${s.id}">${s.nome} (${s.matricula})</option>`).join('');
  ['fg-srv-cred','fg-srv-deb'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = opts;
    if (prev && srvs.some(s => s.id === prev)) el.value = prev;
  });

  const histEl = document.getElementById('fg-hist-srv');
  if (histEl) {
    const prev = histEl.value;
    histEl.innerHTML = '<option value="">Todos os Servidores</option>' + srvs.map(s => `<option value="${s.id}">${s.nome}</option>`).join('');
    if (prev && srvs.some(s => s.id === prev)) histEl.value = prev;
  }
}

function atualizarSaldoDisplay() {
  const srvId = document.getElementById('fg-srv-deb')?.value || document.getElementById('fg-srv-cred')?.value;
  const el = document.getElementById('fg-saldo-display');
  if (!el) return;
  if (!srvId) { el.style.display = 'none'; return; }
  const saldo = saldoFolgas(srvId);
  const cls = saldo > 0 ? 'positivo' : saldo < 0 ? 'negativo' : 'zero';
  const icone = saldo > 0 ? '🟢' : saldo < 0 ? '🔴' : '⚪';
  el.style.display = 'block';
  el.innerHTML = `<div class="saldo-box ${cls}"><span class="saldo-num">${saldo > 0 ? '+' : ''}${saldo}</span><div><strong>Saldo atual de folgas</strong><br><small style="color:var(--muted)">${icone} ${saldo === 0 ? 'Sem saldo' : saldo > 0 ? 'Dias disponíveis' : 'Saldo negativo'}</small></div></div>`;
}

function carregarFolgasDisp() {
  const srvId = document.getElementById('fg-srv-deb')?.value;
  const sel = document.getElementById('fg-ref-deb');
  if (!sel) return;
  const negBox = document.getElementById('fg-neg-box');
  const cobSel = document.getElementById('fg-cobertura-deb');
  if (!srvId) {
    sel.innerHTML = '<option value="">Selecione o servidor primeiro...</option>';
    if (cobSel) cobSel.innerHTML = '<option value="">Selecione o servidor primeiro...</option>';
    if (negBox) negBox.style.display = 'none';
    return;
  }
  const creditos = DB.folgas().filter(f => f.srvId === srvId && f.tipo === 'credito');
  const saldo = saldoFolgas(srvId);
  sel.innerHTML = '<option value="">— Folga não vinculada a crédito específico —</option>' +
    creditos.map(c => `<option value="${c.id}">${fmtDate(c.data)} · ${c.qtd}d · ${c.motivo.substring(0,50)}${c.motivo.length>50?'...':''}</option>`).join('');

  if (cobSel) {
    const outrosServidores = getServidoresAcessiveis().filter(s => s.id !== srvId);
    const srvOrigem = DB.servidores().find(s => s.id === srvId);
    const setorOrigem = srvOrigem ? (srvOrigem.setor || '').trim().toLowerCase() : '';
    const mesmoSetor = [];
    const outrosSetores = [];
    outrosServidores.forEach(s => {
      if (setorOrigem && (s.setor || '').trim().toLowerCase() === setorOrigem) {
        mesmoSetor.push(s);
      } else {
        outrosSetores.push(s);
      }
    });
    const sortFn = (a, b) => a.nome.localeCompare(b.nome);
    mesmoSetor.sort(sortFn);
    outrosSetores.sort(sortFn);
    let html = '<option value="">— Sem substituto (nenhuma cobertura) —</option>';
    if (mesmoSetor.length > 0) {
      html += '<optgroup label="✅ Mesmo setor">';
      html += mesmoSetor.map(s => `<option value="${s.id}">${s.nome} (Mat. ${s.matricula})</option>`).join('');
      html += '</optgroup>';
    }
    if (outrosSetores.length > 0) {
      html += '<optgroup label="📌 Outros setores">';
      html += outrosSetores.map(s => `<option value="${s.id}">${s.nome} (Mat. ${s.matricula})</option>`).join('');
      html += '</optgroup>';
    }
    cobSel.innerHTML = html;
    if (mesmoSetor.length > 0) cobSel.value = mesmoSetor[0].id;
  }

  if (negBox) negBox.style.display = saldo <= 0 ? 'block' : 'none';
}

async function adicionarFolga() {
  const srvId = document.getElementById('fg-srv-cred').value;
  const data = document.getElementById('fg-data-cred').value;
  const qtdReal = parseFloat(document.getElementById('fg-qtd-cred').value);
  const motivo = document.getElementById('fg-motivo-cred').value.trim();
  if (!srvId) return toastMsg('Selecione o servidor!', 'error');
  if (!data) return toastMsg('Informe a data da folga!', 'error');
  if (!qtdReal || qtdReal <= 0) return toastMsg('Informe a quantidade de dias!', 'error');
  if (!motivo) return toastMsg('O motivo é obrigatório!', 'error');

  const folgas = DB.folgas();
  const novoCredito = { id: uid(), srvId, tipo: 'credito', data, qtd: qtdReal, motivo, criadoEm: new Date().toISOString() };
  folgas.push(novoCredito);
  await DB.saveFolgas(folgas, [novoCredito]);

  document.getElementById('fg-data-cred').value = '';
  document.getElementById('fg-qtd-cred').value = 1;
  document.getElementById('fg-motivo-cred').value = '';
  atualizarSaldoDisplay();
  renderHistoricoFolgas();
  atualizarBadgeFolgas();
  toastMsg(`+${qtdReal} dia(s) adicionado(s) ao banco!`);
  DB.saveLog('Crédito Folga', `Adicionou +${qtdReal} dia(s) de folga para (SrvID: ${srvId}). Motivo: ${motivo}`, 'folgas', srvId);
}

async function registrarUsufrutoFolga() {
  const srvId = document.getElementById('fg-srv-deb').value;
  const refId = document.getElementById('fg-ref-deb').value;
  const obs = document.getElementById('fg-obs-deb').value.trim();
  const entries = Object.entries(currentGozoDates);

  if (!srvId) return toastMsg('Selecione o servidor!', 'error');
  if (!entries.length) return toastMsg('Selecione os dias no calendário!', 'error');

  let qtdTotal = 0;
  const dataItems = entries.map(([d, obj]) => {
    const p = typeof obj === 'object' ? obj.peso : obj;
    const t = typeof obj === 'object' ? obj.turno : 'Manhã';
    qtdTotal += p;
    return { data: d, peso: p, turno: p === 0.5 ? t : 'Integral' };
  }).sort((a,b) => a.data.localeCompare(b.data));

  const dataString = dataItems.map(di => di.data).join(', ');
  const qtd = qtdTotal;

  // ==== DETECTOR DE CONFLITOS (USUFRUTO FOLGA) ====
  const conflitos = verificarConflitosSetorFuncao(srvId, dataItems.map(di => ({ inicio: di.data, fim: di.data })));
  if (conflitos.length > 0) {
    const msg = `⚠️ ALERTA DE CONFLITO\n\n` +
                `Servidores da mesma função e setor já ausentes neste período:\n\n` +
                conflitos.map(c => `• ${c}`).join('\n') +
                `\n\nDeseja registrar o usufruto mesmo assim?`;
    if (!confirm(msg)) return;
  }
  // ===============================================================

  // ==== VALIDAÇÃO DE LIMITES CONFIGURÁVEIS ====
  const cfg = DB.config();
  const maxConsec = cfg.maxFolgasConsecutivas || 0;
  const maxMes = cfg.maxFolgasMes || 0;
  const datasOrdenadas = dataItems.map(d => d.data).sort();

  if (maxConsec > 0) {
    let streak = 1;
    let maxStreak = 1;
    for (let i = 1; i < datasOrdenadas.length; i++) {
      const prev = new Date(datasOrdenadas[i-1] + 'T00:00:00');
      const curr = new Date(datasOrdenadas[i] + 'T00:00:00');
      const diff = (curr - prev) / 86400000;
      if (diff === 1) { streak++; maxStreak = Math.max(maxStreak, streak); }
      else { streak = 1; }
    }
    if (maxStreak > maxConsec) {
      const msg = `⚠️ LIMITE DE DIAS CONSECUTIVOS EXCEDIDO\n\n` +
                  `Máximo permitido: ${maxConsec} dias consecutivos.\n` +
                  `Você selecionou ${maxStreak} dias seguidos.\n\nDeseja registrar mesmo assim?`;
      if (!confirm(msg)) return;
    }
  }

  if (maxMes > 0) {
    const mesAno = datasOrdenadas[0].substring(0, 7);
    const folgasNoMes = DB.folgas().filter(f =>
      f.srvId === srvId && f.tipo === 'debito' && f.dataItems &&
      f.dataItems.some(di => di.data.startsWith(mesAno))
    );
    const totalNoMes = folgasNoMes.reduce((acc, f) => acc + f.qtd, 0) + qtd;
    if (totalNoMes > maxMes) {
      const msg = `⚠️ LIMITE MENSAL DE FOLGAS EXCEDIDO\n\n` +
                  `Máximo permitido: ${maxMes} dias no mês ${mesAno}.\n` +
                  `Com este registro, o total será de ${totalNoMes} dias.\n\nDeseja registrar mesmo assim?`;
      if (!confirm(msg)) return;
    }
  }
  // ===============================================================

  const cobSel = document.getElementById('fg-cobertura-deb');
  let finalObs = obs;
  if (cobSel && cobSel.value) {
    const srvCob = DB.servidores().find(s => s.id === cobSel.value);
    if (srvCob) {
      finalObs = `[Cobertura: ${srvCob.nome} (ID: ${srvCob.id})] ${obs}`;
    }
  }

  const saldo = saldoFolgas(srvId);
  const negativo = saldo - qtd < 0;
  const folgas = DB.folgas();
  let novaFolga = { id: uid(), srvId, tipo: 'debito', data: dataString, dataItems, qtd, refId: refId || null, obs: finalObs, criadoEm: new Date().toISOString() };

  if (saldo <= 0 || negativo) {
    const descPag = document.getElementById('fg-pag-desc').value.trim();
    if (!descPag) {
      document.getElementById('fg-neg-box').style.display = 'block';
      return toastMsg('Saldo insuficiente! Descreva a compensação prevista.', 'error');
    }
    const msg = saldo <= 0 ? `⚠️ Servidor sem saldo!` : `⚠️ Saldo insuficiente (${saldo}d).`;
    if (!confirm(`${msg}\nO saldo ficará em ${(saldo-qtd).toFixed(1)}d.\n\nDeseja continuar?`)) return;
    
    novaFolga.negativo = true;
    novaFolga.descPagamento = descPag;
  } else {
    novaFolga.negativo = false;
  }

  folgas.push(novaFolga);
  await DB.saveFolgas(folgas, [novaFolga]);
  limparFormUsufruto();
  renderHistoricoFolgas();
  atualizarBadgeFolgas();
  toastMsg(`Usufruto de ${qtd} dia(s) registrado.`);
  DB.saveLog('Usufruto Folga', `Registrou usufruto de ${qtd} dia(s) para (SrvID: ${srvId})`, 'folgas', srvId);
  if(confirm('Imprimir comprovante?')) imprimirComprovanteFolga(novaFolga.id);
}

function limparFormUsufruto() {
  if (fpGozo) fpGozo.clear();
  currentGozoDates = {};
  renderSelectedDatesList();
  document.getElementById('fg-srv-deb').value = '';
  document.getElementById('fg-qtd-deb').value = 0;
  document.getElementById('fg-obs-deb').value = '';
  document.getElementById('fg-pag-desc').value = '';
  document.getElementById('fg-neg-box').style.display = 'none';
  document.getElementById('fg-ref-deb').innerHTML = '<option value="">Selecionar folga do banco...</option>';
  const cobSel = document.getElementById('fg-cobertura-deb');
  if (cobSel) cobSel.innerHTML = '<option value="">Selecione o servidor primeiro...</option>';
}

function renderHistoricoFolgas() {
  const filtSrv = document.getElementById('fg-hist-srv')?.value || '';
  const filtTipo = document.getElementById('fg-hist-tipo')?.value || '';
  const servidores = DB.servidores();

  const sessao = JSON.parse(sessionStorage.getItem('ferias_sessao') || '{}');
  const isAdmin = sessao.role === 'admin';
  const isGestor = sessao.role === 'gestor';
  
  let lista = getFolgasAcessiveis().filter(f =>
    (!filtSrv || f.srvId === filtSrv) && (!filtTipo || f.tipo === filtTipo)
  ).sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));

  const cont = document.getElementById('fg-historico');
  if (!lista.length) { cont.innerHTML = '<div class="empty"><div class="icon">🏖️</div><p>Nenhuma movimentação registrada.</p></div>'; return; }

  const servidoresAcessiveis = getServidoresAcessiveis();
  cont.innerHTML = lista.map(f => {
    const srv = servidoresAcessiveis.find(s => s.id === f.srvId);
    const cls = f.tipo === 'credito' ? 'credito' : f.negativo ? 'debito-neg' : 'debito';
    const icone = f.tipo === 'credito' ? '➕' : f.negativo ? '⚠️' : '➖';
    const qtdLabel = f.qtd === 0.5 ? 'Meio dia' : `${f.qtd.toString().replace('.',',')} dia(s)`;
    const sinalQtd = f.tipo === 'credito' ? `+${qtdLabel}` : `−${qtdLabel}`;
    const cor = f.tipo === 'credito' ? 'var(--success)' : f.negativo ? 'var(--warning)' : 'var(--danger)';
    
    let datasDesc = '';
    if (f.tipo === 'credito') {
      datasDesc = `📅 ${fmtDate(f.data)} &nbsp;|&nbsp; 📝 Motivo: <em>${f.motivo}</em>`;
    } else {
      const parsed = parseFolgaObs(f.obs);
      const tagCob = parsed.coberturaNome ? ` <span class="tag tag-purple">👥 Substituto (Cobertura): ${esc(parsed.coberturaNome)}</span>` : '';
      datasDesc = `📅 ${f.dataItems ? f.dataItems.map(di => `${fmtDate(di.data)} (${di.peso === 1 ? 'Int' : `Meio - ${di.turno}`})`).join(', ') : fmtDate(f.data)} &nbsp;|&nbsp; 📝 Obs: <em>${esc(parsed.obs || '-')}</em>${tagCob}`;
    }

    return `<div class="folga-hist-item ${cls}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
        <div>
          <strong>${icone} ${f.tipo === 'credito' ? 'Crédito adicionado' : f.negativo ? 'Usufruto (Registrado c/ Saldo Negativo)' : 'Usufruto registrado'}</strong>
          <span style="margin-left:10px;font-size:.8rem;color:var(--muted)">${esc(srv?.nome || '-')}</span>
          ${f.negativo ? '<span style="margin-left:6px; font-size:10px; background:var(--danger); color:white; padding:2px 6px; border-radius:4px; font-weight:700;">SALDO NEGATIVO</span>' : ''}
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-weight:700;font-size:1rem;color:${cor}">${sinalQtd}</span>
          ${f.tipo === 'debito' ? `<button class="btn btn-primary btn-sm" onclick="imprimirComprovanteFolga('${f.id}')" title="Imprimir Comprovante">🖨️</button>` : ''}
          ${f.tipo === 'debito' ? `<button class="btn btn-ghost btn-sm" onclick="gerarLinkComprovante('${f.id}')" title="Compartilhar Link">🔗</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="abrirModalEditarFolga('${f.id}')" title="Editar">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="excluirFolga('${f.id}')" title="Excluir">🗑️</button>
        </div>
      </div>
      <div style="font-size:.82rem;color:var(--muted);margin-top:6px">
        ${datasDesc}
        ${f.negativo ? `<br>💳 <strong style="color:var(--warning)">Pagamento previsto:</strong> ${esc(f.descPagamento)}` : ''}
      </div>
    </div>`;
  }).join('');
}

async function excluirFolga(id) {
  if (!confirm('Excluir este lançamento de folga?')) return;

  // 1. Apaga do Supabase
  await DB.deleteFolga(id);

  // 2. Apaga localmente
  const novaLista = DB.folgas().filter(f => f.id !== id);
  _remoteData.folgas = novaLista;
  localStorage.setItem('srv_folgas', JSON.stringify(novaLista));

  renderHistoricoFolgas();
  atualizarSaldoDisplay();
  atualizarBadgeFolgas();
  renderDashboard();
  toastMsg('Lançamento excluído permanentemente.');
  DB.saveLog('Exclusão Folga', `Excluiu lançamento de folga (ID: ${id})`, 'folgas', id);
}

function abrirModalEditarFolga(id) {
  const f = DB.folgas().find(x => x.id === id);
  if (!f) return toastMsg('Registro não encontrado!', 'error');
  const srv = DB.servidores().find(s => s.id === f.srvId);
  document.getElementById('ef-id').value = f.id;
  document.getElementById('ef-tipo').value = f.tipo;
  document.getElementById('ef-srv').value = srv ? `${srv.nome} (Mat. ${srv.matricula})` : f.srvId;
  document.getElementById('ef-tipo-label').value = f.tipo === 'credito' ? 'Crédito (Banco)' : 'Débito (Usufruto)';
  document.getElementById('ef-qtd').value = f.qtd;

  const isCred = f.tipo === 'credito';
  document.getElementById('ef-data-group').style.display = isCred ? '' : 'none';
  document.getElementById('ef-datas-group').style.display = isCred ? 'none' : '';
  document.getElementById('ef-motivo-group').style.display = isCred ? '' : 'none';
  document.getElementById('ef-obs-group').style.display = isCred ? 'none' : '';
  document.getElementById('ef-titulo').textContent = isCred ? '✏️ Editar Crédito' : '✏️ Editar Usufruto';

  if (isCred) {
    document.getElementById('ef-data').value = f.data || '';
    document.getElementById('ef-motivo').value = f.motivo || '';
  } else {
    const datas = f.dataItems
      ? f.dataItems.map(di => `${fmtDate(di.data)} (${di.peso === 1 ? 'Integral' : `${di.turno}`})`).join(', ')
      : f.data || '';
    document.getElementById('ef-datas').value = datas;
    const parsed = parseFolgaObs(f.obs);
    document.getElementById('ef-obs').value = parsed.obs || '';
  }

  document.getElementById('modal-editar-folga').classList.add('open');
}

async function salvarEdicaoFolga() {
  const id = document.getElementById('ef-id').value;
  if (!id) return;
  const folgas = DB.folgas();
  const idx = folgas.findIndex(x => x.id === id);
  if (idx === -1) return toastMsg('Registro não encontrado!', 'error');

  const f = folgas[idx];
  const isCred = f.tipo === 'credito';
  const qtd = parseFloat(document.getElementById('ef-qtd').value);
  if (!qtd || qtd <= 0) return toastMsg('Quantidade inválida!', 'error');

  if (isCred) {
    const data = document.getElementById('ef-data').value;
    const motivo = document.getElementById('ef-motivo').value.trim();
    if (!data) return toastMsg('Informe a data!', 'error');
    if (!motivo) return toastMsg('Informe o motivo!', 'error');
    f.data = data;
    f.qtd = qtd;
    f.motivo = motivo;
  } else {
    const obs = document.getElementById('ef-obs').value.trim();
    f.qtd = qtd;
    const parsed = parseFolgaObs(f.obs);
    f.obs = parsed.coberturaNome
      ? `[Cobertura: ${parsed.coberturaNome} (ID: ${parsed.coberturaId})] ${obs}`
      : obs;
  }

  folgas[idx] = f;
  await DB.saveFolgas(folgas, [f]);
  fecharModal('modal-editar-folga');
  renderHistoricoFolgas();
  atualizarSaldoDisplay();
  atualizarBadgeFolgas();
  toastMsg('Lançamento atualizado!');
  DB.saveLog('Edição Folga', `Editou lançamento de folga (ID: ${id})`, 'folgas', id);
}

function atualizarBadgeFolgas() {
  const badge = document.getElementById('badge-folgas');
  if (!badge) return;
  const temNeg = DB.servidores().some(s => saldoFolgas(s.id) < 0);
  badge.style.display = temNeg ? 'inline-block' : 'none';
}

function parseFolgaObs(str) {
  const result = { coberturaNome: null, coberturaId: null, obs: str || '' };
  if (!str) return result;
  const match = str.match(/^\[Cobertura:\s*(.+?)\s*\(ID:\s*(.+?)\)\]\s*(.*)/);
  if (match) {
    result.coberturaNome = match[1];
    result.coberturaId = match[2];
    result.obs = match[3] || '';
  }
  return result;
}

function temAusenciaNoPeriodo(srvId, inicio, fim) {
  const programacoes = getProgramacoesAcessiveis().filter(function(p) { return p.srvId === srvId; });
  for (let i = 0; i < programacoes.length; i++) {
    const p = programacoes[i];
    if (p.inicio <= fim && (p.fim || p.inicio) >= inicio) return true;
  }
  const folgas = getFolgasAcessiveis().filter(function(f) { return f.srvId === srvId && f.tipo === 'debito'; });
  for (let i = 0; i < folgas.length; i++) {
    const f = folgas[i];
    if (f.dataItems) {
      for (let j = 0; j < f.dataItems.length; j++) {
        if (f.dataItems[j].data >= inicio && f.dataItems[j].data <= fim) return true;
      }
    } else if (f.data) {
      const datas = f.data.split(',').map(function(x) { return x.trim(); });
      for (let j = 0; j < datas.length; j++) {
        if (datas[j] >= inicio && datas[j] <= fim) return true;
      }
    }
  }
  return false;
}

function verificarConflitosSetorFuncao(srvId, periodos) {
  const srv = DB.servidores().find(function(s) { return s.id === srvId; });
  if (!srv || !srv.setor || !srv.cargo) return [];
  const conflitos = [];
  const outros = DB.servidores().filter(function(s) { return s.id !== srvId && s.setor === srv.setor && s.cargo === srv.cargo; });
  for (let i = 0; i < outros.length; i++) {
    const outro = outros[i];
    const progs = getProgramacoesAcessiveis().filter(function(p) { return p.srvId === outro.id; });
    for (let j = 0; j < periodos.length; j++) {
      const pIni = periodos[j].inicio || periodos[j].data;
      const pFim = periodos[j].fim || periodos[j].data;
      if (progs.some(function(p) { return p.inicio <= pFim && (p.fim || p.inicio) >= pIni && !p.concluido; })) {
        conflitos.push(outro.nome + ' (' + outro.setor + ') — ausente de ' + fmtDate(pIni) + ' a ' + fmtDate(pFim));
        break;
      }
    }
    const folgas = DB.folgas().filter(function(f) { return f.srvId === outro.id && f.tipo === 'debito'; });
    for (let j = 0; j < periodos.length; j++) {
      const pIni = periodos[j].inicio || periodos[j].data;
      const pFim = periodos[j].fim || periodos[j].data;
      if (folgas.some(function(f) {
        if (f.dataItems) return f.dataItems.some(function(di) { return di.data >= pIni && di.data <= pFim; });
        if (f.data) return f.data.split(',').map(function(x) { return x.trim(); }).some(function(d) { return d >= pIni && d <= pFim; });
        return false;
      })) {
        conflitos.push(outro.nome + ' (' + outro.setor + ') — folga de ' + fmtDate(pIni) + ' a ' + fmtDate(pFim));
        break;
      }
    }
  }
  return conflitos;
}
