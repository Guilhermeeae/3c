const express = require('express');
const bodyParser = require('body-parser');
const webpush = require('web-push');
const path = require('path');
const fs = require('fs');
const { saveSubscription, getAllSubscriptions, countSubscriptions } = require('./mongodb');

const app = express();
const PORT = 3000;

// Configuração VAPID
const vapidKeys = {
  publicKey: fs.readFileSync(path.join(__dirname, '../vapid/public_key.txt')).toString(),
  privateKey: fs.readFileSync(path.join(__dirname, '../vapid/private_key.txt')).toString(),
};

webpush.setVapidDetails(
  'mailto:contato@sosfirst.site',
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
      <html>
        <head><title>Dashboard de Push</title></head>
        <body>
          <h1>Dashboard de Push</h1>
          <form id="notifForm">
            <input id="title" name="title" placeholder="Título" required />
            <input id="body" name="body" placeholder="Corpo" required />
            <button type="submit">Enviar Notificação</button>
          </form>
          <div id="result"></div>
          <p>Dispositivos registrados: <strong>${count}</strong></p>
          <script>
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
          </script>
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
