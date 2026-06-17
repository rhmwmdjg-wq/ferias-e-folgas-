// Módulo de acesso a dados.
// Mantém bridge Supabase/localStorage existente sem alterar tabelas ou dados.

const DB = {
  servidores: () => _remoteData.servidores.length ? _remoteData.servidores : JSON.parse(localStorage.getItem('srv_servidores') || '[]'),
  saveServidores: async (d) => {
    _remoteData.servidores = d;
    localStorage.setItem('srv_servidores', JSON.stringify(d));
    try {
      const { error } = await supabaseClient.from('servidores').upsert(d);
      if (error) {
        if (isQuotaError(error)) {
          saveToSyncQueue('servidores', d);
          toastMsg("⚠️ Salvo localmente. Sync automático quando conexão restaurar.", "warning");
        } else {
          console.error("Erro Supabase (servidores):", error);
          toastMsg("Erro ao salvar servidores na nuvem: " + error.message, "error");
        }
      }
    } catch (e) {
      if (isQuotaError(e)) {
        saveToSyncQueue('servidores', d);
        toastMsg("⚠️ Salvo localmente. Sync automático quando conexão restaurar.", "warning");
      } else {
        throw e;
      }
    }
  },
  deleteServidor: async (id) => {
    const { error } = await supabaseClient.from('servidores').delete().eq('id', id);
    if (error) {
      if (!isQuotaError(error)) {
        toastMsg("Erro ao excluir servidor na nuvem: " + error.message, "error");
      }
    }
  },

  programacoes: () => _remoteData.programacoes.length ? _remoteData.programacoes : JSON.parse(localStorage.getItem('srv_programacoes') || '[]'),
  saveProgramacoes: async (d) => {
    _remoteData.programacoes = d;
    localStorage.setItem('srv_programacoes', JSON.stringify(d));
    try {
      const { error } = await supabaseClient.from('programacoes').upsert(d);
      if (error) {
        if (isQuotaError(error)) {
          saveToSyncQueue('programacoes', d);
          toastMsg("⚠️ Salvo localmente. Sync automático quando conexão restaurar.", "warning");
        } else {
          console.error("Erro Supabase (programacoes):", error);
          saveToSyncQueue('programacoes', d);
        }
      }
    } catch (e) {
      if (isQuotaError(e)) {
        saveToSyncQueue('programacoes', d);
        toastMsg("⚠️ Salvo localmente. Sync automático quando conexão restaurar.", "warning");
      } else {
        console.warn("Rede indisponível para sync de programações. Dados salvos localmente.", e);
        saveToSyncQueue('programacoes', d);
      }
    }
  },
  deleteProgramacao: async (id) => {
    const { error } = await supabaseClient.from('programacoes').delete().eq('id', id);
    if (error) {
      if (!isQuotaError(error)) {
        toastMsg("Erro ao excluir programação na nuvem: " + error.message, "error");
      }
    }
  },

  config: () => {
    if (Object.keys(_remoteData.config).length) return _remoteData.config;
    return JSON.parse(localStorage.getItem('srv_config') || '{"decreto":"","tema":"#5b7fff","estiloBase":"midnight","coordenadorAPS":"","setores":[],"subtituloSidebar":"Gestão de RH","tituloSidebar":"Atlas Saúde","nomeOrganizacao":"Coordenação da Atenção Primária à Saúde","tamanhoFonteOrg":14, "tamanhoLogoHeader":38,"maxFolgasConsecutivas":5,"maxFolgasMes":5}');
  },
  saveConfig: async (d) => {
    _remoteData.config = d;
    localStorage.setItem('srv_config', JSON.stringify(d));
    const configArray = Object.entries(d)
      .filter(([key]) => !key.startsWith('img_'))
      .map(([key, value]) => ({
        chave: key,
        valor: typeof value === 'string' ? value : JSON.stringify(value)
      }));
    
    if (configArray.length > 0) {
      try {
        const { error } = await supabaseClient.from('configuracoes').upsert(configArray);
        if (error) {
          if (isQuotaError(error)) {
            saveToSyncQueue('configuracoes', d);
            toastMsg("⚠️ Salvo localmente. Sync automático quando conexão restaurar.", "warning");
          } else {
            toastMsg("Erro ao salvar configuração: " + error.message, "error");
          }
        }
      } catch (e) {
        if (isQuotaError(e)) {
          saveToSyncQueue('configuracoes', d);
          toastMsg("⚠️ Salvo localmente. Sync automático quando conexão restaurar.", "warning");
        } else {
          toastMsg("Erro ao salvar configuração: " + e.message, "error");
        }
      }
    }
  },

  folgas: () => _remoteData.folgas.length ? _remoteData.folgas : JSON.parse(localStorage.getItem('srv_folgas') || '[]'),
  saveFolgas: async (d, apenasNovos) => {
    _remoteData.folgas = d;
    localStorage.setItem('srv_folgas', JSON.stringify(d));
    const paraSubir = (apenasNovos || d).map(f => {
      const { refId, ...resto } = f;
      return resto;
    });
    try {
      const { error } = await supabaseClient.from('folgas').upsert(paraSubir);
      if (error) {
        if (isQuotaError(error)) {
          saveToSyncQueue('folgas', d);
          toastMsg("⚠️ Salvo localmente. Sync automático quando conexão restaurar.", "warning");
        } else {
          console.error("Erro Supabase (folgas):", error);
          toastMsg("Erro ao salvar folgas na nuvem: " + error.message, "error");
        }
      }
    } catch (e) {
      if (isQuotaError(e)) {
        saveToSyncQueue('folgas', d);
        toastMsg("⚠️ Salvo localmente. Sync automático quando conexão restaurar.", "warning");
      } else {
        throw e;
      }
    }
  },
  deleteFolga: async (id) => {
    const { error } = await supabaseClient.from('folgas').delete().eq('id', id);
    if (error) {
      if (isQuotaError(error)) {
        registrarPendenteExclusao('folgas', id);
      } else {
        toastMsg("Erro ao excluir folga na nuvem: " + error.message, "error");
      }
    }
  },

  bancoHoras: () => _remoteData.bancoHoras.length ? _remoteData.bancoHoras : JSON.parse(localStorage.getItem('srv_banco_horas') || '[]'),
  saveBancoHoras: async (d, apenasNovos) => {
    _remoteData.bancoHoras = d;
    localStorage.setItem('srv_banco_horas', JSON.stringify(d));
    const paraSubir = apenasNovos || d;
    try {
      const { error } = await supabaseClient.from('banco_horas').upsert(paraSubir);
      if (error) {
        if (isQuotaError(error)) {
          saveToSyncQueue('banco_horas', d);
          toastMsg("⚠️ Salvo localmente. Sync automático quando conexão restaurar.", "warning");
        } else {
          console.error("Erro Supabase (banco_horas):", error);
          toastMsg("Erro ao salvar banco de horas na nuvem: " + error.message, "error");
        }
      }
    } catch (e) {
      if (isQuotaError(e)) {
        saveToSyncQueue('banco_horas', d);
        toastMsg("⚠️ Salvo localmente. Sync automático quando conexão restaurar.", "warning");
      } else {
        throw e;
      }
    }
  },
  deleteBancoHoras: async (id) => {
    const { error } = await supabaseClient.from('banco_horas').delete().eq('id', id);
    if (error) {
      if (isQuotaError(error)) {
        registrarPendenteExclusao('bancoHoras', id);
      } else {
        toastMsg("Erro ao excluir banco de horas na nuvem: " + error.message, "error");
      }
    }
  },

  gestores: () => {
    if (_remoteData.gestores && _remoteData.gestores.length > 0) return _remoteData.gestores;
    return JSON.parse(localStorage.getItem('srv_gestores') || '[]');
  },
  saveGestores: async (d) => {
    _remoteData.gestores = d;
    localStorage.setItem('srv_gestores', JSON.stringify(d));
    try {
      const { error } = await supabaseClient.from('gestores').upsert(d);
      if (error) {
        if (isQuotaError(error)) {
          saveToSyncQueue('gestores', d);
          toastMsg("⚠️ Salvo localmente. Sync automático quando conexão restaurar.", "warning");
        } else {
          if (error.code === '23505') toastMsg("Erro: Usuário de Login já existe!", "error");
          else toastMsg("Erro ao salvar gestores na nuvem: " + error.message, "error");
        }
      }
    } catch (e) {
      if (isQuotaError(e)) {
        saveToSyncQueue('gestores', d);
        toastMsg("⚠️ Salvo localmente. Sync automático quando conexão restaurar.", "warning");
      } else {
        throw e;
      }
    }
  },
  deleteGestor: async (id) => {
    const { error } = await supabaseClient.from('gestores').delete().eq('id', id);
    if (error) {
      if (!isQuotaError(error)) {
        toastMsg("Erro ao excluir gestor na nuvem: " + error.message, "error");
      }
    }
  },

  solicitacoes: () => _remoteData.solicitacoes.length ? _remoteData.solicitacoes : JSON.parse(localStorage.getItem('srv_solicitacoes') || '[]'),
  saveSolicitacao: async (obj) => {
    const idx = _remoteData.solicitacoes.findIndex(s => s.id === obj.id);
    if (idx >= 0) _remoteData.solicitacoes[idx] = obj;
    else _remoteData.solicitacoes.push(obj);
    localStorage.setItem('srv_solicitacoes', JSON.stringify(_remoteData.solicitacoes));
    
    const fieldsToSaveSafe = {
      id: obj.id,
      srvId: obj.srvId,
      tipo: obj.tipo,
      status: obj.status,
      criadoEm: obj.criadoEm || new Date().toISOString()
    };
    if (obj.obs) fieldsToSaveSafe.obs = obj.obs;
    if (obj.srvNome) fieldsToSaveSafe.srvNome = obj.srvNome;

    try {
      const { error } = await supabaseClient.from('solicitacoes').upsert(obj);
      
      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (isQuotaError(error)) {
          saveToSyncQueue('solicitacoes', obj);
          toastMsg("⚠️ Salvo localmente. Sync automático quando conexão restaurar.", "warning");
          return { success: true, mode: 'queued' };
        }
        if (msg.includes('column') && (msg.includes('not find') || msg.includes('not found') || msg.includes('não encontrada'))) {
          console.warn("⚠️ Colunas extras não encontradas. Usando modo seguro...");
          const { error: retryError } = await supabaseClient.from('solicitacoes').upsert(fieldsToSaveSafe);
          if (retryError) {
            if (isQuotaError(retryError)) {
              saveToSyncQueue('solicitacoes', obj);
              toastMsg("⚠️ Salvo localmente. Sync automático quando conexão restaurar.", "warning");
              return { success: true, mode: 'queued' };
            }
            throw retryError;
          }
          return { success: true, mode: 'safe' };
        }
        throw error;
      }
      return { success: true, mode: 'full' };
    } catch (e) {
      if (isQuotaError(e)) {
        saveToSyncQueue('solicitacoes', obj);
        toastMsg("⚠️ Salvo localmente. Sync automático quando conexão restaurar.", "warning");
        return { success: true, mode: 'queued' };
      }
      console.error("❌ Erro ao salvar solicitação:", e);
      throw e;
    }
  },
  saveSolicitacoes: async (d) => { 
    _remoteData.solicitacoes = d;
    localStorage.setItem('srv_solicitacoes', JSON.stringify(d));
    
    try {
      const { error } = await supabaseClient.from('solicitacoes').upsert(d);
      if (error) {
        if (isQuotaError(error)) {
          saveToSyncQueue('solicitacoes', d);
        } else {
          console.warn("⚠️ Erro no salvamento em lote de solicitações. Tentando modo seguro...");
          const safeBatch = d.map(obj => ({
            id: obj.id,
            srvId: obj.srvId,
            tipo: obj.tipo,
            status: obj.status,
            criadoEm: obj.criadoEm || new Date().toISOString(),
            obs: obj.obs || '',
            srvNome: obj.srvNome || ''
          }));
          await supabaseClient.from('solicitacoes').upsert(safeBatch);
        }
      }
    } catch (e) {
      if (isQuotaError(e)) {
        saveToSyncQueue('solicitacoes', d);
      } else {
        console.error("Erro grave ao salvar solicitações:", e);
      }
    }
  },
  deleteSolicitacao: async (id) => {
    const { error } = await supabaseClient.from('solicitacoes').delete().eq('id', id);
    if (error) {
      if (!isQuotaError(error)) {
        throw error;
      }
    }
  },

  saveLog: async (acao, detalhes, tabela = '', registroId = '') => {
    const sessao = JSON.parse(sessionStorage.getItem('ferias_sessao') || '{}');
    const log = {
      id: uid(),
      usuarioId: sessao.id || 'sistema',
      usuarioNome: sessao.nome || 'Sistema',
      usuarioRole: sessao.role || 'anon',
      acao,
      detalhes,
      tabela,
      registroId,
      criadoEm: new Date().toISOString()
    };
    // Salva localmente (sempre funciona)
    const locais = JSON.parse(localStorage.getItem('srv_logs') || '[]');
    locais.unshift(log);
    if (locais.length > 500) locais.length = 500; // mantém só os 500 mais recentes
    localStorage.setItem('srv_logs', JSON.stringify(locais));
    // Tenta salvar no Supabase (se falhar, já está no localStorage)
    try {
      await supabaseClient.from('logs').insert(log);
    } catch (e) {
      if (!isQuotaError(e)) console.error("Erro ao salvar log no Supabase:", e);
    }
    return log;
  },

  getLogs: async (limit = 100) => {
    // Primeiro tenta do Supabase
    try {
      const { data, error } = await supabaseClient.from('logs').select('*').order('criadoEm', { ascending: false }).limit(limit);
      if (!error && data && data.length > 0) return data;
    } catch (e) { /* fallback silencioso */ }
    // Fallback: logs locais
    const locais = JSON.parse(localStorage.getItem('srv_logs') || '[]');
    return locais.slice(0, limit);
  },

  autorizacoes: () => _remoteData.autorizacoes.length ? _remoteData.autorizacoes : JSON.parse(localStorage.getItem('srv_autorizacoes') || '[]'),
  saveAutorizacao: async (obj) => {
    const idx = _remoteData.autorizacoes.findIndex(a => a.id === obj.id);
    if (idx >= 0) _remoteData.autorizacoes[idx] = obj;
    else _remoteData.autorizacoes.push(obj);
    localStorage.setItem('srv_autorizacoes', JSON.stringify(_remoteData.autorizacoes));
    try {
      const { error } = await supabaseClient.from('autorizacoes').upsert(obj);
      if (error) saveToSyncQueue('autorizacoes', obj);
    } catch (e) {
      saveToSyncQueue('autorizacoes', obj);
    }
  },
  deleteAutorizacao: async (id) => {
    _remoteData.autorizacoes = _remoteData.autorizacoes.filter(a => a.id !== id);
    localStorage.setItem('srv_autorizacoes', JSON.stringify(_remoteData.autorizacoes));
    try {
      await supabaseClient.from('autorizacoes').delete().eq('id', id);
    } catch (e) { /* silent */ }
  },

  eventos: () => _remoteData.eventos.length ? _remoteData.eventos : JSON.parse(localStorage.getItem('srv_eventos') || '[]'),
  saveEventos: async (d) => {
    _remoteData.eventos = d;
    localStorage.setItem('srv_eventos', JSON.stringify(d));
    for (let i = 0; i < d.length; i++) {
      try {
        const { error } = await supabaseClient.from('eventos').upsert(d[i], { onConflict: 'id' });
        if (error) {
          if (isQuotaError(error)) { saveToSyncQueue('eventos', d[i]); }
          else {
            const { error: err2 } = await supabaseClient.rpc('salvar_evento', { p_dados: d[i] });
            if (err2) { if (isQuotaError(err2)) saveToSyncQueue('eventos', d[i]); else console.error("Erro ao salvar evento:", err2); }
          }
        }
      } catch (e) {
        if (isQuotaError(e)) { saveToSyncQueue('eventos', d[i]); }
        else { console.error("Erro ao salvar evento:", e); }
      }
    }
  },
  deleteEvento: async (id) => {
    try {
      const { error } = await supabaseClient.from('eventos').delete().eq('id', id);
      if (error && error.code !== 'PGRST116') {
        await supabaseClient.rpc('deletar_evento', { p_id: id }).catch(() => {});
      }
    } catch (e) { console.error("Erro ao deletar evento:", e); }
  },

  veiculos: () => _remoteData.veiculos.length ? _remoteData.veiculos : JSON.parse(localStorage.getItem('srv_veiculos') || '[]'),
  saveVeiculos: async (d) => {
    _remoteData.veiculos = d;
    localStorage.setItem('srv_veiculos', JSON.stringify(d));
    for (let i = 0; i < d.length; i++) {
      try {
        const { error } = await supabaseClient.from('veiculos').upsert(d[i], { onConflict: 'id' });
        if (error) {
          if (isQuotaError(error)) { saveToSyncQueue('veiculos', d[i]); }
          else {
            const { error: err2 } = await supabaseClient.rpc('salvar_veiculo', { p_dados: d[i] });
            if (err2) { if (isQuotaError(err2)) saveToSyncQueue('veiculos', d[i]); else console.error("Erro ao salvar veículo:", err2); }
          }
        }
      } catch (e) {
        if (isQuotaError(e)) { saveToSyncQueue('veiculos', d[i]); }
        else { console.error("Erro ao salvar veículo:", e); }
      }
    }
  },
  deleteVeiculo: async (id) => {
    try {
      const { error } = await supabaseClient.from('veiculos').delete().eq('id', id);
      if (error && error.code !== 'PGRST116') {
        await supabaseClient.rpc('deletar_veiculo', { p_id: id }).catch(() => {});
      }
    } catch (e) { console.error("Erro ao deletar veículo:", e); }
  },

  // =================== PONTO CREDENCIADOS ===================
  cargos: () => _remoteData.cargos.length ? _remoteData.cargos : JSON.parse(localStorage.getItem('srv_cargos') || '[]'),
  saveCargos: async (d) => {
    _remoteData.cargos = d;
    localStorage.setItem('srv_cargos', JSON.stringify(d));
    for (let i = 0; i < d.length; i++) {
      try {
        const { error } = await supabaseClient.from('cargos').upsert(d[i], { onConflict: 'id' });
        if (error && !isQuotaError(error)) console.error("Erro Supabase (cargos):", error);
        else if (error) saveToSyncQueue('cargos', d[i]);
      } catch (e) {
        if (isQuotaError(e)) saveToSyncQueue('cargos', d[i]);
        else console.error("Erro ao salvar cargo:", e);
      }
    }
  },
  deleteCargo: async (id) => {
    try {
      await supabaseClient.from('cargos').delete().eq('id', id);
    } catch (e) { /* silent */ }
  },

  credenciados: () => _remoteData.credenciados.length ? _remoteData.credenciados : JSON.parse(localStorage.getItem('srv_credenciados') || '[]'),
  saveCredenciados: async (d) => {
    _remoteData.credenciados = d;
    localStorage.setItem('srv_credenciados', JSON.stringify(d));
    for (let i = 0; i < d.length; i++) {
      try {
        const { error } = await supabaseClient.from('credenciados').upsert(d[i], { onConflict: 'id' });
        if (error && !isQuotaError(error)) console.error("Erro Supabase (credenciados):", error);
        else if (error) saveToSyncQueue('credenciados', d[i]);
      } catch (e) {
        if (isQuotaError(e)) saveToSyncQueue('credenciados', d[i]);
        else console.error("Erro ao salvar credenciado:", e);
      }
    }
  },
  deleteCredenciado: async (id) => {
    try {
      await supabaseClient.from('credenciados').delete().eq('id', id);
    } catch (e) { /* silent */ }
  },

  pontoMensal: () => _remoteData.pontoMensal.length ? _remoteData.pontoMensal : JSON.parse(localStorage.getItem('srv_ponto_mensal') || '[]'),
  savePontoMensal: async (d) => {
    _remoteData.pontoMensal = d;
    localStorage.setItem('srv_ponto_mensal', JSON.stringify(d));
    for (let i = 0; i < d.length; i++) {
      try {
        const { error } = await supabaseClient.from('ponto_mensal').upsert(d[i], { onConflict: 'id' });
        if (error && !isQuotaError(error)) console.error("Erro Supabase (ponto_mensal):", error);
        else if (error) saveToSyncQueue('ponto_mensal', d[i]);
      } catch (e) {
        if (isQuotaError(e)) saveToSyncQueue('ponto_mensal', d[i]);
        else console.error("Erro ao salvar ponto_mensal:", e);
      }
    }
  },
  deletePontoMensal: async (id) => {
    try {
      await supabaseClient.from('ponto_mensal').delete().eq('id', id);
    } catch (e) { /* silent */ }
  },

  // =================== PROTOCOLO DE ENTREGA ===================
  protocolos: () => _remoteData.protocolos.length ? _remoteData.protocolos : JSON.parse(localStorage.getItem('srv_protocolos') || '[]'),
  saveProtocolos: async (d) => {
    _remoteData.protocolos = d;
    localStorage.setItem('srv_protocolos', JSON.stringify(d));
    try {
      const { error } = await supabaseClient.from('protocolos_entrega').upsert(d);
      if (error) {
        if (isQuotaError(error)) { saveToSyncQueue('protocolos_entrega', d); toastMsg("⚠️ Salvo localmente. Sync automático quando conexão restaurar.", "warning"); }
        else console.error("Erro Supabase (protocolos_entrega):", error);
      }
    } catch (e) {
      if (isQuotaError(e)) { saveToSyncQueue('protocolos_entrega', d); toastMsg("⚠️ Salvo localmente. Sync automático quando conexão restaurar.", "warning"); }
      else throw e;
    }
  },
  deleteProtocolo: async (id) => {
    _remoteData.protocolos = _remoteData.protocolos.filter(p => p.id !== id);
    localStorage.setItem('srv_protocolos', JSON.stringify(_remoteData.protocolos));
    try {
      const { error } = await supabaseClient.from('protocolos_entrega').delete().eq('id', id);
      if (error && !isQuotaError(error)) console.error("Erro ao deletar protocolo:", error);
    } catch (e) { /* silent */ }
  },

  itensProtocolo: () => _remoteData.itensProtocolo.length ? _remoteData.itensProtocolo : JSON.parse(localStorage.getItem('srv_itens_protocolo') || '[]'),
  saveItensProtocolo: async (d) => {
    _remoteData.itensProtocolo = d;
    localStorage.setItem('srv_itens_protocolo', JSON.stringify(d));
    try {
      const { error } = await supabaseClient.from('itens_protocolo').upsert(d);
      if (error) {
        if (isQuotaError(error)) { saveToSyncQueue('itens_protocolo', d); toastMsg("⚠️ Salvo localmente. Sync automático quando conexão restaurar.", "warning"); }
        else console.error("Erro Supabase (itens_protocolo):", error);
      }
    } catch (e) {
      if (isQuotaError(e)) { saveToSyncQueue('itens_protocolo', d); toastMsg("⚠️ Salvo localmente. Sync automático quando conexão restaurar.", "warning"); }
      else throw e;
    }
  },
  deleteItemProtocolo: async (id) => {
    _remoteData.itensProtocolo = _remoteData.itensProtocolo.filter(i => i.id !== id);
    localStorage.setItem('srv_itens_protocolo', JSON.stringify(_remoteData.itensProtocolo));
    try {
      await supabaseClient.from('itens_protocolo').delete().eq('id', id);
    } catch (e) { /* silent */ }
  },

};

window.DB = DB;
