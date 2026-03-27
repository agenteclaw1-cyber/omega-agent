require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Anthropic   = require('@anthropic-ai/sdk').default;
const express     = require('express');

const TOKEN    = process.env.TELEGRAM_TOKEN;
const OWNER_ID = process.env.OWNER_ID ? parseInt(process.env.OWNER_ID) : null;
const PORT     = process.env.PORT || 3000;
const BASE_URL = process.env.RENDER_EXTERNAL_URL || 'https://omega-bot-chze.onrender.com';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const app       = express();
app.use(express.json());

// Bot en modo sin polling (webhook manual)
const bot = new TelegramBot(TOKEN, { polling: false });

// Recibir updates de Telegram via webhook
app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Health check
app.get('/', (req, res) => res.send('Omega activo ✅'));

// Arrancar servidor y registrar webhook
app.listen(PORT, async () => {
  console.log(`✅ Servidor en puerto ${PORT}`);
  try {
    await bot.setWebHook(`${BASE_URL}/bot${TOKEN}`);
    console.log(`✅ Webhook registrado: ${BASE_URL}/bot${TOKEN}`);
  } catch (e) {
    console.error('Error webhook:', e.message);
  }
});

// ── Historial ──────────────────────────────────────────────────────────
const hist = [];
const MAX  = 40;

const SYSTEM = `Sos Omega, el asistente personal de Martín. Hablás en español argentino, directo y sin vueltas.

SERVICIOS ACTIVOS 24/7:
- @protesistabot → Railway (prótesis dentales)
- BotFactory API → Railway
- Landing BotFactory → https://steady-kulfi-94e8e2.netlify.app
- Landing Xiaomi → https://astounding-sopapillas-3a46b9.netlify.app

DATOS CLAVE:
- WhatsApp Martín: +54 9 11 6532-6683
- Protesista: seña $100, consulta $500, alias pralong.lemon, titular LETICIA BEATRIZ RODRIGUEZ`;

async function responder(texto) {
  hist.push({ role: 'user', content: texto });
  if (hist.length > MAX) hist.splice(0, hist.length - MAX);
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 600,
    system: SYSTEM,
    messages: hist,
  });
  const resp = res.content[0].text.trim();
  hist.push({ role: 'assistant', content: resp });
  return resp;
}

bot.onText(/\/start/, async (msg) => {
  await bot.sendMessage(msg.chat.id, 'Hola Martín, soy Omega — tu asistente. ¿En qué te ayudo?');
});

bot.onText(/\/status/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    '🦷 @protesistabot → Railway ✅\n🏭 BotFactory API → Railway ✅\n🌐 Landing BotFactory → Netlify ✅\n📱 Landing Xiaomi → Netlify ✅\n🤖 Omega → Render ✅'
  );
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const texto  = msg.text;
  if (!texto || texto.startsWith('/')) return;
  if (OWNER_ID && chatId !== OWNER_ID) return bot.sendMessage(chatId, 'Asistente privado.');

  await bot.sendChatAction(chatId, 'typing');
  try {
    const r = await responder(texto);
    await bot.sendMessage(chatId, r);
  } catch (err) {
    console.error('[Omega] Error:', err.message);
    await bot.sendMessage(chatId, 'Error al procesar. Intentá de nuevo.');
  }
});
