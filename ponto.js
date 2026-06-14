// Módulo de ponto credenciados.
// Cargos, credenciados e fechamentos mensais.

function togglePtSubtab(subtab, btn) {
  document.querySelectorAll('#pt-subtabs .ev-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderPtSubtab(subtab);
}

function renderPtSubtab(subtab) {
  const map = {cargos:0,credenciados:1,fechamento:2,relatorio:3};
  document.querySelectorAll('#pt-subtabs .ev-tab').forEach((b,i) => b.classList.toggle('active', i === map[subtab]));
  ['cargos','credenciados','fechamento','relatorio'].forEach(s => {
    document.getElementById('pt-sub-' + s).style.display = s === subtab ? 'block' : 'none';
  });
  if (subtab === 'cargos') renderCargos();
  if (subtab === 'credenciados') renderCredenciados();
  if (subtab === 'fechamento') { renderFechamentos(); popularSelectCredFechamento(); }
  if (subtab === 'relatorio') popularSelectCredRelatorio();
}

function renderCargos() {
  const dados = DB.cargos();
  let html = '<table><thead><tr><th>Nome</th><th>Valor Hora</th><th>Ações</th></tr></thead><tbody>';
  for (let i = 0; i < dados.length; i++) {
    const c = dados[i];
    html += '<tr><td>' + esc(c.nome) + '</td><td>R$ ' + (parseFloat(c.valorHora) || 0).toFixed(2) + '</td><td class="actions">'
      + '<button class="btn btn-sm btn-ghost" onclick="editarCargo(\'' + c.id + '\')">✏️</button> '
      + '<button class="btn btn-sm btn-ghost" onclick="excluirCargo(\'' + c.id + '\')">🗑️</button>'
      + '</td></tr>';
  }
  html += '</tbody></table>';
  if (!dados.length) html = '<p style="color:var(--muted);font-size:.84rem;padding:12px 0">Nenhum cargo cadastrado.</p>';
  const container = document.getElementById('tabela-cargos');
  if (container) container.innerHTML = html;
  popularSelectCargos();
}

function popularSelectCargos() {
  const cargos = DB.cargos();
  ['cred-cargo'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const val = sel.value;
    sel.innerHTML = '<option value="">Selecione...</option>';
    for (let i = 0; i < cargos.length; i++) {
      sel.innerHTML += '<option value="' + cargos[i].id + '">' + esc(cargos[i].nome) + ' - R$ ' + (parseFloat(cargos[i].valorHora) || 0).toFixed(2) + '</option>';
    }
    if (val) sel.value = val;
  });
}

function salvarCargo() {
  const id = document.getElementById('cargo-id').value;
  const nome = document.getElementById('cargo-nome').value.trim();
  const valorHora = parseFloat(document.getElementById('cargo-valor').value);
  if (!nome) { toastMsg('Informe o nome do cargo.', 'warning'); return; }
  if (isNaN(valorHora) || valorHora <= 0) { toastMsg('Informe um valor da hora válido.', 'warning'); return; }
  const dados = DB.cargos();
  if (id) {
    const idx = dados.findIndex(c => c.id === id);
    if (idx >= 0) { dados[idx].nome = nome; dados[idx].valorHora = valorHora; }
  } else {
    dados.push({ id: uid(), nome, valorHora });
  }
  DB.saveCargos(dados);
  limparFormCargo();
  renderCargos();
  toastMsg('Cargo salvo com sucesso!', 'success');
}

function editarCargo(id) {
  const dados = DB.cargos();
  const c = dados.find(x => x.id === id);
  if (!c) return;
  document.getElementById('cargo-id').value = c.id;
  document.getElementById('cargo-nome').value = c.nome;
  document.getElementById('cargo-valor').value = c.valorHora;
  document.getElementById('cargo-form-title').textContent = 'Editar Cargo';
  document.querySelector('#pt-sub-cargos .ev-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function limparFormCargo() {
  document.getElementById('cargo-id').value = '';
  document.getElementById('cargo-nome').value = '';
  document.getElementById('cargo-valor').value = '';
  document.getElementById('cargo-form-title').textContent = 'Novo Cargo';
}

async function excluirCargo(id) {
  if (!confirm('Excluir este cargo permanentemente?')) return;
  let dados = DB.cargos();
  dados = dados.filter(c => c.id !== id);
  DB.saveCargos(dados);
  await DB.deleteCargo(id);
  renderCargos();
  toastMsg('Cargo excluído permanentemente.', 'info');
}

function renderCredenciados() {
  const dados = DB.credenciados();
  const cargos = DB.cargos();
  const busca = (document.getElementById('busca-credenciado').value || '').toLowerCase();
  const filtrados = busca ? dados.filter(c => c.nome.toLowerCase().includes(busca) || (c.cpf || '').includes(busca)) : dados;
  let html = '<table><thead><tr><th>Nome</th><th>CPF</th><th>Cargo</th><th>Lotação</th><th>Forma Pgto</th><th>Ações</th></tr></thead><tbody>';
  for (let i = 0; i < filtrados.length; i++) {
    const c = filtrados[i];
    const cargoNome = cargos.find(cg => cg.id === c.cargoId);
    html += '<tr><td>' + esc(c.nome) + '</td><td>' + esc(c.cpf || '-') + '</td><td>' + esc(cargoNome ? cargoNome.nome : '-') + '</td>'
      + '<td>' + esc(c.lotacao || '-') + '</td><td>' + esc(c.formaPagamento || '-') + '</td>'
      + '<td class="actions">'
      + '<button class="btn btn-sm btn-ghost" onclick="editarCredenciado(\'' + c.id + '\')">✏️</button> '
      + '<button class="btn btn-sm btn-ghost" onclick="excluirCredenciado(\'' + c.id + '\')">🗑️</button>'
      + '</td></tr>';
  }
  html += '</tbody></table>';
  if (!filtrados.length) html = '<p style="color:var(--muted);font-size:.84rem;padding:12px 0">Nenhum credenciado encontrado.</p>';
  document.getElementById('tabela-credenciados').innerHTML = html;
}

function salvarCredenciado() {
  const id = document.getElementById('cred-id').value;
  const nome = document.getElementById('cred-nome').value.trim();
  const cpf = document.getElementById('cred-cpf').value.trim();
  const pis = document.getElementById('cred-pis').value.trim();
  const tel = document.getElementById('cred-tel').value.trim();
  const email = document.getElementById('cred-email').value.trim();
  const lotacao = document.getElementById('cred-lotacao').value.trim();
  const endereco = document.getElementById('cred-endereco').value.trim();
  const cargoId = document.getElementById('cred-cargo').value;
  const formaPagamento = document.getElementById('cred-pgto').value;
  const chavePix = document.getElementById('cred-chave-pix').value.trim();
  const banco = document.getElementById('cred-banco').value.trim();
  const agencia = document.getElementById('cred-agencia').value.trim();
  const conta = document.getElementById('cred-conta').value.trim();
  const tipoConta = document.getElementById('cred-tipo-conta').value;
  if (!nome) { toastMsg('Informe o nome do credenciado.', 'warning'); return; }
  if (!cpf) { toastMsg('Informe o CPF.', 'warning'); return; }
  if (!cargoId) { toastMsg('Selecione o cargo.', 'warning'); return; }
  if (!formaPagamento) { toastMsg('Selecione a forma de pagamento.', 'warning'); return; }
  const dados = DB.credenciados();
  if (id) {
    const idx = dados.findIndex(c => c.id === id);
    if (idx >= 0) { dados[idx] = { ...dados[idx], nome, cpf, pis, tel, email, lotacao, endereco, cargoId, formaPagamento, chavePix, banco, agencia, conta, tipoConta }; }
  } else {
    dados.push({ id: uid(), nome, cpf, pis, tel, email, lotacao, endereco, cargoId, formaPagamento, chavePix, banco, agencia, conta, tipoConta });
  }
  DB.saveCredenciados(dados);
  limparFormCredenciado();
  renderCredenciados();
  toastMsg('Credenciado salvo com sucesso!', 'success');
}

function editarCredenciado(id) {
  const dados = DB.credenciados();
  const c = dados.find(x => x.id === id);
  if (!c) return;
  document.getElementById('cred-id').value = c.id;
  document.getElementById('cred-nome').value = c.nome;
  document.getElementById('cred-cpf').value = c.cpf || '';
  document.getElementById('cred-pis').value = c.pis || '';
  document.getElementById('cred-tel').value = c.tel || '';
  document.getElementById('cred-email').value = c.email || '';
  document.getElementById('cred-lotacao').value = c.lotacao || '';
  document.getElementById('cred-endereco').value = c.endereco || '';
  document.getElementById('cred-cargo').value = c.cargoId || '';
  document.getElementById('cred-pgto').value = c.formaPagamento || '';
  document.getElementById('cred-chave-pix').value = c.chavePix || '';
  document.getElementById('cred-banco').value = c.banco || '';
  document.getElementById('cred-agencia').value = c.agencia || '';
  document.getElementById('cred-conta').value = c.conta || '';
  document.getElementById('cred-tipo-conta').value = c.tipoConta || '';
  document.getElementById('cred-form-title').textContent = 'Editar Credenciado';
  toggleDadosBancarios();
  document.querySelector('#pt-sub-credenciados .ev-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function limparFormCredenciado() {
  ['cred-id','cred-nome','cred-cpf','cred-pis','cred-tel','cred-email','cred-lotacao','cred-endereco','cred-chave-pix','cred-banco','cred-agencia','cred-conta'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('cred-cargo').value = '';
  document.getElementById('cred-pgto').value = '';
  document.getElementById('cred-tipo-conta').value = '';
  document.getElementById('cred-dados-bancarios').style.display = 'none';
  document.getElementById('cred-form-title').textContent = 'Novo Credenciado';
}

function toggleDadosBancarios() {
  const pgto = document.getElementById('cred-pgto').value;
  const container = document.getElementById('cred-dados-bancarios');
  const pixField = document.getElementById('cred-pix-field');
  const tedField = document.getElementById('cred-ted-field');
  if (pgto === 'pix' || pgto === 'ted') {
    container.style.display = 'block';
    pixField.style.display = pgto === 'pix' ? 'block' : 'none';
    tedField.style.display = pgto === 'ted' ? 'block' : 'none';
  } else {
    container.style.display = 'none';
  }
}

async function excluirCredenciado(id) {
  if (!confirm('Excluir este credenciado permanentemente?')) return;
  let dados = DB.credenciados();
  dados = dados.filter(c => c.id !== id);
  DB.saveCredenciados(dados);
  await DB.deleteCredenciado(id);
  renderCredenciados();
  toastMsg('Credenciado excluído permanentemente.', 'info');
}

function popularSelectCredFechamento() {
  const dados = DB.credenciados();
  const sel = document.getElementById('ponto-credenciado');
  if (!sel) return;
  const val = sel.value;
  sel.innerHTML = '<option value="">Selecione o credenciado...</option>';
  for (let i = 0; i < dados.length; i++) {
    sel.innerHTML += '<option value="' + dados[i].id + '">' + esc(dados[i].nome) + ' - ' + esc(dados[i].cpf || '') + '</option>';
  }
  if (val) sel.value = val;
}

function carregarDadosCredFechamento() {
  const credId = document.getElementById('ponto-credenciado').value;
  const cargos = DB.cargos();
  const creds = DB.credenciados();
  const cred = creds.find(c => c.id === credId);
  const cargo = cred ? cargos.find(c => c.id === cred.cargoId) : null;
  document.getElementById('ponto-cargo').value = cargo ? cargo.nome : '';
  document.getElementById('ponto-valor-hora').value = cargo ? (parseFloat(cargo.valorHora) || 0).toFixed(2) : '0.00';
  calcularValorFechamento();
}

function calcularValorFechamento() {
  const horas = parseFloat(document.getElementById('ponto-horas').value) || 0;
  const valorHora = parseFloat(document.getElementById('ponto-valor-hora').value) || 0;
  const total = horas * valorHora;
  document.getElementById('ponto-valor-total').value = total > 0 ? 'R$ ' + total.toFixed(2) : '';
}

function renderFechamentos() {
  const dados = DB.pontoMensal();
  const creds = DB.credenciados();
  const cargos = DB.cargos();
  let html = '<table><thead><tr><th>Credenciado</th><th>Mês/Ano</th><th>Cargo</th><th>Horas</th><th>Valor Hora</th><th>Valor Total</th><th>Ações</th></tr></thead><tbody>';
  for (let i = 0; i < dados.length; i++) {
    const p = dados[i];
    const cred = creds.find(c => c.id === p.credenciadoId);
    const cargo = cargos.find(c => c.id === p.cargoId);
    const mesAno = (p.mes || '').toString().padStart(2, '0') + '/' + (p.ano || '');
    html += '<tr><td>' + esc(cred ? cred.nome : '-') + '</td><td>' + mesAno + '</td>'
      + '<td>' + esc(cargo ? cargo.nome : '-') + '</td>'
      + '<td>' + (parseFloat(p.horas) || 0).toFixed(1) + '</td>'
      + '<td>R$ ' + (parseFloat(p.valorHora) || 0).toFixed(2) + '</td>'
      + '<td><strong>R$ ' + (parseFloat(p.valorTotal) || 0).toFixed(2) + '</strong></td>'
      + '<td class="actions">'
      + '<button class="btn btn-sm btn-ghost" onclick="editarFechamento(\'' + p.id + '\')">✏️</button> '
      + '<button class="btn btn-sm btn-ghost" onclick="excluirFechamento(\'' + p.id + '\')">🗑️</button>'
      + '</td></tr>';
  }
  html += '</tbody></table>';
  if (!dados.length) html = '<p style="color:var(--muted);font-size:.84rem;padding:12px 0">Nenhum fechamento registrado.</p>';
  document.getElementById('tabela-fechamentos').innerHTML = html;
}

function salvarFechamento() {
  const id = document.getElementById('ponto-id').value;
  const credenciadoId = document.getElementById('ponto-credenciado').value;
  const mesref = document.getElementById('ponto-mesref').value;
  const horas = parseFloat(document.getElementById('ponto-horas').value);
  const valorHora = parseFloat(document.getElementById('ponto-valor-hora').value) || 0;
  const creds = DB.credenciados();
  const cargos = DB.cargos();
  const cred = creds.find(c => c.id === credenciadoId);
  if (!credenciadoId) { toastMsg('Selecione o credenciado.', 'warning'); return; }
  if (!mesref) { toastMsg('Informe o mês/ano de referência.', 'warning'); return; }
  if (isNaN(horas) || horas <= 0) { toastMsg('Informe as horas trabalhadas.', 'warning'); return; }
  const mes = parseInt(mesref.split('-')[1]);
  const ano = parseInt(mesref.split('-')[0]);
  const cargo = cred ? cargos.find(c => c.id === cred.cargoId) : null;
  const cargoId = cargo ? cargo.id : '';
  const valorTotal = horas * valorHora;
  const dados = DB.pontoMensal();
  if (id) {
    const idx = dados.findIndex(p => p.id === id);
    if (idx >= 0) { dados[idx] = { ...dados[idx], credenciadoId, mes, ano, horas, valorHora, valorTotal, cargoId }; }
  } else {
    dados.push({ id: uid(), credenciadoId, mes, ano, horas, valorHora, valorTotal, cargoId, criadoEm: new Date().toISOString() });
  }
  DB.savePontoMensal(dados);
  limparFormFechamento();
  renderFechamentos();
  toastMsg('Fechamento salvo com sucesso!', 'success');
}

function editarFechamento(id) {
  const dados = DB.pontoMensal();
  const p = dados.find(x => x.id === id);
  if (!p) return;
  document.getElementById('ponto-id').value = p.id;
  document.getElementById('ponto-credenciado').value = p.credenciadoId;
  document.getElementById('ponto-mesref').value = (p.ano || '') + '-' + (p.mes || '').toString().padStart(2, '0');
  carregarDadosCredFechamento();
  document.getElementById('ponto-horas').value = p.horas;
  calcularValorFechamento();
}

function limparFormFechamento() {
  document.getElementById('ponto-id').value = '';
  document.getElementById('ponto-credenciado').value = '';
  document.getElementById('ponto-mesref').value = '';
  document.getElementById('ponto-horas').value = '';
  document.getElementById('ponto-cargo').value = '';
  document.getElementById('ponto-valor-hora').value = '';
  document.getElementById('ponto-valor-total').value = '';
}

async function excluirFechamento(id) {
  if (!confirm('Excluir este fechamento permanentemente?')) return;
  let dados = DB.pontoMensal();
  dados = dados.filter(p => p.id !== id);
  DB.savePontoMensal(dados);
  await DB.deletePontoMensal(id);
  renderFechamentos();
  toastMsg('Fechamento excluído permanentemente.', 'info');
}
