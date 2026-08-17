/* Confere o worker completo antes de mandar o Dener colar no painel:
   o token cifra e decifra, e cada rota bate no caminho certo do Secullum. */
import worker from './worker-gateway-completo.js';

let chamadas = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  chamadas.push({ url: String(url), method: init.method || 'GET', body: init.body, auth: init.headers?.Authorization });
  const u = String(url);
  if (u.includes('VerificarBancoValido')) return new Response('true', { status: 200 });
  if (u.endsWith('/Login')) return new Response(JSON.stringify({ id: 777 }), { status: 200 });
  return new Response(JSON.stringify({ ok: 1 }), { status: 200 });
};

const env = { VAULT_KEY: 'chave-de-teste' };
const chamar = (path, opts = {}) => worker.fetch(new Request('https://gw.dev' + path, opts), env);

let falhas = 0;
const ok = (nome, cond, extra = '') => {
  if (cond) console.log('  ok   ' + nome);
  else { falhas++; console.log('  FALHA ' + nome + (extra ? ' — ' + extra : '')); }
};

/* --- o que já existia --- */
ok('health responde', (await (await chamar('/health')).json()).ok === true);
ok('sem token dá 401', (await chamar('/me')).status === 401);

const login = await chamar('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ banco: '999', usuario: '123', senha: 'x' }),
});
const { token, funcionarioId } = await login.json();
ok('login devolve token', login.status === 200 && !!token);
ok('login traz o funcionarioId', funcionarioId === 777);

const auth = { Authorization: 'Bearer ' + token };
ok('token inválido dá 401', (await chamar('/me', { headers: { Authorization: 'Bearer lixo' } })).status === 401);

chamadas = [];
await chamar('/me/espelho?inicio=2026-08-01&fim=2026-08-31', { headers: auth });
ok('espelho vai pra /Batidas', chamadas[0].url.endsWith('/999/Batidas/2026-08-01/2026-08-31'), chamadas[0]?.url);
ok('manda o Basic do Secullum', chamadas[0].auth === 'Basic ' + btoa('123:x:0'), chamadas[0]?.auth);

/* --- as rotas novas --- */
chamadas = [];
const solic = await chamar('/me/solicitacao', { method: 'POST', headers: auth, body: JSON.stringify({ tipo: 0 }) });
ok('solicitacao vai pra /Solicitacoes', chamadas[0].url.endsWith('/999/Solicitacoes'), chamadas[0]?.url);
ok('solicitacao é POST', chamadas[0].method === 'POST');
ok('solicitacao repassa o corpo', chamadas[0].body === '{"tipo":0}');
ok('solicitacao devolve 200', solic.status === 200);

chamadas = [];
await chamar('/me/solicitacoes?inicio=2026-08-01&fim=2026-08-31', { headers: auth });
// o Secullum pede {ini}/{fim}/{status}/{perfil}/{id} — daí os dois zeros no fim
ok('lista de solicitações monta a URL', chamadas[0].url.endsWith('/Solicitacoes/2026-08-01/2026-08-31/0/0/0'), chamadas[0]?.url);
ok('solicitações sem período dá 400', (await chamar('/me/solicitacoes', { headers: auth })).status === 400);

chamadas = [];
await chamar('/me/ponto', { method: 'POST', headers: auth, body: JSON.stringify({ hora: '08:00' }) });
ok('ponto vai pra /IncluirPonto com o id', chamadas[0].url.endsWith('/IncluirPonto?funcionarioId=777'), chamadas[0]?.url);

chamadas = [];
await chamar('/me/inconsistencias?inicio=2026-08-01&fim=2026-08-31&status=1', { headers: auth });
ok('inconsistências usam o status pedido', chamadas[0].url.endsWith('/Inconsistencias/2026-08-01/2026-08-31/1'), chamadas[0]?.url);

chamadas = [];
await chamar('/me/inconsistencia', { method: 'POST', headers: auth, body: JSON.stringify({ id: 5, justificativa: 'esqueci' }) });
ok('justificativa vai inteira pra /Inconsistencias', chamadas[0].body === '{"id":5,"justificativa":"esqueci"}', chamadas[0]?.body);

ok('corpo vazio dá 400', (await chamar('/me/ponto', { method: 'POST', headers: auth })).status === 400);
ok('rota desconhecida ainda dá 404', (await chamar('/me/nada', { headers: auth })).status === 404);

const pre = await chamar('/me', { method: 'OPTIONS' });
ok('preflight responde 204', pre.status === 204 && pre.headers.get('Access-Control-Allow-Origin') === '*');

globalThis.fetch = realFetch;
console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
