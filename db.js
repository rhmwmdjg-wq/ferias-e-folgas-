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
    const paraSubir = (apenasNovos || d);
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
        } else if (/modulos|cargo/.test((error.message || '').toLowerCase())) {
          // Colunas novas ainda não existem na nuvem: salva sem elas
          console.warn("Colunas 'modulos'/'cargo' ausentes em gestores. Salvando em modo compatível.");
          const safe = d.map(g => { const c = { ...g }; delete c.modulos; delete c.cargo; return c; });
          const { error: err2 } = await supabaseClient.from('gestores').upsert(safe);
          if (err2 && err2.code === '23505') toastMsg("Erro: Usuário de Login já existe!", "error");
          else toastMsg("Gestor salvo localmente. Rode o SQL das colunas 'modulos'/'cargo' para sincronizar.", "warning");
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
    if (!d || !d.length) return;

    // Tenta enviar removendo automaticamente colunas que ainda não existem na nuvem.
    let payload = d;
    for (let tentativa = 0; tentativa < 8; tentativa++) {
      try {
        const { error } = await supabaseClient.from('veiculos').upsert(payload, { onConflict: 'id' });
        if (!error) return;
        if (isQuotaError(error)) { saveToSyncQueue('veiculos', d); return; }

        const faltante = /Could not find the '([^']+)' column/i.exec(error.message || '');
        if (faltante && faltante[1]) {
          const col = faltante[1];
          console.warn(`Coluna '${col}' ausente em veiculos. Removendo e reenviando...`);
          payload = payload.map(v => {
            if (Object.prototype.hasOwnProperty.call(v, col)) { const c = { ...v }; delete c[col]; return c; }
            return v;
          });
          continue;
        }

        console.warn("⚠️ Erro upsert veiculos:", error.message);
        for (const item of d) {
          try {
            const { error: errInd } = await supabaseClient.from('veiculos').upsert(item, { onConflict: 'id' });
            if (errInd && isQuotaError(errInd)) saveToSyncQueue('veiculos', item);
          } catch (eInd) {
            if (isQuotaError(eInd)) saveToSyncQueue('veiculos', item);
          }
        }
        return;
      } catch (e) {
        if (isQuotaError(e)) { saveToSyncQueue('veiculos', d); return; }
        console.error("Erro ao salvar veículos no Supabase:", e);
        return;
      }
    }
  },
  deleteVeiculo: async (id) => {
    _remoteData.veiculos = _remoteData.veiculos.filter(v => v.id !== id);
    localStorage.setItem('srv_veiculos', JSON.stringify(_remoteData.veiculos));
    try {
      const { error } = await supabaseClient.from('veiculos').delete().eq('id', id);
      if (error && !isQuotaError(error)) console.warn("Aviso ao deletar veículo:", error.message);
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
        if (error) { saveToSyncQueue('cargos', d[i]); console.error("Erro Supabase (cargos):", error); }
      } catch (e) {
        saveToSyncQueue('cargos', d[i]);
        console.error("Erro ao salvar cargo:", e);
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
        if (error) { saveToSyncQueue('credenciados', d[i]); console.error("Erro Supabase (credenciados):", error); }
      } catch (e) {
        saveToSyncQueue('credenciados', d[i]);
        console.error("Erro ao salvar credenciado:", e);
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
        if (error) { saveToSyncQueue('ponto_mensal', d[i]); console.error("Erro Supabase (ponto_mensal):", error); }
      } catch (e) {
        saveToSyncQueue('ponto_mensal', d[i]);
        console.error("Erro ao salvar ponto_mensal:", e);
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
  // =================== GERADOR DE OFÍCIOS ===================
  oficios: () => _remoteData.oficios.length ? _remoteData.oficios : JSON.parse(localStorage.getItem('srv_oficios') || '[]'),
  saveOficios: async (d) => {
    _remoteData.oficios = d;
    localStorage.setItem('srv_oficios', JSON.stringify(d));
    if (!d || !d.length) return;
    try {
      const { error } = await supabaseClient.from('oficios').upsert(d, { onConflict: 'id' });
      if (error) {
        if (isQuotaError(error)) {
          saveToSyncQueue('oficios', d);
        } else {
          const msg = (error.message || '').toLowerCase();
          if (msg.includes('destinatarios')) {
            // Coluna "destinatarios" ainda não existe na nuvem: salva sem ela
            console.warn("Coluna 'destinatarios' ausente. Salvando ofício em modo compatível.");
            const safe = d.map(o => { const c = { ...o }; delete c.destinatarios; return c; });
            const { error: err2 } = await supabaseClient.from('oficios').upsert(safe, { onConflict: 'id' });
            if (err2 && !isQuotaError(err2)) console.warn("Aviso ao salvar ofícios (modo compatível):", err2.message);
          } else {
            console.warn("Erro ao salvar ofícios no Supabase:", error.message);
          }
        }
      }
    } catch (e) {
      if (isQuotaError(e)) saveToSyncQueue('oficios', d);
      else console.error("Erro ao salvar ofícios no Supabase:", e);
    }
  },
  deleteOficio: async (id) => {
    _remoteData.oficios = _remoteData.oficios.filter(o => o.id !== id);
    localStorage.setItem('srv_oficios', JSON.stringify(_remoteData.oficios));
    try {
      const { error } = await supabaseClient.from('oficios').delete().eq('id', id);
      if (error && !isQuotaError(error)) console.warn("Aviso ao deletar ofício:", error.message);
    } catch (e) { console.error("Erro ao deletar ofício:", e); }
  },
  proximoNumeroOficio: (ano) => {
    const todos = DB.oficios();
    const anoRef = ano || new Date().getFullYear();
    const cfg = DB.config ? DB.config() : {};
    const baseInicial = parseInt(cfg.sequenciaOficioInicial || localStorage.getItem('srv_oficio_seq_inicial') || 74);
    const doAno = todos.filter(o => (o.ano === anoRef || parseInt(o.ano) === anoRef));
    if (!doAno.length) return baseInicial;
    const max = Math.max(baseInicial - 1, ...doAno.map(o => parseInt(o.numero) || 0));
    return max + 1;
  },

  // =================== NOTIFICAÇÃO ADMINISTRATIVA ===================
  notificacoes: () => _remoteData.notificacoes.length ? _remoteData.notificacoes : JSON.parse(localStorage.getItem('srv_notificacoes') || '[]'),
  saveNotificacoes: async (d) => {
    _remoteData.notificacoes = d;
    localStorage.setItem('srv_notificacoes', JSON.stringify(d));
    if (!d || !d.length) return;
    try {
      const { error } = await supabaseClient.from('notificacoes').upsert(d, { onConflict: 'id' });
      if (error) {
        if (isQuotaError(error)) saveToSyncQueue('notificacoes', d);
        else {
          const msg = (error.message || '').toLowerCase();
          if (msg.includes('destinatarios')) {
            const safe = d.map(o => { const c = { ...o }; delete c.destinatarios; return c; });
            const { error: err2 } = await supabaseClient.from('notificacoes').upsert(safe, { onConflict: 'id' });
            if (err2 && !isQuotaError(err2)) console.warn("Aviso notificacoes (modo compatível):", err2.message);
          } else console.warn("Erro ao salvar notificações:", error.message);
        }
      }
    } catch (e) {
      if (isQuotaError(e)) saveToSyncQueue('notificacoes', d);
      else console.error("Erro ao salvar notificações:", e);
    }
  },
  deleteNotificacao: async (id) => {
    _remoteData.notificacoes = _remoteData.notificacoes.filter(o => o.id !== id);
    localStorage.setItem('srv_notificacoes', JSON.stringify(_remoteData.notificacoes));
    try {
      const { error } = await supabaseClient.from('notificacoes').delete().eq('id', id);
      if (error && !isQuotaError(error)) console.warn("Aviso ao deletar notificação:", error.message);
    } catch (e) { console.error("Erro ao deletar notificação:", e); }
  },
  proximoNumeroNotificacao: (ano) => {
    const todos = DB.notificacoes();
    const anoRef = ano || new Date().getFullYear();
    const doAno = todos.filter(n => (n.ano === anoRef || parseInt(n.ano) === anoRef));
    if (!doAno.length) return 1;
    return Math.max(1, ...doAno.map(n => parseInt(n.numero) || 0)) + 1;
  },

  // =================== CADASTRO DE DESTINATÁRIOS ===================
  destinatarios: () => _remoteData.destinatarios.length ? _remoteData.destinatarios : JSON.parse(localStorage.getItem('srv_destinatarios') || '[]'),
  saveDestinatarios: async (d) => {
    _remoteData.destinatarios = d;
    localStorage.setItem('srv_destinatarios', JSON.stringify(d));
    if (!d || !d.length) return;
    try {
      const { error } = await supabaseClient.from('destinatarios').upsert(d, { onConflict: 'id' });
      if (error) {
        if (isQuotaError(error)) saveToSyncQueue('destinatarios', d);
        else console.warn("Erro ao salvar destinatários no Supabase:", error.message);
      }
    } catch (e) {
      if (isQuotaError(e)) saveToSyncQueue('destinatarios', d);
      else console.error("Erro ao salvar destinatários no Supabase:", e);
    }
  },
  deleteDestinatario: async (id) => {
    _remoteData.destinatarios = _remoteData.destinatarios.filter(x => x.id !== id);
    localStorage.setItem('srv_destinatarios', JSON.stringify(_remoteData.destinatarios));
    try {
      const { error } = await supabaseClient.from('destinatarios').delete().eq('id', id);
      if (error && !isQuotaError(error)) console.warn("Aviso ao deletar destinatário:", error.message);
    } catch (e) { console.error("Erro ao deletar destinatário:", e); }
  },

  // =================== CADASTRO DE EMISSORES ===================
  emissores: () => _remoteData.emissores.length ? _remoteData.emissores : JSON.parse(localStorage.getItem('srv_emissores') || '[]'),
  saveEmissores: async (d) => {
    _remoteData.emissores = d;
    localStorage.setItem('srv_emissores', JSON.stringify(d));
    if (!d || !d.length) return;
    try {
      const { error } = await supabaseClient.from('emissores').upsert(d, { onConflict: 'id' });
      if (error) {
        if (isQuotaError(error)) saveToSyncQueue('emissores', d);
        else console.warn("Erro ao salvar emissores no Supabase:", error.message);
      }
    } catch (e) {
      if (isQuotaError(e)) saveToSyncQueue('emissores', d);
      else console.error("Erro ao salvar emissores no Supabase:", e);
    }
  },
  deleteEmissor: async (id) => {
    _remoteData.emissores = _remoteData.emissores.filter(x => x.id !== id);
    localStorage.setItem('srv_emissores', JSON.stringify(_remoteData.emissores));
    try {
      const { error } = await supabaseClient.from('emissores').delete().eq('id', id);
      if (error && !isQuotaError(error)) console.warn("Aviso ao deletar emissor:", error.message);
    } catch (e) { console.error("Erro ao deletar emissor:", e); }
  },

  deleteItemProtocolo: async (id) => {
    _remoteData.itensProtocolo = _remoteData.itensProtocolo.filter(i => i.id !== id);
    localStorage.setItem('srv_itens_protocolo', JSON.stringify(_remoteData.itensProtocolo));
    try {
      await supabaseClient.from('itens_protocolo').delete().eq('id', id);
    } catch (e) { /* silent */ }
  },

  // =================== FECHAMENTO DE PONTO MENSAL ===================
  pontoFolhas: () => _remoteData.pontoFolhas.length ? _remoteData.pontoFolhas : JSON.parse(localStorage.getItem('srv_ponto_folhas') || '[]'),
  savePontoFolha: async (obj) => {
    if (!_remoteData.pontoFolhas.length) {
      _remoteData.pontoFolhas = JSON.parse(localStorage.getItem('srv_ponto_folhas') || '[]');
    }
    const arr = _remoteData.pontoFolhas;
    const idx = arr.findIndex(f => f.id === obj.id);
    if (idx >= 0) arr[idx] = obj; else arr.push(obj);
    localStorage.setItem('srv_ponto_folhas', JSON.stringify(arr));
    try {
      const { error } = await supabaseClient.from('ponto_folhas').upsert(obj, { onConflict: 'id' });
      if (error) {
        if (isQuotaError(error)) saveToSyncQueue('ponto_folhas', obj);
        else console.warn("Erro ao salvar folha de ponto:", error.message);
      }
    } catch (e) {
      if (isQuotaError(e)) saveToSyncQueue('ponto_folhas', obj);
      else console.error("Erro ao salvar folha de ponto:", e);
    }
  },
  deletePontoFolha: async (id) => {
    _remoteData.pontoFolhas = _remoteData.pontoFolhas.filter(f => f.id !== id);
    localStorage.setItem('srv_ponto_folhas', JSON.stringify(_remoteData.pontoFolhas));
    try { await supabaseClient.from('ponto_folhas').delete().eq('id', id); } catch (e) { /* silent */ }
  },

  pontoHistorico: () => _remoteData.pontoHistorico.length ? _remoteData.pontoHistorico : JSON.parse(localStorage.getItem('srv_ponto_historico') || '[]'),
  addPontoHistorico: async (obj) => {
    if (!_remoteData.pontoHistorico.length) {
      _remoteData.pontoHistorico = JSON.parse(localStorage.getItem('srv_ponto_historico') || '[]');
    }
    _remoteData.pontoHistorico.push(obj);
    localStorage.setItem('srv_ponto_historico', JSON.stringify(_remoteData.pontoHistorico));
    try {
      const { error } = await supabaseClient.from('ponto_historico').insert(obj);
      if (error && !isQuotaError(error)) console.warn("Erro ao salvar histórico do ponto:", error.message);
    } catch (e) {
      if (isQuotaError(e)) saveToSyncQueue('ponto_historico', obj);
      else console.error("Erro ao salvar histórico do ponto:", e);
    }
  },

};

window.DB = DB;
