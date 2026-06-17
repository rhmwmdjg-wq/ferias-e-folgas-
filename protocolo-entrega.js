// Módulo Protocolo de Entrega - Justificativas de Ponto e Atestados

let _peDatasJustificativa = [];
let _peDatasAtestado = [];
let _peItens = [];
let _peEditandoProtocoloId = null;

function togglePeTipoItem() {
  const tipo = document.getElementById('pe-tipo-item').value;
  document.getElementById('pe-campos-justificativa').style.display = tipo === 'justificativa' ? 'block' : 'none';
  document.getElementById('pe-campos-atestado').style.display = tipo === 'atestado' ? 'block' : 'none';
  document.getElementById('pe-srv-field').style.display = tipo ? 'block' : 'none';
  if (tipo) popularSelectPeServidor();
}

function togglePeOutroMotivo() {
  document.getElementById('pe-outro-motivo-field').style.display =
    document.getElementById('pe-motivo').value === 'outros' ? 'block' : 'none';
}

function popularSelectPeServidor() {
  const sel = document.getElementById('pe-srv');
  const srvs = getServidoresAcessiveis();
  sel.innerHTML = '<option value="">Selecione...</option>' +
    srvs.map(s => `<option value="${s.id}">${s.nome} (Mat. ${s.matricula})</option>`).join('');
}

function adicionarDataJustificativa() {
  const data = document.getElementById('pe-data').value;
  const periodo = document.getElementById('pe-periodo').value;
  if (!data || !periodo) return toastMsg('Selecione a data e o período!', 'error');
  if (_peDatasJustificativa.some(d => d.data === data)) return toastMsg('Data já adicionada!', 'warning');
  _peDatasJustificativa.push({ data, periodo });
  renderListaDatasJustificativa();
  document.getElementById('pe-data').value = '';
  document.getElementById('pe-periodo').value = '';
}

function renderListaDatasJustificativa() {
  const container = document.getElementById('pe-lista-datas');
  if (!_peDatasJustificativa.length) {
    container.innerHTML = '<span style="font-size:.8rem;color:var(--muted)">Nenhuma data selecionada.</span>';
    return;
  }
  container.innerHTML = _peDatasJustificativa.map((d, i) =>
    `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--card);border:1px solid var(--border-mid);border-radius:var(--r-sm);padding:4px 10px;font-size:.8rem">
      ${fmtDate(d.data)} - ${d.periodo === 'manha' ? '☀️ Manhã' : d.periodo === 'tarde' ? '🌤️ Tarde' : '🌞 Integral'}
      <span onclick="_peDatasJustificativa.splice(${i},1);renderListaDatasJustificativa()" style="cursor:pointer;color:var(--danger);margin-left:4px">✕</span>
    </span>`
  ).join('');
}

function adicionarDataAtestado() {
  const data = document.getElementById('pe-data-atestado').value;
  if (!data) return toastMsg('Selecione a data do atestado!', 'error');
  if (_peDatasAtestado.some(d => d === data)) return toastMsg('Data já adicionada!', 'warning');
  _peDatasAtestado.push(data);
  renderListaDatasAtestado();
  document.getElementById('pe-data-atestado').value = '';
}

function renderListaDatasAtestado() {
  const container = document.getElementById('pe-lista-datas-atestado');
  if (!_peDatasAtestado.length) {
    container.innerHTML = '<span style="font-size:.8rem;color:var(--muted)">Nenhuma data selecionada.</span>';
    return;
  }
  container.innerHTML = _peDatasAtestado.map((d, i) =>
    `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--card);border:1px solid var(--border-mid);border-radius:var(--r-sm);padding:4px 10px;font-size:.8rem">
      ${fmtDate(d)}
      <span onclick="_peDatasAtestado.splice(${i},1);renderListaDatasAtestado()" style="cursor:pointer;color:var(--danger);margin-left:4px">✕</span>
    </span>`
  ).join('');
}

function getMotivoLabel(motivo) {
  const map = { falta: 'Falta', folga: 'Folga', esquecimento_batida: 'Esquecimento da Batida do Ponto', zona_rural: 'Zona Rural', outros: 'Outros' };
  return map[motivo] || motivo;
}

function adicionarItemProtocolo() {
  const tipo = document.getElementById('pe-tipo-item').value;
  if (!tipo) return toastMsg('Selecione o tipo de item!', 'error');
  const srvId = document.getElementById('pe-srv').value;
  if (!srvId) return toastMsg('Selecione o servidor!', 'error');
  const srv = DB.servidores().find(s => s.id === srvId);
  if (!srv) return toastMsg('Servidor não encontrado!', 'error');

  if (tipo === 'justificativa') {
    if (!_peDatasJustificativa.length) return toastMsg('Adicione pelo menos uma data com período!', 'error');
    const motivo = document.getElementById('pe-motivo').value;
    if (!motivo) return toastMsg('Selecione o motivo!', 'error');
    const motivoOutro = motivo === 'outros' ? document.getElementById('pe-outro-motivo').value : '';
    if (motivo === 'outros' && !motivoOutro) return toastMsg('Descreva o motivo!', 'error');

    _peItens.push({
      id: uid(),
      tipo: 'justificativa',
      srvId, srvNome: srv.nome, srvMatricula: srv.matricula, srvSetor: srv.setor || '',
      motivo, motivoOutro,
      datas: [..._peDatasJustificativa]
    });
    _peDatasJustificativa = [];
    renderListaDatasJustificativa();
    document.getElementById('pe-motivo').value = '';
    document.getElementById('pe-outro-motivo').value = '';
    document.getElementById('pe-outro-motivo-field').style.display = 'none';
  } else {
    if (!_peDatasAtestado.length) return toastMsg('Adicione pelo menos uma data!', 'error');
    _peItens.push({
      id: uid(),
      tipo: 'atestado',
      srvId, srvNome: srv.nome, srvMatricula: srv.matricula, srvSetor: srv.setor || '',
      motivo: '', motivoOutro: '',
      datas: _peDatasAtestado.map(d => ({ data: d, periodo: 'integral' }))
    });
    _peDatasAtestado = [];
    renderListaDatasAtestado();
  }

  document.getElementById('pe-tipo-item').value = '';
  document.getElementById('pe-srv').value = '';
  document.getElementById('pe-campos-justificativa').style.display = 'none';
  document.getElementById('pe-campos-atestado').style.display = 'none';
  document.getElementById('pe-srv-field').style.display = 'none';
  renderItensProtocolo();
  toastMsg('Item adicionado ao protocolo!', 'success');
}

function removerItemProtocolo(idx) {
  _peItens.splice(idx, 1);
  renderItensProtocolo();
}

function renderItensProtocolo() {
  const container = document.getElementById('pe-lista-itens');
  const wrapper = document.getElementById('pe-itens-container');
  if (!_peItens.length) {
    wrapper.style.display = 'none';
    return;
  }
  wrapper.style.display = 'block';
  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:.8rem">
      <thead>
        <tr style="background:var(--card2);border-bottom:1px solid var(--border-mid)">
          <th style="padding:8px;text-align:left">Tipo</th>
          <th style="padding:8px;text-align:left">Servidor</th>
          <th style="padding:8px;text-align:left">Matrícula</th>
          <th style="padding:8px;text-align:left">Detalhes</th>
          <th style="padding:8px;text-align:center">Ação</th>
        </tr>
      </thead>
      <tbody>
        ${_peItens.map((item, idx) => `
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px">${item.tipo === 'justificativa' ? '📝 Justificativa' : '🩺 Atestado'}</td>
            <td style="padding:8px">${esc(item.srvNome)}</td>
            <td style="padding:8px">${esc(item.srvMatricula)}</td>
            <td style="padding:8px;font-size:.75rem">
              ${item.tipo === 'justificativa' ? `<strong>Motivo:</strong> ${getMotivoLabel(item.motivo)}${item.motivoOutro ? ' - ' + esc(item.motivoOutro) : ''}<br>` : ''}
              <strong>Datas:</strong> ${item.datas.map(d => fmtDate(d.data) + (item.tipo === 'justificativa' ? ' (' + d.periodo + ')' : '')).join(', ')}
            </td>
            <td style="padding:8px;text-align:center">
              <button class="btn btn-danger btn-sm" onclick="removerItemProtocolo(${idx})">✕</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div style="margin-top:8px;font-size:.75rem;font-weight:600;color:var(--muted)">Total: ${_peItens.length} item(ns)</div>
  `;
}

function novoProtocolo() {
  _peItens = [];
  _peDatasJustificativa = [];
  _peDatasAtestado = [];
  _peEditandoProtocoloId = null;
  document.getElementById('pe-protocolo-id').value = '';
  document.getElementById('pe-protocolo-numero').value = '';
  document.getElementById('pe-tipo-item').value = '';
  document.getElementById('pe-srv').value = '';
  document.getElementById('pe-campos-justificativa').style.display = 'none';
  document.getElementById('pe-campos-atestado').style.display = 'none';
  document.getElementById('pe-srv-field').style.display = 'none';
  document.getElementById('pe-motivo').value = '';
  document.getElementById('pe-outro-motivo').value = '';
  document.getElementById('pe-outro-motivo-field').style.display = 'none';
  document.getElementById('pe-data').value = '';
  document.getElementById('pe-periodo').value = '';
  document.getElementById('pe-data-atestado').value = '';
  document.getElementById('pe-itens-container').style.display = 'none';
  renderListaDatasJustificativa();
  renderListaDatasAtestado();
  document.getElementById('modal-protocolo-title').textContent = '📄 Novo Protocolo de Entrega';
  document.getElementById('modal-novo-protocolo').classList.add('open');
}

function gerarNumeroProtocolo() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const seq = String(DB.protocolos().length + 1).padStart(4, '0');
  return `PROTO-${ano}-${seq}`;
}

async function salvarProtocolo() {
  if (!_peItens.length) return toastMsg('Adicione pelo menos um item ao protocolo!', 'error');

  const editandoId = document.getElementById('pe-protocolo-id').value;
  let protocolo;

  if (editandoId) {
    protocolo = DB.protocolos().find(p => p.id === editandoId);
    if (!protocolo) return toastMsg('Protocolo não encontrado!', 'error');
    // Remove itens antigos
    const itensAntigos = DB.itensProtocolo().filter(i => i.protocoloId === protocolo.id);
    for (const item of itensAntigos) {
      await DB.deleteItemProtocolo(item.id);
    }
  } else {
    const sessao = JSON.parse(sessionStorage.getItem('ferias_sessao') || '{}');
    protocolo = {
      id: uid(),
      numero: gerarNumeroProtocolo(),
      status: 'fechado',
      criadoEm: new Date().toISOString(),
      criadoPor: sessao.nome || 'Sistema'
    };
  }

  // Salva protocolo
  const protocolos = DB.protocolos();
  if (editandoId) {
    const idx = protocolos.findIndex(p => p.id === editandoId);
    if (idx >= 0) protocolos[idx] = protocolo;
  } else {
    protocolos.push(protocolo);
  }
  await DB.saveProtocolos(protocolos);

  // Salva itens
  const itens = DB.itensProtocolo();
  for (const item of _peItens) {
    itens.push({
      ...item,
      protocoloId: protocolo.id,
      criadoEm: new Date().toISOString()
    });
  }
  await DB.saveItensProtocolo(itens);

  DB.saveLog('Criou/Editou Protocolo de Entrega', `Protocolo ${protocolo.numero} - ${_peItens.length} itens`, 'protocolos_entrega', protocolo.id);
  toastMsg(`Protocolo ${protocolo.numero} salvo com sucesso!`, 'success');
  fecharModal('modal-novo-protocolo');
  renderProtocolos();
}

function renderProtocolos() {
  const container = document.getElementById('tabela-protocolos');
  const busca = (document.getElementById('pe-busca')?.value || '').toLowerCase();
  let protocolos = DB.protocolos();
  const itens = DB.itensProtocolo();

  // Ordenar do mais recente para o mais antigo
  protocolos.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));

  if (busca) {
    protocolos = protocolos.filter(p => {
      if (p.numero.toLowerCase().includes(busca)) return true;
      const pItens = itens.filter(i => i.protocoloId === p.id);
      return pItens.some(i => i.srvNome.toLowerCase().includes(busca) || i.srvMatricula.includes(busca));
    });
  }

  if (!protocolos.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">Nenhum protocolo registrado ainda.</div>';
    return;
  }

  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:.8rem">
      <thead>
        <tr style="background:var(--card2);border-bottom:1px solid var(--border-mid)">
          <th style="padding:8px;text-align:left">Nº Protocolo</th>
          <th style="padding:8px;text-align:left">Data de Criação</th>
          <th style="padding:8px;text-align:left">Criado por</th>
          <th style="padding:8px;text-align:center">Qtd Itens</th>
          <th style="padding:8px;text-align:center">Ações</th>
        </tr>
      </thead>
      <tbody>
        ${protocolos.map(p => {
          const pItens = itens.filter(i => i.protocoloId === p.id);
          return `
            <tr style="border-bottom:1px solid var(--border)">
              <td style="padding:8px;font-weight:600">${esc(p.numero)}</td>
              <td style="padding:8px">${fmtDate(p.criadoEm)}</td>
              <td style="padding:8px">${esc(p.criadoPor || '-')}</td>
              <td style="padding:8px;text-align:center">
                <span class="tag tag-blue">${pItens.length} item(ns)</span>
              </td>
              <td style="padding:8px;text-align:center">
                <button class="btn btn-primary btn-sm" onclick="imprimirProtocolo('${p.id}')" title="Imprimir">🖨️</button>
                <button class="btn btn-ghost btn-sm" onclick="editarProtocolo('${p.id}')" title="Editar">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deletarProtocolo('${p.id}')" title="Excluir">🗑️</button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

async function editarProtocolo(id) {
  const protocolo = DB.protocolos().find(p => p.id === id);
  if (!protocolo) return toastMsg('Protocolo não encontrado!', 'error');
  const itens = DB.itensProtocolo().filter(i => i.protocoloId === id);

  _peItens = itens.map(i => ({
    id: i.id,
    tipo: i.tipo,
    srvId: i.srvId, srvNome: i.srvNome, srvMatricula: i.srvMatricula, srvSetor: i.srvSetor,
    motivo: i.motivo, motivoOutro: i.motivoOutro,
    datas: [...i.datas]
  }));
  _peDatasJustificativa = [];
  _peDatasAtestado = [];
  _peEditandoProtocoloId = id;

  document.getElementById('pe-protocolo-id').value = id;
  document.getElementById('pe-protocolo-numero').value = protocolo.numero;
  document.getElementById('pe-tipo-item').value = '';
  document.getElementById('pe-srv').value = '';
  document.getElementById('pe-campos-justificativa').style.display = 'none';
  document.getElementById('pe-campos-atestado').style.display = 'none';
  document.getElementById('pe-srv-field').style.display = 'none';
  document.getElementById('modal-protocolo-title').textContent = `✏️ Editando ${protocolo.numero}`;
  renderItensProtocolo();
  renderListaDatasJustificativa();
  renderListaDatasAtestado();
  document.getElementById('modal-novo-protocolo').classList.add('open');
}

function deletarProtocolo(id) {
  if (!confirm('Tem certeza que deseja excluir este protocolo?')) return;
  const protocolo = DB.protocolos().find(p => p.id === id);
  if (!protocolo) return;

  // Remove itens
  const itens = DB.itensProtocolo().filter(i => i.protocoloId === id);
  for (const item of itens) {
    DB.deleteItemProtocolo(item.id);
  }

  DB.deleteProtocolo(id);
  DB.saveLog('Excluiu Protocolo de Entrega', `Protocolo ${protocolo.numero}`, 'protocolos_entrega', id);
  toastMsg('Protocolo excluído!', 'success');
  renderProtocolos();
}

function imprimirProtocolo(id) {
  const protocolo = DB.protocolos().find(p => p.id === id);
  if (!protocolo) return toastMsg('Protocolo não encontrado!', 'error');
  const itens = DB.itensProtocolo().filter(i => i.protocoloId === id);
  if (!itens.length) return toastMsg('Protocolo sem itens para imprimir!', 'error');

  const win = window.open('', '_blank');
  const hoje = new Date();
  const imgPrint = getImg('print');
  const config = DB.config();
  const orgNome = config.nomeOrganizacao || 'Coordenação da Atenção Primária à Saúde';

  const justificativas = itens.filter(i => i.tipo === 'justificativa');
  const atestados = itens.filter(i => i.tipo === 'atestado');

  const fullHTML = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Protocolo de Entrega - ${esc(protocolo.numero)}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; margin: 0; padding: 30px; color: #111; line-height: 1.5; font-size: 11px; }
        .container { max-width: 800px; margin: 0 auto; }
        .header { text-align: center; border-bottom: 3px solid #000; padding-bottom: 20px; margin-bottom: 20px; }
        .header img { max-height: 90px; max-width: 100%; object-fit: contain; margin-bottom: 10px; }
        .header h1 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
        .header h2 { font-size: 18px; font-weight: 800; text-decoration: underline; margin-top: 6px; }
        .header .protocolo-num { font-size: 12px; font-weight: 600; color: #444; margin-top: 6px; }
        .section { margin-bottom: 25px; }
        .section h3 { font-size: 12px; font-weight: 700; text-transform: uppercase; background: #f0f0f0; padding: 8px 12px; border-left: 4px solid #000; margin-bottom: 10px; }
        table.details { width: 100%; border-collapse: collapse; margin-top: 6px; }
        table.details th { background: #e8e8e8; font-size: 9px; font-weight: 700; text-transform: uppercase; text-align: left; padding: 6px 8px; border: 1px solid #ccc; }
        table.details td { padding: 6px 8px; border: 1px solid #ccc; font-size: 10px; vertical-align: top; }
        table.details tr:nth-child(even) { background: #fafafa; }
        .declaration { border: 2px solid #000; padding: 20px; margin: 30px 0; text-align: center; font-style: italic; font-size: 11px; background: #f9f9f9; }
        .sig-area { margin-top: 60px; display: flex; justify-content: space-around; gap: 50px; }
        .sig-box { text-align: center; flex: 1; }
        .sig-line { border-top: 2px solid #000; margin-bottom: 8px; }
        .sig-label { font-weight: 700; text-transform: uppercase; font-size: 10px; }
        .sig-sub { font-size: 9px; color: #555; }
        .footer { text-align: center; margin-top: 50px; font-size: 8px; color: #888; border-top: 1px solid #ddd; padding-top: 10px; }
        .data-periodo { font-size: 9px; color: #555; }
        @media print { @page { size: A4 portrait; margin: 1.2cm; } body { padding: 0; } }
      </style>
    </head>
    <body onload="window.print()">
      <div class="container">
        <div class="header">
          ${imgPrint ? `<img src="${imgPrint}">` : ''}
          <h1>${esc(orgNome)}</h1>
          <h2>PROTOCOLO DE ENTREGA</h2>
          <div class="protocolo-num">Nº ${esc(protocolo.numero)}</div>
          <div style="font-size:10px;color:#666;margin-top:4px">Emitido em: ${hoje.toLocaleDateString('pt-BR')} às ${hoje.toLocaleTimeString('pt-BR')}</div>
        </div>

        ${justificativas.length ? `
        <div class="section">
          <h3>📝 Justificativas de Ponto (${justificativas.length})</h3>
          <table class="details">
            <thead>
              <tr>
                <th style="width:5%">#</th>
                <th style="width:25%">Servidor</th>
                <th style="width:10%">Matrícula</th>
                <th style="width:15%">Setor</th>
                <th style="width:15%">Motivo</th>
                <th style="width:30%">Datas / Período</th>
              </tr>
            </thead>
            <tbody>
              ${justificativas.map((item, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td><strong>${esc(item.srvNome)}</strong></td>
                  <td>${esc(item.srvMatricula)}</td>
                  <td>${esc(item.srvSetor)}</td>
                  <td>${getMotivoLabel(item.motivo)}${item.motivoOutro ? '<br><em>' + esc(item.motivoOutro) + '</em>' : ''}</td>
                  <td>${item.datas.map(d => fmtDate(d.data) + ' <span class="data-periodo">(' + d.periodo + ')</span>').join('<br>')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>` : ''}

        ${atestados.length ? `
        <div class="section">
          <h3>🩺 Atestados Médicos (${atestados.length})</h3>
          <table class="details">
            <thead>
              <tr>
                <th style="width:5%">#</th>
                <th style="width:30%">Servidor</th>
                <th style="width:12%">Matrícula</th>
                <th style="width:18%">Setor</th>
                <th style="width:35%">Datas</th>
              </tr>
            </thead>
            <tbody>
              ${atestados.map((item, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td><strong>${esc(item.srvNome)}</strong></td>
                  <td>${esc(item.srvMatricula)}</td>
                  <td>${esc(item.srvSetor)}</td>
                  <td>${item.datas.map(d => fmtDate(d.data)).join('<br>')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>` : ''}

        <div class="declaration">
          "Pelo presente termo, declaro que recebi as justificativas de ponto e/ou atestados médicos<br>
          acima relacionados, para fins de registro e arquivamento no setor de pessoal."
        </div>

        <div class="sig-area">
          <div class="sig-box">
            <div class="sig-line"></div>
            <div class="sig-label">${esc(config.coordenadorAPS || 'Coordenador(a) do RH')}</div>
            <div class="sig-sub">Coordenador(a) de Recursos Humanos</div>
            <div class="sig-sub" style="margin-top:4px;font-size:8px;color:#999">Assinatura e Carimbo</div>
          </div>
        </div>

        <div class="footer">
          Documento emitido eletronicamente em ${hoje.toLocaleDateString('pt-BR')} às ${hoje.toLocaleTimeString('pt-BR')} - Protocolo Nº ${esc(protocolo.numero)}<br>
          ${esc(orgNome)}
        </div>
      </div>
    </body>
    </html>
  `;
  win.document.write(fullHTML);
  win.document.close();
}
