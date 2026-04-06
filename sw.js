const CACHE_NAME = 'ferias-gestao-v1';
const ASSETS_TO_CACHE = [
  'index.html.html',
  'manifest.json',
  'icon-512.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.js',
  'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Instalando o Service Worker e cacheando os arquivos estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('✅ Service Worker: Arquivos em cache');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Ativando e limpando caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
             console.log('🧹 Service Worker: Limpando cache antigo');
             return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Respondendo requisições (Cache First -> Fallback Network)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
