// Módulo Gestores.
// Cadastro, setores permitidos, módulos de acesso e tabela de gestores.

// Registro dos módulos (abas) que podem ser liberados por gestor.
const MODULOS_SISTEMA = [
  { id: 'alertas', tab: 'tab-alertas', label: 'Dashboard' },
  { id: 'servidores', tab: 'tab-servidores', label: 'Servidores' },
  { id: 'aniversariantes', tab: 'tab-aniversariantes', label: 'Aniversariantes' },
  { id: 'ferias', tab: 'tab-ferias', label: 'Programar Férias' },
  { id: 'calendario', tab: 'tab-calendario', label: 'Calendário Visual' },
  { id: 'folgas', tab: 'tab-folgas', label: 'Banco de Folgas' },
  { id: 'bancohoras', tab: 'tab-bancohoras', label: 'Banco de Horas' },
  { id: 'coberturas', tab: 'tab-coberturas', label: 'Coberturas' },
  { id: 'oficios', tab: 'tab-oficios', label: 'Gerador de Ofícios' },
  { id: 'emitir-aut', tab: 'tab-emitir-aut', label: 'Emitir Autorização' },
  { id: 'autorizacoes', tab: 'tab-autorizacoes', label: 'Histórico de Autorizações' },
  { id: 'solicitacoes', tab: 'tab-solicitacoes', label: 'Solicitações' },
  { id: 'eventos', tab: 'tab-eventos', label: 'Gerenciar Eventos' },
  { id: 'veiculos', tab: 'tab-veiculos', label: 'Controle de Frotas' },
  { id: 'ponto', tab: 'tab-ponto', label: 'Ponto Credenciados' },
  { id: 'pontomensal', tab: 'tab-pontomensal', label: 'Fechamento de Ponto' },
  { id: 'protocolo', tab: 'tab-protocolo', label: 'Protocolo de Entrega' },
  { id: 'presenca', tab: 'tab-presenca', label: 'Lista de Presença' },
  { id: 'relatorio', tab: 'tab-relatorio', label: 'Relatório Geral' },
  { id: 'mapaausencias', tab: 'tab-mapaausencias', label: 'Mapa de Ausências' }
];

function labelModulo(id) {
  const m = MODULOS_SISTEMA.find(function(x) { return x.id === id; });
  return m ? m.label : id;
}

function limparFormGestor() {
  document.getElementById('g-id').value = '';
  document.getElementById('g-nome').value = '';
  document.getElementById('g-usuario').value = '';
  document.getElementById('g-senha').value = '';
  const cargoEl = document.getElementById('g-cargo');
  if (cargoEl) cargoEl.value = '';
  document.getElementById('g-form-title').textContent = 'Novo Gestor';
  popularSetoresGestor();
  popularModulosGestor();
}

function popularSetoresGestor() {
  const container = document.getElementById('g-setores-check');
  if (!container) return;
  // Usa setores das Configurações + setores atrelados aos servidores automaticamente
  const setores = (typeof getTodosSetores === 'function') ? getTodosSetores() : (DB.config().setores || []);
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

function popularModulosGestor() {
  const container = document.getElementById('g-modulos-check');
  if (!container) return;
  const editId = document.getElementById('g-id').value;
  let marcados = null;
  if (editId) {
    const g = DB.gestores().find(function(x) { return x.id === editId; });
    if (g && Array.isArray(g.modulos)) marcados = g.modulos;
  }
  // Novo gestor (ou gestor sem lista salva): marca todos os módulos por padrão
  const todos = marcados === null;
  container.innerHTML = MODULOS_SISTEMA.map(function(m) {
    const checked = todos || marcados.includes(m.id);
    return '<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;background:' + (checked ? 'var(--bg-accent)' : 'transparent') + ';border:1px solid ' + (checked ? 'var(--primary)' : 'var(--border)') + '"><input type="checkbox" value="' + esc(m.id) + '" ' + (checked ? 'checked' : '') + ' onchange="this.parentElement.style.background=this.checked?\'var(--bg-accent)\':\'transparent\';this.parentElement.style.borderColor=this.checked?\'var(--primary)\':\'var(--border)\'"> ' + esc(m.label) + '</label>';
  }).join('');
}

function marcarTodosModulosGestor(marcar) {
  document.querySelectorAll('#g-modulos-check input[type=checkbox]').forEach(function(c) {
    c.checked = !!marcar;
    c.parentElement.style.background = marcar ? 'var(--bg-accent)' : 'transparent';
    c.parentElement.style.borderColor = marcar ? 'var(--primary)' : 'var(--border)';
  });
}

async function salvarGestor() {
  const nome = document.getElementById('g-nome').value.trim();
  const usuario = document.getElementById('g-usuario').value.trim();
  const senha = document.getElementById('g-senha').value;
  const cargo = (document.getElementById('g-cargo')?.value || '').trim();
  if (!nome || !usuario || !senha) {
    toastMsg('Preencha nome, usuário e senha.', 'error'); return;
  }
  const checks = document.querySelectorAll('#g-setores-check input[type=checkbox]:checked');
  const setores = Array.from(checks).map(function(c) { return c.value; });
  if (!setores.length) {
    toastMsg('Selecione ao menos um setor.', 'error'); return;
  }
  const modulos = Array.from(document.querySelectorAll('#g-modulos-check input[type=checkbox]:checked')).map(function(c) { return c.value; });
  if (!modulos.length) {
    toastMsg('Selecione ao menos um módulo de acesso.', 'error'); return;
  }
  const editId = document.getElementById('g-id').value;
  let lista = DB.gestores();
  if (editId) {
    const idx = lista.findIndex(function(g) { return g.id === editId; });
    if (idx >= 0) {
      if (lista[idx].usuario !== usuario && lista.some(function(g) { return g.usuario === usuario && g.id !== editId; })) {
        toastMsg('Usuário de login já existe.', 'error'); return;
      }
      lista[idx] = Object.assign({}, lista[idx], { id: editId, nome: nome, usuario: usuario, senha: senha, cargo: cargo, setores: setores, modulos: modulos });
    }
  } else {
    if (lista.some(function(g) { return g.usuario === usuario; })) {
      toastMsg('Usuário de login já existe.', 'error'); return;
    }
    lista.push({ id: uid(12), nome: nome, usuario: usuario, senha: senha, cargo: cargo, setores: setores, modulos: modulos });
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
  const cargoEl = document.getElementById('g-cargo');
  if (cargoEl) cargoEl.value = g.cargo || '';
  document.getElementById('g-form-title').textContent = '✏️ Editando Gestor';
  popularSetoresGestor();
  popularModulosGestor();
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
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:40px">Nenhum gestor cadastrado.</td></tr>';
    return;
  }
  tbody.innerHTML = gestores.map(function(g) {
    const setoresHtml = (g.setores || []).map(function(s) { return '<span class="tag tag-blue" style="margin:2px">' + esc(s) + '</span>'; }).join(' ') || '-';
    const mods = Array.isArray(g.modulos) ? g.modulos : MODULOS_SISTEMA.map(function(m) { return m.id; });
    const modsHtml = mods.length >= MODULOS_SISTEMA.length
      ? '<span class="tag tag-green" title="Todos os módulos">Todos</span>'
      : (mods.map(function(m) { return '<span class="tag tag-purple" style="margin:2px">' + esc(labelModulo(m)) + '</span>'; }).join(' ') || '-');
    return '<tr><td><strong>' + esc(g.nome) + '</strong>' + (g.cargo ? '<div style="font-size:.72rem;color:var(--muted)">' + esc(g.cargo) + '</div>' : '') + '</td><td>' + esc(g.usuario) + '</td><td>' + setoresHtml + '</td><td>' + modsHtml + '</td><td><button class="btn btn-ghost btn-sm" onclick="editarGestor(\'' + g.id + '\')">✏️</button> <button class="btn btn-danger btn-sm" onclick="deletarGestor(\'' + g.id + '\')">🗑️</button></td></tr>';
  }).join('');
}
