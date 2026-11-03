// Módulo Banco de Horas.
// Lançamentos, ajustes, saldo e histórico.

// ===================== HORAS EM HH:MM =====================
// Converte o que o usuário digitou em horas decimais. Aceita: "1:30", "1h30", "1h", "1,5", "1.5", "90min".
function parseHoras(valor) {
  if (valor === null || valor === undefined) return 0;
  let t = String(valor).trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return 0;
  let neg = false;
  if (t.startsWith('-')) { neg = true; t = t.slice(1); }
  let horas = NaN;
  let m;
  if ((m = /^(\d+)min$/.exec(t))) horas = parseInt(m[1], 10) / 60;
  else if ((m = /^(\d+)[:h](\d{1,2})?(m|min)?$/.exec(t))) horas = parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) / 60 : 0);
  else horas = parseFloat(t.replace(',', '.'));
  if (isNaN(horas)) return NaN;
  horas = Math.round(horas * 60) / 60; // arredonda ao minuto
  return neg ? -horas : horas;
}

// Exibe horas decimais como "1h30" (ou "-2h15").
function fmtHoras(decimal) {
  const v = Number(decimal) || 0;
  const neg = v < 0;
  const totalMin = Math.round(Math.abs(v) * 60);
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return (neg ? '-' : '') + h + 'h' + String(min).padStart(2, '0');
}

// Texto para preencher campos de edição ("1:30").
function horasParaCampo(decimal) {
  const totalMin = Math.round(Math.abs(Number(decimal) || 0) * 60);
  return Math.floor(totalMin / 60) + ':' + String(totalMin % 60).padStart(2, '0');
}

function lerCampoHoras(id) {
  const el = document.getElementById(id);
  return parseHoras(el ? el.value : 0);
}

// Ordem cronológica dos lançamentos: ano, mês e, no mesmo mês, ordem de criação.
function ordemBancoHoras(a, b) {
  return (a.ano - b.ano) || (a.mes - b.mes) ||
    String(a.criadoEm || '').localeCompare(String(b.criadoEm || '')) ||
    String(a.id).localeCompare(String(b.id));
}

// Saldo imediatamente antes de um lançamento (considera outros lançamentos do mesmo mês).
function saldoAntesDoRegistroBH(registro) {
  const todos = DB.bancoHoras().filter(r => r.srvId === registro.srvId).sort(ordemBancoHoras);
  let saldo = 0;
  for (const r of todos) {
    if (r.id === registro.id) break;
    saldo += (r.horasGeradas || 0) - (r.horasPagas || 0);
  }
  return saldo;
}

function renderBancoHoras() {
  const hoje = new Date();
  const bhAno = document.getElementById('bh-ano');
  if (bhAno && !bhAno.value) bhAno.value = hoje.getFullYear();
  const ajAno = document.getElementById('bh-ajuste-ano');
  if (ajAno && !ajAno.value) ajAno.value = hoje.getFullYear();
  const ajMes = document.getElementById('bh-ajuste-mes');
  if (ajMes && !ajMes.dataset.iniciado) { ajMes.value = String(hoje.getMonth()); ajMes.dataset.iniciado = '1'; }
  popularSelectBancoHoras('');
  popularSelectBancoHorasSaldo('');
  popularSelectBancoHorasAjuste('');
  renderHistoricoBancoHoras();
}

function popularSelectBancoHoras(setor) {
  const sel = document.getElementById('bh-srv');
  if (!sel) return;
  const servidores = getServidoresAcessiveis().filter(s => !setor || s.setor === setor);
  sel.innerHTML = '<option value="">Selecione...</option>' +
    servidores.map(s => `<option value="${s.id}">${s.nome} (${s.matricula})${s.setor ? ' - ' + s.setor : ''}</option>`).join('');
}

function popularSelectBancoHorasSaldo(setor) {
  const sel = document.getElementById('bh-saldo-srv');
  if (!sel) return;
  const servidores = getServidoresAcessiveis().filter(s => !setor || s.setor === setor);
  sel.innerHTML = '<option value="">Selecione...</option>' +
    servidores.map(s => `<option value="${s.id}">${s.nome} (${s.matricula})${s.setor ? ' - ' + s.setor : ''}</option>`).join('');
}

function popularSelectBancoHorasAjuste(setor) {
  const sel = document.getElementById('bh-ajuste-srv');
  if (!sel) return;
  const servidores = getServidoresAcessiveis().filter(s => !setor || s.setor === setor);
  sel.innerHTML = '<option value="">Selecione...</option>' +
    servidores.map(s => `<option value="${s.id}">${s.nome} (${s.matricula})${s.setor ? ' - ' + s.setor : ''}</option>`).join('');
}

async function adicionarAjusteBancoHoras() {
  const srvId = document.getElementById('bh-ajuste-srv').value;
  const tipo = document.getElementById('bh-ajuste-tipo').value;
  const horas = lerCampoHoras('bh-ajuste-horas');
  const autorizadoPor = document.getElementById('bh-ajuste-autorizado').value.trim();
  const motivo = document.getElementById('bh-ajuste-motivo').value.trim();
  // Mês/ano de referência do ajuste (antes era sempre o mês atual)
  const hoje = new Date();
  const mesEl = document.getElementById('bh-ajuste-mes');
  const anoEl = document.getElementById('bh-ajuste-ano');
  const mes = mesEl && mesEl.value !== '' ? parseInt(mesEl.value) : hoje.getMonth();
  const ano = anoEl && anoEl.value ? parseInt(anoEl.value) : hoje.getFullYear();

  if (!srvId) return toastMsg('Selecione um servidor!', 'error');
  if (!ano || ano < 2020) return toastMsg('Informe um ano de referência válido!', 'error');
  if (isNaN(horas) || horas <= 0) return toastMsg('Informe uma quantidade de horas válida (ex: 1:30)!', 'error');
  if (!motivo) return toastMsg('Informe o motivo do ajuste!', 'error');

  const novo = {
    id: gerarIdUnico(),
    srvId,
    mes,
    ano,
    horasGeradas: tipo === 'credito' ? horas : 0,
    horasPagas: tipo === 'debito' ? horas : 0,
    autorizadoPor,
    obs: `[Ajuste Manual - ${tipo === 'credito' ? 'Crédito' : 'Débito'}] ${motivo}`,
    tipoLancamento: 'ajuste',
    lancadoPor: (JSON.parse(sessionStorage.getItem('ferias_sessao') || '{}').nome) || '',
    criadoEm: new Date().toISOString()
  };

  const lista = DB.bancoHoras();
  lista.push(novo);
  await DB.saveBancoHoras(lista, [novo]);

  document.getElementById('bh-ajuste-horas').value = '1:00';
  document.getElementById('bh-ajuste-autorizado').value = '';
  document.getElementById('bh-ajuste-motivo').value = '';

  renderHistoricoBancoHoras();
  renderSaldoBancoHoras();
  toastMsg(`Ajuste manual de ${tipo === 'credito' ? 'crédito' : 'débito'} registrado com sucesso!`);
  DB.saveLog('Ajuste Banco de Horas', `Ajuste manual ${tipo} de ${fmtHoras(horas)} para servidor ${srvId} - ref. ${mes+1}/${ano}`, 'banco_horas', novo.id);
}

function gerarIdUnico() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function adicionarBancoHoras() {
  const srvId = document.getElementById('bh-srv').value;
  const mes = parseInt(document.getElementById('bh-mes').value);
  const ano = parseInt(document.getElementById('bh-ano').value);
  const horasGeradas = lerCampoHoras('bh-horas-geradas');
  const horasPagas = lerCampoHoras('bh-horas-pagas');
  const autorizadoPor = document.getElementById('bh-autorizado').value.trim();
  const obs = document.getElementById('bh-obs').value.trim();

  if (!srvId) return toastMsg('Selecione um servidor!', 'error');
  if (!ano || ano < 2020) return toastMsg('Informe um ano válido!', 'error');
  if (isNaN(horasGeradas) || isNaN(horasPagas) || horasGeradas < 0 || horasPagas < 0) return toastMsg('Horas inválidas! Use o formato 1:30 (uma hora e trinta).', 'error');
  if (horasGeradas <= 0 && horasPagas <= 0) return toastMsg('Informe ao menos horas geradas ou pagas!', 'error');

  // Aviso de lançamento repetido no mesmo mês
  const jaExiste = DB.bancoHoras().some(r => r.srvId === srvId && r.mes === mes && r.ano === ano && r.tipoLancamento !== 'ajuste');
  if (jaExiste && !confirm(`Já existe lançamento de banco de horas deste servidor em ${mes + 1}/${ano}.\n\nDeseja adicionar outro lançamento no mesmo mês?`)) return;

  const novo = {
    id: gerarIdUnico(),
    srvId,
    mes,
    ano,
    horasGeradas,
    horasPagas,
    autorizadoPor,
    obs,
    tipoLancamento: 'normal',
    lancadoPor: (JSON.parse(sessionStorage.getItem('ferias_sessao') || '{}').nome) || '',
    criadoEm: new Date().toISOString()
  };

  const lista = DB.bancoHoras();
  lista.push(novo);
  await DB.saveBancoHoras(lista, [novo]);

  document.getElementById('bh-horas-geradas').value = '0:00';
  document.getElementById('bh-horas-pagas').value = '0:00';
  document.getElementById('bh-autorizado').value = '';
  document.getElementById('bh-obs').value = '';

  renderHistoricoBancoHoras();
  renderSaldoBancoHoras();
  toastMsg('Registro de banco de horas adicionado com sucesso!');
  DB.saveLog('Adição Banco de Horas', `Adicionou horas para servidor ${srvId} - Mês ${mes+1}/${ano}`, 'banco_horas', novo.id);
}

function getBancoHorasAcessiveis() {
  const sessao = JSON.parse(sessionStorage.getItem('ferias_sessao') || '{}');
  const role = sessao.role;
  const gestorSetores = sessao.setores || [];
  const userId = sessao.userId || '';

  if (role === 'admin') return DB.bancoHoras();
  if (role === 'gestor') {
    const servidoresSetor = DB.servidores().filter(s => gestorSetores.includes(s.setor));
    const ids = new Set(servidoresSetor.map(s => s.id));
    return DB.bancoHoras().filter(bh => ids.has(bh.srvId));
  }
  if (role === 'servidor') {
    return DB.bancoHoras().filter(bh => bh.srvId === userId);
  }
  return [];
}

// Saldo acumulado ANTES do mês/ano informado (lançamentos de meses anteriores).
function calcularSaldoAnteriorBancoHoras(srvId, mes, ano) {
  const registros = DB.bancoHoras().filter(r => r.srvId === srvId);
  let saldo = 0;
  for (const r of registros) {
    if (r.ano < ano || (r.ano === ano && r.mes < mes)) {
      saldo += (r.horasGeradas || 0) - (r.horasPagas || 0);
    }
  }
  return saldo;
}

function renderSaldoBancoHoras() {
  const srvId = document.getElementById('bh-saldo-srv').value;
  const box = document.getElementById('bh-saldo-box');
  if (!srvId) {
    box.innerHTML = '<div class="empty" style="padding:24px"><div class="icon">⏱️</div><p>Selecione um servidor para ver o saldo.</p></div>';
    return;
  }
  const srv = DB.servidores().find(s => s.id === srvId);
  if (!srv) return;

  const registros = DB.bancoHoras().filter(r => r.srvId === srvId).sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  let saldoTotal = 0;
  let totalGeradas = 0;
  let totalPagas = 0;

  registros.forEach(r => {
    totalGeradas += r.horasGeradas || 0;
    totalPagas += r.horasPagas || 0;
  });
  saldoTotal = totalGeradas - totalPagas;

  box.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px">
      <div class="stat-card" style="background:var(--primary-dim);border:1px solid rgba(77,123,255,0.2);padding:18px;border-radius:var(--r);text-align:center">
        <span style="font-size:.7rem;color:var(--muted);text-transform:uppercase;display:block">Total Horas Geradas</span>
        <strong style="font-size:1.6rem;color:var(--primary)">${fmtHoras(totalGeradas)}</strong>
      </div>
      <div class="stat-card" style="background:var(--success-dim);border:1px solid rgba(15,212,136,0.2);padding:18px;border-radius:var(--r);text-align:center">
        <span style="font-size:.7rem;color:var(--muted);text-transform:uppercase;display:block">Total Horas Pagas</span>
        <strong style="font-size:1.6rem;color:var(--success)">${fmtHoras(totalPagas)}</strong>
      </div>
      <div class="stat-card" style="background:var(--warning-dim);border:1px solid rgba(245,183,49,0.2);padding:18px;border-radius:var(--r);text-align:center">
        <span style="font-size:.7rem;color:var(--muted);text-transform:uppercase;display:block">Saldo Remanescente</span>
        <strong style="font-size:1.6rem;color:${saldoTotal >= 0 ? 'var(--success)' : 'var(--danger)'}">${fmtHoras(saldoTotal)}</strong>
      </div>
    </div>
    <div style="margin-top:12px;font-size:.8rem;color:var(--muted)">
      <strong>${srv.nome}</strong> &mdash; Mat. ${srv.matricula} &mdash; ${srv.setor || 'Sem setor'}
    </div>
  `;
}

function renderHistoricoBancoHoras() {
  // Popula o select de servidores do histÃ³rico
  const histSrvEl = document.getElementById('bh-hist-srv');
  if (histSrvEl) {
    const prev = histSrvEl.value;
    const srvs = getServidoresAcessiveis();
    histSrvEl.innerHTML = '<option value="">Todos os Servidores</option>' +
      srvs.map(s => `<option value="${s.id}">${s.nome}</option>`).join('');
    if (prev && srvs.some(s => s.id === prev)) histSrvEl.value = prev;
  }

  const filtSrv = document.getElementById('bh-hist-srv')?.value || '';
  const filtMes = document.getElementById('bh-hist-mes')?.value || '';
  const filtAno = document.getElementById('bh-hist-ano')?.value || '';

  let lista = getBancoHorasAcessiveis().filter(r =>
    (!filtSrv || r.srvId === filtSrv) &&
    (!filtMes || r.mes === parseInt(filtMes)) &&
    (!filtAno || r.ano === parseInt(filtAno))
  ).sort((a, b) => ordemBancoHoras(b, a));

  const cont = document.getElementById('bh-historico');
  if (!lista.length) {
    cont.innerHTML = '<div class="empty"><div class="icon">⏱️</div><p>Nenhum registro de banco de horas.</p></div>';
    return;
  }

  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const servidoresAcessiveis = getServidoresAcessiveis();

  cont.innerHTML = lista.map(r => {
    const srv = servidoresAcessiveis.find(s => s.id === r.srvId);
    // Saldo antes deste lançamento (antes ignorava outros lançamentos do mesmo mês)
    const saldoAnterior = saldoAntesDoRegistroBH(r);
    const totalDisp = saldoAnterior + (r.horasGeradas || 0);
    const saldoRem = totalDisp - (r.horasPagas || 0);

    return `<div class="folga-hist-item credito" style="border-left-color:var(--primary)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
        <div>
          <strong>⏱️ ${meses[r.mes] || '?'}/${r.ano}</strong>
          ${r.tipoLancamento === 'ajuste' ? '<span style="margin-left:6px;font-size:10px;background:var(--warning);color:#000;padding:2px 6px;border-radius:4px;font-weight:700">AJUSTE MANUAL</span>' : ''}
          <span style="margin-left:10px;font-size:.8rem;color:var(--muted)">${esc(srv?.nome || '-')}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:.8rem;color:var(--muted)">Saldo Ant: ${fmtHoras(saldoAnterior)}</span>
          <span style="font-weight:700;color:var(--primary)">+${fmtHoras(r.horasGeradas || 0)}</span>
          <span style="font-weight:700;color:var(--success)">-${fmtHoras(r.horasPagas || 0)}</span>
          <span style="font-weight:700;color:${saldoRem >= 0 ? 'var(--success)' : 'var(--danger)'}">=${fmtHoras(saldoRem)}</span>
          <button class="btn btn-ghost btn-sm" onclick="abrirModalEditarBancoHoras('${r.id}')" title="Editar">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="excluirBancoHoras('${r.id}')" title="Excluir">🗑️</button>
        </div>
      </div>
      <div style="font-size:.82rem;color:var(--muted);margin-top:4px">
        ${r.autorizadoPor ? `👤 Autorizado: ${esc(r.autorizadoPor)}` : ''}
        ${r.obs ? `&nbsp;|&nbsp; 📝 ${esc(r.obs)}` : ''}
        ${r.lancadoPor ? `&nbsp;|&nbsp; ✍️ Lançado por: ${esc(r.lancadoPor)}` : ''}
      </div>
    </div>`;
  }).join('');
}

async function excluirBancoHoras(id) {
  if (!confirm('Excluir este registro de banco de horas?')) return;
  await DB.deleteBancoHoras(id);
  renderHistoricoBancoHoras();
  renderSaldoBancoHoras();
  toastMsg('Registro de banco de horas excluído.');
  DB.saveLog('Exclusão Banco de Horas', `Excluiu registro (ID: ${id})`, 'banco_horas', id);
}

function abrirModalEditarBancoHoras(id) {
  const r = DB.bancoHoras().find(x => x.id === id);
  if (!r) return toastMsg('Registro não encontrado!', 'error');
  const srv = DB.servidores().find(s => s.id === r.srvId);
  document.getElementById('ebh-id').value = r.id;
  document.getElementById('ebh-srv').value = srv ? `${srv.nome} (Mat. ${srv.matricula})` : r.srvId;
  document.getElementById('ebh-mes').value = r.mes;
  document.getElementById('ebh-ano').value = r.ano;
  document.getElementById('ebh-horas-geradas').value = horasParaCampo(r.horasGeradas || 0);
  document.getElementById('ebh-horas-pagas').value = horasParaCampo(r.horasPagas || 0);
  document.getElementById('ebh-autorizado').value = r.autorizadoPor || '';
  document.getElementById('ebh-obs').value = r.obs || '';
  document.getElementById('modal-editar-banco-horas').classList.add('open');
}

async function salvarEdicaoBancoHoras() {
  const id = document.getElementById('ebh-id').value;
  if (!id) return;
  const lista = DB.bancoHoras();
  const idx = lista.findIndex(x => x.id === id);
  if (idx === -1) return toastMsg('Registro não encontrado!', 'error');

  const mes = parseInt(document.getElementById('ebh-mes').value);
  const ano = parseInt(document.getElementById('ebh-ano').value);
  const horasGeradas = lerCampoHoras('ebh-horas-geradas');
  const horasPagas = lerCampoHoras('ebh-horas-pagas');
  if (isNaN(horasGeradas) || isNaN(horasPagas) || horasGeradas < 0 || horasPagas < 0) return toastMsg('Horas inválidas! Use o formato 1:30.', 'error');
  const autorizadoPor = document.getElementById('ebh-autorizado').value.trim();
  const obs = document.getElementById('ebh-obs').value.trim();

  if (!ano || ano < 2020) return toastMsg('Informe um ano válido!', 'error');

  lista[idx].mes = mes;
  lista[idx].ano = ano;
  lista[idx].horasGeradas = horasGeradas;
  lista[idx].horasPagas = horasPagas;
  lista[idx].autorizadoPor = autorizadoPor;
  lista[idx].obs = obs;

  await DB.saveBancoHoras(lista, [lista[idx]]);
  fecharModal('modal-editar-banco-horas');
  renderHistoricoBancoHoras();
  renderSaldoBancoHoras();
  toastMsg('Registro atualizado!');
  DB.saveLog('Edição Banco de Horas', `Editou registro (ID: ${id})`, 'banco_horas', id);
}


// Exporta o banco de horas (com saldo corrido por servidor) para Excel/CSV.
function exportarCSVBancoHoras() {
  const setor = document.getElementById('bh-rel-setor')?.value || '';
  const mes = document.getElementById('bh-rel-mes')?.value || '';
  let ano = document.getElementById('bh-rel-ano')?.value || '';
  if (mes !== '' && !ano) ano = String(new Date().getFullYear());
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const servidores = getServidoresAcessiveis().filter(s => !setor || s.setor === setor);
  const ids = new Set(servidores.map(s => s.id));
  const registros = getBancoHorasAcessiveis()
    .filter(r => ids.has(r.srvId))
    .filter(r => (mes === '' || String(r.mes) === mes) && (ano === '' || String(r.ano) === ano));
  if (!registros.length) return toastMsg('Nenhum registro de banco de horas para os filtros selecionados.', 'error');

  let csv = '\uFEFFServidor;Matrícula;Setor;Mês/Ano;Tipo;Saldo Anterior;Horas Geradas;Horas Pagas;Saldo Após;Autorizado Por;Lançado Por;Observação\n';
  const linhas = registros.map(r => {
    const srv = servidores.find(s => s.id === r.srvId) || {};
    const ant = saldoAntesDoRegistroBH(r);
    const apos = ant + (r.horasGeradas || 0) - (r.horasPagas || 0);
    return { srv, r, ant, apos };
  }).sort((a, b) => (a.srv.nome || '').localeCompare(b.srv.nome || '') || ordemBancoHoras(a.r, b.r));
  linhas.forEach(({ srv, r, ant, apos }) => {
    csv += [
      srv.nome || '', srv.matricula || '', srv.setor || '',
      `${meses[r.mes] || '?'}/${r.ano}`, r.tipoLancamento === 'ajuste' ? 'Ajuste manual' : 'Normal',
      fmtHoras(ant), fmtHoras(r.horasGeradas || 0), fmtHoras(r.horasPagas || 0), fmtHoras(apos),
      r.autorizadoPor || '', r.lancadoPor || '', r.obs || ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';') + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BancoHoras_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toastMsg('✅ Banco de horas exportado!', 'success');
}
