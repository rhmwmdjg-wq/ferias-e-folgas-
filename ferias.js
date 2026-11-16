// Módulo Férias.
// Programação e calendário visual de férias.

function popularSelectServidor() {
  const sel = document.getElementById('fp-servidor');
  if (!sel) return;
  // Programação de férias: apenas servidores efetivos (regra do município)
  const servidores = getServidoresAcessiveis().filter(feriasEhEfetivo);
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
  if (typeof renderAuditoriaConflitosFerias === 'function') renderAuditoriaConflitosFerias();
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

// ===================== Auditoria de conflitos de férias (somente efetivos) =====================
// Regra do município: a programação de férias é feita apenas com servidores efetivos.
// Conflito = dois efetivos da mesma unidade (setor) e da mesma categoria (cargo) com férias
// na mesma data (períodos sobrepostos) ou no mesmo mês.

function feriasEhEfetivo(s) {
  return String((s && s.vinculo) || '').toLowerCase() !== 'contratado';
}
function feriasCargoChave(s) {
  return String((s && s.cargo) || '').trim().toLowerCase().replace(/\s+/g, ' ') || '(sem cargo)';
}
function feriasDataLocal(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
function feriasMesesDoPeriodo(a, b) {
  const out = [];
  let d = new Date(a.getFullYear(), a.getMonth(), 1);
  while (d <= b) { out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); d = new Date(d.getFullYear(), d.getMonth() + 1, 1); }
  return out;
}
function feriasRotuloMes(chave) {
  const p = chave.split('-');
  return MESES_PT[parseInt(p[1], 10) - 1] + '/' + p[0];
}

// opts: { setor, escopo: 'futuro'|'ano'|'tudo', tipo: ''|'data'|'mes' }
// Retorna { conflitos: [...], base: {efetivos, progs, setores} }
function feriasConflitos(opts) {
  opts = opts || {};
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const anoIni = new Date(hoje.getFullYear(), 0, 1);
  const srvs = (typeof getServidoresAcessiveis === 'function' ? getServidoresAcessiveis() : DB.servidores()).filter(feriasEhEfetivo);
  const porId = {}; srvs.forEach(function (s) { porId[s.id] = s; });
  const progs = (typeof getProgramacoesAcessiveis === 'function' ? getProgramacoesAcessiveis() : DB.programacoes())
    .map(function (p) { return { p: p, s: porId[p.srvId], a: feriasDataLocal(p.inicio), b: feriasDataLocal(p.fim || p.inicio) }; })
    .filter(function (x) {
      if (!x.s || !x.a || !x.b || x.b < x.a) return false;
      if (opts.setor && (x.s.setor || 'Sem setor') !== opts.setor) return false;
      if (opts.escopo === 'ano') return x.b >= anoIni;
      if (opts.escopo === 'tudo') return true;
      return x.b >= hoje; // futuro (padrão): em curso ou ainda por vir
    });
  // agrupa por unidade + categoria
  const grupos = {};
  progs.forEach(function (x) {
    const k = (x.s.setor || 'Sem setor') + '|' + feriasCargoChave(x.s);
    (grupos[k] || (grupos[k] = [])).push(x);
  });
  const conflitos = [];
  Object.keys(grupos).forEach(function (k) {
    const l = grupos[k].sort(function (x, y) { return x.a - y.a; });
    for (let i = 0; i < l.length; i++) {
      for (let j = i + 1; j < l.length; j++) {
        const x = l[i], y = l[j];
        if (x.s.id === y.s.id) continue;
        const sobre = x.a <= y.b && y.a <= x.b;
        let tipo, detalhe;
        if (sobre) {
          const ini = x.a > y.a ? x.a : y.a, fim = x.b < y.b ? x.b : y.b;
          const dias = Math.round((fim - ini) / 86400000) + 1;
          tipo = 'data';
          detalhe = dias + ' dia(s) em comum: ' + ini.toLocaleDateString('pt-BR') + ' a ' + fim.toLocaleDateString('pt-BR');
        } else {
          const mx = feriasMesesDoPeriodo(x.a, x.b), my = feriasMesesDoPeriodo(y.a, y.b);
          const comuns = mx.filter(function (m) { return my.indexOf(m) >= 0; });
          if (!comuns.length) continue;
          tipo = 'mes';
          detalhe = 'mesmo mês: ' + comuns.map(feriasRotuloMes).join(', ');
        }
        if (opts.tipo && opts.tipo !== tipo) continue;
        conflitos.push({ setor: x.s.setor || 'Sem setor', cargo: x.s.cargo || '(sem cargo)', tipo: tipo, detalhe: detalhe,
          a: { srv: x.s, prog: x.p, ini: x.a, fim: x.b }, b: { srv: y.s, prog: y.p, ini: y.a, fim: y.b } });
      }
    }
  });
  conflitos.sort(function (u, v) { return u.setor.localeCompare(v.setor, 'pt-BR') || (u.tipo === 'data' ? 0 : 1) - (v.tipo === 'data' ? 0 : 1) || u.a.ini - v.a.ini; });
  const setores = {}; srvs.forEach(function (s) { const st = s.setor || 'Sem setor'; setores[st] = (setores[st] || 0) + 1; });
  return { conflitos: conflitos, base: { efetivos: srvs.length, progs: progs.length, setores: setores } };
}

function popularSelectConflitosSetor() {
  const sel = document.getElementById('fc-setor'); if (!sel) return;
  const atual = sel.value;
  const setores = {};
  getServidoresAcessiveis().filter(feriasEhEfetivo).forEach(function (s) { setores[s.setor || 'Sem setor'] = 1; });
  sel.innerHTML = '<option value="">Todas as unidades</option>' + Object.keys(setores).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); })
    .map(function (st) { return '<option value="' + esc(st) + '">' + esc(st) + '</option>'; }).join('');
  if (atual && setores[atual]) sel.value = atual;
}

function renderAuditoriaConflitosFerias() {
  const box = document.getElementById('fc-resultado'); if (!box) return;
  if (!document.getElementById('fc-setor').options.length || document.getElementById('fc-setor').options.length <= 1) popularSelectConflitosSetor();
  const setor = document.getElementById('fc-setor').value;
  const escopo = document.getElementById('fc-escopo').value;
  const tipo = document.getElementById('fc-tipo').value;
  const R = feriasConflitos({ setor: setor, escopo: escopo, tipo: tipo });
  const resumo = document.getElementById('fc-resumo');
  const nData = R.conflitos.filter(function (c) { return c.tipo === 'data'; }).length, nMes = R.conflitos.length - nData;
  const unidades = {}; R.conflitos.forEach(function (c) { (unidades[c.setor] || (unidades[c.setor] = [])).push(c); });
  if (resumo) {
    resumo.innerHTML =
      '<span class="tag tag-blue">' + R.base.efetivos + ' efetivos' + (setor ? ' na unidade' : '') + '</span> ' +
      '<span class="tag tag-blue">' + R.base.progs + ' períodos analisados</span> ' +
      '<span class="tag ' + (nData ? 'tag-red' : 'tag-green') + '">' + nData + ' na mesma data</span> ' +
      '<span class="tag ' + (nMes ? 'tag-warn' : 'tag-green') + '">' + nMes + ' no mesmo mês</span> ' +
      '<span class="tag">' + Object.keys(unidades).length + ' unidade(s) com conflito</span>';
  }
  if (!R.conflitos.length) {
    box.innerHTML = '<div class="empty"><div class="icon">✅</div><p>Nenhum conflito: não há dois efetivos da mesma categoria com férias ' + (tipo === 'mes' ? 'no mesmo mês' : tipo === 'data' ? 'na mesma data' : 'na mesma data nem no mesmo mês') + (setor ? ' nesta unidade.' : ' em nenhuma unidade.') + '</p></div>';
    return;
  }
  function per(x) { return x.ini.toLocaleDateString('pt-BR') + ' → ' + x.fim.toLocaleDateString('pt-BR') + (x.prog.autorizado ? ' <span class="tag tag-green" style="font-size:.6rem">✅ autorizada</span>' : ' <span class="tag" style="font-size:.6rem">⏳ programada</span>'); }
  function pessoa(x) { return '<strong class="mx-srv-name" onclick="abrirFicha360(\'' + x.srv.id + '\')" title="Abrir ficha">' + esc(x.srv.nome) + '</strong><div style="font-size:.74rem;color:var(--muted)">Mat. ' + esc(x.srv.matricula || '-') + ' · ' + per(x) + '</div>'; }
  box.innerHTML = Object.keys(unidades).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); }).map(function (st) {
    const l = unidades[st];
    const d = l.filter(function (c) { return c.tipo === 'data'; }).length;
    return '<div style="margin-bottom:16px">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px"><strong>🏥 ' + esc(st) + '</strong>' +
      '<span class="tag tag-blue" style="font-size:.65rem">' + (R.base.setores[st] || 0) + ' efetivos</span>' +
      (d ? '<span class="tag tag-red" style="font-size:.65rem">' + d + ' mesma data</span>' : '') +
      (l.length - d ? '<span class="tag tag-warn" style="font-size:.65rem">' + (l.length - d) + ' mesmo mês</span>' : '') + '</div>' +
      '<div class="table-wrap"><table class="table" style="font-size:.8rem"><thead><tr><th>Categoria (cargo)</th><th>Servidor A</th><th>Servidor B</th><th>Conflito</th></tr></thead><tbody>' +
      l.map(function (c) {
        return '<tr><td>' + esc(c.cargo) + '</td><td>' + pessoa(c.a) + '</td><td>' + pessoa(c.b) + '</td><td>' +
          (c.tipo === 'data' ? '<span class="tag tag-red">📅 Mesma data</span>' : '<span class="tag tag-warn">🗓️ Mesmo mês</span>') +
          '<div style="font-size:.74rem;color:var(--muted);margin-top:4px">' + esc(c.detalhe) + '</div></td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }).join('');
}

function imprimirAuditoriaConflitosFerias() {
  const setor = document.getElementById('fc-setor').value, escopo = document.getElementById('fc-escopo').value, tipo = document.getElementById('fc-tipo').value;
  const R = feriasConflitos({ setor: setor, escopo: escopo, tipo: tipo });
  const unidades = {}; R.conflitos.forEach(function (c) { (unidades[c.setor] || (unidades[c.setor] = [])).push(c); });
  const esc2 = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  const fmt = function (d) { return d.toLocaleDateString('pt-BR'); };
  let html = '<h2 style="margin:0 0 4px">Auditoria de conflitos de férias — servidores efetivos</h2>' +
    '<p style="margin:0 0 12px;font-size:12px">' + (setor ? 'Unidade: ' + esc2(setor) : 'Todas as unidades') + ' · ' + { futuro: 'férias em curso e futuras', ano: 'ano de ' + new Date().getFullYear() + ' e futuras', tudo: 'todo o histórico' }[escopo] +
    ' · ' + R.base.progs + ' períodos · ' + R.conflitos.length + ' conflito(s) · emitido em ' + new Date().toLocaleString('pt-BR') + '</p>';
  if (!R.conflitos.length) html += '<p>Nenhum conflito encontrado.</p>';
  Object.keys(unidades).sort().forEach(function (st) {
    html += '<h3 style="margin:14px 0 6px;font-size:14px">' + esc2(st) + ' (' + (R.base.setores[st] || 0) + ' efetivos)</h3>' +
      '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th>Categoria</th><th>Servidor A</th><th>Servidor B</th><th>Conflito</th></tr></thead><tbody>' +
      unidades[st].map(function (c) {
        return '<tr><td>' + esc2(c.cargo) + '</td><td>' + esc2(c.a.srv.nome) + '<br><small>' + fmt(c.a.ini) + ' a ' + fmt(c.a.fim) + (c.a.prog.autorizado ? ' (autorizada)' : '') + '</small></td>' +
          '<td>' + esc2(c.b.srv.nome) + '<br><small>' + fmt(c.b.ini) + ' a ' + fmt(c.b.fim) + (c.b.prog.autorizado ? ' (autorizada)' : '') + '</small></td>' +
          '<td>' + (c.tipo === 'data' ? 'Mesma data' : 'Mesmo mês') + '<br><small>' + esc2(c.detalhe) + '</small></td></tr>';
      }).join('') + '</tbody></table>';
  });
  const w = window.open('', '_blank');
  if (!w) { toastMsg('Permita pop-ups para imprimir.', 'error'); return; }
  w.document.write('<html><head><title>Conflitos de férias</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#111}th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eee}</style></head><body>' + html + '</body></html>');
  w.document.close(); w.focus(); w.print();
}
