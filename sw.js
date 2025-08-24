self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Nova Notificação', {
      body: data.body || 'Você recebeu uma notificação!',
      icon: '/icon.png' // Opcional: adicione um ícone se quiser
    })
  );
});
