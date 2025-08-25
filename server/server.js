const express = require('express');
const bodyParser = require('body-parser');
const webpush = require('web-push');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const crypto = require('crypto');
const { saveSubscription, getAllSubscriptions, countSubscriptions, deleteSubscription, getRecentSubscriptions } = require('./mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// VAPID keys
const vapidKeys = {
  publicKey: fs.readFileSync(path.join(__dirname, '../vapid/public_key.txt')).toString().trim(),
  privateKey: fs.readFileSync(path.join(__dirname, '../vapid/private_key.txt')).toString().trim(),
};

webpush.setVapidDetails(
  'mailto:admin@turma3c.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Middleware para CORS e headers de segurança
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  if (req.get('User-Agent') && req.get('User-Agent').includes('Safari')) {
    res.header('X-Webkit-CSP', "default-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com");
  }
  
  next();
});

// Configurar rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // limite de 100 requisições por IP
  message: 'Muitas requisições deste IP, tente novamente mais tarde.'
});

// Configurar sessão
app.use(session({
  secret: crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  }
}));

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, '../public'), {
  setHeaders: (res, path) => {
    if (path.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Service-Worker-Allowed', '/');
    }
    else if (path.endsWith('manifest.json')) {
      res.setHeader('Content-Type', 'application/manifest+json');
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
    else if (path.includes('icon')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
  }
}));

app.use(bodyParser.json({ limit: '10mb' }));

// Middleware de autenticação
const requireAuth = (req, res, next) => {
  if (req.session && req.session.isAuthenticated) {
    next();
  } else {
    res.redirect('/login');
  }
};

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// VAPID public key endpoint
app.get('/vapidPublicKey', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(vapidKeys.publicKey);
});

// Login page
app.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Login - Dashboard 3C</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
      <div class="container mx-auto px-4 py-8">
        <div class="max-w-md mx-auto bg-white rounded-xl shadow-lg overflow-hidden p-8 mt-20">
          <div class="text-center mb-8">
            <img src="/icon.png" alt="Logo 3C" class="h-20 w-auto mx-auto mb-6">
            <h2 class="text-2xl font-bold text-gray-800">Dashboard Administrativo</h2>
            <p class="text-gray-600 mt-2">Faça login para continuar</p>
          </div>
          
          <form action="/login" method="POST" class="space-y-4">
            <div>
              <label for="username" class="block text-sm font-medium text-gray-700">Usuário</label>
              <input type="text" id="username" name="username" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" required>
            </div>
            <div>
              <label for="password" class="block text-sm font-medium text-gray-700">Senha</label>
              <input type="password" id="password" name="password" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" required>
            </div>
            <button type="submit" class="w-full bg-blue-600 text-white rounded-lg py-2 px-4 hover:bg-blue-700 transition duration-300">
              Entrar
            </button>
          </form>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Process login
app.post('/login', limiter, (req, res) => {
  const { username, password } = req.body;
  
  const validUsername = process.env.ADMIN_USER || 'admin';
  const validPassword = process.env.ADMIN_PASS || 'administrador25';
  
  if (username === validUsername && password === validPassword) {
    req.session.isAuthenticated = true;
    res.redirect('/dashboard');
  } else {
    res.status(401).send('Usuário ou senha incorretos');
  }
});

// Subscribe endpoint
app.post('/subscribe', async (req, res) => {
  const subscription = req.body;
  
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ 
      error: 'Dados de subscription inválidos',
      required: ['endpoint', 'keys.p256dh', 'keys.auth']
    });
  }
  
  try {
    const userAgent = req.get('User-Agent') || '';
    const deviceType = detectDeviceType(userAgent);
    
    const subscriptionWithMetadata = {
      ...subscription,
      metadata: {
        userAgent,
        deviceType,
        timestamp: new Date(),
        ip: req.ip || req.connection.remoteAddress,
        headers: {
          'accept-language': req.get('Accept-Language'),
          'accept': req.get('Accept')
        }
      }
    };
    
    await saveSubscription(subscriptionWithMetadata);
    
    console.log(`Nova subscription registrada: ${deviceType}`);
    
    res.status(201).json({ 
      success: true,
      message: 'Subscription registrada com sucesso',
      deviceType
    });
  } catch (err) {
    console.error('Erro ao salvar subscription:', err);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: 'Não foi possível salvar a subscription'
    });
  }
});

// Send notification endpoint
app.post('/sendNotification', requireAuth, async (req, res) => {
  const { title, body, url, icon, badge, tag } = req.body;
  
  if (!title || !body) {
    return res.status(400).json({
      error: 'Título e corpo são obrigatórios'
    });
  }
  
  let sent = 0, failed = 0;
  const failedEndpoints = [];
  
  try {
    const subscriptions = await getAllSubscriptions();
    
    if (subscriptions.length === 0) {
      return res.json({
        sent: 0,
        failed: 0,
        message: 'Nenhuma subscription encontrada'
      });
    }
    
    const notificationPayload = JSON.stringify({
      title,
      body,
      url,
      icon: icon || '/icon.png',
      badge: badge || '/icon.png',
      tag: tag || 'turma-3c',
      timestamp: Date.now()
    });

    const batchSize = 50;
    for (let i = 0; i < subscriptions.length; i += batchSize) {
      const batch = subscriptions.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (sub) => {
        try {
          await webpush.sendNotification(sub, notificationPayload);
          sent++;
        } catch (err) {
          failed++;
          failedEndpoints.push({
            endpoint: sub.endpoint,
            error: err.statusCode || err.message
          });
          
          if (err.statusCode === 410) {
            try {
              await deleteSubscription(sub.endpoint);
              console.log('Subscription removida:', sub.endpoint);
            } catch (deleteErr) {
              console.error('Erro ao remover subscription:', deleteErr);
            }
          }
        }
      }));
    }

    res.json({
      sent,
      failed,
      total: subscriptions.length,
      failedEndpoints: failedEndpoints.length > 0 ? failedEndpoints : undefined
    });
  } catch (err) {
    console.error('Erro ao enviar notificações:', err);
    res.status(500).json({
      error: 'Erro ao enviar notificações',
      message: err.message
    });
  }
});

// Dashboard page
app.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const [count, recentSubscriptions] = await Promise.all([
      countSubscriptions(),
      getRecentSubscriptions()
    ]);
    
    const deviceStats = recentSubscriptions.reduce((acc, sub) => {
      const type = sub.metadata?.deviceType || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    const html = `<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard de Notificações 3C</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body class="bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
    <div class="container mx-auto px-4 py-8">
        <div class="max-w-4xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden p-8">
            <div class="text-center mb-8">
                <img src="/icon.png" alt="Logo 3C" class="h-16 w-auto mx-auto mb-4">
                <h1 class="text-3xl font-bold text-gray-800">Dashboard de Notificações</h1>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div class="bg-blue-50 rounded-lg p-4">
                    <h3 class="text-lg font-semibold text-gray-700">Total de Dispositivos</h3>
                    <p class="text-3xl font-bold text-blue-600">${count}</p>
                </div>
                
                <div class="bg-green-50 rounded-lg p-4">
                    <h3 class="text-lg font-semibold text-gray-700">iOS</h3>
                    <p class="text-3xl font-bold text-green-600">${deviceStats.ios || 0}</p>
                </div>
                
                <div class="bg-purple-50 rounded-lg p-4">
                    <h3 class="text-lg font-semibold text-gray-700">Android</h3>
                    <p class="text-3xl font-bold text-purple-600">${deviceStats.android || 0}</p>
                </div>
            </div>

            <div class="mb-8">
                <canvas id="deviceChart"></canvas>
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

                <div>
                    <label for="url" class="block text-sm font-medium text-gray-700">URL (opcional)</label>
                    <input type="url" id="url" name="url" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border">
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
        const ctx = document.getElementById('deviceChart').getContext('2d');
        new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['iOS', 'Android', 'Outros'],
                datasets: [{
                    data: [${deviceStats.ios || 0}, ${deviceStats.android || 0}, ${deviceStats.unknown || 0}],
                    backgroundColor: [
                        'rgba(54, 162, 235, 0.2)',
                        'rgba(153, 102, 255, 0.2)',
                        'rgba(201, 203, 207, 0.2)'
                    ],
                    borderColor: [
                        'rgb(54, 162, 235)',
                        'rgb(153, 102, 255)',
                        'rgb(201, 203, 207)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' },
                    title: {
                        display: true,
                        text: 'Distribuição de Dispositivos'
                    }
                }
            }
        });

        document.getElementById('notifForm').onsubmit = async function(e) {
            e.preventDefault();
            const button = this.querySelector('button');
            const result = document.getElementById('result');
            
            button.disabled = true;
            button.innerHTML = \`<svg class="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Enviando...\`;
            
            try {
                const r = await fetch('/sendNotification', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        title: document.getElementById('title').value,
                        body: document.getElementById('body').value,
                        url: document.getElementById('url').value
                    })
                });
                
                const res = await r.json();
                
                result.innerHTML = \`
                    <div class="flex items-center justify-center space-x-4">
                        <div class="text-green-600">
                            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                            </svg>
                        </div>
                        <div>
                            <p>Enviadas: <strong>\${res.sent}</strong> | Falhas: <strong>\${res.failed}</strong></p>
                            <p class="text-sm text-gray-500">Total: \${res.total}</p>
                        </div>
                    </div>
                \`;
            } catch (error) {
                result.innerHTML = \`
                    <div class="text-red-600">
                        <p>Erro ao enviar notificações</p>
                        <p class="text-sm">\${error.message}</p>
                    </div>
                \`;
            } finally {
                button.disabled = false;
                button.innerHTML = \`
                    <svg class="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
                    </svg>
                    Enviar Notificação
                \`;
            }
        };
    </script>
</body>
</html>`;

    res.send(html);
  } catch (err) {
    console.error('Erro ao carregar dashboard:', err);
    res.status(500).send('Erro ao carregar dashboard.');
  }
});

// Utility function to detect device type
function detectDeviceType(userAgent) {
  if (/iPad|iPhone|iPod/.test(userAgent)) {
    return 'ios';
  } else if (/android/i.test(userAgent)) {
    return 'android';
  } else {
    return 'desktop';
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log('Ambiente:', process.env.NODE_ENV || 'development');
});

// Handle uncaught errors
process.on('unhandledRejection', (err) => {
  console.error('Erro não tratado:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Exceção não capturada:', err);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});
