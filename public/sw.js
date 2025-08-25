const CACHE_NAME = '3c-notif-v2.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.json',
  '/icon.png'
];

// Instalar Service Worker
self.addEventListener('install', function(event) {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Service Worker: Caching files');
        return cache.addAll(urlsToCache);
      })
      .then(function() {
        console.log('Service Worker: Cache complete');
        // Força a ativação imediata
        return self.skipWaiting();
      })
  );
});

// Ativar Service Worker
self.addEventListener('activate', function(event) {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          // Remover caches antigas
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      console.log('Service Worker: Activated');
      // Controlar imediatamente todos os clientes
      return self.clients.claim();
    })
  );
});

// Interceptar requisições (estratégia cache-first para recursos estáticos)
self.addEventListener('fetch', function(event) {
  // Só interceptar requisições GET
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Estratégia cache-first para arquivos estáticos
  if (event.request.url.includes('.js') || 
      event.request.url.includes('.css') || 
      event.request.url.includes('.png') ||
      event.request.url.includes('.html') ||
      event.request.url.includes('manifest.json')) {
    
    event.respondWith(
      caches.match(event.request)
        .then(function(response) {
          // Retornar do cache se disponível
          if (response) {
            return response;
          }
          
          // Senão, buscar da rede
          return fetch(event.request).then(function(response) {
            // Verificar se é uma resposta válida
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clonar a resposta para o cache
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, responseToCache);
            });
            
            return response;
          });
        })
    );
  }
  // Estratégia network-first para APIs
  else if (event.request.url.includes('/subscribe') || 
           event.request.url.includes('/vapidPublicKey') ||
           event.request.url.includes('/sendNotification')) {
    
    event.respondWith(
      fetch(event.request)
        .catch(function() {
          // Fallback se a rede falhar
          return new Response(
            JSON.stringify({ error: 'Sem conexão' }),
            { 
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
  }
});

// Manipular notificações push - OTIMIZADO PARA iOS
self.addEventListener('push', function(event) {
  console.log('Push recebida:', event);
  
  let notificationData = {
    title: 'Nova Notificação - 3C',
    body: 'Você recebeu uma nova notificação!',
    icon: '/icon.png',
    badge: '/icon.png',
    tag: 'turma-3c',
    requireInteraction: false,
    silent: false
  };
  
  // Parse dos dados se existirem
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        ...notificationData,
        ...data
      };
    } catch (e) {
      console.error('Erro ao parsear dados da notificação:', e);
      notificationData.body = event.data.text() || notificationData.body;
    }
  }
  
  // Opções específicas para diferentes plataformas
  const isIOS = /iPad|iPhone|iPod/.test(self.navigator.userAgent);
  if (isIOS) {
    // iOS específico - notificações mais simples
    notificationData.requireInteraction = true;
    notificationData.actions = undefined; // iOS não suporta actions
  } else {
    // Android/Desktop - recursos avançados
    notificationData.actions = [
      {
        action: 'view',
        title: 'Ver Detalhes',
        icon: '/icon.png'
      },
      {
        action: 'dismiss',
        title: 'Dispensar'
      }
    ];
  }
  
  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
      .then(() => {
        console.log('Notificação exibida com sucesso');
      })
      .catch((error) => {
        console.error('Erro ao exibir notificação:', error);
      })
  );
});

// Manipular cliques nas notificações
self.addEventListener('notificationclick', function(event) {
  console.log('Notificação clicada:', event);
  
  event.notification.close();
  
  // Ação baseada no botão clicado
  if (event.action === 'dismiss') {
    return;
  }
  
  // Abrir/focar na aplicação
  event.waitUntil(
    clients.matchAll({ 
      type: 'window',
      includeUncontrolled: true 
    }).then(function(clientList) {
      // Se já existe uma janela/aba aberta, focar nela
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(self.location.origin)) {
          return client.focus();
        }
      }
      
      // Senão, abrir nova janela/aba
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// Manipular fechamento de notificações
self.addEventListener('notificationclose', function(event) {
  console.log('Notificação fechada:', event);
  
  // Analytics ou logging se necessário
  // event.waitUntil(
  //   fetch('/api/notification-closed', {
  //     method: 'POST',
  //     body: JSON.stringify({ tag: event.notification.tag })
  //   })
  // );
});

// Manipular mudanças na subscription
self.addEventListener('pushsubscriptionchange', function(event) {
  console.log('Push subscription changed:', event);
  
  event.waitUntil(
    // Re-inscrever o usuário
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: event.oldSubscription.options.applicationServerKey
    })
    .then(function(newSubscription) {
      // Enviar nova subscription para o servidor
      return fetch('/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newSubscription)
      });
    })
    .catch(function(error) {
      console.error('Erro ao renovar subscription:', error);
    })
  );
});

// Sincronização em background (para PWAs)
self.addEventListener('sync', function(event) {
  console.log('Background sync:', event);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // Executar tarefas em background
      Promise.resolve()
        .then(() => {
          console.log('Background sync completed');
        })
        .catch((error) => {
          console.error('Background sync failed:', error);
        })
    );
  }
});

// Manipular erros
self.addEventListener('error', function(event) {
  console.error('Service Worker error:', event);
});

// Manipular promises rejeitadas
self.addEventListener('unhandledrejection', function(event) {
  console.error('Service Worker unhandled rejection:', event);
  event.preventDefault();
});
