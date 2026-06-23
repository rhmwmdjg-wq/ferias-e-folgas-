// Módulo Autorizações.
// Emissão, reimpressão e histórico de autorizações de férias.

let autTipoPeriodo = 0;

function abrirModalAutorizacao(srvId, inicio, fim, tipo, periodo) {
  autTipoPeriodo = 0;
  const srvs = DB.servidores();
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

  const diasPorPeriodo = tipo === 1 ? [30] : tipo === 2 ? [15, 15] : [10, 10, 10];
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

  const diasPorPeriodo = autTipoPeriodo === 1 ? [30] : autTipoPeriodo === 2 ? [15, 15] : [10, 10, 10];
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
  const tipoParc = periodos.length === 1 ? 'Integral (30 dias)' : periodos.length === 2 ? '2 períodos de 15 dias' : '3 períodos de 10 dias';
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
    coordenador: cfg.coordenadorAPS || '',
    dataEmissao: new Date().toISOString()
  });

  // Marcar programações como autorizadas
  const programacoes = DB.programacoes();
  let alterou = false;
  programacoes.forEach(p => {
    if (p.srvId === srv.id && !p.concluido && !p.autorizado) {
      periodos.forEach(per => {
        if (p.inicio === per.inicio && p.fim === per.fim) {
          p.autorizado = true;
          p.autorizadoEm = new Date().toISOString();
          p.autorizadoPor = cfg.coordenadorAPS || 'Coordenador';
          alterou = true;
        }
      });
    }
  });
  if (alterou) await DB.saveProgramacoes(programacoes);

  fecharModal('modal-autorizacao');
  toastMsg('Autorização salva no histórico! Férias marcadas como autorizadas no sistema.');
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

function excluirAutorizacao(id) {
  if (!confirm('Tem certeza que deseja excluir esta autorização do histórico?')) return;
  DB.deleteAutorizacao(id);
  renderAutorizacoes();
  toastMsg('Autorização removida do histórico.');
}
