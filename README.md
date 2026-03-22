# 🎂 Birthday Bot

Bot que corre automáticamente cada día a las 9am, detecta cumpleaños de tu red de contactos, genera un mensaje **personalizado con contexto real** usando Claude AI, y lo envía por WhatsApp.

> *"Dennis, hoy celebramos a alguien que construye el futuro con cada línea de código y cada decisión audaz. Que este nuevo año te traiga proyectos que enciendan tu curiosidad y victorias que superen tus propias expectativas. América Latina tiene suerte de contar con tu visión. 🎂✨"*
>
> — Claude Opus 4.6, generado automáticamente el 12/12/2025

---

## Stack

| Componente | Tecnología |
|---|---|
| Generación de mensajes | Claude CLI (`claude-opus-4-6` / `sonnet` / `haiku` según tier) |
| Envío WhatsApp | `whatsapp-web.js` |
| Proceso persistente | `pm2` |
| Scheduling | `cron` |
| Runtime | Node.js v24 |

---

## Arquitectura

```
Cron (9am)
    └── orchestrate.js
            ├── Detecta cumpleaños del día
            ├── Determina Tier del contacto (1 / 2 / 3)
            ├── Claude CLI → genera mensaje personalizado
            │       Tier 1 → claude-opus-4-6   (círculo íntimo)
            │       Tier 2 → claude-sonnet-4-5 (red profesional)
            │       Tier 3 → claude-haiku-4-5  (contactos lejanos)
            └── bot-server:3001 → whatsapp-web.js → WhatsApp
```

---

## Sistema de Tiers

El bot usa **3 niveles de personalización** para escalar a miles de contactos sin perder calidad donde más importa:

| Tier | Perfil | Modelo | Prompt |
|---|---|---|---|
| **1** | Familia, socios, amigos íntimos | Opus | Máximo contexto: historia, momento actual, referencias cercanas |
| **2** | Clientes, colegas, red profesional | Sonnet | Contexto profesional y momento actual |
| **3** | Red amplia, conocidos | Haiku | Breve y genuino |

---

## Schema de contacts.json

```json
{
  "name": "Dennis Vivas Zelada",
  "nickname": "Dennis",
  "phone": "51969237034",
  "birthday": "12/12",
  "tier": 1,
  "relationship": "socio / cliente / amigo / familia",
  "context": {
    "role": "Cargo o rol de la persona",
    "personality": "Rasgos de personalidad",
    "shared_history": "Algo que vivieron juntos — un proyecto, un momento memorable",
    "current_moment": "Qué está viviendo HOY cerca de su cumpleaños",
    "inside_references": "Detalles específicos que solo su círculo conoce",
    "tone": "El tono exacto: formal, cálido, técnico, divertido..."
  },
  "memory": {
    "last_message": "Mensaje del año pasado",
    "last_sent": "2025-12-12T22:00:00.000Z",
    "avoid": "Temas a evitar este año",
    "next_year_notes": "Contexto para el próximo cumpleaños"
  }
}
```

> El campo **`current_moment`** es el más poderoso. Cuando Claude sabe qué está viviendo la persona ese día, el mensaje es pertinente — no genérico.

---

## Instalación

### 1. Clonar e instalar dependencias

```bash
git clone <este-repo>
cd birthday-bot
npm install
```

### 2. Instalar Claude CLI

```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

Asegúrate de estar autenticado con tu cuenta de Anthropic.

### 3. Instalar pm2

```bash
npm install -g pm2
```

### 4. Levantar el bot-server con pm2

```bash
pm2 start bot-server.js --name birthday-bot-server
pm2 save
pm2 startup  # seguir las instrucciones que imprime
```

### 5. Escanear el QR de WhatsApp

```bash
pm2 logs birthday-bot-server --lines 30 --nostream
```

WhatsApp en tu celular → **Dispositivos vinculados** → **Vincular dispositivo** → escanea el QR.

> ⚡ El QR expira en ~20 segundos. Ten el celular listo antes de ver los logs.

La sesión queda guardada — solo escaneas una vez.

### 6. Configurar tus contactos

Edita `contacts.json` con los datos reales de tu equipo. Reemplaza los números de ejemplo con números reales (con código de país, sin `+`).

### 7. Probar manualmente

```bash
echo '{}' > sent-log.json

BOT_SECRET=birthday-bot-secret \
BOT_SERVER_URL=http://localhost:3001 \
node orchestrate.js
```

### 8. Configurar el cron

```bash
# Ver el path exacto de node en tu máquina
which node

# Editar el crontab
crontab -e
```

Agregar esta línea (reemplaza `/ruta/a/node` y `/ruta/a/birthday-bot`):

```
0 9 * * * BOT_SECRET=birthday-bot-secret BOT_SERVER_URL=http://localhost:3001 /ruta/a/node /ruta/a/birthday-bot/orchestrate.js >> /ruta/a/birthday-bot/cron.log 2>&1
```

Verificar:

```bash
crontab -l
```

---

## Uso diario

El bot corre solo. Para agregar contactos, edita `contacts.json`.

Para reenviar un mensaje del día (si algo falló):

```bash
echo '{}' > sent-log.json
BOT_SECRET=birthday-bot-secret BOT_SERVER_URL=http://localhost:3001 node orchestrate.js
```

---

## Troubleshooting

**Puerto 3001 ocupado (EADDRINUSE)**
```bash
pm2 stop birthday-bot-server
fuser -k 3001/tcp
pm2 start birthday-bot-server
```

**QR expiró antes de escanearlo**
```bash
pm2 restart birthday-bot-server
# Tener el celular listo ANTES de correr el comando
pm2 logs birthday-bot-server --lines 30 --nostream
```

**"No LID for user"**
El número no tiene WhatsApp activo o el formato es incorrecto. Verificar que incluye código de país sin `+`.

**Cron no ejecuta**
El cron necesita el path absoluto de node (no el de nvm). Usa `which node` para obtenerlo.

---

## Archivos generados automáticamente (no subir al repo)

| Archivo | Contenido |
|---|---|
| `sent-log.json` | Registro de envíos del día — evita duplicados |
| `failed-sends.jsonl` | Mensajes fallidos para reenvío manual |
| `cron.log` | Logs de ejecución del cron |
| `.wwebjs_auth/` | Sesión de WhatsApp |

---

Construido el 21 de marzo de 2026 · [DVZ](https://dvz.com)
