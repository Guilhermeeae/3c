const subscribeBtn = document.getElementById('subscribeBtn');
const statusDiv = document.getElementById('status');

subscribeBtn.addEventListener('click', async () => {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      statusDiv.textContent = 'Service Worker registrado!';
      
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        statusDiv.textContent = 'Permissão negada para notificações.';
        return;
      }

      // Pegue a VAPID public key do backend
      const vapidPublicKey = (await fetch('/vapidPublicKey').then(r => r.text())).trim();
      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });

      // Envie o subscription para o backend
      await fetch('/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription),
        headers: { 'Content-Type': 'application/json' }
      });

      statusDiv.textContent = 'Notificações ativadas!';
    } catch (err) {
      statusDiv.textContent = 'Erro: ' + err.message;
    }
  } else {
    statusDiv.textContent = 'Navegador não suporta notificações.';
  }
});

// Helper para converter VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
