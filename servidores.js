// Módulo Servidores.
// Cadastro, edição, exclusão, vínculo e tabela de servidores.

function setVinculo(v) {
  document.getElementById('f-vinculo').value = v;
  const btns = document.querySelectorAll('#aba-f-vinculo .aba-item');
  btns.forEach(b => {
    b.classList.toggle('active', b.innerText.toLowerCase() === v.toLowerCase());
  });
}

function setVinculoEdit(v) {
  document.getElementById('edit-vinculo').value = v;
  const btns = document.querySelectorAll('#aba-edit-vinculo .aba-item');
  btns.forEach(b => {
    b.classList.toggle('active', b.innerText.toLowerCase() === v.toLowerCase());
  });
}

function limparFormServidor() {
  document.getElementById('f-matricula').value = '';
  document.getElementById('f-nome').value = '';
  document.getElementById('f-nascimento').value = '';
  document.getElementById('f-admissao').value = '';
  document.getElementById('f-setor').value = '';
  document.getElementById('f-cargo').value = '';
  document.getElementById('f-telefone').value = '';
  document.getElementById('f-cpf').value = '';
  document.getElementById('f-pis').value = '';
  document.getElementById('f-vinculo').value = 'efetivo';
  document.querySelectorAll('#aba-f-vinculo .aba-item').forEach(function(b) { b.classList.toggle('active', b.textContent.trim().toLowerCase() === 'efetivo'); });
  document.getElementById('f-ferias-reg').value = '0';
  document.getElementById('f-ferias-prem').value = '0';
  document.getElementById('f-foto-base64').value = '';
  document.getElementById('f-foto-preview').innerHTML = '<span style="font-size:24px">📷</span><span>Adicionar foto</span>';
  delete document.getElementById('f-matricula').dataset.editId;
}

async function salvarServidor() {
  const matricula = document.getElementById('f-matricula').value.trim();
  const nome = document.getElementById('f-nome').value.trim();
  const nascimento = document.getElementById('f-nascimento').value;
  const admissao = document.getElementById('f-admissao').value;
  const setor = document.getElementById('f-setor').value;
  const cargo = document.getElementById('f-cargo').value.trim();
  if (!matricula || !nome || !nascimento || !admissao || !setor || !cargo) {
    toastMsg('Preencha todos os campos obrigatórios (*).', 'error'); return;
  }
  const editId = document.getElementById('f-matricula').dataset.editId;
  const lista = DB.servidores();
  if (editId) {
    const idx = lista.findIndex(function(s) { return s.id === editId; });
    if (idx >= 0) {
      lista[idx] = {
        id: editId,
        matricula: matricula,
        nome: nome,
        nascimento: nascimento,
        admissao: admissao,
        setor: setor,
        cargo: cargo,
        telefone: document.getElementById('f-telefone').value.trim(),
        cpf: document.getElementById('f-cpf').value.trim(),
        pis: document.getElementById('f-pis').value.trim(),
        vinculo: document.getElementById('f-vinculo').value,
        feriasReg: parseInt(document.getElementById('f-ferias-reg').value) || 0,
        feriasPrem: parseInt(document.getElementById('f-ferias-prem').value) || 0,
        foto: document.getElementById('f-foto-base64').value || lista[idx].foto || ''
      };
    }
  } else {
    if (lista.some(function(s) { return s.matricula === matricula; })) {
      toastMsg('Matrícula já cadastrada.', 'error'); return;
    }
    lista.push({
      id: uid(12),
      matricula: matricula,
      nome: nome,
      nascimento: nascimento,
      admissao: admissao,
      setor: setor,
      cargo: cargo,
      telefone: document.getElementById('f-telefone').value.trim(),
      cpf: document.getElementById('f-cpf').value.trim(),
      pis: document.getElementById('f-pis').value.trim(),
      vinculo: document.getElementById('f-vinculo').value,
      feriasReg: parseInt(document.getElementById('f-ferias-reg').value) || 0,
      feriasPrem: parseInt(document.getElementById('f-ferias-prem').value) || 0,
      foto: document.getElementById('f-foto-base64').value || ''
    });
  }
  await DB.saveServidores(lista);
  limparFormServidor();
  renderTabela();
  atualizarSelectsSetores();
  toastMsg(editId ? 'Servidor atualizado.' : 'Servidor cadastrado.');
}

function editarServidor(id) {
  const s = DB.servidores().find(function(x) { return x.id === id; });
  if (!s) return;
  document.getElementById('f-matricula').value = s.matricula;
  document.getElementById('f-nome').value = s.nome;
  document.getElementById('f-nascimento').value = s.nascimento || '';
  document.getElementById('f-admissao').value = s.admissao || '';
  document.getElementById('f-setor').value = s.setor || '';
  document.getElementById('f-cargo').value = s.cargo || '';
  document.getElementById('f-telefone').value = s.telefone || '';
  document.getElementById('f-cpf').value = s.cpf || '';
  document.getElementById('f-pis').value = s.pis || '';
  setVinculo(s.vinculo || 'efetivo');
  document.getElementById('f-ferias-reg').value = s.feriasReg || 0;
  document.getElementById('f-ferias-prem').value = s.feriasPrem || 0;
  if (s.foto) {
    document.getElementById('f-foto-base64').value = s.foto;
    document.getElementById('f-foto-preview').innerHTML = '<img src="' + s.foto + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
  }
  document.getElementById('f-matricula').dataset.editId = id;
  document.getElementById('panel-servidores').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deletarServidor(id) {
  if (!confirm('Excluir este servidor permanentemente?')) return;
  let lista = DB.servidores().filter(function(s) { return s.id !== id; });
  await DB.saveServidores(lista);
  await DB.deleteServidor(id);
  renderTabela();
  atualizarSelectsSetores();
  toastMsg('Servidor excluído.');
}

function renderTabela() {
  const busca = (document.getElementById('busca-servidor')?.value || '').toLowerCase();
  const filtroSetor = document.getElementById('filtro-setor')?.value || '';
  const servidores = getServidoresAcessiveis();
  const sel = document.getElementById('filtro-setor');
  if (sel) {
    const cur = sel.value;
    const setores = [...new Set(DB.servidores().map(function(s) { return s.setor; }).filter(Boolean))];
    sel.innerHTML = '<option value="">Todos os Setores</option>' + setores.map(function(s) { return '<option value="' + s + '" ' + (s===cur?'selected':'') + '>' + s + '</option>'; }).join('');
  }
  const filtrados = servidores.filter(function(s) {
    if (filtroSetor && s.setor !== filtroSetor) return false;
    if (!busca) return true;
    return (s.nome || '').toLowerCase().includes(busca) || (s.matricula || '').includes(busca) || (s.setor || '').toLowerCase().includes(busca);
  });
  const tbody = document.getElementById('tbody-servidores');
  if (!tbody) return;
  if (!filtrados.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:40px">Nenhum servidor encontrado.</td></tr>';
    const pagEl = document.getElementById('paginacao-servidores');
    if (pagEl) pagEl.innerHTML = '';
    return;
  }
  const totalPages = Math.ceil(filtrados.length / rowsPerPage);
  if (currentPage > totalPages) currentPage = totalPages || 1;
  const inicio = (currentPage - 1) * rowsPerPage;
  const paginados = filtrados.slice(inicio, inicio + rowsPerPage);
  renderPaginacao('paginacao-servidores', totalPages, 'renderTabela');
  tbody.innerHTML = paginados.map(function(s) {
    const fotoHtml = getAvatarHtml(s.foto, s.nome, 40, '', '');
    return '<tr><td>' + fotoHtml + '</td><td>' + esc(s.matricula) + '</td><td><strong>' + esc(s.nome) + '</strong></td><td>' + fmtDate(s.nascimento) + '</td><td>' + fmtDate(s.admissao) + '</td><td>' + esc(s.setor || '-') + '</td><td>' + esc(s.cargo || '-') + '</td><td>' + (s.feriasReg || 0) + '</td><td>' + (s.feriasPrem || 0) + '</td><td><button class="btn btn-ghost btn-sm" onclick="editarServidor(\'' + s.id + '\')">✏️</button> <button class="btn btn-danger btn-sm" onclick="deletarServidor(\'' + s.id + '\')">🗑️</button></td></tr>';
  }).join('');
}
