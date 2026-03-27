require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Anthropic   = require('@anthropic-ai/sdk').default;
const http        = require('http');
const https       = require('https');

const TOKEN    = process.env.TELEGRAM_TOKEN;
const OWNER_ID = process.env.OWNER_ID ? parseInt(process.env.OWNER_ID) : null;
const PORT     = process.env.PORT || 3000;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Borrar webhook viejo antes de empezar polling
const bot = new TelegramBot(TOKEN, { polling: false });
bot.deleteWebHook().then(() => {
  bot.startPolling();
  console.log('✅ Omega Bot activo (polling)');
}).catch(() => {
  bot.startPolling();
  console.log('✅ Omega Bot activo (polling)');
});

// Servidor HTTP keep-alive para que Render no duerma el proceso
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Omega activo');
});
server.listen(PORT, () => console.log(`Keep-alive en puerto ${PORT}`));

// Auto-ping cada 10 minutos para no dormir
const SELF_URL = process.env.RENDER_EXTERNAL_URL || 'https://omega-bot-chze.onrender.com';
setInterval(() => {
  https.get(SELF_URL, (r) => {}).on('error', () => {});
}, 10 * 60 * 1000);

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
  await bot.sendMessage(msg.chat.id, 'Hola Martin, soy Omega tu asistente. En que te ayudo?');
});

bot.onText(/\/status/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    'Servicios activos:\n' +
    '🦷 @protesistabot Railway OK\n' +
    '🏭 BotFactory API Railway OK\n' +
    '🌐 Landing BotFactory Netlify OK\n' +
    '📱 Landing Xiaomi Netlify OK\n' +
    '🤖 Omega Render OK'
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
    await bot.sendMessage(chatId, 'Error: ' + err.message.slice(0, 100));
  }
});

bot.on('polling_error', (err) => console.error('[Omega] Polling error:', err.message));
