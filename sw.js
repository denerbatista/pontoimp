/* PontoImp — service worker: shell offline + notificações persistentes */
const CACHE = 'pontoimp-v10';
const CFG = 'pontoimp-cfg'; // sobrevive à troca de versão: guarda a URL do serviço de push
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192-v2.png', './icon-512-v2.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== CFG).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // gateway passa direto
  if (e.request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    // network-first pro app (pega atualização), cai no cache offline
    e.respondWith(
      fetch(e.request)
        .then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put('./index.html', cp)); return r; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});

/* Push do servidor: é o que faz o aviso chegar com o app fechado ou o
   celular congelado pela economia de bateria da Samsung. */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { titulo: 'PontoImp', corpo: (e.data && e.data.text()) || '' }; }
  const alarme = d.nivel === 'alarme';
  e.waitUntil(self.registration.showNotification(d.titulo || 'PontoImp', {
    body: d.corpo || '',
    icon: './icon-192-v2.png',
    badge: './icon-192-v2.png',
    tag: d.chave || d.titulo,
    renotify: true,
    requireInteraction: alarme,
    vibrate: alarme ? [420,140,420,140,420,140,420] : [200],
    data: d,
  }));
});

/* O navegador pode trocar a inscrição sozinho; sem isto o push morre calado. */
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    try {
      const antiga = e.oldSubscription || null;
      const chave = antiga && antiga.options && antiga.options.applicationServerKey;
      if (!chave) return;
      const nova = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave });
      const c = await caches.open(CFG);
      const r = await c.match('./__push_url');
      if (!r) return;
      await fetch((await r.text()) + '/push/agenda', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inscricao: nova.toJSON(), agenda: [] }),
      });
    } catch (err) {}
  })());
});

// tocar na notificação abre/foca o app
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return clients.openWindow('./');
    })
  );
});
