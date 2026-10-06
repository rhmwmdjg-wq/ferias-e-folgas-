// Módulo Eventos e Veículos.
// Cadastros, escalas, conflitos e badges.

// ===================== EVENTOS & VEÍCULOS MODULE =====================
// Categorias profissionais padrão
const CATEGORIAS_PROFISSIONAIS = [
  'Médico', 'Enfermeiro', 'Técnico de Enfermagem', 'Dentista',
  'Técnico em Saúde Bucal', 'Fisioterapeuta', 'Psicólogo',
  'Assistente Social', 'Farmacêutico', 'Nutricionista',
  'Agente Comunitário de Saúde', 'Agente de Combate às Endemias',
  'Motorista', 'Condutor de Ambulância', 'Vigilante',
  'Administrativo', 'Recepcionista', 'Auxiliar de Serviços Gerais',
  'Coordenador', 'Outro'
];

// ---- DATA STORAGE ----
let _eventosData = JSON.parse(localStorage.getItem('srv_eventos') || '[]');
let _veiculosData = JSON.parse(localStorage.getItem('srv_veiculos') || '[]');

function salvarEventosStorage() {
  DB.saveEventos(_eventosData);
}
function salvarVeiculosStorage() {
  DB.saveVeiculos(_veiculosData);
}

// ---- CONTROLE DE FROTAS & VEÍCULOS MODULE ----
let _tempVeiculoPdfFile = null;

// Lista pré-cadastrada de modelos (marca + modelo) para pesquisa/autocomplete.
const MODELOS_VEICULOS = [
  // FIAT
  'FIAT ARGO', 'FIAT MOBI', 'FIAT CRONOS', 'FIAT UNO', 'FIAT PALIO', 'FIAT SIENA', 'FIAT GRAND SIENA',
  'FIAT STRADA', 'FIAT TORO', 'FIAT PULSE', 'FIAT FASTBACK', 'FIAT DUCATO', 'FIAT FIORINO', 'FIAT DOBLO',
  'FIAT SCUDO', 'FIAT STILO', 'FIAT IDEA', 'FIAT BRAVO', 'FIAT PUNTO', 'FIAT LINEA', 'FIAT 147', 'FIAT MAREA',
  // VOLKSWAGEN
  'VOLKSWAGEN GOL', 'VOLKSWAGEN VOYAGE', 'VOLKSWAGEN SAVEIRO', 'VOLKSWAGEN POLO', 'VOLKSWAGEN VIRTUS',
  'VOLKSWAGEN NIVUS', 'VOLKSWAGEN T-CROSS', 'VOLKSWAGEN TAOS', 'VOLKSWAGEN AMAROK', 'VOLKSWAGEN UP',
  'VOLKSWAGEN FOX', 'VOLKSWAGEN CROSSFOX', 'VOLKSWAGEN SPACEFOX', 'VOLKSWAGEN JETTA', 'VOLKSWAGEN PARATI',
  'VOLKSWAGEN SANTANA', 'VOLKSWAGEN KOMBI', 'VOLKSWAGEN DELIVERY', 'VOLKSWAGEN CONSTELLATION',
  // CHEVROLET
  'CHEVROLET ONIX', 'CHEVROLET PRISMA', 'CHEVROLET TRACKER', 'CHEVROLET CRUZE', 'CHEVROLET SPIN',
  'CHEVROLET S10', 'CHEVROLET MONTANA', 'CHEVROLET EQUINOX', 'CHEVROLET CORSA', 'CHEVROLET CLASSIC',
  'CHEVROLET CELTA', 'CHEVROLET AGILE', 'CHEVROLET MERIVA', 'CHEVROLET ZAFIRA', 'CHEVROLET ASTRA',
  'CHEVROLET VECTRA', 'CHEVROLET BLAZER', 'CHEVROLET D20', 'CHEVROLET VERANEIO', 'CHEVROLET TRAILBLAZER',
  // TOYOTA
  'TOYOTA COROLLA', 'TOYOTA ETIOS', 'TOYOTA YARIS', 'TOYOTA HILUX', 'TOYOTA SW4', 'TOYOTA RAV4',
  'TOYOTA CAMRY', 'TOYOTA PRIUS', 'TOYOTA LAND CRUISER', 'TOYOTA BANDEIRANTE',
  // FORD
  'FORD KA', 'FORD ECOSPORT', 'FORD RANGER', 'FORD FIESTA', 'FORD FOCUS', 'FORD FUSION', 'FORD ESCORT',
  'FORD CORCEL', 'FORD F-1000', 'FORD F-4000', 'FORD TRANSIT', 'FORD BELINA', 'FORD DEL REY', 'FORD MAVERICK',
  // HYUNDAI
  'HYUNDAI HB20', 'HYUNDAI CRETA', 'HYUNDAI TUCSON', 'HYUNDAI IX35', 'HYUNDAI SANTA FE', 'HYUNDAI I30',
  'HYUNDAI ELANTRA', 'HYUNDAI HR',
  // RENAULT
  'RENAULT KWID', 'RENAULT SANDERO', 'RENAULT LOGAN', 'RENAULT DUSTER', 'RENAULT OROCH', 'RENAULT CAPTUR',
  'RENAULT MEGANE', 'RENAULT CLIO', 'RENAULT SCENIC', 'RENAULT MASTER', 'RENAULT KANGOO',
  // HONDA
  'HONDA FIT', 'HONDA CITY', 'HONDA CIVIC', 'HONDA HR-V', 'HONDA WR-V', 'HONDA CR-V', 'HONDA ACCORD',
  // NISSAN
  'NISSAN MARCH', 'NISSAN VERSA', 'NISSAN KICKS', 'NISSAN FRONTIER', 'NISSAN LIVINA', 'NISSAN X-TRAIL',
  'NISSAN GRAND LIVINA',
  // JEEP / RAM
  'JEEP RENEGADE', 'JEEP COMPASS', 'JEEP COMMANDER', 'JEEP WRANGLER', 'JEEP CHEROKEE',
  'RAM 700', 'RAM 1000', 'RAM 1500', 'RAM RAMPAGE',
  // MITSUBISHI
  'MITSUBISHI L200', 'MITSUBISHI PAJERO', 'MITSUBISHI OUTLANDER', 'MITSUBISHI ASX', 'MITSUBISHI LANCER',
  // CITROEN / PEUGEOT
  'CITROEN C3', 'CITROEN C4', 'CITROEN C3 AIRCROSS', 'CITROEN JUMPER', 'CITROEN BERLINGO', 'CITROEN JUMPY',
  'CITROEN XSARA', 'CITROEN PICASSO',
  'PEUGEOT 208', 'PEUGEOT 2008', 'PEUGEOT 3008', 'PEUGEOT 308', 'PEUGEOT PARTNER', 'PEUGEOT BOXER',
  'PEUGEOT EXPERT', 'PEUGEOT 206', 'PEUGEOT 207', 'PEUGEOT HOGGAR',
  // CHINESES E OUTRAS MARCAS
  'CAOA CHERY TIGGO 5X', 'CAOA CHERY TIGGO 7', 'CAOA CHERY TIGGO 8', 'CAOA CHERY ARRIZO', 'CHERY QQ', 'CHERY CELER',
  'BYD DOLPHIN', 'BYD SONG', 'BYD YUAN', 'JAC T6', 'JAC J3', 'JAC J5', 'JAC IEV',
  'SUZUKI JIMNY', 'SUZUKI VITARA', 'SUZUKI GRAND VITARA', 'TROLLER T4', 'EFFA V22', 'LIFAN X60',
  'IVECO DAILY', 'MERCEDES-BENZ SPRINTER', 'MERCEDES-BENZ ACCELO', 'VOLVO', 'SCANIA', 'AGRALE',
  'MARCOPOLO VOLARE', 'MARCOPOLO', 'COMIL', 'NEOBUS', 'CAIO', 'VOLARE',
  // ---- MOTOS ----
  // HONDA
  'HONDA CG 160 FAN', 'HONDA CG 160 TITAN', 'HONDA CG 160 START', 'HONDA CG 160 CARGO', 'HONDA BIZ 125',
  'HONDA POP 110I', 'HONDA PCX 160', 'HONDA ADV 160', 'HONDA ELITE 125', 'HONDA LEAD 110',
  'HONDA NXR 160 BROS', 'HONDA XRE 190', 'HONDA XRE 300', 'HONDA XRE 300 SAHARA', 'HONDA CB 300F TWISTER',
  'HONDA CB 500X', 'HONDA CB 650R', 'HONDA CBR 650R', 'HONDA XR 250 TORNADO', 'HONDA XLX 350',
  'HONDA NX 400I FALCON', 'HONDA NC 750X', 'HONDA AFRICA TWIN', 'HONDA GOLD WING',
  // YAMAHA
  'YAMAHA FACTOR 150', 'YAMAHA FAZER 250', 'YAMAHA FZ25', 'YAMAHA FZ15', 'YAMAHA CROSSER 150',
  'YAMAHA XTZ 150', 'YAMAHA XTZ 250 LANDER', 'YAMAHA XTZ 250 TENERE', 'YAMAHA XT 660', 'YAMAHA MT-03',
  'YAMAHA MT-07', 'YAMAHA MT-09', 'YAMAHA YZF-R15', 'YAMAHA YZF-R3', 'YAMAHA NMAX 160', 'YAMAHA AEROX 155',
  'YAMAHA FLUO 125', 'YAMAHA NEO 125', 'YAMAHA CRYPTON', 'YAMAHA DRAG STAR',
  // SUZUKI
  'SUZUKI YES 125', 'SUZUKI INTRUDER 125', 'SUZUKI INTRUDER 150', 'SUZUKI GIXXER 150', 'SUZUKI GIXXER 250',
  'SUZUKI V-STROM 250', 'SUZUKI V-STROM 650', 'SUZUKI GSX-R', 'SUZUKI BOULEVARD', 'SUZUKI BURGMAN',
  // KAWASAKI / KTM / BMW / ROYAL ENFIELD
  'KAWASAKI NINJA 300', 'KAWASAKI NINJA 400', 'KAWASAKI NINJA 650', 'KAWASAKI Z400', 'KAWASAKI Z650',
  'KAWASAKI Z900', 'KAWASAKI VERSYS', 'KAWASAKI VULCAN',
  'KTM DUKE 200', 'KTM DUKE 390', 'KTM RC 200', 'KTM RC 390',
  'BMW G 310 R', 'BMW G 310 GS', 'BMW F 750 GS', 'BMW F 850 GS', 'BMW R 1250 GS', 'BMW S 1000 RR',
  'ROYAL ENFIELD HUNTER 350', 'ROYAL ENFIELD CLASSIC 350', 'ROYAL ENFIELD METEOR 350', 'ROYAL ENFIELD HIMALAYAN',
  // DAFRA / KASINSKI / SUNDOWN
  'DAFRA CITYCOM', 'DAFRA HORIZON', 'DAFRA NEXT', 'DAFRA RIVA', 'DAFRA Z-FORCE', 'DAFRA APACHE',
  'DAFRA KANSAS', 'DAFRA SPEED', 'KASINSKI COMET', 'KASINSKI MIRAGE', 'KASINSKI PRIMA', 'KASINSKI WINNER',
  'SUNDOWN FUTURE', 'SUNDOWN WEB', 'SUNDOWN MAX',
  // HAOJUE / SHINERAY / BENELLI / VESPA
  'HAOJUE CHOPPER ROAD', 'HAOJUE DK 150', 'HAOJUE MASTER RIDE', 'HAOJUE NEX', 'HAOJUE LINDY',
  'HAOJUE EAGLE', 'HAOJUE SUPRA', 'HAOJUE SLINGSHOT',
  'SHINERAY XY 50', 'SHINERAY XY 150', 'SHINERAY PHOENIX', 'SHINERAY JET', 'SHINERAY WORKER',
  'BENELLI TRK 251', 'BENELLI TRK 502', 'BENELLI LEONCINO', 'BENELLI 302S',
  'VESPA PRIMAVERA', 'VESPA SPRINT', 'PIAGGIO BEVERLY', 'MOTTU SPORT', 'VOLTZ EV1', 'TRAXX'
];

function popularDatalistModelosVeiculos() {
  const dl = document.getElementById('datalist-veic-modelo');
  if (!dl) return;
  const modelos = new Set(MODELOS_VEICULOS);
  (_veiculosData || []).forEach(v => { if (v && v.modelo) modelos.add(String(v.modelo).toUpperCase()); });
  const arr = Array.from(modelos).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  dl.innerHTML = arr.map(m => `<option value="${esc(m)}"></option>`).join('');
}

function processarArquivoPdfVeiculo(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.type !== 'application/pdf') {
    return toastMsg('Apenas arquivos no formato PDF são permitidos.', 'warning');
  }
  if (file.size > 10 * 1024 * 1024) {
    return toastMsg('Tamanho máximo permitido: 10MB', 'warning');
  }
  _tempVeiculoPdfFile = file;
  const nameView = document.getElementById('veic-pdf-nome-view');
  if (nameView) nameView.textContent = file.name + ' (' + (file.size / 1024 / 1024).toFixed(2) + 'MB)';
  const statusArea = document.getElementById('veic-pdf-status-area');
  if (statusArea) statusArea.style.display = 'flex';
  toastMsg('Documento PDF selecionado!', 'info');
}

function removerPdfFormulario() {
  _tempVeiculoPdfFile = null;
  const input = document.getElementById('veic-pdf-input');
  if (input) input.value = '';
  const urlEl = document.getElementById('veic-pdf-url');
  if (urlEl) urlEl.value = '';
  const nomeEl = document.getElementById('veic-pdf-nome');
  if (nomeEl) nomeEl.value = '';
  const statusArea = document.getElementById('veic-pdf-status-area');
  if (statusArea) statusArea.style.display = 'none';
}

function visualizarPdfFormulario() {
  const url = document.getElementById('veic-pdf-url')?.value;
  const nome = document.getElementById('veic-pdf-nome')?.value || 'Documento';
  if (_tempVeiculoPdfFile) {
    const objectUrl = URL.createObjectURL(_tempVeiculoPdfFile);
    abrirModalPdfVeiculo(objectUrl, _tempVeiculoPdfFile.name);
  } else if (url) {
    abrirModalPdfVeiculo(url, nome);
  } else {
    toastMsg('Nenhum PDF disponível para visualização.', 'warning');
  }
}

function abrirModalPdfVeiculo(url, nome) {
  const modal = document.getElementById('modal-pdf-veiculo');
  const iframe = document.getElementById('modal-pdf-iframe');
  const titulo = document.getElementById('modal-pdf-titulo');
  const downloadBtn = document.getElementById('modal-pdf-download-btn');
  if (!modal || !iframe) return;
  
  if (titulo) titulo.textContent = nome || 'Documento do Veículo';
  iframe.src = url;
  if (downloadBtn) {
    downloadBtn.href = url;
    downloadBtn.download = nome || 'documento_veiculo.pdf';
  }
  modal.classList.add('open');
}

async function uploadPdfParaStorage(file, veiculoId) {
  if (!file) return null;
  try {
    const fileName = `veiculo_${veiculoId || Date.now()}_${Date.now()}.pdf`;
    const filePath = `veiculos/${fileName}`;
    let bucketName = 'documentos';

    let { data, error } = await supabaseClient.storage
      .from(bucketName)
      .upload(filePath, file, { contentType: 'application/pdf', upsert: true });

    if (error && (error.message?.includes('not found') || error.status === 404)) {
      bucketName = 'FOTOS';
      const retry = await supabaseClient.storage
        .from(bucketName)
        .upload(filePath, file, { contentType: 'application/pdf', upsert: true });
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.warn("⚠️ Fallback local base64 para PDF devido a restrição no Storage:", error);
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
    }

    const { data: { publicUrl } } = supabaseClient.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (err) {
    console.error("❌ Erro no upload do PDF:", err);
    return null;
  }
}

function renderVeiculos() {
  _veiculosData = DB.veiculos();
  popularDatalistModelosVeiculos();
  const container = document.getElementById('lista-veiculos');
  if (!container) return;

  // Atualizar KPIs da Frota
  const totalVeiculos = _veiculosData.length;
  const valorTotal = _veiculosData.reduce((acc, v) => acc + (parseFloat(v.valorCompra) || 0), 0);
  const totalPdfs = _veiculosData.filter(v => v.pdfUrl || v.pdf_url).length;
  const fontesUnicas = new Set(_veiculosData.map(v => (v.fonte || '').trim().toUpperCase()).filter(Boolean)).size;
  const totalSucatas = _veiculosData.filter(v => v.sucata === true).length;

  const kpiTotal = document.getElementById('kpi-total-veiculos');
  const kpiValor = document.getElementById('kpi-valor-total-frota');
  const kpiPdfs = document.getElementById('kpi-veiculos-com-pdf');
  const kpiFontes = document.getElementById('kpi-veiculos-fontes');
  const kpiSucata = document.getElementById('kpi-veiculos-sucata');

  if (kpiTotal) kpiTotal.textContent = totalVeiculos;
  if (kpiValor) kpiValor.textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorTotal);
  if (kpiPdfs) kpiPdfs.textContent = totalPdfs;
  if (kpiFontes) kpiFontes.textContent = fontesUnicas;
  if (kpiSucata) kpiSucata.textContent = totalSucatas;

  // Filtragem
  const busca = (document.getElementById('veic-busca')?.value || '').toLowerCase().trim();
  let lista = _veiculosData;

  if (busca) {
    lista = lista.filter(v => 
      (v.nome || '').toLowerCase().includes(busca) ||
      (v.placa || '').toLowerCase().includes(busca) ||
      (v.modelo || '').toLowerCase().includes(busca) ||
      (v.renavam || '').toLowerCase().includes(busca) ||
      (v.notaFiscal || v.nota_fiscal || '').toLowerCase().includes(busca) ||
      (v.resolucao || '').toLowerCase().includes(busca) ||
      (v.fonte || '').toLowerCase().includes(busca) ||
      (v.ficha || '').toLowerCase().includes(busca) ||
      (v.sucata ? 'sucata baixado' : '').includes(busca)
    );
  }

  if (lista.length === 0) {
    container.innerHTML = '<div class="empty"><div class="icon">🚗</div><p>Nenhum veículo encontrado na frota.</p></div>';
    return;
  }

  container.innerHTML = lista.map(v => {
    const valorFmt = v.valorCompra ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v.valorCompra) : null;
    const pdfUrl = v.pdfUrl || v.pdf_url;
    const pdfNome = v.pdfNome || v.pdf_nome || 'Documento PDF';
    const nf = v.notaFiscal || v.nota_fiscal;
    const setorAtual = v.setorAtual || v.setor_atual || '-';
    const setorPertence = v.setorPertence || v.setor_pertence || '-';
    const isSucata = v.sucata === true;

    return `<div class="ev-list-item completo" style="margin-bottom:12px${isSucata ? ';opacity:0.85;border-left:4px solid var(--danger)' : ''}">
      <div class="ev-list-header">
        <div style="flex:1; min-width:0;">
          <div class="ev-list-nome" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="${isSucata ? 'text-decoration:line-through' : ''}">🚗 ${esc(v.nome)}</span>
            ${isSucata ? '<span class="tag tag-red">🗑️ SUCATA</span>' : ''}
            ${v.placa ? `<span class="tag tag-blue">${esc(v.placa)}</span>` : ''}
            ${valorFmt ? `<span class="tag tag-green">💰 ${valorFmt}</span>` : ''}
          </div>
          <div class="ev-list-meta" style="margin-top:6px; font-size:0.75rem; display:flex; gap:12px; flex-wrap:wrap;">
            <span>📍 <strong>Setor Atual (Hoje):</strong> ${esc(setorAtual)}</span>
            <span>🏢 <strong>Setor Origem (Pertence):</strong> ${esc(setorPertence)}</span>
            ${v.modelo ? `<span>🚘 <strong>Modelo:</strong> ${esc(v.modelo)}</span>` : ''}
            ${v.cor ? `<span>🎨 <strong>Cor:</strong> ${esc(v.cor)}</span>` : ''}
            ${v.renavam ? `<span>📋 <strong>RENAVAM:</strong> ${esc(v.renavam)}</span>` : ''}
            ${nf ? `<span>🧾 <strong>NF:</strong> ${esc(nf)}</span>` : ''}
            ${v.resolucao ? `<span>📜 <strong>Resolução:</strong> ${esc(v.resolucao)}</span>` : ''}
            ${v.ficha ? `<span>📑 <strong>Ficha:</strong> ${esc(v.ficha)}</span>` : ''}
            ${v.fonte ? `<span>🏛️ <strong>Fonte:</strong> ${esc(v.fonte)}</span>` : ''}
          </div>
          ${v.obs ? `<div style="font-size:0.75rem; color:var(--muted); margin-top:6px; background:rgba(255,255,255,0.02); padding:4px 8px; border-radius:4px;">💬 ${esc(v.obs)}</div>` : ''}
        </div>
        <div class="ev-list-actions" style="display:flex; gap:6px; align-items:center;">
          ${pdfUrl ? `<button class="btn btn-ghost btn-sm" style="color:var(--danger);" onclick="abrirModalPdfVeiculo('${pdfUrl}', '${esc(pdfNome)}')" title="Visualizar Documento PDF">📄 PDF</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="editarVeiculo('${v.id}')" title="Editar Veículo">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="excluirVeiculo('${v.id}')" title="Excluir Veículo">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function salvarVeiculo() {
  const id = document.getElementById('veic-id').value;
  const nome = document.getElementById('veic-nome').value.trim();
  const placa = document.getElementById('veic-placa').value.trim().toUpperCase();

  if (!nome) return toastMsg('Informe o nome/descrição do veículo.', 'warning');
  if (!placa) return toastMsg('Informe a placa do veículo.', 'warning');

  const btnSalvar = document.getElementById('btn-salvar-veiculo');
  if (btnSalvar) {
    btnSalvar.disabled = true;
    btnSalvar.textContent = '⏳ Salvando...';
  }

  try {
    let pdfUrl = document.getElementById('veic-pdf-url').value;
    let pdfNome = document.getElementById('veic-pdf-nome').value;

    if (_tempVeiculoPdfFile) {
      toastMsg('Enviando documento PDF...', 'info');
      const urlEnviada = await uploadPdfParaStorage(_tempVeiculoPdfFile, id || uid());
      if (urlEnviada) {
        pdfUrl = urlEnviada;
        pdfNome = _tempVeiculoPdfFile.name;
      }
    }

    const valorRaw = parseFloat(document.getElementById('veic-valor').value);
    const valorCompra = isNaN(valorRaw) ? 0 : valorRaw;

    const dados = {
      nome,
      placa,
      modelo: document.getElementById('veic-modelo').value.trim(),
      cor: document.getElementById('veic-cor').value.trim(),
      renavam: document.getElementById('veic-renavam').value.trim(),
      notaFiscal: document.getElementById('veic-nota-fiscal').value.trim(),
      resolucao: document.getElementById('veic-resolucao').value.trim(),
      ficha: document.getElementById('veic-ficha').value.trim(),
      fonte: document.getElementById('veic-fonte').value.trim(),
      valorCompra,
      setorAtual: document.getElementById('veic-setor-atual').value.trim(),
      setorPertence: document.getElementById('veic-setor-pertence').value.trim(),
      sucata: document.getElementById('veic-sucata')?.checked === true,
      pdfUrl,
      pdfNome,
      obs: document.getElementById('veic-obs').value.trim(),
      criadoEm: new Date().toISOString()
    };

    if (id) {
      const idx = _veiculosData.findIndex(v => v.id === id);
      if (idx >= 0) {
        _veiculosData[idx] = { ..._veiculosData[idx], ...dados };
      }
      toastMsg('Veículo atualizado com sucesso!', 'success');
    } else {
      dados.id = uid();
      _veiculosData.push(dados);
      toastMsg('Veículo cadastrado com sucesso!', 'success');
    }

    await salvarVeiculosStorage();
    limparFormVeiculo();
    renderVeiculos();
    popularSelectVeiculos('ev-veiculo');
  } catch (err) {
    console.error("Erro ao salvar veículo:", err);
    toastMsg('Erro ao salvar veículo: ' + err.message, 'error');
  } finally {
    if (btnSalvar) {
      btnSalvar.disabled = false;
      btnSalvar.textContent = '💾 Salvar Veículo';
    }
  }
}

function editarVeiculo(id) {
  const v = _veiculosData.find(v => v.id === id);
  if (!v) return;
  document.getElementById('veic-id').value = v.id;
  document.getElementById('veic-nome').value = v.nome || '';
  document.getElementById('veic-placa').value = v.placa || '';
  document.getElementById('veic-modelo').value = v.modelo || '';
  document.getElementById('veic-cor').value = v.cor || '';
  document.getElementById('veic-renavam').value = v.renavam || '';
  document.getElementById('veic-nota-fiscal').value = v.notaFiscal || v.nota_fiscal || '';
  document.getElementById('veic-resolucao').value = v.resolucao || '';
  document.getElementById('veic-ficha').value = v.ficha || '';
  document.getElementById('veic-fonte').value = v.fonte || '';
  document.getElementById('veic-valor').value = v.valorCompra || '';
  document.getElementById('veic-setor-atual').value = v.setorAtual || v.setor_atual || '';
  document.getElementById('veic-setor-pertence').value = v.setorPertence || v.setor_pertence || '';
  const sucataEl = document.getElementById('veic-sucata');
  if (sucataEl) sucataEl.checked = v.sucata === true;
  document.getElementById('veic-pdf-url').value = v.pdfUrl || v.pdf_url || '';
  document.getElementById('veic-pdf-nome').value = v.pdfNome || v.pdf_nome || '';
  document.getElementById('veic-obs').value = v.obs || '';

  _tempVeiculoPdfFile = null;
  const statusArea = document.getElementById('veic-pdf-status-area');
  const pdfUrl = v.pdfUrl || v.pdf_url;
  if (pdfUrl && statusArea) {
    const nameView = document.getElementById('veic-pdf-nome-view');
    if (nameView) nameView.textContent = v.pdfNome || v.pdf_nome || 'Documento PDF Anexado';
    statusArea.style.display = 'flex';
  } else if (statusArea) {
    statusArea.style.display = 'none';
  }

  const titleEl = document.getElementById('veic-form-title');
  if (titleEl) titleEl.textContent = 'Editar Veículo';

  const cardForm = document.getElementById('card-form-veiculo');
  if (cardForm) cardForm.scrollIntoView({ behavior: 'smooth' });
}

async function excluirVeiculo(id) {
  const v = _veiculosData.find(v => v.id === id);
  const desc = v ? `${v.nome} (${v.placa || 'Sem placa'})` : 'este veículo';
  if (!confirm(`Deseja realmente excluir permanentemente ${desc}?`)) return;

  _veiculosData = _veiculosData.filter(v => v.id !== id);
  salvarVeiculosStorage();
  await DB.deleteVeiculo(id);
  renderVeiculos();
  popularSelectVeiculos('ev-veiculo');
  toastMsg('Veículo excluído com sucesso.', 'info');
}

function limparFormVeiculo() {
  _tempVeiculoPdfFile = null;
  document.getElementById('veic-id').value = '';
  document.getElementById('veic-nome').value = '';
  document.getElementById('veic-placa').value = '';
  document.getElementById('veic-modelo').value = '';
  document.getElementById('veic-cor').value = '';
  document.getElementById('veic-renavam').value = '';
  document.getElementById('veic-nota-fiscal').value = '';
  document.getElementById('veic-resolucao').value = '';
  document.getElementById('veic-ficha').value = '';
  document.getElementById('veic-fonte').value = '';
  document.getElementById('veic-valor').value = '';
  document.getElementById('veic-setor-atual').value = '';
  document.getElementById('veic-setor-pertence').value = '';
  const sucataEl = document.getElementById('veic-sucata');
  if (sucataEl) sucataEl.checked = false;
  document.getElementById('veic-pdf-url').value = '';
  document.getElementById('veic-pdf-nome').value = '';
  document.getElementById('veic-obs').value = '';

  const inputPdf = document.getElementById('veic-pdf-input');
  if (inputPdf) inputPdf.value = '';

  const statusArea = document.getElementById('veic-pdf-status-area');
  if (statusArea) statusArea.style.display = 'none';

  const titleEl = document.getElementById('veic-form-title');
  if (titleEl) titleEl.textContent = 'Cadastrar Veículo';
}

function popularSelectVeiculos(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">Nenhum</option>' +
    _veiculosData.map(v => `<option value="${v.id}">${esc(v.nome)}${v.placa ? ' ('+esc(v.placa)+')' : ''}</option>`).join('');
  if (atual) sel.value = atual;
}

// ---- VEÍCULOS (sub-painel dentro de Eventos) ----
function renderVeiculosSub() {
  _veiculosData = DB.veiculos();
  popularDatalistModelosVeiculos();
  const container = document.getElementById('ev-sub-lista-veiculos');
  if (!container) return;
  renderVeiculosNoContainer(container);
}

function renderVeiculosNoContainer(container) {
  if (_veiculosData.length === 0) {
    container.innerHTML = '<div class="empty"><div class="icon">🚗</div><p>Nenhum veículo.</p></div>';
    return;
  }
  container.innerHTML = _veiculosData.map(v => `
    <div class="ev-list-item completo" style="cursor:default${v.sucata === true ? ';opacity:0.85;border-left:4px solid var(--danger)' : ''}">
      <div class="ev-list-header">
        <div>
          <div class="ev-list-nome">🚗 ${esc(v.nome)} ${v.sucata === true ? '<span class="tag tag-red">🗑️ SUCATA</span>' : ''}</div>
          <div class="ev-list-meta">${esc(v.placa||'-')} · ${esc(v.modelo||'-')} · ${esc(v.cor||'-')}</div>
        </div>
        <div class="ev-list-actions">
          <button class="btn btn-danger btn-sm" onclick="excluirVeiculoSub('${v.id}')">🗑️</button>
        </div>
      </div>
    </div>
  `).join('');
}

function salvarVeiculoEv() {
  const nome = document.getElementById('ev-veic-nome').value.trim();
  if (!nome) return toastMsg('Informe o nome do veículo.', 'warning');
  const dados = {
    id: uid(),
    nome,
    placa: document.getElementById('ev-veic-placa').value.trim(),
    modelo: document.getElementById('ev-veic-modelo').value.trim(),
    cor: document.getElementById('ev-veic-cor').value.trim(),
    sucata: document.getElementById('ev-veic-sucata')?.checked === true,
    obs: document.getElementById('ev-veic-obs').value.trim(),
    criadoEm: new Date().toISOString()
  };
  _veiculosData.push(dados);
  salvarVeiculosStorage();
  limparFormVeiculoEv();
  renderVeiculosSub();
  popularSelectVeiculos('ev-veiculo');
  toastMsg('Veículo cadastrado!', 'success');
}

async function excluirVeiculoSub(id) {
  if (!confirm('Excluir este veículo permanentemente?')) return;
  _veiculosData = _veiculosData.filter(v => v.id !== id);
  salvarVeiculosStorage();
  await DB.deleteVeiculo(id);
  renderVeiculosSub();
  popularSelectVeiculos('ev-veiculo');
}

function limparFormVeiculoEv() {
  document.getElementById('ev-veic-nome').value = '';
  document.getElementById('ev-veic-placa').value = '';
  document.getElementById('ev-veic-modelo').value = '';
  document.getElementById('ev-veic-cor').value = '';
  const sucataEl = document.getElementById('ev-veic-sucata');
  if (sucataEl) sucataEl.checked = false;
  document.getElementById('ev-veic-obs').value = '';
}

// ---- SUBTAB NAVIGATION (dentro do painel Eventos) ----
function toggleEvSubtab(subtab, btn) {
  document.querySelectorAll('#ev-subtabs .ev-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('ev-sub-eventos').style.display = subtab === 'eventos' ? '' : 'none';
  document.getElementById('ev-sub-veiculos').style.display = subtab === 'veiculos' ? '' : 'none';
  if (subtab === 'veiculos') renderVeiculosSub();
  if (subtab === 'eventos') popularSelectVeiculos('ev-veiculo');
}

// ---- EVENTOS ----
let _evCategorias = [{ categoria: '', quantidade: 1 }];

function uid(size = 8) {
  return Math.random().toString(36).substring(2, 2 + size) + Date.now().toString(36);
}

function renderEventos() {
  popularSelectVeiculos('ev-veiculo');
  const container = document.getElementById('lista-eventos');
  if (!container) return;
  const busca = (document.getElementById('ev-busca')?.value || '').toLowerCase();
  const filtroStatus = document.getElementById('ev-filtro-status')?.value || '';

  let lista = _eventosData;
  if (busca) lista = lista.filter(e => e.nome.toLowerCase().includes(busca) || (e.local||'').toLowerCase().includes(busca));
  if (filtroStatus) lista = lista.filter(e => e.status === filtroStatus);
  lista.sort((a, b) => new Date(b.data) - new Date(a.data));

  if (lista.length === 0) {
    container.innerHTML = '<div class="empty"><div class="icon">📅</div><p>Nenhum evento encontrado.</p></div>';
    return;
  }

  const profNomes = {};
  const servList = DB.servidores();
  servList.forEach(s => { profNomes[s.id] = s.nome; });

  container.innerHTML = lista.map(e => {
    const categoriasOk = (e.categoriasNecessarias || []).every(c => {
      const qtd = (c.quantidade || 0);
      const escalados = (e.profissionais || []).filter(p => p.categoria === c.categoria).length;
      return qtd === 0 || escalados >= qtd;
    });
    const status = categoriasOk ? 'completo' : 'incompleto';
    const profsHtml = (e.profissionais || []).map(p =>
      `<span class="tag ${p.tipoPagamento === 'dinheiro' ? 'tag-warn' : 'tag-green'}" style="margin:2px">${esc(profNomes[p.srvId] || '?')} (${esc(p.categoria)})${p.diasFolga ? ' 🌴'+p.diasFolga+'d' : ''}${p.valorHE ? ' 💰'+p.valorHE+'h' : ''}</span>`
    ).join('');

    const veicNome = e.veiculoId ? (_veiculosData.find(v => v.id === e.veiculoId)?.nome || '?') : null;

    return `<div class="ev-list-item ${status}" onclick="editarEvento('${e.id}')">
      <div class="ev-list-header">
        <div>
          <div class="ev-list-nome">${status === 'completo' ? '✅' : '🔴'} ${esc(e.nome)}</div>
          <div class="ev-list-meta">
            <span>📅 ${e.data}</span>
            <span>⏰ ${e.hrInicio} - ${e.hrTermino}</span>
            ${e.local ? `<span>📍 ${esc(e.local)}</span>` : ''}
            ${veicNome ? `<span>🚗 ${esc(veicNome)}</span>` : ''}
          </div>
          ${profsHtml ? `<div style="margin-top:6px">${profsHtml}</div>` : ''}
          ${!categoriasOk ? `<div class="ev-list-faltam">⚠️ Faltam profissionais em alguma categoria</div>` : ''}
        </div>
        <div class="ev-list-actions">
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();imprimirEvento('${e.id}')">🖨️</button>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();excluirEvento('${e.id}')">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function addCategoriaRow(cat, qtd) {
  const container = document.getElementById('ev-categorias-container');
  const div = document.createElement('div');
  div.className = 'ev-cat-row';
  const idx = container.children.length;
  div.innerHTML = `
    <select id="ev-cat-${idx}" onchange="atualizarCategorias()">
      <option value="">Selecione...</option>
      ${CATEGORIAS_PROFISSIONAIS.map(c => `<option value="${c}" ${cat === c ? 'selected' : ''}>${c}</option>`).join('')}
    </select>
    <span style="font-size:0.72rem;color:var(--muted);font-weight:600">Qtd:</span>
    <input type="number" id="ev-cat-qtd-${idx}" min="1" max="99" value="${qtd || 1}" onchange="atualizarCategorias()" style="width:55px">
    <span class="ev-cat-remove" onclick="this.parentElement.remove();atualizarCategorias()">✕</span>
  `;
  container.appendChild(div);
  atualizarCategorias();
}

function atualizarCategorias() {
  const container = document.getElementById('ev-categorias-container');
  const rows = container.querySelectorAll('.ev-cat-row');
  _evCategorias = [];
  rows.forEach(row => {
    const sel = row.querySelector('select');
    const qtd = row.querySelector('input[type=number]');
    if (sel && sel.value) {
      _evCategorias.push({ categoria: sel.value, quantidade: parseInt(qtd?.value || 1) });
    }
  });
  popularSelectCategoriasProf();
  renderProfissionaisEvento();
}

function popularSelectCategoriasProf() {
  const sel = document.getElementById('ev-add-cat');
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">Selecione...</option>' +
    _evCategorias.map(c => `<option value="${c.categoria}">${c.categoria}</option>`).join('');
  if (atual) sel.value = atual;
}

function toggleEvPagtoCampos() {
  const tipo = document.getElementById('ev-add-pagto').value;
  const label = document.getElementById('ev-add-qtd-label');
  const input = document.getElementById('ev-add-qtd');
  if (tipo === 'dinheiro') {
    label.textContent = 'Horas Extras';
    input.placeholder = 'Ex: 4';
    input.step = '0.5';
  } else {
    label.textContent = 'Dias de Folga';
    input.placeholder = '';
    input.step = '0.5';
  }
}

function toggleEvPagtoCamposEdit() {
  const tipo = document.getElementById('eprof-pagto').value;
  const label = document.getElementById('eprof-qtd-label');
  const input = document.getElementById('eprof-qtd');
  if (tipo === 'dinheiro') {
    label.textContent = 'Horas Extras';
    input.placeholder = 'Ex: 4';
    input.step = '0.5';
  } else {
    label.textContent = 'Dias de Folga';
    input.placeholder = '';
    input.step = '0.5';
  }
}

function abrirAddProfissional(categoria) {
  document.getElementById('ev-add-prof-area').style.display = 'block';
  document.getElementById('ev-add-cat').value = categoria || '';
  popularSelectServidoresProf();
  popularSelectCategoriasProf();
  if (categoria) document.getElementById('ev-add-cat').value = categoria;
}

function cancelarAddProfissional() {
  document.getElementById('ev-add-prof-area').style.display = 'none';
}

function popularSelectServidoresProf() {
  const sel = document.getElementById('ev-add-srv');
  if (!sel) return;
  const servidores = DB.servidores();
  const atual = sel.value;
  sel.innerHTML = '<option value="">Selecione...</option>' +
    servidores.map(s => `<option value="${s.id}">${esc(s.nome)} (${esc(s.matricula)})</option>`).join('');
  if (atual) sel.value = atual;
}

function adicionarProfissionalEvento() {
  const srvId = document.getElementById('ev-add-srv').value;
  const categoria = document.getElementById('ev-add-cat').value;
  const tipoPagto = document.getElementById('ev-add-pagto').value;
  const qtd = parseFloat(document.getElementById('ev-add-qtd').value) || 0;

  if (!srvId) return toastMsg('Selecione um profissional.', 'warning');
  if (!categoria) return toastMsg('Selecione a categoria.', 'warning');

  // Verificar se já existe
  if ((_eventoEditingProf || []).some(p => p.srvId === srvId)) {
    return toastMsg('Este profissional já está escalado neste evento.', 'warning');
  }

  // Verificar conflito de data/horário
  const data = document.getElementById('ev-data').value;
  const hrInicio = document.getElementById('ev-hr-inicio').value;
  const hrFim = document.getElementById('ev-hr-fim').value;
  const evId = document.getElementById('ev-id').value;

  if (data && hrInicio && hrFim) {
    const conflito = verificarConflitoProfissional(srvId, data, hrInicio, hrFim, evId);
    if (conflito) {
      return toastMsg(`⚠️ ${conflito}`, 'error');
    }
  }

  const prof = { srvId, categoria, tipoPagamento: tipoPagto };
  if (tipoPagto === 'folga') prof.diasFolga = qtd;
  else prof.valorHE = qtd;

  _eventoEditingProf.push(prof);
  renderProfissionaisEvento();
  cancelarAddProfissional();
}

function removerProfissionalEvento(idx) {
  _eventoEditingProf.splice(idx, 1);
  renderProfissionaisEvento();
}

function editarProfEvento(idx) {
  const p = _eventoEditingProf[idx];
  if (!p) return;
  document.getElementById('eprof-idx').value = idx;
  document.getElementById('eprof-pagto').value = p.tipoPagamento || 'folga';
  document.getElementById('eprof-qtd').value = p.diasFolga || p.valorHE || 1;
  toggleEvPagtoCamposEdit();
  document.getElementById('modal-editar-prof-event').classList.add('open');
}

function salvarEdicaoProfEvento() {
  const idx = parseInt(document.getElementById('eprof-idx').value);
  const p = _eventoEditingProf[idx];
  if (!p) return;
  const tipo = document.getElementById('eprof-pagto').value;
  const qtd = parseFloat(document.getElementById('eprof-qtd').value) || 0;
  p.tipoPagamento = tipo;
  if (tipo === 'folga') { p.diasFolga = qtd; delete p.valorHE; }
  else { p.valorHE = qtd; delete p.diasFolga; }
  _eventoEditingProf[idx] = p;
  renderProfissionaisEvento();
  fecharModal('modal-editar-prof-event');
  toastMsg('Profissional atualizado!', 'success');
}

let _eventoEditingProf = [];

function renderProfissionaisEvento() {
  const container = document.getElementById('ev-profissionais-lista');
  if (!container) return;
  const servidores = DB.servidores();
  const srvMap = {};
  servidores.forEach(s => { srvMap[s.id] = s; });

  // Verificar categorias incompletas
  const catCount = {};
  _eventoEditingProf.forEach(p => {
    catCount[p.categoria] = (catCount[p.categoria] || 0) + 1;
  });
  const catNeeded = {};
  _evCategorias.forEach(c => { catNeeded[c.categoria] = c.quantidade; });

  if (_eventoEditingProf.length === 0) {
    container.innerHTML = '<div class="empty" style="padding:12px"><p>Nenhum profissional escalado ainda.</p></div>';
  } else {
    container.innerHTML = _eventoEditingProf.map((p, i) => {
      const srv = srvMap[p.srvId];
      const nome = srv ? srv.nome : '?';
      const setor = srv ? (srv.setor || '') : '';
      const needed = catNeeded[p.categoria] || 0;
      const actual = catCount[p.categoria] || 0;
      const ok = actual >= needed;
    const pagtoInfo = p.tipoPagamento === 'dinheiro'
      ? (p.valorHE ? `💰 ${p.valorHE}h extra` : '💰 Voluntário')
      : (p.diasFolga ? `🌴 ${p.diasFolga} dias de folga` : '🌴 Voluntário');
      return `<div class="ev-prof-item" style="${!ok ? 'border-left:3px solid var(--danger)' : ''}">
        <div class="ev-prof-info">
          <div class="ev-prof-nome">${esc(nome)}</div>
          <div class="ev-prof-cat">${esc(p.categoria)} ${setor ? '· '+esc(setor) : ''} · ${pagtoInfo}</div>
        </div>
        <span class="ev-prof-remove" onclick="editarProfEvento(${i})" title="Editar">✏️</span>
        <span class="ev-prof-remove" onclick="removerProfissionalEvento(${i})" title="Remover">✕</span>
      </div>`;
    }).join('');
  }

  // Botão "Adicionar Profissional" para cada categoria (sempre mostra se precisar)
  const addBtns = _evCategorias.map(c => {
    const actual = catCount[c.categoria] || 0;
    const needed = c.quantidade;
    if (actual >= needed) return '';
    return `<button class="btn btn-ghost btn-sm" onclick="abrirAddProfissional('${c.categoria}')" style="margin-top:4px;margin-right:6px">
      ➕ ${c.categoria} (${actual}/${needed})
    </button>`;
  }).filter(Boolean).join('');

  if (addBtns) {
    container.innerHTML += `<div style="margin-top:8px">${addBtns}</div>`;
  }
}

function verificarConflitoProfissional(srvId, data, hrInicio, hrFim, evIdIgnore) {
  const eventos = _eventosData.filter(e => e.id !== evIdIgnore && e.data === data);
  for (const e of eventos) {
    if (!e.hrInicio || !e.hrTermino) continue;
    // Conflito se horários se sobrepõem
    if (hrInicio < e.hrTermino && hrFim > e.hrInicio) {
      if ((e.profissionais || []).some(p => p.srvId === srvId)) {
        const srv = DB.servidores().find(s => s.id === srvId);
        return `"${srv ? srv.nome : '?'}" já está escalado em "${e.nome}" neste mesmo dia/horário.`;
      }
    }
  }
  return null;
}

function creditarFolgaAutomatica(srvId, dias, eventoNome) {
  if (!dias || dias <= 0) return;
  const folga = {
    id: uid(),
    srvId,
    tipo: 'credito',
    data: new Date().toISOString().split('T')[0],
    qtd: dias,
    motivo: `Evento: ${eventoNome}`,
    criadoEm: new Date().toISOString()
  };
  const folgas = DB.folgas();
  folgas.push(folga);
  DB.saveFolgas(folgas, [folga]);
}

function salvarEvento() {
  const id = document.getElementById('ev-id').value;
  const nome = document.getElementById('ev-nome').value.trim();
  const data = document.getElementById('ev-data').value;
  const hrInicio = document.getElementById('ev-hr-inicio').value;
  const hrFim = document.getElementById('ev-hr-fim').value;

  if (!nome) return toastMsg('Informe o nome do evento.', 'warning');
  if (!data) return toastMsg('Informe a data do evento.', 'warning');
  if (!hrInicio) return toastMsg('Informe o horário de início.', 'warning');
  if (!hrFim) return toastMsg('Informe o horário de término.', 'warning');

  // Verificar categorias
  const categorias = _evCategorias.filter(c => c.categoria && c.quantidade > 0);
  if (categorias.length === 0) return toastMsg('Adicione ao menos uma categoria de profissional.', 'warning');

  // Verificar se há profissionais para todas as categorias necessárias
  const profCount = {};
  _eventoEditingProf.forEach(p => {
    profCount[p.categoria] = (profCount[p.categoria] || 0) + 1;
  });
  const catFaltando = categorias.filter(c => (profCount[c.categoria] || 0) < c.quantidade);
  const status = catFaltando.length === 0 ? 'completo' : 'incompleto';

  // Verificar conflitos
  for (const p of _eventoEditingProf) {
    const conflito = verificarConflitoProfissional(p.srvId, data, hrInicio, hrFim, id);
    if (conflito) return toastMsg(conflito, 'error');
  }

  const dados = {
    nome,
    data,
    hrInicio,
    hrFim,
    local: document.getElementById('ev-local').value.trim(),
    descricao: document.getElementById('ev-desc').value.trim(),
    categoriasNecessarias: categorias,
    profissionais: _eventoEditingProf,
    veiculoId: document.getElementById('ev-veiculo').value || null,
    status,
    criadoEm: new Date().toISOString()
  };

  if (id) {
    const eventoAntigo = _eventoEditingProf || [];
    const idx = _eventosData.findIndex(e => e.id === id);
    if (idx >= 0) {
      _eventosData[idx] = { ..._eventosData[idx], ...dados };
      toastMsg('Evento atualizado!', 'success');
    }
  } else {
    dados.id = uid();
    // Creditar folgas automaticamente
    _eventoEditingProf.forEach(p => {
      if (p.tipoPagamento === 'folga' && p.diasFolga) {
        creditarFolgaAutomatica(p.srvId, p.diasFolga, nome);
      }
    });
    _eventosData.push(dados);
    toastMsg('Evento cadastrado!', 'success');
  }
  salvarEventosStorage();
  limparFormEvento();
  renderEventos();
  atualizarBadgeEventos();
}

function editarEvento(id) {
  const e = _eventosData.find(e => e.id === id);
  if (!e) return;
  document.getElementById('ev-id').value = e.id;
  document.getElementById('ev-nome').value = e.nome;
  document.getElementById('ev-data').value = e.data;
  document.getElementById('ev-hr-inicio').value = e.hrInicio;
  document.getElementById('ev-hr-fim').value = e.hrFim;
  document.getElementById('ev-local').value = e.local || '';
  document.getElementById('ev-desc').value = e.descricao || '';
  if (e.veiculoId) document.getElementById('ev-veiculo').value = e.veiculoId;

  document.getElementById('ev-form-title').textContent = 'Editar Evento';
  document.getElementById('ev-btn-imprimir').style.display = 'inline-flex';

  // Carregar categorias
  const container = document.getElementById('ev-categorias-container');
  container.innerHTML = '';
  (e.categoriasNecessarias || []).forEach(c => addCategoriaRow(c.categoria, c.quantidade));

  // Carregar profissionais
  _eventoEditingProf = JSON.parse(JSON.stringify(e.profissionais || []));
  renderProfissionaisEvento();

  // Scroll para o formulário
  document.getElementById('panel-eventos').scrollIntoView({ behavior: 'smooth' });
}

async function excluirEvento(id) {
  if (!confirm('Excluir este evento permanentemente?')) return;
  _eventosData = _eventosData.filter(e => e.id !== id);
  salvarEventosStorage();
  await DB.deleteEvento(id);
  renderEventos();
  atualizarBadgeEventos();
  toastMsg('Evento excluído permanentemente.', 'info');
}

function limparFormEvento() {
  document.getElementById('ev-id').value = '';
  document.getElementById('ev-nome').value = '';
  document.getElementById('ev-data').value = '';
  document.getElementById('ev-hr-inicio').value = '';
  document.getElementById('ev-hr-fim').value = '';
  document.getElementById('ev-local').value = '';
  document.getElementById('ev-desc').value = '';
  document.getElementById('ev-veiculo').value = '';
  document.getElementById('ev-form-title').textContent = 'Novo Evento';
  document.getElementById('ev-btn-imprimir').style.display = 'none';
  document.getElementById('ev-categorias-container').innerHTML = '';
  _evCategorias = [];
  _eventoEditingProf = [];
  renderProfissionaisEvento();
  // Adicionar uma linha de categoria vazia
  addCategoriaRow();
}

function atualizarBadgeEventos() {
  const incompletos = _eventosData.filter(e => e.status === 'incompleto').length;
  const badge = document.getElementById('badge-eventos');
  if (badge) {
    badge.textContent = incompletos;
    badge.style.display = incompletos > 0 ? 'inline-flex' : 'none';
    badge.style.background = incompletos > 0 ? 'var(--danger)' : 'var(--accent)';
  }
}

// ===================== RELATÓRIO DE IMPRESSÃO DE FROTAS =====================
function imprimirRelatorioFrota() {
  const veiculos = DB.veiculos();
  if (!veiculos || veiculos.length === 0) {
    return toastMsg('Nenhum veículo cadastrado na frota para imprimir.', 'warning');
  }

  const cfg = DB.config();
  const orgNome = cfg.nomeOrganizacao || 'Coordenação da Atenção Primária à Saúde';
  const subTitulo = cfg.subtituloSidebar || 'Gestão de RH & Logística de Frotas';
  const dataHoje = new Date().toLocaleDateString('pt-BR');
  const horaHoje = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const valorTotal = veiculos.reduce((acc, v) => acc + (parseFloat(v.valorCompra) || 0), 0);
  const valorTotalFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorTotal);
  const totalSucatas = veiculos.filter(v => v.sucata === true).length;

  const rowsHtml = veiculos.map((v, i) => {
    const valorFmt = v.valorCompra ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v.valorCompra) : '-';
    const nf = v.notaFiscal || v.nota_fiscal || '-';
    const sAtual = v.setorAtual || v.setor_atual || '-';
    const sPertence = v.setorPertence || v.setor_pertence || '-';

    return `<tr>
      <td style="text-align:center;">${i + 1}</td>
      <td><strong>${esc(v.nome)}</strong><br><small style="color:#555;">Placa: ${esc(v.placa || '-')}</small></td>
      <td>${esc(v.modelo || '-')} / ${esc(v.cor || '-')}</td>
      <td>
        <span style="color:#1d4ed8; font-weight:bold;">📍 Hoje:</span> ${esc(sAtual)}<br>
        <span style="color:#7e22ce; font-weight:bold;">🏢 Origem:</span> ${esc(sPertence)}
      </td>
      <td>${esc(v.renavam || '-')}</td>
      <td>${esc(nf)}</td>
      <td>${esc(v.resolucao || '-')}</td>
      <td>${esc(v.ficha || '-')} / ${esc(v.fonte || '-')}</td>
      <td style="text-align:right; font-weight:bold; color:#047857;">${valorFmt}</td>
      <td style="text-align:center; font-weight:bold; color:${v.sucata === true ? '#b91c1c' : '#047857'};">${v.sucata === true ? 'SUCATA' : 'Em uso'}</td>
      <td style="font-size:10px;">${esc(v.obs || '-')}</td>
    </tr>`;
  }).join('');

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório Geral da Frota de Veículos</title>
  <style>
    body { font-family: 'Arial', sans-serif; font-size: 11px; color: #111; margin: 20px; }
    .header { text-align: center; border-bottom: 2px solid #222; padding-bottom: 12px; margin-bottom: 15px; }
    .header h1 { font-size: 18px; margin: 0 0 4px 0; text-transform: uppercase; color: #1e3a8a; }
    .header h2 { font-size: 14px; margin: 0 0 6px 0; color: #4b5563; }
    .header p { font-size: 11px; color: #6b7280; margin: 0; }
    .kpi-bar { display: flex; justify-content: space-around; background: #f3f4f6; padding: 10px; border-radius: 6px; margin-bottom: 15px; border: 1px solid #e5e7eb; }
    .kpi-item { text-align: center; }
    .kpi-val { font-size: 16px; font-weight: bold; color: #111827; }
    .kpi-lbl { font-size: 10px; color: #6b7280; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10px; }
    th { background: #1e293b; color: #fff; padding: 8px; text-align: left; font-size: 10px; text-transform: uppercase; border: 1px solid #0f172a; }
    td { padding: 6px 8px; border: 1px solid #cbd5e1; vertical-align: top; }
    tr:nth-child(even) { background: #f8fafc; }
    .footer { margin-top: 30px; display: flex; justify-content: space-between; font-size: 10px; color: #6b7280; border-top: 1px solid #e2e8f0; padding-top: 8px; }
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 15px; text-align: right;">
    <button onclick="window.print()" style="padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">🖨️ Imprimir Agora</button>
  </div>
  <div class="header">
    <h1>${esc(orgNome)}</h1>
    <h2>Relatório Geral de Controle de Frotas e Veículos</h2>
    <p>Gerado em: ${dataHoje} às ${horaHoje} · ${subTitulo}</p>
  </div>

  <div class="kpi-bar">
    <div class="kpi-item"><div class="kpi-val">${veiculos.length}</div><div class="kpi-lbl">Total de Veículos na Frota</div></div>
    <div class="kpi-item"><div class="kpi-val">${valorTotalFmt}</div><div class="kpi-lbl">Investimento Total na Frota</div></div>
    <div class="kpi-item"><div class="kpi-val" style="color:#b91c1c">${totalSucatas}</div><div class="kpi-lbl">Sucatas / Baixados</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:25px;">#</th>
        <th>Veículo / Placa</th>
        <th>Modelo / Cor</th>
        <th>Setor Atual vs Origem</th>
        <th>RENAVAM</th>
        <th>Nota Fiscal</th>
        <th>Resolução</th>
        <th>Ficha / Fonte</th>
        <th style="text-align:right;">Valor (R$)</th>
        <th>Situação</th>
        <th>Observações</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="footer">
    <div>Atlas Saúde — Sistema de Gestão de RH e Frotas</div>
    <div>Página 1 de 1</div>
  </div>
</body>
</html>`);
  win.document.close();
}
