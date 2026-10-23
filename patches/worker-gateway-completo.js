/* ---------------------------------------------------------------------------
   Worker pontoimp-gateway — arquivo INTEIRO, já com as rotas novas.

   É o mesmo código que está no ar hoje, mais: /me/solicitacao,
   /me/solicitacoes, /me/ponto, /me/inconsistencias, /me/inconsistencia,
   /me/api (todas as telas do app oficial, presas à lista ROTAS_APP),
   /me/endereco e /auth/recuperar. Nada do que já funcionava mudou.

   Como usar: Cloudflare → Workers & Pages → pontoimp-gateway → Edit code.
   Apaga tudo o que está lá, cola isto no lugar, Deploy. Instruções passo a
   passo no README desta pasta.
   --------------------------------------------------------------------------- */

const SECULLUM = "https://pontowebapp.secullum.com.br/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const json = (code, obj) => new Response(
  typeof obj === "string" ? obj : JSON.stringify(obj),
  { status: code, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS } }
);

/* ---- sessão cifrada no próprio token ---- */

async function keyFrom(secret) {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const ub64u = (s) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
};

async function cifrar(obj, secret) {
  const key = await keyFrom(secret), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.length);
  return b64u(out);
}

async function decifrar(token, secret) {
  const key = await keyFrom(secret), raw = ub64u(token);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12));
  return JSON.parse(new TextDecoder().decode(pt));
}

/* ---- conversa com o Secullum ---- */

const basic = (s) => "Basic " + btoa(`${s.usuario}:${s.senha}:${s.tipo}`);

async function secullum(path, { method = "GET", body, sess, banco } = {}) {
  const b = banco ?? sess?.banco;
  const headers = {
    "User-Agent": UA,
    "Accept-Language": "pt-BR",
    "pragma": "no-cache",
    "cache-control": "no-cache",
  };
  if (sess) headers["Authorization"] = basic(sess);
  if (body) headers["Content-Type"] = "application/json";
  const r = await fetch(SECULLUM + b + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, txt: await r.text() };
}

const passthru = (r) => json(r.status, r.txt);

/* Cartão em PDF, arquivos do RH e fotos não são texto: ler como .text()
   corromperia os bytes. Aqui a resposta passa crua, com o tipo original. */
async function secullumBruto(path, { method = "GET", body, sess } = {}) {
  const headers = {
    "User-Agent": UA,
    "Accept-Language": "pt-BR",
    "pragma": "no-cache",
    "cache-control": "no-cache",
    "Authorization": basic(sess),
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(SECULLUM + sess.banco + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const passthruBinario = (r) => new Response(r.body, {
  status: r.status,
  headers: { "Content-Type": r.headers.get("Content-Type") || "application/json; charset=utf-8", ...CORS },
});

/* Rotas que o app oficial (Secullum RH 1.45.0) chama, tiradas do bytecode.
   Só o que é do próprio funcionário ou do gestor sobre a equipe dele — o
   Secullum ainda confere a permissão de cada uma do lado de lá. */
const SEG = "[^/?#]+";
const ROTAS_APP = [
  ["GET", `/Funcionarios/${SEG}(/${SEG}){0,3}`],
  ["GET", `/Funcionarios/DadosAdicionais/${SEG}`],
  ["GET", "/Funcionarios/ListarFuncionariosGerente"],
  ["POST", "/Funcionarios"],
  ["POST", "/Funcionarios/DeletarConta"],
  ["POST", "/Funcionarios/SalvarAceiteTermosLgpd"],
  ["GET", "/TermoLgpd"],
  ["GET", `/Batidas/${SEG}(/${SEG}){0,2}`],
  ["GET", `/Batidas/Comprovante\\?axpw=${SEG}&(batidaId|registroPendenciaId)=${SEG}(&nome=${SEG})?`],
  ["GET", "/IncluirPonto"],
  ["GET", `/IncluirPonto/ListarUltimasPendenciasFuncionario/${SEG}`],
  ["POST", `/IncluirPonto\\?[^#]+`],
  ["POST", "/QualidadeVidaTrabalho"],
  ["GET", "/Justificativas"],
  ["GET", "/Filtro/ListarFiltro1"],
  ["GET", "/Filtro/ListarFiltro2"],
  ["GET", "/Escolaridade"],
  ["GET", `/Escolaridade/${SEG}`],
  ["GET", `/Inconsistencias/${SEG}/${SEG}/${SEG}`],
  ["POST", "/Inconsistencias"],
  ["GET", `/Solicitacoes/${SEG}/${SEG}(/${SEG}){0,3}(\\?origemRequisicao=${SEG})?`],
  // foto do atestado, do funcionário ou do comprovante anexada à solicitação
  ["GET", `/Solicitacoes/${SEG}/(FotoAtestado|FotoFuncionario|ComprovanteEndereco)\\?axpw=${SEG}&retornarFotoComoArquivo=true`],
  ["POST", "/Solicitacoes"],
  ["POST", "/Solicitacoes/(Ferias|Afastamento|VendaFerias|DadosCadastrais|MarcarVisto|DesmarcarVisto)"],
  ["POST", "/Solicitacoes/(Aceitar|Descartar)[A-Za-z]*"],
  ["GET", "/ControleFerias/Saldo"],
  ["GET", "/Indicadores/v2/ResumoDiario"],
  ["GET", "/Indicadores/TotalSolicitacoesPendentes"],
  ["GET", "/Indicadores/IndicadoresGerente/?"],
  ["GET", `/Indicadores/ListaHoras/${SEG}/${SEG}`],
  ["GET", `/Indicadores/IndicadorCustomizado/${SEG}`],
  ["GET", `/Indicadores/ListarColunasCalculoIndicador/?${SEG}?`],
  ["POST", "/Indicadores/SalvarIndicador"],
  ["DELETE", `/Indicadores/ExcluirIndicador/${SEG}`],
  // lista: {ini}/{fim}/{status}/{perfil}[/{funcionarioId}]
  ["GET", `/AssinaturaDigitalCartaoPonto/${SEG}/${SEG}/${SEG}/${SEG}(/${SEG})?`],
  // PDF do cartão a assinar: {id}[/{funcionarioId}]?axpw=
  ["GET", `/AssinaturaDigitalCartaoPonto/${SEG}(/${SEG})?\\?axpw=${SEG}`],
  ["GET", `/AssinaturaDigitalCartaoPonto/CarregarAssinatura/${SEG}`],
  ["POST", "/AssinaturaDigitalCartaoPonto/(Aprovar|Descartar|AprovarGerente|DescartarGerente)"],
  ["GET", `/RepositorioArquivo/${SEG}(/${SEG}/${SEG})?`],
  ["GET", `/RepositorioArquivo/(GetFile|GetType|ArquivoNotificacao)/${SEG}`],
  ["POST", "/RepositorioArquivoAssinatura/(Aprovar|Rejeitar)"],
  ["POST", "/RelatorioCartaoPonto"],
  ["GET", `/RelatorioCartaoPonto\\?axpw=${SEG}&dataInicio=${SEG}&dataFim=${SEG}&funcionarioId=${SEG}`],
  ["GET", `/CartaoPonto/${SEG}(/${SEG}){0,3}`],
  ["GET", `/Notificacoes/${SEG}/${SEG}`],
  ["POST", `/Notificacoes/MarcarNotificacaoVisualizada/${SEG}(/${SEG})?`],
  ["POST", "/Configuracoes"],
  ["POST", "/Configuracoes/(ReceberComprovante|NaoReceberComprovante)"],
  ["POST", "/ServicoOnline/GravarPedidoAjuda"],
].map(([m, r]) => [m, new RegExp("^" + r + "$")]);

function rotaPermitida(metodo, rota) {
  // ".." ou barra dupla não aparecem em nenhuma rota legítima do app
  if (/\.\.|\/\/|%2f/i.test(rota)) return false;
  return ROTAS_APP.some(([m, re]) => m === metodo && re.test(rota));
}

function msgSecullum(txt, fallback) {
  try {
    const a = JSON.parse(txt);
    if (Array.isArray(a) && a[0] && a[0].message) return a[0].message;
    if (a && a.message) return a.message;
    if (a && a.mensagem) return a.mensagem;
  } catch {}
  return fallback;
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const u = new URL(req.url), secret = env.VAULT_KEY || "pontoimp-fallback";

    try {
      if (u.pathname === "/health") return json(200, { ok: true, ts: new Date().toISOString() });

      if (u.pathname === "/auth/login" && req.method === "POST") {
        const { banco, usuario, senha, tipo } = await req.json().catch(() => ({}));
        if (!banco || !usuario || !senha) return json(400, { erro: "informe banco, usuário e senha" });

        const nova = {
          banco: String(banco),
          usuario: String(usuario),
          senha: String(senha),
          tipo: tipo === "identificador" ? 1 : 0,
        };

        const vb = await secullum("/Login/VerificarBancoValido/", { banco: nova.banco });
        if (vb.status >= 400 || /false/i.test(vb.txt))
          return json(400, { erro: `empresa (banco) ${nova.banco} não encontrada` });

        const r = await secullum("/Login", {
          method: "POST",
          banco: nova.banco,
          body: {
            usuario: nova.usuario,
            senha: nova.senha,
            tokenDispositivo: null,
            plataformaLogin: 1,
            apelidoDispositivo: null,
            identificacaoDispositivo: null,
            UsuarioAutenticacao: nova.tipo,
          },
        });

        if (r.status >= 400) {
          const msg = msgSecullum(r.txt, "usuário ou senha inválidos");
          const ehCred = r.status === 401 || /inv[aá]lid|senha|usu[aá]rio|encontrad/i.test(r.txt);
          return json(ehCred ? 401 : 502, { erro: msg, statusSecullum: r.status });
        }

        let id;
        try {
          id = JSON.parse(r.txt).id;
        } catch {
          return json(502, { erro: "resposta de login inesperada", amostra: r.txt.slice(0, 120) });
        }

        nova.funcionarioId = id;
        const f = await secullum("/Funcionarios/" + id, { sess: nova });
        let func = { id };
        try { func = JSON.parse(f.txt); } catch {}

        return json(200, { token: await cifrar(nova, secret), funcionarioId: id, func });
      }

      // "Esqueci a senha" acontece antes do login, então não tem sessão. As
      // quatro etapas são as do app oficial: e-mail oculto, envio do código,
      // confirmação do código e a senha nova.
      if (u.pathname === "/auth/recuperar" && req.method === "POST") {
        const { banco, etapa, corpo } = await req.json().catch(() => ({}));
        const ETAPAS = ["ObterEmailOcultoFuncionario", "ConfirmarEmail", "ConfirmarCodigo", "TrocarSenha"];
        if (!banco || !ETAPAS.includes(etapa) || !corpo) return json(400, { erro: "informe banco, etapa e corpo" });
        return passthru(await secullum("/RecuperacaoSenha/" + etapa, { method: "POST", banco: String(banco), body: corpo }));
      }

      const authz = (req.headers.get("authorization") || "").replace("Bearer ", "");
      if (!authz) return json(401, { erro: "faça login primeiro" });

      let sess;
      try {
        sess = await decifrar(authz, secret);
      } catch {
        return json(401, { erro: "sessão inválida, faça login de novo" });
      }

      if (u.pathname === "/me")
        return passthru(await secullum("/Funcionarios/" + sess.funcionarioId, { sess }));

      if (u.pathname === "/me/espelho") {
        const i = u.searchParams.get("inicio"), f = u.searchParams.get("fim");
        return passthru(await secullum(`/Batidas/${i}/${f}`, { sess }));
      }

      if (u.pathname === "/me/resumo")
        return passthru(await secullum("/Indicadores/v2/ResumoDiario", { sess }));

      if (u.pathname === "/me/raw") {
        const ep = u.searchParams.get("endpoint");
        if (!ep || !ep.startsWith("/")) return json(400, { erro: "endpoint inválido" });
        return passthru(await secullum(ep, { sess }));
      }

      /* ------------------------------------------------------------------
         Daqui pra baixo é o que foi acrescentado. Tudo acima é o que já
         estava no ar, sem uma vírgula mudada.
         ------------------------------------------------------------------ */

      // Ajuste de ponto: manda o dia inteiro (entrada1..5 / saida1..5) numa
      // solicitação só, que vai pra aprovação do gestor. É o que a tela
      // "Ajustar Ponto" do app oficial faz — confirmado por captura HAR.
      if (u.pathname === "/me/solicitacao" && req.method === "POST") {
        const corpo = await req.json().catch(() => null);
        if (!corpo) return json(400, { erro: "corpo inválido" });
        return passthru(await secullum("/Solicitacoes", { method: "POST", body: corpo, sess }));
      }

      // Lista as solicitações do período, com status.
      if (u.pathname === "/me/solicitacoes") {
        const i = u.searchParams.get("inicio"), f = u.searchParams.get("fim");
        const st = u.searchParams.get("status") || "0";
        if (!i || !f) return json(400, { erro: "informe inicio e fim" });
        return passthru(await secullum(`/Solicitacoes/${i}/${f}/${st}/0/0`, { sess }));
      }

      // Inclui uma batida que faltou. É o que o botão ＋ do app chama.
      if (u.pathname === "/me/ponto" && req.method === "POST") {
        const corpo = await req.json().catch(() => null);
        if (!corpo) return json(400, { erro: "corpo inválido" });
        return passthru(await secullum(
          "/IncluirPonto?funcionarioId=" + sess.funcionarioId,
          { method: "POST", body: corpo, sess }
        ));
      }

      // Lista as inconsistências do período (marcação faltando ou errada).
      if (u.pathname === "/me/inconsistencias") {
        const i = u.searchParams.get("inicio"), f = u.searchParams.get("fim");
        const st = u.searchParams.get("status") || "0";
        if (!i || !f) return json(400, { erro: "informe inicio e fim" });
        return passthru(await secullum(`/Inconsistencias/${i}/${f}/${st}`, { sess }));
      }

      // Justifica uma inconsistência. O corpo é o objeto que veio do GET acima,
      // inteiro, só com o campo `justificativa` preenchido — é assim que o app
      // oficial do Secullum faz, e campos não interpretados precisam voltar
      // intactos, então o worker repassa sem tocar em nada.
      if (u.pathname === "/me/inconsistencia" && req.method === "POST") {
        const corpo = await req.json().catch(() => null);
        if (!corpo) return json(400, { erro: "corpo inválido" });
        return passthru(await secullum("/Inconsistencias", { method: "POST", body: corpo, sess }));
      }

      // Endereço da coordenada, pelo mesmo serviço que o app oficial usa pra
      // preencher o campo `endereco` da batida e da assinatura.
      if (u.pathname === "/me/endereco") {
        const lat = Number(u.searchParams.get("lat")), lng = Number(u.searchParams.get("lng"));
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json(400, { erro: "informe lat e lng" });
        const r = await fetch(`https://geolocalizacao.secullum.com.br/Reverse?latitude=${lat}&longitude=${lng}`,
          { headers: { "User-Agent": UA } });
        return json(r.status, await r.text());
      }

      // Todas as outras telas do app oficial passam por aqui. Uma rota só, em
      // vez de uma por recurso, pra que o painel não precise de colagem nova a
      // cada tela — mas presa à lista ROTAS_APP, senão viraria proxy aberto
      // pra qualquer caminho do Secullum com a senha do funcionário.
      if (u.pathname === "/me/api" && req.method === "POST") {
        const p = await req.json().catch(() => null);
        if (!p || typeof p.rota !== "string") return json(400, { erro: "informe a rota" });
        const metodo = String(p.metodo || "GET").toUpperCase();
        let rota = p.rota.replace(/\{funcionarioId\}/g, String(sess.funcionarioId));
        if (!rotaPermitida(metodo, rota)) return json(403, { erro: `rota não permitida: ${metodo} ${rota}` });
        // PDF do cartão e comprovante levam a credencial na própria URL (axpw é
        // o mesmo base64 do Basic). Ela só existe aqui dentro, então o app manda
        // o marcador e o Worker preenche — depois da checagem, porque o base64
        // pode ter "/" e reprovaria nela.
        rota = rota.replace("{axpw}", encodeURIComponent(btoa(`${sess.usuario}:${sess.senha}:${sess.tipo}`)));
        return passthruBinario(await secullumBruto(rota, {
          method: metodo, body: p.corpo === undefined ? undefined : p.corpo, sess,
        }));
      }

      return json(404, { erro: "rota não encontrada" });
    } catch (e) {
      return json(500, { erro: String((e && e.message) || e) });
    }
  },
};
