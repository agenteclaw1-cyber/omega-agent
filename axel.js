require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Anthropic   = require('@anthropic-ai/sdk').default;
const http        = require('http');

const bot       = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const OWNER_ID = process.env.OWNER_ID ? parseInt(process.env.OWNER_ID) : null;

// ── Historial ──────────────────────────────────────────────────────────
const hist = [];
const MAX  = 40;

// ── Sistema prompt ─────────────────────────────────────────────────────
const SYSTEM = `Sos Omega, el asistente personal de Martín. Hablás en español argentino, directo y sin vueltas.

CONTEXTO DEL NEGOCIO:
Martín tiene un negocio llamado BotFactory que vende bots de WhatsApp con IA a otros negocios.

SERVICIOS ACTIVOS (corriendo 24/7 en la nube):
- @protesistabot → Bot de ventas de prótesis dentales para Leticia (Railway)
- BotFactory API → Backend del sistema de bots (Railway)
- Landing BotFactory → https://steady-kulfi-94e8e2.netlify.app (Netlify)
- Landing Xiaomi Redmi 15C → https://astounding-sopapillas-3a46b9.netlify.app (Netlify)

DATOS CLAVE:
- WhatsApp Martín: +54 9 11 6532-6683
- WhatsApp ventas Xiaomi: +54 9 11 5259-2781
- Protesista bot: @protesistabot — prótesis dentales, seña $100, consulta $500
- Titular pagos: LETICIA BEATRIZ RODRIGUEZ / Alias: pralong.lemon / Banco Lemon

PERSONALIDAD:
- Sos directo, útil, sin relleno
- Ayudás con dudas del negocio, ideas, estrategias, lo que sea
- Si Martín pregunta algo técnico, explicás claro y corto`;

// ── Responder con IA ───────────────────────────────────────────────────
async function responder(texto) {
  hist.push({ role: 'user', content: texto });
  if (hist.length > MAX) hist.splice(0, hist.length - MAX);

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 800,
    system: SYSTEM,
    messages: hist,
  });

  const resp = res.content[0].text.trim();
  hist.push({ role: 'assistant', content: resp });
  return resp;
}

// ── /start ────────────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    `Hola Martín, soy *Omega* — tu asistente personal.\n\nTodo está corriendo en la nube. ¿En qué te ayudo?`,
    { parse_mode: 'Markdown' }
  );
});

// ── /status ───────────────────────────────────────────────────────────
bot.onText(/\/status/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    `*Servicios activos 24/7:*\n\n` +
    `🦷 @protesistabot → Railway ✅\n` +
    `🏭 BotFactory API → Railway ✅\n` +
    `🌐 Landing BotFactory → Netlify ✅\n` +
    `📱 Landing Xiaomi → Netlify ✅`,
    { parse_mode: 'Markdown' }
  );
});

// ── Mensajes normales ──────────────────────────────────────────────────
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const texto  = msg.text;
  if (!texto || texto.startsWith('/')) return;

  if (OWNER_ID && chatId !== OWNER_ID) {
    return bot.sendMessage(chatId, 'Este asistente es privado.');
  }

  await bot.sendChatAction(chatId, 'typing');

  try {
    const respuesta = await responder(texto);
    if (respuesta.length > 4000) {
      const partes = respuesta.match(/.{1,4000}/gs) || [respuesta];
      for (const p of partes) await bot.sendMessage(chatId, p, { parse_mode: 'Markdown' });
    } else {
      await bot.sendMessage(chatId, respuesta, { parse_mode: 'Markdown' });
    }
  } catch (err) {
    console.error('[Omega] Error:', err.message);
    await bot.sendMessage(chatId, 'Tuve un problema. Intentá de nuevo.');
  }
});

bot.on('polling_error', (err) => console.error('[Omega] Polling error:', err.message));

// ── Keep-alive HTTP ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
http.createServer((req, res) => { res.writeHead(200); res.end('Omega activo'); })
  .listen(PORT, () => console.log(`✅ Omega Bot activo | puerto ${PORT}`));
