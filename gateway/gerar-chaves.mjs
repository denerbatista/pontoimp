/* Gera o par VAPID. A privada nunca entra no repositório — ela vai como secret do Worker.
   node gerar-chaves.mjs */
const par = await crypto.subtle.generateKey({ name:'ECDSA', namedCurve:'P-256' }, true, ['sign','verify']);

const b64url = (b) => {
  const a = new Uint8Array(b);
  let s = '';
  for(let i=0;i<a.length;i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};

const publica = b64url(await crypto.subtle.exportKey('raw', par.publicKey));
const privada = JSON.stringify(await crypto.subtle.exportKey('jwk', par.privateKey));

console.log('\nVAPID_PUBLICA (pode ser pública — o app busca ela em /push/chave):\n');
console.log(publica);
console.log('\nVAPID_PRIVADA (SEGREDO — só no wrangler secret, nunca commitada):\n');
console.log(privada);
console.log(`
Para configurar:
  npx wrangler secret put VAPID_PUBLICA
  npx wrangler secret put VAPID_PRIVADA

Trocar o par depois invalida as inscrições existentes: cada aparelho
precisa entrar no app uma vez pra se reinscrever.
`);
