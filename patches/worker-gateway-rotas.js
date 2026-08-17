/* ---------------------------------------------------------------------------
   Rotas que faltam no worker pontoimp-gateway.

   Cole este bloco DENTRO do `try` do fetch(), logo ANTES da linha:

       return json(404, { erro: "rota não encontrada" });

   Elas dependem de `sess`, `secullum()`, `passthru()` e `json()`, que já
   existem no arquivo. Nada mais precisa mudar.
   --------------------------------------------------------------------------- */

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
