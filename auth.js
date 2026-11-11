// Módulo Auth.
// Verificação de sessão, login (Supabase Auth), troca de senha e migração de dados.

// ===================== SEGURANÇA E NAVEGAÇÃO =====================
// O login é feito pelo Supabase Auth. O perfil (admin/gestor/servidor) vem
// assinado dentro do token e é conferido pelo banco em cada consulta (RLS).
// O objeto "ferias_sessao" do sessionStorage serve apenas para montar a tela.

const ATLAS_TABELAS_CACHE = ['servidores', 'programacoes', 'folgas', 'banco_horas', 'solicitacoes',
  'gestores', 'autorizacoes', 'eventos', 'veiculos', 'cargos', 'credenciados', 'ponto_mensal',
  'protocolos', 'itens_protocolo', 'oficios', 'destinatarios', 'emissores', 'notificacoes',
  'ponto_folhas', 'ponto_historico', 'logs'];

// Apaga deste navegador os dados pessoais guardados em cache (computador compartilhado).
// Mantém aparência (logos/tema) e a fila de envios pendentes.
function limparCacheLocal() {
  try {
    ATLAS_TABELAS_CACHE.forEach(t => localStorage.removeItem('srv_' + t));
    Object.keys(localStorage).forEach(k => { if (k.indexOf('srv_ids_nuvem_') === 0) localStorage.removeItem(k); });
    localStorage.removeItem('ferias_credenciais');
  } catch (e) { /* ignora */ }
}

// Logos, título e cores para a tela de login e para os links públicos (sem dados pessoais).
async function carregarAparenciaPublica() {
  try {
    const { data, error } = await supabaseClient.rpc('atlas_config_publica');
    if (error || !Array.isArray(data) || !data.length) return;
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem('srv_config') || '{}'); } catch (e) { cfg = {}; }
    data.forEach(item => {
      if (!item || !item.chave) return;
      let v = item.valor;
      if (item.chave.indexOf('img_') !== 0) { try { v = JSON.parse(item.valor); } catch (e) { v = item.valor; } }
      cfg[item.chave] = v;
    });
    _remoteData.config = Object.assign({}, _remoteData.config || {}, cfg);
    try { localStorage.setItem('srv_config', JSON.stringify(cfg)); } catch (e) { /* cota */ }
    if (typeof aplicarConfiguracoesSalvas === 'function') aplicarConfiguracoesSalvas();
  } catch (e) { /* aparência é opcional */ }
}

// Monta os dados de tela do usuário a partir da conta autenticada.
async function montarSessaoAtlas(authUser) {
  const meta = (authUser && authUser.app_metadata) || {};
  const role = meta.atlas_role;
  const id = meta.atlas_id;
  if (!role || !id) return null;
  const base = { id: id, role: role, loginAt: new Date().toISOString() };
  try {
    if (role === 'admin' || role === 'gestor') {
      const { data } = await supabaseClient.from('gestores').select('*').eq('id', id).maybeSingle();
      if (!data) return null;
      return Object.assign(base, {
        usuario: data.usuario,
        nome: data.nome || (role === 'admin' ? 'Administrador' : 'Gestor'),
        cargo: data.cargo || '',
        setores: data.setores || [],
        modulos: data.modulos || []
      });
    }
    const { data } = await supabaseClient.from('servidores').select('*').eq('id', id).maybeSingle();
    if (!data) return null;
    return Object.assign(base, { usuario: data.matricula, nome: data.nome });
  } catch (e) {
    console.warn('Falha ao carregar o cadastro do usuário:', e);
    return null;
  }
}

async function verificarSessao() {
  // Se for link de comprovante, renderiza direto sem login
  const oficioParams = new URLSearchParams(window.location.search);
  const oficioToken = oficioParams.get('oficio');
  if (oficioToken) {
    await carregarAparenciaPublica();
    renderOficioPublico(oficioToken);
    return;
  }

  const notifToken = oficioParams.get('notificacao');
  if (notifToken) {
    await carregarAparenciaPublica();
    renderNotificacaoPublico(notifToken);
    return;
  }

  const compToken = oficioParams.get('comp');
  if (compToken) {
    document.querySelector('.app-container').style.display = 'none';
    document.getElementById('login-screen').style.display = 'none';
    let comp = null;
    try {
      const { data } = await supabaseClient.rpc('atlas_comprovante_publico', { p_token: compToken });
      comp = data;
    } catch (e) { console.warn('Erro ao buscar comprovante:', e); }
    if (comp && comp.folga && comp.servidor) {
      await carregarAparenciaPublica();
      _remoteData.folgas = [normalizarCamposObjeto(comp.folga)];
      _remoteData.servidores = [comp.servidor];
      renderComprovanteOnline(comp.folga.id);
      return;
    }
    document.body.innerHTML = '<div style="text-align:center;padding:60px;font-family:sans-serif"><h2>Link inválido ou expirado</h2><p>Este comprovante não está mais disponível.</p><p style="font-size:14px;color:#888;margin-top:20px">Peça ao administrador para gerar um novo link.</p></div>';
    return;
  }

  // Confere a sessão real (Supabase Auth). Sem ela, não há acesso.
  let sbSession = null;
  try {
    const { data } = await supabaseClient.auth.getSession();
    sbSession = data && data.session ? data.session : null;
  } catch (e) { sbSession = null; }

  const semInternet = (typeof navigator !== 'undefined' && navigator.onLine === false);
  if (sbSession) {
    const meta = sbSession.user.app_metadata || {};
    let sessaoTela = null;
    try { sessaoTela = JSON.parse(sessionStorage.getItem('ferias_sessao') || 'null'); } catch (e) { sessaoTela = null; }
    if (!meta.atlas_role) {
      sessaoTela = null;
    } else if (!sessaoTela || sessaoTela.id !== meta.atlas_id) {
      sessaoTela = await montarSessaoAtlas(sbSession.user);
    } else {
      sessaoTela.role = meta.atlas_role; // o perfil vale o que está no token, não o que está no navegador
    }
    if (sessaoTela) sessionStorage.setItem('ferias_sessao', JSON.stringify(sessaoTela));
    else {
      sessionStorage.removeItem('ferias_sessao');
      try { await supabaseClient.auth.signOut(); } catch (e) { /* ignora */ }
    }
  } else if (!semInternet) {
    // Sem sessão válida: derruba a sessão de tela (offline, mantém o que já estava aberto).
    sessionStorage.removeItem('ferias_sessao');
  }

  // Gerador de Ofícios em tela cheia (?modulo=oficios): agora exige login da gestão.
  if (oficioParams.get('modulo') === 'oficios') {
    let s = null;
    try { s = JSON.parse(sessionStorage.getItem('ferias_sessao') || 'null'); } catch (e) { s = null; }
    if (s && (s.role === 'admin' || s.role === 'gestor')) {
      renderOficiosPublico();
      return;
    }
  }

  const sessaoStr = sessionStorage.getItem('ferias_sessao');
  const appContainer = document.querySelector('.app-container');
  const loginScreen = document.getElementById('login-screen');
  const bnav = document.getElementById('bottom-nav');

  if (sessaoStr) {
    // 1. Mostrar o app IMEDIATAMENTE (Offline-First com cache local)
    if (appContainer) appContainer.style.display = 'flex';
    if (loginScreen) loginScreen.style.display = 'none';
    if (bnav) bnav.style.display = '';

    const sessao = JSON.parse(sessaoStr);
    
    // Atualiza nome na UI
    const nameEl = document.getElementById('display-user-name');
    if (nameEl) {
      let displayName = sessao.nome;
      if (!displayName || displayName === 'Usuário') {
        if (sessao.role === 'admin') displayName = 'Administrador';
        else if (sessao.role === 'gestor') displayName = 'Gestor';
        else displayName = 'Servidor';
      }
      nameEl.textContent = displayName;
    }
    
    const role = sessao.role || 'servidor';
    const isAdmin = role === 'admin';
    const isGestor = role === 'gestor';
    
    // Controle de abas por role
    const adminTabs = ['tab-config', 'tab-gestores', 'tab-auditoria', 'tab-backup', 'label-admin-section'];
    const gestorTabs = ['tab-alertas', 'tab-pendencias', 'tab-saldos', 'tab-servidores', 'tab-aniversariantes', 'tab-ferias', 'tab-calendario', 'tab-emitir-aut', 'tab-autorizacoes', 'tab-folgas', 'tab-bancohoras', 'tab-coberturas', 'tab-solicitacoes', 'tab-oficios', 'tab-notificacoes', 'tab-relatorio', 'tab-mapaausencias', 'tab-eventos', 'tab-veiculos', 'tab-ponto', 'tab-pontomensal', 'tab-assinatura'];
    
    adminTabs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = isAdmin ? 'flex' : 'none';
      if (el && id === 'label-admin-section') el.style.display = isAdmin ? 'block' : 'none';
    });
    
    gestorTabs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (isAdmin) el.style.display = 'flex';
        else if (isGestor) el.style.display = 'flex'; // ajustado pelas permissões abaixo
        else el.style.display = (id === 'tab-relatorio' || id === 'tab-solicitacoes') ? 'flex' : 'none';
      }
    });

    // Aplica os módulos liberados para o gestor (se ele tiver uma lista definida)
    let modulosLiberados = null;
    if (isGestor && !isAdmin && Array.isArray(sessao.modulos) && sessao.modulos.length) {
      modulosLiberados = sessao.modulos;
      if (typeof MODULOS_SISTEMA !== 'undefined') {
        MODULOS_SISTEMA.forEach(m => {
          const el = document.getElementById(m.tab);
          if (el) el.style.display = modulosLiberados.includes(m.id) ? 'flex' : 'none';
        });
      }
      // Ajusta também a barra de navegação inferior (mobile)
      const bnavMap = {
        'bnav-alertas': 'alertas',
        'bnav-servidores': 'servidores',
        'bnav-ferias': 'ferias',
        'bnav-folgas': 'folgas',
        'bnav-mapaausencias': 'mapaausencias',
        'bnav-protocolo': 'protocolo'
      };
      Object.entries(bnavMap).forEach(([elId, modId]) => {
        const el = document.getElementById(elId);
        if (el) el.style.display = modulosLiberados.includes(modId) ? 'flex' : 'none';
      });
    }
    
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab) {
      const el = document.getElementById(activeTab.id);
      if (el && el.style.display === 'none') {
        let fallback = (isAdmin || isGestor) ? 'alertas' : 'relatorio';
        // Se o gestor não tem acesso ao Dashboard, usa o primeiro módulo liberado
        if (isGestor && !isAdmin && modulosLiberados && !modulosLiberados.includes('alertas')) {
          const primeiro = (typeof MODULOS_SISTEMA !== 'undefined')
            ? MODULOS_SISTEMA.find(m => modulosLiberados.includes(m.id))
            : null;
          if (primeiro) fallback = primeiro.id;
        }
        showTab(fallback);
      }
    }
    
    // Inicializa a interface imediatamente com o cache local (instantâneo)
    initApp();

    // 2. Sincroniza com o Supabase em background sem travar o carregamento inicial
    // Com retry automático em caso de falha (até 3 tentativas)
    const tentarSyncComRetry = async (tentativa = 1) => {
      const syncOk = await syncComSupabase(true);
      if (syncOk) {
        const painelAtivo = document.querySelector('.tab-panel.active');
        if (painelAtivo) {
          renderAposSync(painelAtivo.id.replace('panel-', ''));
        }
      } else if (tentativa < 3) {
        console.warn(`⚠️ Sync falhou (tentativa ${tentativa}/3). Retentando em ${tentativa * 2}s...`);
        await new Promise(r => setTimeout(r, tentativa * 2000));
        return tentarSyncComRetry(tentativa + 1);
      } else {
        console.error("❌ Sync falhou após 3 tentativas. Usando dados locais.");
        toastMsg("Não foi possível carregar dados da nuvem. Usando dados locais.", "warning");
      }
    };
    tentarSyncComRetry();

    // Senha provisória/antiga: obriga a troca antes de usar o sistema.
    if (sbSession && sbSession.user && sbSession.user.app_metadata && sbSession.user.app_metadata.trocar_senha) {
      abrirModalAlterarSenha(true);
    }

  } else {
    // Exibe tela de login instantaneamente
    if (appContainer) appContainer.style.display = 'none';
    if (loginScreen) loginScreen.style.display = 'flex'; 
    const bnav2 = document.getElementById('bottom-nav'); 
    if (bnav2) bnav2.style.display = 'none';
    
    document.getElementById('inputUser').value = '';
    document.getElementById('inputPass').value = '';
    document.getElementById('inputUser').focus();

    // Nada de dados pessoais antes do login: limpa o cache e carrega só a aparência.
    limparCacheLocal();
    carregarAparenciaPublica();
  }
}

// ===================== HASH DE SENHA (SHA-256) =====================
async function hashSenha(senha) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(senha)));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isSenhaHash(s) {
  // Um hash SHA-256 tem exatamente 64 caracteres hexadecimais
  return typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
}

// ===================== LOGIN =====================
function toggleSenhaLogin() {
  const input = document.getElementById('inputPass');
  const icon = document.getElementById('eyeIconLogin');
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fa-solid fa-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'fa-solid fa-eye';
  }
}

function limparErroLogin() {
  document.getElementById('errorMsgLogin').classList.remove('show');
}

function mostrarErroLogin(msg) {
  const btn = document.getElementById('btnLogin');
  if (btn) { btn.classList.remove('loading'); btn.innerText = 'Entrar no Sistema'; }
  const txt = document.getElementById('errorTextLogin');
  if (txt) txt.textContent = msg || 'Usuário ou senha incorretos.';
  document.getElementById('errorMsgLogin').classList.add('show');
}

let _loginEmAndamento = false;
async function tentarLogin() {
  const user = document.getElementById('inputUser').value.trim();
  const pass = document.getElementById('inputPass').value;
  const btn = document.getElementById('btnLogin');

  if (!user || !pass || _loginEmAndamento) return;
  _loginEmAndamento = true;

  btn.classList.add('loading');
  btn.innerText = 'Verificando...';

  try {
    // A senha nunca sai do navegador em texto puro: vai o SHA-256 dela,
    // que o Supabase Auth ainda protege com bcrypt no servidor.
    const passHash = await hashSenha(pass);

    // 1. Descobre a conta interna a partir do usuário (gestor) ou matrícula (servidor)
    const { data: contas, error: errContas } = await supabaseClient.rpc('atlas_resolver_login', { p_usuario: user });
    if (errContas) {
      console.error('Erro ao localizar conta:', errContas);
      const naoPreparado = errContas.code === 'PGRST202' || /atlas_resolver_login/i.test(errContas.message || '');
      mostrarErroLogin(naoPreparado
        ? 'O banco ainda não foi preparado para o novo login (falta rodar a Parte A).'
        : 'Não foi possível conectar. Verifique a internet e tente de novo.');
      return;
    }

    // 2. Tenta entrar (a conferência da senha é feita no servidor)
    let authUser = null;
    let bloqueado = false;
    for (const c of (contas || [])) {
      if (!c || !c.email) continue;
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email: c.email, password: passHash });
      if (!error && data && data.user) { authUser = data.user; break; }
      if (error && (error.status === 429 || /rate limit/i.test(error.message || ''))) bloqueado = true;
    }

    if (!authUser) {
      mostrarErroLogin(bloqueado ? 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' : 'Usuário ou senha incorretos.');
      return;
    }

    // 3. Monta os dados de tela
    const sessao = await montarSessaoAtlas(authUser);
    if (!sessao) {
      try { await supabaseClient.auth.signOut(); } catch (e) { /* ignora */ }
      mostrarErroLogin('Seu cadastro não foi encontrado. Procure a Coordenação.');
      return;
    }
    sessionStorage.setItem('ferias_sessao', JSON.stringify(sessao));
    btn.classList.remove('loading');
    btn.innerText = 'Entrar no Sistema';
    logadoComSucesso();
  } catch (e) {
    console.error('Falha no login:', e);
    mostrarErroLogin('Não foi possível entrar. Verifique a internet e tente de novo.');
  } finally {
    _loginEmAndamento = false;
  }
}

// ===================== SENHAS =====================
function validarNovaSenha(senha) {
  if (!senha || senha.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/^(\d)\1+$/.test(senha) || ['123456', '1234567', '12345678', '654321', 'senha123', 'admin123'].includes(senha.toLowerCase())) {
    return 'Essa senha é muito fácil de adivinhar. Escolha outra.';
  }
  return '';
}

let _trocaSenhaObrigatoria = false;
function abrirModalAlterarSenha(obrigatorio) {
  _trocaSenhaObrigatoria = !!obrigatorio;
  const m = document.getElementById('modal-alterar-senha');
  if (!m) return;
  document.getElementById('mn-nova-senha').value = '';
  document.getElementById('mn-conf-senha').value = '';
  const p = m.querySelector('p');
  if (p) p.textContent = _trocaSenhaObrigatoria
    ? 'Por segurança, crie uma senha nova e pessoal antes de continuar. Não use a senha antiga.'
    : 'Defina uma nova senha para seu acesso.';
  const cancelar = m.querySelector('.modal-footer .btn-ghost');
  if (cancelar) cancelar.style.display = _trocaSenhaObrigatoria ? 'none' : '';
  m.classList.add('open');
}

async function alterarMinhaSenha() {
  const nova = document.getElementById('mn-nova-senha').value;
  const conf = document.getElementById('mn-conf-senha').value;
  const erro = validarNovaSenha(nova);
  if (erro) return toastMsg(erro, 'error');
  if (nova !== conf) return toastMsg('As senhas não conferem.', 'error');
  try {
    const { error } = await supabaseClient.rpc('atlas_trocar_minha_senha', { p_senha_hash: await hashSenha(nova) });
    if (error) throw error;
    try { await supabaseClient.auth.refreshSession(); } catch (e) { /* o token novo vem no próximo login */ }
    _trocaSenhaObrigatoria = false;
    document.getElementById('modal-alterar-senha').classList.remove('open');
    toastMsg('✅ Senha alterada com sucesso.');
    if (typeof DB !== 'undefined' && DB.saveLog) DB.saveLog('Segurança', 'Alterou a própria senha');
  } catch (e) {
    console.error('Erro ao alterar senha:', e);
    toastMsg('Não foi possível alterar a senha: ' + (e.message || e), 'error');
  }
}

// Enquanto a troca for obrigatória, o modal não pode ser fechado clicando fora.
document.addEventListener('click', function (ev) {
  if (!_trocaSenhaObrigatoria) return;
  const m = document.getElementById('modal-alterar-senha');
  if (m && ev.target === m) { ev.stopImmediatePropagation(); m.classList.add('open'); }
}, true);

// Gestão define (ou redefine) a senha de acesso de um servidor ou gestor.
// A pessoa será obrigada a trocar por uma senha pessoal no primeiro acesso.
async function definirSenhaDeAcesso(tipo, id, senha, forcarTroca) {
  const erro = (!senha || senha.length < 6) ? 'A senha provisória precisa ter pelo menos 6 caracteres.' : '';
  if (erro) { toastMsg(erro, 'error'); return false; }
  const { error } = await supabaseClient.rpc('atlas_definir_senha', {
    p_tipo: tipo, p_id: id, p_senha_hash: await hashSenha(senha), p_forcar_troca: forcarTroca !== false
  });
  if (error) {
    console.error('Erro ao definir senha:', error);
    toastMsg('Não foi possível definir a senha: ' + (error.message || ''), 'error');
    return false;
  }
  return true;
}

function abrirModalDefinirSenha(id) {
  const srv = DB.servidores().find(s => s.id === id);
  if (!srv) return;
  let m = document.getElementById('modal-definir-senha');
  if (!m) {
    m = document.createElement('div');
    m.className = 'modal-bg';
    m.id = 'modal-definir-senha';
    m.innerHTML =
      '<div class="modal" style="max-width:360px">' +
        '<h3>🔑 Senha de acesso</h3>' +
        '<p id="mds-texto" style="font-size:.78rem;color:var(--muted);margin-bottom:16px"></p>' +
        '<div class="field" style="margin-bottom:20px"><label>Senha provisória</label>' +
        '<input type="text" id="mds-senha" autocomplete="off" placeholder="Mínimo 6 caracteres"></div>' +
        '<div class="modal-footer">' +
          '<button class="btn btn-ghost" onclick="fecharModal(\'modal-definir-senha\')">Cancelar</button>' +
          '<button class="btn btn-primary" id="mds-ok">Definir senha</button>' +
        '</div>' +
      '</div>';
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
    document.body.appendChild(m);
  }
  document.getElementById('mds-texto').textContent =
    srv.nome + ' (Mat. ' + srv.matricula + ') vai entrar com a matrícula e esta senha provisória, e o sistema pedirá uma senha pessoal no primeiro acesso.';
  const input = document.getElementById('mds-senha');
  input.value = '';
  document.getElementById('mds-ok').onclick = async function () {
    const ok = await definirSenhaDeAcesso('servidores', id, input.value.trim(), true);
    if (!ok) return;
    fecharModal('modal-definir-senha');
    toastMsg('✅ Senha provisória definida para ' + srv.nome + '.');
    DB.saveLog('Segurança', 'Definiu senha provisória de acesso para ' + srv.nome, 'servidores', id);
  };
  m.classList.add('open');
  setTimeout(() => input.focus(), 100);
}

// Função de utilitário para migrar dados locais para o Supabase
async function migrarDadosParaSupabase() {
  if (!confirm("⚠️ ATENÇÃO: Deseja migrar todos os dados locais (deste computador) para o BANCO ONLINE?\n\nIsso enviará seus servidores, programações e folgas para a nuvem.")) return;
  
  const toast = toastMsg("🚀 Migrando dados... aguarde.", "info", 0);
  
  try {
    const servidores = DB.servidores();
    const programacoes = DB.programacoes();
    const folgas = DB.folgas();
    const solicitacoes = DB.solicitacoes();
    const gestores = DB.gestores();
    const config = DB.config();

    async function salvarComHandleError(tabela, dados) {
      try {
        if (tabela === 'configuracoes') {
          const configArray = Object.entries(dados)
            .filter(([key]) => !key.startsWith('img_'))
            .map(([key, value]) => ({
              chave: key,
              valor: typeof value === 'string' ? value : JSON.stringify(value)
            }));
          await supabaseClient.from('configuracoes').upsert(configArray);
        } else {
          await supabaseClient.from(tabela).upsert(dados);
        }
      } catch (e) {
        if (isQuotaError(e)) {
          saveToSyncQueue(tabela, dados);
        }
        throw e;
      }
    }
    
    if (servidores.length) await salvarComHandleError('servidores', servidores.map(x => { const c = { ...x }; delete c.senha; return c; }));
    if (programacoes.length) await salvarComHandleError('programacoes', programacoes);
    if (folgas.length) await salvarComHandleError('folgas', folgas);
    if (solicitacoes.length) await salvarComHandleError('solicitacoes', solicitacoes);
    if (gestores.length) await salvarComHandleError('gestores', gestores.map(g => { const c = { ...g }; delete c.senha; return c; }));
    await salvarComHandleError('configuracoes', config);
    
    toastMsg("✅ Migração concluída com sucesso! Recarregando...");
    setTimeout(() => location.reload(), 2000);
  } catch (err) {
    console.error(err);
    const msg = err.message || "";
    if (isQuotaError(err)) {
      toastMsg("⚠️Quota excedido. Dados salvos localmente.", "warning");
    } else {
      toastMsg("❌ Erro na migração: " + msg, "error");
    }
  }
}

function logadoComSucesso() {
  // Esconder login e ir direto para o app (sync acontece em background com skeletons)
  const loginScreen = document.getElementById('login-screen');
  const appContainer = document.querySelector('.app-container');
  const bnav = document.getElementById('bottom-nav');
  if (loginScreen) loginScreen.style.display = 'none';
  if (appContainer) appContainer.style.display = 'flex';
  if (bnav) bnav.style.display = '';
  verificarSessao();
}


// setVinculo movida para servidores.js



// setVinculoEdit movida para servidores.js


// ===================== STORAGE (SUPABASE BRIDGE) =====================
