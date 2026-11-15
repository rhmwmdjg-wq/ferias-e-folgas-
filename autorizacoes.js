// Módulo Autorizações.
// Emissão, reimpressão e histórico de autorizações de férias.

let autTipoPeriodo = 0;

// Formas de parcelamento disponíveis na autorização (dias de cada período, na ordem)
const AUT_PARCELAMENTOS = {
  1: [30],
  2: [15, 15],
  3: [10, 10, 10],
  4: [20, 10],
  5: [10, 20]
};

function autDiasPorPeriodo(tipo) {
  return AUT_PARCELAMENTOS[tipo] || [30];
}

// Texto do parcelamento para o histórico, ex.: "2 períodos (20 + 10 dias)"
function autDescricaoParcelamento(dias) {
  if (dias.length === 1) return 'Integral (30 dias)';
  const iguais = dias.every(d => d === dias[0]);
  if (iguais) return dias.length + ' períodos de ' + dias[0] + ' dias';
  return dias.length + ' períodos (' + dias.join(' + ') + ' dias)';
}

function abrirModalAutorizacao(srvId, inicio, fim, tipo, periodo) {
  autTipoPeriodo = 0;
  // Somente servidores dos setores habilitados para o gestor (admin vê todos)
  const srvs = (typeof getServidoresAcessiveis === 'function') ? getServidoresAcessiveis() : DB.servidores();
  const sel = document.getElementById('aut-servidor');
  sel.innerHTML = '<option value="">Selecione o servidor...</option>' +
    srvs.map(s => `<option value="${s.id}">${s.nome} (Mat. ${s.matricula})</option>`).join('');
  document.getElementById('aut-srv-info').style.display = 'none';
  document.getElementById('aut-tipo-ferias').value = '';
  document.getElementById('aut-periodo-ref').value = '';
  document.getElementById('aut-obs').value = '';
  document.getElementById('aut-datas-section').style.display = 'none';
  document.getElementById('aut-datas-section').innerHTML = '';
  document.getElementById('aut-terco-section').style.display = 'none';
  document.getElementById('aut-terco-mes').value = '';
  document.querySelectorAll('.periodo-option').forEach(o => o.classList.remove('selected'));
  document.getElementById('modal-autorizacao').classList.add('open');
  if (srvId) {
    sel.value = srvId;
    atualizarDadosAutorizacao();
  }
  if (inicio && fim) {
    document.getElementById('aut-tipo-ferias').value = tipo === 'premio' ? 'premio' : 'regulamentar';
    if (periodo) document.getElementById('aut-periodo-ref').value = periodo;
    toggleTercoSection();
    selecionarTipoPeriodo(1);
    document.getElementById('aut-inicio-1').value = inicio;
    document.getElementById('aut-fim-1').value = fim;
    const retorno = addDays(inicio, 30);
    const retEl = document.getElementById('aut-retorno-1');
    retEl.style.display = 'block';
    retEl.textContent = '↩️ Retorno: ' + fmtDate(retorno);
  }
}

function atualizarDadosAutorizacao() {
  const srvId = document.getElementById('aut-servidor').value;
  const infoBox = document.getElementById('aut-srv-info');
  if (!srvId) { infoBox.style.display = 'none'; return; }
  const srv = DB.servidores().find(s => s.id === srvId);
  if (!srv) return;
  infoBox.style.display = 'block';
  infoBox.innerHTML = `
    <div style="display:flex;gap:20px;flex-wrap:wrap">
      <div><span style="font-size:.75rem;color:var(--muted);text-transform:uppercase;display:block">Nome</span><strong>${srv.nome}</strong></div>
      <div><span style="font-size:.75rem;color:var(--muted);text-transform:uppercase;display:block">Matrícula</span><strong>${srv.matricula}</strong></div>
      <div><span style="font-size:.75rem;color:var(--muted);text-transform:uppercase;display:block">Setor</span><strong>${srv.setor || '-'}</strong></div>
      <div><span style="font-size:.75rem;color:var(--muted);text-transform:uppercase;display:block">Cargo</span><strong>${srv.cargo || '-'}</strong></div>
    </div>
  `;
}

function toggleTercoSection() {
  const tipo = document.getElementById('aut-tipo-ferias').value;
  const section = document.getElementById('aut-terco-section');
  // Só mostra se for regulamentar E se já tiver selecionado um parcelamento (autTipoPeriodo > 0)
  if (tipo === 'regulamentar' && autTipoPeriodo > 0) {
    section.style.display = 'block';
  } else {
    section.style.display = 'none';
    document.getElementById('aut-terco-mes').value = '';
  }
}

function selecionarTipoPeriodo(tipo) {
  autTipoPeriodo = tipo;
  document.querySelectorAll('.periodo-option').forEach(o => o.classList.remove('selected'));
  document.getElementById('aut-per-' + tipo).classList.add('selected');

  const diasPorPeriodo = autDiasPorPeriodo(tipo);
  const section = document.getElementById('aut-datas-section');
  section.style.display = 'block';

  let html = '<div class="periodo-dates-section">';
  html += '<div style="font-size:.85rem;font-weight:600;margin-bottom:12px;color:var(--text)">📅 Informe as datas de cada período:</div>';

  diasPorPeriodo.forEach((dias, i) => {
    const num = i + 1;
    html += `
      <div class="periodo-date-group">
        <label>${num}º Período — ${dias} dias corridos</label>
        <div class="form-row cols-2" style="margin:0">
          <div class="field" style="margin:0">
            <label style="font-size:.72rem;color:var(--muted)">Data de Início</label>
            <input id="aut-inicio-${num}" type="date" oninput="calcularFimPeriodo(${num}, ${dias})">
          </div>
          <div class="field" style="margin:0">
            <label style="font-size:.72rem;color:var(--muted)">Data de Término (auto)</label>
            <input id="aut-fim-${num}" type="date" readonly style="opacity:.6">
          </div>
        </div>
        <div id="aut-retorno-${num}" style="font-size:.82rem;color:var(--success);font-weight:600;margin-top:6px;display:none"></div>
      </div>
    `;
  });

  html += '</div>';
  section.innerHTML = html;

  // Atualizar visibilidade do 1/3 de férias
  toggleTercoSection();
}

function calcularFimPeriodo(num, dias) {
  const inicio = document.getElementById('aut-inicio-' + num).value;
  const fimEl = document.getElementById('aut-fim-' + num);
  const retEl = document.getElementById('aut-retorno-' + num);
  if (!inicio) { fimEl.value = ''; retEl.style.display = 'none'; return; }
  const fim = addDays(inicio, dias - 1);
  const retorno = addDays(inicio, dias);
  fimEl.value = fim;
  retEl.style.display = 'block';
  retEl.textContent = `↩️ Retorno: ${fmtDate(retorno)}`;
}

async function salvarTextoAutorizacao() {
  const texto = document.getElementById('cfg-texto-autorizacao').value.trim();
  const cfg = DB.config();
  cfg.textoAutorizacao = texto;
  await DB.saveConfig(cfg);
  toastMsg('Texto da autorização salvo!');
}

async function gerarAutorizacaoFerias() {
  const srvId = document.getElementById('aut-servidor').value;
  const tipoFerias = document.getElementById('aut-tipo-ferias').value;
  const srv = DB.servidores().find(s => s.id === srvId);

  const diasPorPeriodo = autDiasPorPeriodo(autTipoPeriodo);
  const periodos = [];

  for (let i = 0; i < diasPorPeriodo.length; i++) {
    const num = i + 1;
    const inicio = document.getElementById('aut-inicio-' + num)?.value;
    const fim = document.getElementById('aut-fim-' + num)?.value;
    periodos.push({ num, dias: diasPorPeriodo[i], inicio, fim, retorno: inicio ? addDays(inicio, diasPorPeriodo[i]) : '' });
  }

  const tercoMes = document.getElementById('aut-terco-mes').value;

  const periodoRef = document.getElementById('aut-periodo-ref').value.trim();
  const obs = document.getElementById('aut-obs').value.trim();
  const cfg = DB.config();
  const textoAutorizacao = cfg.textoAutorizacao || 'Autorizo a concessão de férias ao(à) servidor(a) abaixo identificado(a), conforme períodos a seguir descritos.';

  imprimirAutorizacaoFerias(srv, periodos, tercoMes, periodoRef, obs, textoAutorizacao, tipoFerias);

  // Salvar no histórico de autorizações
  const tipoParc = autDescricaoParcelamento(diasPorPeriodo);
  await DB.saveAutorizacao({
    id: uid(),
    srvId: srv.id,
    srvNome: srv.nome,
    srvMatricula: srv.matricula,
    srvSetor: srv.setor,
    srvCargo: srv.cargo,
    srvAdmissao: srv.admissao,
    tipoFerias,
    periodos,
    tercoMes,
    periodoRef,
    obs,
    textoAutorizacao,
    tipoParc,
    coordenador: (typeof getAssinanteAtual === 'function' ? getAssinanteAtual().nome : cfg.coordenadorAPS) || '',
    coordenadorCargo: (typeof getAssinanteAtual === 'function' ? getAssinanteAtual().cargo : '') || '',
    dataEmissao: new Date().toISOString()
  });

  // Interliga com a programação de férias: a autorização confirma, ajusta ou cria a programação
  const autorizadoPor = (typeof getAssinanteAtual === 'function' ? getAssinanteAtual().nome : cfg.coordenadorAPS) || 'Coordenador';
  const vinc = await vincularAutorizacaoProgramacoes({ srvId: srv.id, tipoFerias, periodos, periodoRef }, { autorizadoPor });

  fecharModal('modal-autorizacao');
  toastMsg('Autorização salva! ' + descreverVinculoAutorizacao(vinc));
  renderDashboard();
  const panelAtivo = document.querySelector('.tab-panel.active');
  if (panelAtivo && panelAtivo.id === 'panel-autorizacoes') renderAutorizacoes();
  DB.saveLog('Documento', `Gerou Autorização de Férias para ${srv.nome} (${tipoFerias === 'premio' ? 'Prêmio' : 'Regulamentar'})`, 'servidores', srv.id);
}

function renderAutorizacoes() {
  const lista = DB.autorizacoes();
  const container = document.getElementById('lista-autorizacoes');
  if (!container) return;

  if (!lista.length) {
    container.innerHTML = '<div class="empty" style="padding:40px 10px"><div class="icon">📜</div><p>Nenhuma autorização emitida ainda.</p><p style="font-size:.8rem;color:var(--muted)">As autorizações aparecerão aqui após serem emitidas.</p></div>';
    return;
  }

  container.innerHTML = lista.sort((a, b) => new Date(b.dataEmissao) - new Date(a.dataEmissao)).map(aut => {
    const dataEmissao = new Date(aut.dataEmissao);
    const ferLabel = aut.tipoFerias === 'premio' ? 'Prêmio' : 'Regulamentar';
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:14px 16px;border-radius:10px;background:var(--surface);margin-bottom:8px;border:1px solid var(--border-low)">
        <div style="flex:1;min-width:200px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="font-weight:700">${esc(aut.srvNome)}</span>
            <span class="tag tag-blue">Mat. ${esc(aut.srvMatricula)}</span>
            <span class="tag ${aut.tipoFerias === 'premio' ? 'tag-purple' : 'tag-green'}">${ferLabel}</span>
          </div>
          <div style="font-size:.82rem;color:var(--muted)">
            📅 ${dataEmissao.toLocaleDateString('pt-BR')} às ${dataEmissao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            · ${esc(aut.srvSetor || '-')}
            · ${aut.tipoParc}
            ${aut.periodoRef ? `· Ref: ${esc(aut.periodoRef)}` : ''}
          </div>
          ${(() => {
            const pers = (aut.periodos || []).filter(autPeriodoValido);
            if (!pers.length) return '';
            const naProg = programacoesDaAutorizacao(aut).length;
            const datas = pers.map(p => fmtDate(p.inicio) + ' a ' + fmtDate(p.fim)).join(' · ');
            const tag = naProg >= pers.length
              ? '<span class="tag tag-green" style="font-size:.65rem">🔗 Na programação de férias</span>'
              : '<span class="tag tag-warn" style="font-size:.65rem">⚠️ Fora da programação — use Sincronizar</span>';
            return `<div style="font-size:.78rem;margin-top:4px">🌴 ${datas} ${tag}</div>`;
          })()}
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-primary btn-sm" onclick="reimprimirAutorizacao('${aut.id}')">🖨️ Reimprimir</button>
          <button class="btn btn-danger btn-sm" onclick="excluirAutorizacao('${aut.id}')">🗑️</button>
        </div>
      </div>`;
  }).join('');
}

function reimprimirAutorizacao(id) {
  const aut = DB.autorizacoes().find(a => a.id === id);
  if (!aut) return toastMsg('Autorização não encontrada.', 'error');

  const srv = {
    id: aut.srvId,
    nome: aut.srvNome,
    matricula: aut.srvMatricula,
    setor: aut.srvSetor,
    cargo: aut.srvCargo,
    admissao: aut.srvAdmissao
  };

  imprimirAutorizacaoFerias(srv, aut.periodos, aut.tercoMes, aut.periodoRef, aut.obs, aut.textoAutorizacao, aut.tipoFerias);
}

async function excluirAutorizacao(id) {
  const aut = DB.autorizacoes().find(a => a.id === id);
  if (!aut) return;
  const ligadas = programacoesDaAutorizacao(aut);
  const aviso = ligadas.length
    ? '\n\n' + ligadas.length + ' período(s) de férias ligado(s) a ela voltam a ficar como "apenas programados" (sem autorização). Eles continuam no calendário; para tirar, exclua em Programar Férias.'
    : '';
  if (!confirm('Tem certeza que deseja excluir esta autorização do histórico?' + aviso)) return;
  if (ligadas.length) {
    const programacoes = DB.programacoes();
    const idsLigadas = new Set(ligadas.map(p => p.id));
    programacoes.forEach(p => {
      if (idsLigadas.has(p.id)) { p.autorizado = false; p.autorizadoEm = null; p.autorizadoPor = null; }
    });
    await DB.saveProgramacoes(programacoes);
  }
  await DB.deleteAutorizacao(id);
  renderAutorizacoes();
  if (typeof renderDashboard === 'function') renderDashboard();
  toastMsg('Autorização removida do histórico.' + (ligadas.length ? ' As férias ligadas voltaram a ficar sem autorização.' : ''));
  DB.saveLog('Exclusão', `Excluiu Autorização de Férias de ${aut.srvNome}`, 'autorizacoes', id);
}

// ===================== VÍNCULO AUTORIZAÇÃO ↔ PROGRAMAÇÃO DE FÉRIAS =====================
// A autorização é o que confirma as férias; a programação é a previsão.
// O vínculo é feito pelo servidor + datas (início e término), sem campos novos no banco:
//  1. se já existe programação com as mesmas datas, ela é marcada como autorizada;
//  2. se existe programação NÃO autorizada que cruza o período, ela é ajustada para as
//     datas autorizadas (as datas previstas ficam anotadas na observação);
//  3. se não existe nenhuma, a programação é criada já autorizada.

function autPeriodoValido(per) {
  return !!(per && per.inicio && per.fim && /^\d{4}-\d{2}-\d{2}/.test(per.inicio) && /^\d{4}-\d{2}-\d{2}/.test(per.fim));
}

// Programações ligadas a uma autorização (mesmo servidor e mesmas datas)
function programacoesDaAutorizacao(aut) {
  const periodos = (aut.periodos || []).filter(autPeriodoValido);
  return DB.programacoes().filter(p => p.srvId === aut.srvId && p.autorizado &&
    periodos.some(per => p.inicio === per.inicio && p.fim === per.fim));
}

/**
 * Liga os períodos de uma autorização à programação de férias.
 * @param aut   { srvId, tipoFerias, periodos:[{inicio,fim}], periodoRef }
 * @param opts  { autorizadoPor, quando (ISO) }
 * @return { confirmadas, ajustadas, criadas }
 */
async function vincularAutorizacaoProgramacoes(aut, opts) {
  opts = opts || {};
  const programacoes = DB.programacoes();
  const res = autAplicarVinculo(programacoes, aut, opts);
  if (res.confirmadas + res.ajustadas + res.criadas > 0) await DB.saveProgramacoes(programacoes);
  return res;
}

// Núcleo do vínculo: altera a lista recebida e devolve o que mudou (não grava nada)
function autAplicarVinculo(programacoes, aut, opts) {
  opts = opts || {};
  const res = { confirmadas: 0, ajustadas: 0, criadas: 0 };
  const periodos = (aut.periodos || []).filter(autPeriodoValido);
  if (!periodos.length || !DB.servidores().some(s => s.id === aut.srvId)) return res;

  const quando = opts.quando || new Date().toISOString();
  const por = opts.autorizadoPor || 'Coordenador';
  const tipoProg = aut.tipoFerias === 'premio' ? 'premio' : 'anual';
  const hojeIso = new Date().toISOString().slice(0, 10);
  const usadas = new Set();

  periodos.forEach((per, i) => {
    const doSrv = programacoes.filter(p => p.srvId === aut.srvId && !usadas.has(p.id));

    // 1) mesma data: só confirma
    const igual = doSrv.find(p => p.inicio === per.inicio && p.fim === per.fim);
    if (igual) {
      usadas.add(igual.id);
      if (!igual.autorizado) {
        igual.autorizado = true; igual.autorizadoEm = quando; igual.autorizadoPor = por;
        res.confirmadas++;
      }
      return;
    }

    // 2) programação prevista que cruza o período: ajusta para as datas autorizadas
    const cruza = doSrv.find(p => !p.autorizado && !p.concluido && p.inicio && p.fim && p.inicio <= per.fim && p.fim >= per.inicio);
    if (cruza) {
      usadas.add(cruza.id);
      const nota = '[Previsto: ' + fmtDate(cruza.inicio) + ' a ' + fmtDate(cruza.fim) + '; ajustado pela autorização]';
      cruza.obs = (cruza.obs ? cruza.obs + ' ' : '') + nota;
      cruza.inicio = per.inicio; cruza.fim = per.fim; cruza.retorno = addDays(per.fim, 1);
      cruza.autorizado = true; cruza.autorizadoEm = quando; cruza.autorizadoPor = por;
      res.ajustadas++;
      return;
    }

    // 3) nenhuma programação: cria já autorizada
    const nova = {
      id: uid(12),
      srvId: aut.srvId,
      tipo: tipoProg,
      periodo: aut.periodoRef || '',
      inicio: per.inicio,
      fim: per.fim,
      retorno: addDays(per.fim, 1),
      obs: '[Criada pela autorização de férias]',
      concluido: per.fim < hojeIso,
      parcelamento: periodos.length,
      parcela: i + 1,
      autorizado: true,
      autorizadoEm: quando,
      autorizadoPor: por,
      criadoEm: new Date().toISOString()
    };
    programacoes.push(nova);
    usadas.add(nova.id);
    res.criadas++;
  });

  return res;
}

function descreverVinculoAutorizacao(v) {
  const partes = [];
  if (v.confirmadas) partes.push(v.confirmadas + ' período(s) da programação confirmado(s)');
  if (v.ajustadas) partes.push(v.ajustadas + ' período(s) da programação ajustado(s) para as datas autorizadas');
  if (v.criadas) partes.push(v.criadas + ' período(s) incluído(s) na programação de férias');
  return partes.length ? 'Programação de férias atualizada: ' + partes.join('; ') + '.' : 'A programação de férias já estava de acordo.';
}

// Aplica o vínculo às autorizações antigas (emitidas antes de as telas serem interligadas)
async function sincronizarAutorizacoesComProgramacao() {
  const lista = DB.autorizacoes().slice().sort((a, b) => new Date(a.dataEmissao) - new Date(b.dataEmissao));
  if (!lista.length) return toastMsg('Nenhuma autorização emitida ainda.', 'info');

  const aplicar = (programacoes) => {
    const total = { confirmadas: 0, ajustadas: 0, criadas: 0 };
    lista.forEach(aut => {
      const r = autAplicarVinculo(programacoes, aut, { autorizadoPor: aut.coordenador || 'Coordenador', quando: aut.dataEmissao });
      total.confirmadas += r.confirmadas; total.ajustadas += r.ajustadas; total.criadas += r.criadas;
    });
    return total;
  };

  // Primeiro simula em uma cópia, para mostrar o que vai mudar
  const previa = aplicar(DB.programacoes().map(p => ({ ...p })));
  if (previa.confirmadas + previa.ajustadas + previa.criadas === 0) {
    return toastMsg('Tudo certo: todas as autorizações já estão refletidas na programação de férias.', 'success');
  }
  const msg = 'Sincronizar as ' + lista.length + ' autorizações do histórico com a programação de férias?\n\n' +
    '• ' + previa.confirmadas + ' período(s) já programado(s) serão marcados como autorizados\n' +
    '• ' + previa.ajustadas + ' período(s) programado(s) terão as datas ajustadas para as autorizadas\n' +
    '• ' + previa.criadas + ' período(s) autorizado(s) sem programação serão incluídos (os já encerrados entram como concluídos)';
  if (!confirm(msg)) return;

  const programacoes = DB.programacoes();
  const feito = aplicar(programacoes);
  await DB.saveProgramacoes(programacoes);
  DB.saveLog('Sincronização', 'Sincronizou autorizações com a programação de férias: ' + feito.confirmadas + ' confirmadas, ' + feito.ajustadas + ' ajustadas, ' + feito.criadas + ' incluídas', 'programacoes', '');
  if (typeof renderDashboard === 'function') renderDashboard();
  renderAutorizacoes();
  toastMsg('Sincronizado! ' + descreverVinculoAutorizacao(feito), 'success');
}
