// Módulo Central de IA.
// Reúne os números do sistema (banco de horas, folgas, férias, solicitações, atestados e
// registro de atividades), envia para a IA e mostra o resultado: auditorias, pareceres,
// planos, ofícios, relatórios e mensagens.
//
// Privacidade: a IA recebe só números agregados. Cada pessoa vai como um código
// (S01, S02… servidores; G01… usuários do sistema) — sem nome, matrícula ou CPF.
// O sistema troca o código pelo nome na resposta, aqui no navegador.
// Textos livres (observações, motivos) não são enviados. Nada fica gravado no servidor.

const IA_GESTAO_URL = 'https://bgvwaamwgcathojxtjqf.supabase.co/functions/v1/atlas-ia-gestao';
const IA_MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const IA_DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const IA_DIA_MS = 86400000;

let _iaCodigos = {};      // código -> nome exibido
let _iaContexto = '';
let _iaHistorico = [];    // [{papel:'user'|'ia', texto, formato}]
let _iaOcupada = false;
let _iaFerramenta = null; // ferramenta selecionada
let _iaUltimoAlvo = null; // servidor da última mensagem de WhatsApp

// ===================== utilidades =====================

function iaEsc(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function iaNum(v) { return Math.round((Number(v) || 0) * 10) / 10; }
function iaChaveMes(ano, mes) { return ano + '-' + String(mes + 1).padStart(2, '0'); }
function iaRotuloMes(chave) { const p = chave.split('-'); return IA_MESES[parseInt(p[1], 10) - 1] + '/' + p[0].slice(2); }
function iaData(str) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function iaBR(d) { return d ? d.toLocaleDateString('pt-BR') : '-'; }
function iaHoje() { const h = new Date(); h.setHours(0, 0, 0, 0); return h; }
function iaDiasEntre(a, b) { return Math.round((b - a) / IA_DIA_MS); }
function iaVinculo(s) { return String((s && s.vinculo) || '').toLowerCase() === 'contratado' ? 'contratado' : 'efetivo'; }
function iaSetor(s) { return (s && s.setor) || 'Sem setor'; }
function iaEfetivo(s) { return iaVinculo(s) === 'efetivo'; }
const IA_REGRA_FERIAS = 'REGRA DO MUNICÍPIO: a programação de férias é feita APENAS com servidores EFETIVOS. Contratados não entram na programação, na escala nem nos cálculos de férias; use-os apenas como contexto de cobertura da unidade.';
function iaLista(arr, vazio) { return arr.length ? arr.join('; ') : (vazio || 'nenhum'); }

// Datas (Date) de um uso de folga
function iaDatasFolga(f) {
  const out = [];
  if (Array.isArray(f.dataItems)) f.dataItems.forEach(function (x) { const d = iaData(x && x.data); if (d) out.push(d); });
  if (!out.length) { const d = iaData(f.data); if (d) out.push(d); }
  return out;
}

// Base comum: servidores visíveis, códigos e descrições
function iaBase(filtro, rotuloNome) {
  let srvs = (typeof getServidoresAcessiveis === 'function' ? getServidoresAcessiveis() : DB.servidores());
  const todos = srvs;
  if (typeof filtro === 'function') srvs = srvs.filter(filtro);
  const porId = {}; todos.forEach(function (s) { porId[s.id] = s; });
  const ids = new Set(srvs.map(function (s) { return s.id; }));
  const porSetor = {}; todos.forEach(function (s) { const k = iaSetor(s); porSetor[k] = (porSetor[k] || 0) + 1; });
  const porSetorEf = {}; todos.forEach(function (s) { if (!iaEfetivo(s)) return; const k = iaSetor(s); porSetorEf[k] = (porSetorEf[k] || 0) + 1; });
  const codigoDe = {}; _iaCodigos = {};
  let seq = 0;
  function cod(id) {
    const s = porId[id]; if (!s) return null;
    if (!codigoDe[id]) {
      seq++;
      codigoDe[id] = 'S' + String(seq).padStart(2, '0');
      _iaCodigos[codigoDe[id]] = rotuloNome === 'primeiro'
        ? String(s.nome || '').trim().split(/\s+/)[0].replace(/^(.)(.*)$/, function (m, a, b) { return a.toUpperCase() + b.toLowerCase(); })
        : s.nome + (s.matricula ? ' (Mat. ' + s.matricula + ')' : '');
    }
    return codigoDe[id];
  }
  function desc(id) {
    const s = porId[id];
    return cod(id) + ' [' + iaSetor(s) + '; ' + (s.cargo || 'sem cargo') + '; ' + iaVinculo(s) + ']';
  }
  return { srvs: srvs, todos: todos, ids: ids, porId: porId, porSetor: porSetor, porSetorEf: porSetorEf, cod: cod, desc: desc, hoje: iaHoje() };
}

function iaSaldoHoras(srvId) {
  return DB.bancoHoras().filter(function (r) { return r.srvId === srvId; })
    .reduce(function (a, r) { return a + (Number(r.horasGeradas) || 0) - (Number(r.horasPagas) || 0); }, 0);
}
function iaSaldoFolgas(srvId) {
  return DB.folgas().filter(function (f) { return f.srvId === srvId; })
    .reduce(function (a, f) { return a + (f.tipo === 'credito' ? 1 : -1) * (Number(f.qtd) || 0); }, 0);
}
// Programações de férias: só de servidores efetivos (regra do município)
function iaProgs(ids) {
  const porId = {}; DB.servidores().forEach(function (s) { porId[s.id] = s; });
  return DB.programacoes().filter(function (p) { return (!ids || ids.has(p.srvId)) && porId[p.srvId] && iaEfetivo(porId[p.srvId]) && iaData(p.inicio) && iaData(p.fim); });
}
// Conflitos de férias por unidade/categoria (mesma data ou mesmo mês), só efetivos — usa o motor da tela de férias
function iaLinhasConflitos(B, setorFiltro, limite) {
  if (typeof feriasConflitos !== 'function') return [];
  const R = feriasConflitos({ setor: setorFiltro || '', escopo: 'futuro' });
  return R.conflitos.filter(function (c) { return B.ids.has(c.a.srv.id) || B.ids.has(c.b.srv.id); }).slice(0, limite || 40).map(function (c) {
    return c.setor + ' / ' + c.cargo + ': ' + B.cod(c.a.srv.id) + ' (' + iaBR(c.a.ini) + ' a ' + iaBR(c.a.fim) + (c.a.prog.autorizado ? ', autorizada' : '') + ') x ' +
      B.cod(c.b.srv.id) + ' (' + iaBR(c.b.ini) + ' a ' + iaBR(c.b.fim) + (c.b.prog.autorizado ? ', autorizada' : '') + ') — ' + (c.tipo === 'data' ? 'MESMA DATA, ' : '') + c.detalhe;
  });
}
function iaItensAtestado(ids) {
  try { return DB.itensProtocolo().filter(function (i) { return i.tipo === 'atestado' && (!ids || ids.has(i.srvId)); }); } catch (e) { return []; }
}

// Quem do setor está fora (férias ou folga marcada) entre duas datas
function iaAusenciasSetor(B, setor, ini, fim, exceto) {
  const linhas = [];
  const fora = new Set();
  iaProgs().forEach(function (p) {
    const s = B.porId[p.srvId]; if (!s || iaSetor(s) !== setor || p.srvId === exceto) return;
    const a = iaData(p.inicio), b = iaData(p.fim);
    if (a <= fim && b >= ini) {
      fora.add(p.srvId);
      linhas.push(B.cod(p.srvId) + ' (' + (s.cargo || 'sem cargo') + ') férias ' + iaBR(a) + ' a ' + iaBR(b) + (p.autorizado ? ' [autorizada]' : ' [não autorizada]'));
    }
  });
  DB.folgas().forEach(function (f) {
    if (f.tipo === 'credito' || f.srvId === exceto) return;
    const s = B.porId[f.srvId]; if (!s || iaSetor(s) !== setor) return;
    const ds = iaDatasFolga(f).filter(function (d) { return d >= ini && d <= fim; });
    if (ds.length) { fora.add(f.srvId); linhas.push(B.cod(f.srvId) + ' (' + (s.cargo || 'sem cargo') + ') folga em ' + ds.map(iaBR).join(', ')); }
  });
  return { linhas: linhas, pessoas: fora.size };
}

// Ocupação de férias por setor nos próximos 12 meses
function iaCalendarioFerias(B) {
  const meses = [];
  for (let i = 0; i < 12; i++) { const d = new Date(B.hoje.getFullYear(), B.hoje.getMonth() + i, 1); meses.push(iaChaveMes(d.getFullYear(), d.getMonth())); }
  const mapa = {}; meses.forEach(function (m) { mapa[m] = {}; });
  iaProgs().forEach(function (p) {
    const s = B.porId[p.srvId]; if (!s) return;
    const a = iaData(p.inicio), b = iaData(p.fim); if (b < B.hoje) return;
    meses.forEach(function (m) {
      const x = m.split('-'); const m0 = new Date(+x[0], +x[1] - 1, 1), m1 = new Date(+x[0], +x[1], 0);
      if (a <= m1 && b >= m0) { const st = iaSetor(s); (mapa[m][st] || (mapa[m][st] = new Set())).add(p.srvId); }
    });
  });
  return { meses: meses, mapa: mapa };
}
function iaLinhasCalendario(B, cal, setorUnico) {
  const out = [];
  cal.meses.forEach(function (m) {
    const partes = Object.keys(cal.mapa[m]).filter(function (st) { return !setorUnico || st === setorUnico; }).sort()
      .map(function (st) { return st + ' ' + cal.mapa[m][st].size + '/' + (B.porSetorEf[st] || '?'); });
    out.push(iaRotuloMes(m) + ': ' + (partes.join(', ') || 'ninguém'));
  });
  return out;
}

// ===================== contextos =====================

// Visão geral (auditoria de gestão, ofício)
function iaMontarContexto(mesesAtras, filtro) {
  const B = iaBase(filtro);
  const srvs = B.srvs, ids = B.ids, porId = B.porId, hoje = B.hoje, cod = B.cod, desc = B.desc;
  const L = [];
  const mesesPassados = [];
  for (let i = mesesAtras - 1; i >= 0; i--) { const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1); mesesPassados.push(iaChaveMes(d.getFullYear(), d.getMonth())); }
  const inicioJanela = new Date(hoje.getFullYear(), hoje.getMonth() - (mesesAtras - 1), 1);

  const porSetor = {}; let efetivos = 0, contratados = 0;
  srvs.forEach(function (s) { const k = iaSetor(s); porSetor[k] = (porSetor[k] || 0) + 1; if (iaVinculo(s) === 'contratado') contratados++; else efetivos++; });
  L.push('DATA DE HOJE: ' + iaBR(hoje) + ' | PERÍODO ANALISADO: últimos ' + mesesAtras + ' meses + programação futura');
  L.push('');
  L.push('QUADRO: ' + srvs.length + ' servidores (' + efetivos + ' efetivos, ' + contratados + ' contratados)');
  L.push('Por setor: ' + Object.keys(porSetor).sort().map(function (k) { return k + '=' + porSetor[k]; }).join('; '));

  // Banco de horas
  const bh = DB.bancoHoras().filter(function (r) { return ids.has(r.srvId); });
  const bhMes = {}; mesesPassados.forEach(function (m) { bhMes[m] = { g: 0, p: 0 }; });
  const bhSrv = {}, bhSetor = {}; let saldoTotalH = 0;
  bh.forEach(function (r) {
    const g = Number(r.horasGeradas) || 0, p = Number(r.horasPagas) || 0;
    saldoTotalH += g - p;
    const o = bhSrv[r.srvId] || (bhSrv[r.srvId] = { saldo: 0, gJan: 0 });
    o.saldo += g - p;
    const k = iaChaveMes(Number(r.ano), Number(r.mes));
    if (bhMes[k]) {
      bhMes[k].g += g; bhMes[k].p += p; o.gJan += g;
      const st = iaSetor(porId[r.srvId]); const os = bhSetor[st] || (bhSetor[st] = { g: 0, p: 0 }); os.g += g; os.p += p;
    }
  });
  L.push('');
  L.push('BANCO DE HORAS / HORAS EXTRAS (horas)');
  L.push('Saldo total acumulado (geradas - compensadas/pagas, todo o histórico): ' + iaNum(saldoTotalH) + ' h');
  L.push('Por mês (geradas/compensadas): ' + mesesPassados.map(function (m) { return iaRotuloMes(m) + ' ' + iaNum(bhMes[m].g) + '/' + iaNum(bhMes[m].p); }).join('; '));
  L.push('Por setor no período (geradas/compensadas): ' + iaLista(Object.keys(bhSetor).sort().map(function (k) { return k + ' ' + iaNum(bhSetor[k].g) + '/' + iaNum(bhSetor[k].p); }), 'sem lançamentos'));
  const topSaldoH = Object.keys(bhSrv).filter(function (id) { return bhSrv[id].saldo > 0; }).sort(function (a, b) { return bhSrv[b].saldo - bhSrv[a].saldo; }).slice(0, 12);
  L.push('Maiores saldos de horas: ' + iaLista(topSaldoH.map(function (id) { return desc(id) + ' ' + iaNum(bhSrv[id].saldo) + ' h'; })));
  const topGer = Object.keys(bhSrv).filter(function (id) { return bhSrv[id].gJan > 0; }).sort(function (a, b) { return bhSrv[b].gJan - bhSrv[a].gJan; }).slice(0, 12);
  L.push('Quem mais gerou horas no período: ' + iaLista(topGer.map(function (id) { return desc(id) + ' ' + iaNum(bhSrv[id].gJan) + ' h'; }), 'ninguém'));
  const negH = Object.keys(bhSrv).filter(function (id) { return bhSrv[id].saldo < -0.01; });
  L.push('Servidores com saldo de horas negativo: ' + negH.length + (negH.length ? ' (' + negH.slice(0, 10).map(function (id) { return cod(id) + ' ' + iaNum(bhSrv[id].saldo) + ' h'; }).join('; ') + ')' : ''));

  // Folgas
  const fg = DB.folgas().filter(function (f) { return ids.has(f.srvId); });
  const fgMes = {}; mesesPassados.forEach(function (m) { fgMes[m] = { c: 0, d: 0 }; });
  const fgSrv = {};
  fg.forEach(function (f) {
    const q = Number(f.qtd) || 0, cred = f.tipo === 'credito';
    fgSrv[f.srvId] = (fgSrv[f.srvId] || 0) + (cred ? q : -q);
    const d = iaData(f.data) || iaDatasFolga(f)[0] || iaData(f.criadoEm);
    if (d) { const k = iaChaveMes(d.getFullYear(), d.getMonth()); if (fgMes[k]) { if (cred) fgMes[k].c += q; else fgMes[k].d += q; } }
  });
  const saldosF = Object.keys(fgSrv);
  const totalFolgas = saldosF.reduce(function (a, id) { return a + (fgSrv[id] > 0 ? fgSrv[id] : 0); }, 0);
  const negF = saldosF.filter(function (id) { return fgSrv[id] < -0.01; });
  L.push('');
  L.push('FOLGAS (dias)');
  L.push('Dias de folga em banco (soma dos saldos positivos): ' + iaNum(totalFolgas) + ' | servidores com saldo positivo: ' + saldosF.filter(function (id) { return fgSrv[id] > 0.01; }).length + ' | com saldo negativo: ' + negF.length);
  L.push('Por mês (créditos gerados/folgas usadas): ' + mesesPassados.map(function (m) { return iaRotuloMes(m) + ' ' + iaNum(fgMes[m].c) + '/' + iaNum(fgMes[m].d); }).join('; '));
  const topF = saldosF.filter(function (id) { return fgSrv[id] > 0; }).sort(function (a, b) { return fgSrv[b] - fgSrv[a]; }).slice(0, 12);
  L.push('Maiores saldos de folga: ' + iaLista(topF.map(function (id) { return desc(id) + ' ' + iaNum(fgSrv[id]) + ' d'; })));
  if (negF.length) L.push('Saldos negativos: ' + negF.slice(0, 10).map(function (id) { return desc(id) + ' ' + iaNum(fgSrv[id]) + ' d'; }).join('; '));

  // Férias
  const progs = iaProgs(ids);
  const mesesFuturos = [];
  for (let i = 0; i < 12; i++) { const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1); mesesFuturos.push(iaChaveMes(d.getFullYear(), d.getMonth())); }
  const feriasMes = {}; mesesFuturos.forEach(function (m) { feriasMes[m] = { pessoas: new Set(), setor: {} }; });
  const comFeriasFuturas = new Set(), comFeriasNoAno = new Set(); const semAutorizacao = [];
  progs.forEach(function (p) {
    const ini = iaData(p.inicio), fim = iaData(p.fim);
    if (ini.getFullYear() === hoje.getFullYear() || fim.getFullYear() === hoje.getFullYear()) comFeriasNoAno.add(p.srvId);
    if (fim < hoje) return;
    comFeriasFuturas.add(p.srvId);
    mesesFuturos.forEach(function (m) {
      const a = m.split('-'); const m0 = new Date(+a[0], +a[1] - 1, 1), m1 = new Date(+a[0], +a[1], 0);
      if (ini <= m1 && fim >= m0) { feriasMes[m].pessoas.add(p.srvId); const st = iaSetor(porId[p.srvId]); (feriasMes[m].setor[st] || (feriasMes[m].setor[st] = new Set())).add(p.srvId); }
    });
    const diasAte = iaDiasEntre(hoje, ini);
    if (!p.autorizado && !p.concluido && diasAte >= 0 && diasAte <= 60) semAutorizacao.push(desc(p.srvId) + ' início ' + iaBR(ini) + ' (em ' + diasAte + ' dias)');
  });
  const efetSrvs = srvs.filter(iaEfetivo);
  const porSetorEf = {}; efetSrvs.forEach(function (s) { const k = iaSetor(s); porSetorEf[k] = (porSetorEf[k] || 0) + 1; });
  L.push('');
  L.push('FÉRIAS (somente servidores EFETIVOS: ' + efetSrvs.length + ' de ' + srvs.length + ')');
  L.push(IA_REGRA_FERIAS);
  L.push('Efetivos por setor: ' + Object.keys(porSetorEf).sort().map(function (k) { return k + '=' + porSetorEf[k]; }).join('; '));
  L.push('Servidores com férias nos próximos 12 meses, por mês: ' + mesesFuturos.map(function (m) { return iaRotuloMes(m) + ' ' + feriasMes[m].pessoas.size; }).join('; '));
  const concentr = [];
  mesesFuturos.forEach(function (m) {
    Object.keys(feriasMes[m].setor).forEach(function (st) {
      const fora = feriasMes[m].setor[st].size, tot = porSetorEf[st] || 0;
      if (fora >= 2 && tot && fora / tot >= 0.25) concentr.push(iaRotuloMes(m) + ' ' + st + ': ' + fora + ' de ' + tot + ' fora');
    });
  });
  L.push('Meses/setores com 25% ou mais dos efetivos do setor de férias no mesmo mês: ' + iaLista(concentr.slice(0, 25)));
  const confl = iaLinhasConflitos(B, null, 40);
  L.push('CONFLITOS POR UNIDADE E CATEGORIA (dois efetivos do mesmo setor e mesmo cargo com férias na mesma data ou no mesmo mês; em curso/futuras): ' + confl.length + (confl.length ? '\n- ' + confl.join('\n- ') : ' (nenhum)'));
  L.push('Férias que começam em até 60 dias e ainda NÃO estão autorizadas: ' + iaLista(semAutorizacao.slice(0, 20), 'nenhuma'));
  const semProg = efetSrvs.filter(function (s) { return !comFeriasFuturas.has(s.id) && !comFeriasNoAno.has(s.id); });
  const semPorSetor = {}; semProg.forEach(function (s) { const k = iaSetor(s); semPorSetor[k] = (semPorSetor[k] || 0) + 1; });
  L.push('Efetivos sem nenhuma férias registrada em ' + hoje.getFullYear() + ' nem programada para frente: ' + semProg.length + ' de ' + efetSrvs.length +
    (semProg.length ? ' — por setor: ' + Object.keys(semPorSetor).sort().map(function (k) { return k + '=' + semPorSetor[k]; }).join('; ') : ''));
  const antigos = semProg.map(function (s) { const a = iaData(s.admissao); return { s: s, anos: a ? (hoje - a) / (365.25 * IA_DIA_MS) : null }; })
    .filter(function (x) { return x.anos !== null && x.anos >= 1; }).sort(function (a, b) { return b.anos - a.anos; }).slice(0, 15);
  if (antigos.length) L.push('Entre eles, os de mais tempo de casa: ' + antigos.map(function (x) { return desc(x.s.id) + ' ' + iaNum(x.anos) + ' anos'; }).join('; '));

  // Solicitações
  try {
    const sol = DB.solicitacoes().filter(function (s) { return ids.has(s.srvId); });
    const pend = sol.filter(function (s) { return s.status === 'pendente'; });
    const antigas = pend.filter(function (s) { const d = iaData(s.criadoEm); return d && iaDiasEntre(d, hoje) > 7; }).length;
    L.push('');
    L.push('SOLICITAÇÕES: ' + pend.length + ' pendentes de resposta (' + antigas + ' há mais de 7 dias); ' + sol.filter(function (s) { return s.status === 'autorizado'; }).length + ' aprovadas e ' + sol.filter(function (s) { return s.status === 'negado'; }).length + ' negadas no histórico');
  } catch (e) { /* módulo opcional */ }

  // Atestados
  const itens = iaItensAtestado(ids);
  const atMes = {}; mesesPassados.forEach(function (m) { atMes[m] = 0; });
  const atSrv = {}, atSetor = {};
  itens.forEach(function (i) {
    (i.datas || []).forEach(function (x) {
      const d = iaData(x.data); if (!d || d < inicioJanela) return;
      const k = iaChaveMes(d.getFullYear(), d.getMonth()); if (atMes[k] === undefined) return;
      atMes[k]++; atSrv[i.srvId] = (atSrv[i.srvId] || 0) + 1;
      const st = iaSetor(porId[i.srvId]); atSetor[st] = (atSetor[st] || 0) + 1;
    });
  });
  const totalAt = Object.keys(atMes).reduce(function (a, k) { return a + atMes[k]; }, 0);
  L.push('');
  L.push('ATESTADOS (dias de atestado registrados nos protocolos de entrega, no período): ' + totalAt);
  if (totalAt) {
    L.push('Por mês: ' + mesesPassados.map(function (m) { return iaRotuloMes(m) + ' ' + atMes[m]; }).join('; '));
    L.push('Por setor: ' + Object.keys(atSetor).sort().map(function (k) { return k + '=' + atSetor[k]; }).join('; '));
    L.push('Servidores com mais dias: ' + Object.keys(atSrv).sort(function (a, b) { return atSrv[b] - atSrv[a]; }).slice(0, 10).map(function (id) { return desc(id) + ' ' + atSrv[id] + ' d'; }).join('; '));
  }
  return L.join('\n');
}

// Ficha numérica de um servidor
function iaLinhasServidor(B, id) {
  const s = B.porId[id], hoje = B.hoje, L = [];
  const adm = iaData(s.admissao);
  L.push('SERVIDOR ' + B.desc(id) + (adm ? ' | admissão ' + iaBR(adm) + ' (' + iaNum((hoje - adm) / (365.25 * IA_DIA_MS)) + ' anos de casa)' : ' | admissão não informada'));
  L.push('Setor ' + iaSetor(s) + ' tem ' + (B.porSetor[iaSetor(s)] || 0) + ' servidores.');
  // horas
  const bh = DB.bancoHoras().filter(function (r) { return r.srvId === id; });
  const ult = bh.slice().sort(function (a, b) { return (b.ano * 12 + b.mes) - (a.ano * 12 + a.mes); }).slice(0, 8)
    .map(function (r) { return iaRotuloMes(iaChaveMes(Number(r.ano), Number(r.mes))) + ' +' + iaNum(r.horasGeradas) + '/-' + iaNum(r.horasPagas); });
  L.push('Banco de horas: saldo ' + iaNum(iaSaldoHoras(id)) + ' h. Últimos lançamentos (geradas/compensadas): ' + iaLista(ult, 'nenhum'));
  // folgas
  const fg = DB.folgas().filter(function (f) { return f.srvId === id; });
  const usos12 = fg.filter(function (f) { if (f.tipo === 'credito') return false; const d = iaDatasFolga(f)[0] || iaData(f.criadoEm); return d && iaDiasEntre(d, hoje) <= 365; });
  const futuras = [];
  fg.forEach(function (f) { if (f.tipo !== 'credito') iaDatasFolga(f).forEach(function (d) { if (d >= hoje) futuras.push(iaBR(d)); }); });
  L.push('Folgas: saldo ' + iaNum(iaSaldoFolgas(id)) + ' d; usou ' + iaNum(usos12.reduce(function (a, f) { return a + (Number(f.qtd) || 0); }, 0)) + ' d nos últimos 12 meses; folgas já marcadas para frente: ' + iaLista(futuras.slice(0, 10), 'nenhuma'));
  // férias
  const pr = iaProgs().filter(function (p) { return p.srvId === id; }).sort(function (a, b) { return iaData(a.inicio) - iaData(b.inicio); });
  const passadas = pr.filter(function (p) { return iaData(p.fim) < hoje; });
  const futurasF = pr.filter(function (p) { return iaData(p.fim) >= hoje; });
  const ultima = passadas[passadas.length - 1];
  L.push('Férias: última ' + (ultima ? iaBR(iaData(ultima.inicio)) + ' a ' + iaBR(iaData(ultima.fim)) + ' (terminou há ' + iaDiasEntre(iaData(ultima.fim), hoje) + ' dias)' : 'sem registro no sistema') +
    '; programadas: ' + iaLista(futurasF.map(function (p) { return iaBR(iaData(p.inicio)) + ' a ' + iaBR(iaData(p.fim)) + (p.autorizado ? ' [autorizada]' : ' [não autorizada]'); }), 'nenhuma'));
  // atestados
  const dias = [];
  iaItensAtestado().forEach(function (i) { if (i.srvId === id) (i.datas || []).forEach(function (x) { const d = iaData(x.data); if (d && iaDiasEntre(d, hoje) <= 365 && d <= hoje) dias.push(d); }); });
  L.push('Atestados nos últimos 12 meses: ' + dias.length + ' dias.');
  // solicitações
  try {
    const sol = DB.solicitacoes().filter(function (x) { return x.srvId === id; });
    L.push('Solicitações: ' + sol.filter(function (x) { return x.status === 'pendente'; }).length + ' pendentes, ' + sol.filter(function (x) { return x.status === 'autorizado'; }).length + ' aprovadas, ' + sol.filter(function (x) { return x.status === 'negado'; }).length + ' negadas.');
  } catch (e) { /* opcional */ }
  return L;
}

function iaCtxServidor(id, rotuloNome) {
  const B = iaBase(null, rotuloNome);
  if (!B.porId[id]) throw new Error('Selecione o servidor.');
  const L = ['DATA DE HOJE: ' + iaBR(B.hoje), ''].concat(iaLinhasServidor(B, id));
  const fim = new Date(B.hoje.getTime() + 90 * IA_DIA_MS);
  const aus = iaAusenciasSetor(B, iaSetor(B.porId[id]), B.hoje, fim, id);
  L.push('');
  L.push('COLEGAS DO SETOR FORA NOS PRÓXIMOS 90 DIAS: ' + iaLista(aus.linhas.slice(0, 25), 'ninguém'));
  return L.join('\n');
}

function iaCtxSimulador(id, inicioStr, dias) {
  const B = iaBase();
  const s = B.porId[id]; if (!s) throw new Error('Selecione o servidor.');
  if (!iaEfetivo(s)) throw new Error('Este servidor é contratado. A programação de férias é feita apenas com servidores efetivos.');
  const ini = iaData(inicioStr); if (!ini) throw new Error('Informe a data de início.');
  dias = Math.floor(Number(dias)); if (!(dias >= 1 && dias <= 60)) throw new Error('Informe a quantidade de dias (1 a 60).');
  const fim = new Date(ini.getTime() + (dias - 1) * IA_DIA_MS);
  const setor = iaSetor(s);
  const L = ['DATA DE HOJE: ' + iaBR(B.hoje), '', 'FÉRIAS SIMULADAS: ' + B.cod(id) + ' de ' + iaBR(ini) + ' a ' + iaBR(fim) + ' (' + dias + ' dias), começando em ' + iaDiasEntre(B.hoje, ini) + ' dias.', ''];
  iaLinhasServidor(B, id).forEach(function (l) { L.push(l); });
  const aus = iaAusenciasSetor(B, setor, ini, fim, id);
  const mesmoCargo = B.todos.filter(function (x) { return iaSetor(x) === setor && x.id !== id && iaEfetivo(x) && (x.cargo || '') === (s.cargo || ''); }).length;
  L.push('');
  L.push(IA_REGRA_FERIAS);
  L.push('SETOR NO PERÍODO SIMULADO: ' + (B.porSetor[setor] || 0) + ' servidores no setor (' + (B.porSetorEf[setor] || 0) + ' efetivos); ' + mesmoCargo + ' outros efetivos com o mesmo cargo (' + (s.cargo || 'sem cargo') + '). Além do servidor simulado, ' + aus.pessoas + ' já estarão fora em algum dia do período:');
  L.push(iaLista(aus.linhas.slice(0, 30), 'ninguém'));
  const confSim = aus.linhas.filter(function (l) { return l.indexOf('(' + (s.cargo || 'sem cargo') + ') férias') >= 0; });
  L.push('CONFLITO DE CATEGORIA NAS DATAS SIMULADAS (mesmo setor e mesmo cargo, de férias na mesma data): ' + iaLista(confSim, 'nenhum'));
  const mesesSim = []; for (let d = new Date(ini.getFullYear(), ini.getMonth(), 1); d <= fim; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) mesesSim.push(iaChaveMes(d.getFullYear(), d.getMonth()));
  const mesmoMes = iaProgs().filter(function (p) { const x = B.porId[p.srvId]; if (!x || p.srvId === id || iaSetor(x) !== setor || (x.cargo || '') !== (s.cargo || '')) return false; const a = iaData(p.inicio), b = iaData(p.fim); return mesesSim.some(function (m) { const q = m.split('-'); const m0 = new Date(+q[0], +q[1] - 1, 1), m1 = new Date(+q[0], +q[1], 0); return a <= m1 && b >= m0; }); })
    .map(function (p) { return B.cod(p.srvId) + ' ' + iaBR(iaData(p.inicio)) + ' a ' + iaBR(iaData(p.fim)); });
  L.push('MESMA CATEGORIA COM FÉRIAS NO MESMO MÊS: ' + iaLista(mesmoMes, 'ninguém'));
  L.push('');
  L.push('CALENDÁRIO DE FÉRIAS DO SETOR (efetivos de férias/total de efetivos do setor, próximos 12 meses):');
  iaLinhasCalendario(B, iaCalendarioFerias(B), setor).forEach(function (l) { L.push(l); });
  return L.join('\n');
}

function iaCtxEscala(setorFiltro) {
  const B = iaBase();
  const hoje = B.hoje, ano = hoje.getFullYear();
  const comFerias = new Set();
  iaProgs().forEach(function (p) { const a = iaData(p.inicio), b = iaData(p.fim); if (b >= hoje || a.getFullYear() === ano || b.getFullYear() === ano) comFerias.add(p.srvId); });
  const sem = B.todos.filter(function (s) { return iaEfetivo(s) && !comFerias.has(s.id) && (!setorFiltro || iaSetor(s) === setorFiltro); })
    .map(function (s) { const a = iaData(s.admissao); return { s: s, anos: a ? (hoje - a) / (365.25 * IA_DIA_MS) : -1 }; })
    .sort(function (a, b) { return b.anos - a.anos; });
  if (!sem.length) throw new Error('Todos os servidores efetivos' + (setorFiltro ? ' deste setor' : '') + ' já têm férias no ano ou programadas.');
  const L = ['DATA DE HOJE: ' + iaBR(hoje), '', IA_REGRA_FERIAS, 'EFETIVOS POR SETOR: ' + Object.keys(B.porSetorEf).sort().map(function (k) { return k + '=' + B.porSetorEf[k]; }).join('; '), ''];
  L.push('REGRA DE DISTRIBUIÇÃO: evitar que dois efetivos do mesmo setor e mesmo cargo fiquem de férias na mesma data; de preferência, nem no mesmo mês.');
  L.push('SERVIDORES EFETIVOS SEM FÉRIAS EM ' + ano + ' NEM PROGRAMADAS (' + sem.length + (sem.length > 60 ? ', mostrando os 60 com mais tempo de casa' : '') + '):');
  sem.slice(0, 60).forEach(function (x) { L.push('- ' + B.desc(x.s.id) + (x.anos >= 0 ? ' ' + iaNum(x.anos) + ' anos de casa' : ' admissão não informada') + '; saldo de horas ' + iaNum(iaSaldoHoras(x.s.id)) + ' h'); });
  L.push('');
  L.push('FÉRIAS JÁ PROGRAMADAS (efetivos de férias/total de efetivos do setor, por mês):');
  iaLinhasCalendario(B, iaCalendarioFerias(B), setorFiltro || null).forEach(function (l) { L.push(l); });
  const progsFut = iaProgs(B.ids).filter(function (p) { return iaData(p.fim) >= hoje && (!setorFiltro || iaSetor(B.porId[p.srvId]) === setorFiltro); })
    .sort(function (a, b) { return iaData(a.inicio) - iaData(b.inicio); });
  L.push('');
  L.push('PERÍODOS JÁ PROGRAMADOS POR CATEGORIA (setor / cargo: quem e quando): ');
  progsFut.slice(0, 80).forEach(function (p) { const s = B.porId[p.srvId]; L.push('- ' + iaSetor(s) + ' / ' + (s.cargo || 'sem cargo') + ': ' + B.cod(p.srvId) + ' ' + iaBR(iaData(p.inicio)) + ' a ' + iaBR(iaData(p.fim))); });
  const confl = iaLinhasConflitos(B, setorFiltro, 30);
  L.push('CONFLITOS JÁ EXISTENTES (mesmo setor e cargo, mesma data ou mês): ' + (confl.length ? '\n- ' + confl.join('\n- ') : 'nenhum'));
  return L.join('\n');
}

function iaCtxCompensacao(setorFiltro) {
  const B = iaBase();
  const saldos = B.todos.filter(function (s) { return !setorFiltro || iaSetor(s) === setorFiltro; })
    .map(function (s) { return { s: s, h: iaSaldoHoras(s.id) }; }).filter(function (x) { return x.h > 0.01; })
    .sort(function (a, b) { return b.h - a.h; });
  if (!saldos.length) throw new Error('Nenhum servidor' + (setorFiltro ? ' deste setor' : '') + ' com saldo positivo de horas.');
  const total = saldos.reduce(function (a, x) { return a + x.h; }, 0);
  const porSetor = {}; saldos.forEach(function (x) { const k = iaSetor(x.s); porSetor[k] = (porSetor[k] || 0) + x.h; });
  const L = ['DATA DE HOJE: ' + iaBR(B.hoje), '', 'SALDO POSITIVO DE HORAS: ' + iaNum(total) + ' h em ' + saldos.length + ' servidores.',
    'Por setor (horas/tamanho do setor): ' + Object.keys(porSetor).sort().map(function (k) { return k + ' ' + iaNum(porSetor[k]) + ' h/' + (B.porSetor[k] || '?') + ' pessoas'; }).join('; '), '',
    'SERVIDORES COM SALDO (' + (saldos.length > 40 ? 'os 40 maiores' : 'todos') + '):'];
  saldos.slice(0, 40).forEach(function (x) {
    const pr = iaProgs().filter(function (p) { return p.srvId === x.s.id && iaData(p.fim) >= B.hoje; })
      .map(function (p) { return iaBR(iaData(p.inicio)) + ' a ' + iaBR(iaData(p.fim)); });
    L.push('- ' + B.desc(x.s.id) + ' ' + iaNum(x.h) + ' h; saldo de folgas ' + iaNum(iaSaldoFolgas(x.s.id)) + ' d; férias programadas: ' + iaLista(pr, 'nenhuma'));
  });
  L.push('');
  L.push('FÉRIAS PROGRAMADAS POR SETOR (efetivos de férias/total de efetivos, por mês):');
  iaLinhasCalendario(B, iaCalendarioFerias(B), setorFiltro || null).slice(0, 6).forEach(function (l) { L.push(l); });
  return L.join('\n');
}

function iaCtxParecer(solId) {
  const B = iaBase();
  const sol = DB.solicitacoes().find(function (x) { return x.id === solId; });
  if (!sol) throw new Error('Selecione a solicitação.');
  const s = B.porId[sol.srvId]; if (!s) throw new Error('O servidor desta solicitação não está entre os seus setores.');
  let ini = iaData(sol.inicio), fim = iaData(sol.fim);
  const partes = [];
  if (Array.isArray(sol.periodos) && sol.periodos.length) {
    sol.periodos.forEach(function (p, i) { partes.push((i + 1) + 'º período ' + iaBR(iaData(p.inicio)) + ' a ' + iaBR(iaData(p.fim))); });
    ini = iaData(sol.periodos[0].inicio); fim = iaData(sol.periodos[sol.periodos.length - 1].fim);
  } else if (Array.isArray(sol.dataItems) && sol.dataItems.length) {
    partes.push('dias: ' + sol.dataItems.map(function (d) { return iaBR(iaData(d.data)) + (d.peso === 0.5 ? ' (meio período)' : ''); }).join(', '));
  } else if (ini) partes.push(iaBR(ini) + ' a ' + iaBR(fim || ini));
  if (!ini) throw new Error('A solicitação não tem datas.');
  if (!fim) fim = ini;
  const criada = iaData(sol.criadoEm);
  const L = ['DATA DE HOJE: ' + iaBR(B.hoje), '',
    'SOLICITAÇÃO: tipo ' + String(sol.tipo || '').replace(/_/g, ' ') + '; ' + partes.join('; ') + (sol.qtd ? '; total ' + iaNum(sol.qtd) + ' dia(s)' : '') +
    '; pedida em ' + iaBR(criada) + (criada ? ' (há ' + iaDiasEntre(criada, B.hoje) + ' dias)' : '') + '; começa em ' + iaDiasEntre(B.hoje, ini) + ' dias; situação: ' + sol.status, ''];
  iaLinhasServidor(B, sol.srvId).forEach(function (l) { L.push(l); });
  const setor = iaSetor(s);
  const aus = iaAusenciasSetor(B, setor, ini, fim, sol.srvId);
  const mesmoCargo = B.todos.filter(function (x) { return iaSetor(x) === setor && x.id !== sol.srvId && iaEfetivo(x) && (x.cargo || '') === (s.cargo || ''); }).length;
  L.push('');
  if (String(sol.tipo || '').indexOf('ferias') >= 0) { L.push(IA_REGRA_FERIAS); if (!iaEfetivo(s)) L.push('ATENÇÃO: o solicitante é CONTRATADO; pedido de férias de contratado não entra na programação de férias.'); }
  L.push('SETOR NAS DATAS PEDIDAS: ' + (B.porSetor[setor] || 0) + ' servidores (' + (B.porSetorEf[setor] || 0) + ' efetivos); ' + mesmoCargo + ' outros efetivos com o mesmo cargo; ' + aus.pessoas + ' já fora em algum dia do período:');
  L.push(iaLista(aus.linhas.slice(0, 30), 'ninguém'));
  const confPar = aus.linhas.filter(function (l) { return l.indexOf('(' + (s.cargo || 'sem cargo') + ') férias') >= 0; });
  L.push('CONFLITO DE CATEGORIA (mesmo setor e cargo de férias na mesma data): ' + iaLista(confPar, 'nenhum'));
  return L.join('\n');
}

function iaCtxConflitos(setorFiltro) {
  const B = iaBase();
  const R = typeof feriasConflitos === 'function' ? feriasConflitos({ setor: setorFiltro || '', escopo: 'futuro' }) : { conflitos: [], base: { efetivos: 0, progs: 0, setores: {} } };
  const confl = R.conflitos.filter(function (c) { return B.ids.has(c.a.srv.id) || B.ids.has(c.b.srv.id); });
  if (!confl.length) throw new Error('Nenhum conflito de férias' + (setorFiltro ? ' nesta unidade' : '') + ': não há dois efetivos da mesma categoria com férias na mesma data nem no mesmo mês.');
  const L = ['DATA DE HOJE: ' + iaBR(B.hoje), IA_REGRA_FERIAS, '',
    'EFETIVOS POR UNIDADE: ' + Object.keys(R.base.setores).sort().map(function (k) { return k + '=' + R.base.setores[k]; }).join('; '),
    'PERÍODOS DE FÉRIAS ANALISADOS (em curso e futuros): ' + R.base.progs, ''];
  const cat = {};
  B.todos.forEach(function (s) { if (!iaEfetivo(s) || (setorFiltro && iaSetor(s) !== setorFiltro)) return; const k = iaSetor(s) + ' / ' + (typeof feriasCargoChave === 'function' ? feriasCargoChave(s) : String(s.cargo || 'sem cargo').trim().toLowerCase()); cat[k] = (cat[k] || 0) + 1; });
  L.push('TAMANHO DE CADA CATEGORIA (setor / cargo = efetivos): ' + Object.keys(cat).sort().map(function (k) { return k + '=' + cat[k]; }).join('; '));
  L.push('');
  L.push('CONFLITOS (' + confl.length + '):');
  confl.slice(0, 60).forEach(function (c, i) {
    L.push((i + 1) + '. ' + c.setor + ' / ' + c.cargo + ' — ' + (c.tipo === 'data' ? 'MESMA DATA' : 'MESMO MÊS') + ': ' +
      B.desc(c.a.srv.id) + ' ' + iaBR(c.a.ini) + ' a ' + iaBR(c.a.fim) + (c.a.prog.autorizado ? ' [autorizada]' : ' [só programada]') + ' x ' +
      B.desc(c.b.srv.id) + ' ' + iaBR(c.b.ini) + ' a ' + iaBR(c.b.fim) + (c.b.prog.autorizado ? ' [autorizada]' : ' [só programada]') + ' — ' + c.detalhe);
  });
  L.push('');
  L.push('OBS.: férias já AUTORIZADAS têm documento emitido; prefira remanejar a que está só programada.');
  L.push('CALENDÁRIO (efetivos de férias/total de efetivos do setor, próximos 12 meses):');
  iaLinhasCalendario(B, iaCalendarioFerias(B), setorFiltro || null).forEach(function (l) { L.push(l); });
  return L.join('\n');
}

function iaCtxSemanal() {
  const B = iaBase();
  const hoje = B.hoje, em7 = new Date(hoje.getTime() + 7 * IA_DIA_MS), em30 = new Date(hoje.getTime() + 30 * IA_DIA_MS);
  const L = ['DATA DE HOJE: ' + iaBR(hoje) + ' (' + IA_DIAS_SEMANA[hoje.getDay()] + ')', ''];
  const saem = [], voltam = [], emCurso = [], semAut = [], prox30 = [];
  iaProgs(B.ids).forEach(function (p) {
    const a = iaData(p.inicio), b = iaData(p.fim), ret = new Date(b.getTime() + IA_DIA_MS);
    if (a >= hoje && a <= em7) saem.push(B.desc(p.srvId) + ' sai em ' + iaBR(a) + (p.autorizado ? '' : ' [SEM AUTORIZAÇÃO]'));
    if (ret >= hoje && ret <= em7) voltam.push(B.desc(p.srvId) + ' volta em ' + iaBR(ret));
    if (a < hoje && b >= hoje) emCurso.push(B.cod(p.srvId) + ' [' + iaSetor(B.porId[p.srvId]) + '] até ' + iaBR(b));
    if (!p.autorizado && !p.concluido && a >= hoje && a <= em30) semAut.push(B.desc(p.srvId) + ' início ' + iaBR(a) + ' (em ' + iaDiasEntre(hoje, a) + ' dias)');
    if (a > em7 && a <= em30) prox30.push(B.cod(p.srvId) + ' [' + iaSetor(B.porId[p.srvId]) + '] ' + iaBR(a));
  });
  L.push('FÉRIAS — saem nos próximos 7 dias: ' + iaLista(saem, 'ninguém'));
  L.push('FÉRIAS — voltam nos próximos 7 dias: ' + iaLista(voltam, 'ninguém'));
  L.push('FÉRIAS — em curso hoje: ' + iaLista(emCurso.slice(0, 25), 'ninguém'));
  L.push('FÉRIAS — começam em até 30 dias SEM autorização: ' + iaLista(semAut.slice(0, 25), 'nenhuma'));
  L.push('FÉRIAS — começam entre 8 e 30 dias: ' + iaLista(prox30.slice(0, 25), 'nenhuma'));
  const folgas7 = {};
  DB.folgas().forEach(function (f) {
    if (f.tipo === 'credito' || !B.ids.has(f.srvId)) return;
    iaDatasFolga(f).forEach(function (d) { if (d >= hoje && d <= em7) { const k = iaBR(d) + ' ' + iaSetor(B.porId[f.srvId]); (folgas7[k] || (folgas7[k] = [])).push(B.cod(f.srvId)); } });
  });
  L.push('FOLGAS MARCADAS NOS PRÓXIMOS 7 DIAS (data setor: quem): ' + iaLista(Object.keys(folgas7).sort().map(function (k) { return k + ': ' + folgas7[k].join(', '); }).slice(0, 30), 'nenhuma'));
  try {
    const pend = DB.solicitacoes().filter(function (x) { return x.status === 'pendente' && B.ids.has(x.srvId); })
      .map(function (x) { const c = iaData(x.criadoEm), i = iaData(x.inicio) || (x.periodos && iaData(x.periodos[0].inicio)); return { t: B.desc(x.srvId) + ' ' + String(x.tipo || '').replace(/_/g, ' ') + ' para ' + iaBR(i) + ', pedida há ' + (c ? iaDiasEntre(c, hoje) : '?') + ' dias', d: c ? iaDiasEntre(c, hoje) : 0 }; })
      .sort(function (a, b) { return b.d - a.d; });
    L.push('SOLICITAÇÕES PENDENTES (' + pend.length + '): ' + iaLista(pend.slice(0, 20).map(function (x) { return x.t; }), 'nenhuma'));
  } catch (e) { /* opcional */ }
  const negF = B.srvs.map(function (s) { return { id: s.id, v: iaSaldoFolgas(s.id) }; }).filter(function (x) { return x.v < -0.01; });
  const negH = B.srvs.map(function (s) { return { id: s.id, v: iaSaldoHoras(s.id) }; }).filter(function (x) { return x.v < -0.01; });
  L.push('SALDOS NEGATIVOS — folgas: ' + iaLista(negF.slice(0, 15).map(function (x) { return B.desc(x.id) + ' ' + iaNum(x.v) + ' d'; })) + ' | horas: ' + iaLista(negH.slice(0, 15).map(function (x) { return B.desc(x.id) + ' ' + iaNum(x.v) + ' h'; })));
  const sem7 = new Date(hoje.getTime() - 7 * IA_DIA_MS);
  const novosBH = DB.bancoHoras().filter(function (r) { const d = iaData(r.criadoEm); return d && d >= sem7 && B.ids.has(r.srvId); });
  L.push('LANÇADO NOS ÚLTIMOS 7 DIAS: ' + novosBH.length + ' lançamentos de banco de horas (' + iaNum(novosBH.reduce(function (a, r) { return a + (Number(r.horasGeradas) || 0); }, 0)) + ' h geradas); ' +
    DB.folgas().filter(function (f) { const d = iaData(f.criadoEm); return d && d >= sem7 && B.ids.has(f.srvId); }).length + ' lançamentos de folga.');
  return L.join('\n');
}

// Auditoria dos lançamentos: as checagens são feitas aqui; a IA só organiza e explica
function iaCtxAuditoriaDados() {
  const B = iaBase();
  const hoje = B.hoje, A = [];
  const add = function (grav, txt) { A.push('[' + grav + '] ' + txt); };
  // cadastro
  const semSetor = B.srvs.filter(function (s) { return !s.setor; }), semCargo = B.srvs.filter(function (s) { return !s.cargo; });
  const semAdm = B.srvs.filter(function (s) { return !iaData(s.admissao); }), semVinc = B.srvs.filter(function (s) { return !s.vinculo; });
  if (semSetor.length) add('cadastro', semSetor.length + ' servidores sem setor: ' + semSetor.slice(0, 15).map(function (s) { return B.cod(s.id); }).join(', '));
  if (semCargo.length) add('cadastro', semCargo.length + ' servidores sem cargo: ' + semCargo.slice(0, 15).map(function (s) { return B.cod(s.id); }).join(', '));
  if (semAdm.length) add('cadastro', semAdm.length + ' servidores sem data de admissão: ' + semAdm.slice(0, 15).map(function (s) { return B.cod(s.id); }).join(', '));
  if (semVinc.length) add('cadastro', semVinc.length + ' servidores sem vínculo informado (o sistema trata como efetivo, o que muda a regra de perícia)');
  // banco de horas
  const bh = DB.bancoHoras();
  const orfBH = bh.filter(function (r) { return !DB.servidores().some(function (s) { return s.id === r.srvId; }); }).length;
  if (orfBH) add('alta', orfBH + ' lançamentos de banco de horas de servidor que não existe mais no cadastro');
  const chaves = {};
  bh.forEach(function (r) { if (r.tipoLancamento === 'ajuste' || !B.ids.has(r.srvId)) return; const k = r.srvId + '|' + r.ano + '|' + r.mes; (chaves[k] || (chaves[k] = [])).push(r); });
  Object.keys(chaves).forEach(function (k) {
    const g = chaves[k]; if (g.length < 2) return;
    const iguais = g.every(function (r) { return Number(r.horasGeradas) === Number(g[0].horasGeradas) && Number(r.horasPagas) === Number(g[0].horasPagas); });
    add(iguais ? 'alta' : 'conferir', B.desc(g[0].srvId) + ': ' + g.length + ' lançamentos de horas em ' + iaRotuloMes(iaChaveMes(Number(g[0].ano), Number(g[0].mes))) + (iguais ? ' com valores idênticos (possível duplicidade)' : ' com valores diferentes'));
  });
  bh.forEach(function (r) {
    if (!B.ids.has(r.srvId)) return;
    const g = Number(r.horasGeradas) || 0, p = Number(r.horasPagas) || 0;
    if (g > 60) add('conferir', B.desc(r.srvId) + ': ' + iaNum(g) + ' h geradas em um único lançamento (' + iaRotuloMes(iaChaveMes(Number(r.ano), Number(r.mes))) + ')');
    if (g < 0 || p < 0) add('alta', B.desc(r.srvId) + ': lançamento de horas com valor negativo em ' + iaRotuloMes(iaChaveMes(Number(r.ano), Number(r.mes))));
    if (Number(r.ano) * 12 + Number(r.mes) > hoje.getFullYear() * 12 + hoje.getMonth()) add('conferir', B.desc(r.srvId) + ': lançamento de horas em mês futuro (' + iaRotuloMes(iaChaveMes(Number(r.ano), Number(r.mes))) + ')');
  });
  B.srvs.forEach(function (s) { const v = iaSaldoHoras(s.id); if (v < -0.01) add('conferir', B.desc(s.id) + ': saldo de horas negativo (' + iaNum(v) + ' h)'); });
  // folgas
  const fg = DB.folgas();
  const orfF = fg.filter(function (f) { return !DB.servidores().some(function (s) { return s.id === f.srvId; }); }).length;
  if (orfF) add('alta', orfF + ' lançamentos de folga de servidor que não existe mais no cadastro');
  B.srvs.forEach(function (s) {
    const v = iaSaldoFolgas(s.id);
    if (v < -0.01) add('conferir', B.desc(s.id) + ': saldo de folgas negativo (' + iaNum(v) + ' d)');
    const usos = {}; let dup = 0;
    fg.forEach(function (f) { if (f.srvId !== s.id || f.tipo === 'credito') return; iaDatasFolga(f).forEach(function (d) { const k = +d; if (usos[k]) dup++; usos[k] = 1; }); });
    if (dup) add('alta', B.desc(s.id) + ': ' + dup + ' dia(s) com folga lançada mais de uma vez na mesma data');
  });
  // férias
  const progs = iaProgs(B.ids);
  const progsContr = DB.programacoes().filter(function (p) { const s = B.porId[p.srvId]; return s && B.ids.has(p.srvId) && !iaEfetivo(s); });
  if (progsContr.length) add('alta', progsContr.length + ' programação(ões) de férias lançadas para servidor CONTRATADO (a programação é só de efetivos): ' + progsContr.slice(0, 10).map(function (p) { return B.desc(p.srvId) + ' ' + iaBR(iaData(p.inicio)) + ' a ' + iaBR(iaData(p.fim)); }).join('; '));
  iaLinhasConflitos(B, null, 60).forEach(function (l) { add(l.indexOf('MESMA DATA') >= 0 ? 'alta' : 'conferir', 'conflito de férias por unidade/categoria — ' + l); });
  const porSrv = {};
  progs.forEach(function (p) {
    const a = iaData(p.inicio), b = iaData(p.fim), dias = iaDiasEntre(a, b) + 1;
    if (b < a) add('alta', B.desc(p.srvId) + ': férias com término (' + iaBR(b) + ') antes do início (' + iaBR(a) + ')');
    else if ([10, 15, 20, 30].indexOf(dias) < 0) add('conferir', B.desc(p.srvId) + ': período de férias com ' + dias + ' dias (' + iaBR(a) + ' a ' + iaBR(b) + '), fora dos parcelamentos 10/15/20/30');
    if (b < hoje && !p.concluido) add('conferir', B.desc(p.srvId) + ': férias já encerradas em ' + iaBR(b) + ' ainda não marcadas como concluídas');
    if (a <= hoje && b >= hoje && !p.autorizado) add('alta', B.desc(p.srvId) + ': em férias hoje (' + iaBR(a) + ' a ' + iaBR(b) + ') sem autorização registrada');
    (porSrv[p.srvId] || (porSrv[p.srvId] = [])).push({ a: a, b: b, dias: dias });
  });
  Object.keys(porSrv).forEach(function (id) {
    const l = porSrv[id].sort(function (x, y) { return x.a - y.a; });
    for (let i = 1; i < l.length; i++) if (l[i].a <= l[i - 1].b) add('alta', B.desc(id) + ': dois períodos de férias sobrepostos (' + iaBR(l[i - 1].a) + '–' + iaBR(l[i - 1].b) + ' e ' + iaBR(l[i].a) + '–' + iaBR(l[i].b) + ')');
    const porAno = {}; l.forEach(function (x) { if (x.dias > 0) { const y = x.a.getFullYear(); porAno[y] = (porAno[y] || 0) + x.dias; } });
    Object.keys(porAno).forEach(function (y) { if (porAno[y] > 30) add('conferir', B.desc(id) + ': ' + porAno[y] + ' dias de férias iniciados em ' + y + ' (acima de 30; pode haver período acumulado)'); });
    fg.forEach(function (f) {
      if (f.srvId !== id || f.tipo === 'credito') return;
      const dentro = iaDatasFolga(f).filter(function (d) { return l.some(function (x) { return d >= x.a && d <= x.b; }); });
      if (dentro.length) add('alta', B.desc(id) + ': folga lançada em ' + dentro.map(iaBR).join(', ') + ' dentro do período de férias');
    });
  });
  const L = ['DATA DE HOJE: ' + iaBR(hoje), 'BASE CONFERIDA: ' + B.srvs.length + ' servidores (' + B.srvs.filter(iaEfetivo).length + ' efetivos), ' + bh.length + ' lançamentos de horas, ' + fg.length + ' de folgas, ' + progs.length + ' períodos de férias de efetivos.', IA_REGRA_FERIAS, '',
    'ACHADOS DETECTADOS PELO SISTEMA (' + A.length + (A.length > 120 ? ', mostrando 120' : '') + '):'];
  if (!A.length) L.push('Nenhuma inconsistência encontrada nas checagens automáticas.');
  A.slice(0, 120).forEach(function (x) { L.push('- ' + x); });
  return L.join('\n');
}

async function iaCtxAuditoriaLog(dias) {
  const logs = await DB.getLogs(1000);
  const hoje = iaHoje(), desde = new Date(hoje.getTime() - dias * IA_DIA_MS);
  const lista = (logs || []).filter(function (l) { const d = new Date(l.criadoEm); return !isNaN(d) && d >= desde; });
  if (!lista.length) throw new Error('Não há registros de atividade nesse período.');
  _iaCodigos = {};
  const codUsr = {}; let seq = 0;
  const cu = function (l) {
    const k = l.usuarioId || l.usuarioNome || 'sistema';
    if (!codUsr[k]) { seq++; codUsr[k] = 'G' + String(seq).padStart(2, '0'); _iaCodigos[codUsr[k]] = l.usuarioNome || 'Sistema'; }
    return codUsr[k];
  };
  const porUsr = {}, porAcao = {}, porDia = {};
  let foraHora = 0, fimSemana = 0, exclusoes = 0;
  lista.forEach(function (l) {
    const c = cu(l), d = new Date(l.criadoEm), acao = String(l.acao || 'sem ação').slice(0, 60);
    const u = porUsr[c] || (porUsr[c] = { papel: l.usuarioRole || '?', n: 0, acoes: {}, excl: 0, fora: 0, fds: 0, dias: {} });
    u.n++; u.acoes[acao] = (u.acoes[acao] || 0) + 1;
    porAcao[acao] = (porAcao[acao] || 0) + 1;
    const kd = d.toISOString().slice(0, 10); porDia[kd] = (porDia[kd] || 0) + 1; u.dias[kd] = (u.dias[kd] || 0) + 1;
    if (/exclu/i.test(acao)) { exclusoes++; u.excl++; }
    const h = d.getHours(); if (h < 6 || h >= 22) { foraHora++; u.fora++; }
    if (d.getDay() === 0 || d.getDay() === 6) { fimSemana++; u.fds++; }
  });
  const L = ['DATA DE HOJE: ' + iaBR(hoje) + ' | REGISTRO DE ATIVIDADES dos últimos ' + dias + ' dias: ' + lista.length + ' ações' + (logs.length >= 1000 ? ' (limite de 1000 registros mais recentes)' : ''), '',
    'TOTAIS: ' + exclusoes + ' exclusões; ' + foraHora + ' ações entre 22h e 6h; ' + fimSemana + ' em fim de semana.',
    'POR TIPO DE AÇÃO: ' + Object.keys(porAcao).sort(function (a, b) { return porAcao[b] - porAcao[a]; }).slice(0, 25).map(function (k) { return k + '=' + porAcao[k]; }).join('; '),
    'DIAS MAIS MOVIMENTADOS: ' + Object.keys(porDia).sort(function (a, b) { return porDia[b] - porDia[a]; }).slice(0, 6).map(function (k) { return iaBR(iaData(k)) + '=' + porDia[k]; }).join('; '), '', 'POR USUÁRIO:'];
  Object.keys(porUsr).sort(function (a, b) { return porUsr[b].n - porUsr[a].n; }).slice(0, 25).forEach(function (c) {
    const u = porUsr[c];
    const pico = Object.keys(u.dias).sort(function (a, b) { return u.dias[b] - u.dias[a]; })[0];
    L.push('- ' + c + ' [' + u.papel + ']: ' + u.n + ' ações em ' + Object.keys(u.dias).length + ' dias; ' + u.excl + ' exclusões; ' + u.fora + ' fora de horário; ' + u.fds + ' em fim de semana; dia de pico ' + iaBR(iaData(pico)) + ' com ' + u.dias[pico] +
      '; principais: ' + Object.keys(u.acoes).sort(function (a, b) { return u.acoes[b] - u.acoes[a]; }).slice(0, 5).map(function (k) { return k + '=' + u.acoes[k]; }).join(', '));
  });
  return L.join('\n');
}

function iaCtxAtestados(meses) {
  const B = iaBase();
  const hoje = B.hoje, desde = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1), 1);
  const porSrv = {};
  iaItensAtestado(B.ids).forEach(function (i) {
    (i.datas || []).forEach(function (x) { const d = iaData(x.data); if (d && d >= desde && d <= new Date(hoje.getTime() + 60 * IA_DIA_MS)) (porSrv[i.srvId] || (porSrv[i.srvId] = {}))[+d] = d; });
  });
  const idsCom = Object.keys(porSrv);
  if (!idsCom.length) throw new Error('Não há atestados registrados nos protocolos de entrega nesse período.');
  const mesesL = []; for (let i = meses - 1; i >= 0; i--) { const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1); mesesL.push(iaChaveMes(d.getFullYear(), d.getMonth())); }
  const porMes = {}; mesesL.forEach(function (m) { porMes[m] = 0; });
  const porSetor = {}, porDiaSem = [0, 0, 0, 0, 0, 0, 0], linhasSrv = [], pericia = [];
  let totalDias = 0, totalEp = 0;
  idsCom.forEach(function (id) {
    const s = B.porId[id];
    const ds = Object.keys(porSrv[id]).map(function (k) { return porSrv[id][k]; }).sort(function (a, b) { return a - b; });
    const eps = []; let cur = [ds[0]];
    for (let i = 1; i < ds.length; i++) { if (iaDiasEntre(ds[i - 1], ds[i]) <= 1) cur.push(ds[i]); else { eps.push(cur); cur = [ds[i]]; } }
    eps.push(cur);
    ds.forEach(function (d) { const k = iaChaveMes(d.getFullYear(), d.getMonth()); if (porMes[k] !== undefined) porMes[k]++; porDiaSem[d.getDay()]++; });
    const st = iaSetor(s); porSetor[st] = (porSetor[st] || 0) + ds.length;
    totalDias += ds.length; totalEp += eps.length;
    linhasSrv.push({ n: ds.length, t: B.desc(id) + ' ' + ds.length + ' dias em ' + eps.length + ' episódio(s); maior episódio ' + Math.max.apply(null, eps.map(function (e) { return e.length; })) + ' dias' });
    const contr = iaVinculo(s) === 'contratado';
    eps.forEach(function (e) {
      const n = e.length;
      if (contr ? n >= 15 : n > 5) pericia.push(B.desc(id) + ': episódio de ' + n + ' dias a partir de ' + iaBR(e[0]) + ' — ATINGE o limite de perícia');
      else if (contr ? n >= 12 : n >= 4) pericia.push(B.desc(id) + ': episódio de ' + n + ' dias a partir de ' + iaBR(e[0]) + ' — perto do limite');
    });
  });
  const L = ['DATA DE HOJE: ' + iaBR(hoje) + ' | ATESTADOS dos últimos ' + meses + ' meses (dias de ausência registrados nos protocolos de entrega)', '',
    'TOTAL: ' + totalDias + ' dias em ' + totalEp + ' episódios, de ' + idsCom.length + ' servidores (quadro: ' + B.srvs.length + ').',
    'Por mês: ' + mesesL.map(function (m) { return iaRotuloMes(m) + ' ' + porMes[m]; }).join('; '),
    'Por setor (dias/tamanho do setor): ' + Object.keys(porSetor).sort().map(function (k) { return k + ' ' + porSetor[k] + '/' + (B.porSetor[k] || '?'); }).join('; '),
    'Por dia da semana: ' + IA_DIAS_SEMANA.map(function (d, i) { return d + ' ' + porDiaSem[i]; }).join('; '), '',
    'REGRA DE PERÍCIA USADA PELO MUNICÍPIO NO SISTEMA: contratado com 15 dias ou mais; efetivo acima de 5 dias.',
    'Episódios que atingem ou se aproximam do limite: ' + iaLista(pericia.slice(0, 25), 'nenhum'), '', 'POR SERVIDOR (maiores):'];
  linhasSrv.sort(function (a, b) { return b.n - a.n; }).slice(0, 30).forEach(function (x) { L.push('- ' + x.t); });
  return L.join('\n');
}

function iaCtxRelatorioMensal(chave) {
  const B = iaBase();
  const p = chave.split('-'), ano = +p[0], mes = +p[1] - 1;
  const m0 = new Date(ano, mes, 1), m1 = new Date(ano, mes + 1, 0);
  const ant = new Date(ano, mes - 1, 1), prox0 = new Date(ano, mes + 1, 1), prox1 = new Date(ano, mes + 2, 0);
  function bloco(a, m) {
    const bh = DB.bancoHoras().filter(function (r) { return B.ids.has(r.srvId) && Number(r.ano) === a && Number(r.mes) === m; });
    const setor = {}; let g = 0, pg = 0;
    bh.forEach(function (r) { const x = Number(r.horasGeradas) || 0, y = Number(r.horasPagas) || 0; g += x; pg += y; const st = iaSetor(B.porId[r.srvId]); const o = setor[st] || (setor[st] = { g: 0, p: 0 }); o.g += x; o.p += y; });
    const i0 = new Date(a, m, 1), i1 = new Date(a, m + 1, 0);
    let cred = 0, deb = 0;
    DB.folgas().forEach(function (f) {
      if (!B.ids.has(f.srvId)) return; const q = Number(f.qtd) || 0;
      if (f.tipo === 'credito') { const d = iaData(f.data) || iaData(f.criadoEm); if (d && d >= i0 && d <= i1) cred += q; }
      else { const ds = iaDatasFolga(f); const d = ds[0] || iaData(f.criadoEm); if (d && d >= i0 && d <= i1) deb += q; }
    });
    let at = 0; const atSetor = {};
    iaItensAtestado(B.ids).forEach(function (i) { (i.datas || []).forEach(function (x) { const d = iaData(x.data); if (d && d >= i0 && d <= i1) { at++; const st = iaSetor(B.porId[i.srvId]); atSetor[st] = (atSetor[st] || 0) + 1; } }); });
    return { g: g, pg: pg, setor: setor, quem: bh.length, cred: cred, deb: deb, at: at, atSetor: atSetor };
  }
  const A = bloco(ano, mes), P = bloco(ant.getFullYear(), ant.getMonth());
  const L = ['DATA DE HOJE: ' + iaBR(B.hoje) + ' | MÊS DO RELATÓRIO: ' + iaRotuloMes(chave) + ' | QUADRO: ' + B.srvs.length + ' servidores', '',
    'BANCO DE HORAS no mês: ' + iaNum(A.g) + ' h geradas e ' + iaNum(A.pg) + ' h compensadas/pagas, em ' + A.quem + ' lançamentos. Mês anterior: ' + iaNum(P.g) + ' geradas e ' + iaNum(P.pg) + ' compensadas.',
    'Por setor (geradas/compensadas): ' + iaLista(Object.keys(A.setor).sort().map(function (k) { return k + ' ' + iaNum(A.setor[k].g) + '/' + iaNum(A.setor[k].p); }), 'sem lançamentos'),
    'FOLGAS no mês: ' + iaNum(A.cred) + ' dias creditados e ' + iaNum(A.deb) + ' dias usados. Mês anterior: ' + iaNum(P.cred) + ' creditados e ' + iaNum(P.deb) + ' usados.'];
  const noMes = {}, noProx = {}; let nMes = 0, nProx = 0;
  iaProgs(B.ids).forEach(function (pr) {
    const a = iaData(pr.inicio), b = iaData(pr.fim), st = iaSetor(B.porId[pr.srvId]);
    if (a <= m1 && b >= m0) { noMes[st] = (noMes[st] || 0) + 1; nMes++; }
    if (a <= prox1 && b >= prox0) { noProx[st] = (noProx[st] || 0) + 1; nProx++; }
  });
  L.push('FÉRIAS no mês: ' + nMes + ' servidores com férias em algum dia do mês — por setor (fora/total): ' + iaLista(Object.keys(noMes).sort().map(function (k) { return k + ' ' + noMes[k] + '/' + (B.porSetor[k] || '?'); }), 'ninguém'));
  L.push('FÉRIAS no mês seguinte (' + iaRotuloMes(iaChaveMes(prox0.getFullYear(), prox0.getMonth())) + '): ' + nProx + ' servidores — por setor: ' + iaLista(Object.keys(noProx).sort().map(function (k) { return k + ' ' + noProx[k] + '/' + (B.porSetor[k] || '?'); }), 'ninguém'));
  L.push('ATESTADOS no mês: ' + A.at + ' dias (mês anterior: ' + P.at + ') — por setor: ' + iaLista(Object.keys(A.atSetor).sort().map(function (k) { return k + '=' + A.atSetor[k]; }), 'nenhum'));
  try {
    const sol = DB.solicitacoes().filter(function (x) { const d = iaData(x.criadoEm); return B.ids.has(x.srvId) && d && d >= m0 && d <= m1; });
    L.push('SOLICITAÇÕES abertas no mês: ' + sol.length + ' (' + sol.filter(function (x) { return x.status === 'autorizado'; }).length + ' aprovadas, ' + sol.filter(function (x) { return x.status === 'negado'; }).length + ' negadas, ' + sol.filter(function (x) { return x.status === 'pendente'; }).length + ' ainda pendentes).');
  } catch (e) { /* opcional */ }
  let saldoH = 0, saldoF = 0, negF = 0;
  B.srvs.forEach(function (s) { saldoH += iaSaldoHoras(s.id); const f = iaSaldoFolgas(s.id); if (f > 0) saldoF += f; if (f < -0.01) negF++; });
  L.push('SALDOS HOJE: banco de horas ' + iaNum(saldoH) + ' h acumuladas; ' + iaNum(saldoF) + ' dias de folga em banco; ' + negF + ' servidores com saldo de folga negativo.');
  return L.join('\n');
}

// ===================== ferramentas =====================

function iaOpcoesSetor() {
  const B = iaBase();
  return [['', 'Todos os setores']].concat(Object.keys(B.porSetor).sort().map(function (k) { return [k, k + ' (' + B.porSetor[k] + ')']; }));
}
function iaOpcoesServidor() {
  const srvs = (typeof getServidoresAcessiveis === 'function' ? getServidoresAcessiveis() : DB.servidores()).slice()
    .sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
  return [['', 'Selecione o servidor...']].concat(srvs.map(function (s) { return [s.id, s.nome + ' (Mat. ' + (s.matricula || '-') + ')']; }));
}
function iaOpcoesMes() {
  const h = iaHoje(), out = [];
  for (let i = 0; i < 12; i++) { const d = new Date(h.getFullYear(), h.getMonth() - i, 1); const k = iaChaveMes(d.getFullYear(), d.getMonth()); out.push([k, iaRotuloMes(k) + (i === 0 ? ' (mês atual)' : '')]); }
  return out;
}
function iaOpcoesSolicitacao() {
  let lista = [];
  try {
    const ids = new Set((typeof getServidoresAcessiveis === 'function' ? getServidoresAcessiveis() : DB.servidores()).map(function (s) { return s.id; }));
    lista = DB.solicitacoes().filter(function (x) { return ids.has(x.srvId); }).sort(function (a, b) { return (a.status === 'pendente' ? 0 : 1) - (b.status === 'pendente' ? 0 : 1) || new Date(b.criadoEm) - new Date(a.criadoEm); }).slice(0, 60);
  } catch (e) { /* opcional */ }
  return [['', lista.length ? 'Selecione a solicitação...' : 'Nenhuma solicitação registrada']].concat(lista.map(function (x) {
    const i = iaData(x.inicio) || (x.periodos && x.periodos[0] && iaData(x.periodos[0].inicio));
    return [x.id, (x.status === 'pendente' ? '⏳ ' : '') + (x.srvNome || 'Servidor') + ' — ' + String(x.tipo || '').replace(/_/g, ' ') + ' — ' + iaBR(i)];
  }));
}

const IA_FERRAMENTAS = [
  { id: 'analise', ico: '🔎', titulo: 'Auditoria geral', desc: 'Panorama, achados, estratégias e planejamento de 3 meses.', tarefa: 'analise',
    campos: [{ id: 'meses', rot: 'Período analisado', tipo: 'select', op: function () { return [['6', 'Últimos 6 meses'], ['12', 'Últimos 12 meses'], ['24', 'Últimos 24 meses']]; }, padrao: '12' },
      { id: 'setor', rot: 'Setor', tipo: 'select', op: iaOpcoesSetor }, { id: 'foco', rot: 'Foco (opcional)', tipo: 'texto', dica: 'Ex.: horas extras; férias de janeiro' }],
    montar: function (v) { return { contexto: iaMontarContexto(parseInt(v.meses, 10) || 12, v.setor ? function (s) { return iaSetor(s) === v.setor; } : null), foco: v.foco }; } },
  { id: 'semanal', ico: '📆', titulo: 'Resumo da semana', desc: 'O que resolver hoje, saídas e retornos, pendências envelhecendo.', tarefa: 'semanal', campos: [],
    montar: function () { return { contexto: iaCtxSemanal() }; } },
  { id: 'parecer', ico: '⚖️', titulo: 'Parecer sobre solicitação', desc: 'Situação do servidor, impacto no setor e sugestão de aprovar ou negar.', tarefa: 'parecer',
    campos: [{ id: 'sol', rot: 'Solicitação', tipo: 'select', op: iaOpcoesSolicitacao, largo: true }],
    montar: function (v) { return { contexto: iaCtxParecer(v.sol) }; } },
  { id: 'simulador', ico: '🧪', titulo: 'Simulador de férias', desc: '"Se eu liberar Fulano nessa data, como fica o setor?"', tarefa: 'simulador',
    campos: [{ id: 'srv', rot: 'Servidor', tipo: 'select', op: iaOpcoesServidor }, { id: 'inicio', rot: 'Início das férias', tipo: 'data' },
      { id: 'dias', rot: 'Dias', tipo: 'select', op: function () { return [['30', '30 dias'], ['20', '20 dias'], ['15', '15 dias'], ['10', '10 dias']]; }, padrao: '30' }],
    montar: function (v) { return { contexto: iaCtxSimulador(v.srv, v.inicio, v.dias) }; } },
  { id: 'escala', ico: '🗓️', titulo: 'Escala de férias do ano', desc: 'Distribui quem está sem programação, evitando concentração no setor.', tarefa: 'escala',
    campos: [{ id: 'setor', rot: 'Setor', tipo: 'select', op: iaOpcoesSetor }, { id: 'foco', rot: 'Orientação (opcional)', tipo: 'texto', dica: 'Ex.: evitar dezembro e janeiro; priorizar ACS' }],
    montar: function (v) { return { contexto: iaCtxEscala(v.setor), foco: v.foco }; } },
  { id: 'compensacao', ico: '⏱️', titulo: 'Plano de compensação de horas', desc: 'Proposta de folgas mês a mês para zerar o banco sem desfalcar a unidade.', tarefa: 'compensacao',
    campos: [{ id: 'setor', rot: 'Setor', tipo: 'select', op: iaOpcoesSetor }, { id: 'foco', rot: 'Orientação (opcional)', tipo: 'texto', dica: 'Ex.: zerar até março' }],
    montar: function (v) { return { contexto: iaCtxCompensacao(v.setor), foco: v.foco }; } },
  { id: 'relatorio', ico: '📑', titulo: 'Relatório mensal', desc: 'Resumo do mês para a Secretária, com comparação ao mês anterior.', tarefa: 'relatorio_mensal',
    campos: [{ id: 'mes', rot: 'Mês', tipo: 'select', op: iaOpcoesMes }],
    montar: function (v) { return { contexto: iaCtxRelatorioMensal(v.mes) }; } },
  { id: 'oficio', ico: '📝', titulo: 'Ofício com os números', desc: 'Redige o texto do ofício já com os dados do sistema.', tarefa: 'oficio', formato: 'texto',
    campos: [{ id: 'assunto', rot: 'Assunto do ofício *', tipo: 'texto', dica: 'Ex.: pedir contratação por sobrecarga de horas extras', largo: true },
      { id: 'dest', rot: 'Destinatário', tipo: 'texto', dica: 'Ex.: Secretária Municipal de Saúde' }, { id: 'setor', rot: 'Dados de qual setor', tipo: 'select', op: iaOpcoesSetor }],
    montar: function (v) {
      if (!v.assunto) throw new Error('Informe o assunto do ofício.');
      return { contexto: iaMontarContexto(12, v.setor ? function (s) { return iaSetor(s) === v.setor; } : null), foco: 'Assunto: ' + v.assunto + (v.dest ? '. Destinatário: ' + v.dest : '') + (v.setor ? '. Os dados são do setor ' + v.setor : '') };
    } },
  { id: 'whatsapp', ico: '💬', titulo: 'Mensagem de WhatsApp', desc: 'Lembrete ou convocação para um servidor, com os dados dele.', tarefa: 'whatsapp', formato: 'texto',
    campos: [{ id: 'srv', rot: 'Servidor', tipo: 'select', op: iaOpcoesServidor },
      { id: 'motivo', rot: 'Motivo', tipo: 'select', op: function () { return [['Lembrar de programar as férias', 'Lembrar de programar as férias'], ['Avisar que as férias estão próximas e pedir para regularizar a autorização', 'Férias próximas sem autorização'], ['Convidar a combinar a compensação do saldo de horas', 'Compensar saldo de horas'], ['Avisar sobre o saldo de folgas negativo e combinar a regularização', 'Saldo de folgas negativo'], ['', 'Outro (escreva ao lado)']]; } },
      { id: 'extra', rot: 'Detalhe ou prazo (opcional)', tipo: 'texto', dica: 'Ex.: responder até sexta-feira' }],
    montar: function (v) {
      if (!v.motivo && !v.extra) throw new Error('Escolha o motivo ou escreva o detalhe.');
      _iaUltimoAlvo = v.srv;
      return { contexto: iaCtxServidor(v.srv, 'primeiro'), foco: [v.motivo, v.extra].filter(Boolean).join('. ') };
    } },
  { id: 'conflitos', ico: '🚦', titulo: 'Conflitos de férias por unidade', desc: 'Efetivos da mesma categoria com férias na mesma data ou no mesmo mês; como resolver.', tarefa: 'pergunta',
    campos: [{ id: 'setor', rot: 'Unidade', tipo: 'select', op: iaOpcoesSetor }, { id: 'foco', rot: 'Orientação (opcional)', tipo: 'texto', dica: 'Ex.: priorizar quem tem mais tempo de casa' }],
    montar: function (v) { return { contexto: iaCtxConflitos(v.setor), pergunta: 'Analise os conflitos de férias listados, unidade por unidade: para cada conflito, diga o risco de a categoria ficar descoberta na unidade (use o tamanho da categoria), classifique a gravidade (mesma data é mais grave que mesmo mês) e proponha qual dos dois períodos remanejar e para qual mês, escolhendo meses em que nenhum outro efetivo do mesmo cargo esteja de férias. Prefira remanejar o período que está só programado e preservar o que já está autorizado. Termine com uma lista de ações em ordem de prioridade. Não trate de horas extras nem de folgas.' + (v.foco ? ' Orientação do gestor: ' + v.foco : '') }; } },
  { id: 'auditoria_dados', ico: '🧹', titulo: 'Auditoria dos lançamentos', desc: 'Duplicidades, folga em férias, períodos sobrepostos, cadastro incompleto.', tarefa: 'auditoria_dados', campos: [],
    montar: function () { return { contexto: iaCtxAuditoriaDados() }; } },
  { id: 'auditoria_log', ico: '🕵️', titulo: 'Auditoria do registro de atividades', desc: 'Quem alterou o quê, exclusões e ações em horário atípico.', tarefa: 'auditoria_log',
    campos: [{ id: 'dias', rot: 'Período', tipo: 'select', op: function () { return [['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias']]; }, padrao: '30' }],
    montar: async function (v) { return { contexto: await iaCtxAuditoriaLog(parseInt(v.dias, 10) || 30) }; } },
  { id: 'atestados', ico: '🩺', titulo: 'Análise de atestados', desc: 'Dias por setor, mês e dia da semana; quem está perto do limite de perícia.', tarefa: 'atestados',
    campos: [{ id: 'meses', rot: 'Período', tipo: 'select', op: function () { return [['6', 'Últimos 6 meses'], ['12', 'Últimos 12 meses']]; }, padrao: '12' }],
    montar: function (v) { return { contexto: iaCtxAtestados(parseInt(v.meses, 10) || 12) }; } },
  { id: 'servidor', ico: '🙋', titulo: 'Perguntar sobre um servidor', desc: 'Pergunta livre com os dados de um servidor específico.', tarefa: 'pergunta',
    campos: [{ id: 'srv', rot: 'Servidor', tipo: 'select', op: iaOpcoesServidor }, { id: 'pergunta', rot: 'Pergunta *', tipo: 'texto', dica: 'Ex.: ele pode tirar 15 dias em janeiro? Como está o saldo?', largo: true }],
    montar: function (v) { if (!v.pergunta) throw new Error('Escreva a pergunta.'); return { contexto: iaCtxServidor(v.srv), pergunta: v.pergunta }; } }
];

// ===================== tela =====================

function iaFormatar(texto) {
  let html = iaEsc(texto);
  html = html.replace(/\b[SG]\d{2,3}\b/g, function (c) { return _iaCodigos[c] ? '<span class="ia-nome">' + iaEsc(_iaCodigos[c]) + '</span>' : c; });
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  const out = []; let lista = false;
  html.split('\n').forEach(function (l) {
    const t = l.trim();
    const item = /^[-*•]\s+(.*)$/.exec(t) || /^\d+[.)]\s+(.*)$/.exec(t);
    if (item) { if (!lista) { out.push('<ul>'); lista = true; } out.push('<li>' + item[1] + '</li>'); return; }
    if (lista) { out.push('</ul>'); lista = false; }
    const tit = /^(#{1,4})\s+(.*)$/.exec(t);
    if (tit) out.push('<h4 class="ia-tit">' + tit[2] + '</h4>');
    else if (t) out.push('<p>' + t + '</p>');
  });
  if (lista) out.push('</ul>');
  return out.join('');
}

function iaTextoComNomes(texto) {
  return String(texto).replace(/\b[SG]\d{2,3}\b/g, function (c) { return _iaCodigos[c] || c; });
}

function iaRenderFerramentas() {
  const grid = document.getElementById('ia-ferramentas');
  if (!grid) return;
  grid.innerHTML = IA_FERRAMENTAS.map(function (f) {
    return '<button type="button" class="ia-card' + (_iaFerramenta && _iaFerramenta.id === f.id ? ' ativa' : '') + '" onclick="iaSelecionar(\'' + f.id + '\')">' +
      '<span class="ia-card-ico">' + f.ico + '</span><span class="ia-card-txt"><strong>' + f.titulo + '</strong><small>' + f.desc + '</small></span></button>';
  }).join('');
}

function iaSelecionar(id, valores) {
  const f = IA_FERRAMENTAS.find(function (x) { return x.id === id; });
  if (!f) return;
  _iaFerramenta = f;
  iaRenderFerramentas();
  const box = document.getElementById('ia-form');
  let html = '<div class="ia-form-tit">' + f.ico + ' ' + f.titulo + '</div>';
  if (f.campos.length) {
    html += '<div class="ia-campos">';
    f.campos.forEach(function (c) {
      const idc = 'ia-c-' + c.id;
      html += '<div class="field' + (c.largo ? ' ia-largo' : '') + '"><label>' + c.rot + '</label>';
      if (c.tipo === 'select') {
        html += '<select id="' + idc + '">' + c.op().map(function (o) { return '<option value="' + iaEsc(o[0]) + '"' + (c.padrao === o[0] ? ' selected' : '') + '>' + iaEsc(o[1]) + '</option>'; }).join('') + '</select>';
      } else if (c.tipo === 'data') {
        html += '<input type="date" id="' + idc + '">';
      } else {
        html += '<input type="text" id="' + idc + '" maxlength="300" placeholder="' + iaEsc(c.dica || '') + '" onkeydown="if(event.key===\'Enter\'){event.preventDefault();iaExecutar()}">';
      }
      html += '</div>';
    });
    html += '</div>';
  }
  html += '<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
    '<button class="btn btn-primary" id="ia-btn-gerar" onclick="iaExecutar()">🤖 Gerar</button>' +
    '<div id="ia-acoes" style="display:none;gap:8px;flex-wrap:wrap"></div></div>' +
    '<div id="ia-status" style="display:none;margin-top:12px;font-size:.85rem;font-weight:600;color:var(--primary)"></div>';
  box.innerHTML = html;
  box.style.display = 'block';
  if (valores) Object.keys(valores).forEach(function (k) {
    const el = document.getElementById('ia-c-' + k);
    if (el) el.value = valores[k];
  });
  _iaHistorico = []; _iaContexto = '';
  iaRenderConversa();
  document.getElementById('ia-pergunta-box').style.display = 'none';
  document.getElementById('ia-dados').textContent = '';
}

function iaRenderConversa() {
  const box = document.getElementById('ia-resultado');
  if (!box) return;
  const acoes = document.getElementById('ia-acoes');
  if (!_iaHistorico.length) { box.innerHTML = ''; if (acoes) acoes.style.display = 'none'; return; }
  box.innerHTML = _iaHistorico.map(function (m) {
    if (m.papel !== 'ia') return '<div class="ia-msg ia-perg">🙋 ' + iaEsc(m.texto) + '</div>';
    return m.formato === 'texto'
      ? '<div class="ia-msg ia-resp"><pre class="ia-pre">' + iaEsc(iaTextoComNomes(m.texto)) + '</pre></div>'
      : '<div class="ia-msg ia-resp">' + iaFormatar(m.texto) + '</div>';
  }).join('');
  if (acoes) {
    let b = '<button class="btn btn-ghost btn-sm" onclick="iaCopiar()">📋 Copiar</button><button class="btn btn-ghost btn-sm" onclick="iaImprimir()">🖨️ Imprimir</button>';
    if (_iaFerramenta && _iaFerramenta.id === 'oficio') b += '<button class="btn btn-success btn-sm" onclick="iaLevarParaOficio()">📝 Levar para o Gerador de Ofícios</button>';
    if (_iaFerramenta && _iaFerramenta.id === 'whatsapp') b += '<button class="btn btn-success btn-sm" onclick="iaAbrirWhatsApp()">💬 Abrir no WhatsApp</button>';
    acoes.innerHTML = b; acoes.style.display = 'flex';
  }
}

async function iaChamar(corpo) {
  const resp = await fetch(IA_GESTAO_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  let d = {};
  try { d = await resp.json(); } catch (e) { /* sem corpo */ }
  if (!resp.ok || !d.texto) throw new Error(d.erro || 'A IA não respondeu (código ' + resp.status + ').');
  return d.texto;
}

function iaOcupar(sim, rotulo) {
  _iaOcupada = sim;
  ['ia-btn-gerar', 'ia-btn-perguntar'].forEach(function (id) { const b = document.getElementById(id); if (b) b.disabled = sim; });
  const st = document.getElementById('ia-status');
  if (st) { st.style.display = sim ? 'block' : 'none'; st.textContent = sim ? (rotulo || 'Analisando...') : ''; }
}

async function iaExecutar() {
  if (_iaOcupada || !_iaFerramenta) return;
  const f = _iaFerramenta, v = {};
  f.campos.forEach(function (c) { const el = document.getElementById('ia-c-' + c.id); v[c.id] = el ? String(el.value).trim() : ''; });
  let pedido;
  try {
    pedido = await f.montar(v);
  } catch (err) {
    return toastMsg(err.message || 'Preencha os campos.', 'warning');
  }
  _iaContexto = pedido.contexto;
  document.getElementById('ia-dados').textContent = _iaContexto + (pedido.foco ? '\n\nPEDIDO: ' + pedido.foco : '') + (pedido.pergunta ? '\n\nPERGUNTA: ' + pedido.pergunta : '');
  _iaHistorico = [];
  if (pedido.pergunta) _iaHistorico.push({ papel: 'user', texto: pedido.pergunta });
  iaRenderConversa();
  iaOcupar(true, '🤖 Analisando os dados do sistema... pode levar até 1 minuto.');
  try {
    const texto = await iaChamar({ tarefa: f.tarefa, contexto: _iaContexto, foco: pedido.foco || '', pergunta: pedido.pergunta || '' });
    _iaHistorico.push({ papel: 'ia', texto: texto, formato: f.formato || 'md' });
    iaRenderConversa();
    document.getElementById('ia-pergunta-box').style.display = 'block';
    if (f.id === 'semanal') { try { localStorage.setItem('ia_semanal_em', new Date().toISOString()); } catch (e) { /* opcional */ } iaAvisoSemanal(); }
    try { DB.saveLog('Relatório', 'Usou a IA: ' + f.titulo, 'sistema', ''); } catch (e) { /* log opcional */ }
  } catch (err) {
    console.error(err);
    toastMsg(err.message || 'Não foi possível gerar.', 'error');
  } finally {
    iaOcupar(false);
  }
}

async function iaPerguntar() {
  if (_iaOcupada) return;
  const campo = document.getElementById('ia-pergunta');
  const pergunta = campo.value.trim();
  if (!pergunta) return toastMsg('Escreva a pergunta.', 'warning');
  if (!_iaContexto) return toastMsg('Gere um resultado primeiro.', 'warning');
  const anterior = _iaHistorico.slice();
  _iaHistorico.push({ papel: 'user', texto: pergunta });
  iaRenderConversa();
  campo.value = '';
  iaOcupar(true, '🤖 Pensando na resposta...');
  try {
    const texto = await iaChamar({ tarefa: 'pergunta', contexto: _iaContexto, pergunta: pergunta, historico: anterior.map(function (m) { return { papel: m.papel, texto: m.texto }; }) });
    _iaHistorico.push({ papel: 'ia', texto: texto, formato: 'md' });
    iaRenderConversa();
    document.getElementById('ia-resultado').lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    console.error(err);
    _iaHistorico = anterior; iaRenderConversa(); campo.value = pergunta;
    toastMsg(err.message || 'Não foi possível responder.', 'error');
  } finally {
    iaOcupar(false);
  }
}

function iaUltimaResposta() {
  for (let i = _iaHistorico.length - 1; i >= 0; i--) if (_iaHistorico[i].papel === 'ia') return iaTextoComNomes(_iaHistorico[i].texto);
  return '';
}

function iaCopiar() {
  const txt = _iaHistorico.map(function (m) { return (m.papel === 'ia' ? '' : 'Pergunta: ') + iaTextoComNomes(m.texto); }).join('\n\n');
  navigator.clipboard.writeText(txt).then(function () { toastMsg('Copiado!', 'success'); }, function () { toastMsg('Não foi possível copiar.', 'error'); });
}

function iaImprimir() {
  const w = window.open('', '_blank');
  if (!w) return toastMsg('Permita pop-ups para imprimir.', 'warning');
  const titulo = _iaFerramenta ? _iaFerramenta.titulo : 'Análise';
  w.document.write('<html><head><title>' + iaEsc(titulo) + ' — Atlas Saúde</title><style>body{font-family:Arial,sans-serif;max-width:780px;margin:30px auto;padding:0 20px;color:#111;line-height:1.5;font-size:13px}h2{font-size:17px}h4{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px}.ia-perg{background:#f1f1f1;padding:8px 10px;margin:16px 0 8px;font-weight:bold}.ia-nome{font-weight:bold}.ia-pre{white-space:pre-wrap;font:inherit}small{color:#555}</style></head><body>' +
    '<h2>' + iaEsc(titulo) + ' — Atenção Primária à Saúde de Itacarambi</h2><small>Gerado com apoio de inteligência artificial em ' + new Date().toLocaleString('pt-BR') + '. Os números vêm do Atlas Saúde; as conclusões são sugestões e devem ser conferidas antes de qualquer decisão.</small>' +
    document.getElementById('ia-resultado').innerHTML + '</body></html>');
  w.document.close(); w.focus(); w.print();
}

// Leva o texto do ofício para a aba Gerador de Ofícios
function iaLevarParaOficio() {
  const txt = iaUltimaResposta(); if (!txt) return;
  let assunto = '', corpo = txt;
  const m = /^\s*ASSUNTO:\s*(.+)\s*\n/i.exec(txt);
  if (m) { assunto = m[1].trim(); corpo = txt.slice(m[0].length).replace(/^\s+/, ''); }
  showTab('oficios');
  setTimeout(function () {
    const a = document.getElementById('ofi-assunto'), t = document.getElementById('ofi-texto');
    if (!a || !t) return toastMsg('Abra o Gerador de Ofícios e cole o texto (ele foi copiado).', 'info');
    if (t.value.trim() && !confirm('O Gerador de Ofícios já tem um texto em edição. Substituir pelo texto da IA?')) return;
    if (assunto) a.value = assunto;
    t.value = corpo;
    if (typeof atualizarPreviewOficio === 'function') atualizarPreviewOficio();
    toastMsg('Texto levado para o Gerador de Ofícios. Revise antes de salvar.', 'success');
  }, 150);
}

function iaAbrirWhatsApp() {
  const txt = iaUltimaResposta(); if (!txt) return;
  const s = DB.servidores().find(function (x) { return x.id === _iaUltimoAlvo; });
  let num = String((s && s.telefone) || '').replace(/\D/g, '');
  if (num && num.length <= 11) num = '55' + num;
  const celular = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const url = celular ? 'https://wa.me/' + num + '?text=' + encodeURIComponent(txt)
    : 'https://web.whatsapp.com/send?' + (num ? 'phone=' + num + '&' : '') + 'text=' + encodeURIComponent(txt);
  if (!num) toastMsg('Servidor sem telefone no cadastro: escolha a conversa no WhatsApp.', 'info');
  const w = window.open(url, '_blank', 'noopener'); if (w) w.opener = null;
}

// Lembrete para gerar o resumo da semana (uma vez por semana, neste navegador)
function iaAvisoSemanal() {
  const el = document.getElementById('ia-aviso-semanal'); if (!el) return;
  let ultima = null;
  try { ultima = localStorage.getItem('ia_semanal_em'); } catch (e) { /* opcional */ }
  const dias = ultima ? iaDiasEntre(new Date(ultima), new Date()) : null;
  if (dias !== null && dias < 7) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = '<span>📆 ' + (dias === null ? 'Você ainda não gerou o resumo da semana neste computador.' : 'O último resumo da semana foi há ' + dias + ' dias.') + '</span>' +
    '<button class="btn btn-primary btn-sm" onclick="iaSelecionar(\'semanal\');iaExecutar()">Gerar agora</button>';
}

// Atalhos chamados de outras telas (Solicitações, ficha do servidor)
function iaAbrir(ferramenta, valores, executar) {
  showTab('iagestao');
  setTimeout(function () {
    iaSelecionar(ferramenta, valores);
    document.getElementById('ia-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (executar) iaExecutar();
    else { const p = document.getElementById('ia-c-pergunta'); if (p) p.focus(); }
  }, 120);
}

function renderIaGestao() {
  iaRenderFerramentas();
  iaAvisoSemanal();
  if (!_iaFerramenta) iaSelecionar('analise');
}

// A Central de IA está liberada para quem está logado?
function tabVisivelIA() {
  const b = document.getElementById('tab-iagestao');
  return !!b && b.style.display !== 'none';
}
