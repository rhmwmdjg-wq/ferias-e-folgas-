// ===================== usabilidade.js =====================
// Melhorias de uso que não mudam regras do sistema:
//  1. Menu do usuário (rodapé compacto)
//  2. Favoritos no menu lateral
//  3. Campo de servidor com busca por nome ou matrícula
//  4. Rótulos de acessibilidade para botões só com ícone
(function () {
  'use strict';
  const UX = (window.UX = window.UX || {});
  const norm = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* cota */ } }
  };
  const safe = fn => { try { return fn(); } catch (err) { console.warn('[UX]', err); } };

  // ---------------------------------------------------------------
  // 1. MENU DO USUÁRIO
  // ---------------------------------------------------------------
  function menuUsuario(abrir) {
    const menu = document.getElementById('ux-user-menu');
    const btn = document.getElementById('ux-user-btn');
    if (!menu || !btn) return;
    const aberto = abrir == null ? !menu.classList.contains('open') : !!abrir;
    menu.classList.toggle('open', aberto);
    btn.setAttribute('aria-expanded', aberto ? 'true' : 'false');
  }
  UX.alternarMenuUsuario = () => menuUsuario();
  UX.fecharMenuUsuario = () => menuUsuario(false);
  document.addEventListener('click', ev => {
    const menu = document.getElementById('ux-user-menu');
    if (!menu || !menu.classList.contains('open')) return;
    if (ev.target.closest('#ux-user-menu') || ev.target.closest('#ux-user-btn')) return;
    menuUsuario(false);
  });
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape') return;
    const menu = document.getElementById('ux-user-menu');
    if (menu && menu.classList.contains('open')) { menuUsuario(false); const b = document.getElementById('ux-user-btn'); if (b) b.focus(); }
  });

  // ---------------------------------------------------------------
  // 2. FAVORITOS
  // ---------------------------------------------------------------
  const MAX_FAV = 6;
  let _favAssinatura = '';
  const favIds = () => LS.get('ux_favoritos', []).filter(id => typeof id === 'string');
  const botoesMenu = () => Array.from(document.querySelectorAll('#sidebar-tabs > .tab-btn[id^="tab-"]')).filter(b => b.id !== 'tab-sair');

  function alternarFavorito(id) {
    let favs = favIds();
    if (favs.includes(id)) favs = favs.filter(x => x !== id);
    else {
      if (favs.length >= MAX_FAV) { if (typeof toastMsg === 'function') toastMsg('Você pode fixar até ' + MAX_FAV + ' telas nos favoritos.', 'warning'); return; }
      favs.push(id);
    }
    LS.set('ux_favoritos', favs);
    renderFavoritos(true);
  }
  UX.alternarFavorito = alternarFavorito;

  function instalarEstrelas() {
    botoesMenu().forEach(b => {
      if (b.querySelector('.ux-star')) return;
      const st = document.createElement('span');
      st.className = 'ux-star';
      st.setAttribute('role', 'button');
      st.setAttribute('tabindex', '0');
      st.innerHTML = '<i class="fa-solid fa-star" aria-hidden="true"></i>';
      const acionar = ev => { ev.preventDefault(); ev.stopPropagation(); alternarFavorito(b.id); };
      st.addEventListener('click', acionar);
      st.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') acionar(ev); });
      b.appendChild(st);
    });
  }

  function renderFavoritos(forcar) {
    const tabs = document.getElementById('sidebar-tabs');
    if (!tabs) return;
    instalarEstrelas();
    const favs = favIds();
    const visiveis = favs.map(id => document.getElementById(id)).filter(b => b && b.style.display !== 'none');

    // marca as estrelas
    botoesMenu().forEach(b => {
      const st = b.querySelector('.ux-star'); if (!st) return;
      const on = favs.includes(b.id);
      const nome = ((b.querySelector('.tab-label') || b).textContent || '').trim();
      st.classList.toggle('on', on);
      st.setAttribute('aria-pressed', on ? 'true' : 'false');
      st.setAttribute('aria-label', (on ? 'Remover dos favoritos: ' : 'Fixar nos favoritos: ') + nome);
      st.title = on ? 'Remover dos favoritos' : 'Fixar nos favoritos';
    });

    // só redesenha a faixa quando algo mudou (nome, contador, tela ativa)
    const assinatura = visiveis.map(b => {
      const bd = b.querySelector('.badge');
      return b.id + ':' + (bd && bd.style.display !== 'none' ? bd.textContent.trim() : '') + ':' + (b.classList.contains('active') ? 1 : 0);
    }).join('|');
    if (!forcar && assinatura === _favAssinatura) return;
    _favAssinatura = assinatura;

    let box = document.getElementById('ux-favs');
    if (!visiveis.length) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'ux-favs'; box.className = 'ux-favs';
      box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Favoritos');
      tabs.insertBefore(box, tabs.firstChild);
    }
    box.innerHTML = '<div class="ux-favs-label"><i class="fa-solid fa-star" aria-hidden="true"></i> Favoritos</div>' +
      visiveis.map(b => {
        const nome = ((b.querySelector('.tab-label') || b).textContent || '').trim();
        const ic = (Array.from(b.querySelectorAll('i')).find(i => !i.closest('.ux-star')) || {}).className || 'fa-solid fa-square';
        const bd = b.querySelector('.badge');
        const badge = bd && bd.style.display !== 'none' && bd.textContent.trim() ? '<span class="badge" style="' + esc(bd.getAttribute('style') || '') + '">' + esc(bd.textContent.trim()) + '</span>' : '';
        return '<button type="button" class="tab-btn ux-fav-btn' + (b.classList.contains('active') ? ' active' : '') + '" data-alvo="' + esc(b.id) + '">' +
          '<i class="' + esc(ic) + '" aria-hidden="true"></i><span class="tab-label">' + esc(nome) + '</span>' + badge + '</button>';
      }).join('');
    box.querySelectorAll('.ux-fav-btn').forEach(f => f.addEventListener('click', () => {
      const alvo = document.getElementById(f.dataset.alvo); if (alvo) alvo.click();
      setTimeout(() => renderFavoritos(), 60);
    }));
  }
  UX.renderFavoritos = renderFavoritos;

  // ---------------------------------------------------------------
  // 3. CAMPO DE SERVIDOR COM BUSCA
  //    O <select> original continua existindo (escondido) e continua sendo
  //    a fonte da verdade: todo o restante do sistema funciona igual.
  // ---------------------------------------------------------------
  const SELECTS_SERVIDOR = ['fg-srv-cred', 'fg-srv-deb', 'fg-hist-srv', 'bh-srv', 'bh-ajuste-srv', 'bh-saldo-srv',
    'bh-hist-srv', 'fp-servidor', 'rel-srv-sel', 'ev-add-srv', 'ep-servidor', 'aut-servidor', 'pe-srv'];
  const descValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  let _listaAberta = null;

  function dadosServidor(id) {
    try { return (typeof DB !== 'undefined' && DB.servidores) ? DB.servidores().find(s => s.id === id) : null; } catch (e) { return null; }
  }

  function instalarCombo(sel) {
    if (!sel || sel.dataset.uxCombo) return;
    sel.dataset.uxCombo = '1';

    const wrap = document.createElement('div');
    wrap.className = 'ux-combo';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ux-combo-input';
    input.autocomplete = 'off';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.placeholder = 'Digite o nome ou a matrícula...';
    const lbl = sel.closest('.field') && sel.closest('.field').querySelector('label');
    input.setAttribute('aria-label', lbl ? lbl.textContent.replace('*', '').trim() : 'Servidor');
    const limpar = document.createElement('button');
    limpar.type = 'button'; limpar.className = 'ux-combo-clear'; limpar.textContent = '✕';
    limpar.setAttribute('aria-label', 'Limpar servidor selecionado'); limpar.title = 'Limpar';
    const lista = document.createElement('div');
    lista.className = 'ux-combo-list'; lista.setAttribute('role', 'listbox');
    lista.id = 'ux-lista-' + sel.id; input.setAttribute('aria-controls', lista.id);

    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(input); wrap.appendChild(limpar); wrap.appendChild(sel);
    document.body.appendChild(lista);
    sel.classList.add('ux-combo-native');
    sel.setAttribute('tabindex', '-1'); sel.setAttribute('aria-hidden', 'true');

    let itens = [], selIdx = 0;
    const opcoes = () => Array.from(sel.options).filter(o => o.value !== '');
    const vazia = () => Array.from(sel.options).find(o => o.value === '');

    function sincronizar(forcar) {
      const o = sel.options[sel.selectedIndex];
      const temValor = !!(o && o.value !== '');
      if (forcar === true || document.activeElement !== input) input.value = temValor ? o.textContent.trim() : '';
      const v = vazia();
      input.placeholder = (v && v.textContent.trim() && !/^selecione/i.test(v.textContent.trim())) ? v.textContent.trim() + ' — digite para buscar' : 'Digite o nome ou a matrícula...';
      wrap.classList.toggle('tem-valor', temValor);
      input.disabled = sel.disabled;
    }

    function escolher(valor) {
      descValue.set.call(sel, valor);
      fechar();
      sincronizar(true);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function posicionar() {
      const r = input.getBoundingClientRect();
      const abaixo = window.innerHeight - r.bottom;
      const larg = Math.max(r.width, Math.min(320, window.innerWidth - 16));
      lista.style.width = larg + 'px';
      lista.style.left = Math.max(8, Math.min(r.left, window.innerWidth - larg - 8)) + 'px';
      if (abaixo < 220 && r.top > abaixo) { lista.style.top = ''; lista.style.bottom = (window.innerHeight - r.top + 4) + 'px'; }
      else { lista.style.bottom = ''; lista.style.top = (r.bottom + 4) + 'px'; }
    }

    function desenhar() {
      const q = norm(input.value).trim();
      const atual = sel.options[sel.selectedIndex];
      const semFiltro = !q || (atual && atual.value !== '' && norm(atual.textContent).trim() === q);
      itens = opcoes().map(o => {
        const s = dadosServidor(o.value) || {};
        const texto = o.textContent.trim();
        const alvo = norm(texto + ' ' + (s.matricula || '') + ' ' + (s.setor || '') + ' ' + (s.cargo || ''));
        let pts = 1;
        if (!semFiltro) {
          const n = norm(s.nome || texto);
          if (n.startsWith(q)) pts = 100;
          else if (n.split(' ').some(p => p.startsWith(q))) pts = 80;
          else if (String(s.matricula || '') === q) pts = 95;
          else if (String(s.matricula || '').startsWith(q)) pts = 70;
          else if (alvo.includes(q)) pts = 40;
          else pts = 0;
        }
        return { o, s, texto, pts };
      }).filter(x => x.pts > 0);
      if (!semFiltro) itens.sort((a, b) => b.pts - a.pts || a.texto.localeCompare(b.texto));
      const total = itens.length;
      itens = itens.slice(0, 60);
      if (selIdx >= itens.length) selIdx = 0;
      lista.innerHTML = itens.length
        ? itens.map((x, i) => '<div class="ux-combo-item' + (i === selIdx ? ' sel' : '') + '" role="option" id="' + lista.id + '-' + i + '" data-i="' + i + '" aria-selected="' + (i === selIdx) + '">' +
            '<div class="ux-ci-nome">' + esc((x.s && x.s.nome) || x.texto) + '</div>' +
            (x.s && (x.s.matricula || x.s.setor) ? '<div class="ux-ci-sub">' + esc([x.s.matricula ? 'Mat. ' + x.s.matricula : '', x.s.setor || '', x.s.cargo || ''].filter(Boolean).join(' · ')) + '</div>' : '') +
            '</div>').join('') + (total > itens.length ? '<div class="ux-combo-mais">Mostrando 60 de ' + total + '. Continue digitando para refinar.</div>' : '')
        : '<div class="ux-combo-vazio">Nenhum servidor encontrado' + (opcoes().length ? '' : ' nesta lista') + '.</div>';
      input.setAttribute('aria-activedescendant', itens.length ? lista.id + '-' + selIdx : '');
    }

    function abrir() {
      if (_listaAberta && _listaAberta !== fechar) _listaAberta();
      _listaAberta = fechar;
      selIdx = 0;
      desenhar(); posicionar();
      lista.classList.add('open');
      input.setAttribute('aria-expanded', 'true');
    }
    function fechar() {
      lista.classList.remove('open');
      input.setAttribute('aria-expanded', 'false');
      if (_listaAberta === fechar) _listaAberta = null;
    }
    function marcar() {
      lista.querySelectorAll('.ux-combo-item').forEach(el => {
        const on = +el.dataset.i === selIdx;
        el.classList.toggle('sel', on); el.setAttribute('aria-selected', on);
        if (on) el.scrollIntoView({ block: 'nearest' });
      });
      input.setAttribute('aria-activedescendant', itens.length ? lista.id + '-' + selIdx : '');
    }

    input.addEventListener('focus', () => { input.select(); abrir(); });
    input.addEventListener('click', () => { if (!lista.classList.contains('open')) abrir(); });
    input.addEventListener('input', () => { selIdx = 0; if (!lista.classList.contains('open')) abrir(); else { desenhar(); posicionar(); } });
    input.addEventListener('keydown', ev => {
      const aberta = lista.classList.contains('open');
      if (ev.key === 'ArrowDown') { ev.preventDefault(); if (!aberta) abrir(); else { selIdx = Math.min(itens.length - 1, selIdx + 1); marcar(); } }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); selIdx = Math.max(0, selIdx - 1); marcar(); }
      else if (ev.key === 'Enter') { if (aberta && itens[selIdx]) { ev.preventDefault(); ev.stopPropagation(); escolher(itens[selIdx].o.value); } }
      else if (ev.key === 'Escape') { if (aberta) { ev.preventDefault(); ev.stopPropagation(); fechar(); sincronizar(true); input.select(); } }
      else if (ev.key === 'Tab') { fechar(); }
    });
    input.addEventListener('blur', () => { setTimeout(() => { if (document.activeElement !== input) { fechar(); sincronizar(); } }, 150); });
    lista.addEventListener('mousedown', ev => {
      ev.preventDefault(); // mantém o foco no campo
      const el = ev.target.closest('.ux-combo-item');
      if (el && itens[+el.dataset.i]) { escolher(itens[+el.dataset.i].o.value); input.blur(); }
    });
    limpar.addEventListener('click', () => { if (vazia()) escolher(''); input.value = ''; input.focus(); });

    // Mantém o campo em dia quando o sistema muda o <select> por conta própria
    Object.defineProperty(sel, 'value', {
      configurable: true,
      get() { return descValue.get.call(this); },
      set(v) { descValue.set.call(this, v); sincronizar(true); }
    });
    sel.addEventListener('change', () => sincronizar());
    new MutationObserver(() => { sincronizar(); if (lista.classList.contains('open')) desenhar(); })
      .observe(sel, { childList: true, attributes: true, attributeFilter: ['disabled'] });
    sincronizar();
  }

  function instalarCombos() {
    SELECTS_SERVIDOR.forEach(id => safe(() => instalarCombo(document.getElementById(id))));
  }
  // Rolar a página fecha a lista (rolar dentro da própria lista, não).
  window.addEventListener('scroll', ev => {
    if (!_listaAberta) return;
    if (ev.target && ev.target.classList && ev.target.classList.contains('ux-combo-list')) return;
    _listaAberta();
  }, true);
  window.addEventListener('resize', () => { if (_listaAberta) _listaAberta(); });

  // ---------------------------------------------------------------
  // 4. ACESSIBILIDADE: rótulos para botões só com ícone e campos
  // ---------------------------------------------------------------
  const ROTULOS = [
    [/🗑|fa-trash/, 'Excluir'], [/✏|fa-pen|fa-edit/, 'Editar'], [/👁|fa-eye/, 'Ver detalhes'],
    [/🖨|fa-print/, 'Imprimir'], [/🔑|fa-key/, 'Senha'], [/💬|fa-whatsapp|fa-comment/, 'Enviar mensagem'],
    [/📄|fa-file/, 'Documento'], [/💾|fa-download|fa-floppy/, 'Salvar ou baixar'], [/🔄|fa-rotate|fa-sync/, 'Atualizar'],
    [/➕|^\+$|fa-plus/, 'Adicionar'], [/×|✕|✖|fa-xmark|fa-times/, 'Fechar'], [/‹|fa-chevron-left|fa-angle-left|←/, 'Anterior'],
    [/›|fa-chevron-right|fa-angle-right|→/, 'Próximo'], [/🔍|fa-magnifying-glass|fa-search/, 'Buscar'],
    [/☰|fa-bars/, 'Abrir menu'], [/📷|fa-camera/, 'Foto'], [/✅|fa-check/, 'Confirmar'], [/📋|fa-clipboard/, 'Copiar ou listar']
  ];
  const temTexto = t => /[A-Za-zÀ-ÿ0-9]{2,}/.test(t || '');

  function rotular(raiz) {
    (raiz || document).querySelectorAll('button, a[onclick], [role="button"]').forEach(el => {
      if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return;
      const txt = (el.textContent || '').trim();
      if (temTexto(txt)) return;
      let rot = el.getAttribute('title');
      if (!rot) {
        const pista = txt + ' ' + Array.from(el.querySelectorAll('i')).map(i => i.className).join(' ');
        const achado = ROTULOS.find(r => r[0].test(pista));
        rot = achado ? achado[1] : '';
        if (rot) el.setAttribute('title', rot);
      }
      if (rot) el.setAttribute('aria-label', rot);
    });
    // liga cada rótulo de formulário ao seu campo
    (raiz || document).querySelectorAll('.field > label:not([for])').forEach(lb => {
      const campos = lb.parentNode.querySelectorAll('input:not([type=hidden]), select:not(.ux-combo-native), textarea');
      if (campos.length !== 1) return;
      const c = campos[0];
      if (!c.id) c.id = 'ux-campo-' + Math.random().toString(36).slice(2, 9);
      lb.htmlFor = c.id;
    });
  }

  // ---------------------------------------------------------------
  // INICIALIZAÇÃO
  // ---------------------------------------------------------------
  function ciclo() {
    safe(instalarCombos);
    safe(() => renderFavoritos());
  }
  function iniciar() {
    ciclo();
    safe(() => rotular());
    setInterval(ciclo, 2500);
    let pend = null;
    new MutationObserver(() => { clearTimeout(pend); pend = setTimeout(() => safe(() => rotular()), 600); })
      .observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
