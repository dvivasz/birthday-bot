import fs from 'fs';
import { execSync } from 'child_process';

/**
 * orchestrate.js — Birthday Orchestrator v5
 *
 * Flujo:
 *   1. Lee contacts.json y detecta cumpleaños de hoy
 *   2. Genera mensaje personalizado con Claude CLI (modelo según Tier)
 *   3. Envía via bot-server (WhatsApp)
 *   4. Registra en sent-log.json para evitar duplicados
 *   5. Guarda el mensaje en la memoria del contacto
 *
 * Variables de entorno:
 *   BOT_SECRET      — secret del bot-server (default: birthday-bot-secret)
 *   BOT_SERVER_URL  — URL del bot-server   (default: http://localhost:3001)
 *   CONTACTS_FILE   — path al contacts.json (default: ./contacts.json)
 *   LOG_FILE        — path al sent-log.json (default: ./sent-log.json)
 */

// ── Configuración ─────────────────────────────────────────────────────────────
const CONTACTS_F     = process.env.CONTACTS_FILE   || './contacts.json';
const LOG_F          = process.env.LOG_FILE        || './sent-log.json';
const FAILED_F       = './failed-sends.jsonl';
const BOT_SERVER_URL = process.env.BOT_SERVER_URL  || 'http://localhost:3001';
const BOT_SECRET     = process.env.BOT_SECRET      || 'birthday-bot-secret';

// Modelo por tier
const MODELS = {
  1: 'claude-opus-4-5',    // Tier 1: círculo íntimo → máxima calidad
  2: 'claude-sonnet-4-5',  // Tier 2: red profesional → balance calidad/costo
  3: 'claude-haiku-4-5',   // Tier 3: contactos lejanos → eficiencia
};

const SEND_TIMEOUT_MS = 8_000;
const MAX_RETRIES     = 3;

// ── Utilidades ────────────────────────────────────────────────────────────────
function log(msg) {
  console.log(`[${new Date().toLocaleString('es-PE')}] ${msg}`);
}

function loadJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return {}; }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function isBirthdayToday(d) {
  const t = new Date();
  const parts = d.split('/').map(Number);
  return t.getDate() === parts[0] && (t.getMonth() + 1) === parts[1];
}

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Construcción del prompt por tier ──────────────────────────────────────────
function buildPrompt(contact) {
  const name = contact.nickname || contact.name.split(' ')[0];
  const ctx  = contact.context || {};
  const mem  = contact.memory  || {};
  const tier = contact.tier    || 2;

  // Schema legacy (solo tiene "notes") → compatibilidad hacia atrás
  if (!contact.context && contact.notes) {
    return `Redacta un mensaje de cumpleaños breve y cálido en español para ${name}.
Contexto: ${contact.notes}.
Instrucciones: sin frases genéricas, máximo 2 emojis, solo el mensaje sin comillas.`;
  }

  if (tier === 1) {
    return `Redacta un mensaje de cumpleaños en español para ${name}.

CONTEXTO COMPLETO:
- Relación: ${contact.relationship || 'cercana'}
- Rol: ${ctx.role || ''}
- Personalidad: ${ctx.personality || ''}
- Historia compartida: ${ctx.shared_history || ''}
- Lo que está viviendo HOY: ${ctx.current_moment || ''}
- Referencias cercanas: ${ctx.inside_references || ''}
- Tono deseado: ${ctx.tone || 'cálido y cercano'}
${mem.avoid ? `- EVITAR mencionar: ${mem.avoid}` : ''}
${mem.next_year_notes ? `- Contexto adicional: ${mem.next_year_notes}` : ''}

INSTRUCCIONES:
- Máximo 3 oraciones
- Que suene como alguien que realmente lo conoce y lo aprecia
- Empático con lo que está viviendo hoy — pertinente, no genérico
- Puede incluir una referencia sutil a algo específico de su historia
- Máximo 2 emojis, solo si encajan naturalmente
- Solo el mensaje, sin comillas ni explicaciones`;
  }

  if (tier === 2) {
    return `Redacta un mensaje de cumpleaños breve y cálido en español para ${name}.

Contexto:
- Relación: ${contact.relationship || 'profesional'}
- Rol: ${ctx.role || ''}
- Lo que está viviendo hoy: ${ctx.current_moment || ''}
- Tono: ${ctx.tone || 'profesional y cercano'}

Instrucciones:
- Máximo 2 oraciones
- Sin frases genéricas
- Que suene humano y genuino
- Máximo 1 emoji
- Solo el mensaje, sin comillas`;
  }

  // Tier 3
  return `Redacta un mensaje de cumpleaños muy breve y genuino en español para ${name}.
Contexto: ${ctx.role || contact.relationship || 'contacto'}.
Instrucciones: 1 oración, sin frases genéricas, sin emojis, solo el mensaje.`;
}

// ── Generación con Claude CLI ─────────────────────────────────────────────────
function generateMessage(contact) {
  const tier   = contact.tier  || 2;
  const model  = MODELS[tier]  || MODELS[2];
  const prompt = buildPrompt(contact);

  log(`  → [Tier ${tier}] Generando con ${model}...`);

  try {
    const result = execSync(
      `claude -p ${JSON.stringify(prompt)} --model ${model}`,
      { encoding: 'utf8', timeout: 45000 }
    );
    return result.trim();
  } catch (err) {
    // Fallback a Sonnet si Opus falla
    if (tier === 1) {
      log(`  ⚠ Opus falló, reintentando con Sonnet...`);
      const fallback = execSync(
        `claude -p ${JSON.stringify(prompt)} --model ${MODELS[2]}`,
        { encoding: 'utf8', timeout: 30000 }
      );
      return fallback.trim();
    }
    throw err;
  }
}

// ── Envío via bot-server ──────────────────────────────────────────────────────
async function sendViaHost(phone, message) {
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bot-secret': BOT_SECRET
    },
    body: JSON.stringify({ phone, message })
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      log(`  → Intento ${attempt}/${MAX_RETRIES}...`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
      const res = await fetch(`${BOT_SERVER_URL}/send`, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      return await res.json();
    } catch (err) {
      log(`  ✗ Intento ${attempt} fallido: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await sleep(2000 * attempt);
      } else {
        fs.appendFileSync(FAILED_F, JSON.stringify({
          ts: new Date().toISOString(), phone, message, reason: err.message
        }) + '\n');
        log(`  📝 Guardado en ${FAILED_F} para reenvío manual`);
        throw err;
      }
    }
  }
}

// ── Actualizar memoria del contacto ───────────────────────────────────────────
function updateMemory(contacts, contact, message) {
  const idx = contacts.findIndex(c => c.phone === contact.phone);
  if (idx === -1) return;
  contacts[idx].memory = contacts[idx].memory || {};
  contacts[idx].memory.last_message = message;
  contacts[idx].memory.last_sent    = new Date().toISOString();
  saveJSON(CONTACTS_F, contacts);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log('══ Birthday Orchestrator v5 (Claude + Tiers) ══');

  const contacts       = loadJSON(CONTACTS_F);
  const sentLog        = loadJSON(LOG_F);
  const todayKey       = getTodayKey();
  const todayBirthdays = contacts.filter(c => isBirthdayToday(c.birthday));

  if (todayBirthdays.length === 0) {
    log('No hay cumpleaños hoy.');
    return;
  }

  // Ordenar por tier — primero los más importantes
  todayBirthdays.sort((a, b) => (a.tier || 2) - (b.tier || 2));

  log(`🎂 ${todayBirthdays.length} cumpleaños hoy:`);
  todayBirthdays.forEach(c => log(`   [Tier ${c.tier || 2}] ${c.name}`));

  for (const contact of todayBirthdays) {
    const logKey = `${todayKey}_${contact.phone}`;

    if (sentLog[logKey]) {
      log(`↩ ${contact.name} ya enviado hoy`);
      continue;
    }

    log(`\n🎯 Procesando: ${contact.name} (Tier ${contact.tier || 2})`);

    try {
      const message = generateMessage(contact);
      log(`  ✓ "${message.substring(0, 90)}${message.length > 90 ? '...' : ''}"`);

      log('  → Enviando via bot-server...');
      await sendViaHost(contact.phone, message);
      log(`  ✓ Enviado`);

      sentLog[logKey] = {
        name:    contact.name,
        phone:   contact.phone,
        tier:    contact.tier || 2,
        message,
        sentAt:  new Date().toISOString()
      };
      saveJSON(LOG_F, sentLog);

      // Guardar en memoria del contacto para el año siguiente
      updateMemory(contacts, contact, message);

    } catch (err) {
      log(`  ✗ ERROR con ${contact.name}: ${err.message}`);
    }
  }

  log('\n══ Listo ══');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
