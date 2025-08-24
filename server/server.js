const express = require('express');
const bodyParser = require('body-parser');
const webpush = require('web-push');
const path = require('path');
const fs = require('fs');
const { saveSubscription, getAllSubscriptions, countSubscriptions } = require('./mongodb');

const app = express();
const PORT = 3000;

// VAPID keys sempre no backend!
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

// Endpoint para pegar VAPID public key
app.get('/vapidPublicKey', (req, res) => {
  res.send(vapidKeys.publicKey);
});

// Registrar subscription no MongoDB
app.post('/subscribe', async (req, res) => {
  const subscription = req.body;
  try {
    await saveSubscription(subscription);
    res.status(201).json({});
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar subscription.' });
  }
});

// Enviar notificações a todos
app.post('/sendNotification', async (req, res) => {
  const { title, body } = req.body;
  let sent = 0, failed = 0;
  try {
    const subscriptions = await getAllSubscriptions();
    await Promise.all(subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, JSON.stringify({ title, body }));
        sent++;
      } catch (err) {
        failed++;
      }
    }));
    res.json({ sent, failed });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao enviar notificações.' });
  }
});

// Dashboard mostrando o número de dispositivos
app.get('/dashboard', async (req, res) => {
  try {
    const count = await countSubscriptions();
    res.send(`
      <html lang="pt-br">
<head>
    <title>Dashboard de Notificações 3C</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        function checkLogin(event) {
            event.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            if (username === 'admin' && password === 'administrador25') {
                document.getElementById('loginForm').classList.add('hidden');
                document.getElementById('dashboardContent').classList.remove('hidden');
            } else {
                alert('Usuário ou senha incorretos!');
            }
        }

        // Mantendo a funcionalidade original do formulário de notificação
        document.addEventListener('DOMContentLoaded', function() {
            document.getElementById('notifForm').onsubmit = async function(e) {
                e.preventDefault();
                const title = document.getElementById('title').value;
                const body = document.getElementById('body').value;
                const r = await fetch('/sendNotification', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({title, body})
                });
                const res = await r.json();
                document.getElementById('result').innerText =
                    'Enviadas: ' + res.sent + ' | Falharam: ' + res.failed;
            }
        });
    </script>
</head>
<body class="bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
    <!-- Login Form -->
    <div id="loginForm" class="container mx-auto px-4 py-8">
        <div class="max-w-md mx-auto bg-white rounded-xl shadow-lg overflow-hidden p-8 mt-20">
            <div class="text-center mb-8">
                <img src="/icon.png" alt="Logo 3C" class="h-20 w-auto mx-auto mb-6">
                <h2 class="text-2xl font-bold text-gray-800">Dashboard Administrativo</h2>
                <p class="text-gray-600 mt-2">Faça login para continuar</p>
            </div>
            
            <form onsubmit="checkLogin(event)" class="space-y-4">
                <div>
                    <label for="username" class="block text-sm font-medium text-gray-700">Usuário</label>
                    <input type="text" id="username" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" required>
                </div>
                <div>
                    <label for="password" class="block text-sm font-medium text-gray-700">Senha</label>
                    <input type="password" id="password" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" required>
                </div>
                <button type="submit" class="w-full bg-blue-600 text-white rounded-lg py-2 px-4 hover:bg-blue-700 transition duration-300">
                    Entrar
                </button>
            </form>
        </div>
    </div>

    <!-- Dashboard Content (Initially Hidden) -->
    <div id="dashboardContent" class="hidden container mx-auto px-4 py-8">
        <div class="max-w-2xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden p-8">
            <div class="text-center mb-8">
                <img src="/icon.png" alt="Logo 3C" class="h-16 w-auto mx-auto mb-4">
                <h1 class="text-3xl font-bold text-gray-800">Dashboard de Notificações</h1>
            </div>

            <div class="bg-blue-50 rounded-lg p-4 mb-6">
                <p class="text-lg text-gray-700">
                    Dispositivos registrados: <strong class="text-blue-600">${count}</strong>
                </p>
            </div>

            <form id="notifForm" class="space-y-4">
                <div>
                    <label for="title" class="block text-sm font-medium text-gray-700">Título da Notificação</label>
                    <input type="text" id="title" name="title" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" required>
                </div>
                
                <div>
                    <label for="body" class="block text-sm font-medium text-gray-700">Mensagem da Notificação</label>
                    <textarea id="body" name="body" rows="3" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" required></textarea>
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
</body>
</html>
    `);
  } catch (err) {
    res.status(500).send('Erro ao carregar dashboard.');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
