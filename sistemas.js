// Módulo Sistemas Parceiros.
// Atalhos para sistemas externos usados na rotina da APS / SMS de Itacarambi.
// Para incluir um novo sistema, basta acrescentar um item na lista abaixo.

const SISTEMAS_PARCEIROS = [
  {
    nome: 'Monitora APS Itacarambi',
    desc: 'Painel de monitoramento dos indicadores da Atenção Primária do município',
    icone: 'fa-chart-pie',
    cor: '#4d8bff',
    grupo: 'Sistemas Municipais',
    url: 'https://rhmwmdjg-wq.github.io/monitora-aps-itacarambi/?v=ia'
  },
  {
    nome: 'Estoque SMS Itacarambi',
    desc: 'Controle de estoque e insumos da Secretaria Municipal de Saúde',
    icone: 'fa-boxes-stacked',
    cor: '#22c55e',
    grupo: 'Sistemas Municipais',
    url: 'https://itacarambi-sms-estoque.vercel.app/'
  },
  {
    nome: 'Vivver – Gestão em Saúde',
    desc: 'Sistema de gestão em saúde de Itacarambi (Vivver)',
    icone: 'fa-hospital',
    cor: '#06b6d4',
    grupo: 'Sistemas Municipais',
    url: 'https://www.itacarambi-mg.vivver.com/'
  },
  {
    nome: 'e-SUS APS (PEC) – Vivver',
    desc: 'Prontuário Eletrônico do Cidadão da Atenção Primária',
    icone: 'fa-notes-medical',
    cor: '#0ea5e9',
    grupo: 'Sistemas Municipais',
    url: 'https://itacarambi-mg-esus.vivver.com/'
  },
  {
    nome: 'Secullum Ponto Web',
    desc: 'Controle de ponto eletrônico dos servidores (Secullum RH)',
    icone: 'fa-fingerprint',
    cor: '#f59e0b',
    grupo: 'Sistemas Municipais',
    url: 'https://www.secullum.com.br/pt/produtos/secullum-rh/ponto#/home'
  },
  {
    nome: 'Radar SES-MG',
    desc: 'Plataforma de monitoramento da Secretaria de Estado de Saúde de Minas Gerais',
    icone: 'fa-satellite-dish',
    cor: '#a855f7',
    grupo: 'Estado de Minas Gerais',
    url: 'https://radar.saude.mg.gov.br/'
  },
  {
    nome: 'SEI! MG – Usuário Externo',
    desc: 'Sistema Eletrônico de Informações do Governo de Minas (acesso externo)',
    icone: 'fa-folder-open',
    cor: '#8b5cf6',
    grupo: 'Estado de Minas Gerais',
    url: 'https://www.sei.mg.gov.br/sei/controlador_externo.php?acao=usuario_externo_logar&id_orgao_acesso_externo=0'
  },
  {
    nome: 'NUPAD – Teste do Pezinho',
    desc: 'Núcleo de Ações e Pesquisa em Apoio Diagnóstico (Faculdade de Medicina da UFMG)',
    icone: 'fa-baby',
    cor: '#ec4899',
    grupo: 'Estado de Minas Gerais',
    url: 'https://site.nupad.medicina.ufmg.br/'
  },
  {
    nome: 'CadSUS – Cartão Nacional de Saúde',
    desc: 'Consulta e cadastro de usuários do SUS (Ministério da Saúde)',
    icone: 'fa-id-card',
    cor: '#10b981',
    grupo: 'Ministério da Saúde',
    url: 'https://cadastro.saude.gov.br/novocartao/restrito/usuarioConsulta.jsp'
  },
  {
    nome: 'SISLOGLAB',
    desc: 'Sistema de Controle Logístico de Insumos Laboratoriais (testes rápidos IST/HIV)',
    icone: 'fa-vial',
    cor: '#ef4444',
    grupo: 'Ministério da Saúde',
    url: 'https://sisloglab.aids.gov.br/default.php'
  },
  {
    nome: 'RNDS – Fabricantes de Imunobiológicos (PNI)',
    desc: 'Tabela de fabricantes de vacinas da Rede Nacional de Dados em Saúde (Simplifier)',
    icone: 'fa-syringe',
    cor: '#14b8a6',
    grupo: 'Ministério da Saúde',
    url: 'https://simplifier.net/RedeNacionaldeDadosemSaude/CodeSystem-BRFabricantePNI/~overview'
  }
];

function abrirSistemaParceiro(idx) {
  const s = SISTEMAS_PARCEIROS[idx];
  if (!s) return;
  const w = window.open(s.url, '_blank', 'noopener');
  if (w) w.opener = null;
}

function renderSistemasParceiros() {
  const container = document.getElementById('sistemas-grid');
  if (!container) return;
  const busca = (document.getElementById('busca-sistema')?.value || '').toLowerCase().trim();
  const grupos = {};
  SISTEMAS_PARCEIROS.forEach(function(s, i) {
    const alvo = (s.nome + ' ' + s.desc + ' ' + s.grupo).toLowerCase();
    if (busca && !alvo.includes(busca)) return;
    (grupos[s.grupo] = grupos[s.grupo] || []).push({ s: s, i: i });
  });
  const nomes = Object.keys(grupos);
  if (!nomes.length) {
    container.innerHTML = '<div class="sp-vazio">Nenhum sistema encontrado.</div>';
    return;
  }
  container.innerHTML = nomes.map(function(g) {
    return '<div class="sp-grupo-titulo">' + g + '</div>' +
      '<div class="sp-grid">' + grupos[g].map(function(o) {
        const s = o.s;
        return '<button type="button" class="sp-card" style="--sp-cor:' + s.cor + '" onclick="abrirSistemaParceiro(' + o.i + ')" title="Abrir ' + s.nome + ' em nova aba">' +
          '<span class="sp-icone"><i class="fa-solid ' + s.icone + '"></i></span>' +
          '<span class="sp-textos"><span class="sp-nome">' + s.nome + '</span>' +
          '<span class="sp-desc">' + s.desc + '</span></span>' +
          '<i class="fa-solid fa-arrow-up-right-from-square sp-seta"></i>' +
          '</button>';
      }).join('') + '</div>';
  }).join('');
}
