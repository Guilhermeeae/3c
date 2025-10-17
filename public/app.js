const subscribeBtn = document.getElementById('subscribeBtn');
const statusDiv = document.getElementById('status');
const notificationsList = document.getElementById('notificationsList');

// Carregar notificações ao carregar a página
loadNotifications();

subscribeBtn.addEventListener('click', async () => {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      statusDiv.textContent = 'Service Worker registrado!';
      
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        statusDiv.textContent = 'Permissão negada para notificações.';
        statusDiv.className = 'mb-4 text-sm text-red-600';
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

      statusDiv.textContent = 'Notificações ativadas com sucesso!';
      statusDiv.className = 'mb-4 text-sm text-green-600 font-semibold';
    } catch (err) {
      statusDiv.textContent = 'Erro: ' + err.message;
      statusDiv.className = 'mb-4 text-sm text-red-600';
    }
  } else {
    statusDiv.textContent = 'Navegador não suporta notificações.';
    statusDiv.className = 'mb-4 text-sm text-red-600';
  }
});

// Carregar notificações anteriores
async function loadNotifications() {
  try {
    const response = await fetch('/notifications');
    const notifications = await response.json();
    
    if (notifications.length === 0) {
      notificationsList.innerHTML = `
        <div class="text-center text-gray-500 py-8">
          <svg class="h-16 w-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
          </svg>
          <p>Nenhuma notificação ainda</p>
        </div>
      `;
      return;
    }
    
    notificationsList.innerHTML = notifications.map(notif => {
      const date = new Date(notif.timestamp);
      const formattedDate = date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      const formattedTime = date.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
      });
      
      return `
        <div class="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border-l-4 border-blue-500 shadow-sm hover:shadow-md transition">
          <div class="flex justify-between items-start mb-3">
            <h3 class="text-xl font-bold text-gray-800">${escapeHtml(notif.title)}</h3>
            <div class="text-xs text-gray-500 text-right">
              <div>${formattedDate}</div>
              <div>${formattedTime}</div>
            </div>
          </div>
          <p class="text-gray-700 mb-3">${escapeHtml(notif.body)}</p>
          ${notif.imageUrl ? `
            <img src="${escapeHtml(notif.imageUrl)}" alt="Imagem da notificação" class="w-full h-48 object-cover rounded-lg mb-3">
          ` : ''}
          <div class="flex justify-between items-center">
            <div class="flex items-center text-sm text-gray-600">
              <svg class="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
              </svg>
              <span>Enviado por: <strong>${escapeHtml(notif.sentBy)}</strong></span>
            </div>
            ${notif.buttonText && notif.buttonUrl ? `
              <a href="${escapeHtml(notif.buttonUrl)}" target="_blank" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition duration-300 flex items-center">
                ${escapeHtml(notif.buttonText)}
                <svg class="h-4 w-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                </svg>
              </a>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
    
  } catch (err) {
    console.error('Erro ao carregar notificações:', err);
    notificationsList.innerHTML = `
      <div class="text-center text-red-500 py-8">
        <p>Erro ao carregar notificações</p>
      </div>
    `;
  }
}

// Função para escapar HTML e prevenir XSS
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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
