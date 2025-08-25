const subscribeBtn = document.getElementById('subscribeBtn');
const statusDiv = document.getElementById('status');

// Detectar o dispositivo e navegador
function detectDevice() {
  const userAgent = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(userAgent);
  const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  
  return {
    isIOS,
    isSafari,
    isStandalone,
    isAndroid: /android/.test(userAgent),
    isChrome: /chrome/.test(userAgent)
  };
}

// Verificar suporte a notificações
function checkNotificationSupport() {
  const device = detectDevice();
  
  // iOS Safari só suporta notificações push em PWA instalada (iOS 16.4+)
  if (device.isIOS) {
    if (!device.isStandalone) {
      return {
        supported: false,
        reason: 'ios_install_required',
        message: 'No iPhone, você precisa instalar o app na tela inicial primeiro!'
      };
    }
    
    // Verificar se é iOS 16.4+ (suporte a push em PWA)
    const match = navigator.userAgent.match(/OS (\d+)_(\d+)/);
    if (match) {
      const majorVersion = parseInt(match[1]);
      const minorVersion = parseInt(match[2]);
      
      if (majorVersion < 16 || (majorVersion === 16 && minorVersion < 4)) {
        return {
          supported: false,
          reason: 'ios_version',
          message: 'Seu iOS precisa ser versão 16.4 ou superior para receber notificações.'
        };
      }
    }
  }
  
  // Verificar suporte básico
  if (!('serviceWorker' in navigator)) {
    return {
      supported: false,
      reason: 'no_sw',
      message: 'Seu navegador não suporta Service Workers.'
    };
  }
  
  if (!('PushManager' in window)) {
    return {
      supported: false,
      reason: 'no_push',
      message: 'Seu navegador não suporta notificações push.'
    };
  }
  
  if (!('Notification' in window)) {
    return {
      supported: false,
      reason: 'no_notifications',
      message: 'Seu navegador não suporta notificações.'
    };
  }
  
  return { supported: true };
}

// Mostrar instruções específicas para iOS
function showIOSInstructions() {
  const device = detectDevice();
  
  if (device.isIOS && !device.isStandalone) {
    const instructionsDiv = document.createElement('div');
    instructionsDiv.className = 'bg-blue-50 border-l-4 border-blue-400 p-4 mb-4 rounded';
    instructionsDiv.innerHTML = `
      <div class="flex">
        <div class="flex-shrink-0">
          <svg class="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
          </svg>
        </div>
        <div class="ml-3">
          <h3 class="text-sm font-medium text-blue-800">Como instalar no iPhone:</h3>
          <div class="mt-2 text-sm text-blue-700">
            <ol class="list-decimal list-inside space-y-1">
              <li>Toque no ícone de <strong>Compartilhar</strong> no Safari</li>
              <li>Role para baixo e toque em <strong>"Adicionar à Tela de Início"</strong></li>
              <li>Toque em <strong>"Adicionar"</strong></li>
              <li>Abra o app pela tela inicial e ative as notificações</li>
            </ol>
          </div>
        </div>
      </div>
    `;
    
    // Inserir as instruções antes do botão
    subscribeBtn.parentNode.insertBefore(instructionsDiv, subscribeBtn);
    
    // Modificar o texto do botão
    subscribeBtn.innerHTML = `
      <svg class="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
      </svg>
      Instalar App
    `;
    
    return true;
  }
  
  return false;
}

// Registrar Service Worker com fallbacks
async function registerServiceWorker() {
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    });
    
    // Aguardar o service worker estar pronto
    if (registration.installing) {
      await new Promise(resolve => {
        registration.installing.addEventListener('statechange', () => {
          if (registration.installing.state === 'installed') {
            resolve();
          }
        });
      });
    }
    
    return registration;
  } catch (error) {
    console.error('Erro ao registrar Service Worker:', error);
    throw error;
  }
}

// Solicitar permissão de notificação com retry
async function requestNotificationPermission() {
  const device = detectDevice();
  
  try {
    // No iOS, a permissão deve ser solicitada de forma específica
    if (device.isIOS) {
      // Aguardar um pouco antes de solicitar (iOS pode ser sensível ao timing)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      return true;
    } else if (permission === 'denied') {
      throw new Error('Permissão negada pelo usuário');
    } else {
      throw new Error('Permissão não foi concedida');
    }
  } catch (error) {
    console.error('Erro ao solicitar permissão:', error);
    throw error;
  }
}

// Função principal do botão subscribe
subscribeBtn.addEventListener('click', async () => {
  // Mostrar loading
  subscribeBtn.disabled = true;
  subscribeBtn.innerHTML = `
    <svg class="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    Processando...
  `;
  statusDiv.textContent = '';
  
  try {
    // Verificar se deve mostrar instruções do iOS
    if (showIOSInstructions()) {
      statusDiv.innerHTML = '<p class="text-blue-600">📱 Siga as instruções acima para instalar o app no seu iPhone</p>';
      return;
    }
    
    // Verificar suporte
    const supportCheck = checkNotificationSupport();
    if (!supportCheck.supported) {
      statusDiv.innerHTML = `<p class="text-red-600">❌ ${supportCheck.message}</p>`;
      return;
    }
    
    // Registrar Service Worker
    statusDiv.textContent = 'Registrando Service Worker...';
    const registration = await registerServiceWorker();
    
    // Solicitar permissão
    statusDiv.textContent = 'Solicitando permissão...';
    await requestNotificationPermission();
    
    // Obter VAPID key
    statusDiv.textContent = 'Configurando notificações...';
    const vapidResponse = await fetch('/vapidPublicKey');
    if (!vapidResponse.ok) {
      throw new Error('Erro ao obter chave VAPID');
    }
    
    const vapidPublicKey = (await vapidResponse.text()).trim();
    const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
    
    // Criar subscription
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey
    });
    
    // Enviar subscription para o servidor
    statusDiv.textContent = 'Salvando configurações...';
    const subscribeResponse = await fetch('/subscribe', {
      method: 'POST',
      body: JSON.stringify(subscription),
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!subscribeResponse.ok) {
      throw new Error('Erro ao salvar subscription');
    }
    
    // Sucesso!
    statusDiv.innerHTML = '<p class="text-green-600">✅ Notificações ativadas com sucesso!</p>';
    subscribeBtn.innerHTML = `
      <svg class="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
      </svg>
      Notificações Ativas
    `;
    subscribeBtn.className = subscribeBtn.className.replace('bg-blue-600 hover:bg-blue-700', 'bg-green-600 hover:bg-green-700');
    
    // Enviar notificação de teste após 3 segundos
    setTimeout(() => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Bem-vindo!', {
          body: 'Suas notificações da Turma 3C estão ativadas! 🎉',
          icon: '/icon.png',
          badge: '/icon.png'
        });
      }
    }, 3000);
    
  } catch (error) {
    console.error('Erro ao ativar notificações:', error);
    
    let errorMessage = 'Erro inesperado';
    if (error.message.includes('not supported')) {
      errorMessage = 'Seu dispositivo não suporta notificações push';
    } else if (error.message.includes('denied') || error.message.includes('Permission')) {
      errorMessage = 'Permissão negada. Verifique as configurações do navegador';
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      errorMessage = 'Erro de conexão. Verifique sua internet';
    }
    
    statusDiv.innerHTML = `<p class="text-red-600">❌ ${errorMessage}</p>`;
  } finally {
    // Restaurar botão
    if (!subscribeBtn.innerHTML.includes('Notificações Ativas')) {
      subscribeBtn.disabled = false;
      subscribeBtn.innerHTML = `
        <svg class="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
        </svg>
        Ativar Notificações
      `;
    }
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

// Verificar status quando a página carrega
document.addEventListener('DOMContentLoaded', () => {
  const device = detectDevice();
  
  // Log de debug (remover em produção)
  console.log('Dispositivo detectado:', device);
  
  // Verificar se já está subscrito
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    navigator.serviceWorker.ready.then(registration => {
      return registration.pushManager.getSubscription();
    }).then(subscription => {
      if (subscription) {
        statusDiv.innerHTML = '<p class="text-green-600">✅ Notificações já estão ativas!</p>';
        subscribeBtn.innerHTML = `
          <svg class="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
          Notificações Ativas
        `;
        subscribeBtn.className = subscribeBtn.className.replace('bg-blue-600 hover:bg-blue-700', 'bg-green-600 hover:bg-green-700');
      }
    }).catch(err => {
      console.log('Erro ao verificar subscription existente:', err);
    });
  }
  
  // Mostrar instruções do iOS se necessário
  showIOSInstructions();
});
