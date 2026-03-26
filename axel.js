require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Anthropic   = require('@anthropic-ai/sdk').default;
const { exec }    = require('child_process');
const fs          = require('fs');
const path        = require('path');

const bot       = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Solo responde al dueño ─────────────────────────────────────────────
let OWNER_ID = process.env.OWNER_ID ? parseInt(process.env.OWNER_ID) : null;

// ── Historial ──────────────────────────────────────────────────────────
const hist = [];
const MAX  = 40;

// ── Sistema prompt ─────────────────────────────────────────────────────
const SYSTEM = `Sos Omega, el asistente personal de Martín. Corrés en su computadora y tenés acceso total al sistema.

═══════════════════════════════════════
CONTEXTO COMPLETO — Lo que hicimos hoy (25/03/2025)
═══════════════════════════════════════

Martín quiere crear un negocio vendiendo bots de WhatsApp con IA a otros negocios.

LO QUE CONSTRUIMOS HOY:

1. LANDING PAGE (puerto 8080)
   - Ruta: /home/agente/.openclaw/workspace/landing/index.html
   - Diseño oscuro/dorado, super llamativa con animaciones
   - Tiene countdown de urgencia, social proof animado, botón flotante WhatsApp
   - Todos los botones van a WhatsApp: wa.me/5491165326683
   - Nombre del servicio: BotFactory
   - Planes: $49 USD único (Starter) / $29 USD mes (Pro)

2. SISTEMA BOTFACTORY API (puerto 3000) — LA VERSIÓN LEGAL
   - Ruta: /home/agente/.openclaw/workspace/botfactory-api/bot.js
   - Usa la API OFICIAL de Meta/WhatsApp (sin riesgo de baneo)
   - Bot vendedor "Axel" que atiende clientes, vende el servicio y hace preguntas
   - Cuando el cliente acepta, crea automáticamente el bot personalizado
   - FALTA: credenciales de Meta (WHATSAPP_TOKEN y WHATSAPP_PHONE_ID)
   - Para obtenerlas: developers.facebook.com → crear app → WhatsApp

3. BOT PROTESISTA (Telegram - @protesistabot)
   - Ruta: /home/agente/.openclaw/workspace/protesista-bot/bot.py
   - Bot de ventas de prótesis dentales para Leticia
   - Ya está funcionando

4. SISTEMA BOTFACTORY VIEJO (whatsapp-web.js) — PARADO
   - Ruta: /home/agente/.openclaw/workspace/botfactory/factory.js
   - PARADO porque usaba whatsapp-web.js que puede generar baneo
   - Reemplazado por botfactory-api que usa API oficial

ESTADO ACTUAL DE SERVICIOS (pm2):
- landing (pid activo) → puerto 8080 ✅
- botfactory-api (pid activo) → puerto 3000 ✅ (esperando credenciales Meta)
- botfactory (parado) → era el viejo con riesgo de baneo
- axel-telegram (vos mismo) ✅

LO QUE FALTA PARA QUE FUNCIONE TODO:
- Martín tiene que crear una app en developers.facebook.com
- Conseguir el Token de acceso (empieza con EAA...) y el Phone Number ID
- Pegar esos valores en: /home/agente/.openclaw/workspace/botfactory-api/.env
- Reiniciar botfactory-api

NÚMERO DE WHATSAPP DE MARTÍN: +54 9 11 6532-6683

FLUJO DEL NEGOCIO (cuando esté completo):
1. Cliente ve la publicidad → entra a la landing
2. Toca el botón → abre WhatsApp con Martín
3. Bot vendedor (Axel) lo atiende solo, le hace preguntas
4. Sistema crea el bot del cliente automáticamente  
5. Cliente lo activa y queda funcionando 24/7
6. Martín cobra y no hace nada más

═══════════════════════════════════════
PERSONALIDAD Y COMPORTAMIENTO
═══════════════════════════════════════

- Tu nombre es Omega
- Sos el asistente personal de Martín, directo y sin vueltas
- Hablás en español argentino siempre
- Cuando Martín pide algo técnico, lo hacés vos — no le explicás cómo hacerlo él
- Si algo falla, lo diagnosticás y lo arreglás
- Sos proactivo: si ves algo que mejorar, lo sugerís
- Nunca pedís contraseñas
- Confirmás antes de hacer cambios destructivos

CAPACIDADES:
- Ejecutar comandos en la computadora de Martín
- Modificar archivos del proyecto
- Ver logs y diagnosticar problemas
- Guiar paso a paso lo que sea necesario
- Recordar todo el contexto de hoy

ARCHIVOS CLAVE:
- Landing: /home/agente/.openclaw/workspace/landing/index.html
- Bot API: /home/agente/.openclaw/workspace/botfactory-api/bot.js
- Config API: /home/agente/.openclaw/workspace/botfactory-api/.env
- Protesista: /home/agente/.openclaw/workspace/protesista-bot/bot.py`;

// ── Responder con IA ───────────────────────────────────────────────────
async function responder(texto, contextoExtra = '') {
  const contenido = contextoExtra ? `${texto}\n\n[Contexto del sistema]:\n${contextoExtra}` : texto;
  hist.push({ role: 'user', content: contenido });
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

// ── Ejecutar comando ───────────────────────────────────────────────────
function runCmd(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 15000 }, (err, stdout, stderr) => {
      resolve((stdout + stderr).trim().slice(0, 3000) || 'Sin salida');
    });
  });
}

// ── Detectar si pide ejecutar algo ────────────────────────────────────
function detectarComando(texto) {
  const triggers = ['pm2', 'status', 'logs', 'reinicia', 'restart', 'estado', 'qué está corriendo', 'que esta corriendo', 'cae', 'cayó'];
  return triggers.some(t => texto.toLowerCase().includes(t));
}

// ── Mensaje de bienvenida ──────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  // Guardar ID del dueño la primera vez
  if (!OWNER_ID) {
    OWNER_ID = chatId;
    // Guardar en .env
    const envPath = path.join(__dirname, '.env');
    let content = fs.readFileSync(envPath, 'utf8');
    content = content.replace('OWNER_ID=', `OWNER_ID=${chatId}`);
    fs.writeFileSync(envPath, content);
    console.log(`[Axel] Dueño registrado: ${chatId}`);
  }

  await bot.sendMessage(chatId,
    `Hola Martín, soy *Axel* — tu asistente personal corriendo en tu computadora.\n\n` +
    `Puedo ayudarte con:\n` +
    `• Ver el estado de todos los servicios\n` +
    `• Configurar la API de Meta para WhatsApp\n` +
    `• Revisar la landing page\n` +
    `• Cualquier cosa que necesites del proyecto\n\n` +
    `¿En qué arrancamos?`,
    { parse_mode: 'Markdown' }
  );
});

// ── Comando /status ────────────────────────────────────────────────────
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendChatAction(chatId, 'typing');
  const output = await runCmd('pm2 list --no-color');
  await bot.sendMessage(chatId, `*Estado de servicios:*\n\`\`\`\n${output}\n\`\`\``, { parse_mode: 'Markdown' });
});

// ── Mensajes normales ──────────────────────────────────────────────────
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const texto  = msg.text;

  if (!texto || texto.startsWith('/')) return;

  // Registrar dueño si todavía no está
  if (!OWNER_ID) {
    OWNER_ID = chatId;
    const envPath = path.join(__dirname, '.env');
    let content = fs.readFileSync(envPath, 'utf8');
    content = content.replace('OWNER_ID=', `OWNER_ID=${chatId}`);
    fs.writeFileSync(envPath, content);
  }

  // Solo responder al dueño
  if (OWNER_ID && chatId !== OWNER_ID) {
    return bot.sendMessage(chatId, 'Este asistente es privado.');
  }

  await bot.sendChatAction(chatId, 'typing');

  try {
    let contexto = '';

    // Si menciona servicios/estado, obtener info real
    if (detectarComando(texto)) {
      contexto = await runCmd('pm2 list --no-color && echo "---" && ss -tlnp | grep -E "8080|8081|8082|3000"');
    }

    const respuesta = await responder(texto, contexto);

    // Dividir respuestas largas
    if (respuesta.length > 4000) {
      const partes = respuesta.match(/.{1,4000}/gs) || [respuesta];
      for (const p of partes) {
        await bot.sendMessage(chatId, p, { parse_mode: 'Markdown' });
      }
    } else {
      await bot.sendMessage(chatId, respuesta, { parse_mode: 'Markdown' });
    }

  } catch (err) {
    console.error('[Axel] Error:', err.message);
    await bot.sendMessage(chatId, 'Tuve un problema técnico. Intentá de nuevo.');
  }
});

bot.on('polling_error', (err) => console.error('[Axel] Polling error:', err.message));

console.log('\n✅ Axel Bot activo en Telegram');
console.log('   Buscá @Omegaopenbot en Telegram\n');
