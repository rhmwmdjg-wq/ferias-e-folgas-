// Módulo Análise com IA.
// Reúne os números do sistema (banco de horas, folgas, férias, solicitações e atestados),
// envia para a IA e mostra uma auditoria com estratégias e planejamento.
//
// Privacidade: a IA recebe só números agregados. Cada servidor vai como um código
// (S01, S02…) — sem nome, matrícula ou CPF. O sistema troca o código pelo nome
// na resposta, aqui no navegador. Nada da análise fica gravado no servidor.

const IA_GESTAO_URL = 'https://bgvwaamwgcathojxtjqf.supabase.co/functions/v1/atlas-ia-gestao';
const IA_MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

let _iaCodigos = {};      // código -> nome
let _iaContexto = '';
let _iaHistorico = [];    // [{papel:'user'|'ia', texto}]
let _iaOcupada = false;

function iaEsc(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function iaNum(v) { return Math.round((Number(v) || 0) * 10) / 10; }
function iaChaveMes(ano, mes) { return ano + '-' + String(mes + 1).padStart(2, '0'); }
function iaRotuloMes(chave) { const p = chave.split('-'); return IA_MESES[parseInt(p[1], 10) - 1] + '/' + p[0].slice(2); }
function iaData(str) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }

// Monta o resumo numérico que vai para a IA
function iaMontarContexto(mesesAtras) {
  const srvs = (typeof getServidoresAcessiveis === 'function' ? getServidoresAcessiveis() : DB.servidores());
  const ids = new Set(srvs.map(function (s) { return s.id; }));
  const porId = {}; srvs.forEach(function (s) { porId[s.id] = s; });
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const L = [];

  // Códigos no lugar dos nomes
  const codigoDe = {}; _iaCodigos = {};
  let seq = 0;
  function cod(id) {
    if (!porId[id]) return null;
    if (!codigoDe[id]) {
      seq++;
      codigoDe[id] = 'S' + String(seq).padStart(2, '0');
      _iaCodigos[codigoDe[id]] = porId[id].nome + (porId[id].matricula ? ' (Mat. ' + porId[id].matricula + ')' : '');
    }
    return codigoDe[id];
  }
  function desc(id) {
    const s = porId[id];
    const vinc = String(s.vinculo || '').toLowerCase() === 'contratado' ? 'contratado' : 'efetivo';
    return cod(id) + ' [' + (s.setor || 'sem setor') + '; ' + (s.cargo || 'sem cargo') + '; ' + vinc + ']';
  }

  // Janela de meses passados
  const mesesPassados = [];
  for (let i = mesesAtras - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    mesesPassados.push(iaChaveMes(d.getFullYear(), d.getMonth()));
  }
  const inicioJanela = new Date(hoje.getFullYear(), hoje.getMonth() - (mesesAtras - 1), 1);

  // ---------- Quadro ----------
  const porSetor = {};
  let efetivos = 0, contratados = 0;
  srvs.forEach(function (s) {
    const k = s.setor || 'Sem setor';
    porSetor[k] = (porSetor[k] || 0) + 1;
    if (String(s.vinculo || '').toLowerCase() === 'contratado') contratados++; else efetivos++;
  });
  L.push('DATA DE HOJE: ' + hoje.toLocaleDateString('pt-BR') + ' | PERÍODO ANALISADO: últimos ' + mesesAtras + ' meses + programação futura');
  L.push('');
  L.push('QUADRO: ' + srvs.length + ' servidores (' + efetivos + ' efetivos, ' + contratados + ' contratados)');
  L.push('Por setor: ' + Object.keys(porSetor).sort().map(function (k) { return k + '=' + porSetor[k]; }).join('; '));

  // ---------- Banco de horas ----------
  const bh = DB.bancoHoras().filter(function (r) { return ids.has(r.srvId); });
  const bhMes = {}; mesesPassados.forEach(function (m) { bhMes[m] = { g: 0, p: 0 }; });
  const bhSrv = {}, bhSetor = {};
  let saldoTotalH = 0;
  bh.forEach(function (r) {
    const g = Number(r.horasGeradas) || 0, p = Number(r.horasPagas) || 0;
    saldoTotalH += g - p;
    const o = bhSrv[r.srvId] || (bhSrv[r.srvId] = { saldo: 0, gJan: 0 });
    o.saldo += g - p;
    const k = iaChaveMes(Number(r.ano), Number(r.mes));
    if (bhMes[k]) {
      bhMes[k].g += g; bhMes[k].p += p; o.gJan += g;
      const st = porId[r.srvId].setor || 'Sem setor';
      const os = bhSetor[st] || (bhSetor[st] = { g: 0, p: 0 });
      os.g += g; os.p += p;
    }
  });
  L.push('');
  L.push('BANCO DE HORAS / HORAS EXTRAS (horas)');
  L.push('Saldo total acumulado (geradas - compensadas/pagas, todo o histórico): ' + iaNum(saldoTotalH) + ' h');
  L.push('Por mês (geradas/compensadas): ' + mesesPassados.map(function (m) { return iaRotuloMes(m) + ' ' + iaNum(bhMes[m].g) + '/' + iaNum(bhMes[m].p); }).join('; '));
  L.push('Por setor no período (geradas/compensadas): ' + (Object.keys(bhSetor).sort().map(function (k) { return k + ' ' + iaNum(bhSetor[k].g) + '/' + iaNum(bhSetor[k].p); }).join('; ') || 'sem lançamentos'));
  const topSaldoH = Object.keys(bhSrv).filter(function (id) { return bhSrv[id].saldo > 0; }).sort(function (a, b) { return bhSrv[b].saldo - bhSrv[a].saldo; }).slice(0, 12);
  L.push('Maiores saldos de horas: ' + (topSaldoH.map(function (id) { return desc(id) + ' ' + iaNum(bhSrv[id].saldo) + ' h'; }).join('; ') || 'nenhum'));
  const topGer = Object.keys(bhSrv).filter(function (id) { return bhSrv[id].gJan > 0; }).sort(function (a, b) { return bhSrv[b].gJan - bhSrv[a].gJan; }).slice(0, 12);
  L.push('Quem mais gerou horas no período: ' + (topGer.map(function (id) { return desc(id) + ' ' + iaNum(bhSrv[id].gJan) + ' h'; }).join('; ') || 'ninguém'));
  const negH = Object.keys(bhSrv).filter(function (id) { return bhSrv[id].saldo < -0.01; });
  L.push('Servidores com saldo de horas negativo: ' + negH.length + (negH.length ? ' (' + negH.slice(0, 10).map(function (id) { return cod(id) + ' ' + iaNum(bhSrv[id].saldo) + ' h'; }).join('; ') + ')' : ''));

  // ---------- Folgas ----------
  const fg = DB.folgas().filter(function (f) { return ids.has(f.srvId); });
  const fgMes = {}; mesesPassados.forEach(function (m) { fgMes[m] = { c: 0, d: 0 }; });
  const fgSrv = {};
  fg.forEach(function (f) {
    const q = Number(f.qtd) || 0, cred = f.tipo === 'credito';
    fgSrv[f.srvId] = (fgSrv[f.srvId] || 0) + (cred ? q : -q);
    const d = iaData(f.data) || iaData(f.criadoEm);
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
  L.push('Maiores saldos de folga: ' + (topF.map(function (id) { return desc(id) + ' ' + iaNum(fgSrv[id]) + ' d'; }).join('; ') || 'nenhum'));
  if (negF.length) L.push('Saldos negativos: ' + negF.slice(0, 10).map(function (id) { return desc(id) + ' ' + iaNum(fgSrv[id]) + ' d'; }).join('; '));

  // ---------- Férias ----------
  const progs = DB.programacoes().filter(function (p) { return ids.has(p.srvId) && iaData(p.inicio) && iaData(p.fim); });
  const mesesFuturos = [];
  for (let i = 0; i < 12; i++) { const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1); mesesFuturos.push(iaChaveMes(d.getFullYear(), d.getMonth())); }
  const feriasMes = {}; mesesFuturos.forEach(function (m) { feriasMes[m] = { pessoas: new Set(), setor: {} }; });
  const comFeriasFuturas = new Set(), comFeriasNoAno = new Set();
  const semAutorizacao = [];
  progs.forEach(function (p) {
    const ini = iaData(p.inicio), fim = iaData(p.fim);
    if (ini.getFullYear() === hoje.getFullYear() || fim.getFullYear() === hoje.getFullYear()) comFeriasNoAno.add(p.srvId);
    if (fim < hoje) return;
    comFeriasFuturas.add(p.srvId);
    mesesFuturos.forEach(function (m) {
      const a = m.split('-'); const m0 = new Date(+a[0], +a[1] - 1, 1), m1 = new Date(+a[0], +a[1], 0);
      if (ini <= m1 && fim >= m0) {
        feriasMes[m].pessoas.add(p.srvId);
        const st = porId[p.srvId].setor || 'Sem setor';
        (feriasMes[m].setor[st] || (feriasMes[m].setor[st] = new Set())).add(p.srvId);
      }
    });
    const diasAte = Math.round((ini - hoje) / 86400000);
    if (!p.autorizado && !p.concluido && diasAte >= 0 && diasAte <= 60) semAutorizacao.push(desc(p.srvId) + ' início ' + ini.toLocaleDateString('pt-BR') + ' (em ' + diasAte + ' dias)');
  });
  L.push('');
  L.push('FÉRIAS');
  L.push('Servidores com férias nos próximos 12 meses, por mês: ' + mesesFuturos.map(function (m) { return iaRotuloMes(m) + ' ' + feriasMes[m].pessoas.size; }).join('; '));
  const concentr = [];
  mesesFuturos.forEach(function (m) {
    Object.keys(feriasMes[m].setor).forEach(function (st) {
      const fora = feriasMes[m].setor[st].size, tot = porSetor[st] || 0;
      if (fora >= 2 && tot && fora / tot >= 0.25) concentr.push(iaRotuloMes(m) + ' ' + st + ': ' + fora + ' de ' + tot + ' fora');
    });
  });
  L.push('Meses/setores com 25% ou mais do setor de férias no mesmo mês: ' + (concentr.slice(0, 25).join('; ') || 'nenhum'));
  L.push('Férias que começam em até 60 dias e ainda NÃO estão autorizadas: ' + (semAutorizacao.slice(0, 20).join('; ') || 'nenhuma'));
  const semProg = srvs.filter(function (s) { return !comFeriasFuturas.has(s.id) && !comFeriasNoAno.has(s.id); });
  const semPorSetor = {};
  semProg.forEach(function (s) { const k = s.setor || 'Sem setor'; semPorSetor[k] = (semPorSetor[k] || 0) + 1; });
  L.push('Servidores sem nenhuma férias registrada em ' + hoje.getFullYear() + ' nem programada para frente: ' + semProg.length + ' de ' + srvs.length +
    (semProg.length ? ' — por setor: ' + Object.keys(semPorSetor).sort().map(function (k) { return k + '=' + semPorSetor[k]; }).join('; ') : ''));
  const antigos = semProg.map(function (s) { const a = iaData(s.admissao); return { s: s, anos: a ? (hoje - a) / (365.25 * 86400000) : null }; })
    .filter(function (x) { return x.anos !== null && x.anos >= 1; }).sort(function (a, b) { return b.anos - a.anos; }).slice(0, 15);
  if (antigos.length) L.push('Entre eles, os de mais tempo de casa: ' + antigos.map(function (x) { return desc(x.s.id) + ' ' + iaNum(x.anos) + ' anos'; }).join('; '));

  // ---------- Solicitações ----------
  try {
    const sol = DB.solicitacoes().filter(function (s) { return ids.has(s.srvId); });
    const pend = sol.filter(function (s) { return s.status === 'pendente'; });
    const antigas = pend.filter(function (s) { const d = iaData(s.criadoEm); return d && (hoje - d) / 86400000 > 7; }).length;
    L.push('');
    L.push('SOLICITAÇÕES: ' + pend.length + ' pendentes de resposta (' + antigas + ' há mais de 7 dias); ' + sol.filter(function (s) { return s.status === 'autorizado'; }).length + ' aprovadas e ' + sol.filter(function (s) { return s.status === 'negado'; }).length + ' negadas no histórico');
  } catch (e) { /* módulo opcional */ }

  // ---------- Atestados (protocolos de entrega) ----------
  try {
    const itens = DB.itensProtocolo().filter(function (i) { return i.tipo === 'atestado' && ids.has(i.srvId); });
    const atMes = {}; mesesPassados.forEach(function (m) { atMes[m] = 0; });
    const atSrv = {}, atSetor = {};
    itens.forEach(function (i) {
      (i.datas || []).forEach(function (x) {
        const d = iaData(x.data); if (!d || d < inicioJanela) return;
        const k = iaChaveMes(d.getFullYear(), d.getMonth()); if (atMes[k] === undefined) return;
        atMes[k]++; atSrv[i.srvId] = (atSrv[i.srvId] || 0) + 1;
        const st = porId[i.srvId].setor || 'Sem setor'; atSetor[st] = (atSetor[st] || 0) + 1;
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
  } catch (e) { /* módulo opcional */ }

  return L.join('\n');
}

// Troca S01, S02… pelos nomes e converte o Markdown simples em HTML seguro
function iaFormatar(texto) {
  let html = iaEsc(texto);
  html = html.replace(/\bS\d{2,3}\b/g, function (c) { return _iaCodigos[c] ? '<span class="ia-nome">' + iaEsc(_iaCodigos[c]) + '</span>' : c; });
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  const linhas = html.split('\n');
  const out = []; let lista = false;
  linhas.forEach(function (l) {
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
  return String(texto).replace(/\bS\d{2,3}\b/g, function (c) { return _iaCodigos[c] || c; });
}

function iaRenderConversa() {
  const box = document.getElementById('ia-resultado');
  if (!box) return;
  if (!_iaHistorico.length) { box.innerHTML = ''; document.getElementById('ia-acoes').style.display = 'none'; return; }
  box.innerHTML = _iaHistorico.map(function (m) {
    return m.papel === 'ia'
      ? '<div class="ia-msg ia-resp">' + iaFormatar(m.texto) + '</div>'
      : '<div class="ia-msg ia-perg">🙋 ' + iaEsc(m.texto) + '</div>';
  }).join('');
  document.getElementById('ia-acoes').style.display = 'flex';
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

async function iaGerarAnalise() {
  if (_iaOcupada) return;
  const meses = parseInt(document.getElementById('ia-periodo').value, 10) || 12;
  const foco = document.getElementById('ia-foco').value.trim();
  _iaContexto = iaMontarContexto(meses);
  document.getElementById('ia-dados').textContent = _iaContexto;
  if (!Object.keys(_iaCodigos).length && DB.bancoHoras().length + DB.folgas().length + DB.programacoes().length === 0) {
    return toastMsg('Ainda não há lançamentos de horas, folgas ou férias para analisar.', 'warning');
  }
  _iaHistorico = [];
  iaRenderConversa();
  iaOcupar(true, '🤖 Analisando os dados do sistema... pode levar até 1 minuto.');
  try {
    const texto = await iaChamar({ tarefa: 'analise', contexto: _iaContexto, foco: foco });
    _iaHistorico.push({ papel: 'ia', texto: texto });
    iaRenderConversa();
    document.getElementById('ia-pergunta-box').style.display = 'block';
    try { DB.saveLog('Relatório', 'Gerou análise de gestão com IA (' + meses + ' meses)', 'sistema', ''); } catch (e) { /* log opcional */ }
  } catch (err) {
    console.error(err);
    toastMsg(err.message || 'Não foi possível gerar a análise.', 'error');
  } finally {
    iaOcupar(false);
  }
}

async function iaPerguntar() {
  if (_iaOcupada) return;
  const campo = document.getElementById('ia-pergunta');
  const pergunta = campo.value.trim();
  if (!pergunta) return toastMsg('Escreva a pergunta.', 'warning');
  if (!_iaContexto) return toastMsg('Gere a análise primeiro.', 'warning');
  const anterior = _iaHistorico.slice();
  _iaHistorico.push({ papel: 'user', texto: pergunta });
  iaRenderConversa();
  campo.value = '';
  iaOcupar(true, '🤖 Pensando na resposta...');
  try {
    const texto = await iaChamar({ tarefa: 'pergunta', contexto: _iaContexto, pergunta: pergunta, historico: anterior });
    _iaHistorico.push({ papel: 'ia', texto: texto });
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

function iaCopiar() {
  const txt = _iaHistorico.map(function (m) { return (m.papel === 'ia' ? '' : 'Pergunta: ') + iaTextoComNomes(m.texto); }).join('\n\n');
  navigator.clipboard.writeText(txt).then(function () { toastMsg('Análise copiada!', 'success'); }, function () { toastMsg('Não foi possível copiar.', 'error'); });
}

function iaImprimir() {
  const w = window.open('', '_blank');
  if (!w) return toastMsg('Permita pop-ups para imprimir.', 'warning');
  w.document.write('<html><head><title>Análise de Gestão — Atlas Saúde</title><style>body{font-family:Arial,sans-serif;max-width:780px;margin:30px auto;padding:0 20px;color:#111;line-height:1.5;font-size:13px}h2{font-size:17px}h4{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px}.ia-perg{background:#f1f1f1;padding:8px 10px;margin:16px 0 8px;font-weight:bold}.ia-nome{font-weight:bold}small{color:#555}</style></head><body>' +
    '<h2>Análise de Gestão de Pessoas — Atenção Primária à Saúde de Itacarambi</h2><small>Gerada com apoio de inteligência artificial em ' + new Date().toLocaleString('pt-BR') + '. Os números vêm do Atlas Saúde; as conclusões são sugestões e devem ser conferidas antes de qualquer decisão.</small>' +
    document.getElementById('ia-resultado').innerHTML + '</body></html>');
  w.document.close(); w.focus(); w.print();
}

function renderIaGestao() {
  iaRenderConversa();
}
