const express = require('express');
const bodyParser = require('body-parser');
const webpush = require('web-push');
const path = require('path');
const fs = require('fs');
const { 
  saveSubscription, 
  getAllSubscriptions, 
  countSubscriptions,
  saveNotification,
  getAllNotifications,
  getUserByUsername,
  initializeUsers
} = require('./mongodb');

const app = express();
const PORT = 3000;

// VAPID keys - MANTIDOS OS MESMOS
const vapidKeys = {
  publicKey: fs.readFileSync(path.join(__dirname, '../vapid/public_key.txt')).toString().trim(),
  privateKey: fs.readFileSync(path.join(__dirname, '../vapid/private_key.txt')).toString().trim(),
};
webpush.setVapidDetails(
  'mailto:seuemail@dominio.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

app.use(express.static(path.join(__dirname, '../public')));
app.use(bodyParser.json());

// Inicializar usuários (apenas executar uma vez ou comentar depois)
// initializeUsers();

// Endpoint para pegar VAPID public key
app.get('/vapidPublicKey', (req, res) => {
  res.send(vapidKeys.publicKey);
});

// Registrar subscription no MongoDB
app.post('/subscribe', async (req, res) => {
  const subscription = req.body;
  try {
    if (
      !subscription ||
      !subscription.endpoint ||
      !subscription.keys ||
      !subscription.keys.auth ||
      !subscription.keys.p256dh
    ) {
      return res.status(400).json({ error: 'Subscription inválida.' });
    }
    await saveSubscription(subscription);
    res.status(201).json({});
  } catch (err) {
    console.error('Erro ao salvar subscription:', err.message);
    res.status(500).json({ error: 'Erro ao salvar subscription.' });
  }
});

// Login do usuário
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await getUserByUsername(username);
    if (user && user.password === password) {
      res.json({ success: true, username: user.username });
    } else {
      res.status(401).json({ success: false, message: 'Usuário ou senha incorretos' });
    }
  } catch (err) {
    console.error('Erro no login:', err.message);
    res.status(500).json({ success: false, message: 'Erro no servidor' });
  }
});

// Buscar todas as notificações
app.get('/notifications', async (req, res) => {
  try {
    const notifications = await getAllNotifications();
    res.json(notifications);
  } catch (err) {
    console.error('Erro ao buscar notificações:', err.message);
    res.status(500).json({ error: 'Erro ao buscar notificações.' });
  }
});

// Enviar notificações a todos (COM MELHORIAS)
app.post('/sendNotification', async (req, res) => {
  const { title, body, imageUrl, buttonText, buttonUrl, sentBy } = req.body;
  let sent = 0, failed = 0;
  
  try {
    const subscriptions = await getAllSubscriptions();
    if (!subscriptions || subscriptions.length === 0) {
      return res.json({ sent: 0, failed: 0, message: 'Nenhuma subscription registrada.' });
    }

    // Salvar notificação no banco de dados
    const notification = {
      title,
      body,
      imageUrl: imageUrl || null,
      buttonText: buttonText || null,
      buttonUrl: buttonUrl || null,
      sentBy: sentBy || 'Sistema',
      timestamp: new Date()
    };
    await saveNotification(notification);

    // Preparar payload da notificação
    const payload = {
      title,
      body,
      icon: '/icon.png',
      image: imageUrl || undefined,
      data: {
        url: buttonUrl || '/',
        buttonText: buttonText || undefined
      }
    };

    // Enviar para todos os dispositivos
    await Promise.all(subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload));
        sent++;
      } catch (err) {
        console.error('Erro ao enviar para subscription:', err.message);
        failed++;
      }
    }));

    res.json({ sent, failed });
  } catch (err) {
    console.error('Erro geral ao enviar notificações:', err.message);
    res.status(500).json({ error: 'Erro ao enviar notificações.' });
  }
});

// Dashboard
app.get('/dashboard', async (req, res) => {
  try {
    const count = await countSubscriptions();
    res.send(`
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <title>Dashboard de Notificações 3C</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
    <div id="loginForm" class="container mx-auto px-4 py-8">
        <div class="max-w-md mx-auto bg-white rounded-xl shadow-lg overflow-hidden p-8 mt-20">
            <div class="text-center mb-8">
                <img src="/icon.png" alt="Logo 3C" class="h-20 w-auto mx-auto mb-6">
                <h2 class="text-2xl font-bold text-gray-800">Dashboard Administrativo</h2>
                <p class="text-gray-600 mt-2">Faça login para continuar</p>
            </div>
            <form id="loginFormElement" class="space-y-4">
                <div>
                    <label for="username" class="block text-sm font-medium text-gray-700">Usuário</label>
                    <input type="text" id="username" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" required>
                </div>
                <div>
                    <label for="password" class="block text-sm font-medium text-gray-700">Senha</label>
                    <input type="password" id="password" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" required>
                </div>
                <div id="loginError" class="text-red-600 text-sm hidden"></div>
                <button type="submit" class="w-full bg-blue-600 text-white rounded-lg py-2 px-4 hover:bg-blue-700 transition duration-300">
                    Entrar
                </button>
            </form>
        </div>
    </div>
    
    <div id="dashboardContent" class="hidden container mx-auto px-4 py-8">
        <div class="max-w-2xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden p-8">
            <div class="flex justify-between items-center mb-8">
                <div class="flex items-center">
                    <img src="/icon.png" alt="Logo 3C" class="h-16 w-auto mr-4">
                    <div>
                        <h1 class="text-3xl font-bold text-gray-800">Dashboard de Notificações</h1>
                        <p class="text-sm text-gray-600">Logado como: <span id="currentUser" class="font-semibold"></span></p>
                    </div>
                </div>
                <button onclick="logout()" class="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition">Sair</button>
            </div>
            
            <div class="bg-blue-50 rounded-lg p-4 mb-6">
                <p class="text-lg text-gray-700">
                    Dispositivos registrados: <strong class="text-blue-600">${count}</strong>
                </p>
            </div>
            
            <form id="notifForm" class="space-y-4">
                <div>
                    <label for="title" class="block text-sm font-medium text-gray-700">Título da Notificação *</label>
                    <input type="text" id="title" name="title" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" required>
                </div>
                <div>
                    <label for="body" class="block text-sm font-medium text-gray-700">Descrição da Notificação *</label>
                    <textarea id="body" name="body" rows="3" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" required></textarea>
                </div>
                <div>
                    <label for="imageUrl" class="block text-sm font-medium text-gray-700">URL da Imagem (opcional)</label>
                    <input type="url" id="imageUrl" name="imageUrl" placeholder="https://exemplo.com/imagem.jpg" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border">
                </div>
                <div class="bg-gray-50 p-4 rounded-lg">
                    <p class="font-medium text-gray-700 mb-2">Botão de Ação (opcional)</p>
                    <div class="space-y-2">
                        <div>
                            <label for="buttonText" class="block text-sm font-medium text-gray-700">Texto do Botão</label>
                            <input type="text" id="buttonText" name="buttonText" placeholder="Ex: Ver mais" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border">
                        </div>
                        <div>
                            <label for="buttonUrl" class="block text-sm font-medium text-gray-700">Link do Botão</label>
                            <input type="url" id="buttonUrl" name="buttonUrl" placeholder="https://exemplo.com" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border">
                        </div>
                    </div>
                </div>
                <button type="submit" class="w-full bg-blue-600 text-white rounded-lg py-3 px-4 hover:bg-blue-700 transition duration-300 flex items-center justify-center">
                    <svg class="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
                    </svg>
                    Enviar Notificação
                </button>
            </form>
            <div id="result" class="mt-4 p-4 rounded-lg bg-gray-50 text-center text-gray-700"></div>
        </div>
    </div>

    <script>
        let currentUsername = '';

        document.getElementById('loginFormElement').onsubmit = async function(e) {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const loginError = document.getElementById('loginError');
            
            try {
                const r = await fetch('/login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({username, password})
                });
                const res = await r.json();
                
                if (res.success) {
                    currentUsername = res.username;
                    document.getElementById('currentUser').innerText = currentUsername;
                    document.getElementById('loginForm').classList.add('hidden');
                    document.getElementById('dashboardContent').classList.remove('hidden');
                    loginError.classList.add('hidden');
                } else {
                    loginError.innerText = res.message;
                    loginError.classList.remove('hidden');
                }
            } catch (err) {
                loginError.innerText = 'Erro ao conectar com o servidor';
                loginError.classList.remove('hidden');
            }
        };

        function logout() {
            currentUsername = '';
            document.getElementById('loginForm').classList.remove('hidden');
            document.getElementById('dashboardContent').classList.add('hidden');
            document.getElementById('username').value = '';
            document.getElementById('password').value = '';
        }

        document.getElementById('notifForm').onsubmit = async function(e) {
            e.preventDefault();
            const title = document.getElementById('title').value;
            const body = document.getElementById('body').value;
            const imageUrl = document.getElementById('imageUrl').value;
            const buttonText = document.getElementById('buttonText').value;
            const buttonUrl = document.getElementById('buttonUrl').value;
            
            const r = await fetch('/sendNotification', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    title, 
                    body, 
                    imageUrl, 
                    buttonText, 
                    buttonUrl,
                    sentBy: currentUsername
                })
            });
            const res = await r.json();
            document.getElementById('result').innerText =
                'Enviadas: ' + res.sent + ' | Falharam: ' + res.failed + (res.message ? ' - ' + res.message : '');
            
            // Limpar formulário
            document.getElementById('notifForm').reset();
        };
    </script>
</body>
</html>
    `);
  } catch (err) {
    console.error('Erro ao carregar dashboard:', err.message);
    res.status(500).send('Erro ao carregar dashboard.');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
