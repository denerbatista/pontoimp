/* PontoImp — serviço de push.
   Separado do gateway do Secullum de propósito: aqui não passa credencial nem token.
   O app manda a agenda do dia já em timestamps absolutos; o cron entrega na hora. */
import { enviarPush } from './push.mjs';

const JANELA_MS = 5*60*1000;      // atraso máximo tolerado antes de desistir do aviso
const VALIDADE_MS = 3*24*3600*1000; // inscrição sem notícias por 3 dias é descartada
const MAX_AGENDA = 60;

/* Só entregamos em serviços de push conhecidos. Sem isto o Worker viraria
   um proxy aberto: qualquer um postaria um endpoint e nós faríamos o fetch. */
const HOSTS_PUSH = [
  /^fcm\.googleapis\.com$/,
  /^[\w-]+\.push\.services\.mozilla\.com$/,
  /^[\w-]+\.notify\.windows\.com$/,
  /^([\w-]+\.)?push\.apple\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
];

export function endpointValido(url){
  let u;
  try { u = new URL(url); } catch(e){ return false; }
  return u.protocol === 'https:' && HOSTS_PUSH.some(re => re.test(u.hostname));
}

function inscricaoValida(i){
  return !!(i && typeof i.endpoint === 'string' && endpointValido(i.endpoint)
    && i.keys && typeof i.keys.p256dh === 'string' && typeof i.keys.auth === 'string');
}

async function idDe(endpoint){
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return 'sub:' + [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

const cors = (env) => ({
  'Access-Control-Allow-Origin': env.ORIGEM_PERMITIDA || '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
});
const json = (dados, env, status=200) =>
  new Response(JSON.stringify(dados), { status, headers: { 'Content-Type':'application/json', ...cors(env) } });

function configVapid(env){
  if(!env.VAPID_PRIVADA || !env.VAPID_PUBLICA) throw new Error('faltam VAPID_PRIVADA/VAPID_PUBLICA');
  return {
    jwkPrivada: JSON.parse(env.VAPID_PRIVADA),
    publicaB64: env.VAPID_PUBLICA,
    assunto: env.VAPID_ASSUNTO || 'mailto:contato@example.com',
  };
}

export default {
  async fetch(req, env){
    const url = new URL(req.url);
    if(req.method === 'OPTIONS') return new Response(null, { headers: cors(env) });

    if(url.pathname === '/health') return json({ ok:true }, env);

    // o app busca a chave aqui em vez de embutir no HTML — trocar de chave não exige redeploy
    if(url.pathname === '/push/chave')
      return json({ publica: env.VAPID_PUBLICA || null }, env);

    if(url.pathname === '/push/agenda' && req.method === 'POST'){
      let b; try { b = await req.json(); } catch(e){ return json({ erro:'json inválido' }, env, 400); }
      if(!inscricaoValida(b.inscricao)) return json({ erro:'inscrição inválida' }, env, 400);
      const agenda = Array.isArray(b.agenda) ? b.agenda.slice(0, MAX_AGENDA)
        .filter(e => e && typeof e.ts === 'number' && typeof e.titulo === 'string')
        .map(e => ({ ts:e.ts, chave:String(e.chave||e.ts), titulo:String(e.titulo).slice(0,120),
                     corpo:String(e.corpo||'').slice(0,300), nivel: e.nivel==='alarme'?'alarme':'aviso' })) : [];

      const id = await idDe(b.inscricao.endpoint);
      const antigo = await env.PUSH.get(id, 'json');
      // guarda o que já foi enviado pra não repetir aviso quando o app remanda a agenda
      await env.PUSH.put(id, JSON.stringify({
        inscricao: b.inscricao, agenda,
        enviados: (antigo && antigo.enviados) || {},
        atualizadoEm: Date.now(),
      }));
      return json({ ok:true, agendados: agenda.length }, env);
    }

    if(url.pathname === '/push/cancelar' && req.method === 'POST'){
      let b; try { b = await req.json(); } catch(e){ return json({ erro:'json inválido' }, env, 400); }
      if(!b || typeof b.endpoint !== 'string') return json({ erro:'endpoint faltando' }, env, 400);
      await env.PUSH.delete(await idDe(b.endpoint));
      return json({ ok:true }, env);
    }

    if(url.pathname === '/push/teste' && req.method === 'POST'){
      let b; try { b = await req.json(); } catch(e){ return json({ erro:'json inválido' }, env, 400); }
      if(!inscricaoValida(b.inscricao)) return json({ erro:'inscrição inválida' }, env, 400);
      const r = await enviarPush(b.inscricao,
        { titulo:'🔔 Push funcionando', corpo:'Vou te avisar mesmo com o app fechado.', nivel:'aviso' },
        configVapid(env));
      return json(r, env, r.ok ? 200 : 502);
    }

    return json({ erro:'rota não encontrada' }, env, 404);
  },

  /* Cron de 1 em 1 minuto: entrega o que venceu e limpa o que morreu. */
  async scheduled(evento, env, ctx){
    ctx.waitUntil((async () => {
      const cfg = configVapid(env);
      const agora = Date.now();
      let cursor;
      do {
        const pagina = await env.PUSH.list({ prefix:'sub:', cursor });
        cursor = pagina.list_complete ? null : pagina.cursor;

        for(const ch of pagina.keys){
          const reg = await env.PUSH.get(ch.name, 'json');
          if(!reg){ continue; }
          if(agora - (reg.atualizadoEm||0) > VALIDADE_MS){ await env.PUSH.delete(ch.name); continue; }

          const vencidos = (reg.agenda||[]).filter(e =>
            e.ts <= agora && agora - e.ts <= JANELA_MS && !reg.enviados[e.chave]);
          if(!vencidos.length) continue;

          let morta = false;
          for(const e of vencidos){
            const r = await enviarPush(reg.inscricao,
              { titulo:e.titulo, corpo:e.corpo, chave:e.chave, nivel:e.nivel }, cfg);
            if(r.morta){ morta = true; break; }
            if(r.ok) reg.enviados[e.chave] = agora;
          }
          if(morta){ await env.PUSH.delete(ch.name); continue; }

          // esquece o histórico de ontem pra não crescer sem fim
          for(const k of Object.keys(reg.enviados))
            if(agora - reg.enviados[k] > 24*3600*1000) delete reg.enviados[k];
          await env.PUSH.put(ch.name, JSON.stringify(reg));
        }
      } while(cursor);
    })());
  },
};
