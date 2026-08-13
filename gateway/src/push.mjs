/* Web Push sem dependências: RFC 8291 (aes128gcm) + RFC 8292 (VAPID).
   Roda em WebCrypto puro — serve tanto no Worker quanto no Node dos testes. */

const enc = new TextEncoder();

export function b64urlParaBytes(s){
  s = String(s).replace(/-/g,'+').replace(/_/g,'/');
  while(s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesParaB64url(b){
  const a = new Uint8Array(b);
  let s = '';
  for(let i=0;i<a.length;i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function juntar(...partes){
  const total = partes.reduce((n,p)=>n+p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for(const p of partes){ out.set(p, o); o += p.length; }
  return out;
}

async function hkdf(salt, ikm, info, tamanho){
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'HKDF', hash:'SHA-256', salt, info }, k, tamanho*8);
  return new Uint8Array(bits);
}

// info do HKDF sempre termina em 0x00 (RFC 8188 §2.2 / RFC 8291 §3.4)
const infoDe = (txt, ...extra) => juntar(enc.encode(txt), new Uint8Array([0]), ...extra);

/* Deriva a chave de conteúdo e o nonce a partir do segredo ECDH.
   Isolado da encriptação porque o teste de ida e volta precisa dos dois lados. */
export async function derivar({ segredoEcdh, authSecret, uaPublic, asPublic, salt }){
  const ikm = await hkdf(authSecret, segredoEcdh, infoDe('WebPush: info', uaPublic, asPublic), 32);
  return {
    cek:   await hkdf(salt, ikm, infoDe('Content-Encoding: aes128gcm'), 16),
    nonce: await hkdf(salt, ikm, infoDe('Content-Encoding: nonce'), 12),
  };
}

/* Corpo cifrado: salt(16) | rs(4) | idlen(1) | chave efêmera(65) | AES-GCM(texto | 0x02) */
export async function encriptar(textoClaro, p256dhB64, authB64, saltFixo){
  const uaPublic = b64urlParaBytes(p256dhB64);
  const authSecret = b64urlParaBytes(authB64);
  if(uaPublic.length !== 65) throw new Error('p256dh deve ter 65 bytes, veio '+uaPublic.length);

  const par = await crypto.subtle.generateKey({ name:'ECDH', namedCurve:'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const chaveUa = await crypto.subtle.importKey('raw', uaPublic, { name:'ECDH', namedCurve:'P-256' }, false, []);
  const segredoEcdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name:'ECDH', public: chaveUa }, par.privateKey, 256));

  const salt = saltFixo || crypto.getRandomValues(new Uint8Array(16));
  const { cek, nonce } = await derivar({ segredoEcdh, authSecret, uaPublic, asPublic, salt });

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const registro = juntar(textoClaro, new Uint8Array([2])); // 0x02 = delimitador do último registro
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name:'AES-GCM', iv: nonce }, aes, registro));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return juntar(salt, rs, new Uint8Array([asPublic.length]), asPublic, cifrado);
}

/* Cabeçalho Authorization do VAPID: JWT ES256 assinado com a chave privada do servidor. */
export async function cabecalhoVapid(endpoint, jwkPrivada, publicaB64, assunto){
  const cabecalho = bytesParaB64url(enc.encode(JSON.stringify({ typ:'JWT', alg:'ES256' })));
  const corpo = bytesParaB64url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now()/1000) + 12*3600,
    sub: assunto,
  })));
  const chave = await crypto.subtle.importKey(
    'jwk', jwkPrivada, { name:'ECDSA', namedCurve:'P-256' }, false, ['sign']);
  // WebCrypto já devolve a assinatura como r|s cru, que é o formato do JWS
  const assinatura = new Uint8Array(await crypto.subtle.sign(
    { name:'ECDSA', hash:'SHA-256' }, chave, enc.encode(cabecalho+'.'+corpo)));
  return `vapid t=${cabecalho}.${corpo}.${bytesParaB64url(assinatura)}, k=${publicaB64}`;
}

/* Entrega uma notificação. 404/410 = inscrição morta, o chamador deve descartar. */
export async function enviarPush(inscricao, payload, cfg){
  const corpo = await encriptar(
    enc.encode(JSON.stringify(payload)), inscricao.keys.p256dh, inscricao.keys.auth);
  const r = await fetch(inscricao.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await cabecalhoVapid(inscricao.endpoint, cfg.jwkPrivada, cfg.publicaB64, cfg.assunto),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '600',
      Urgency: 'high',
    },
    body: corpo,
  });
  return { ok: r.ok, status: r.status, morta: r.status===404 || r.status===410 };
}
