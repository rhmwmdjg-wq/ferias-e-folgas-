// Módulo Auth.
// Verificação de sessão, login, hash de senha e migração de dados.

// ===================== SEGURANÇA E NAVEGAÇÃO =====================
async function verificarSessao() {
  // Se for link de comprovante, renderiza direto sem login
  const compParams = new URLSearchParams(window.location.search);
  const compToken = compParams.get('comp');
  if (compToken) {
    const cfg = JSON.parse(localStorage.getItem('srv_config') || '{}');
    const folgaId = cfg.comprovantes ? cfg.comprovantes[compToken] : null;
    if (folgaId) {
      document.querySelector('.app-container').style.display = 'none';
      document.getElementById('login-screen').style.display = 'none';
      renderComprovanteOnline(folgaId);
      return;
    }
    document.querySelector('.app-container').style.display = 'none';
    document.getElementById('login-screen').style.display = 'none';
    document.body.innerHTML = '<div style="text-align:center;padding:60px;font-family:sans-serif"><h2>Link inválido ou expirado</h2><p>Este comprovante não está mais disponível.</p><p style="font-size:14px;color:#888;margin-top:20px">Peça ao administrador para gerar um novo link.</p></div>';
    return;
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
    const adminTabs = ['tab-config', 'tab-gestores', 'tab-auditoria', 'label-admin-section'];
    const gestorTabs = ['tab-alertas', 'tab-servidores', 'tab-aniversariantes', 'tab-ferias', 'tab-calendario', 'tab-emitir-aut', 'tab-autorizacoes', 'tab-folgas', 'tab-bancohoras', 'tab-coberturas', 'tab-solicitacoes', 'tab-relatorio', 'tab-mapaausencias', 'tab-eventos', 'tab-veiculos', 'tab-ponto'];
    
    adminTabs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = isAdmin ? 'flex' : 'none';
      if (el && id === 'label-admin-section') el.style.display = isAdmin ? 'block' : 'none';
    });
    
    gestorTabs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (isAdmin || isGestor) el.style.display = 'flex';
        else el.style.display = (id === 'tab-relatorio' || id === 'tab-solicitacoes') ? 'flex' : 'none';
      }
    });
    
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab) {
      const el = document.getElementById(activeTab.id);
      if (el && el.style.display === 'none') {
        const fallback = (isAdmin || isGestor) ? 'alertas' : 'relatorio';
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

  } else {
    // Exibe tela de login instantaneamente
    if (appContainer) appContainer.style.display = 'none';
    if (loginScreen) loginScreen.style.display = 'flex'; 
    const bnav2 = document.getElementById('bottom-nav'); 
    if (bnav2) bnav2.style.display = 'none';
    
    document.getElementById('inputUser').value = '';
    document.getElementById('inputPass').value = '';
    document.getElementById('inputUser').focus();

    // Inicia a sincronização das credenciais em background para o login ser instantâneo
    syncComSupabase(true);
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

// Migra uma senha plain-text para hash no banco (gestores ou servidores) 
async function migrarSenhaParaHash(tipo, id, senhaPlain) {
  try {
    const hashed = await hashSenha(senhaPlain);
    await supabaseClient.from(tipo).update({ senha: hashed }).eq('id', id);
    return hashed;
  } catch(e) {
    console.warn('⚠️ Falha ao migrar senha para hash:', e);
    return null;
  }
}

// ===================== LOGIN LOGIC =====================
const CREDENCIAIS_PADRAO = [{ usuario: 'admin', senha: 'admin123', nome: 'Administrador' }];

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

async function tentarLogin() {
  const user = document.getElementById('inputUser').value.trim();
  const pass = document.getElementById('inputPass').value;
  const btn = document.getElementById('btnLogin');
  
  if (!user || !pass) return;
  
  btn.classList.add('loading');
  btn.innerText = 'Verificando...';
  
  // Se os dados estiverem vazios, tenta uma última sincronização rápida
  if (!DB.servidores().length && !DB.gestores().length) {
    await syncComSupabase();
  }

  setTimeout(async () => {
    // 1. Verificar ADMIN — checa Supabase primeiro, depois fallback local
    const passHash = await hashSenha(pass);
    const adminNoSupabase = _remoteData.gestores.find(g =>
      (g.role === 'admin' || g.usuario === 'admin') &&
      g.usuario.toLowerCase() === user.toLowerCase()
    );
    if (adminNoSupabase) {
      const senhaOk = adminNoSupabase.senha === passHash || 
                     (!isSenhaHash(adminNoSupabase.senha) && adminNoSupabase.senha === pass);
      if (senhaOk) {
        // Migrar para hash se ainda estiver em texto puro
        if (!isSenhaHash(adminNoSupabase.senha)) {
          migrarSenhaParaHash('gestores', adminNoSupabase.id, pass);
          adminNoSupabase.senha = passHash;
        }
        sessionStorage.setItem('ferias_sessao', JSON.stringify({
          id: adminNoSupabase.id,
          usuario: adminNoSupabase.usuario,
          nome: adminNoSupabase.nome || 'Administrador',
          role: 'admin',
          loginAt: new Date().toISOString()
        }));
        logadoComSucesso();
        return;
      }
    } else {
      // fallback: credenciais locais (para casos sem internet ou primeiro uso)
      const salvas = JSON.parse(localStorage.getItem('ferias_credenciais') || '[]');
      const creds = salvas.length ? salvas : CREDENCIAIS_PADRAO;
      const matchLocal = creds.find(c =>
        c.usuario.toLowerCase() === user.toLowerCase() &&
        (c.senha === passHash || (!isSenhaHash(c.senha) && c.senha === pass))
      );
      if (matchLocal) {
        // Migrar localmente para hash
        if (!isSenhaHash(matchLocal.senha)) {
          matchLocal.senha = passHash;
          localStorage.setItem('ferias_credenciais', JSON.stringify(creds));
        }
        sessionStorage.setItem('ferias_sessao', JSON.stringify({
          usuario: matchLocal.usuario,
          nome: matchLocal.nome || 'Administrador',
          role: 'admin',
          loginAt: new Date().toISOString()
        }));
        logadoComSucesso();
        return;
      }
    }

    // 2. Verificar SERVIDOR
    const servidores = DB.servidores();
    const matchSrv = servidores.find(s => {
      const dbMatricula = String(s.matricula || '').trim();
      const loginUser = String(user || '').trim();
      const dbSenha = String(s.senha || '').trim();
      return dbMatricula === loginUser &&
        (dbSenha === passHash || (!isSenhaHash(dbSenha) && dbSenha === pass));
    });
    
    if (matchSrv) {
      // Migrar senha do servidor para hash automaticamente
      if (!isSenhaHash(matchSrv.senha)) {
        migrarSenhaParaHash('servidores', matchSrv.id, pass);
        matchSrv.senha = passHash;
        const idx = _remoteData.servidores.findIndex(s => s.id === matchSrv.id);
        if (idx >= 0) _remoteData.servidores[idx].senha = passHash;
      }
      sessionStorage.setItem('ferias_sessao', JSON.stringify({ 
        id: matchSrv.id,
        usuario: matchSrv.matricula, 
        nome: matchSrv.nome, 
        role: 'servidor',
        loginAt: new Date().toISOString() 
      }));
      logadoComSucesso();
      return;
    }
    
    // 3. Verificar GESTOR
    const gestores = DB.gestores();
    const matchGest = gestores.find(g => {
      const dbUser = String(g.usuario || '').trim().toLowerCase();
      const loginUser = String(user || '').trim().toLowerCase();
      const dbPass = String(g.senha || '').trim();
      return dbUser === loginUser &&
        (dbPass === passHash || (!isSenhaHash(dbPass) && dbPass === pass));
    });

    if (matchGest) {
      // Migrar senha do gestor para hash automaticamente
      if (!isSenhaHash(matchGest.senha)) {
        migrarSenhaParaHash('gestores', matchGest.id, pass);
        matchGest.senha = passHash;
        const idxG = _remoteData.gestores.findIndex(g => g.id === matchGest.id);
        if (idxG >= 0) _remoteData.gestores[idxG].senha = passHash;
      }
      sessionStorage.setItem('ferias_sessao', JSON.stringify({ 
        id: matchGest.id,
        usuario: matchGest.usuario, 
        nome: matchGest.nome, 
        role: 'gestor',
        setores: matchGest.setores || [],
        loginAt: new Date().toISOString() 
      }));
      logadoComSucesso();
      return;
    }

    // Caso falhe
    btn.classList.remove('loading');
    btn.innerText = 'Entrar no Sistema';
    document.getElementById('errorMsgLogin').classList.add('show');
  }, 800);
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
    
    if (servidores.length) await salvarComHandleError('servidores', servidores);
    if (programacoes.length) await salvarComHandleError('programacoes', programacoes);
    if (folgas.length) await salvarComHandleError('folgas', folgas);
    if (solicitacoes.length) await salvarComHandleError('solicitacoes', solicitacoes);
    if (gestores.length) await salvarComHandleError('gestores', gestores);
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
