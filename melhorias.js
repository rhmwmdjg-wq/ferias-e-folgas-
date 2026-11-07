// Módulo Melhorias v2.2
// - Busca global (Ctrl+K) por servidores, módulos e ações
// - Menu lateral com filtro, grupos recolhíveis e memória do último módulo
// - Ficha 360° do servidor
// - Painel de Saldos (folgas e banco de horas) com exportação para Excel
// - Central de Pendências (avisos de vencimento e itens parados)
// - Backup e Exportação (JSON/Excel) e restauração por mesclagem
// Não altera tabelas do Supabase: usa somente as funções DB.* já existentes.

(function () {
  'use strict';

  const MX = window.MX = window.MX || {};

  // ===================== UTILITÁRIOS =====================
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* cota/privado */ } }
  };
  const sessao = () => { try { return JSON.parse(sessionStorage.getItem('ferias_sessao') || '{}'); } catch (e) { return {}; } };
  const isGestao = () => { const r = sessao().role; return r === 'admin' || r === 'gestor'; };
  const isAdmin = () => sessao().role === 'admin';
  const norm = t => String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const pad = n => String(n).padStart(2, '0');
  const isoLocal = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const hojeISO = () => isoLocal(new Date());
  const e = s => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s));
  const fd = d => (d && typeof fmtDate === 'function') ? fmtDate(d) : (d || '—');
  const fmtDias = n => { const v = Math.round((n || 0) * 10) / 10; return String(v).replace('.', ','); };
  const fmtH = h => (typeof fmtHoras === 'function' ? fmtHoras(h || 0) : String(h || 0));
  const sinal = n => (n > 0 ? '+' : '') ;
  const clsSaldo = n => n > 0 ? 'mx-pos' : n < 0 ? 'mx-neg' : 'mx-zero';
  const tabVisivel = id => { const b = document.getElementById('tab-' + id); return !!b && b.style.display !== 'none'; };
  const safe = (fn, fb) => { try { return fn(); } catch (err) { console.warn('[MX]', err); return fb; } };
  const jsArg = s => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');

  function dbList(nome) { return safe(() => (typeof DB !== 'undefined' && typeof DB[nome] === 'function') ? (DB[nome]() || []) : [], []); }
  function servidoresAcessiveis() { return safe(() => getServidoresAcessiveis(), []); }
  function srvPorId(id) { return dbList('servidores').find(s => s.id === id); }

  function saldoFolgasDe(srvId, folgas) {
    return (folgas || dbList('folgas')).reduce((a, f) => f.srvId === srvId ? a + (f.tipo === 'credito' ? (f.qtd || 0) : -(f.qtd || 0)) : a, 0);
  }
  function saldoBHDe(srvId, regs) {
    return (regs || dbList('bancoHoras')).reduce((a, r) => r.srvId === srvId ? a + (r.horasGeradas || 0) - (r.horasPagas || 0) : a, 0);
  }
  function diasDaFolga(f) {
    if (typeof itensDaFolga === 'function') { const it = safe(() => itensDaFolga(f), null); if (it && it.length) return it.map(x => x.data); }
    if (Array.isArray(f.dataItems) && f.dataItems.length) return f.dataItems.map(x => x.data);
    return f.data ? [f.data] : [];
  }
  function tempoEntre(isoIni, ref) {
    if (!isoIni) return '';
    const a = new Date(isoIni + 'T12:00:00'); const b = ref || new Date();
    if (isNaN(a)) return '';
    let anos = b.getFullYear() - a.getFullYear();
    let meses = b.getMonth() - a.getMonth();
    if (b.getDate() < a.getDate()) meses--;
    if (meses < 0) { anos--; meses += 12; }
    if (anos < 0) return '';
    const p = [];
    if (anos) p.push(anos + (anos === 1 ? ' ano' : ' anos'));
    if (meses) p.push(meses + (meses === 1 ? ' mês' : ' meses'));
    return p.length ? p.join(' e ') : 'menos de 1 mês';
  }
  function idade(iso) { if (!iso) return null; const t = tempoEntre(iso); const m = /^(\d+)/.exec(t); return t.includes('ano') && m ? parseInt(m[1]) : 0; }
  function proximoAniversario(iso) {
    if (!iso) return null;
    const [, mm, dd] = iso.split('-').map(Number);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    let prox = new Date(hoje.getFullYear(), mm - 1, dd);
    if (prox < hoje) prox = new Date(hoje.getFullYear() + 1, mm - 1, dd);
    return Math.round((prox - hoje) / 86400000);
  }
  function waLink(tel, msg) {
    let n = String(tel || '').replace(/\D/g, '');
    if (!n) return '';
    if (n.length <= 11) n = '55' + n;
    return 'https://wa.me/' + n + (msg ? '?text=' + encodeURIComponent(msg) : '');
  }
  function toast(msg, tipo) { if (typeof toastMsg === 'function') toastMsg(msg, tipo || 'info'); }

  // ===================== EXPORTAÇÃO (Excel/CSV) =====================
  let _xlsxPromise = null;
  function carregarXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (_xlsxPromise) return _xlsxPromise;
    _xlsxPromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = () => window.XLSX ? res(window.XLSX) : rej(new Error('XLSX indisponível'));
      s.onerror = () => { _xlsxPromise = null; rej(new Error('Falha ao carregar a biblioteca de Excel')); };
      document.head.appendChild(s);
    });
    return _xlsxPromise;
  }
  function baixarArquivo(nome, conteudo, tipo) {
    const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function linhasParaCSV(linhas) {
    if (!linhas.length) return '';
    const cols = [...new Set(linhas.flatMap(l => Object.keys(l)))];
    const cel = v => { const t = v == null ? '' : String(v); return /[;"\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    return '\uFEFF' + [cols.map(cel).join(';')].concat(linhas.map(l => cols.map(c => cel(l[c])).join(';'))).join('\r\n');
  }
  const nomeAba = n => String(n).replace(/[:\\/?*\[\]]/g, ' ').slice(0, 31) || 'Planilha';
  async function baixarExcel(nomeArquivo, abas) {
    try {
      const X = await carregarXLSX();
      const wb = X.utils.book_new();
      const usados = new Set();
      abas.forEach(aba => {
        let nm = nomeAba(aba.nome); let i = 2;
        while (usados.has(nm)) nm = nomeAba(aba.nome).slice(0, 28) + ' ' + (i++);
        usados.add(nm);
        const linhas = aba.linhas.length ? aba.linhas : [{ 'Sem registros': '' }];
        const ws = X.utils.json_to_sheet(linhas);
        const cols = Object.keys(linhas[0] || {});
        ws['!cols'] = cols.map(c => ({ wch: Math.min(50, Math.max(c.length, ...linhas.slice(0, 200).map(l => String(l[c] == null ? '' : l[c]).length)) + 2) }));
        X.utils.book_append_sheet(wb, ws, nm);
      });
      X.writeFile(wb, nomeArquivo + '.xlsx');
      return true;
    } catch (err) {
      console.warn('[MX] Excel indisponível, exportando CSV:', err);
      abas.forEach(aba => baixarArquivo(nomeArquivo + (abas.length > 1 ? '_' + nomeAba(aba.nome) : '') + '.csv', linhasParaCSV(aba.linhas), 'text/csv;charset=utf-8'));
      toast('Biblioteca de Excel indisponível no momento — arquivo gerado em CSV (abre no Excel).', 'warning');
      return false;
    }
  }
  MX.baixarExcel = baixarExcel;

  // ===================== NOVOS MÓDULOS NO MENU =====================
  function criarBotaoMenu(id, icone, rotulo, depoisDe, opts) {
    if (document.getElementById('tab-' + id)) return;
    const ref = document.getElementById(depoisDe);
    if (!ref) return;
    const b = document.createElement('button');
    b.className = 'tab-btn'; b.id = 'tab-' + id;
    b.setAttribute('onclick', "showTab('" + id + "')");
    b.innerHTML = '<i class="fa-solid ' + icone + '"></i><span class="tab-label">' + rotulo + '</span>' +
      (opts && opts.badge ? '<span class="badge" id="badge-' + id + '" style="display:none">0</span>' : '');
    if (opts && opts.oculto) b.style.display = 'none';
    ref.insertAdjacentElement('afterend', b);
  }
  function criarPainel(id, html) {
    if (document.getElementById('panel-' + id)) return;
    const ref = document.getElementById('panel-alertas');
    if (!ref) return;
    const p = document.createElement('div');
    p.className = 'tab-panel'; p.id = 'panel-' + id; p.innerHTML = html;
    ref.parentNode.insertBefore(p, ref.nextSibling);
  }

  function injetarModulos() {
    criarBotaoMenu('pendencias', 'fa-bell', 'Pendências', 'tab-alertas', { badge: true });
    criarBotaoMenu('saldos', 'fa-scale-balanced', 'Painel de Saldos', 'tab-bancohoras');
    criarBotaoMenu('backup', 'fa-database', 'Backup e Exportação', 'tab-auditoria', { oculto: true });

    criarPainel('pendencias', `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:6px">
        <div class="section-title" style="margin:0">🔔 Central de Pendências</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="MX.pendExpandir(true)">Expandir tudo</button>
          <button class="btn btn-ghost btn-sm" onclick="MX.pendExpandir(false)">Recolher tudo</button>
          <button class="btn btn-ghost btn-sm" onclick="MX.renderPendencias()">🔄 Atualizar</button>
        </div>
      </div>
      <p style="font-size:.8rem;color:var(--muted);margin:4px 0 16px">Tudo o que precisa de atenção, reunido em um só lugar. Clique em uma categoria para abrir ou fechar.</p>
      <div class="mx-kpis" id="mx-pend-kpis"></div>
      <div id="mx-pend-lista"></div>`);

    criarPainel('saldos', `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
        <div class="section-title" style="margin:0">⚖️ Painel de Saldos — Folgas e Banco de Horas</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-success btn-sm" onclick="MX.exportarSaldos()">📊 Exportar Excel</button>
          <button class="btn btn-ghost btn-sm" onclick="MX.imprimirSaldos()">🖨️ Imprimir</button>
        </div>
      </div>
      <div class="mx-kpis" id="mx-sal-kpis"></div>
      <div class="mx-toolbar">
        <input id="mx-sal-busca" type="text" placeholder="Buscar por nome, matrícula ou cargo..." oninput="MX.sal.page=1;MX.renderSaldos()">
        <select id="mx-sal-setor" onchange="MX.sal.page=1;MX.renderSaldos()"><option value="">Todos os setores</option></select>
        <select id="mx-sal-sit" onchange="MX.sal.page=1;MX.renderSaldos()">
          <option value="">Todas as situações</option>
          <option value="mov">Com movimentação</option>
          <option value="pos">Saldo de folga positivo</option>
          <option value="neg">Saldo de folga negativo</option>
          <option value="zero">Saldo de folga zerado</option>
          <option value="bhpos">Banco de horas positivo</option>
          <option value="bhneg">Banco de horas negativo</option>
        </select>
      </div>
      <div class="mx-count" id="mx-sal-count"></div>
      <div class="table-wrap card" style="padding:0">
        <table>
          <thead><tr id="mx-sal-head"></tr></thead>
          <tbody id="mx-sal-body"></tbody>
        </table>
      </div>
      <div class="mx-pager" id="mx-sal-pager"></div>
      <div class="section-title">🏢 Resumo por setor</div>
      <div class="table-wrap card" style="padding:0;margin-bottom:30px">
        <table><thead><tr><th>Setor</th><th class="mx-num">Servidores</th><th class="mx-num">Dias em banco</th><th class="mx-num">Saldos negativos</th><th class="mx-num">Banco de horas</th></tr></thead>
        <tbody id="mx-sal-setores"></tbody></table>
      </div>`);

    criarPainel('backup', `
      <div class="section-title">🗄️ Backup e Exportação</div>
      <div class="mx-note">Os dados ficam na nuvem (Supabase) e em cada navegador. Um backup periódico em arquivo garante uma cópia independente — útil se a cota da nuvem acabar, se algo for excluído por engano ou para guardar o histórico do ano.</div>
      <div class="mx-backup-grid">
        <div class="card">
          <h3><span class="icon">⬇️</span> Gerar backup</h3>
          <div id="mx-bk-ultimo" style="font-size:.8rem;color:var(--muted);margin-bottom:12px"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
            <button class="btn btn-primary" onclick="MX.baixarBackupJSON()">💾 Baixar backup completo (.json)</button>
            <button class="btn btn-success" onclick="MX.exportarTudoExcel()">📊 Exportar tudo para Excel</button>
          </div>
          <div class="mx-note warn" style="margin:0">O arquivo .json contém <strong>todos</strong> os dados, inclusive senhas de acesso. Guarde-o em local seguro (pen drive ou pasta protegida) e não envie por WhatsApp/e-mail. A planilha Excel não inclui senhas.</div>
        </div>
        <div class="card">
          <h3><span class="icon">♻️</span> Restaurar backup</h3>
          <p style="font-size:.8rem;color:var(--text-mid);line-height:1.5;margin-bottom:10px">Escolha um arquivo .json gerado por este sistema. A restauração <strong>mescla</strong>: adiciona registros que faltam e atualiza os que mudaram. <strong>Nada é apagado.</strong></p>
          <input type="file" id="mx-bk-arquivo" accept=".json,application/json" onchange="MX.lerBackup(this)" style="font-size:.8rem;color:var(--text-mid);margin-bottom:8px">
          <div class="mx-restore-preview" id="mx-bk-preview"></div>
        </div>
      </div>
      <div class="card" style="margin-bottom:30px">
        <h3><span class="icon">📋</span> Exportar uma tabela</h3>
        <div class="mx-table-list" id="mx-bk-tabelas"></div>
      </div>`);
  }

  // ===================== MENU LATERAL: FILTRO + GRUPOS =====================
  let _grupos = [];
  function lerGrupos() {
    const tabs = document.getElementById('sidebar-tabs');
    if (!tabs) return [];
    const grupos = []; let atual = null;
    Array.from(tabs.children).forEach(el => {
      if (el.classList.contains('sidebar-section-label')) { atual = { label: el, btns: [], slug: el.dataset.grp }; grupos.push(atual); }
      else if (el.classList.contains('tab-btn') && atual) atual.btns.push(el);
    });
    return grupos;
  }
  function prepararMenu() {
    const tabs = document.getElementById('sidebar-tabs');
    if (!tabs || document.getElementById('mx-menu-filtro')) return;
    const wrap = document.createElement('div');
    wrap.className = 'mx-menu-filter';
    wrap.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i><input id="mx-menu-filtro" type="text" placeholder="Filtrar menu..." autocomplete="off" aria-label="Filtrar menu"><button class="mx-clear" type="button" title="Limpar filtro">✕</button>';
    tabs.parentNode.insertBefore(wrap, tabs);
    const inp = wrap.querySelector('input');
    inp.addEventListener('input', () => { wrap.classList.toggle('has-text', !!inp.value); aplicarMenu(); });
    inp.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { inp.value = ''; wrap.classList.remove('has-text'); aplicarMenu(); inp.blur(); }
      if (ev.key === 'Enter') {
        const primeiro = _grupos.flatMap(g => g.btns).find(b => b.style.display !== 'none' && !b.classList.contains('mx-hide-filter'));
        if (primeiro) { primeiro.click(); inp.value = ''; wrap.classList.remove('has-text'); aplicarMenu(); }
      }
    });
    wrap.querySelector('.mx-clear').addEventListener('click', () => { inp.value = ''; wrap.classList.remove('has-text'); aplicarMenu(); inp.focus(); });

    tabs.querySelectorAll('.sidebar-section-label').forEach(lbl => {
      const texto = lbl.textContent.trim();
      lbl.dataset.grp = norm(texto).replace(/[^a-z0-9]+/g, '-');
      lbl.classList.add('mx-grp');
      lbl.title = 'Clique para recolher/expandir';
      lbl.innerHTML = '<span>' + e(texto) + '</span><span class="mx-grp-count"></span><i class="fa-solid fa-chevron-down mx-chev"></i>';
      lbl.addEventListener('click', () => {
        const rec = LS.get('mx_menu_recolhido', {});
        rec[lbl.dataset.grp] = !rec[lbl.dataset.grp];
        LS.set('mx_menu_recolhido', rec);
        aplicarMenu();
      });
    });
    const vazio = document.createElement('div');
    vazio.className = 'mx-menu-empty'; vazio.id = 'mx-menu-vazio'; vazio.textContent = 'Nenhum módulo encontrado.';
    tabs.insertBefore(vazio, tabs.firstChild);
    _grupos = lerGrupos();
    aplicarMenu();
    setInterval(aplicarMenu, 3000); // mantém os contadores dos grupos recolhidos atualizados
  }
  function aplicarMenu() {
    if (!_grupos.length) return;
    const inp = document.getElementById('mx-menu-filtro');
    const filtro = norm(inp ? inp.value : '').trim();
    const rec = LS.get('mx_menu_recolhido', {});
    let algum = false;
    _grupos.forEach(g => {
      const recolhido = !filtro && !!rec[g.slug];
      const nomeGrupo = norm(g.label.textContent);
      let visiveis = 0, casam = 0, soma = 0;
      g.btns.forEach(b => {
        const porPerfil = b.style.display !== 'none';
        if (porPerfil) visiveis++;
        const ok = !filtro || norm(b.textContent).includes(filtro) || nomeGrupo.includes(filtro);
        b.classList.toggle('mx-hide-filter', !ok);
        b.classList.toggle('mx-hide-grp', recolhido && !b.classList.contains('active'));
        if (ok && porPerfil) casam++;
        if (porPerfil) {
          const bd = b.querySelector('.badge');
          if (bd && bd.style.display !== 'none') { const n = parseInt(bd.textContent, 10); if (n > 0) soma += n; else if (bd.textContent.trim() === '!') soma += 1; }
        }
      });
      if (casam) algum = true;
      g.label.classList.toggle('mx-hide-filter', visiveis === 0 || (!!filtro && casam === 0));
      g.label.classList.toggle('mx-collapsed', recolhido);
      const c = g.label.querySelector('.mx-grp-count');
      if (c) { c.textContent = soma; c.classList.toggle('show', soma > 0); }
    });
    const vz = document.getElementById('mx-menu-vazio');
    if (vz) vz.style.display = filtro && !algum ? 'block' : 'none';
  }
  MX.aplicarMenu = aplicarMenu;

  // ===================== NAVEGAÇÃO (showTab) =====================
  function instalarGanchoShowTab() {
    const orig = window.showTab;
    if (typeof orig !== 'function' || orig.__mx) return;
    const novo = function (tab) {
      if (!document.getElementById('panel-' + tab) || !document.getElementById('tab-' + tab)) return;
      orig(tab);
      LS.set('mx_ultimo_modulo', tab);
      if (tab === 'pendencias') renderPendencias();
      if (tab === 'saldos') renderSaldos();
      if (tab === 'backup') renderBackup();
      // Barra inferior (celular): destaca o botão correspondente
      document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'));
      const bn = document.getElementById('bnav-' + tab) || document.getElementById('bnav-mais');
      if (bn) bn.classList.add('active');
      // No celular/tablet, fecha o menu depois de escolher
      if (window.innerWidth <= 1024 && typeof closeSidebar === 'function') closeSidebar();
      window.scrollTo(0, 0);
      aplicarMenu();
    };
    novo.__mx = true;
    window.showTab = novo;
  }

  let _primeiroInit = true;
  function instalarGanchoInit() {
    const orig = window.initApp;
    if (typeof orig !== 'function' || orig.__mx) return;
    const novo = function () {
      const r = orig.apply(this, arguments);
      safe(aposInit);
      return r;
    };
    novo.__mx = true;
    window.initApp = novo;
  }
  function aposInit() {
    aplicarMenu();
    atualizarBadgePendencias();
    if (_primeiroInit) {
      _primeiroInit = false;
      const ult = LS.get('mx_ultimo_modulo', null);
      const ativo = document.querySelector('.tab-btn.active');
      if (ult && ult !== 'alertas' && tabVisivel(ult) && document.getElementById('panel-' + ult) && (!ativo || ativo.id === 'tab-alertas')) {
        setTimeout(() => safe(() => showTab(ult)), 0);
      }
    }
  }

  // ===================== BUSCA GLOBAL (Ctrl+K) =====================
  let _palItens = [], _palSel = 0;
  function criarPaleta() {
    if (document.getElementById('mx-palette-bg')) return;
    const bg = document.createElement('div');
    bg.className = 'mx-palette-bg'; bg.id = 'mx-palette-bg';
    bg.innerHTML = `<div class="mx-palette" role="dialog" aria-label="Busca rápida">
      <div class="mx-palette-input"><i class="fa-solid fa-magnifying-glass"></i>
        <input id="mx-pal-input" type="text" placeholder="Buscar servidor, módulo ou ação..." autocomplete="off">
        <kbd onclick="MX.fecharBusca()">Esc</kbd></div>
      <div class="mx-palette-list" id="mx-pal-list"></div>
      <div class="mx-pal-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> abre de qualquer tela</span></div>
    </div>`;
    document.body.appendChild(bg);
    bg.addEventListener('mousedown', ev => { if (ev.target === bg) fecharBusca(); });
    const inp = bg.querySelector('#mx-pal-input');
    inp.addEventListener('input', () => { _palSel = 0; renderPaleta(); });
    inp.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); _palSel = Math.min(_palItens.length - 1, _palSel + 1); marcarSel(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); _palSel = Math.max(0, _palSel - 1); marcarSel(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); executarItem(_palItens[_palSel]); }
      else if (ev.key === 'Escape') { ev.preventDefault(); fecharBusca(); }
    });
  }
  function abrirBusca(texto) {
    if (!sessionStorage.getItem('ferias_sessao')) return;
    criarPaleta();
    const bg = document.getElementById('mx-palette-bg');
    bg.classList.add('open');
    const inp = document.getElementById('mx-pal-input');
    inp.value = texto || ''; _palSel = 0; renderPaleta();
    setTimeout(() => inp.focus(), 20);
  }
  function fecharBusca() { const bg = document.getElementById('mx-palette-bg'); if (bg) bg.classList.remove('open'); }
  MX.abrirBusca = abrirBusca; MX.fecharBusca = fecharBusca;

  function realce(texto, q) {
    const t = String(texto || '');
    if (!q) return e(t);
    const i = norm(t).indexOf(q);
    if (i < 0) return e(t);
    return e(t.slice(0, i)) + '<mark>' + e(t.slice(i, i + q.length)) + '</mark>' + e(t.slice(i + q.length));
  }
  function acoesRapidas() {
    const a = [];
    if (tabVisivel('servidores') && isGestao()) a.push({ titulo: 'Cadastrar novo servidor', sub: 'Abre o formulário de cadastro', ico: 'fa-user-plus', run: () => { showTab('servidores'); setTimeout(() => window.novoServidor && novoServidor(), 50); } });
    if (tabVisivel('emitir-aut')) a.push({ titulo: 'Emitir autorização de férias', sub: 'Documento em PDF', ico: 'fa-file-pdf', run: () => abrirModalAutorizacao() });
    if (tabVisivel('pendencias')) a.push({ titulo: 'Ver pendências', sub: 'Avisos de vencimento e itens parados', ico: 'fa-bell', run: () => showTab('pendencias') });
    if (tabVisivel('backup')) a.push({ titulo: 'Baixar backup agora', sub: 'Arquivo .json com todos os dados', ico: 'fa-database', run: () => baixarBackupJSON() });
    if (typeof forcarSyncCompleto === 'function') a.push({ titulo: 'Sincronizar com a nuvem', sub: 'Envia e recebe as alterações', ico: 'fa-cloud-arrow-up', run: () => forcarSyncCompleto() });
    if (typeof toggleTema === 'function') a.push({ titulo: 'Alternar tema claro/escuro', sub: '', ico: 'fa-circle-half-stroke', run: () => toggleTema() });
    if (typeof abrirModalAlterarSenha === 'function') a.push({ titulo: 'Trocar minha senha', sub: '', ico: 'fa-key', run: () => abrirModalAlterarSenha() });
    return a;
  }
  function renderPaleta() {
    const q = norm(document.getElementById('mx-pal-input').value).trim();
    const lista = document.getElementById('mx-pal-list');
    const grupos = [];

    // Servidores (somente perfis de gestão)
    if (isGestao()) {
      const srvs = servidoresAcessiveis();
      let achados;
      if (q) {
        const qd = q.replace(/\D/g, '');
        achados = srvs.map(s => {
          const n = norm(s.nome);
          let pts = 0;
          if (n.startsWith(q)) pts = 100; else if (n.split(' ').some(p => p.startsWith(q))) pts = 80; else if (n.includes(q)) pts = 60;
          else if (String(s.matricula || '') === q) pts = 95; else if (String(s.matricula || '').startsWith(q)) pts = 70;
          else if (qd.length >= 4 && String(s.cpf || '').replace(/\D/g, '').includes(qd)) pts = 65;
          else if (norm(s.setor).includes(q) || norm(s.cargo).includes(q)) pts = 30;
          return { s, pts };
        }).filter(x => x.pts > 0).sort((a, b) => b.pts - a.pts || a.s.nome.localeCompare(b.s.nome)).slice(0, 8).map(x => x.s);
      } else {
        const rec = LS.get('mx_recentes', []);
        achados = rec.map(id => srvs.find(s => s.id === id)).filter(Boolean);
      }
      if (achados.length) grupos.push({ nome: q ? 'Servidores' : 'Fichas abertas recentemente', itens: achados.map(s => ({
        tituloHtml: realce(s.nome, q), sub: 'Mat. ' + (s.matricula || '-') + ' · ' + (s.setor || '-') + ' · ' + (s.cargo || '-'),
        icoHtml: (typeof getAvatarHtml === 'function' ? getAvatarHtml(s.foto, s.nome, 30) : ''), hint: 'Ficha 360°',
        run: () => abrirFicha360(s.id)
      })) });
    }

    // Módulos visíveis no menu
    const mods = Array.from(document.querySelectorAll('#sidebar-tabs .tab-btn')).filter(b => b.style.display !== 'none' && b.id !== 'tab-sair');
    const modsAch = mods.filter(b => !q || norm(b.textContent).includes(q)).slice(0, q ? 8 : 40);
    if (modsAch.length) grupos.push({ nome: 'Módulos', itens: modsAch.map(b => {
      const lbl = (b.querySelector('.tab-label') || b).textContent.trim();
      const ic = (b.querySelector('i') || {}).className || 'fa-solid fa-square';
      return { tituloHtml: realce(lbl, q), sub: '', icoHtml: '<i class="' + e(ic) + '"></i>', hint: 'Abrir', run: () => b.click() };
    }) });

    const acs = acoesRapidas().filter(a => !q || norm(a.titulo + ' ' + a.sub).includes(q));
    if (acs.length) grupos.push({ nome: 'Ações', itens: acs.map(a => ({ tituloHtml: realce(a.titulo, q), sub: a.sub, icoHtml: '<i class="fa-solid ' + a.ico + '"></i>', hint: '', run: a.run })) });

    _palItens = [];
    if (!grupos.length) { lista.innerHTML = '<div class="mx-pal-empty">Nada encontrado para “' + e(document.getElementById('mx-pal-input').value) + '”.</div>'; return; }
    lista.innerHTML = grupos.map(g => '<div class="mx-pal-group">' + g.nome + '</div>' + g.itens.map(it => {
      const i = _palItens.push(it) - 1;
      return '<div class="mx-pal-item" data-i="' + i + '"><div class="mx-pal-ico">' + it.icoHtml + '</div><div class="mx-pal-main"><div class="mx-pal-title">' + it.tituloHtml + '</div>' +
        (it.sub ? '<div class="mx-pal-sub">' + e(it.sub) + '</div>' : '') + '</div>' + (it.hint ? '<div class="mx-pal-hint">' + it.hint + '</div>' : '') + '</div>';
    }).join('')).join('');
    lista.querySelectorAll('.mx-pal-item').forEach(el => {
      el.addEventListener('click', () => executarItem(_palItens[+el.dataset.i]));
      el.addEventListener('mousemove', () => { if (_palSel !== +el.dataset.i) { _palSel = +el.dataset.i; marcarSel(true); } });
    });
    if (_palSel >= _palItens.length) _palSel = 0;
    marcarSel();
  }
  function marcarSel(semScroll) {
    document.querySelectorAll('#mx-pal-list .mx-pal-item').forEach(el => {
      const s = +el.dataset.i === _palSel; el.classList.toggle('sel', s);
      if (s && !semScroll) el.scrollIntoView({ block: 'nearest' });
    });
  }
  function executarItem(it) { if (!it) return; fecharBusca(); safe(() => it.run()); }

  // ===================== FICHA 360° DO SERVIDOR =====================
  let _fichaId = null, _fichaAba = 'ferias';
  function criarModalFicha() {
    if (document.getElementById('mx-ficha-bg')) return;
    const bg = document.createElement('div');
    bg.className = 'modal-bg mx-ficha-bg'; bg.id = 'mx-ficha-bg';
    bg.innerHTML = '<div class="modal mx-ficha" id="mx-ficha" role="dialog" aria-label="Ficha do servidor"></div>';
    bg.addEventListener('mousedown', ev => { if (ev.target === bg) fecharFicha(); });
    document.body.appendChild(bg);
  }
  function fecharFicha() { const bg = document.getElementById('mx-ficha-bg'); if (bg) bg.classList.remove('open'); _fichaId = null; }
  MX.fecharFicha = fecharFicha;

  function situacaoHoje(srvId) {
    const h = hojeISO();
    const fer = dbList('programacoes').find(p => p.srvId === srvId && p.inicio && p.fim && p.inicio <= h && p.fim >= h);
    if (fer) return { txt: 'Em férias até ' + fd(fer.fim), cls: 'tag-green' };
    const fol = dbList('folgas').find(f => f.srvId === srvId && f.tipo !== 'credito' && diasDaFolga(f).includes(h));
    if (fol) return { txt: 'De folga hoje', cls: 'tag-warn' };
    return { txt: 'Em atividade', cls: 'tag-blue' };
  }

  function abrirFicha360(srvId, aba) {
    if (!isGestao()) return;
    const s = servidoresAcessiveis().find(x => x.id === srvId);
    if (!s) { toast('Servidor não encontrado ou fora dos seus setores.', 'error'); return; }
    criarModalFicha();
    _fichaId = srvId; _fichaAba = aba || _fichaAba || 'ferias';
    const rec = LS.get('mx_recentes', []).filter(id => id !== srvId); rec.unshift(srvId); LS.set('mx_recentes', rec.slice(0, 6));
    renderFicha();
    document.getElementById('mx-ficha-bg').classList.add('open');
  }
  window.abrirFicha360 = abrirFicha360;
  MX.abrirFicha360 = abrirFicha360;

  function dadosFicha(s) {
    const progs = dbList('programacoes').filter(p => p.srvId === s.id).sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));
    const folgas = dbList('folgas').filter(f => f.srvId === s.id).sort((a, b) => String(b.data || b.criadoEm).localeCompare(String(a.data || a.criadoEm)));
    const bh = dbList('bancoHoras').filter(r => r.srvId === s.id).sort((a, b) => (b.ano - a.ano) || (b.mes - a.mes));
    const auts = dbList('autorizacoes').filter(a => a.srvId === s.id || (!a.srvId && a.srvMatricula && a.srvMatricula === s.matricula)).sort((a, b) => String(b.dataEmissao).localeCompare(String(a.dataEmissao)));
    const sols = dbList('solicitacoes').filter(x => x.srvId === s.id).sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
    const h = hojeISO();
    const prox = progs.filter(p => p.fim && p.fim >= h).sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)))[0];
    return { progs, folgas, bh, auts, sols, prox, saldoF: saldoFolgasDe(s.id, folgas), saldoH: saldoBHDe(s.id, bh) };
  }

  function renderFicha() {
    const s = srvPorId(_fichaId); if (!s) return fecharFicha();
    const d = dadosFicha(s);
    const sit = situacaoHoje(s.id);
    const idd = idade(s.nascimento);
    const aniv = proximoAniversario(s.nascimento);
    const dado = (lbl, val, extra) => '<div class="mx-dado"><div class="mx-d-lbl">' + lbl + '</div><div class="mx-d-val' + (val ? '' : ' mx-miss') + '">' + (val || 'não informado') + (extra || '') + '</div></div>';
    const tel = s.telefone ? e(s.telefone) + ' <a href="' + waLink(s.telefone) + '" target="_blank" rel="noopener" title="Abrir no WhatsApp" style="color:var(--success);margin-left:6px"><i class="fa-brands fa-whatsapp"></i></a>' : '';

    const abas = [
      ['ferias', '🌴 Férias', d.progs.length],
      ['folgas', '🏖️ Folgas', d.folgas.length],
      ['bh', '⏱️ Banco de horas', d.bh.length],
      ['auts', '📜 Autorizações', d.auts.length],
      ['sols', '📝 Solicitações', d.sols.length],
      ['hist', '🕓 Histórico', null]
    ];
    const pode = id => tabVisivel(id);
    const acoes = [];
    if (pode('servidores')) acoes.push('<button class="btn btn-ghost btn-sm" onclick="MX.fichaAcao(\'editar\')">✏️ Editar cadastro</button>');
    if (pode('ferias')) acoes.push('<button class="btn btn-ghost btn-sm" onclick="MX.fichaAcao(\'ferias\')">🗓️ Programar férias</button>');
    if (pode('folgas')) acoes.push('<button class="btn btn-ghost btn-sm" onclick="MX.fichaAcao(\'folgas\')">🏖️ Lançar folga</button>');
    if (pode('bancohoras')) acoes.push('<button class="btn btn-ghost btn-sm" onclick="MX.fichaAcao(\'bh\')">⏱️ Banco de horas</button>');
    if (pode('emitir-aut')) acoes.push('<button class="btn btn-primary btn-sm" onclick="MX.fichaAcao(\'aut\')">📄 Emitir autorização</button>');
    if (s.telefone) acoes.push('<a class="btn btn-success btn-sm" href="' + waLink(s.telefone, 'Olá, ' + s.nome.split(' ')[0] + '!') + '" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>');
    acoes.push('<button class="btn btn-ghost btn-sm" onclick="MX.imprimirFicha()" style="margin-left:auto">🖨️ Imprimir ficha</button>');

    document.getElementById('mx-ficha').innerHTML = `
      <div class="mx-ficha-top">
        ${typeof getAvatarHtml === 'function' ? getAvatarHtml(s.foto, s.nome, 68, 'border:2px solid var(--border-hi);flex-shrink:0') : ''}
        <div class="mx-ft-info">
          <h2>${e(s.nome)}</h2>
          <div style="font-size:.8rem;color:var(--text-mid)">${e(s.cargo || 'Cargo não informado')} · ${e(s.setor || 'Setor não informado')}</div>
          <div class="mx-ft-meta">
            <span class="tag tag-blue">Mat. ${e(s.matricula || '-')}</span>
            <span class="tag tag-purple">${s.vinculo === 'contratado' ? 'Contratado' : 'Efetivo'}</span>
            <span class="tag ${sit.cls}">${sit.txt}</span>
            ${aniv === 0 ? '<span class="tag tag-warn">🎂 Aniversário hoje!</span>' : ''}
          </div>
        </div>
        <button class="mx-ft-close" onclick="MX.fecharFicha()" title="Fechar (Esc)"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="mx-ficha-body">
        <div class="mx-kpis">
          <div class="mx-kpi ${d.saldoF > 0 ? 'ok' : d.saldoF < 0 ? 'bad' : ''}"><div class="mx-kpi-val">${sinal(d.saldoF)}${fmtDias(d.saldoF)}</div><div class="mx-kpi-lbl">Saldo de folgas (dias)</div></div>
          <div class="mx-kpi ${d.saldoH > 0 ? 'info' : d.saldoH < 0 ? 'bad' : ''}"><div class="mx-kpi-val">${fmtH(d.saldoH)}</div><div class="mx-kpi-lbl">Banco de horas</div></div>
          <div class="mx-kpi"><div class="mx-kpi-val">${s.feriasReg || 0}</div><div class="mx-kpi-lbl">Férias regulam. acumuladas</div></div>
          <div class="mx-kpi"><div class="mx-kpi-val">${s.feriasPrem || 0}</div><div class="mx-kpi-lbl">Férias-prêmio acumuladas</div></div>
          <div class="mx-kpi ${d.prox ? 'warn' : ''}"><div class="mx-kpi-val" style="font-size:1.05rem">${d.prox ? fd(d.prox.inicio) : '—'}</div><div class="mx-kpi-lbl">${d.prox ? 'Próximas férias (' + (d.prox.tipo === 'premio' ? 'prêmio' : 'anuais') + ')' : 'Sem férias programadas'}</div></div>
        </div>
        <div class="mx-dados">
          ${dado('Admissão', s.admissao ? fd(s.admissao) : '', s.admissao ? '<div style="font-size:.72rem;color:var(--muted);font-weight:500">' + tempoEntre(s.admissao) + ' de serviço</div>' : '')}
          ${dado('Nascimento', s.nascimento ? fd(s.nascimento) : '', s.nascimento ? '<div style="font-size:.72rem;color:var(--muted);font-weight:500">' + idd + ' anos · ' + (aniv === 0 ? 'aniversário hoje' : 'aniversário em ' + aniv + ' dia(s)') + '</div>' : '')}
          ${dado('Telefone / WhatsApp', tel)}
          ${dado('CPF', e(s.cpf || ''))}
          ${dado('PIS', e(s.pis || ''))}
          ${dado('Setor', e(s.setor || ''))}
        </div>
        <div class="mx-tabs">${abas.map(a => '<button class="mx-tab ' + (a[0] === _fichaAba ? 'active' : '') + '" onclick="MX.fichaAba(\'' + a[0] + '\')">' + a[1] + (a[2] != null ? '<span class="mx-tab-n">' + a[2] + '</span>' : '') + '</button>').join('')}</div>
        <div id="mx-ficha-aba"></div>
      </div>
      <div class="mx-ficha-actions">${acoes.join('')}</div>`;
    renderAbaFicha(s, d);
  }

  function item(ico, cor, titulo, sub, direita) {
    return '<div class="mx-tl-item"><div class="mx-tl-ico" style="background:' + cor + '22;color:' + cor + '">' + ico + '</div><div class="mx-tl-main"><div class="mx-tl-title">' + titulo + '</div>' +
      (sub ? '<div class="mx-tl-sub">' + sub + '</div>' : '') + '</div>' + (direita ? '<div class="mx-tl-right">' + direita + '</div>' : '') + '</div>';
  }
  const vazio = txt => '<div class="empty" style="padding:26px 10px"><p>' + txt + '</p></div>';

  function renderAbaFicha(s, d) {
    const el = document.getElementById('mx-ficha-aba'); if (!el) return;
    const h = hojeISO();
    if (_fichaAba === 'ferias') {
      el.innerHTML = !d.progs.length ? vazio('Nenhuma programação de férias.') : '<div class="mx-tl">' + d.progs.map(p => {
        let st, cls;
        if (p.concluido) { st = 'Concluída'; cls = 'tag-green'; }
        else if (p.inicio <= h && p.fim >= h) { st = 'Em gozo'; cls = 'tag-green'; }
        else if (p.fim < h) { st = 'Aguardando baixa'; cls = 'tag-warn'; }
        else if (p.autorizado) { st = 'Autorizada'; cls = 'tag-blue'; }
        else { st = 'Agendada'; cls = 'tag-purple'; }
        return item(p.tipo === 'premio' ? '🏆' : '🌴', p.tipo === 'premio' ? '#8b67f0' : '#0de29f',
          'Férias ' + (p.tipo === 'premio' ? 'Prêmio' : 'Anuais') + (p.periodo ? ' · ref. ' + e(p.periodo) : ''),
          fd(p.inicio) + ' → ' + fd(p.fim) + ' · retorno ' + fd(p.retorno || (typeof addDays === 'function' ? addDays(p.fim, 1) : '')) + (p.obs ? ' · ' + e(p.obs) : ''),
          '<span class="tag ' + cls + '">' + st + '</span>');
      }).join('') + '</div>';
    } else if (_fichaAba === 'folgas') {
      const cred = d.folgas.filter(f => f.tipo === 'credito').reduce((a, f) => a + (f.qtd || 0), 0);
      const deb = d.folgas.filter(f => f.tipo !== 'credito').reduce((a, f) => a + (f.qtd || 0), 0);
      el.innerHTML = '<div class="mx-count">Créditos: <span class="mx-pos">' + (cred ? '+' : '') + fmtDias(cred) + '</span> · Usufrutos: <span class="' + (deb ? 'mx-neg' : 'mx-zero') + '">' + (deb ? '−' : '') + fmtDias(deb) + '</span> · Saldo: <span class="' + clsSaldo(d.saldoF) + '">' + sinal(d.saldoF) + fmtDias(d.saldoF) + ' dia(s)</span></div>' +
        (!d.folgas.length ? vazio('Nenhuma movimentação de folga.') : '<div class="mx-tl">' + d.folgas.map(f => {
          const c = f.tipo === 'credito';
          const dias = c ? fd(f.data) : diasDaFolga(f).map(fd).join(', ');
          let obs = c ? (f.motivo || '') : (f.obs || '');
          if (!c && typeof parseFolgaObs === 'function') { const po = safe(() => parseFolgaObs(f.obs), null); if (po) obs = (po.obs || '') + (po.coberturaNome ? ' · cobertura: ' + po.coberturaNome : ''); }
          return item(c ? '➕' : '➖', c ? '#0de29f' : '#ff4560', c ? 'Crédito' : (f.negativo ? 'Usufruto (saldo negativo)' : 'Usufruto'), '📅 ' + dias + (obs ? ' · ' + e(obs) : ''),
            '<span class="' + (c ? 'mx-pos' : 'mx-neg') + '">' + (c ? '+' : '−') + fmtDias(f.qtd) + '</span>');
        }).join('') + '</div>');
    } else if (_fichaAba === 'bh') {
      el.innerHTML = '<div class="mx-count">Saldo atual: <span class="' + clsSaldo(d.saldoH) + '">' + fmtH(d.saldoH) + '</span></div>' +
        (!d.bh.length ? vazio('Nenhum lançamento no banco de horas.') : '<div class="mx-tl">' + d.bh.map(r => {
          const sal = (r.horasGeradas || 0) - (r.horasPagas || 0);
          return item('⏱️', '#4d8bff', pad(r.mes) + '/' + r.ano + (r.tipoLancamento === 'ajuste' ? ' · ajuste' : ''),
            'Geradas: ' + fmtH(r.horasGeradas) + ' · Pagas/compensadas: ' + fmtH(r.horasPagas) + (r.obs ? ' · ' + e(r.obs) : ''),
            '<span class="' + clsSaldo(sal) + '">' + fmtH(sal) + '</span>');
        }).join('') + '</div>');
    } else if (_fichaAba === 'auts') {
      el.innerHTML = !d.auts.length ? vazio('Nenhuma autorização emitida.') : '<div class="mx-tl">' + d.auts.map(a => {
        const dt = a.dataEmissao ? new Date(a.dataEmissao) : null;
        const per = (a.periodos || []).map(p => fd(p.inicio) + '–' + fd(p.fim)).join(', ');
        return item('📜', '#4d8bff', 'Autorização · ' + (a.tipoFerias === 'premio' ? 'Prêmio' : 'Regulamentar') + (a.periodoRef ? ' · ref. ' + e(a.periodoRef) : ''),
          (dt && !isNaN(dt) ? 'Emitida em ' + dt.toLocaleDateString('pt-BR') : '') + (per ? ' · ' + per : '') + (a.tipoParc ? ' · ' + e(a.tipoParc) : ''),
          typeof reimprimirAutorizacao === 'function' ? '<button class="btn btn-ghost btn-sm" onclick="reimprimirAutorizacao(\'' + jsArg(a.id) + '\')">🖨️</button>' : '');
      }).join('') + '</div>';
    } else if (_fichaAba === 'sols') {
      const rot = { ferias_anual: 'Férias anuais', ferias_premio: 'Férias-prêmio', folga: 'Folga' };
      el.innerHTML = !d.sols.length ? vazio('Nenhuma solicitação.') : '<div class="mx-tl">' + d.sols.map(x => {
        const st = x.status === 'pendente' ? ['Aguardando', 'tag-warn'] : x.status === 'autorizado' ? ['Aprovada', 'tag-green'] : ['Negada', 'tag-red'];
        const datas = Array.isArray(x.dataItems) && x.dataItems.length ? x.dataItems.map(di => fd(di.data)).join(', ') : (x.inicio ? fd(x.inicio) + (x.fim ? ' → ' + fd(x.fim) : '') : '');
        const dt = x.criadoEm ? new Date(x.criadoEm) : null;
        return item('📝', '#8b67f0', rot[x.tipo] || e(String(x.tipo || 'Solicitação').replace(/_/g, ' ')), (datas ? '📅 ' + datas + ' · ' : '') + (dt && !isNaN(dt) ? 'pedida em ' + dt.toLocaleDateString('pt-BR') : ''),
          '<span class="tag ' + st[1] + '">' + st[0] + '</span>');
      }).join('') + '</div>';
    } else if (_fichaAba === 'hist') {
      el.innerHTML = '<div class="empty" style="padding:26px 10px"><p>Carregando histórico...</p></div>';
      carregarHistorico(s).then(logs => {
        if (_fichaId !== s.id || _fichaAba !== 'hist') return;
        el.innerHTML = !logs.length ? vazio('Nenhum registro de auditoria vinculado a este servidor.') : '<div class="mx-tl">' + logs.map(l => {
          const dt = l.criadoEm ? new Date(l.criadoEm) : null;
          return item('🕓', '#94a4c0', e(l.acao || 'Registro'), e(l.detalhes || ''), '<span style="font-weight:500;font-size:.7rem;color:var(--muted)">' + (dt && !isNaN(dt) ? dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '') + '<br>' + e(l.usuarioNome || '') + '</span>');
        }).join('') + '</div>';
      });
    }
  }

  async function carregarHistorico(s) {
    const ids = new Set([s.id]);
    dbList('folgas').forEach(f => { if (f.srvId === s.id) ids.add(f.id); });
    dbList('programacoes').forEach(p => { if (p.srvId === s.id) ids.add(p.id); });
    const vinc = l => ids.has(l.registroId || l.registroid) || (l.detalhes && s.nome && String(l.detalhes).includes(s.nome));
    let logs = (LS.get('srv_logs', []) || []).filter(vinc);
    // Busca na nuvem com limite de tempo: sem conexão, mostra só os logs locais.
    const comLimite = (pr, ms) => Promise.race([pr, new Promise(res => setTimeout(() => res({ data: null, error: 'timeout' }), ms))]);
    try {
      if (typeof supabaseClient !== 'undefined') {
        const [r1, r2] = await Promise.all([
          comLimite(supabaseClient.from('logs').select('*').ilike('detalhes', '%' + s.nome + '%').order('criadoEm', { ascending: false }).limit(100), 6000),
          comLimite(supabaseClient.from('logs').select('*').eq('registroId', s.id).limit(100), 6000)
        ]);
        [r1, r2].forEach(r => { if (r && !r.error && Array.isArray(r.data)) logs = logs.concat(r.data); });
      }
    } catch (err) { /* sem nuvem: usa só os logs locais */ }
    const vistos = new Set();
    return logs.filter(l => { if (!l || vistos.has(l.id)) return false; vistos.add(l.id); return true; })
      .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm))).slice(0, 100);
  }

  MX.fichaAba = function (aba) { _fichaAba = aba; renderFicha(); };
  MX.fichaAcao = function (acao) {
    const id = _fichaId; const s = srvPorId(id); if (!s) return;
    fecharFicha();
    const setSel = (selId, val) => { const el = document.getElementById(selId); if (el && Array.from(el.options).some(o => o.value === val)) { el.value = val; el.dispatchEvent(new Event('change')); } };
    if (acao === 'editar') { showTab('servidores'); setTimeout(() => editarServidor(id), 60); }
    if (acao === 'ferias') { showTab('ferias'); setTimeout(() => { const f = document.getElementById('fp-filtro-setor'); if (f) { f.value = ''; f.dispatchEvent(new Event('change')); } setSel('fp-servidor', id); }, 80); }
    if (acao === 'folgas') {
      showTab('folgas');
      setTimeout(() => {
        ['fg-filtro-setor-cred', 'fg-filtro-setor-deb'].forEach(x => { const f = document.getElementById(x); if (f && f.value) { f.value = ''; f.dispatchEvent(new Event('change')); } });
        setSel('fg-srv-cred', id); setSel('fg-srv-deb', id); setSel('fg-hist-srv', id);
      }, 80);
    }
    if (acao === 'bh') { showTab('bancohoras'); setTimeout(() => { ['bh-filtro-setor', 'bh-saldo-setor'].forEach(x => { const f = document.getElementById(x); if (f && f.value) { f.value = ''; f.dispatchEvent(new Event('change')); } });
        setSel('bh-srv', id); setSel('bh-saldo-srv', id); setSel('bh-hist-srv', id); }, 80); }
    if (acao === 'aut' && typeof abrirModalAutorizacao === 'function') {
      abrirModalAutorizacao(id);
    }
  };

  MX.imprimirFicha = function () {
    const s = srvPorId(_fichaId); if (!s) return;
    const d = dadosFicha(s);
    const imgE = typeof getImg === 'function' ? getImg('esq') : '';
    const imgD = typeof getImg === 'function' ? getImg('dir') : '';
    const cfg = safe(() => DB.config(), {});
    const linha = (l, v) => '<tr><th>' + l + '</th><td>' + (v || '—') + '</td></tr>';
    const tab = (cab, linhas) => linhas.length ? '<table class="t"><thead><tr>' + cab.map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' + linhas.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>' : '<p class="v">Sem registros.</p>';
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Ficha - ${e(s.nome)}</title><style>
      body{font-family:Arial,sans-serif;font-size:11px;color:#111;margin:24px}
      .cab{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:14px}
      .cab img{max-height:60px;max-width:120px} .cab .c{text-align:center;flex:1} .cab h1{font-size:14px;margin:0 0 4px;text-transform:uppercase} .cab div{font-size:10px}
      h2{font-size:12px;text-transform:uppercase;background:#eee;padding:5px 8px;margin:16px 0 6px;border-left:4px solid #333}
      table.d{width:100%;border-collapse:collapse} table.d th{text-align:left;width:30%;padding:4px 6px;border-bottom:1px solid #ddd;color:#444} table.d td{padding:4px 6px;border-bottom:1px solid #ddd;font-weight:bold}
      table.t{width:100%;border-collapse:collapse} table.t th,table.t td{border:1px solid #999;padding:4px 6px;text-align:left} table.t th{background:#f2f2f2;font-size:10px;text-transform:uppercase}
      .k{display:flex;gap:10px;margin:8px 0} .k div{flex:1;border:1px solid #999;padding:8px;text-align:center} .k b{display:block;font-size:16px} .v{color:#666;font-style:italic}
      @page{size:A4;margin:14mm}
    </style></head><body onload="window.print()">
      <div class="cab">${imgE ? '<img src="' + imgE + '">' : '<span></span>'}<div class="c"><h1>Ficha Funcional do Servidor</h1><div>${e(cfg.nomeOrganizacao || 'Coordenação da Atenção Primária à Saúde')}</div><div>Emitida em ${new Date().toLocaleDateString('pt-BR')}</div></div>${imgD ? '<img src="' + imgD + '">' : '<span></span>'}</div>
      <h2>Dados cadastrais</h2>
      <table class="d">${linha('Nome', e(s.nome))}${linha('Matrícula', e(s.matricula))}${linha('Cargo', e(s.cargo))}${linha('Setor', e(s.setor))}${linha('Vínculo', s.vinculo === 'contratado' ? 'Contratado' : 'Efetivo')}${linha('Admissão', s.admissao ? fd(s.admissao) + ' (' + tempoEntre(s.admissao) + ')' : '')}${linha('Nascimento', fd(s.nascimento))}${linha('CPF', e(s.cpf))}${linha('PIS', e(s.pis))}${linha('Telefone', e(s.telefone))}</table>
      <h2>Saldos</h2>
      <div class="k"><div><b>${sinal(d.saldoF)}${fmtDias(d.saldoF)}</b>dias de folga</div><div><b>${fmtH(d.saldoH)}</b>banco de horas</div><div><b>${s.feriasReg || 0}</b>férias regulam. acumuladas</div><div><b>${s.feriasPrem || 0}</b>férias-prêmio acumuladas</div></div>
      <h2>Férias</h2>${tab(['Tipo', 'Ref.', 'Início', 'Fim', 'Retorno', 'Situação'], d.progs.map(p => [p.tipo === 'premio' ? 'Prêmio' : 'Anual', e(p.periodo || ''), fd(p.inicio), fd(p.fim), fd(p.retorno), p.concluido ? 'Concluída' : p.autorizado ? 'Autorizada' : 'Agendada']))}
      <h2>Folgas (últimos 30 lançamentos)</h2>${tab(['Tipo', 'Data(s)', 'Dias', 'Motivo / Obs.'], d.folgas.slice(0, 30).map(f => [f.tipo === 'credito' ? 'Crédito' : 'Usufruto', f.tipo === 'credito' ? fd(f.data) : diasDaFolga(f).map(fd).join(', '), (f.tipo === 'credito' ? '+' : '−') + fmtDias(f.qtd), e((f.tipo === 'credito' ? f.motivo : (typeof parseFolgaObs === 'function' ? (safe(() => parseFolgaObs(f.obs).obs, f.obs)) : f.obs)) || '')]))}
      <h2>Banco de horas</h2>${tab(['Mês/Ano', 'Geradas', 'Pagas', 'Saldo do mês'], d.bh.map(r => [pad(r.mes) + '/' + r.ano, fmtH(r.horasGeradas), fmtH(r.horasPagas), fmtH((r.horasGeradas || 0) - (r.horasPagas || 0))]))}
      ${typeof getAssinaturaCoordenador === 'function' ? getAssinaturaCoordenador() : ''}
    </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast('Permita pop-ups para imprimir a ficha.', 'warning'); return; }
    w.document.write(html); w.document.close();
  };

  // ===================== PAINEL DE SALDOS =====================
  MX.sal = { sort: 'saldoF', dir: 'desc', page: 1, porPagina: 25 };
  const COLS_SAL = [
    ['nome', 'Servidor', false], ['setor', 'Setor', false], ['cred', 'Créditos', true], ['deb', 'Usufrutos', true],
    ['saldoF', 'Saldo folgas', true], ['saldoH', 'Banco de horas', true], ['ultimo', 'Último lançamento', false]
  ];
  function calcularSaldos() {
    const srvs = servidoresAcessiveis();
    const folgas = dbList('folgas'); const bh = dbList('bancoHoras');
    const m = new Map(srvs.map(s => [s.id, { s, nome: s.nome || '', setor: s.setor || '', cred: 0, deb: 0, saldoF: 0, saldoH: 0, ultimo: '', mov: false }]));
    folgas.forEach(f => {
      const r = m.get(f.srvId); if (!r) return;
      const q = f.qtd || 0;
      if (f.tipo === 'credito') r.cred += q; else r.deb += q;
      r.saldoF += f.tipo === 'credito' ? q : -q; r.mov = true;
      const dt = String(f.data || (f.criadoEm || '').slice(0, 10));
      if (dt > r.ultimo) r.ultimo = dt;
    });
    bh.forEach(x => { const r = m.get(x.srvId); if (!r) return; r.saldoH += (x.horasGeradas || 0) - (x.horasPagas || 0); r.mov = true; });
    return Array.from(m.values());
  }
  function filtrarSaldos(linhas) {
    const q = norm((document.getElementById('mx-sal-busca') || {}).value || '').trim();
    const setor = (document.getElementById('mx-sal-setor') || {}).value || '';
    const sit = (document.getElementById('mx-sal-sit') || {}).value || '';
    return linhas.filter(r => {
      if (setor && r.setor !== setor) return false;
      if (q && !norm(r.nome + ' ' + (r.s.matricula || '') + ' ' + (r.s.cargo || '')).includes(q)) return false;
      if (sit === 'mov' && !r.mov) return false;
      if (sit === 'pos' && !(r.saldoF > 0)) return false;
      if (sit === 'neg' && !(r.saldoF < 0)) return false;
      if (sit === 'zero' && r.saldoF !== 0) return false;
      if (sit === 'bhpos' && !(r.saldoH > 0.001)) return false;
      if (sit === 'bhneg' && !(r.saldoH < -0.001)) return false;
      return true;
    });
  }
  function renderSaldos() {
    const todas = calcularSaldos();
    const selSetor = document.getElementById('mx-sal-setor');
    if (selSetor) {
      const cur = selSetor.value;
      const setores = [...new Set(todas.map(r => r.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      selSetor.innerHTML = '<option value="">Todos os setores</option>' + setores.map(x => '<option value="' + e(x) + '"' + (x === cur ? ' selected' : '') + '>' + e(x) + '</option>').join('');
    }
    const linhas = filtrarSaldos(todas);
    // KPIs (sobre o filtro atual)
    const emBanco = linhas.reduce((a, r) => a + (r.saldoF > 0 ? r.saldoF : 0), 0);
    const negativos = linhas.filter(r => r.saldoF < 0).length;
    const comSaldo = linhas.filter(r => r.saldoF > 0).length;
    const horas = linhas.reduce((a, r) => a + r.saldoH, 0);
    const maior = linhas.reduce((m, r) => (!m || r.saldoF > m.saldoF) ? r : m, null);
    document.getElementById('mx-sal-kpis').innerHTML =
      '<div class="mx-kpi info"><div class="mx-kpi-val">' + fmtDias(emBanco) + '</div><div class="mx-kpi-lbl">Dias de folga em banco</div></div>' +
      '<div class="mx-kpi ok"><div class="mx-kpi-val">' + comSaldo + '</div><div class="mx-kpi-lbl">Servidores com saldo</div></div>' +
      '<div class="mx-kpi ' + (negativos ? 'bad' : '') + '"><div class="mx-kpi-val">' + negativos + '</div><div class="mx-kpi-lbl">Saldos negativos</div></div>' +
      '<div class="mx-kpi"><div class="mx-kpi-val">' + fmtH(horas) + '</div><div class="mx-kpi-lbl">Banco de horas (total)</div></div>' +
      '<div class="mx-kpi"><div class="mx-kpi-val" style="font-size:1rem">' + (maior && maior.saldoF > 0 ? e(maior.nome.split(' ')[0]) + ' · ' + fmtDias(maior.saldoF) : '—') + '</div><div class="mx-kpi-lbl">Maior saldo de folga</div></div>';

    // Ordenação
    const { sort, dir } = MX.sal;
    const mult = dir === 'asc' ? 1 : -1;
    linhas.sort((a, b) => {
      const va = a[sort], vb = b[sort];
      const c = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return c * mult || a.nome.localeCompare(b.nome);
    });
    document.getElementById('mx-sal-head').innerHTML = COLS_SAL.map(c => '<th class="mx-sort' + (c[2] ? ' mx-num' : '') + (sort === c[0] ? ' ' + dir : '') + '" onclick="MX.ordenarSaldos(\'' + c[0] + '\')">' + c[1] + '<span class="mx-sort-ind">' + (sort === c[0] ? (dir === 'asc' ? '▲' : '▼') : '↕') + '</span></th>').join('');

    const total = linhas.length;
    const pags = Math.max(1, Math.ceil(total / MX.sal.porPagina));
    if (MX.sal.page > pags) MX.sal.page = pags;
    const ini = (MX.sal.page - 1) * MX.sal.porPagina;
    const pagina = linhas.slice(ini, ini + MX.sal.porPagina);
    document.getElementById('mx-sal-count').textContent = total + ' servidor(es)' + (total ? ' · mostrando ' + (ini + 1) + '–' + Math.min(ini + MX.sal.porPagina, total) : '') + ' · clique no cabeçalho para ordenar';
    document.getElementById('mx-sal-body').innerHTML = !pagina.length ? '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:30px">Nenhum servidor encontrado.</td></tr>' : pagina.map(r =>
      '<tr><td><button class="mx-link" onclick="abrirFicha360(\'' + jsArg(r.s.id) + '\')">' + e(r.nome) + '</button><div style="font-size:.7rem;color:var(--muted)">Mat. ' + e(r.s.matricula || '-') + ' · ' + e(r.s.cargo || '') + '</div></td>' +
      '<td>' + e(r.setor || '-') + '</td><td class="mx-num">' + (r.cred ? '+' + fmtDias(r.cred) : '—') + '</td><td class="mx-num">' + (r.deb ? '−' + fmtDias(r.deb) : '—') + '</td>' +
      '<td class="mx-num"><span class="' + clsSaldo(r.saldoF) + '">' + sinal(r.saldoF) + fmtDias(r.saldoF) + '</span></td>' +
      '<td class="mx-num"><span class="' + clsSaldo(Math.abs(r.saldoH) < 0.001 ? 0 : r.saldoH) + '">' + fmtH(r.saldoH) + '</span></td>' +
      '<td style="white-space:nowrap">' + (r.ultimo ? fd(r.ultimo) : '—') + '</td></tr>').join('');
    const pg = document.getElementById('mx-sal-pager');
    pg.innerHTML = pags <= 1 ? '' :
      '<button class="btn btn-ghost btn-sm" ' + (MX.sal.page === 1 ? 'disabled' : '') + ' onclick="MX.sal.page--;MX.renderSaldos()">‹ Anterior</button>' +
      '<span class="mx-pg-info">Página ' + MX.sal.page + ' de ' + pags + '</span>' +
      '<button class="btn btn-ghost btn-sm" ' + (MX.sal.page === pags ? 'disabled' : '') + ' onclick="MX.sal.page++;MX.renderSaldos()">Próxima ›</button>';

    // Resumo por setor (todas as linhas do perfil, sem o filtro de busca)
    const porSetor = {};
    todas.forEach(r => {
      const k = r.setor || '(sem setor)';
      const o = porSetor[k] || (porSetor[k] = { n: 0, dias: 0, neg: 0, h: 0 });
      o.n++; o.dias += r.saldoF > 0 ? r.saldoF : 0; if (r.saldoF < 0) o.neg++; o.h += r.saldoH;
    });
    document.getElementById('mx-sal-setores').innerHTML = Object.keys(porSetor).sort((a, b) => a.localeCompare(b)).map(k => {
      const o = porSetor[k];
      return '<tr><td><button class="mx-link" onclick="document.getElementById(\'mx-sal-setor\').value=\'' + jsArg(k === '(sem setor)' ? '' : k) + '\';MX.sal.page=1;MX.renderSaldos();window.scrollTo({top:0})">' + e(k) + '</button></td><td class="mx-num">' + o.n + '</td><td class="mx-num">' + fmtDias(o.dias) + '</td><td class="mx-num ' + (o.neg ? 'mx-neg' : '') + '">' + o.neg + '</td><td class="mx-num">' + fmtH(o.h) + '</td></tr>';
    }).join('');
    MX._saldosFiltrados = linhas;
  }
  MX.renderSaldos = renderSaldos;
  MX.ordenarSaldos = function (col) {
    if (MX.sal.sort === col) MX.sal.dir = MX.sal.dir === 'asc' ? 'desc' : 'asc';
    else { MX.sal.sort = col; MX.sal.dir = (col === 'nome' || col === 'setor') ? 'asc' : 'desc'; }
    renderSaldos();
  };
  MX.exportarSaldos = function () {
    renderSaldos();
    const linhas = (MX._saldosFiltrados || []).map(r => ({
      'Matrícula': r.s.matricula || '', 'Servidor': r.nome, 'Setor': r.setor, 'Cargo': r.s.cargo || '',
      'Créditos (dias)': r.cred, 'Usufrutos (dias)': r.deb, 'Saldo de folgas (dias)': r.saldoF,
      'Banco de horas (h)': fmtH(r.saldoH), 'Banco de horas (decimal)': Math.round(r.saldoH * 100) / 100,
      'Último lançamento': r.ultimo ? fd(r.ultimo) : ''
    }));
    baixarExcel('saldos_folgas_banco_horas_' + hojeISO(), [{ nome: 'Saldos', linhas }]);
  };
  MX.imprimirSaldos = function () {
    renderSaldos();
    const linhas = MX._saldosFiltrados || [];
    const cfg = safe(() => DB.config(), {});
    const w = window.open('', '_blank'); if (!w) { toast('Permita pop-ups para imprimir.', 'warning'); return; }
    w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Painel de Saldos</title><style>body{font-family:Arial,sans-serif;font-size:10px;margin:20px}h1{font-size:14px;text-align:center;margin:0}p{text-align:center;margin:4px 0 12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:4px 6px}th{background:#eee;text-transform:uppercase;font-size:9px}td.n{text-align:right}@page{size:A4;margin:12mm}</style></head><body onload="window.print()">
      <h1>Painel de Saldos — Folgas e Banco de Horas</h1><p>${e(cfg.nomeOrganizacao || '')} · emitido em ${new Date().toLocaleDateString('pt-BR')} · ${linhas.length} servidor(es)</p>
      <table><thead><tr><th>Mat.</th><th>Servidor</th><th>Setor</th><th>Créditos</th><th>Usufrutos</th><th>Saldo folgas</th><th>Banco de horas</th></tr></thead><tbody>
      ${linhas.map(r => '<tr><td>' + e(r.s.matricula || '') + '</td><td>' + e(r.nome) + '</td><td>' + e(r.setor) + '</td><td class="n">' + fmtDias(r.cred) + '</td><td class="n">' + fmtDias(r.deb) + '</td><td class="n"><b>' + sinal(r.saldoF) + fmtDias(r.saldoF) + '</b></td><td class="n">' + fmtH(r.saldoH) + '</td></tr>').join('')}
      </tbody></table>${typeof getAssinaturaCoordenador === 'function' ? getAssinaturaCoordenador() : ''}</body></html>`);
    w.document.close();
  };

  // Exportação da lista de servidores (respeita busca/filtro da tela)
  MX.exportarServidores = function () {
    const busca = norm((document.getElementById('busca-servidor') || {}).value || '');
    const setor = (document.getElementById('filtro-setor') || {}).value || '';
    const folgas = dbList('folgas'), bh = dbList('bancoHoras');
    const linhas = servidoresAcessiveis().filter(s => (!setor || s.setor === setor) && (!busca || norm(s.nome + ' ' + s.matricula + ' ' + s.setor).includes(busca)))
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome)))
      .map(s => ({
        'Matrícula': s.matricula || '', 'Nome': s.nome || '', 'CPF': s.cpf || '', 'PIS': s.pis || '',
        'Nascimento': s.nascimento ? fd(s.nascimento) : '', 'Admissão': s.admissao ? fd(s.admissao) : '', 'Tempo de serviço': tempoEntre(s.admissao),
        'Setor': s.setor || '', 'Cargo': s.cargo || '', 'Vínculo': s.vinculo === 'contratado' ? 'Contratado' : 'Efetivo', 'Telefone': s.telefone || '',
        'Férias reg. acumuladas': s.feriasReg || 0, 'Férias-prêmio acumuladas': s.feriasPrem || 0,
        'Saldo de folgas (dias)': saldoFolgasDe(s.id, folgas), 'Banco de horas': fmtH(saldoBHDe(s.id, bh))
      }));
    baixarExcel('servidores_' + hojeISO(), [{ nome: 'Servidores', linhas }]);
  };

  // ===================== CENTRAL DE PENDÊNCIAS =====================
  const SEV = { bad: 3, warn: 2, info: 1, ok: 0 };
  function coletarPendencias() {
    if (!isGestao()) return [];
    const secs = [];
    const h = hojeISO();
    const srvs = servidoresAcessiveis();
    const mapa = new Map(srvs.map(s => [s.id, s]));
    const btnFicha = id => ({ label: '👁️ Ficha', cls: 'btn-ghost', on: "abrirFicha360('" + jsArg(id) + "')" });

    if (tabVisivel('ferias') || tabVisivel('alertas')) {
      const progs = dbList('programacoes').filter(p => mapa.has(p.srvId) && !p.concluido);
      // 1) Férias próximas sem autorização
      const semAut = progs.filter(p => {
        if (p.autorizado || !p.inicio) return false;
        const d = diffDays(p.inicio); const lim = p.tipo === 'premio' ? 65 : 35;
        return d >= 0 && d <= lim;
      }).sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
      secs.push({ id: 'aut', titulo: 'Férias próximas sem autorização emitida', ico: '📄', cor: '#f5b52e', itens: semAut.map(p => {
        const s = mapa.get(p.srvId); const d = diffDays(p.inicio);
        const acoes = [btnFicha(s.id)];
        if (tabVisivel('emitir-aut')) acoes.push({ label: '📄 Emitir', cls: 'btn-primary', on: "abrirModalAutorizacao('" + jsArg(s.id) + "','" + p.inicio + "','" + p.fim + "','" + jsArg(p.tipo) + "','" + jsArg(p.periodo || '') + "')" });
        if (typeof prepararWhatsApp === 'function') acoes.push({ label: '💬 Avisar', cls: 'btn-ghost', on: "prepararWhatsApp('" + jsArg(s.id) + "','" + jsArg(p.id) + "')" });
        return { sev: d <= 7 ? 'bad' : d <= 15 ? 'warn' : 'info', titulo: s.nome, sub: 'Férias ' + (p.tipo === 'premio' ? 'prêmio' : 'anuais') + ' de ' + fd(p.inicio) + ' a ' + fd(p.fim) + ' · ' + (d === 0 ? 'começa HOJE' : 'começa em ' + d + ' dia(s)') + ' · ' + (s.setor || ''), acoes };
      }) });
      // 2) Férias encerradas aguardando baixa
      const baixa = progs.filter(p => p.fim && p.fim < h).sort((a, b) => String(a.fim).localeCompare(String(b.fim)));
      secs.push({ id: 'baixa', titulo: 'Férias encerradas aguardando baixa', ico: '✅', cor: '#4d8bff', itens: baixa.map(p => {
        const s = mapa.get(p.srvId); const d = -diffDays(p.fim);
        return { sev: d > 30 ? 'warn' : 'info', titulo: s.nome, sub: 'Retornou em ' + fd(p.retorno || p.fim) + ' (' + d + ' dia(s) atrás) · ' + (s.setor || ''),
          acoes: [btnFicha(s.id), { label: '✅ Dar baixa', cls: 'btn-success', on: "MX.darBaixa('" + jsArg(p.id) + "')" }] };
      }) });
    }

    if (tabVisivel('folgas') || tabVisivel('saldos')) {
      const folgas = dbList('folgas');
      const neg = srvs.map(s => ({ s, saldo: saldoFolgasDe(s.id, folgas) })).filter(x => x.saldo < 0).sort((a, b) => a.saldo - b.saldo);
      secs.push({ id: 'neg', titulo: 'Saldo de folgas negativo', ico: '🔴', cor: '#ff4560', itens: neg.map(x => ({
        sev: x.saldo <= -3 ? 'bad' : 'warn', titulo: x.s.nome, sub: 'Saldo: ' + fmtDias(x.saldo) + ' dia(s) · ' + (x.s.setor || ''),
        acoes: [btnFicha(x.s.id)].concat(tabVisivel('folgas') ? [{ label: '➕ Lançar crédito', cls: 'btn-ghost', on: "MX.irFolgas('" + jsArg(x.s.id) + "')" }] : [])
      })) });
    }

    if (tabVisivel('bancohoras')) {
      const bh = dbList('bancoHoras');
      const negH = srvs.map(s => ({ s, h: saldoBHDe(s.id, bh) })).filter(x => x.h < -0.001).sort((a, b) => a.h - b.h);
      secs.push({ id: 'bh', titulo: 'Banco de horas negativo', ico: '⏱️', cor: '#ff4560', itens: negH.map(x => ({
        sev: 'warn', titulo: x.s.nome, sub: 'Saldo: ' + fmtH(x.h) + ' · ' + (x.s.setor || ''), acoes: [btnFicha(x.s.id)]
      })) });
    }

    if (tabVisivel('solicitacoes')) {
      const sols = dbList('solicitacoes').filter(x => x.status === 'pendente' && mapa.has(x.srvId)).sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
      secs.push({ id: 'sol', titulo: 'Solicitações aguardando análise', ico: '📝', cor: '#8b67f0', itens: sols.map(x => {
        const s = mapa.get(x.srvId);
        const dias = x.criadoEm ? Math.floor((Date.now() - new Date(x.criadoEm)) / 86400000) : 0;
        const rot = { ferias_anual: 'Férias anuais', ferias_premio: 'Férias-prêmio', folga: 'Folga' }[x.tipo] || String(x.tipo || 'Solicitação').replace(/_/g, ' ');
        return { sev: dias >= 5 ? 'bad' : dias >= 2 ? 'warn' : 'info', titulo: s.nome + ' — ' + rot, sub: 'Pedida há ' + dias + ' dia(s)' + (x.inicio ? ' · a partir de ' + fd(x.inicio) : ''),
          acoes: [btnFicha(s.id), { label: '📂 Analisar', cls: 'btn-primary', on: "showTab('solicitacoes')" }] };
      }) });
    }

    if (tabVisivel('ponto')) {
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      const cargos = dbList('cargos');
      const creds = dbList('credenciados').filter(c => c.admissao).map(c => {
        const v = new Date(c.admissao + 'T00:00:00'); if (isNaN(v)) return null;
        v.setMonth(v.getMonth() + 2);
        return { c, v, diff: Math.ceil((v - hoje) / 86400000) };
      }).filter(x => x && x.diff <= 30).sort((a, b) => a.diff - b.diff);
      secs.push({ id: 'cred', titulo: 'Credenciamentos vencidos ou a vencer (30 dias)', ico: '📋', cor: '#f5b52e', itens: creds.map(x => {
        const cg = cargos.find(g => g.id === x.c.cargoId);
        return { sev: x.diff <= 0 ? 'bad' : x.diff <= 7 ? 'warn' : 'info', titulo: x.c.nome, sub: (x.diff < 0 ? 'Vencido há ' + Math.abs(x.diff) + ' dia(s)' : x.diff === 0 ? 'Vence HOJE' : 'Vence em ' + x.diff + ' dia(s)') + ' · ' + fd(isoLocal(x.v)) + ' · ' + (cg ? cg.nome : '') + (x.c.lotacao ? ' · ' + x.c.lotacao : ''),
          acoes: [{ label: '📂 Abrir ponto', cls: 'btn-ghost', on: "showTab('ponto')" }] };
      }) });
    }

    if (tabVisivel('aniversariantes') || tabVisivel('servidores')) {
      const ani = srvs.map(s => ({ s, d: proximoAniversario(s.nascimento) })).filter(x => x.d != null && x.d <= 7).sort((a, b) => a.d - b.d);
      secs.push({ id: 'bday', titulo: 'Aniversariantes (hoje e próximos 7 dias)', ico: '🎂', cor: '#ec4899', itens: ani.map(x => ({
        sev: x.d === 0 ? 'ok' : 'info', titulo: x.s.nome, sub: (x.d === 0 ? 'Hoje!' : x.d === 1 ? 'Amanhã' : 'Em ' + x.d + ' dias') + ' · ' + fd(x.s.nascimento).slice(0, 5) + ' · ' + (x.s.setor || ''),
        acoes: [btnFicha(x.s.id)].concat(x.d === 0 && typeof prepararWhatsAppAniversario === 'function' ? [{ label: '💬 Parabenizar', cls: 'btn-success', on: "prepararWhatsAppAniversario('" + jsArg(x.s.id) + "')" }] : [])
      })), padraoFechado: false });
    }

    if (tabVisivel('servidores')) {
      const inc = srvs.map(s => {
        const falta = [];
        if (!s.telefone) falta.push('telefone'); if (!s.nascimento) falta.push('nascimento');
        if (!s.cpf) falta.push('CPF'); if (!s.admissao) falta.push('admissão'); if (!s.cargo) falta.push('cargo');
        return { s, falta };
      }).filter(x => x.falta.length).sort((a, b) => b.falta.length - a.falta.length || a.s.nome.localeCompare(b.s.nome));
      secs.push({ id: 'cad', titulo: 'Cadastros incompletos', ico: '🪪', cor: '#94a4c0', padraoFechado: true, itens: inc.map(x => ({
        sev: 'info', titulo: x.s.nome, sub: 'Falta: ' + x.falta.join(', ') + ' · ' + (x.s.setor || ''),
        acoes: [btnFicha(x.s.id), { label: '✏️ Completar', cls: 'btn-ghost', on: "showTab('servidores');setTimeout(function(){editarServidor('" + jsArg(x.s.id) + "')},60)" }]
      })) });
    }

    if (isAdmin()) {
      const ult = LS.get('mx_ultimo_backup', null);
      const dias = ult ? Math.floor((Date.now() - new Date(ult)) / 86400000) : null;
      if (dias == null || dias >= 7) {
        secs.push({ id: 'backup', titulo: 'Backup dos dados', ico: '🗄️', cor: '#0de29f', itens: [{
          sev: dias == null || dias >= 30 ? 'warn' : 'info', titulo: dias == null ? 'Nenhum backup feito neste computador' : 'Último backup há ' + dias + ' dia(s)',
          sub: 'Recomendado: um backup por semana, guardado fora do computador.', acoes: [{ label: '💾 Fazer backup agora', cls: 'btn-primary', on: 'MX.baixarBackupJSON()' }]
        }] });
      }
    }

    secs.forEach(s => { s.max = s.itens.reduce((m, i) => Math.max(m, SEV[i.sev] || 0), 0); });
    return secs;
  }

  const _pendMostrarTudo = {};
  function renderPendencias() {
    const lista = document.getElementById('mx-pend-lista'); if (!lista) return;
    const secs = coletarPendencias();
    const todos = secs.flatMap(s => s.itens);
    const n = sev => todos.filter(i => i.sev === sev).length;
    document.getElementById('mx-pend-kpis').innerHTML =
      '<div class="mx-kpi bad"><div class="mx-kpi-val">' + n('bad') + '</div><div class="mx-kpi-lbl">🚨 Urgentes</div></div>' +
      '<div class="mx-kpi warn"><div class="mx-kpi-val">' + n('warn') + '</div><div class="mx-kpi-lbl">⚠️ Atenção</div></div>' +
      '<div class="mx-kpi info"><div class="mx-kpi-val">' + n('info') + '</div><div class="mx-kpi-lbl">ℹ️ Informativos</div></div>' +
      '<div class="mx-kpi ok"><div class="mx-kpi-val">' + secs.filter(s => !s.itens.length).length + '/' + secs.length + '</div><div class="mx-kpi-lbl">✅ Categorias em dia</div></div>';
    const estado = LS.get('mx_pend_secoes', {});
    const ordenadas = secs.slice().sort((a, b) => (b.itens.length ? 1 : 0) - (a.itens.length ? 1 : 0) || b.max - a.max);
    lista.innerHTML = ordenadas.map(sec => {
      const fechado = !sec.itens.length || (estado[sec.id] != null ? estado[sec.id] : !!sec.padraoFechado);
      const corN = sec.itens.length ? (sec.max >= 3 ? 'var(--danger)' : sec.max === 2 ? 'var(--warning)' : 'var(--primary)') : 'var(--success)';
      const lim = _pendMostrarTudo[sec.id] ? sec.itens.length : 8;
      const itens = sec.itens.slice(0, lim).map(it => '<div class="mx-pend-item mx-sev-' + it.sev + '"><div class="mx-pi-main"><div class="mx-pi-title">' + e(it.titulo) + '</div><div class="mx-pi-sub">' + e(it.sub) + '</div></div>' +
        '<div class="mx-pi-actions">' + it.acoes.map(a => '<button class="btn ' + a.cls + ' btn-sm" onclick="' + a.on.replace(/"/g, '&quot;') + '">' + a.label + '</button>').join('') + '</div></div>').join('');
      const mais = sec.itens.length > lim ? '<div class="mx-pend-more"><button class="btn btn-ghost btn-sm" onclick="MX.pendTudo(\'' + sec.id + '\')">Ver todos os ' + sec.itens.length + '</button></div>' : '';
      return '<div class="mx-pend-section' + (fechado ? ' collapsed' : '') + '" id="mx-pend-' + sec.id + '">' +
        '<div class="mx-pend-head" onclick="MX.pendToggle(\'' + sec.id + '\')"><div class="mx-pend-ico" style="background:' + sec.cor + '22">' + sec.ico + '</div><h4>' + sec.titulo + '</h4>' +
        '<span class="mx-pend-n" style="background:' + corN + '22;color:' + corN + '">' + (sec.itens.length || '✓') + '</span><i class="fa-solid fa-chevron-down mx-chev"></i></div>' +
        '<div class="mx-pend-body">' + (sec.itens.length ? itens + mais : '<div style="padding:8px 18px;font-size:.8rem;color:var(--muted)">Nada pendente aqui. 👍</div>') + '</div></div>';
    }).join('') || '<div class="empty"><div class="icon">✅</div><p>Nenhuma pendência para o seu perfil.</p></div>';
    atualizarBadgePendencias(secs);
  }
  MX.renderPendencias = renderPendencias;
  MX.pendToggle = function (id) {
    const el = document.getElementById('mx-pend-' + id); if (!el) return;
    el.classList.toggle('collapsed');
    const st = LS.get('mx_pend_secoes', {}); st[id] = el.classList.contains('collapsed'); LS.set('mx_pend_secoes', st);
  };
  MX.pendExpandir = function (abrir) {
    const st = {};
    document.querySelectorAll('.mx-pend-section').forEach(el => { st[el.id.replace('mx-pend-', '')] = !abrir; });
    LS.set('mx_pend_secoes', st); renderPendencias();
  };
  MX.pendTudo = function (id) { _pendMostrarTudo[id] = true; renderPendencias(); };
  MX.darBaixa = function (progId) {
    if (typeof avancarStatusProg === 'function') { avancarStatusProg(progId); setTimeout(renderPendencias, 100); }
  };
  MX.irFolgas = function (srvId) { _fichaId = srvId; MX.fichaAcao('folgas'); };

  function atualizarBadgePendencias(secs) {
    const b = document.getElementById('badge-pendencias'); if (!b) return;
    const lista = secs || safe(coletarPendencias, []);
    const n = lista.flatMap(s => s.itens).filter(i => i.sev === 'bad' || i.sev === 'warn').length;
    b.textContent = n; b.style.display = n ? '' : 'none';
    b.style.background = lista.some(s => s.max >= 3) ? 'var(--danger)' : 'var(--warning)';
    b.style.color = lista.some(s => s.max >= 3) ? '#fff' : '#000';
  }
  MX.atualizarBadgePendencias = atualizarBadgePendencias;

  // ===================== BACKUP E EXPORTAÇÃO =====================
  // [chave em _remoteData/DB, chave no localStorage, tabela no Supabase, rótulo]
  const TABELAS = [
    ['servidores', 'srv_servidores', 'servidores', 'Servidores'],
    ['programacoes', 'srv_programacoes', 'programacoes', 'Programações de férias'],
    ['folgas', 'srv_folgas', 'folgas', 'Folgas'],
    ['bancoHoras', 'srv_banco_horas', 'banco_horas', 'Banco de horas'],
    ['solicitacoes', 'srv_solicitacoes', 'solicitacoes', 'Solicitações'],
    ['autorizacoes', 'srv_autorizacoes', 'autorizacoes', 'Autorizações'],
    ['gestores', 'srv_gestores', 'gestores', 'Gestores'],
    ['eventos', 'srv_eventos', 'eventos', 'Eventos'],
    ['veiculos', 'srv_veiculos', 'veiculos', 'Veículos'],
    ['cargos', 'srv_cargos', 'cargos', 'Cargos (credenciados)'],
    ['credenciados', 'srv_credenciados', 'credenciados', 'Credenciados'],
    ['pontoMensal', 'srv_ponto_mensal', 'ponto_mensal', 'Ponto mensal'],
    ['pontoFolhas', 'srv_ponto_folhas', 'ponto_folhas', 'Folhas de ponto'],
    ['pontoHistorico', 'srv_ponto_historico', 'ponto_historico', 'Histórico de ponto'],
    ['protocolos', 'srv_protocolos', 'protocolos_entrega', 'Protocolos de entrega'],
    ['itensProtocolo', 'srv_itens_protocolo', 'itens_protocolo', 'Itens de protocolo'],
    ['oficios', 'srv_oficios', 'oficios', 'Ofícios'],
    ['notificacoes', 'srv_notificacoes', 'notificacoes', 'Notificações'],
    ['destinatarios', 'srv_destinatarios', 'destinatarios', 'Destinatários'],
    ['emissores', 'srv_emissores', 'emissores', 'Emissores']
  ];

  function montarBackup() {
    const tabelas = {};
    TABELAS.forEach(([k]) => { tabelas[k] = dbList(k); });
    return {
      app: 'Atlas Saúde — Férias e Folgas', formato: 1, geradoEm: new Date().toISOString(),
      geradoPor: sessao().nome || sessao().usuario || '', tabelas, config: safe(() => DB.config(), {})
    };
  }
  function registrarBackup(tipo) {
    LS.set('mx_ultimo_backup', new Date().toISOString());
    safe(() => DB.saveLog('Backup', 'Gerou ' + tipo + ' dos dados do sistema', 'sistema', ''));
    if (document.getElementById('panel-backup')?.classList.contains('active')) renderBackup();
    atualizarBadgePendencias();
  }
  function baixarBackupJSON(silencioso) {
    if (!isAdmin()) { toast('Somente o administrador pode gerar o backup completo.', 'error'); return; }
    const bk = montarBackup();
    const agora = new Date();
    const nome = 'backup_atlas_saude_' + hojeISO() + '_' + pad(agora.getHours()) + pad(agora.getMinutes()) + '.json';
    baixarArquivo(nome, JSON.stringify(bk, null, 1), 'application/json');
    registrarBackup('backup completo (.json)');
    if (!silencioso) toast('💾 Backup baixado: ' + nome, 'success');
  }
  MX.baixarBackupJSON = baixarBackupJSON;

  function achatar(reg) {
    const o = {};
    Object.keys(reg || {}).forEach(k => {
      if (/senha|password|hash/i.test(k)) return; // nunca exporta senhas para planilha
      let v = reg[k];
      if (v != null && typeof v === 'object') v = JSON.stringify(v);
      if (typeof v === 'string' && v.length > 500 && (k === 'foto' || v.startsWith('data:'))) v = '[imagem]';
      if (typeof v === 'string' && v.length > 32000) v = v.slice(0, 32000) + '…';
      o[k] = v;
    });
    return o;
  }
  MX.exportarTabela = function (chave) {
    const t = TABELAS.find(x => x[0] === chave); if (!t) return;
    baixarExcel(t[2] + '_' + hojeISO(), [{ nome: t[3], linhas: dbList(chave).map(achatar) }]);
  };
  MX.exportarTudoExcel = async function () {
    if (!isAdmin()) return;
    const abas = TABELAS.map(t => ({ nome: t[3], linhas: dbList(t[0]).map(achatar) })).filter(a => a.linhas.length);
    const ok = await baixarExcel('atlas_saude_dados_' + hojeISO(), abas);
    if (ok) { toast('📊 Planilha com ' + abas.length + ' abas gerada.', 'success'); registrarBackup('exportação para Excel'); }
  };

  function renderBackup() {
    const ult = LS.get('mx_ultimo_backup', null);
    const el = document.getElementById('mx-bk-ultimo');
    if (el) el.innerHTML = ult ? 'Último backup feito neste computador: <strong>' + new Date(ult).toLocaleString('pt-BR') + '</strong>' : '<span style="color:var(--warning)">Nenhum backup feito neste computador ainda.</span>';
    const tl = document.getElementById('mx-bk-tabelas');
    if (tl) tl.innerHTML = TABELAS.map(t => '<div class="mx-table-chip">' + e(t[3]) + '<strong>' + dbList(t[0]).length + '</strong><button class="btn btn-ghost btn-sm" onclick="MX.exportarTabela(\'' + t[0] + '\')" title="Exportar para Excel">📊</button></div>').join('');
  }
  MX.renderBackup = renderBackup;

  let _bkLido = null;
  MX.lerBackup = function (input) {
    const prev = document.getElementById('mx-bk-preview');
    _bkLido = null; prev.style.display = 'none'; prev.innerHTML = '';
    const f = input.files && input.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      let bk;
      try { bk = JSON.parse(r.result); } catch (err) { toast('Arquivo inválido: não é um JSON.', 'error'); return; }
      if (!bk || typeof bk !== 'object' || !bk.tabelas) { toast('Este arquivo não é um backup do Atlas Saúde.', 'error'); return; }
      _bkLido = bk;
      let totNovos = 0, totAlt = 0;
      const linhas = TABELAS.filter(t => Array.isArray(bk.tabelas[t[0]])).map(t => {
        const locais = new Map(dbList(t[0]).map(x => [x.id, x]));
        let novos = 0, alt = 0, iguais = 0;
        bk.tabelas[t[0]].forEach(x => {
          if (!x || !x.id) return;
          const l = locais.get(x.id);
          if (!l) novos++; else if (JSON.stringify(l) !== JSON.stringify(x)) alt++; else iguais++;
        });
        totNovos += novos; totAlt += alt;
        return '<tr><td>' + e(t[3]) + '</td><td class="mx-num">' + bk.tabelas[t[0]].length + '</td><td class="mx-num ' + (novos ? 'mx-pos' : '') + '">' + novos + '</td><td class="mx-num" style="' + (alt ? 'color:var(--warning);font-weight:700' : '') + '">' + alt + '</td><td class="mx-num">' + iguais + '</td></tr>';
      }).join('');
      prev.innerHTML = '<div style="font-size:.8rem;color:var(--text-mid);margin-bottom:8px">Backup de <strong>' + (bk.geradoEm ? new Date(bk.geradoEm).toLocaleString('pt-BR') : 'data desconhecida') + '</strong>' + (bk.geradoPor ? ' por ' + e(bk.geradoPor) : '') + '</div>' +
        '<div class="table-wrap" style="max-height:260px;overflow:auto;border:1px solid var(--border)"><table><thead><tr><th>Tabela</th><th class="mx-num">No arquivo</th><th class="mx-num">Novos</th><th class="mx-num">Alterados</th><th class="mx-num">Iguais</th></tr></thead><tbody>' + linhas + '</tbody></table></div>' +
        '<label style="display:flex;gap:8px;align-items:center;font-size:.8rem;color:var(--text-mid);margin:10px 0 4px"><input type="checkbox" id="mx-bk-copia" checked> Baixar uma cópia do estado atual antes de restaurar</label>' +
        '<label style="display:flex;gap:8px;align-items:center;font-size:.8rem;color:var(--text-mid);margin:4px 0 10px"><input type="checkbox" id="mx-bk-config"> Restaurar também as configurações (logos, textos, setores)</label>' +
        '<button class="btn btn-warning" ' + (totNovos + totAlt ? '' : 'disabled') + ' onclick="MX.restaurarBackup()">♻️ Restaurar ' + (totNovos + totAlt) + ' registro(s)</button>';
      prev.style.display = 'block';
    };
    r.readAsText(f);
  };

  MX.restaurarBackup = async function () {
    if (!isAdmin() || !_bkLido) return;
    if (!confirm('Restaurar o backup? Registros que faltam serão adicionados e os diferentes serão substituídos pela versão do arquivo, inclusive na nuvem. Nada será apagado.')) return;
    if (document.getElementById('mx-bk-copia')?.checked) baixarBackupJSON(true);
    const bk = _bkLido; let total = 0; const falhas = [];
    for (const [k, ls, tabela, rot] of TABELAS) {
      const doArquivo = bk.tabelas[k]; if (!Array.isArray(doArquivo)) continue;
      const atuais = dbList(k).slice();
      const idx = new Map(atuais.map((x, i) => [x.id, i]));
      const mudados = [];
      doArquivo.forEach(x => {
        if (!x || !x.id) return;
        if (!idx.has(x.id)) { atuais.push(x); mudados.push(x); }
        else if (JSON.stringify(atuais[idx.get(x.id)]) !== JSON.stringify(x)) { atuais[idx.get(x.id)] = x; mudados.push(x); }
      });
      if (!mudados.length) continue;
      try { if (typeof _remoteData !== 'undefined') _remoteData[k] = atuais; } catch (err) { /* ignora */ }
      try { localStorage.setItem(ls, JSON.stringify(atuais)); } catch (err) { console.warn('[MX] cota do navegador ao restaurar', k); }
      const ok = typeof salvarComFila === 'function' ? await salvarComFila(tabela, mudados, rot) : false;
      if (!ok) falhas.push(rot);
      total += mudados.length;
    }
    if (document.getElementById('mx-bk-config')?.checked && bk.config && typeof bk.config === 'object') {
      const cfg = Object.assign({}, safe(() => DB.config(), {}), bk.config);
      await safe(() => DB.saveConfig(cfg));
    }
    safe(() => DB.saveLog('Restauração', 'Restaurou backup de ' + (bk.geradoEm || '?') + ' (' + total + ' registro(s))', 'sistema', ''));
    toast(falhas.length ? '♻️ ' + total + ' registro(s) restaurado(s) neste computador. Envio à nuvem pendente para: ' + falhas.join(', ') + ' (nova tentativa automática).' : '♻️ ' + total + ' registro(s) restaurado(s) e enviados à nuvem.', falhas.length ? 'warning' : 'success');
    _bkLido = null;
    const inp = document.getElementById('mx-bk-arquivo'); if (inp) inp.value = '';
    const prev = document.getElementById('mx-bk-preview'); if (prev) { prev.style.display = 'none'; prev.innerHTML = ''; }
    safe(() => { if (typeof renderDashboard === 'function') renderDashboard(); });
    renderBackup();
  };

  // ===================== ATALHOS DE TECLADO =====================
  function instalarAtalhos() {
    document.addEventListener('keydown', ev => {
      const k = (ev.key || '').toLowerCase();
      if ((ev.ctrlKey || ev.metaKey) && k === 'k') {
        if (!sessionStorage.getItem('ferias_sessao')) return;
        ev.preventDefault();
        const bg = document.getElementById('mx-palette-bg');
        if (bg && bg.classList.contains('open')) fecharBusca(); else abrirBusca();
        return;
      }
      if (k === 'escape') {
        const bg = document.getElementById('mx-palette-bg');
        if (bg && bg.classList.contains('open')) { fecharBusca(); return; }
        const fi = document.getElementById('mx-ficha-bg');
        if (fi && fi.classList.contains('open')) { fecharFicha(); return; }
      }
      // "/" abre a busca quando não se está digitando em um campo
      if (k === '/' && !ev.ctrlKey && !ev.metaKey) {
        const t = ev.target; const tag = (t && t.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
        if (!sessionStorage.getItem('ferias_sessao') || document.querySelector('.modal-bg.open')) return;
        ev.preventDefault(); abrirBusca();
      }
    });
  }

  // ===================== INICIALIZAÇÃO =====================
  function iniciar() {
    safe(injetarModulos);
    safe(prepararMenu);
    safe(instalarGanchoShowTab);
    safe(instalarGanchoInit);
    safe(instalarAtalhos);
    setInterval(() => { if (sessionStorage.getItem('ferias_sessao')) safe(() => atualizarBadgePendencias()); }, 60000);
  }
  iniciar();
})();
