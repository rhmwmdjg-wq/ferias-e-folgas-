// Atlas Saúde — envio de ofício (PDF) por e-mail.
// O e-mail sai pela conta Yahoo da Coordenação de Atenção Primária (senha de app em segredo).
// Diferente do envio de atestados, aqui o navegador escolhe os destinatários. Por isso o
// envio só acontece com a CHAVE DE ENVIO (segredo OFICIO_ENVIO_CHAVE), além do limite diário,
// do bloqueio por tentativas erradas e da cópia de cada mensagem para a própria Coordenação.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import nodemailer from "npm:nodemailer@6.9.16";
import { createClient } from "npm:@supabase/supabase-js@2";

const REMETENTE = "atenprimaitac@yahoo.com.br";
const NOME_REMETENTE = "Atenção Primária Itacarambi";
const ORIGENS_PERMITIDAS = ["https://ferias-e-folgas.vercel.app"];
const TAMANHO_MAX = 8 * 1024 * 1024; // 8 MB
const MAX_DESTINATARIOS = 10;
const LIMITE_24H = 40;          // envios bem-sucedidos por dia
const LIMITE_ERROS_CHAVE = 8;   // tentativas com chave errada por hora

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
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

function limpar(texto: unknown, max: number): string {
  return String(texto ?? "").replace(/[\r\n\t]+/g, " ").replace(/[<>]/g, "").trim().slice(0, max);
}

function emailValido(e: string): boolean {
  return e.length <= 254 && /^[^\s@<>,;"'()\\]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e);
}

// Comparação em tempo constante (não revela a chave pelo tempo de resposta)
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

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return resposta(origin, 405, { ok: false, erro: "Método não permitido." });
  if (!origin || !ORIGENS_PERMITIDAS.includes(origin)) {
    return resposta(origin, 403, { ok: false, erro: "Origem não autorizada." });
  }

  const senha = (Deno.env.get("YAHOO_APP_PASSWORD") ?? "").replace(/\s+/g, "");
  const chaveCorreta = (Deno.env.get("OFICIO_ENVIO_CHAVE") ?? "").trim();
  if (!senha) return resposta(origin, 503, { ok: false, erro: "Envio ainda não configurado: falta a senha de aplicativo do Yahoo no Supabase." });
  if (chaveCorreta.length < 8) {
    return resposta(origin, 503, { ok: false, erro: "Envio ainda não liberado: cadastre o segredo OFICIO_ENVIO_CHAVE (mínimo de 8 caracteres) no painel do Supabase, em Edge Functions → Secrets." });
  }

  let dados: Record<string, unknown>;
  try {
    dados = await req.json();
  } catch (_e) {
    return resposta(origin, 400, { ok: false, erro: "Requisição inválida." });
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const codigo = limpar(dados.codigo, 80);
  const enviadoPor = limpar(dados.enviadoPor, 120);

  // Bloqueio temporário depois de várias chaves erradas
  const umaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: erros } = await db.from("atlas_oficio_envios")
    .select("id", { count: "exact", head: true }).eq("erro", "chave incorreta").gte("criado_em", umaHora);
  if ((erros ?? 0) >= LIMITE_ERROS_CHAVE) {
    return resposta(origin, 429, { ok: false, erro: "Muitas tentativas com a chave errada. Aguarde uma hora e tente de novo." });
  }
  if (!(await chaveConfere(String(dados.chave ?? "").trim(), chaveCorreta))) {
    await db.from("atlas_oficio_envios").insert({ codigo, enviado_por: enviadoPor || null, ok: false, erro: "chave incorreta" });
    return resposta(origin, 401, { ok: false, erro: "Chave de envio incorreta." });
  }

  const para = [...new Set((Array.isArray(dados.para) ? dados.para : []).map((e) => String(e ?? "").trim().toLowerCase()))].filter(Boolean);
  const assunto = limpar(dados.assunto, 200);
  const mensagem = String(dados.mensagem ?? "").replace(/[<>]/g, "").replace(/\r/g, "").trim().slice(0, 3000);
  const assinado = dados.assinado === true;
  const link = String(dados.link ?? "").trim();
  let nomeArquivo = limpar(dados.nomeArquivo, 100).replace(/[^\p{L}\p{N} ._()-]/gu, "_") || "oficio.pdf";
  if (!/\.pdf$/i.test(nomeArquivo)) nomeArquivo += ".pdf";
  const base64 = String(dados.pdfBase64 ?? "").replace(/^data:[^,]*,/, "");

  if (!para.length) return resposta(origin, 400, { ok: false, erro: "Marque pelo menos um e-mail." });
  if (para.length > MAX_DESTINATARIOS) return resposta(origin, 400, { ok: false, erro: `No máximo ${MAX_DESTINATARIOS} e-mails por envio.` });
  const invalido = para.find((e) => !emailValido(e));
  if (invalido) return resposta(origin, 400, { ok: false, erro: `E-mail inválido: ${invalido.slice(0, 80)}` });
  if (!codigo || !assunto) return resposta(origin, 400, { ok: false, erro: "Ofício sem número ou sem assunto." });
  if (!mensagem) return resposta(origin, 400, { ok: false, erro: "Escreva a mensagem do e-mail." });
  if (!base64) return resposta(origin, 400, { ok: false, erro: "PDF do ofício não recebido." });

  let pdf: Uint8Array;
  try {
    pdf = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  } catch (_e) {
    return resposta(origin, 400, { ok: false, erro: "Arquivo inválido." });
  }
  if (pdf.length > TAMANHO_MAX) return resposta(origin, 413, { ok: false, erro: "O PDF passa de 8 MB." });
  const ehPdf = pdf.length > 4 && pdf[0] === 0x25 && pdf[1] === 0x50 && pdf[2] === 0x44 && pdf[3] === 0x46; // %PDF
  if (!ehPdf) return resposta(origin, 400, { ok: false, erro: "O arquivo anexado não é um PDF." });

  // Limite diário, para a conta de e-mail não virar meio de disparo em massa
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: erroContagem } = await db.from("atlas_oficio_envios")
    .select("id", { count: "exact", head: true }).eq("ok", true).gte("criado_em", desde);
  if (erroContagem) {
    console.error("contagem:", erroContagem);
    return resposta(origin, 500, { ok: false, erro: "Falha interna ao registrar o envio." });
  }
  if ((count ?? 0) >= LIMITE_24H) {
    return resposta(origin, 429, { ok: false, erro: "Limite de envios das últimas 24 horas atingido. Tente mais tarde." });
  }

  const linhas = [mensagem, "", "--", "Coordenação de Atenção Primária à Saúde — Secretaria Municipal de Saúde de Itacarambi/MG"];
  if (assinado) linhas.push("O PDF em anexo está assinado digitalmente (certificado ICP-Brasil). A assinatura pode ser conferida no Adobe Reader ou em validar.iti.gov.br.");
  if (ORIGENS_PERMITIDAS.some((o) => link.startsWith(o + "/")) && link.length < 300 && !/\s/.test(link)) {
    linhas.push(`Conferência da autenticidade do documento: ${link}`);
  }

  const registro = { codigo, destinatarios: para, enviado_por: enviadoPor || null, arquivo: nomeArquivo, tamanho_bytes: pdf.length, assinado };
  try {
    const info = await nodemailer.createTransport({
      host: "smtp.mail.yahoo.com",
      port: 465,
      secure: true,
      auth: { user: REMETENTE, pass: senha },
    }).sendMail({
      from: { name: NOME_REMETENTE, address: REMETENTE },
      to: para,
      bcc: REMETENTE, // cópia na caixa da Coordenação: todo envio fica registrado lá
      replyTo: REMETENTE,
      subject: `${codigo} – ${assunto}`.slice(0, 240),
      text: linhas.join("\n"),
      attachments: [{ filename: nomeArquivo, content: pdf, contentType: "application/pdf" }],
    });
    await db.from("atlas_oficio_envios").insert({ ...registro, ok: true });
    return resposta(origin, 200, { ok: true, enviados: para, remetente: REMETENTE, id: info.messageId ?? null });
  } catch (e) {
    console.error("envio:", e);
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("atlas_oficio_envios").insert({ ...registro, ok: false, erro: msg.slice(0, 300) });
    const auth = /auth|535|credential|password/i.test(msg);
    return resposta(origin, 502, { ok: false, erro: auth ? "O Yahoo recusou o acesso. Confira a senha de aplicativo." : "Não foi possível enviar o e-mail agora. Tente novamente em instantes." });
  }
});
