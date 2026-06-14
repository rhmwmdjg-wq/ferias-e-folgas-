// Módulo Férias.
// Programação e calendário visual de férias.

function popularSelectServidor() {
  const sel = document.getElementById('fp-servidor');
  if (!sel) return;
  const servidores = getServidoresAcessiveis();
  sel.innerHTML = '<option value="">Selecione...</option>' + servidores.map(function(s) { return '<option value="' + s.id + '">' + esc(s.nome) + ' (Mat. ' + esc(s.matricula) + ')</option>'; }).join('');
}

function selecionarTipoPeriodoNova(num) {
  document.querySelectorAll('#fp-periodos-grid .periodo-option').forEach(function(b) { b.classList.remove('active'); });
  const el = document.getElementById('fp-per-' + num);
  if (el) el.classList.add('active');
  const diasPorPeriodo = num === 1 ? [30] : num === 2 ? [15, 15] : [10, 10, 10];
  const section = document.getElementById('fp-datas-section');
  section.style.display = 'block';
  section.innerHTML = '<div style="font-size:.82rem;font-weight:600;margin-bottom:12px;color:var(--muted)">📅 Preencha a data de início de cada período — o fim e retorno são calculados automaticamente:</div>';
  for (let i = 0; i < num; i++) {
    const periodo = i + 1;
    const dias = diasPorPeriodo[i];
    section.innerHTML += '<div style="margin-bottom:12px;padding:12px;border:1px solid var(--border);border-radius:var(--r-sm)">' +
      '<label style="font-weight:700;font-size:.82rem;display:block;margin-bottom:8px">' + periodo + 'º Período — ' + dias + ' dias corridos</label>' +
      '<div style="display:flex;gap:12px;align-items:center">' +
        '<div class="field" style="margin:0;flex:1"><label>Data Início *</label><input type="date" id="fp-data-ini-' + periodo + '" oninput="calcularFimPeriodoNova(' + periodo + ', ' + dias + ')"></div>' +
        '<div class="field" style="margin:0;flex:1"><label>Data Término</label><input type="date" id="fp-data-fim-' + periodo + '" readonly style="opacity:.6;cursor:default"></div>' +
      '</div>' +
      '<div id="fp-retorno-' + periodo + '" style="font-size:.8rem;color:var(--success);font-weight:600;margin-top:6px;display:none"></div>' +
    '</div>';
  }
}

function calcularFimPeriodoNova(num, dias) {
  const inicio = document.getElementById('fp-data-ini-' + num).value;
  const fimEl = document.getElementById('fp-data-fim-' + num);
  const retEl = document.getElementById('fp-retorno-' + num);
  if (!inicio) { fimEl.value = ''; retEl.style.display = 'none'; return; }
  const fim = addDays(inicio, dias - 1);
  const retorno = addDays(inicio, dias);
  fimEl.value = fim;
  retEl.style.display = 'block';
  retEl.textContent = '↩️ Retorno: ' + fmtDate(retorno);
}

function limparFormFerias() {
  document.getElementById('fp-servidor').value = '';
  document.getElementById('fp-tipo').value = 'anual';
  document.getElementById('fp-periodo').value = '';
  document.getElementById('fp-obs').value = '';
  document.getElementById('fp-datas-section').innerHTML = '';
  document.getElementById('fp-datas-section').style.display = 'none';
  document.querySelectorAll('#fp-periodos-grid .periodo-option').forEach(function(b) { b.classList.remove('active'); });
}

async function salvarProgramacao() {
  const srvId = document.getElementById('fp-servidor').value;
  const tipo = document.getElementById('fp-tipo').value;
  const periodo = document.getElementById('fp-periodo').value.trim();
  const obs = document.getElementById('fp-obs').value.trim();
  if (!srvId || !tipo) { toastMsg('Selecione o servidor e o tipo de férias.', 'error'); return; }
  const perSel = document.querySelector('#fp-periodos-grid .periodo-option.active');
  if (!perSel) { toastMsg('Selecione o tipo de parcelamento.', 'error'); return; }
  const numPeriodos = parseInt((perSel.id || '').replace('fp-per-', '')) || 1;
  const datas = [];
  for (let i = 1; i <= numPeriodos; i++) {
    const ini = document.getElementById('fp-data-ini-' + i)?.value;
    const fim = document.getElementById('fp-data-fim-' + i)?.value;
    if (!ini || !fim) { toastMsg('Preencha as datas do período ' + i + '.', 'error'); return; }
    datas.push({ inicio: ini, fim: fim });
  }
  const programacoes = DB.programacoes();
  datas.forEach(function(d, i) {
    programacoes.push({
      id: uid(12),
      srvId: srvId,
      tipo: tipo,
      periodo: periodo,
      inicio: d.inicio,
      fim: d.fim,
      retorno: addDays(d.fim, 1),
      obs: obs,
      concluido: false,
      parcelamento: numPeriodos,
      parcela: i + 1,
      criadoEm: new Date().toISOString()
    });
  });
  await DB.saveProgramacoes(programacoes);
  toastMsg('Férias programadas com sucesso!');
  limparFormFerias();
  renderProgramacoes();
  atualizarBadge();
  renderDashboard();
}

function renderProgramacoes() {
  const container = document.getElementById('lista-programacoes');
  if (!container) return;
  const busca = (document.getElementById('fp-busca-nome')?.value || '').toLowerCase();
  const programacoes = getProgramacoesAcessiveis();
  const servidores = DB.servidores();
  const filtradas = programacoes.filter(function(p) {
    if (!busca) return true;
    const srv = servidores.find(function(s) { return s.id === p.srvId; });
    return srv && (srv.nome.toLowerCase().includes(busca) || srv.matricula.includes(busca));
  }).sort(function(a, b) { return new Date(b.criadoEm || b.inicio) - new Date(a.criadoEm || a.inicio); });
  if (!filtradas.length) {
    container.innerHTML = '<div class="empty"><div class="icon">📅</div><p>' + (busca ? 'Nenhuma programação encontrada.' : 'Nenhuma programação cadastrada.') + '</p></div>';
    return;
  }

  // Agrupar por servidor
  const grupos = {};
  filtradas.forEach(function(p) {
    if (!grupos[p.srvId]) grupos[p.srvId] = [];
    grupos[p.srvId].push(p);
  });

  container.innerHTML = Object.values(grupos).map(function(periodos) {
    const p0 = periodos[0];
    const srv = servidores.find(function(s) { return s.id === p0.srvId; });
    const primeiro = periodos.reduce(function(a, b) { return (a.inicio < b.inicio) ? a : b; });
    const diff = diffDays(primeiro.inicio);
    const sit = diff < 0 ? 'Concluída' : diff === 0 ? 'Iniciando HOJE' : diff <= 10 ? 'Urgente' : diff <= 35 ? 'Próxima' : 'Agendada';
    const cls = diff < 0 ? 'tag-green' : diff === 0 ? 'tag-red' : diff <= 10 ? 'tag-red' : diff <= 35 ? 'tag-warn' : 'tag-blue';
    const tipoLabel = p0.tipo === 'anual' ? '🌴 Férias Anuais' : '🏆 Férias Prêmio';
    const autorizado = p0.autorizado;
    const periodoRef = p0.periodo || '-';

    var periodosHtml = periodos.map(function(p, i) {
      return '<div style="font-size:.78rem;color:var(--muted);padding:2px 0">' +
        (periodos.length > 1 ? (i + 1) + 'º Período: ' : '') +
        fmtDate(p.inicio) + ' → ' + fmtDate(p.fim || p.inicio) +
        ' · Retorno: ' + fmtDate(p.retorno || addDays(p.fim || p.inicio, 1)) +
        ' <button class="btn btn-danger btn-sm" onclick="excluirProgRel(\'' + p.id + '\')" style="padding:1px 5px;font-size:.6rem;margin-left:6px" title="Excluir este período">🗑️</button>' +
        '</div>';
    }).join('');

    return '<div style="padding:14px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">' +
      '<div style="flex:1;min-width:200px"><strong>' + esc(srv?.nome || 'Servidor removido') +
      (autorizado ? ' <span class="tag tag-green" style="font-size:.65rem">✅ Autorizado</span>' : '') +
      '</strong><div style="margin-top:4px"><span style="font-size:.82rem;font-weight:600;color:var(--text-mid)">' + tipoLabel +
      '</span><span style="font-size:.75rem;color:var(--muted);margin-left:8px">Período: ' + esc(periodoRef) + '</span></div>' +
      '<div style="margin-top:4px">' + periodosHtml + '</div></div>' +
      '<div style="display:flex;gap:6px;align-items:center;flex-shrink:0">' +
      '<span class="tag ' + cls + '">' + sit + '</span>' +
      (autorizado ? '' : '<button class="btn btn-primary btn-sm" onclick="abrirModalAutorizacao(\'' + p0.srvId + '\',\'' + primeiro.inicio + '\',\'' + (primeiro.fim || '') + '\',\'' + p0.tipo + '\',\'' + (p0.periodo || '') + '\')">📄 Autorizar</button>') +
      '</div></div>';
  }).join('');
}

let calAno = new Date().getFullYear();

let calMes = new Date().getMonth();

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function iniciarCalendario() {
  // Popular filtro de setores
  const sel = document.getElementById('cal-filtro-setor');
  if (!sel) return;
  const setores = getTodosSetores();
  sel.innerHTML = '<option value="">Todos os Setores</option>' +
    setores.map(s => `<option value="${s}">${s}</option>`).join('');
  renderCalendario();
}

function navegarCalendario(dir) {
  calMes += dir;
  if (calMes > 11) { calMes = 0; calAno++; }
  if (calMes < 0)  { calMes = 11; calAno--; }
  renderCalendario();
}

function irParaHojeCalendario() {
  const hoje = new Date();
  calAno = hoje.getFullYear();
  calMes = hoje.getMonth();
  renderCalendario();
}

function renderCalendario() {
  const grid = document.getElementById('cal-grid');
  const titulo = document.getElementById('cal-titulo-mes');
  if (!grid || !titulo) return;

  titulo.textContent = `${MESES_PT[calMes]} de ${calAno}`;

  const filtroSetor = document.getElementById('cal-filtro-setor')?.value || '';
  const filtroTipo  = document.getElementById('cal-filtro-tipo')?.value  || '';

  const servidores    = getServidoresAcessiveis();
  const programacoes  = getProgramacoesAcessiveis();
  const hoje          = new Date();
  hoje.setHours(0,0,0,0);

  // Primeiro dia do mês e preparação do grid (42 dias para cobrir semanas completas)
  const primeiroDia = new Date(calAno, calMes, 1);
  const inicioCel   = new Date(primeiroDia);
  inicioCel.setDate(inicioCel.getDate() - primeiroDia.getDay());

  // Preparar programações para processamento eficiente
  const progsProcessadas = programacoes.filter(p => {
    if (filtroTipo && p.tipo !== filtroTipo) return false;
    const srv = servidores.find(s => s.id === p.srvId);
    if (!srv) return false;
    if (filtroSetor && srv.setor !== filtroSetor) return false;
    return true;
  }).map(p => {
    const srv = servidores.find(s => s.id === p.srvId);
    // Extrai todos os períodos (suporta parcelamento)
    const periodos = (p.periodos && p.periodos.length) 
      ? p.periodos 
      : [{ inicio: p.inicio, fim: p.fim, retorno: p.retorno }];
    
    return { ...p, srv, periodosTratados: periodos.map(per => {
      const dIni = per.inicio ? new Date(per.inicio + 'T00:00:00') : null;
      // Se não tem fim/retorno, assume 1 dia
      let dFim = per.retorno ? new Date(per.retorno + 'T00:00:00') : (per.fim ? new Date(per.fim + 'T00:00:00') : dIni);
      
      // Ajuste: A data de retorno é o dia que ele VOLTA, então as férias acabam um dia antes
      const dFimReal = dFim ? new Date(dFim) : null;
      if (dFimReal && per.retorno) dFimReal.setDate(dFimReal.getDate() - 1);

      return { ini: dIni, fim: dFimReal };
    })};
  });

  let html = '';
  for (let i = 0; i < 42; i++) {
    const dia = new Date(inicioCel);
    dia.setDate(inicioCel.getDate() + i);

    const outroMes = dia.getMonth() !== calMes;
    const ehHoje   = dia.getTime() === hoje.getTime();
    const diaISO   = dia.toISOString().split('T')[0];

    // Buscar quem está de férias neste dia específico
    const eventosDia = [];
    progsProcessadas.forEach(p => {
      p.periodosTratados.forEach(per => {
        if (per.ini && per.fim && dia >= per.ini && dia <= per.fim) {
          eventosDia.push({
            id: p.id,
            srvId: p.srvId,
            nome: p.srv.nome.split(' ')[0],
            srvNome: p.srv.nome,
            tipo: p.tipo,
            concluido: !!p.concluido,
            setor: p.srv.setor
          });
        }
      });
    });

    const MAX_SHOW = 3;
    const visiveis = eventosDia.slice(0, MAX_SHOW);
    const extras   = eventosDia.length - MAX_SHOW;

    html += `
      <div class="cal-day${outroMes ? ' outro-mes' : ''}${ehHoje ? ' hoje' : ''}" data-date="${diaISO}">
        <div class="cal-day-num">${dia.getDate()}</div>
        <div class="cal-event-container">
          ${visiveis.map(ev => `
            <div class="cal-evento ${ev.tipo === 'anual' ? 'anual' : 'premio'} ${ev.concluido ? 'concluido' : ''}" 
                 onclick="abrirGerenciarFérias('${ev.srvId}')"
                 title="${ev.srvNome} (${ev.setor || 'N/I'})">
              ${ev.nome}
            </div>
          `).join('')}
          ${extras > 0 ? `<div class="cal-mais">+${extras}</div>` : ''}
        </div>
      </div>`;
  }

  grid.innerHTML = html;
}
