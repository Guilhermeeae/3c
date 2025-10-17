self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body || 'Você recebeu uma notificação!',
    icon: data.icon || '/icon.png',
    badge: '/icon.png',
    vibrate: [200, 100, 200],
    tag: 'notification-' + Date.now(),
    requireInteraction: false,
    data: {
      url: data.data?.url || '/',
      buttonText: data.data?.buttonText
    }
  };
  
  // Adicionar imagem se existir
  if (data.image) {
    options.image = data.image;
  }
  
  // Adicionar ações (botões) se existir
  if (data.data?.buttonText && data.data?.url) {
    options.actions = [
      {
        action: 'open',
        title: data.data.buttonText,
        icon: '/icon.png'
      }
    ];
  }
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Nova Notificação', options)
  );
});

// Evento de clique na notificação
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(function(clientList) {
      // Se já houver uma janela aberta, focar nela
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Caso contrário, abrir nova janela
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
