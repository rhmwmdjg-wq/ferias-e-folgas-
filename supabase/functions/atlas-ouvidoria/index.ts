// Atlas Saúde — Ouvidoria anônima (sugestões, reclamações e denúncias).
//
// COMPROMISSO DE ANONIMATO: esta função nunca guarda, nem registra em log, nada que
// identifique quem escreveu. Não lê o IP, o cabeçalho User-Agent, cookies nem login.
// O que entra na tabela é só: tipo, unidade de saúde, texto, data/hora e protocolo.
// O protocolo é sorteado na hora e serve para a própria pessoa acompanhar depois,
// sem precisar dizer quem é.
//
// Ações (campo "acao"):
//   unidades  — lista as unidades do formulário (público)
//   enviar    — grava a manifestação e devolve o protocolo (público)
//   consultar — devolve a situação de um protocolo (público)
//   listar    — lista tudo para a Coordenação (exige a chave)
//   situacao  — muda situação / nota interna (exige a chave)
//   unidades_salvar — grava a lista de unidades (exige a chave)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// O formulário público mora em endereço próprio, separado do sistema interno.
const ORIGEM_FORMULARIO = "https://ouvidoria-itacarambi.vercel.app";
const ORIGEM_SISTEMA = "https://ferias-e-folgas.vercel.app";
const ORIGENS_PERMITIDAS = [ORIGEM_FORMULARIO, ORIGEM_SISTEMA];
// Ler as manifestações e mexer nelas só a partir do sistema (além da chave).
const ORIGENS_COORDENACAO = [ORIGEM_SISTEMA];
const MSG_MIN = 15;
const MSG_MAX = 4000;
const LIMITE_HORA = 80;   // manifestações por hora no município todo (guarda contra enxurrada)
const TIPOS = ["sugestao", "reclamacao", "denuncia"];
const SITUACOES = ["nova", "em_analise", "providencia", "concluida", "arquivada"];

function cors(origin: string | null) {
  const ok = origin && ORIGENS_PERMITIDAS.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin! : ORIGENS_PERMITIDAS[0],
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function resposta(origin: string | null, status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      ...cors(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function limpar(texto: unknown, max: number): string {
  return String(texto ?? "").replace(/[\r\n\t]+/g, " ").replace(/[<>]/g, "").trim().slice(0, max);
}

// Protocolo curto, sorteado, sem relação com quem enviou nem com a ordem de chegada
function novoProtocolo(): string {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem I, O, 0 e 1 (confusão na leitura)
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const sorteio = Array.from(bytes).map((b) => letras[b % letras.length]).join("");
  return "OUV-" + new Date().getFullYear() + "-" + sorteio.slice(0, 4) + "-" + sorteio.slice(4, 8);
}

async function chaveConfere(informada: string, correta: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(informada)),
    crypto.subtle.digest("SHA-256", enc.encode(correta)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let dif = 0;
  for (let i = 0; i < x.length; i++) dif |= x[i] ^ y[i];
  return dif === 0;
}

function chaveEsperada(): string {
  // Chave própria da ouvidoria; se ainda não existir, vale a mesma chave de envio dos ofícios
  const propria = (Deno.env.get("OUVIDORIA_CHAVE") ?? "").trim();
  if (propria.length >= 8) return propria;
  return (Deno.env.get("OFICIO_ENVIO_CHAVE") ?? "").trim();
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return resposta(origin, 405, { ok: false, erro: "Método não permitido." });
  if (!origin || !ORIGENS_PERMITIDAS.includes(origin)) {
    return resposta(origin, 403, { ok: false, erro: "Origem não autorizada." });
  }

  let dados: Record<string, unknown>;
  try {
    dados = await req.json();
  } catch (_e) {
    return resposta(origin, 400, { ok: false, erro: "Requisição inválida." });
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const acao = limpar(dados.acao, 30);
  const publicas = ["unidades", "enviar", "consultar"];

  // Ações da Coordenação exigem a chave e só valem a partir do sistema
  if (!publicas.includes(acao)) {
    if (!ORIGENS_COORDENACAO.includes(origin)) {
      return resposta(origin, 403, { ok: false, erro: "Esta ação só é permitida pelo sistema." });
    }
    const correta = chaveEsperada();
    if (correta.length < 8) {
      return resposta(origin, 503, { ok: false, erro: "Ouvidoria ainda não liberada: cadastre o segredo OUVIDORIA_CHAVE no painel do Supabase, em Edge Functions → Secrets." });
    }
    if (!(await chaveConfere(String(dados.chave ?? "").trim(), correta))) {
      return resposta(origin, 401, { ok: false, erro: "Chave de acesso incorreta." });
    }
  }

  // ---------- lista de unidades do formulário ----------
  if (acao === "unidades") {
    const { data, error } = await db.from("atlas_ouvidoria_unidades").select("nome, ordem").order("ordem").order("nome");
    if (error) { console.error("unidades:", error.message); return resposta(origin, 500, { ok: false, erro: "Não foi possível carregar as unidades." }); }
    return resposta(origin, 200, { ok: true, unidades: (data ?? []).map((u) => u.nome) });
  }

  if (acao === "unidades_salvar") {
    const lista = (Array.isArray(dados.unidades) ? dados.unidades : [])
      .map((u) => limpar(u, 120)).filter(Boolean).slice(0, 200);
    await db.from("atlas_ouvidoria_unidades").delete().neq("nome", "");
    if (lista.length) {
      const { error } = await db.from("atlas_ouvidoria_unidades")
        .insert(lista.map((nome, i) => ({ nome, ordem: i })));
      if (error) { console.error("unidades_salvar:", error.message); return resposta(origin, 500, { ok: false, erro: "Não foi possível salvar as unidades." }); }
    }
    return resposta(origin, 200, { ok: true, total: lista.length });
  }

  // ---------- recebimento da manifestação (público e anônimo) ----------
  if (acao === "enviar") {
    const tipo = limpar(dados.tipo, 20);
    const unidade = limpar(dados.unidade, 120);
    const mensagem = String(dados.mensagem ?? "").replace(/[<>]/g, "").replace(/\r/g, "").trim().slice(0, MSG_MAX);

    if (!TIPOS.includes(tipo)) return resposta(origin, 400, { ok: false, erro: "Escolha se é sugestão, reclamação ou denúncia." });
    if (!unidade) return resposta(origin, 400, { ok: false, erro: "Informe a unidade de saúde." });
    if (mensagem.length < MSG_MIN) return resposta(origin, 400, { ok: false, erro: `Descreva com um pouco mais de detalhe (pelo menos ${MSG_MIN} caracteres).` });
    // Campo-armadilha: fica escondido no formulário, só robô preenche
    if (limpar(dados.armadilha, 10)) return resposta(origin, 200, { ok: true, protocolo: novoProtocolo() });

    const umaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await db.from("atlas_ouvidoria")
      .select("id", { count: "exact", head: true }).gte("criado_em", umaHora);
    if ((count ?? 0) >= LIMITE_HORA) {
      return resposta(origin, 429, { ok: false, erro: "A ouvidoria recebeu muitas mensagens na última hora. Tente novamente mais tarde." });
    }

    // Até 5 tentativas, no caso improvável de o protocolo sorteado já existir
    for (let i = 0; i < 5; i++) {
      const protocolo = novoProtocolo();
      const { error } = await db.from("atlas_ouvidoria").insert({ protocolo, tipo, unidade, mensagem });
      if (!error) return resposta(origin, 201, { ok: true, protocolo });
      if (error.code !== "23505") {
        console.error("enviar:", error.message);
        return resposta(origin, 500, { ok: false, erro: "Não foi possível registrar agora. Tente novamente em instantes." });
      }
    }
    return resposta(origin, 500, { ok: false, erro: "Não foi possível registrar agora. Tente novamente em instantes." });
  }

  // ---------- a própria pessoa acompanha pelo protocolo ----------
  if (acao === "consultar") {
    const protocolo = limpar(dados.protocolo, 40).toUpperCase();
    if (!protocolo) return resposta(origin, 400, { ok: false, erro: "Informe o protocolo." });
    const { data, error } = await db.from("atlas_ouvidoria")
      .select("protocolo, tipo, unidade, criado_em, situacao").eq("protocolo", protocolo).maybeSingle();
    if (error) { console.error("consultar:", error.message); return resposta(origin, 500, { ok: false, erro: "Não foi possível consultar agora." }); }
    if (!data) return resposta(origin, 404, { ok: false, erro: "Protocolo não encontrado." });
    return resposta(origin, 200, { ok: true, registro: data });
  }

  // ---------- lista para a Coordenação ----------
  if (acao === "listar") {
    let q = db.from("atlas_ouvidoria")
      .select("id, protocolo, criado_em, tipo, unidade, mensagem, situacao, nota_interna, atualizado_em")
      .order("criado_em", { ascending: false }).limit(2000);
    const unidade = limpar(dados.unidade, 120);
    const tipo = limpar(dados.tipo, 20);
    const de = limpar(dados.de, 30);
    const ate = limpar(dados.ate, 30);
    const situacao = limpar(dados.situacao, 20);
    if (unidade) q = q.eq("unidade", unidade);
    if (TIPOS.includes(tipo)) q = q.eq("tipo", tipo);
    if (SITUACOES.includes(situacao)) q = q.eq("situacao", situacao);
    if (de) q = q.gte("criado_em", de);
    if (ate) q = q.lte("criado_em", ate);
    const { data, error } = await q;
    if (error) { console.error("listar:", error.message); return resposta(origin, 500, { ok: false, erro: "Não foi possível carregar as manifestações." }); }
    return resposta(origin, 200, { ok: true, registros: data ?? [] });
  }

  // ---------- situação e nota interna ----------
  if (acao === "situacao") {
    const id = limpar(dados.id, 40);
    const situacao = limpar(dados.situacao, 20);
    const nota = String(dados.nota ?? "").replace(/[<>]/g, "").trim().slice(0, 2000);
    if (!id) return resposta(origin, 400, { ok: false, erro: "Registro não informado." });
    const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
    if (situacao) {
      if (!SITUACOES.includes(situacao)) return resposta(origin, 400, { ok: false, erro: "Situação inválida." });
      patch.situacao = situacao;
    }
    if (dados.nota !== undefined) patch.nota_interna = nota || null;
    const { error } = await db.from("atlas_ouvidoria").update(patch).eq("id", id);
    if (error) { console.error("situacao:", error.message); return resposta(origin, 500, { ok: false, erro: "Não foi possível atualizar." }); }
    return resposta(origin, 200, { ok: true });
  }

  return resposta(origin, 400, { ok: false, erro: "Ação desconhecida." });
});
