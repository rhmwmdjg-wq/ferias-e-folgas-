// Módulo Configurações.
// Temas, logos, setores, branding e previews.

function redimensionarImagem(base64, targetSize = 400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("Erro ao carregar imagem para redimensionar."));
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext('2d');

        // Calcular dimensões para crop central
        let srcX = 0, srcY = 0, srcW = img.width, srcH = img.height;
        if (img.width > img.height) {
          srcW = img.height;
          srcX = (img.width - img.height) / 2;
        } else {
          srcH = img.width;
          srcY = (img.height - img.width) / 2;
        }

        ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, targetSize, targetSize);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } catch (e) {
        reject(e);
      }
    };
    img.src = base64;
  });
}

function base64ToBlob(base64) {
  const byteString = atob(base64.split(',')[1]);
  const mimeString = base64.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}

async function uploadImagemParaStorage(base64, matricula) {
  try {
    const resized = await redimensionarImagem(base64, 400);
    const blob = base64ToBlob(resized);
    const fileName = `foto_${matricula}_${Date.now()}.jpg`;
    const filePath = `servidores/${fileName}`;

    // Tentar primeiro com FOTOS (maiúsculo)
    let bucketName = 'FOTOS';
    let { data, error } = await supabaseClient.storage
      .from(bucketName)
      .upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });

    // Se falhar por balde não encontrado, tenta fotos (minúsculo)
    if (error && (error.message?.includes('not found') || error.status === 404)) {
      bucketName = 'fotos';
      const retry = await supabaseClient.storage
        .from(bucketName)
        .upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error("❌ Erro Supabase Storage:", error);
      toastMsg(`Erro no Storage: ${error.message || 'Verifique as Políticas'}`, 'error');
      return null;
    }

    // Retornar a URL pública
    const { data: { publicUrl } } = supabaseClient.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (err) {
    console.error("❌ Erro no upload:", err);
    toastMsg("Erro ao processar imagem: " + err.message, 'error');
    return null;
  }
}

async function migrarFotosLegado() {
  const servidores = _remoteData.servidores.filter(s => s.foto && s.foto.startsWith('data:image'));
  if (servidores.length === 0) return;

  console.log(`🚀 Iniciando migração de ${servidores.length} fotos para o Storage...`);
  
  let sucessos = 0;
  let erros = 0;
  let erroMsg = '';

  for (const srv of servidores) {
    try {
      console.log(`⏳ Migrando: ${srv.nome}...`);
      const url = await uploadImagemParaStorage(srv.foto, srv.matricula);
      
      if (url) {
        console.log(`🔗 URL Gerada para ${srv.nome}: ${url}`);
        
        // Atualizar no banco de dados (Supabase)
        const { error } = await supabaseClient
          .from('servidores')
          .update({ foto: url })
          .eq('id', srv.id);
        
        if (!error) {
          srv.foto = url;
          sucessos++;
          toastMsg(`✅ Migrado: ${srv.nome}`, 'success');
        } else {
          erros++;
          console.error(`❌ Erro DB para ${srv.nome}:`, error.message);
        }
      } else {
        erros++;
        console.error(`❌ Falha no upload Storage para ${srv.nome}`);
      }
    } catch (e) {
      erros++;
      console.error(`❌ Exceção na migração de ${srv.nome}:`, e.message);
    }
    // Pausa curta para não sobrecarregar
    await new Promise(r => setTimeout(r, 600));
  }
  
  if (sucessos > 0) {
    localStorage.setItem('srv_servidores', JSON.stringify(_remoteData.servidores));
    renderTabela();
    toastMsg(`Sucesso: ${sucessos} fotos migradas!`, 'success');
  }

  if (erros > 0) {
    toastMsg(`Erro em ${erros} fotos: ${erroMsg}`, 'error');
  }
}

function carregarConfig() {
  const cfg = DB.config();
  document.getElementById('cfg-decreto').value = cfg.decreto || '';
  
  const subEl = document.getElementById('cfg-sidebar-sub');
  if (subEl) subEl.value = cfg.subtituloSidebar || 'Gestão de RH';
  const titEl = document.getElementById('cfg-sidebar-title');
  if (titEl) titEl.value = cfg.tituloSidebar || 'Férias / Folgas';
  
  const orgNameEl = document.getElementById('cfg-org-name');
  if (orgNameEl) orgNameEl.value = cfg.nomeOrganizacao || 'Coordenação da Atenção Primária à Saúde';
  const orgSizeEl = document.getElementById('cfg-org-font-size');
  if (orgSizeEl) orgSizeEl.value = cfg.tamanhoFonteOrg || 14;
  
  const logoSize = document.getElementById('cfg-logo-size');
  if (logoSize) {
    logoSize.value = cfg.tamanhoLogoHeader || 38;
    document.getElementById('val-logo-size').textContent = (cfg.tamanhoLogoHeader || 38) + 'px';
  }

  if (document.getElementById('cfg-coordenador')) {
    document.getElementById('cfg-coordenador').value = cfg.coordenadorAPS || '';
  }
  renderListaSetores();
  atualizarSelectsSetores();

  const maxConsec = document.getElementById('cfg-max-consec');
  if (maxConsec) maxConsec.value = cfg.maxFolgasConsecutivas ?? 5;
  const maxMes = document.getElementById('cfg-max-mes');
  if (maxMes) maxMes.value = cfg.maxFolgasMes ?? 5;

  const txtAut = document.getElementById('cfg-texto-autorizacao');
  if (txtAut) txtAut.value = cfg.textoAutorizacao || '';
  atualizarPreview();
  
  // Imagens: Tenta pegar do Supabase (config._remoteData), depois LocalStorage
  aplicarImagemHeader('esq', getImg('esq'));
  aplicarImagemHeader('dir', getImg('dir'));
  aplicarImagemHeader('print', getImg('print'));
  aplicarImagemHeader('side', getImg('side'));
  aplicarImagemHeader('login', getImg('login'));
}

function renderListaSetores() {
  const cont = document.getElementById('cfg-lista-setores');
  if (!cont) return;
  const cfg = DB.config();
  const setores = cfg.setores || [];
  
  if (setores.length === 0) {
    cont.innerHTML = '<p style="font-size:.8rem;color:var(--muted);width:100%">Nenhum setor cadastrado.</p>';
    return;
  }
  
  cont.innerHTML = setores.map(s => `
    <div class="tag">
      <span>${s}</span>
      <span class="remove-tag" onclick="removerSetor('${s}')" title="Remover">&times;</span>
    </div>
  `).join('');
}

function mudarEstiloBase(id, el) {
  const estilo = ESTILOS_BASE[id];
  if (!estilo) return;

  // Aplicar variáveis
  for (const [key, value] of Object.entries(estilo)) {
    document.documentElement.style.setProperty('--'+key, value);
  }

  // Atualizar UI
  document.querySelectorAll('[id^="btn-theme-"]').forEach(btn => btn.classList.replace('btn-primary', 'btn-ghost'));
  if (el) el.classList.replace('btn-ghost', 'btn-primary');

  // Salvar
  const cfg = DB.config();
  cfg.estiloBase = id;
  DB.saveConfig(cfg);
  atualizarIconeTema(id);
}

function toggleTema() {
  const cfg = DB.config();
  const isDark = !cfg.estiloBase || cfg.estiloBase === 'midnight' || cfg.estiloBase === 'ocean' || cfg.estiloBase === 'forest';
  const novo = isDark ? 'clean' : 'midnight';
  mudarEstiloBase(novo);
  if (cfg.tema) mudarCorTema(cfg.tema);
}

function atualizarIconeTema(estilo) {
  const icon = document.getElementById('theme-icon');
  const label = document.getElementById('theme-label');
  if (!icon || !label) return;
  const isDark = estilo !== 'clean';
  icon.textContent = isDark ? '🌙' : '☀️';
  label.textContent = isDark ? 'Modo Escuro' : 'Modo Claro';
}

async function mudarCorTema(cor, el) {
  const accent = hexToShade(cor, 10);
  document.documentElement.style.setProperty('--primary', cor);
  document.documentElement.style.setProperty('--primary-dark', hexToShade(cor, -15));
  document.documentElement.style.setProperty('--accent', accent);
  
  if (el) {
    document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('cfg-cor-custom').value = cor;
  }

  const cfg = DB.config();
  cfg.tema = cor;
  await DB.saveConfig(cfg);
}

function hexToRgb(hex) {
  const bigint = parseInt(hex.replace('#',''), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgb(${r}, ${g}, ${b})`;
}

function atualizarPreview() {
  const decreto = document.getElementById('cfg-decreto')?.value || '[DECRETO]';
  document.getElementById('preview-msg').textContent =
    `Olá, [NOME DO SERVIDOR]!\n\nInformamos que suas férias estão próximas do vencimento.\nVocê deve comparecer à Coordenação para solicitar suas férias, conforme:\n\n${decreto || '[DECRETO]'}\n\nSetor: [SETOR]\nMatrícula: [MATRÍCULA]\nFérias Regulamentares Acumuladas: [NR]\nFérias Prêmio Acumuladas: [NP]\n\nAtenciosamente,\nCoordenação da APS`;
}

function carregarImagem(lado, input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) return toastMsg('Imagem muito grande! Máximo: 2MB', 'error');
  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result;
    localStorage.setItem('srv_img_' + lado, base64);
    
    // Salvar apenas referência no Supabase, não a imagem inteira
    // Armazenar só que a imagem existe e foi modificada
    await supabaseClient.from('configuracoes').upsert({ chave: 'img_' + lado, valor: 'stored_locally' });
    _remoteData.config['img_' + lado] = base64;

    aplicarImagemHeader(lado, base64);
    const nomes = { esq: 'esquerda', dir: 'direita', print: 'de impressão', side: 'lateral', login: 'de login' };
    toastMsg('Imagem ' + (nomes[lado] || lado) + ' salva!');
  };
  reader.readAsDataURL(file);
}

function aplicarImagemHeader(lado, base64) {
  // Atualizar exibição no sistema (Cabeçalho, Sidebar ou Login)
  if (lado === 'side') {
    const cont = document.getElementById('sidebar-logo-container');
    if (cont) {
      if (base64) {
        cont.style.background = 'none';
        cont.style.boxShadow = 'none';
        cont.innerHTML = `<img src="${base64}" style="max-width: 100%; max-height: 80px; object-fit: contain; display: block; filter: none; border-radius: 8px;">`;
      } else {
        cont.style.background = 'linear-gradient(135deg, var(--primary), var(--accent))';
        cont.style.boxShadow = '0 0 20px rgba(77,123,255,0.25)';
        cont.innerHTML = '🌴';
      }
    }
  } else if (lado === 'login') {
    const cont = document.getElementById('login-logo-container');
    if (cont) {
      if (base64) {
        cont.style.background = 'none';
        cont.innerHTML = `<img src="${base64}" style="max-width: 100%; max-height: 120px; object-fit: contain; margin-bottom: 20px; border-radius: 8px; animation: popLogin 0.5s ease;">`;
      } else {
        cont.style.background = 'linear-gradient(135deg, var(--primary), var(--accent))';
        cont.innerHTML = '🌴';
      }
    }
  } else {
    const imgEl = document.getElementById('header-img-' + lado);
    if (imgEl) {
      const cfg = DB.config();
      if (base64) {
        imgEl.src = base64;
        imgEl.style.display = 'block';
        imgEl.style.maxHeight = (cfg.tamanhoLogoHeader || 38) + 'px';
      } else {
        imgEl.src = '';
        imgEl.style.display = 'none';
      }
    }
  }

  // Atualizar Preview na aba Configurações
  const previewWrap = document.getElementById('preview-' + lado + '-wrap');
  if (previewWrap) {
    if (base64) {
      previewWrap.innerHTML = `<div class="img-preview-wrap"><img src="${base64}" class="img-preview" style="max-height: 80px; border-radius: 8px;"></div>`;
    } else {
      const icons = { esq: '📷', dir: '📷', print: '📋', side: '🌇', login: '🔑' };
      const msgs = {
        esq: 'Clique para selecionar a imagem<br><small>PNG, JPG, SVG — recomendado 200×80px</small>',
        dir: 'Clique para selecionar a imagem<br><small>PNG, JPG, SVG — recomendado 200×80px</small>',
        print: 'Clique para selecionar o logotipo de impressão<br><small>Recomendado: Formato retangular (ex: 400×100px)</small>',
        side: 'Clique para selecionar o logo lateral<br><small>Quadrado ou Redondo recomendado (ex: 100×100px)</small>',
        login: 'Clique para selecionar o logotipo da tela de login<br><small>Recomendado: Formato retangular ou quadrado (ex: 200×100px)</small>'
      };
      previewWrap.innerHTML = `<div class="img-upload-icon">${icons[lado] || '📷'}</div><div class="img-upload-label">${msgs[lado] || ''}</div>`;
    }
  }
}

function renderConfig() {
  const cargos = DB.cargos();
  const creds = DB.credenciados();
  const pontos = DB.pontoMensal();
  const elCargos = document.getElementById('cfg-total-cargos');
  const elCreds = document.getElementById('cfg-total-credenciados');
  const elPontos = document.getElementById('cfg-total-fechamentos');
  if (elCargos) elCargos.textContent = cargos.length;
  if (elCreds) elCreds.textContent = creds.length;
  if (elPontos) elPontos.textContent = pontos.length;
}
