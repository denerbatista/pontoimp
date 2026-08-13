/* Testes das rotas e do cron do Worker, com KV e fetch falsos.
   node gateway/test_worker.mjs */
import worker, { endpointValido } from './src/index.mjs';
import { bytesParaB64url } from './src/push.mjs';

let falhas = 0;
const check = (nome, cond) => { console.log((cond?'✓ ':'✗ ')+nome); if(!cond) falhas++; };

/* KV de mentira, só um Map com a API que o Worker usa. */
function kvFalso(){
  const m = new Map();
  return {
    _m: m,
    async get(k, tipo){ const v = m.get(k); return v==null ? null : (tipo==='json' ? JSON.parse(v) : v); },
    async put(k, v){ m.set(k, v); },
    async delete(k){ m.delete(k); },
    async list({ prefix }){ return { keys:[...m.keys()].filter(k=>k.startsWith(prefix)).map(name=>({name})), list_complete:true }; },
  };
}

async function ambiente(){
  const par = await crypto.subtle.generateKey({ name:'ECDSA', namedCurve:'P-256' }, true, ['sign','verify']);
  return {
    PUSH: kvFalso(),
    VAPID_PRIVADA: JSON.stringify(await crypto.subtle.exportKey('jwk', par.privateKey)),
    VAPID_PUBLICA: bytesParaB64url(new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey))),
    VAPID_ASSUNTO: 'mailto:dener@impactaweb.com.br',
  };
}

async function inscricaoFalsa(endpoint='https://fcm.googleapis.com/fcm/send/abc'){
  const par = await crypto.subtle.generateKey({ name:'ECDH', namedCurve:'P-256' }, true, ['deriveBits']);
  return {
    endpoint,
    keys: {
      p256dh: bytesParaB64url(new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey))),
      auth: bytesParaB64url(crypto.getRandomValues(new Uint8Array(16))),
    },
  };
}

const post = (rota, corpo) => new Request('https://push.local'+rota, {
  method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(corpo) });

(async () => {
  // ---- guarda de SSRF: o Worker faz fetch no endpoint, então ele não pode aceitar qualquer URL
  check('aceita FCM', endpointValido('https://fcm.googleapis.com/fcm/send/x'));
  check('aceita Mozilla', endpointValido('https://updates.push.services.mozilla.com/wpush/v2/x'));
  check('aceita Apple', endpointValido('https://web.push.apple.com/x'));
  check('recusa host arbitrário', !endpointValido('https://evil.example.com/x'));
  check('recusa http sem TLS', !endpointValido('http://fcm.googleapis.com/x'));
  check('recusa rede interna', !endpointValido('http://169.254.169.254/latest/meta-data/'));
  check('recusa localhost', !endpointValido('https://localhost:8080/x'));
  check('recusa lixo', !endpointValido('nao-e-url'));
  check('recusa sufixo que imita o host bom', !endpointValido('https://fcm.googleapis.com.evil.net/x'));

  const env = await ambiente();
  const insc = await inscricaoFalsa();

  // ---- rotas
  const chave = await (await worker.fetch(new Request('https://push.local/push/chave'), env)).json();
  check('/push/chave devolve a pública', chave.publica === env.VAPID_PUBLICA);

  const ruim = await worker.fetch(post('/push/agenda', { inscricao:{ endpoint:'https://evil.example.com/x', keys:{p256dh:'a',auth:'b'} }, agenda:[] }), env);
  check('/push/agenda rejeita endpoint fora da lista', ruim.status === 400);
  check('nada foi gravado no KV', env.PUSH._m.size === 0);

  const agora = Date.now();
  const ok = await worker.fetch(post('/push/agenda', { inscricao: insc, agenda:[
    { ts: agora-1000, chave:'sai_1080', titulo:'🏁 SAIA AGORA', corpo:'18:00', nivel:'alarme' },
    { ts: agora+3600e3, chave:'futuro', titulo:'depois', corpo:'x' },
    { ts: agora-3600e3, chave:'velho', titulo:'perdido', corpo:'x' },
  ]}), env);
  check('/push/agenda aceita inscrição válida', ok.status === 200);
  check('gravou uma entrada no KV', env.PUSH._m.size === 1);

  const limite = await worker.fetch(post('/push/agenda', { inscricao: insc,
    agenda: Array.from({length:200}, (_,i)=>({ ts:agora+i, chave:'k'+i, titulo:'t' })) }), env);
  check('corta agenda gigante em 60', (await limite.json()).agendados === 60);

  // volta pra agenda de teste antes do cron
  await worker.fetch(post('/push/agenda', { inscricao: insc, agenda:[
    { ts: agora-1000, chave:'sai_1080', titulo:'🏁 SAIA AGORA', corpo:'18:00', nivel:'alarme' },
    { ts: agora+3600e3, chave:'futuro', titulo:'depois', corpo:'x' },
    { ts: agora-3600e3, chave:'velho', titulo:'perdido', corpo:'x' },
  ]}), env);

  // ---- cron: só o evento vencido dentro da janela pode sair
  const enviados = [];
  globalThis.fetch = async (url, opt) => { enviados.push({ url:String(url), opt }); return new Response('', { status:201 }); };
  const espera = [];
  await worker.scheduled({}, env, { waitUntil: p => espera.push(p) });
  await Promise.all(espera);

  check('cron entregou exatamente 1 push', enviados.length === 1);
  check('entregou no endpoint da inscrição', enviados[0] && enviados[0].url === insc.endpoint);
  check('não disparou evento futuro nem evento velho demais', enviados.length === 1);
  const h = enviados[0] ? enviados[0].opt.headers : {};
  check('manda Content-Encoding aes128gcm', h['Content-Encoding'] === 'aes128gcm');
  check('manda Authorization vapid', /^vapid t=/.test(h.Authorization||''));
  check('manda TTL', !!h.TTL);

  const reg = await env.PUSH.get([...env.PUSH._m.keys()][0], 'json');
  check('marcou o evento como enviado', !!reg.enviados['sai_1080']);

  // segundo cron não pode repetir o mesmo aviso
  enviados.length = 0;
  const espera2 = [];
  await worker.scheduled({}, env, { waitUntil: p => espera2.push(p) });
  await Promise.all(espera2);
  check('cron seguinte não repete o aviso', enviados.length === 0);

  // ---- inscrição morta é descartada
  globalThis.fetch = async () => new Response('', { status:410 });
  await worker.fetch(post('/push/agenda', { inscricao: insc,
    agenda:[{ ts: Date.now()-500, chave:'novo', titulo:'x', corpo:'y' }] }), env);
  const espera3 = [];
  await worker.scheduled({}, env, { waitUntil: p => espera3.push(p) });
  await Promise.all(espera3);
  check('410 apaga a inscrição do KV', env.PUSH._m.size === 0);

  console.log(falhas ? `\n${falhas} FALHAS` : '\ntudo certo ✔');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
