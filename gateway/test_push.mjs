/* Testes do Web Push: cifra de ida e volta (RFC 8291) e assinatura VAPID (RFC 8292).
   Roda no Node com WebCrypto global: node gateway/test_push.mjs */
import { encriptar, derivar, cabecalhoVapid, b64urlParaBytes, bytesParaB64url } from './src/push.mjs';

let falhas = 0;
const check = (nome, cond) => { console.log((cond?'✓ ':'✗ ')+nome); if(!cond) falhas++; };
const enc = new TextEncoder();
const dec = new TextDecoder();

/* Faz o papel do navegador: gera o par ECDH e o auth secret de uma inscrição. */
async function inscricaoFalsa(){
  const par = await crypto.subtle.generateKey({ name:'ECDH', namedCurve:'P-256' }, true, ['deriveBits']);
  const publica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    privada: par.privateKey,
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: { p256dh: bytesParaB64url(publica), auth: bytesParaB64url(auth) },
  };
}

/* Decifra como o navegador faria — é isto que prova que a cifra está correta. */
async function decifrar(corpo, inscricao){
  const salt = corpo.slice(0, 16);
  const idlen = corpo[20];
  const asPublic = corpo.slice(21, 21+idlen);
  const cifrado = corpo.slice(21+idlen);

  const chaveAs = await crypto.subtle.importKey('raw', asPublic, { name:'ECDH', namedCurve:'P-256' }, false, []);
  const segredoEcdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name:'ECDH', public: chaveAs }, inscricao.privada, 256));

  const { cek, nonce } = await derivar({
    segredoEcdh,
    authSecret: b64urlParaBytes(inscricao.keys.auth),
    uaPublic: b64urlParaBytes(inscricao.keys.p256dh),
    asPublic, salt,
  });
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const claro = new Uint8Array(await crypto.subtle.decrypt({ name:'AES-GCM', iv: nonce }, aes, cifrado));
  check('último registro termina com o delimitador 0x02', claro[claro.length-1] === 2);
  return dec.decode(claro.slice(0, -1));
}

(async () => {
  // ---- cifra
  const insc = await inscricaoFalsa();
  const texto = JSON.stringify({ titulo:'🏁 SAIA AGORA', corpo:'18:00 — cada minuto vira hora extra.' });
  const corpo = await encriptar(enc.encode(texto), insc.keys.p256dh, insc.keys.auth);

  check('cabeçalho aes128gcm tem salt+rs+idlen antes da chave', corpo.length > 21+65);
  check('record size declarado é 4096', new DataView(corpo.buffer, corpo.byteOffset).getUint32(16) === 4096);
  check('idlen anuncia a chave efêmera de 65 bytes', corpo[20] === 65);
  check('chave efêmera é ponto não comprimido (0x04)', corpo[21] === 4);

  const voltou = await decifrar(corpo, insc);
  check('decifra de volta no texto original', voltou === texto);
  check('acentos e emoji sobrevivem', voltou.includes('SAIA AGORA') && voltou.includes('extra'));

  // salt aleatório por envio: dois envios iguais não podem gerar o mesmo corpo
  const corpo2 = await encriptar(enc.encode(texto), insc.keys.p256dh, insc.keys.auth);
  check('cada envio usa salt e chave efêmera novos',
    bytesParaB64url(corpo) !== bytesParaB64url(corpo2));
  check('o segundo envio também decifra', (await decifrar(corpo2, insc)) === texto);

  // uma inscrição não pode abrir o payload de outra
  const outra = await inscricaoFalsa();
  let vazou = false;
  try { await decifrar(corpo, { ...outra, keys: outra.keys }); vazou = true; } catch(e){}
  check('outra inscrição não consegue decifrar', !vazou);

  // ---- VAPID
  const parVapid = await crypto.subtle.generateKey({ name:'ECDSA', namedCurve:'P-256' }, true, ['sign','verify']);
  const jwkPrivada = await crypto.subtle.exportKey('jwk', parVapid.privateKey);
  const publicaB64 = bytesParaB64url(new Uint8Array(await crypto.subtle.exportKey('raw', parVapid.publicKey)));

  const auth = await cabecalhoVapid(insc.endpoint, jwkPrivada, publicaB64, 'mailto:dener@impactaweb.com.br');
  check('cabeçalho no formato "vapid t=..., k=..."', /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/.test(auth));

  const jwt = auth.slice('vapid t='.length, auth.indexOf(', k='));
  const [h, p, s] = jwt.split('.');
  const cab = JSON.parse(dec.decode(b64urlParaBytes(h)));
  const claims = JSON.parse(dec.decode(b64urlParaBytes(p)));
  check('JWT declara ES256', cab.alg === 'ES256' && cab.typ === 'JWT');
  check('aud é a origem do endpoint, sem caminho', claims.aud === 'https://fcm.googleapis.com');
  check('sub identifica o dono', claims.sub.startsWith('mailto:'));
  const horas = (claims.exp - Math.floor(Date.now()/1000)) / 3600;
  check('exp dentro das 24h exigidas pelo RFC 8292', horas > 0 && horas <= 24);

  const assinaturaOk = await crypto.subtle.verify(
    { name:'ECDSA', hash:'SHA-256' }, parVapid.publicKey,
    b64urlParaBytes(s), enc.encode(h+'.'+p));
  check('assinatura confere com a chave pública', assinaturaOk);
  check('assinatura crua r|s tem 64 bytes', b64urlParaBytes(s).length === 64);

  const adulterado = await crypto.subtle.verify(
    { name:'ECDSA', hash:'SHA-256' }, parVapid.publicKey,
    b64urlParaBytes(s), enc.encode(h+'.'+p+'x'));
  check('assinatura rejeita payload adulterado', !adulterado);

  console.log(falhas ? `\n${falhas} FALHAS` : '\ntudo certo ✔');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
