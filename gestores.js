// Módulo Gestores.
// Cadastro, setores permitidos e tabela de gestores.

function limparFormGestor() {
  document.getElementById('g-id').value = '';
  document.getElementById('g-nome').value = '';
  document.getElementById('g-usuario').value = '';
  document.getElementById('g-senha').value = '';
  document.getElementById('g-form-title').textContent = 'Novo Gestor';
  popularSetoresGestor();
}

function popularSetoresGestor() {
  const container = document.getElementById('g-setores-check');
  if (!container) return;
  const cfg = DB.config();
  const setores = cfg.setores || [];
  if (!setores.length) {
    container.innerHTML = '<p style="color:var(--muted);font-size:.82rem">Nenhum setor cadastrado. Vá em Configurações para adicionar setores.</p>';
    return;
  }
  const editId = document.getElementById('g-id').value;
  let gestorSetores = [];
  if (editId) {
    const g = DB.gestores().find(function(x) { return x.id === editId; });
    if (g) gestorSetores = g.setores || [];
  }
  container.innerHTML = setores.map(function(s) {
    const checked = gestorSetores.includes(s);
    return '<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;background:' + (checked ? 'var(--bg-accent)' : 'transparent') + ';border:1px solid ' + (checked ? 'var(--primary)' : 'var(--border)') + '"><input type="checkbox" value="' + esc(s) + '" ' + (checked ? 'checked' : '') + ' onchange="this.parentElement.style.background=this.checked?\'var(--bg-accent)\':\'transparent\';this.parentElement.style.borderColor=this.checked?\'var(--primary)\':\'var(--border)\'">' + esc(s) + '</label>';
  }).join('');
}

async function salvarGestor() {
  const nome = document.getElementById('g-nome').value.trim();
  const usuario = document.getElementById('g-usuario').value.trim();
  const senha = document.getElementById('g-senha').value;
  if (!nome || !usuario || !senha) {
    toastMsg('Preencha nome, usuário e senha.', 'error'); return;
  }
  const checks = document.querySelectorAll('#g-setores-check input[type=checkbox]:checked');
  const setores = Array.from(checks).map(function(c) { return c.value; });
  if (!setores.length) {
    toastMsg('Selecione ao menos um setor.', 'error'); return;
  }
  const editId = document.getElementById('g-id').value;
  let lista = DB.gestores();
  if (editId) {
    const idx = lista.findIndex(function(g) { return g.id === editId; });
    if (idx >= 0) {
      if (lista[idx].usuario !== usuario && lista.some(function(g) { return g.usuario === usuario && g.id !== editId; })) {
        toastMsg('Usuário de login já existe.', 'error'); return;
      }
      lista[idx] = { id: editId, nome: nome, usuario: usuario, senha: senha, setores: setores };
    }
  } else {
    if (lista.some(function(g) { return g.usuario === usuario; })) {
      toastMsg('Usuário de login já existe.', 'error'); return;
    }
    lista.push({ id: uid(12), nome: nome, usuario: usuario, senha: senha, setores: setores });
  }
  await DB.saveGestores(lista);
  limparFormGestor();
  renderGestores();
  toastMsg(editId ? 'Gestor atualizado.' : 'Gestor cadastrado.');
}

function editarGestor(id) {
  const g = DB.gestores().find(function(x) { return x.id === id; });
  if (!g) return;
  document.getElementById('g-id').value = g.id;
  document.getElementById('g-nome').value = g.nome;
  document.getElementById('g-usuario').value = g.usuario;
  document.getElementById('g-senha').value = g.senha;
  document.getElementById('g-form-title').textContent = '✏️ Editando Gestor';
  popularSetoresGestor();
  document.getElementById('panel-gestores').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deletarGestor(id) {
  if (!confirm('Excluir este gestor permanentemente?')) return;
  let lista = DB.gestores().filter(function(g) { return g.id !== id; });
  await DB.saveGestores(lista);
  await DB.deleteGestor(id);
  renderGestores();
  toastMsg('Gestor excluído.');
}

function renderGestores() {
  const tbody = document.getElementById('tbody-gestores');
  if (!tbody) return;
  const gestores = DB.gestores();
  if (!gestores.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:40px">Nenhum gestor cadastrado.</td></tr>';
    return;
  }
  tbody.innerHTML = gestores.map(function(g) {
    return '<tr><td><strong>' + esc(g.nome) + '</strong></td><td>' + esc(g.usuario) + '</td><td>' + ((g.setores||[]).map(function(s) { return '<span class="tag tag-blue" style="margin:2px">' + esc(s) + '</span>'; }).join(' ') || '-') + '</td><td><button class="btn btn-ghost btn-sm" onclick="editarGestor(\'' + g.id + '\')">✏️</button> <button class="btn btn-danger btn-sm" onclick="deletarGestor(\'' + g.id + '\')">🗑️</button></td></tr>';
  }).join('');
}
