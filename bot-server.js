#!/usr/bin/env node
/**
 * bot-server.js
 *
 * Servidor HTTP que corre en el HOST (fuera del sandbox).
 * Recibe peticiones del orquestador y envía mensajes por WhatsApp.
 *
 * Inicio:  node bot-server.js
 * Puerto:  3001 (configurable via PORT)
 * Secret:  birthday-bot-secret (configurable via BOT_SECRET)
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const http   = require('http');

const PORT   = process.env.PORT       || 3001;
const SECRET = process.env.BOT_SECRET || 'birthday-bot-secret';

// ── Estado global del cliente WhatsApp ────────────────────────────────────────
let waClient = null;
let waReady  = false;

function initWhatsApp() {
  waClient = new Client({
    authStrategy: new LocalAuth({ clientId: 'birthday-bot' }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
  });

  waClient.on('qr', (qr) => {
    console.log('\n📱 Escanea este QR con WhatsApp (Ajustes → Dispositivos vinculados):\n');
    qrcode.generate(qr, { small: true });
    console.log('\n⚡ El QR expira en ~20 segundos. Escanea rápido.\n');
  });

  waClient.on('ready', () => {
    waReady = true;
    console.log('✅ WhatsApp conectado y listo');
  });

  waClient.on('authenticated', () => {
    console.log('🔐 Autenticado');
  });

  waClient.on('disconnected', () => {
    waReady = false;
    console.log('⚠️  WhatsApp desconectado — reconectando en 5s...');
    setTimeout(initWhatsApp, 5000);
  });

  waClient.initialize();
}

// ── Servidor HTTP ─────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', whatsapp: waReady }));
    return;
  }

  // Enviar mensaje
  if (req.method === 'POST' && req.url === '/send') {
    const auth = req.headers['x-bot-secret'];
    if (auth !== SECRET) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { phone, message } = JSON.parse(body);

        if (!phone || !message) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'phone y message son requeridos' }));
          return;
        }

        if (!waReady) {
          res.writeHead(503);
          res.end(JSON.stringify({ error: 'WhatsApp no está conectado todavía' }));
          return;
        }

        const chatId = `${phone.replace(/[\s\-\+]/g, '')}@c.us`;
        await waClient.sendMessage(chatId, message);

        console.log(`✅ Enviado a ${phone}: "${message.substring(0, 60)}..."`);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, phone, sentAt: new Date().toISOString() }));

      } catch (err) {
        console.error('❌ Error:', err.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Bot server corriendo en http://0.0.0.0:${PORT}`);
  console.log(`🔑 Secret: ${SECRET}`);
  console.log('📱 Iniciando WhatsApp...\n');
  initWhatsApp();
});
