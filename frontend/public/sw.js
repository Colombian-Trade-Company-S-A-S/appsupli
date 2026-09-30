// Service worker mínimo: existe para que el navegador ofrezca «Instalar».
// No cachea nada a propósito, así cada deploy en Render se ve de inmediato.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // Sin respondWith: el navegador hace la petición como siempre.
});
