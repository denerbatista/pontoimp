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

/* --- /me/api: as demais telas do app oficial, presas à lista --- */
const api = (corpo) => chamar('/me/api', { method: 'POST', headers: auth, body: JSON.stringify(corpo) });

chamadas = [];
let r = await api({ metodo: 'GET', rota: '/ControleFerias/Saldo' });
ok('api repassa rota da lista', r.status === 200 && chamadas[0].url.endsWith('/999/ControleFerias/Saldo'), chamadas[0]?.url);
ok('api manda o Basic', chamadas[0].auth === 'Basic ' + btoa('123:x:0'));

chamadas = [];
await api({ metodo: 'POST', rota: '/Solicitacoes/Ferias', corpo: { tipo: 21 } });
ok('api repassa POST com corpo', chamadas[0].method === 'POST' && chamadas[0].body === '{"tipo":21}', chamadas[0]?.body);

chamadas = [];
await api({ metodo: 'GET', rota: '/RepositorioArquivo/{funcionarioId}' });
ok('api troca {funcionarioId} pelo da sessão', chamadas[0].url.endsWith('/RepositorioArquivo/777'), chamadas[0]?.url);

chamadas = [];
await api({ metodo: 'DELETE', rota: '/Indicadores/ExcluirIndicador/3' });
ok('api aceita o DELETE do indicador', chamadas[0]?.method === 'DELETE');

chamadas = [];
r = await api({ metodo: 'GET', rota: '/Usuarios/Todos' });
ok('rota fora da lista dá 403', r.status === 403 && chamadas.length === 0);
r = await api({ metodo: 'POST', rota: '/ControleFerias/Saldo' });
ok('método errado na rota certa dá 403', r.status === 403);
r = await api({ metodo: 'GET', rota: '/Batidas/../Usuarios' });
ok('caminho com .. dá 403', r.status === 403);
r = await api({ metodo: 'GET', rota: '/Batidas/2026-01-01/2026-01-31?x=//evil' });
ok('barra dupla dá 403', r.status === 403);
ok('api sem token dá 401', (await chamar('/me/api', { method: 'POST', body: '{}' })).status === 401);

// PDF e arquivo do RH passam como bytes, com o tipo original
const fetchAntes = globalThis.fetch;
const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xff, 0x00, 0x80]);
globalThis.fetch = async () => new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/pdf' } });
r = await api({ metodo: 'GET', rota: '/RelatorioCartaoPonto?axpw={axpw}&dataInicio=2026-10-01&dataFim=2026-10-31&funcionarioId={funcionarioId}' });
const volta = new Uint8Array(await r.arrayBuffer());
ok('binário volta intacto', volta.length === bytes.length && volta.every((b, i) => b === bytes[i]));
ok('tipo do binário preservado', r.headers.get('Content-Type') === 'application/pdf');
ok('CORS no binário', r.headers.get('Access-Control-Allow-Origin') === '*');
globalThis.fetch = fetchAntes;

chamadas = [];
await api({ metodo: 'GET', rota: '/Batidas/Comprovante?axpw={axpw}&batidaId=55&nome=Entrada%201' });
ok('axpw preenchido pelo Worker', chamadas[0].url.endsWith('/Batidas/Comprovante?axpw=' + encodeURIComponent(btoa('123:x:0')) + '&batidaId=55&nome=Entrada%201'), chamadas[0]?.url);
r = await api({ metodo: 'GET', rota: '/Funcionarios/1?axpw={axpw}' });
ok('axpw fora das rotas de PDF dá 403', r.status === 403);

chamadas = [];
await chamar('/me/endereco?lat=-23.5&lng=-46.6', { headers: auth });
ok('endereço vai pro serviço da Secullum', chamadas[0].url === 'https://geolocalizacao.secullum.com.br/Reverse?latitude=-23.5&longitude=-46.6', chamadas[0]?.url);
ok('endereço sem coordenada dá 400', (await chamar('/me/endereco?lat=x', { headers: auth })).status === 400);

/* --- recuperação de senha: antes do login, sem sessão --- */
chamadas = [];
r = await chamar('/auth/recuperar', { method: 'POST',
  body: JSON.stringify({ banco: '999', etapa: 'ConfirmarEmail', corpo: { email: 'a@b' } }) });
ok('recuperar vai pra /RecuperacaoSenha', chamadas[0].url.endsWith('/999/RecuperacaoSenha/ConfirmarEmail'), chamadas[0]?.url);
ok('recuperar não manda Authorization', !chamadas[0].auth);
r = await chamar('/auth/recuperar', { method: 'POST', body: JSON.stringify({ banco: '999', etapa: 'Login', corpo: {} }) });
ok('etapa desconhecida dá 400', r.status === 400);

ok('corpo vazio dá 400', (await chamar('/me/ponto', { method: 'POST', headers: auth })).status === 400);
ok('rota desconhecida ainda dá 404', (await chamar('/me/nada', { headers: auth })).status === 404);

const pre = await chamar('/me', { method: 'OPTIONS' });
ok('preflight responde 204', pre.status === 204 && pre.headers.get('Access-Control-Allow-Origin') === '*');

globalThis.fetch = realFetch;
console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
