// Módulo de relatórios e impressões.
// Mantém as regras e layouts de impressão existentes separados do HTML principal.

function popularSelectCredRelatorio() {
  const dados = DB.credenciados();
  const sel = document.getElementById('pt-rel-credenciado');
  if (!sel) return;
  const val = sel.value;
  sel.innerHTML = '<option value="">Selecione...</option>';
  for (let i = 0; i < dados.length; i++) {
    sel.innerHTML += '<option value="' + dados[i].id + '">' + esc(dados[i].nome) + ' - ' + esc(dados[i].cpf || '') + '</option>';
  }
  if (val) sel.value = val;
}

function togglePtRelTipo() {
  const tipo = document.getElementById('pt-rel-tipo').value;
  document.getElementById('pt-rel-mes-field').style.display = tipo === 'mes' || tipo === 'individual' ? 'block' : 'none';
  document.getElementById('pt-rel-individual').style.display = tipo === 'individual' ? 'block' : 'none';
  const label = document.getElementById('pt-rel-mes-label');
  if (label) label.style.display = tipo === 'individual' ? 'inline' : 'none';
}

function imprimirRelPonto() {
  const tipo = document.getElementById('pt-rel-tipo').value;
  const mesref = document.getElementById('pt-rel-mes').value;
  if (tipo === 'individual') {
    const credId = document.getElementById('pt-rel-credenciado').value;
    if (!credId) { toastMsg('Selecione o credenciado.', 'warning'); return; }
    const mes = mesref ? parseInt(mesref.split('-')[1]) : null;
    const ano = mesref ? parseInt(mesref.split('-')[0]) : null;
    imprimirRelPontoIndividual(credId, mes, ano);
  } else {
    if (!mesref) { toastMsg('Informe o mês/ano.', 'warning'); return; }
    const mes = parseInt(mesref.split('-')[1]);
    const ano = parseInt(mesref.split('-')[0]);
    imprimirRelPontoMes(mes, ano);
  }
}

function imprimirRelPontoIndividual(credId, filtroMes, filtroAno) {
  const creds = DB.credenciados();
  const cargos = DB.cargos();
  const pontos = DB.pontoMensal();
  const cred = creds.find(c => c.id === credId);
  if (!cred) return;
  const cargo = cargos.find(c => c.id === cred.cargoId);
  let credPontos = pontos.filter(p => p.credenciadoId === credId);
  if (filtroMes && filtroAno) {
    credPontos = credPontos.filter(p => parseInt(p.mes) === filtroMes && parseInt(p.ano) === filtroAno);
  }
  const cfg = DB.config();
  const logoEsq = getImg('print') || getImg('esq');
  const orgNome = cfg.nomeOrganizacao || 'Coordenação da Atenção Primária à Saúde';

  let html = `
  <html><head><style>
    @page { margin: 15mm 10mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #222; font-size: 12px; line-height: 1.5; }
    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #1a3a5c; padding-bottom: 12px; }
    .header img { max-height: 70px; margin-bottom: 6px; }
    .header h2 { margin: 4px 0; color: #1a3a5c; font-size: 16px; }
    .header p { margin: 2px 0; color: #555; font-size: 11px; }
    h3 { color: #1a3a5c; border-bottom: 1px solid #ccc; padding-bottom: 4px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; font-size: 11px; }
    th { background: #1a3a5c; color: #fff; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; }
    .info-item label { font-weight: 700; color: #1a3a5c; font-size: 10px; text-transform: uppercase; }
    .info-item span { display: block; font-size: 12px; }
    .total { font-size: 14px; font-weight: 700; color: #1a3a5c; text-align: right; margin-top: 10px; }
    .footer { text-align: center; margin-top: 30px; font-size: 10px; color: #888; border-top: 1px solid #ccc; padding-top: 8px; }
  </style></head><body>
    <div class="header">
      ${logoEsq ? '<img src="' + logoEsq + '">' : ''}
      <h2>${esc(orgNome)}</h2>
      <p>Relatório Individual de Ponto - Credenciado</p>
    </div>
    <h3>Dados do Credenciado</h3>
    <div class="info-grid">
      <div class="info-item"><label>Nome</label><span>${esc(cred.nome)}</span></div>
      <div class="info-item"><label>CPF</label><span>${esc(cred.cpf || '-')}</span></div>
      <div class="info-item"><label>PIS/NIS</label><span>${esc(cred.pis || '-')}</span></div>
      <div class="info-item"><label>Telefone</label><span>${esc(cred.tel || '-')}</span></div>
      <div class="info-item"><label>E-mail</label><span>${esc(cred.email || '-')}</span></div>
      <div class="info-item"><label>Endereço</label><span>${esc(cred.endereco || '-')}</span></div>
      <div class="info-item"><label>Lotação</label><span>${esc(cred.lotacao || '-')}</span></div>
      <div class="info-item"><label>Cargo</label><span>${esc(cargo ? cargo.nome : '-')}</span></div>
      <div class="info-item"><label>Valor da Hora</label><span>R$ ${(cargo ? parseFloat(cargo.valorHora) : 0).toFixed(2)}</span></div>
      <div class="info-item"><label>Forma de Pagamento</label><span>${esc(cred.formaPagamento || '-')}</span></div>
      ${cred.formaPagamento === 'pix' && cred.chavePix ? '<div class="info-item"><label>Chave PIX</label><span>' + esc(cred.chavePix) + '</span></div>' : ''}
      ${cred.formaPagamento === 'ted' ? '<div class="info-item"><label>Banco</label><span>' + esc(cred.banco || '-') + '</span></div><div class="info-item"><label>Agência</label><span>' + esc(cred.agencia || '-') + '</span></div><div class="info-item"><label>Conta</label><span>' + esc(cred.conta || '-') + '</span></div><div class="info-item"><label>Tipo de Conta</label><span>' + esc(cred.tipoConta || '-') + '</span></div>' : ''}
    </div>`;

  if (credPontos.length) {
    let totalGeral = 0;
    html += '<h3>Registros de Ponto</h3><table><thead><tr><th>Mês/Ano</th><th>Horas</th><th>Valor Hora</th><th>Valor Total</th></tr></thead><tbody>';
    for (let i = 0; i < credPontos.length; i++) {
      const p = credPontos[i];
      const mesAno = (p.mes || '').toString().padStart(2, '0') + '/' + (p.ano || '');
      const vt = parseFloat(p.valorTotal) || 0;
      totalGeral += vt;
      html += '<tr><td>' + mesAno + '</td><td>' + (parseFloat(p.horas) || 0).toFixed(1) + '</td><td>R$ ' + (parseFloat(p.valorHora) || 0).toFixed(2) + '</td><td>R$ ' + vt.toFixed(2) + '</td></tr>';
    }
    html += '</tbody></table>';
    html += '<div class="total">Total Geral: R$ ' + totalGeral.toFixed(2) + '</div>';
  } else {
    html += '<p style="color:#888;text-align:center;margin:20px 0">Nenhum registro de ponto encontrado.</p>';
  }

  html += '<div class="footer">Relatório gerado em ' + new Date().toLocaleString('pt-BR') + '</div>';
  html += getAssinaturaCoordenador() + '</body></html>';

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.print(); }, 500);
}

function imprimirRelPontoMes(mes, ano) {
  const creds = DB.credenciados();
  const cargos = DB.cargos();
  const pontos = DB.pontoMensal().filter(p => p.mes === mes && p.ano === ano);
  const cfg = DB.config();
  const logoEsq = getImg('print') || getImg('esq');
  const orgNome = cfg.nomeOrganizacao || 'Coordenação da Atenção Primária à Saúde';

  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const mesNome = meses[mes - 1] || mes;

  let html = `
  <html><head><style>
    @page { margin: 15mm 10mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #222; font-size: 12px; line-height: 1.5; }
    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #1a3a5c; padding-bottom: 12px; }
    .header img { max-height: 70px; margin-bottom: 6px; }
    .header h2 { margin: 4px 0; color: #1a3a5c; font-size: 16px; }
    .header p { margin: 2px 0; color: #555; font-size: 11px; }
    h3 { color: #1a3a5c; border-bottom: 1px solid #ccc; padding-bottom: 4px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; font-size: 11px; }
    th { background: #1a3a5c; color: #fff; }
    .total { font-size: 14px; font-weight: 700; color: #1a3a5c; text-align: right; margin-top: 10px; }
    .footer { text-align: center; margin-top: 30px; font-size: 10px; color: #888; border-top: 1px solid #ccc; padding-top: 8px; }
  </style></head><body>
    <div class="header">
      ${logoEsq ? '<img src="' + logoEsq + '">' : ''}
      <h2>${esc(orgNome)}</h2>
      <p>Relatório Mensal de Ponto - ${mesNome}/${ano}</p>
    </div>`;

  if (pontos.length) {
    let totalGeral = 0;
    let totalHoras = 0;
    html += '<table><thead><tr><th>Credenciado</th><th>CPF</th><th>Cargo</th><th>Horas</th><th>Valor Hora</th><th>Valor Total</th></tr></thead><tbody>';
    for (let i = 0; i < pontos.length; i++) {
      const p = pontos[i];
      const cred = creds.find(c => c.id === p.credenciadoId);
      const cargo = cargos.find(c => c.id === (p.cargoId || (cred ? cred.cargoId : '')));
      const vt = parseFloat(p.valorTotal) || 0;
      totalGeral += vt;
      totalHoras += parseFloat(p.horas) || 0;
      html += '<tr><td>' + esc(cred ? cred.nome : '-') + '</td><td>' + esc(cred ? cred.cpf || '-' : '-') + '</td>'
        + '<td>' + esc(cargo ? cargo.nome : '-') + '</td><td>' + (parseFloat(p.horas) || 0).toFixed(1) + '</td>'
        + '<td>R$ ' + (parseFloat(p.valorHora) || 0).toFixed(2) + '</td><td>R$ ' + vt.toFixed(2) + '</td></tr>';
    }
    html += '</tbody></table>';
    html += '<div class="total">Total de Horas: ' + totalHoras.toFixed(1) + 'h | Valor Total: R$ ' + totalGeral.toFixed(2) + '</div>';
  } else {
    html += '<p style="color:#888;text-align:center;margin:20px 0">Nenhum registro de ponto para ' + mesNome + '/' + ano + '.</p>';
  }

  html += '<div class="footer">Relatório gerado em ' + new Date().toLocaleString('pt-BR') + '</div>';
  html += getAssinaturaCoordenador() + '</body></html>';

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.print(); }, 500);
}

function exportarRelatorioCoberturas() {
  const mesInput = document.getElementById('cb-mes');
  let mesAlvo = mesInput ? mesInput.value : '';
  if (!mesAlvo) {
    const d = new Date();
    mesAlvo = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  const servidores = DB.servidores();
  const folgas = getFolgasAcessiveis().filter(f => f.tipo === 'debito');
  const progs = getProgramacoesAcessiveis().filter(p => !p.concluido);
  const linhas = [];

  folgas.forEach(f => {
    const parsed = parseFolgaObs(f.obs);
    if (!parsed.coberturaNome) return;
    const srv = servidores.find(s => s.id === f.srvId);
    if (!srv) return;
    const datas = f.dataItems ? f.dataItems.map(d => d.data) : [f.data];
    const datasNoMes = datas.filter(d => d && d.startsWith(mesAlvo));
    if (datasNoMes.length === 0) return;
    linhas.push({ ausente: srv.nome, setor: srv.setor || '-', tipo: 'Folga', substituto: parsed.coberturaNome, periodo: datasNoMes.map(d => fmtDate(d)).join(', '), qtd: datasNoMes.length });
  });

  progs.forEach(p => {
    const parsed = parseFolgaObs(p.obs || '');
    if (!parsed.coberturaNome) return;
    const srv = servidores.find(s => s.id === p.srvId);
    if (!srv) return;
    const dias = gerarDiasNoMes(p.inicio, p.fim, mesAlvo);
    if (dias === 0) return;
    linhas.push({ ausente: srv.nome, setor: srv.setor || '-', tipo: 'Férias', substituto: parsed.coberturaNome, periodo: `${fmtDate(p.inicio)} a ${fmtDate(p.fim)}`, qtd: dias });
  });

  if (!linhas.length) return toastMsg('Nenhuma cobertura para exportar no período.', 'info');

  const [ano, mes] = mesAlvo.split('-');
  const nomesMes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const imgPrint = getImg('print');

  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><meta charset="UTF-8"><title>Relatório de Coberturas - ${nomesMes[parseInt(mes)-1]} ${ano}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
      body { font-family: 'Inter', sans-serif; padding: 40px; font-size: 12px; }
      h1 { font-size: 20px; margin-bottom: 5px; }
      h2 { font-size: 14px; font-weight: 400; color: #555; margin-bottom: 30px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #f0f0f0; text-align: left; padding: 10px 8px; font-size: 10px; text-transform: uppercase; border-bottom: 2px solid #000; }
      td { padding: 8px; border-bottom: 1px solid #ddd; }
      .total { margin-top: 20px; font-weight: 700; font-size: 14px; }
      .footer { margin-top: 40px; text-align: center; font-size: 9px; color: #888; border-top: 1px solid #ddd; padding-top: 10px; }
      @media print { @page { size: A4 landscape; margin: 1cm; } body { padding: 0; } }
    </style></head>
    <body onload="window.print()">
      ${imgPrint ? `<div style="text-align:center;margin-bottom:20px"><img src="${imgPrint}" style="max-height:60px"></div>` : ''}
      <h1>🤝 Relatório de Coberturas</h1>
      <h2>${nomesMes[parseInt(mes)-1]} de ${ano} · Total: ${linhas.length} cobertura(s)</h2>
      <table><thead><tr><th>Servidor Ausente</th><th>Setor</th><th>Tipo</th><th>Substituto</th><th>Período</th><th>Dias</th></tr></thead>
      <tbody>${linhas.map(l => `<tr><td>${l.ausente}</td><td>${l.setor}</td><td>${l.tipo}</td><td>${l.substituto}</td><td>${l.periodo}</td><td>${l.qtd}</td></tr>`).join('')}</tbody></table>
      <div class="total">Total de coberturas no período: ${linhas.length}</div>
      <div class="footer">Documento gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</div>
    </body></html>
  `);
  win.document.close();
}

function renderRelatorio() {
  const busca = (document.getElementById('busca-rel')?.value || '').toLowerCase();
  const tipo = document.getElementById('filtro-tipo-rel')?.value || '';
  const setor = document.getElementById('filtro-setor-rel')?.value || '';
  const vinculo = document.getElementById('filtro-vinculo-rel')?.value || '';
  const mes = document.getElementById('filtro-mes-rel')?.value || '';
  
  const servidores = getServidoresAcessiveis();
  const programacoes = getProgramacoesAcessiveis();
  
  const setores = [...new Set(servidores.map(s => s.setor).filter(Boolean))];
  const sel = document.getElementById('filtro-setor-rel');
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = '<option value="">Todos os Setores</option>' + setores.map(s => `<option value="${s}" ${s===cur?'selected':''}>${s}</option>`).join('');
  }

  const progs = programacoes.filter(p => {
    const srv = servidores.find(s => s.id === p.srvId);
    if (!srv) return false;
    const mesProg = p.inicio ? new Date(p.inicio + 'T12:00:00').getMonth() : -1;
    const vSrv = srv.vinculo || 'efetivo';
    return (!tipo || p.tipo === tipo) &&
           (!setor || srv.setor === setor) &&
           (!vinculo || vSrv === vinculo) &&
           (mes === '' || mesProg === parseInt(mes)) &&
           (!busca || srv.nome.toLowerCase().includes(busca) || srv.matricula.includes(busca));
  });

  const tbody = document.getElementById('tbody-relatorio');
  if (!progs.length) { 
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:40px">Nenhuma programação encontrada.</td></tr>'; 
    if (document.getElementById('paginacao-relatorio')) document.getElementById('paginacao-relatorio').innerHTML = '';
    return; 
  }

  // Paginação
  const totalPages = Math.ceil(progs.length / rowsPerPage);
  if (currentPage > totalPages) currentPage = totalPages || 1;
  const inicio = (currentPage - 1) * rowsPerPage;
  const fim = inicio + rowsPerPage;
  const paginados = progs.slice(inicio, fim);
  
  renderPaginacao('paginacao-relatorio', totalPages, 'renderRelatorio');

  paginados.sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
  tbody.innerHTML = paginados.map(p => {
    const srv = servidores.find(s => s.id === p.srvId);
    const diff = diffDays(p.inicio);
    let sit, cls;
    if (diff < 0) { sit = 'Concluído'; cls = 'tag-green'; }
    else if (diff === 0) { sit = 'Hoje!'; cls = 'tag-red'; }
    else if (diff <= 10) { sit = 'Urgente'; cls = 'tag-red'; }
    else if (diff <= 35) { sit = 'Próximo'; cls = 'tag-warn'; }
    else { sit = 'Agendado'; cls = 'tag-blue'; }
    const sessao = JSON.parse(sessionStorage.getItem('ferias_sessao'));
    const isAdmin = sessao.role === 'admin';
    const retorno = p.retorno || (p.fim ? addDays(p.fim, 1) : '-');
    return `<tr>
      <td><strong>${srv?.nome || '-'}</strong></td>
      <td>${srv?.matricula || '-'}</td>
      <td>${srv?.setor || '-'}</td>
      <td><span class="tag ${p.tipo==='anual'?'tag-blue':'tag-purple'}">${p.tipo==='anual'?'🌴 Anual':'🏆 Prêmio'}</span></td>
      <td>${fmtDate(p.inicio)}</td>
      <td>${fmtDate(retorno)}</td>
      <td>${p.periodo || '-'}</td>
      <td><span class="tag ${cls}">${sit}</span></td>
      <td>
        ${(isAdmin || sessao.role === 'gestor') && srv?.telefone ? `<button class="btn btn-success btn-sm" onclick="prepararWhatsApp('${srv.id}','${p.id}')">💬</button>` : ''}
        ${isAdmin ? `<button class="btn btn-danger btn-sm" onclick="excluirProgRel('${p.id}')">🗑️</button>` : '-'}
      </td>
    </tr>`;
  }).join('');
}

async function excluirProgRel(id) {
  if (!confirm('Excluir esta programação?')) return;
  
  // 1. Apaga do Supabase
  await DB.deleteProgramacao(id);

  // 2. Apaga localmente
  const lista = DB.programacoes().filter(p => p.id !== id);
  _remoteData.programacoes = lista;
  localStorage.setItem('srv_programacoes', JSON.stringify(lista));

  renderRelatorio();
  renderDashboard();
  atualizarBadge();
  toastMsg('Programação excluída permanentemente.');
}

function selecionarServidorRel(id) {
  const sel = document.getElementById('rel-srv-sel');
  const cont = document.getElementById('rel-search-results');
  const busca = document.getElementById('rel-srv-busca');
  
  if (sel) sel.value = id;
  if (cont) cont.style.display = 'none';
  if (busca) {
    const s = DB.servidores().find(x => x.id === id);
    if (s) busca.value = s.nome;
  }
  
  renderSaldoServidor();
}

function popularSelectRelatorio() {
  const sessaoStr = sessionStorage.getItem('ferias_sessao');
  if (!sessaoStr) return;
  const sessao = JSON.parse(sessaoStr);
  const isAdmin = sessao.role === 'admin';
  const sel = document.getElementById('rel-srv-sel');
  if (!sel) return;
  
  const setor = document.getElementById('rel-srv-setor')?.value || '';
  const todos = getServidoresAcessiveis();
  const filtrados = todos.filter(s => !setor || s.setor === setor);

  const cur = sel.value;
  const showOptPlaceholder = isAdmin || sessao.role === 'gestor';
  let html = showOptPlaceholder ? '<option value="">-- Selecione o Servidor --</option>' : '';
  
  html += filtrados.map(s => `
    <option value="${s.id}" ${s.id === cur ? 'selected' : ''}>${s.nome} (Mat. ${s.matricula})</option>
  `).join('');
  
  sel.innerHTML = html;
  
  // Se for servidor, já renderiza o saldo dele imediatamente
  if (sessao.role === 'servidor' && filtrados.length > 0) {
    if (!sel.value) sel.value = filtrados[0].id;
    renderSaldoServidor();
  }

  // Popular seletor de ano do relatório mensal
  const anoSel = document.getElementById('rel-ano-pdf');
  if (anoSel && !anoSel.options.length) {
    const anoAtual = new Date().getFullYear();
    for (let a = anoAtual - 2; a <= anoAtual + 1; a++) {
      const opt = document.createElement('option');
      opt.value = a;
      opt.textContent = a;
      if (a === anoAtual) opt.selected = true;
      anoSel.appendChild(opt);
    }
  }
}

function imprimirRelatorio(tipo) {
  const win = window.open('', '_blank');
  const servidores = getServidoresAcessiveis();
  const programacoes = getProgramacoesAcessiveis();
  const folgas = getFolgasAcessiveis();
  const hoje = new Date();
  
  let titulo = '';
  let htmlTabela = '';
  
  const headCSS = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: 'Inter', sans-serif;
        color: #111;
        margin: 30px 36px;
        line-height: 1.45;
        font-size: 10px;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .doc-header { border: 2px solid #000; width: 100%; margin-bottom: 20px; border-collapse: collapse; }
      .doc-header td { border: 1.5px solid #000; padding: 10px 14px; vertical-align: middle; }
      .doc-header .cell-logo { width: 22%; text-align: center; }
      .doc-header .cell-title { width: 56%; text-align: center; }
      .doc-header .cell-meta { width: 22%; font-size: 8px; line-height: 1.6; background: #f7f7f7; }
      .doc-header h2 { margin: 4px 0 2px; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
      .doc-header .subtitle { font-size: 8.5px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
      .doc-header .org-name { font-size: 8px; margin-bottom: 4px; font-weight: 700; color: #333; text-transform: uppercase; letter-spacing: 1px; }
      .doc-header strong { font-size: 8px; }
      .section-title-print {
        font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em;
        color: #555; border-bottom: 1.5px solid #000; padding-bottom: 4px; margin: 16px 0 8px;
      }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; page-break-inside: auto; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
      th {
        background-color: #1a1a2e; color: #fff; padding: 7px 9px;
        text-align: left; font-size: 8px; text-transform: uppercase;
        font-weight: 700; letter-spacing: 0.06em;
      }
      td { border: 1px solid #ccc; padding: 6px 9px; font-size: 9.5px; vertical-align: middle; }
      tbody tr:nth-child(even) td { background: #f7f8fc; }
      .text-center { text-align: center; }
      .bold { font-weight: 700; }
      .text-sm { font-size: 8.5px; }
      .text-mono { font-family: 'Courier New', monospace; font-size: 9px; }
      .badge-anual   { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; padding: 1px 5px; border-radius: 3px; font-size: 7.5px; font-weight: 700; }
      .badge-premio  { background: #ede9fe; color: #4c1d95; border: 1px solid #c4b5fd; padding: 1px 5px; border-radius: 3px; font-size: 7.5px; font-weight: 700; }
      .badge-credito { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; padding: 1px 5px; border-radius: 3px; font-size: 7.5px; font-weight: 700; }
      .badge-gozo    { background: #fee2e2; color: #7f1d1d; border: 1px solid #fca5a5; padding: 1px 5px; border-radius: 3px; font-size: 7.5px; font-weight: 700; }
      .group-block { margin-bottom: 24px; page-break-inside: avoid; border: 1.5px solid #333; border-radius: 4px; overflow: hidden; }
      .group-header {
        background: #1a1a2e; color: #fff; font-weight: 700;
        font-size: 10px; padding: 8px 12px;
        display: flex; justify-content: space-between; align-items: center;
      }
      .group-header .saldo-neg { color: #fca5a5; }
      .group-header .saldo-pos { color: #6ee7b7; }
      .footer-print {
        position: fixed; bottom: 0; left: 0; right: 0;
        border-top: 1.5px solid #000; padding: 6px 36px;
        font-size: 8px; font-weight: 600; color: #333;
        display: flex; justify-content: space-between; align-items: center;
        background: #fff; text-transform: uppercase; letter-spacing: 0.04em;
      }
      @media print {
        @page { size: A4 portrait; margin: 12mm; }
        body { margin: 0; }
      }
    </style>
  `;

  if (tipo === 'servidores') {
    titulo = 'Relatório Geral de Servidores';
    htmlTabela = `
      <div class="section-title-print">📋 Lista de Servidores — Total: ${servidores.length}</div>
      <table>
        <thead>
          <tr>
            <th style="width:70px">Matrícula</th>
            <th>Nome Completo</th>
            <th style="width:75px">Nascimento</th>
            <th style="width:75px">Admissão</th>
            <th>Setor</th>
            <th>Cargo</th>
            <th style="width:40px;text-align:center">Reg.</th>
            <th style="width:50px;text-align:center">Prêmio</th>
          </tr>
        </thead>
        <tbody>
          ${servidores.sort((a,b) => a.nome.localeCompare(b.nome)).map(s => `
            <tr>
              <td class="bold text-mono">${s.matricula}</td>
              <td class="bold">${s.nome}</td>
              <td class="text-center">${fmtDate(s.nascimento)}</td>
              <td class="text-center">${fmtDate(s.admissao)}</td>
              <td>${s.setor || '-'}</td>
              <td class="text-sm">${s.cargo || '-'}</td>
              <td class="text-center bold">${s.feriasReg || 0}</td>
              <td class="text-center bold">${s.feriasPrem || 0}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else if (tipo === 'ferias') {
    titulo = 'Relatório de Programação de Férias';
    const filtBusca = document.getElementById('busca-rel')?.value.toLowerCase() || '';
    const filtTipo = document.getElementById('filtro-tipo-rel')?.value || '';
    const filtSetor = document.getElementById('filtro-setor-rel')?.value || '';
    const filtVinculo = document.getElementById('filtro-vinculo-rel')?.value || '';
    const filtMes = document.getElementById('filtro-mes-rel')?.value || '';

    const progsFiltradas = programacoes.filter(p => {
      const srv = servidores.find(s => s.id === p.srvId);
      if (!srv) return false;
      const mesProg = p.inicio ? new Date(p.inicio + 'T12:00:00').getMonth() : -1;
      const vSrv = srv.vinculo || 'efetivo';
      return (!filtTipo || p.tipo === filtTipo) && 
             (!filtSetor || srv.setor === filtSetor) && 
             (!filtVinculo || vSrv === filtVinculo) &&
             (filtMes === '' || mesProg === parseInt(filtMes)) &&
             (!filtBusca || srv.nome.toLowerCase().includes(filtBusca) || srv.matricula.includes(filtBusca));
    }).sort((a,b) => new Date(a.inicio) - new Date(b.inicio));

    if (filtMes === '') {
      // AGRUPAR POR MÊS E SETOR
      const mesesNomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
      const grupos = {};
      progsFiltradas.forEach(p => {
        const mIdx = new Date(p.inicio + 'T12:00:00').getMonth();
        const srv = servidores.find(s => s.id === p.srvId);
        const setorNome = srv?.setor || 'NÃO INFORMADO';
        if (!grupos[mIdx]) grupos[mIdx] = {};
        if (!grupos[mIdx][setorNome]) grupos[mIdx][setorNome] = [];
        grupos[mIdx][setorNome].push(p);
      });

      htmlTabela = '';
      const mesesOrdenados = Object.keys(grupos).sort((a,b) => parseInt(a) - parseInt(b));
      mesesOrdenados.forEach(mIdx => {
        htmlTabela += `<div class="section-title-print" style="background:#f0f4ff; padding: 10px; font-size: 11px; margin-top:25px; border:1.5px solid #000;">📅 MÊS: ${mesesNomes[mIdx].toUpperCase()}</div>`;
        const setoresNoMes = Object.keys(grupos[mIdx]).sort();
        setoresNoMes.forEach(setor => {
          htmlTabela += `
            <div style="font-weight: 800; font-size: 9px; margin-top: 12px; margin-bottom: 5px; color: #1a1a2e;">📁 SETOR: ${setor}</div>
            <table>
              <thead>
                <tr>
                  <th>Servidor</th>
                  <th style="width:65px">Matrícula</th>
                  <th style="width:65px">Tipo</th>
                  <th style="width:72px">Início</th>
                  <th style="width:72px">Retorno</th>
                  <th style="width:72px">Ref.</th>
                  <th>Observações</th>
                </tr>
              </thead>
              <tbody>
                ${grupos[mIdx][setor].map(p => {
                  const srv = servidores.find(s => s.id === p.srvId);
                  const ret = p.retorno || (p.fim ? addDays(p.fim, 1) : '-');
                  return `<tr>
                    <td class="bold">${srv?.nome || 'N/A'}</td>
                    <td class="text-mono">${srv?.matricula || '-'}</td>
                    <td class="text-center">${p.tipo === 'anual' ? '<span class="badge-anual">Anual</span>' : '<span class="badge-premio">Prêmio</span>'}</td>
                    <td class="text-center">${fmtDate(p.inicio)}</td>
                    <td class="text-center">${fmtDate(ret)}</td>
                    <td class="text-center text-sm">${p.periodo || '-'}</td>
                    <td class="text-sm">${p.obs || '-'}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          `;
        });
      });
    } else {
      // IMPRESSÃO NORMAL (FILTRADA POR MÊS OU BUSCA)
      htmlTabela = `
        <div class="section-title-print">📅 Programações — Total: ${progsFiltradas.length}${filtSetor ? ' | Setor: '+filtSetor : ''}${filtTipo ? ' | Tipo: '+(filtTipo==='anual'?'Anual':'Prêmio') : ''}</div>
        <table>
          <thead>
            <tr>
              <th>Servidor</th>
              <th style="width:65px">Matrícula</th>
              <th style="width:65px">Tipo</th>
              <th style="width:72px">Início</th>
              <th style="width:72px">Retorno</th>
              <th style="width:72px">Ref.</th>
              <th>Setor</th>
              <th>Observações</th>
            </tr>
          </thead>
          <tbody>
            ${progsFiltradas.map(p => {
              const srv = servidores.find(s => s.id === p.srvId);
              const ret = p.retorno || (p.fim ? addDays(p.fim, 1) : '-');
              return `<tr>
                <td class="bold">${srv?.nome || 'N/A'}</td>
                <td class="text-mono">${srv?.matricula || '-'}</td>
                <td class="text-center">${p.tipo === 'anual' ? '<span class="badge-anual">Anual</span>' : '<span class="badge-premio">Prêmio</span>'}</td>
                <td class="text-center">${fmtDate(p.inicio)}</td>
                <td class="text-center">${fmtDate(ret)}</td>
                <td class="text-center text-sm">${p.periodo || '-'}</td>
                <td>${srv?.setor || '-'}</td>
                <td class="text-sm">${p.obs || '-'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      `;
    }
  } else if (tipo === 'sem_ferias') {
    const filtSetor = document.getElementById('filtro-setor-rel')?.value || '';
    const filtVinculo = document.getElementById('filtro-vinculo-rel')?.value || '';
    
    // Filtrar servidores que NÃO possuem nenhuma programação futura ou pendente
    const semProgs = servidores.filter(s => {
      const hasProg = programacoes.some(p => p.srvId === s.id);
      const vSrv = s.vinculo || 'efetivo';
      return !hasProg && 
             (!filtSetor || s.setor === filtSetor) &&
             (!filtVinculo || vSrv === filtVinculo);
    }).sort((a,b) => a.nome.localeCompare(b.nome));

    titulo = 'Servidores Sem Férias Programadas';
    htmlTabela = `
      <div class="section-title-print">⚠️ Servidores Sem Programação — Total: ${semProgs.length}${filtSetor ? ' | Setor: '+filtSetor : ''}${filtVinculo ? ' | Vínculo: '+filtVinculo : ''}</div>
      <table>
        <thead>
          <tr>
            <th style="width:70px">Matrícula</th>
            <th>Nome Completo</th>
            <th>Setor</th>
            <th>Cargo</th>
            <th style="width:80px">Admissão</th>
            <th style="width:70px">Vínculo</th>
            <th style="width:40px;text-align:center">Reg.</th>
            <th style="width:50px;text-align:center">Prêmio</th>
          </tr>
        </thead>
        <tbody>
          ${semProgs.map(s => `
            <tr>
              <td class="bold text-mono">${s.matricula}</td>
              <td class="bold">${s.nome}</td>
              <td>${s.setor || '-'}</td>
              <td class="text-sm">${s.cargo || '-'}</td>
              <td class="text-center">${fmtDate(s.admissao)}</td>
              <td class="text-center" style="text-transform:capitalize">${s.vinculo || 'efetivo'}</td>
              <td class="text-center bold">${s.feriasReg || 0}</td>
              <td class="text-center bold">${s.feriasPrem || 0}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div style="margin-top: 20px; font-style: italic; font-size: 9px; color: #666;">
        * Lista de servidores que não possuem nenhum registro de férias programadas no sistema.
      </div>
    `;
  } else if (tipo === 'folgas') {
    titulo = 'Relatório de Bancos de Folgas';
    htmlTabela = servidores.filter(s => folgas.some(f => f.srvId === s.id)).map(s => {
      const srvFolgas = folgas.filter(f => f.srvId === s.id).sort((a,b) => new Date(b.data) - new Date(a.data));
      const saldo = srvFolgas.reduce((acc, f) => acc + (f.tipo === 'credito' ? f.qtd : -f.qtd), 0);
      return `
        <div class="group-block">
          <div class="group-header">
            <span>👤 ${s.nome} &nbsp;·&nbsp; Mat. ${s.matricula} &nbsp;·&nbsp; ${s.setor || '-'}</span>
            <span class="${saldo < 0 ? 'saldo-neg' : 'saldo-pos'}">SALDO: ${saldo > 0 ? '+' : ''}${saldo} DIA(S)</span>
          </div>
          <table style="margin:0">
            <thead><tr>
              <th style="width:80px">Data</th>
              <th style="width:80px">Tipo</th>
              <th style="width:55px;text-align:center">Qtd.</th>
              <th>Justificativa</th>
            </tr></thead>
            <tbody>${srvFolgas.map(f => `<tr>
              <td class="text-center">${fmtDate(f.data)}</td>
              <td class="text-center">${f.tipo === 'credito' ? '<span class="badge-credito">CRÉDITO</span>' : '<span class="badge-gozo">GOZO</span>'}</td>
              <td class="text-center bold">${f.tipo === 'credito' ? '+' : '-'}${f.qtd}</td>
              <td class="text-sm">${f.tipo === 'credito' ? f.motivo : f.obs || '-'}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      `;
    }).join('');
  } else if (tipo === 'aniversariantes') {
    const mesAtual = parseInt(document.getElementById('mbtn-0').parentElement.querySelector('.active')?.id.replace('mbtn-','') || hoje.getMonth());
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    titulo = `Relatório de Aniversariantes — ${meses[mesAtual]}`;
    const aniversariantes = servidores.filter(s => s.nascimento && parseInt(s.nascimento.split('-')[1]) - 1 === mesAtual).sort((a, b) => parseInt(a.nascimento.split('-')[2]) - parseInt(b.nascimento.split('-')[2]));
    htmlTabela = `
      <div class="section-title-print">🎂 Aniversariantes em ${meses[mesAtual]} — Total: ${aniversariantes.length}</div>
      <table>
        <thead><tr>
          <th style="width:55px;text-align:center">Dia</th>
          <th>Nome</th>
          <th style="width:80px">Matrícula</th>
          <th>Setor</th>
          <th>Cargo</th>
        </tr></thead>
        <tbody>${aniversariantes.map(s => `<tr>
          <td class="text-center bold">${s.nascimento.split('-')[2]}</td>
          <td class="bold">${s.nome}</td>
          <td class="text-center text-mono">${s.matricula}</td>
          <td>${s.setor || '-'}</td>
          <td class="text-sm">${s.cargo || '-'}</td>
        </tr>`).join('')}</tbody>
      </table>
    `;
  }

  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${titulo}</title>${headCSS}</head><body onload="window.print()">
    <table class="doc-header">
      <tr>
        <td class="cell-logo">
          ${getImg('print') ? `<img src="${getImg('print')}" style="max-height:80px;max-width:100%;object-fit:contain;display:block;margin:0 auto;">` : '<div style="font-weight:800;font-size:16px;color:#1a1a2e;">RH</div>'}
        </td>
        <td class="cell-title">
          <div class="org-name">${DB.config().nomeOrganizacao || 'Coordenação da Atenção Primária à Saúde'}</div>
          <h2>${titulo}</h2>
          <div class="subtitle">Controle de Escalas, Férias e Banco de Folgas</div>
        </td>
        <td class="cell-meta">
          <strong>DOCUMENTO:</strong> REL-GER-01<br>
          <strong>EMISSÃO:</strong> ${hoje.toLocaleDateString('pt-BR')} ${hoje.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}<br>
          <strong>SISTEMA:</strong> V.2.0-PRO
        </td>
      </tr>
    </table>
    ${htmlTabela}
    <div class="footer-print">
      <span>© ${hoje.getFullYear()} — ${DB.config().nomeOrganizacao || 'Coordenação da Atenção Primária à Saúde'}</span>
      <span>Emitido em ${hoje.toLocaleDateString('pt-BR')} às ${hoje.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>
    </div>
    ${getAssinaturaCoordenador()}
  </body></html>`);
  win.document.close();
}

function imprimirRelatorioIndividual(srvId, tipo) {
  const srv = DB.servidores().find(s => s.id === srvId);
  if (!srv) return;
  const win = window.open('', '_blank');
  const folgas = DB.folgas().filter(f => f.srvId === srvId).sort((a,b) => new Date(b.data) - new Date(a.data));
  const hoje = new Date();
  const imgPrint = getImg('print');
  
  const headCSS = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
      * { box-sizing: border-box; }
      body { font-family: 'Inter', sans-serif; color: #111; margin: 40px; line-height: 1.4; font-size: 11px; }
      .doc-header { border: 1.5px solid #000; width: 100%; margin-bottom: 25px; table-layout: fixed; border-collapse: collapse; }
      .doc-header td { border: 1.5px solid #000; padding: 12px; vertical-align: middle; }
      .doc-header h2 { margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
      .doc-header p { margin: 3px 0 0; font-size: 9px; font-weight: 600; color: #444; text-transform: uppercase; }
      .srv-card-formal { border: 1px solid #000; width: 100%; margin-bottom: 20px; border-collapse: collapse; }
      .srv-card-formal td { border: 1px solid #000; padding: 10px; font-size: 10px; }
      .label { font-weight: 700; color: #444; text-transform: uppercase; font-size: 8.5px; display: block; }
      .value { font-size: 11px; font-weight: 600; }
      .box-saldos { display: flex; border: 1px solid #000; margin-bottom: 25px; }
      .saldo-item { flex: 1; padding: 15px; text-align: center; border-right: 1px solid #000; }
      .saldo-item:last-child { border-right: none; }
      .saldo-item span { display: block; font-size: 9px; margin-bottom: 5px; font-weight: 700; color: #444; }
      .saldo-item strong { font-size: 20px; color: #000; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
      th, td { border: 1px solid #000; padding: 8px; text-align: left; }
      th { background-color: #f0f0f0; font-weight: 700; font-size: 9.5px; text-transform: uppercase; }
      .sig-area { margin-top: 60px; display: flex; justify-content: space-around; gap: 40px; page-break-inside: avoid; }
      .sig-box { flex: 1; text-align: center; }
      .sig-line { border-top: 1.2px solid #000; margin-bottom: 8px; margin-top: 45px; }
      .sig-label { font-weight: 700; font-size: 10px; text-transform: uppercase; }
      .sig-sub { font-size: 9px; color: #444; font-weight: 600; }
      .footer-print { position: fixed; bottom: 30px; left: 40px; right: 40px; border-top: 1.5px solid #000; padding-top: 10px; font-size: 9.5px; font-weight: 600; color: #000; display: flex; justify-content: space-between; text-transform: uppercase; }
      @media print { @page { size: A4 portrait; margin: 1cm; } body { margin: 0; } }
    </style>
  `;

  const saldoFolgasTotal = folgas.reduce((acc, f) => acc + (f.tipo === 'credito' ? f.qtd : -f.qtd), 0);
  const htmlSaldos = `
    <div class="box-saldos">
      <div class="saldo-item"><span>SALDO DE FOLGAS</span><strong>${saldoFolgasTotal > 0 ? '+' : ''}${saldoFolgasTotal} dia(s)</strong></div>
      <div class="saldo-item"><span>FÉRIAS REGULAMENTARES</span><strong>${srv.feriasReg || 0} períodos</strong></div>
      <div class="saldo-item"><span>FÉRIAS PRÊMIO</span><strong>${srv.feriasPrem || 0} períodos</strong></div>
    </div>
  `;

  const htmlTabelaFolgas = folgas.length ? `
    <div style="font-weight: 700; font-size: 10px; border-bottom: 1.5px solid #000; padding-bottom: 5px; margin-bottom: 10px; text-transform: uppercase;">Detalhamento Detalhado de Movimentações</div>
    <table>
      <thead><tr><th style="width: 80px;">Data</th><th style="width: 80px;">Tipo</th><th style="width: 60px;">Qtd.</th><th>Histórico / Justificativa</th></tr></thead>
      <tbody>
        ${folgas.map(f => `
          <tr>
            <td style="text-align:center">${fmtDate(f.data)}</td>
            <td style="text-align:center">${f.tipo === 'credito' ? 'CRÉDITO' : 'USUFRUTO'}</td>
            <td style="font-weight: 700; text-align:center;">${f.tipo === 'credito' ? '+' : '-'}${f.qtd}</td>
            <td style="font-size: 10px;">
              ${f.tipo === 'credito' ? f.motivo : (() => {
                const parsed = parseFolgaObs(f.obs);
                const cobText = parsed.coberturaNome ? ` [Substituto: ${parsed.coberturaNome}]` : '';
                return (parsed.obs || '-') + cobText;
              })()}
              ${f.negativo ? ` (PAGAMENTO EM: ${f.descPagamento})` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<p style="text-align: center; color: #666; margin: 20px 0; border: 1px solid #000; padding: 20px;">Nenhum registro de folga encontrado para este servidor.</p>';

  const fullHTML = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head><meta charset="UTF-8"><title>Relatório Individual</title>${headCSS}</head>
    <body onload="window.print()">
      <table class="doc-header">
        <tr>
          <td style="width: 25%; text-align: center; height: 110px;">
            ${imgPrint ? `<img src="${imgPrint}" style="max-height: 100px; max-width: 100%; object-fit: contain; display: block; margin: 0 auto;">` : '<div style="font-weight: 800; font-size: 18px;">RECURSOS HUMANOS</div>'}
          </td>
          <td style="width: 55%; text-align: center;">
            <div style="font-size: 9px; margin-bottom: 3px; font-weight: 600; color: #444;">COORDENAÇÃO DA ATENÇÃO PRIMÁRIA À SAÚDE</div>
            <h2 style="margin:0; font-size:14px;">FICHA TÉCNICA INDIVIDUAL</h2>
            <p style="margin:3px 0 0; font-size:9px;">Extrato Detalhado de Saldos e Movimentações</p>
          </td>
          <td style="width: 20%; font-size: 8.5px; line-height: 1.5; background: #fafafa;">
            <strong>ASSUNTO:</strong> ${tipo === 'folgas' ? 'BANCO DE FOLGAS' : 'SALDOS GERAIS'}<br>
            <strong>EMISSÃO:</strong> ${hoje.toLocaleDateString('pt-BR')} ${hoje.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}<br>
            <strong>MATRÍCULA:</strong> ${srv.matricula}
          </td>
        </tr>
      </table>
      <table class="srv-card-formal">
        <tr><td colspan="2"><span class="label">NOME COMPLETO</span><div class="value">${srv.nome}</div></td><td><span class="label">MATRÍCULA</span><div class="value">${srv.matricula}</div></td></tr>
        <tr><td><span class="label">SETOR / LOTAÇÃO</span><div class="value">${srv.setor || '-'}</div></td><td><span class="label">CARGO / FUNÇÃO</span><div class="value">${srv.cargo || '-'}</div></td><td><span class="label">DATA ADMISSÃO</span><div class="value">${fmtDate(srv.admissao)}</div></td></tr>
      </table>
      ${tipo === 'completo' ? htmlSaldos : ''}
      ${htmlTabelaFolgas}
      <div style="font-size: 9px; border: 1px solid #000; padding: 12px; margin-top: 20px; line-height: 1.6;">
        <strong>DECLARAÇÃO:</strong> Declaro que as informações acima são extratos fiéis dos registros constantes no sistema de gestão.
      </div>
      <div class="sig-area">
        <div class="sig-box"><div class="sig-line"></div><div class="sig-label">${srv.nome}</div><div class="sig-sub">Servidor(a) - Mat. ${srv.matricula}</div></div>
        <div class="sig-box"><div class="sig-line"></div><div class="sig-label">${esc(DB.config().coordenadorAPS || 'Ruan Pablo Ferreira dos Santos')}</div><div class="sig-sub">Coordenador da Atenção Primária à Saúde</div></div>
      </div>
      <div class="footer-print">
        <span>© ${hoje.getFullYear()} - COORDENAÇÃO DA ATENÇÃO PRIMÁRIA À SAÚDE</span>
        <span>Página 1 de 1</span>
      </div>
    </body>
    </html>
  `;
  win.document.write(fullHTML);
  win.document.close();
}

function imprimirComprovanteFolga(folgaId) {
  const folga = DB.folgas().find(f => f.id === folgaId);
  if (!folga) return;
  const srv = DB.servidores().find(s => s.id === folga.srvId);
  if (!srv) return;

  const parsed = parseFolgaObs(folga.obs);
  const rowSubstituto = parsed.coberturaNome ? `<div class="data-row"><span class="label">Substituto (Cobertura):</span><span class="value" style="color: #6366f1;">👥 ${parsed.coberturaNome}</span></div>` : '';

  const win = window.open('', '_blank');
  const hoje = new Date();
  const imgPrint = getImg('print');

  const fullHTML = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Comprovante de Usufruto de Folga</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; margin: 0; padding: 40px; color: #111; line-height: 1.5; font-size: 12px; }
        .receipt-container { border: 2px solid #000; padding: 30px; max-width: 800px; margin: 0 auto; position: relative; }
        .header-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; border-bottom: 2px solid #000; }
        .header-table td { padding: 15px; vertical-align: middle; }
        .title-box { text-align: center; }
        .data-section { margin: 30px 0; }
        .data-row { display: flex; margin-bottom: 15px; border-bottom: 1px dashed #ccc; padding-bottom: 5px; }
        .label { font-weight: 700; width: 140px; text-transform: uppercase; font-size: 10px; color: #444; }
        .value { font-weight: 600; font-size: 14px; }
        .declaration { background: #f9f9f9; border: 1.5px solid #000; padding: 20px; margin: 35px 0; font-style: italic; font-size: 12px; text-align: center; }
        .sig-area { margin-top: 80px; display: flex; justify-content: space-around; gap: 50px; }
        .sig-box { text-align: center; flex: 1; }
        .sig-line { border-top: 1.5px solid #000; margin-bottom: 10px; }
.sig-label { font-weight: 700; text-transform: uppercase; font-size: 10px; }
@media print { .comp-bar { display: none !important; } }
        @media print { @page { size: A4 portrait; margin: 1cm; } body { padding: 0; } .receipt-container { border: 2.5px solid #000; } }
      </style>
    </head>
    <body onload="window.print()">
      <div class="receipt-container" style="border: 2px solid #000; padding: 25px;">
        <table class="header-table">
          <tr>
            <td style="width: 25%; text-align: center; height: 100px;">
              ${imgPrint ? `<img src="${imgPrint}" style="max-height: 95px; max-width: 100%; object-fit: contain;">` : '<div style="font-weight: 800; font-size: 20px;">APS</div>'}
            </td>
            <td class="title-box">
              <div style="font-size: 10px; font-weight: 700; color: #444; letter-spacing: 1px;">COORDENAÇÃO DA ATENÇÃO PRIMÁRIA À SAÚDE</div>
              <div style="font-size: 18px; font-weight: 800; margin-top: 8px; text-decoration: underline;">COMPROVANTE DE USUFRUTO DE FOLGA</div>
            </td>
            <td style="width: 20%; text-align: right; font-size: 9px; font-weight: 600;">
              CERTIFICADO Nº<br>${folga.id.substring(0,8).toUpperCase()}
            </td>
          </tr>
        </table>

        <div class="data-section">
          <div class="data-row"><span class="label">Servidor(a):</span><span class="value">${srv.nome}</span></div>
          <div class="data-row"><span class="label">Matrícula:</span><span class="value">${srv.matricula}</span></div>
          <div class="data-row"><span class="label">Setor Atual:</span><span class="value">${srv.setor || 'NÃO INFORMADO'}</span></div>
          <div class="data-row"><span class="label">Período de Usufruto:</span><div class="value">
            ${folga.dataItems ? folga.dataItems.map(di => `<div>${fmtDate(di.data)} (${di.peso === 1 ? 'Integral' : 'Meio Período'})</div>`).join('') : fmtDate(folga.data)}
          </div></div>
          <div class="data-row"><span class="label">Total de Dias:</span><span class="value">${folga.qtd.toString().replace('.',',')} DIA(S)</span></div>
          ${rowSubstituto}
          <div class="data-row"><span class="label">Observações:</span><span class="value">${parsed.obs || '-'}</span></div>
        </div>

        ${folga.negativo ? `
        <div style="border: 1.5px solid #d32f2f; background: #fff8f8; color: #d32f2f; padding: 12px; border-radius: 4px; margin: 20px 0; font-size: 10px; font-weight: 700; text-align: center; text-transform: uppercase;">
          ⚠️ AVISO: REGISTRO REALIZADO COM SALDO DE FOLGAS NEGATIVO.<br>
          <span style="font-size: 9px; font-weight: 600;">COMPENSAÇÃO PACTUADA: ${folga.descPagamento || 'A DEFINIR'}</span>
        </div>` : ''}

        <div class="declaration">
        "Pelo presente termo, fica formalizado o usufruto de folga compensatória do servidor acima identificado, <br>
        estando devidamente autorizado pela coordenação imediata, conforme registros em sistema."
      </div>

        <div class="sig-area">
          <div class="sig-box"><div class="sig-line"></div><div class="sig-label">${srv.nome}</div><div style="font-size: 9px;">Assinatura do Servidor</div></div>
          <div class="sig-box"><div class="sig-line"></div><div class="sig-label">${esc(DB.config().coordenadorAPS || 'Ruan Pablo Ferreira dos Santos')}</div><div style="font-size: 9px;">Coordenador da Atenção Primária à Saúde</div></div>
        </div>
        
        <div style="text-align: center; margin-top: 50px; font-size: 9px; color: #444; border-top: 1px solid #eee; padding-top: 10px;">
          Documento emitido eletronicamente em ${hoje.toLocaleDateString('pt-BR')} às ${hoje.toLocaleTimeString('pt-BR')}
        </div>
      </div>
    </body>
    </html>
  `;
  win.document.write(fullHTML);
  win.document.close();
}

function imprimirRelatorioBancoHoras() {
  const srvId = document.getElementById('bh-hist-srv')?.value;
  if (!srvId) {
    return toastMsg('Selecione um servidor específico para imprimir o relatório individual!', 'error');
  }

  const srv = DB.servidores().find(s => s.id === srvId);
  if (!srv) return toastMsg('Servidor não encontrado!', 'error');

  const win = window.open('', '_blank');
  const hoje = new Date();
  const imgPrint = getImg('print');
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  const registros = DB.bancoHoras().filter(r => r.srvId === srvId)
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes);

  let saldoAnterior = 0;
  let linhasTabela = '';

  registros.forEach((r, i) => {
    const totalDisp = saldoAnterior + (r.horasGeradas || 0);
    const saldoRem = totalDisp - (r.horasPagas || 0);
    linhasTabela += `<tr>
      <td style="text-align:center">${meses[r.mes] || '?'}/${r.ano}</td>
      <td style="text-align:center">${saldoAnterior.toFixed(1)}h</td>
      <td style="text-align:center">${(r.horasGeradas || 0).toFixed(1)}h</td>
      <td style="text-align:center;font-weight:700">${totalDisp.toFixed(1)}h</td>
      <td style="text-align:center;color:${(r.horasPagas || 0) > 0 ? '#16a34a' : '#666'}">${(r.horasPagas || 0).toFixed(1)}h</td>
      <td style="text-align:center;font-weight:700;color:${saldoRem >= 0 ? '#16a34a' : '#dc2626'}">${saldoRem.toFixed(1)}h</td>
      <td style="font-size:9px">${r.autorizadoPor || '-'}</td>
      <td style="font-size:9px">${r.obs || '-'}</td>
    </tr>`;
    saldoAnterior = saldoRem;
  });

  const saldoFinal = registros.length > 0
    ? registros.reduce((acc, r) => acc + (r.horasGeradas || 0) - (r.horasPagas || 0), 0)
    : 0;

  const headCSS = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
      * { box-sizing: border-box; }
      body { font-family: 'Inter', sans-serif; color: #111; margin: 40px; line-height: 1.4; font-size: 11px; }
      .doc-header { border: 1.5px solid #000; width: 100%; margin-bottom: 25px; table-layout: fixed; border-collapse: collapse; }
      .doc-header td { border: 1.5px solid #000; padding: 12px; vertical-align: middle; }
      .doc-header h2 { margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
      .doc-header p { margin: 3px 0 0; font-size: 9px; font-weight: 600; color: #444; text-transform: uppercase; }
      .srv-card-formal { border: 1px solid #000; width: 100%; margin-bottom: 20px; border-collapse: collapse; }
      .srv-card-formal td { border: 1px solid #000; padding: 10px; font-size: 10px; }
      .label { font-weight: 700; color: #444; text-transform: uppercase; font-size: 8.5px; display: block; }
      .value { font-size: 11px; font-weight: 600; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
      th, td { border: 1px solid #000; padding: 8px; text-align: left; }
      th { background-color: #f0f0f0; font-weight: 700; font-size: 9.5px; text-transform: uppercase; }
      .sig-area { margin-top: 60px; display: flex; justify-content: space-around; gap: 40px; page-break-inside: avoid; }
      .sig-box { flex: 1; text-align: center; }
      .sig-line { border-top: 1.2px solid #000; margin-bottom: 8px; margin-top: 45px; }
      .sig-label { font-weight: 700; font-size: 10px; text-transform: uppercase; }
      .sig-sub { font-size: 9px; color: #444; font-weight: 600; }
      .footer-print { position: fixed; bottom: 30px; left: 40px; right: 40px; border-top: 1.5px solid #000; padding-top: 10px; font-size: 9.5px; font-weight: 600; color: #000; display: flex; justify-content: space-between; text-transform: uppercase; }
      @media print { @page { size: A4 portrait; margin: 1cm; } body { margin: 0; } }
    </style>
  `;

  const htmlTabela = registros.length ? `
    <table>
      <thead><tr>
        <th>Mês/Ano</th>
        <th>Saldo Anterior</th>
        <th>Horas Geradas</th>
        <th>Total Disponível</th>
        <th>Horas Pagas</th>
        <th>Saldo Remanescente</th>
        <th>Autorizado Por</th>
        <th>Observações</th>
      </tr></thead>
      <tbody>
        ${linhasTabela}
        <tr style="font-weight:800;background:#f0fdf4">
          <td colspan="2" style="text-align:right;text-transform:uppercase;font-size:9px">Saldo Final</td>
          <td style="text-align:center;font-weight:800">${saldoFinal >= 0 ? '+' : ''}${saldoFinal.toFixed(1)}h</td>
          <td colspan="5"></td>
        </tr>
      </tbody>
    </table>
  ` : '<p style="text-align: center; color: #666; margin: 20px 0; border: 1px solid #000; padding: 20px;">Nenhum registro de banco de horas encontrado para este servidor.</p>';

  const fullHTML = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head><meta charset="UTF-8"><title>Relatório Banco de Horas</title>${headCSS}</head>
    <body onload="window.print()">
      <table class="doc-header">
        <tr>
          <td style="width: 22%; text-align: center; height: 110px;">
            ${imgPrint ? `<img src="${imgPrint}" style="max-height: 100px; max-width: 100%; object-fit: contain; display: block; margin: 0 auto;">` : '<div style="font-weight: 800; font-size: 18px;">RECURSOS HUMANOS</div>'}
          </td>
          <td style="width: 56%; text-align: center;">
            <div style="font-size: 9px; margin-bottom: 3px; font-weight: 600; color: #444;">${DB.config().nomeOrganizacao || 'COORDENAÇÃO DA ATENÇÃO PRIMÁRIA À SAÚDE'}</div>
            <h2 style="margin:0; font-size:14px;">RELATÓRIO DE BANCO DE HORAS</h2>
            <p style="margin:3px 0 0; font-size:9px;">Controle de Horas Sem Pagas</p>
            <p style="margin:3px 0 0; font-size:8px; font-weight:700; color:#c00;">* Horas já acrescidas de 50% (horas extras)</p>
          </td>
          <td style="width: 22%; font-size: 8.5px; line-height: 1.5; background: #fafafa;">
            <strong>EMISSÃO:</strong> ${hoje.toLocaleDateString('pt-BR')} ${hoje.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}<br>
            <strong>MATRÍCULA:</strong> ${srv.matricula}
          </td>
        </tr>
      </table>
      <table class="srv-card-formal">
        <tr><td colspan="2"><span class="label">NOME COMPLETO</span><div class="value">${srv.nome}</div></td><td><span class="label">MATRÍCULA</span><div class="value">${srv.matricula}</div></td></tr>
        <tr><td><span class="label">SETOR / LOTAÇÃO</span><div class="value">${srv.setor || '-'}</div></td><td><span class="label">CARGO / FUNÇÃO</span><div class="value">${srv.cargo || '-'}</div></td><td><span class="label">DATA ADMISSÃO</span><div class="value">${fmtDate(srv.admissao)}</div></td></tr>
      </table>
      ${htmlTabela}
      <div style="font-size: 9px; border: 1px solid #000; padding: 12px; margin-top: 20px; line-height: 1.6;">
        <strong>DECLARAÇÃO:</strong> Declaro que as informações acima são extratos fiéis dos registros constantes no sistema de gestão de banco de horas.
      </div>
      <div style="font-size: 9px; border: 1px solid #000; padding: 12px; margin-top: 12px; line-height: 1.6;">
        <strong>TERMO DE RECEBIMENTO:</strong> Declaro para os devidos fins que <strong>RECEBI</strong> os impressos originais do Banco de Horas (horas extras sem pagas) do servidor(a) <strong>${srv.nome}</strong>, Mat. <strong>${srv.matricula}</strong>, referentes às movimentações até o presente momento, para conferência e providências cabíveis.
      </div>
      <div style="display:flex;flex-direction:column;gap:160px;margin-top:50px;page-break-inside:avoid">
        <div style="display:flex;justify-content:space-between;gap:40px">
          <div style="flex:1;text-align:center">
            <div style="border-top:1.2px solid #000;margin-bottom:8px;"></div>
            <div style="font-weight:700;font-size:10px;text-transform:uppercase">${DB.config().coordenadorAPS || 'Responsável pelo Controle'}</div>
            <div style="font-size:9px;color:#444;font-weight:600">Coordenador(a) da APS</div>
          </div>
          <div style="flex:1;text-align:center">
            <div style="border-top:1.2px solid #000;margin-bottom:8px;"></div>
            <div style="font-weight:700;font-size:10px;text-transform:uppercase">Coordenador(a) do RH</div>
            <div style="font-size:9px;color:#444;font-weight:600">Termo de Recebimento / Carimbo e Assinatura</div>
          </div>
        </div>
        <div style="display:flex;justify-content:center;gap:40px">
          <div style="flex:1;text-align:center">
            <div style="border-top:1.2px solid #000;margin-bottom:8px;"></div>
            <div style="font-weight:700;font-size:10px;text-transform:uppercase">Secretário(a) de Saúde</div>
            <div style="font-size:9px;color:#444;font-weight:600">Carimbo e Assinatura</div>
          </div>
          <div style="flex:1;text-align:center">
            <div style="border-top:1.2px solid #000;margin-bottom:8px;"></div>
            <div style="font-weight:700;font-size:10px;text-transform:uppercase">Entregue ao RH em</div>
            <div style="font-size:14px;color:#444;font-weight:700;letter-spacing:4px;margin-top:6px">_____ / _____ / _________</div>
          </div>
        </div>
      </div>
      <div class="footer-print">
        <span>© ${hoje.getFullYear()} - ${DB.config().nomeOrganizacao || 'COORDENAÇÃO DA ATENÇÃO PRIMÁRIA À SAÚDE'}</span>
        <span>Página 1 de 1</span>
      </div>
      ${getAssinaturaCoordenador()}
    </body>
    </html>
  `;
  win.document.write(fullHTML);
  win.document.close();
}

function imprimirRelatorioBancoHorasGeral() {
  const win = window.open('', '_blank');
  const hoje = new Date();
  const imgPrint = getImg('print');
  const servidores = getServidoresAcessiveis().filter(s => s.id && DB.bancoHoras().some(b => b.srvId === s.id));

  if (!servidores.length) {
    return toastMsg('Nenhum servidor com registros de banco de horas encontrado!', 'error');
  }

  const headCSS = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
      * { box-sizing: border-box; }
      body { font-family: 'Inter', sans-serif; color: #111; margin: 40px; line-height: 1.4; font-size: 11px; }
      .doc-header { border: 1.5px solid #000; width: 100%; margin-bottom: 25px; table-layout: fixed; border-collapse: collapse; }
      .doc-header td { border: 1.5px solid #000; padding: 12px; vertical-align: middle; }
      .doc-header h2 { margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
      .doc-header p { margin: 3px 0 0; font-size: 9px; font-weight: 600; color: #444; text-transform: uppercase; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
      th, td { border: 1px solid #000; padding: 8px; text-align: left; }
      th { background-color: #f0f0f0; font-weight: 700; font-size: 9.5px; text-transform: uppercase; }
      .sig-area { margin-top: 60px; display: flex; justify-content: space-around; gap: 40px; page-break-inside: avoid; }
      .sig-box { flex: 1; text-align: center; }
      .sig-line { border-top: 1.2px solid #000; margin-bottom: 8px; margin-top: 45px; }
      .sig-label { font-weight: 700; font-size: 10px; text-transform: uppercase; }
      .sig-sub { font-size: 9px; color: #444; font-weight: 600; }
      .footer-print { position: fixed; bottom: 30px; left: 40px; right: 40px; border-top: 1.5px solid #000; padding-top: 10px; font-size: 9.5px; font-weight: 600; color: #000; display: flex; justify-content: space-between; text-transform: uppercase; }
      @media print { @page { size: A4 landscape; margin: 1cm; } body { margin: 0; } }
    </style>
  `;

  let linhas = '';
  servidores.sort((a, b) => (a.setor || '').localeCompare(b.setor || '') || a.nome.localeCompare(b.nome));

  servidores.forEach(srv => {
    const registros = DB.bancoHoras().filter(r => r.srvId === srv.id);
    let totalGeradas = 0, totalPagas = 0, saldo = 0;
    registros.forEach(r => {
      totalGeradas += r.horasGeradas || 0;
      totalPagas += r.horasPagas || 0;
    });
    saldo = totalGeradas - totalPagas;
    linhas += `<tr>
      <td>${srv.nome}</td>
      <td>${srv.matricula}</td>
      <td>${srv.setor || '-'}</td>
      <td style="text-align:center">${totalGeradas.toFixed(1)}h</td>
      <td style="text-align:center">${totalPagas.toFixed(1)}h</td>
      <td style="text-align:center;font-weight:700;color:${saldo >= 0 ? '#16a34a' : '#dc2626'}">${saldo >= 0 ? '+' : ''}${saldo.toFixed(1)}h</td>
    </tr>`;
  });

  const totalGeral = servidores.reduce((acc, s) => {
    const registros = DB.bancoHoras().filter(r => r.srvId === s.id);
    return acc + registros.reduce((a, r) => a + (r.horasGeradas || 0) - (r.horasPagas || 0), 0);
  }, 0);

  const htmlTabela = `
    <table>
      <thead><tr>
        <th>Servidor</th>
        <th>Matrícula</th>
        <th>Setor</th>
        <th>Total Horas Geradas</th>
        <th>Total Horas Pagas</th>
        <th>Saldo Remanescente</th>
      </tr></thead>
      <tbody>
        ${linhas}
        <tr style="font-weight:800;background:#f0fdf4">
          <td colspan="3" style="text-align:right;text-transform:uppercase;font-size:9px">Saldo Geral</td>
          <td colspan="3" style="text-align:center;font-weight:800">${totalGeral >= 0 ? '+' : ''}${totalGeral.toFixed(1)}h</td>
        </tr>
      </tbody>
    </table>
  `;

  const fullHTML = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head><meta charset="UTF-8"><title>Relatório Geral Banco de Horas</title>${headCSS}</head>
    <body onload="window.print()">
      <table class="doc-header">
        <tr>
          <td style="width: 20%; text-align: center; height: 100px;">
            ${imgPrint ? `<img src="${imgPrint}" style="max-height: 90px; max-width: 100%; object-fit: contain; display: block; margin: 0 auto;">` : '<div style="font-weight: 800; font-size: 18px;">RECURSOS HUMANOS</div>'}
          </td>
          <td style="width: 60%; text-align: center;">
            <div style="font-size: 9px; margin-bottom: 3px; font-weight: 600; color: #444;">${DB.config().nomeOrganizacao || 'COORDENAÇÃO DA ATENÇÃO PRIMÁRIA À SAÚDE'}</div>
            <h2 style="margin:0; font-size:14px;">RELATÓRIO GERAL DE BANCO DE HORAS</h2>
            <p style="margin:3px 0 0; font-size:9px;">Consolidado de Horas Sem Pagas</p>
            <p style="margin:3px 0 0; font-size:8px; font-weight:700; color:#c00;">* Horas já acrescidas de 50% (horas extras)</p>
          </td>
          <td style="width: 20%; font-size: 8.5px; line-height: 1.5; background: #fafafa;">
            <strong>EMISSÃO:</strong> ${hoje.toLocaleDateString('pt-BR')} ${hoje.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}<br>
            <strong>QTD SERVIDORES:</strong> ${servidores.length}
          </td>
        </tr>
      </table>
      ${htmlTabela}
      <div style="font-size: 9px; border: 1px solid #000; padding: 12px; margin-top: 20px; line-height: 1.6;">
        <strong>DECLARAÇÃO:</strong> Declaro que as informações acima são extratos fiéis dos registros constantes no sistema de gestão de banco de horas.
      </div>
      <div class="sig-area">
        <div class="sig-box"><div class="sig-line"></div><div class="sig-label">${DB.config().coordenadorAPS || 'Responsável pelo Controle'}</div><div class="sig-sub">Coordenador(a) da APS</div></div>
        <div class="sig-box">
          <div class="sig-line"></div>
          <div class="sig-label">Entregue ao RH em</div>
          <div class="sig-sub" style="font-size:14px;font-weight:700;letter-spacing:4px;margin-top:6px">_____ / _____ / _________</div>
        </div>
        <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Coordenador(a) do RH</div><div class="sig-sub">Carimbo e Assinatura</div></div>
      </div>
      <div class="footer-print">
        <span>© ${hoje.getFullYear()} - ${DB.config().nomeOrganizacao || 'COORDENAÇÃO DA ATENÇÃO PRIMÁRIA À SAÚDE'}</span>
        <span>Página 1 de 1</span>
      </div>
      ${getAssinaturaCoordenador()}
    </body>
    </html>
  `;
  win.document.write(fullHTML);
  win.document.close();
}

function exportarCSV(tipo) {
  const servidores   = getServidoresAcessiveis();
  const programacoes = getProgramacoesAcessiveis();
  const folgas       = getFolgasAcessiveis();
  const hoje         = new Date();
  const dataStr      = hoje.toLocaleDateString('pt-BR').replace(/\//g,'-');

  let csv = '\uFEFF'; // BOM para acentos no Excel
  let nomeArquivo = '';

  if (tipo === 'servidores') {
    nomeArquivo = `Servidores_${dataStr}.csv`;
    csv += 'Matrícula;Nome;Nascimento;Admissão;Setor;Cargo;CPF;PIS;Férias Reg.;Férias Prêmio\n';
    servidores.sort((a,b) => a.nome.localeCompare(b.nome)).forEach(s => {
      csv += [
        s.matricula, s.nome, fmtDate(s.nascimento), fmtDate(s.admissao),
        s.setor || '', s.cargo || '', s.cpf || '', s.pis || '',
        s.feriasReg || 0, s.feriasPrem || 0
      ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(';') + '\n';
    });

  } else if (tipo === 'ferias') {
    nomeArquivo = `Ferias_${dataStr}.csv`;
    const filtTipo  = document.getElementById('filtro-tipo-rel')?.value || '';
    const filtSetor = document.getElementById('filtro-setor-rel')?.value || '';
    csv += 'Servidor;Matrícula;Setor;Tipo;Início;Retorno;Período Ref.;Observações\n';
    programacoes
      .filter(p => {
        const srv = servidores.find(s => s.id === p.srvId);
        if (!srv) return false;
        return (!filtTipo || p.tipo === filtTipo) && (!filtSetor || srv.setor === filtSetor);
      })
      .sort((a,b) => new Date(a.inicio) - new Date(b.inicio))
      .forEach(p => {
        const srv = servidores.find(s => s.id === p.srvId);
        csv += [
          srv?.nome || '', srv?.matricula || '', srv?.setor || '',
          p.tipo === 'anual' ? 'Férias Anuais' : 'Férias Prêmio',
          fmtDate(p.inicio), fmtDate(p.retorno),
          p.periodo || '', p.obs || ''
        ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(';') + '\n';
      });

  } else if (tipo === 'folgas') {
    nomeArquivo = `Folgas_${dataStr}.csv`;
    csv += 'Servidor;Matrícula;Setor;Data;Tipo;Quantidade;Motivo/Justificativa\n';
    folgas.sort((a,b) => new Date(a.data) - new Date(b.data)).forEach(f => {
      const srv = servidores.find(s => s.id === f.srvId);
      csv += [
        srv?.nome || '', srv?.matricula || '', srv?.setor || '',
        fmtDate(f.data),
        f.tipo === 'credito' ? 'Crédito' : 'Gozo/Usufruto',
        f.qtd,
        f.tipo === 'credito' ? (f.motivo || '') : (f.obs || '')
      ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(';') + '\n';
    });
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
  toastMsg(`✅ ${nomeArquivo} exportado com sucesso!`, 'success');
}

function imprimirMapaAusencias() {
  const dataInicio = document.getElementById('ma-print-inicio').value;
  const dataFim = document.getElementById('ma-print-fim').value;
  const setoresSel = Array.from(document.querySelectorAll('#ma-print-setores input[type=checkbox]:checked')).map(cb => cb.value);
  if (!dataInicio || !dataFim) { toastMsg('Selecione o período.', 'warning'); return; }

  const servidores = getServidoresAcessiveis();
  const programacoes = getProgramacoesAcessiveis();
  const folgas = getFolgasAcessiveis();
  const imgPrint = getImg('print') || getImg('esq');
  const cfg = DB.config();
  const orgNome = cfg.nomeOrganizacao || 'Coordenação da Atenção Primária à Saúde';

  let inicio = new Date(dataInicio + 'T00:00:00');
  let fim = new Date(dataFim + 'T00:00:00');
  const dias = [];
  for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
    dias.push(new Date(d));
  }

  const servidoresSetor = setoresSel.length ? servidores.filter(s => setoresSel.includes(s.setor)) : servidores;
  const setoresLista = setoresSel.length ? setoresSel : [...new Set(servidores.map(s => s.setor).filter(Boolean))].sort();
  const rotuloSetores = setoresSel.length ? setoresSel.join(', ') : 'Todos os Setores';

  let html = `
  <html><head><title>Mapa de Ausências - ${rotuloSetores}</title>
  <style>
    @page { margin: 10mm 8mm; size: landscape; }
    body { font-family: Arial, sans-serif; color: #222; font-size: 11px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .logo-area { text-align: center; margin-bottom: 8px; }
    .logo-area img { max-height: 60px; object-fit: contain; }
    h1 { text-align: center; font-size: 18px; margin-bottom: 4px; }
    .subtitle { text-align: center; color: #555; font-size: 12px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { background: #1a3a5c; color: #fff; padding: 5px 4px; text-align: center; font-size: 9px; text-transform: uppercase; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    td { padding: 4px; border: 1px solid #ccc; text-align: center; font-size: 9px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .setor-label { text-align: left; font-weight: 700; background: #f5f5f5; font-size: 10px; white-space: nowrap; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .weekend { background: #fafafa; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sig-area { text-align: center; margin-top: 30px; }
    .sig-item { display: inline-block; margin: 0 30px; text-align: center; }
    .sig-line { width: 200px; border-top: 1.5px solid #000; margin: 0 auto 5px; }
    .sig-nome { font-weight: 700; font-size: 11px; }
    .sig-cargo { font-size: 9px; color: #555; }
    .legenda { margin: 8px 0; font-size: 9px; display: flex; gap: 10px; justify-content: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .leg-item { display: inline-flex; align-items: center; gap: 3px; }
    .leg-cor { width: 12px; height: 12px; border: 1px solid #ccc; display: inline-block; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @media print { body { padding: 0; } }
  </style></head><body>
    ${imgPrint ? `<div class="logo-area"><img src="${imgPrint}"></div>` : ''}
    <h1>Mapa de Ausências</h1>
    <div class="subtitle">${esc(orgNome)} — ${esc(rotuloSetores)} — ${dias[0].toLocaleDateString('pt-BR')} a ${dias[dias.length-1].toLocaleDateString('pt-BR')}</div>

    <div class="legenda">
      <span class="leg-item"><span class="leg-cor" style="background:rgba(77,123,255,0.4)"></span> Férias</span>
      <span class="leg-item"><span class="leg-cor" style="background:rgba(15,212,136,0.4)"></span> Folgas</span>
    </div>

    <table>
      <thead><tr><th style="text-align:left;min-width:100px">Setor</th>${dias.map(d => `<th${d.getDay()===0||d.getDay()===6?' class="weekend"':''}>${d.getDate()}/${d.getMonth()+1}</th>`).join('')}</tr></thead>
      <tbody>`;

  setoresLista.forEach(s => {
    html += '<tr>';
    html += `<td class="setor-label">${esc(s)}</td>`;
    dias.forEach(dia => {
      const diaISO = dia.toISOString().split('T')[0];
      const nomes = listarAusentes(dia, diaISO, servidores, programacoes, folgas, s, '');
      const diaSem = dia.getDay();
      if (nomes.length > 0) {
        const nomesHtml = nomes.map(n => `${esc(n.nome)}${n.cargo ? ' - '+esc(n.cargo) : ''} (${n.tipo === 'Folga' ? 'Folga' : n.tipo === 'Prêmio' ? 'Prêmio' : 'Férias'})`).join('<br>');
        html += `<td class="${diaSem===0||diaSem===6?' weekend':''}" style="text-align:left;font-size:8.5px;line-height:1.3;padding:3px 4px">${nomesHtml}</td>`;
      } else {
        html += `<td class="${diaSem===0||diaSem===6?' weekend':''}">-</td>`;
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table>';

  // Signatures
  if (_maGestoresList.length) {
    html += '<div class="sig-area">';
    _maGestoresList.forEach(g => {
      html += `<div class="sig-item"><div class="sig-line"></div><div class="sig-nome">${esc(g.nome)}</div><div class="sig-cargo">${esc(g.cargo)}</div></div>`;
    });
    html += '</div>';
  }

  html += getAssinaturaCoordenador();

  html += `
    <script>window.onload=function(){window.print();}<\/script>
  </body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

function exportarRelatorioMensalPDF() {
  const mes = parseInt(document.getElementById('rel-mes-pdf')?.value);
  const ano = parseInt(document.getElementById('rel-ano-pdf')?.value);
  if (isNaN(mes) || isNaN(ano)) return toastMsg('Selecione o mês e ano!', 'error');

  const servidores = getServidoresAcessiveis();
  const programacoes = getProgramacoesAcessiveis().filter(p => !p.concluido);
  const folgas = getFolgasAcessiveis().filter(f => f.tipo === 'debito');
  const hoje = new Date();

  const mesesNomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const mesNome = mesesNomes[mes];

  // Construir lista de dias úteis do mês (para métricas)
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();

  // Para cada servidor, coletar ausências no mês
  const ausencias = [];
  servidores.forEach(srv => {
    const ausenciasSrv = [];

    // Programações que cobrem este mês
    programacoes.filter(p => p.srvId === srv.id).forEach(p => {
      const pInicio = new Date(p.inicio + 'T12:00:00');
      const pFim = new Date((p.retorno || p.fim) + 'T12:00:00');
      const mesInicio = new Date(ano, mes, 1);
      const mesFim = new Date(ano, mes + 1, 0);
      if (pInicio <= mesFim && pFim >= mesInicio) {
        const inicioRel = pInicio < mesInicio ? mesInicio : pInicio;
        const fimRel = pFim > mesFim ? mesFim : pFim;
        const dias = Math.round((fimRel - inicioRel) / 86400000) + 1;
        const tipoLabel = p.tipo === 'anual' ? 'Férias Anuais' : 'Férias Prêmio';
        const periodo = `${fmtDate(p.inicio)} a ${fmtDate(p.retorno || p.fim)}`;
        ausenciasSrv.push({ tipo: tipoLabel, periodo, dias, dataInicio: p.inicio });
      }
    });

    // Folgas no mês
    folgas.filter(f => f.srvId === srv.id).forEach(f => {
      const datas = f.dataItems && Array.isArray(f.dataItems)
        ? f.dataItems.map(di => di.data)
        : f.data ? f.data.split(',').map(d => d.trim()) : [];
      const diasNoMesFolga = datas.filter(d => {
        const dt = new Date(d + 'T12:00:00');
        return dt.getMonth() === mes && dt.getFullYear() === ano;
      });
      if (diasNoMesFolga.length > 0) {
        ausenciasSrv.push({
          tipo: 'Folga',
          periodo: diasNoMesFolga.map(d => fmtDate(d)).join(', '),
          dias: diasNoMesFolga.length,
          dataInicio: diasNoMesFolga[0]
        });
      }
    });

    if (ausenciasSrv.length > 0) {
      ausenciasSrv.sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));
      ausencias.push({ servidor: srv, ausencias: ausenciasSrv, totalDias: ausenciasSrv.reduce((s, a) => s + a.dias, 0) });
    }
  });

  // Agrupar por setor
  const setores = {};
  ausencias.forEach(a => {
    const setor = a.servidor.setor || 'Não Informado';
    if (!setores[setor]) setores[setor] = [];
    setores[setor].push(a);
  });

  // Total de servidores por setor
  const servidoresPorSetor = {};
  servidores.forEach(s => {
    const setor = s.setor || 'Não Informado';
    servidoresPorSetor[setor] = (servidoresPorSetor[setor] || 0) + 1;
  });

  const setoresOrdenados = Object.keys(setores).sort();

  const win = window.open('', '_blank');
  const imgPrint = getImg('print');

  const headCSS = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: 'Inter', sans-serif; color: #111; margin: 30px 36px;
        line-height: 1.45; font-size: 10px;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      .doc-header { border: 2px solid #000; width: 100%; margin-bottom: 20px; border-collapse: collapse; }
      .doc-header td { border: 1.5px solid #000; padding: 10px 14px; vertical-align: middle; }
      .doc-header .cell-logo { width: 22%; text-align: center; }
      .doc-header .cell-title { width: 56%; text-align: center; }
      .doc-header .cell-meta { width: 22%; font-size: 8px; line-height: 1.6; background: #f7f7f7; }
      .doc-header h2 { margin: 4px 0 2px; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
      .doc-header .subtitle { font-size: 8.5px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
      .doc-header .org-name { font-size: 8px; margin-bottom: 4px; font-weight: 700; color: #333; text-transform: uppercase; letter-spacing: 1px; }
      .doc-header strong { font-size: 8px; }
      .section-title-print {
        font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em;
        color: #555; border-bottom: 1.5px solid #000; padding-bottom: 4px; margin: 16px 0 8px;
      }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
      th {
        background-color: #1a1a2e; color: #fff; padding: 7px 9px;
        text-align: left; font-size: 8px; text-transform: uppercase;
        font-weight: 700; letter-spacing: 0.06em;
      }
      td { border: 1px solid #ccc; padding: 6px 9px; font-size: 9.5px; vertical-align: middle; }
      tbody tr:nth-child(even) td { background: #f7f8fc; }
      .text-center { text-align: center; }
      .bold { font-weight: 700; }
      .text-sm { font-size: 8.5px; }
      .badge-ferias { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; padding: 1px 5px; border-radius: 3px; font-size: 7.5px; font-weight: 700; }
      .badge-premio { background: #ede9fe; color: #4c1d95; border: 1px solid #c4b5fd; padding: 1px 5px; border-radius: 3px; font-size: 7.5px; font-weight: 700; }
      .badge-folga  { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; padding: 1px 5px; border-radius: 3px; font-size: 7.5px; font-weight: 700; }
      .summary-grid { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
      .summary-card {
        flex: 1; min-width: 140px; border: 1.5px solid #333; border-radius: 4px; padding: 14px;
        text-align: center; background: #fafafa;
      }
      .summary-card .num { font-size: 24px; font-weight: 800; color: #1a1a2e; }
      .summary-card .label { font-size: 8px; text-transform: uppercase; color: #666; font-weight: 700; margin-top: 4px; }
      .summary-card.warn { border-color: #f59e0b; background: #fffbeb; }
      .summary-card.danger { border-color: #ef4444; background: #fef2f2; }
      .group-block { margin-bottom: 20px; page-break-inside: avoid; border: 1.5px solid #333; border-radius: 4px; overflow: hidden; }
      .group-header {
        background: #1a1a2e; color: #fff; font-weight: 700;
        font-size: 10px; padding: 8px 12px;
        display: flex; justify-content: space-between; align-items: center;
      }
      .group-header .sub-info { font-size: 9px; font-weight: 500; color: #94a3b8; }
      .footer-print {
        position: fixed; bottom: 0; left: 0; right: 0;
        border-top: 1.5px solid #000; padding: 6px 36px;
        font-size: 8px; font-weight: 600; color: #333;
        display: flex; justify-content: space-between; align-items: center;
        background: #fff; text-transform: uppercase; letter-spacing: 0.04em;
      }
      @media print { @page { size: A4 landscape; margin: 10mm; } body { margin: 0; } }
    </style>
  `;

  // Summary cards
  const totalServidores = servidores.length;
  const totalAusentes = ausencias.length;
  const totalFolgas = ausencias.filter(a => a.ausencias.some(x => x.tipo === 'Folga')).length;
  const totalFerias = ausencias.filter(a => a.ausencias.some(x => x.tipo.includes('Férias'))).length;
  const pctAusentes = totalServidores > 0 ? Math.round(totalAusentes / totalServidores * 100) : 0;

  const summaryHTML = `
    <div class="summary-grid">
      <div class="summary-card">
        <div class="num">${totalServidores}</div>
        <div class="label">Servidores</div>
      </div>
      <div class="summary-card ${pctAusentes > 30 ? 'danger' : pctAusentes > 15 ? 'warn' : ''}">
        <div class="num">${totalAusentes}</div>
        <div class="label">Ausentes no mês (${pctAusentes}%)</div>
      </div>
      <div class="summary-card">
        <div class="num">${totalFerias}</div>
        <div class="label">Em férias</div>
      </div>
      <div class="summary-card">
        <div class="num">${totalFolgas}</div>
        <div class="label">Folgas no mês</div>
      </div>
      <div class="summary-card">
        <div class="num">${diasNoMes}</div>
        <div class="label">Dias no mês</div>
      </div>
    </div>
  `;

  // Tabela por setor
  let htmlTabela = '';
  setoresOrdenados.forEach(setor => {
    const items = setores[setor].sort((a, b) => a.servidor.nome.localeCompare(b.servidor.nome));
    const totalSetor = servidoresPorSetor[setor] || 0;
    const ausentesSetor = items.length;
    const pctSetor = totalSetor > 0 ? Math.round(ausentesSetor / totalSetor * 100) : 0;

    htmlTabela += `
      <div class="group-block">
        <div class="group-header">
          <span>📁 ${setor}</span>
          <span class="sub-info">${ausentesSetor} de ${totalSetor} servidores ausentes (${pctSetor}%)</span>
        </div>
        <table style="margin:0">
          <thead>
            <tr>
              <th style="width:40px">#</th>
              <th>Servidor</th>
              <th style="width:65px">Matrícula</th>
              <th style="width:90px">Tipo</th>
              <th>Período / Datas</th>
              <th style="width:45px;text-align:center">Dias</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, idx) => {
              const srv = item.servidor;
              return item.ausencias.map((a, aIdx) => {
                const tipoBadge = a.tipo === 'Férias Anuais' ? '<span class="badge-ferias">Férias Anuais</span>'
                  : a.tipo === 'Férias Prêmio' ? '<span class="badge-premio">Férias Prêmio</span>'
                  : '<span class="badge-folga">Folga</span>';
                const rowNome = aIdx === 0 ? `<td class="bold" rowspan="${item.ausencias.length}">${srv.nome}</td><td class="text-center text-mono" rowspan="${item.ausencias.length}">${srv.matricula}</td>` : '';
                const rowNum = aIdx === 0 ? `<td class="text-center bold" rowspan="${item.ausencias.length}">${idx + 1}</td>` : '';
                return `<tr>${rowNum}${rowNome}<td class="text-center">${tipoBadge}</td><td>${a.periodo}</td><td class="text-center bold">${a.dias}</td></tr>`;
              }).join('');
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  });

  if (!htmlTabela) {
    htmlTabela = '<div style="text-align:center;padding:40px;border:1.5px solid #333;border-radius:4px;font-size:11px;color:#666"><strong>Nenhuma ausência registrada neste mês.</strong></div>';
  }

  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório Mensal — ${mesNome} ${ano}</title>${headCSS}</head><body onload="window.print()">
    <table class="doc-header">
      <tr>
        <td class="cell-logo">
          ${imgPrint ? `<img src="${imgPrint}" style="max-height:80px;max-width:100%;object-fit:contain;display:block;margin:0 auto;">` : '<div style="font-weight:800;font-size:16px;color:#1a1a2e;">RH</div>'}
        </td>
        <td class="cell-title">
          <div class="org-name">${DB.config().nomeOrganizacao || 'Coordenação da Atenção Primária à Saúde'}</div>
          <h2>Relatório Mensal de Ausências</h2>
          <div class="subtitle">${mesNome} ${ano} — Controle de Escalas, Férias e Banco de Folgas</div>
        </td>
        <td class="cell-meta">
          <strong>DOCUMENTO:</strong> REL-MENSAL-${String(mes+1).padStart(2,'0')}${ano}<br>
          <strong>EMISSÃO:</strong> ${hoje.toLocaleDateString('pt-BR')} ${hoje.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}<br>
          <strong>SISTEMA:</strong> V.2.0-PRO
        </td>
      </tr>
    </table>
    ${summaryHTML}
    <div class="section-title-print">📋 Ausências por Setor</div>
    ${htmlTabela}
    <div class="footer-print">
      <span>© ${hoje.getFullYear()} — ${DB.config().nomeOrganizacao || 'Coordenação da Atenção Primária à Saúde'}</span>
      <span>Emitido em ${hoje.toLocaleDateString('pt-BR')} às ${hoje.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>
    </div>
    ${getAssinaturaCoordenador()}
  </body></html>`);
  win.document.close();
}

function imprimirEvento(id) {
  const e = id
    ? _eventosData.find(e => e.id === id)
    : _eventosData.find(e => e.id === document.getElementById('ev-id').value);
  if (!e) return toastMsg('Selecione um evento para imprimir.', 'warning');

  const servidores = DB.servidores();
  const srvMap = {};
  servidores.forEach(s => { srvMap[s.id] = s; });
  const veic = e.veiculoId ? _veiculosData.find(v => v.id === e.veiculoId) : null;

  const win = window.open('', '_blank');
  const imgPrint = getImg('print');
  const cfg = DB.config();
  const orgNome = cfg.nomeOrganizacao || 'Coordenação da Atenção Primária à Saúde';
  win.document.write(`
    <html><head><title>Evento: ${esc(e.nome)}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 40px; color: #222; }
      .logo-area { text-align: center; margin-bottom: 15px; }
      .logo-area img { max-height: 85px; max-width: 100%; object-fit: contain; }
      h1 { font-size: 22px; margin-bottom: 5px; }
      .header { border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px; }
      .info { margin-bottom: 20px; }
      .info td { padding: 4px 12px 4px 0; font-size: 14px; }
      .info td:first-child { font-weight: 700; color: #555; }
      table { width: 100%; border-collapse: collapse; margin: 20px 0; }
      th { background: #eee; padding: 8px 10px; text-align: left; font-size: 12px; text-transform: uppercase; }
      td { padding: 8px 10px; border-bottom: 1px solid #ddd; font-size: 13px; }
      .footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 15px; font-size: 11px; color: #888; text-align: center; }
      .tag { display:inline-block; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700; margin:1px; }
      .tag-green { background:#d4edda; color:#155724; }
      .tag-warn { background:#fff3cd; color:#856404; }
      .sig-area { text-align: center; margin-top: 60px; }
      .sig-line { width: 300px; border-top: 1.5px solid #000; margin: 0 auto 8px; }
      .sig-nome { font-weight: 700; font-size: 14px; }
      .sig-cargo { font-size: 11px; color: #555; }
      @media print { body { padding: 20px; } }
    </style></head><body>
    ${imgPrint ? `<div class="logo-area"><img src="${imgPrint}"></div>` : ''}
    <div class="header">
      <h1>📅 ${esc(e.nome)}</h1>
      <div style="color:#666;margin-top:4px">${orgNome} | ${e.data} | ${e.hrInicio} - ${e.hrFim || e.hrTermino}${e.local ? ' | '+esc(e.local) : ''}</div>
    </div>
    <table class="info">
      ${e.descricao ? `<tr><td>Descrição:</td><td>${esc(e.descricao)}</td></tr>` : ''}
      ${veic ? `<tr><td>Veículo:</td><td>🚗 ${esc(veic.nome)} ${veic.placa ? '('+esc(veic.placa)+')' : ''} ${veic.modelo ? '- '+esc(veic.modelo) : ''}</td></tr>` : ''}
      <tr><td>Status:</td><td>${e.status === 'completo' ? '✅ Completo' : '🔴 Incompleto'}</td></tr>
    </table>
    <h3 style="margin-top:25px">👥 Profissionais Escalados</h3>
    <table>
      <thead><tr><th>Profissional</th><th>Categoria</th></tr></thead>
      <tbody>
        ${(e.profissionais || []).map(p => {
          const srv = srvMap[p.srvId];
          const nome = srv ? srv.nome : '?';
          return `<tr><td>${esc(nome)}</td><td>${esc(p.categoria)}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
    <div class="footer">
      ${esc(orgNome)}<br>
      Documento gerado em ${new Date().toLocaleString('pt-BR')} pelo Sistema de Gestão<br>
      ${esc(e.nome)} - ${e.data}
    </div>
    ${getAssinaturaCoordenador()}
    <script>window.onload=function(){window.print();}<\/script>
    </body></html>
  `);
  win.document.close();
}

function imprimirEventosMes() {
  const mesref = document.getElementById('ev-print-mes').value;
  if (!mesref) { toastMsg('Selecione o mês/ano.', 'warning'); return; }
  const mes = parseInt(mesref.split('-')[1]);
  const ano = parseInt(mesref.split('-')[0]);
  const filtrados = _eventosData.filter(e => {
    if (!e.data) return false;
    const d = new Date(e.data + 'T00:00:00');
    return d.getMonth() + 1 === mes && d.getFullYear() === ano;
  }).sort((a, b) => a.data.localeCompare(b.data));
  if (!filtrados.length) { toastMsg('Nenhum evento neste mês.', 'info'); return; }

  const servidores = DB.servidores();
  const srvMap = {};
  servidores.forEach(s => { srvMap[s.id] = s; });
  const imgPrint = getImg('print');
  const cfg = DB.config();
  const orgNome = cfg.nomeOrganizacao || 'Coordenação da Atenção Primária à Saúde';
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  let html = `
  <html><head><title>Eventos - ${meses[mes-1]} ${ano}</title>
  <style>
    @page { margin: 12mm 8mm; }
    body { font-family: Arial, sans-serif; padding: 20px; color: #222; font-size: 11px; }
    .logo-area { text-align: center; margin-bottom: 10px; }
    .logo-area img { max-height: 70px; max-width: 100%; object-fit: contain; }
    h1 { text-align: center; font-size: 18px; margin-bottom: 4px; }
    .subtitle { text-align: center; color: #555; font-size: 12px; margin-bottom: 20px; }
    .evento { border: 1px solid #ccc; border-radius: 6px; padding: 12px; margin-bottom: 14px; page-break-inside: avoid; }
    .evento h3 { margin: 0 0 6px; font-size: 14px; color: #1a3a5c; }
    .evento .meta { font-size: 10px; color: #666; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0; }
    th { background: #eee; padding: 5px 7px; text-align: left; font-size: 10px; text-transform: uppercase; }
    td { padding: 5px 7px; border-bottom: 1px solid #ddd; font-size: 11px; }
    .sig-area { text-align: center; margin-top: 40px; }
    .sig-line { width: 280px; border-top: 1.5px solid #000; margin: 0 auto 6px; }
    .sig-nome { font-weight: 700; font-size: 13px; }
    .sig-cargo { font-size: 10px; color: #555; }
    .footer { text-align: center; margin-top: 20px; font-size: 9px; color: #888; border-top: 1px solid #ccc; padding-top: 8px; }
    @media print { body { padding: 10px; } }
  </style></head><body>
    ${imgPrint ? `<div class="logo-area"><img src="${imgPrint}"></div>` : ''}
    <h1>Relatório Mensal de Eventos</h1>
    <div class="subtitle">${orgNome} — ${meses[mes-1]} ${ano}</div>`;

  for (const e of filtrados) {
    const veic = e.veiculoId ? _veiculosData.find(v => v.id === e.veiculoId) : null;
    html += `
    <div class="evento">
      <h3>📅 ${esc(e.nome)}</h3>
      <div class="meta">${e.data} | ${e.hrInicio} - ${e.hrFim || e.hrTermino}${e.local ? ' | '+esc(e.local) : ''} | ${e.status === 'completo' ? '✅ Completo' : '🔴 Incompleto'}</div>
      ${e.descricao ? '<div style="margin-bottom:6px;font-size:10px;color:#555">'+esc(e.descricao)+'</div>' : ''}
      ${veic ? '<div style="margin-bottom:6px;font-size:10px;color:#555">🚗 '+esc(veic.nome)+(veic.placa ? ' ('+esc(veic.placa)+')' : '')+'</div>' : ''}
      ${(e.profissionais || []).length ? `
      <table>
        <thead><tr><th>Profissional</th><th>Categoria</th></tr></thead>
        <tbody>
          ${e.profissionais.map(p => {
            const srv = srvMap[p.srvId];
            return `<tr><td>${esc(srv ? srv.nome : '?')}</td><td>${esc(p.categoria)}</td></tr>`;
          }).join('')}
        </tbody>
      </table>` : '<div style="color:#999;font-size:10px">Nenhum profissional escalado.</div>'}
    </div>`;
  }

  html += `
    <div class="footer">
      ${esc(orgNome)}<br>
      Relatório gerado em ${new Date().toLocaleString('pt-BR')} pelo Sistema de Gestão
    </div>
    ${getAssinaturaCoordenador()}
    <script>window.onload=function(){window.print();}<\/script>
  </body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}
