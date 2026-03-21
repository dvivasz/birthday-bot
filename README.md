# 🎂 Birthday Bot — Automatización de saludos de cumpleaños hiper personalizados por WhatsApp usando Claude

Bot que corre automáticamente cada día a las 9am, detecta cumpleaños del equipo, genera un mensaje personalizado con **Claude Opus** (via Claude CLI) y lo envía por **WhatsApp**.

---

## Stack

- **IA:** Claude CLI (`claude-opus-4-6`) — genera mensajes hiper personalizados por contacto
- **WhatsApp:** `whatsapp-web.js` — envío de mensajes via WhatsApp Web
- **Proceso:** `pm2` — mantiene el bot-server activo y lo reinicia si cae
- **Scheduling:** `cron` — ejecuta el orquestador todos los días a las 9am
- **Runtime:** Node.js v24

---

## Arquitectura

```
Cron (9am)
    └── orchestrate.js
            ├── claude CLI → genera mensaje personalizado con Opus
            └── bot-server:3001 → whatsapp-web.js → WhatsApp → contacto
```

---

## Pasos para replicarlo

### 1. Clonar e instalar el bot-server

```bash
git clone <este-repo>
cd birthday-bot
npm install
```

El `bot-server.js` usa `whatsapp-web.js` y expone un endpoint HTTP en el puerto 3001.

### 2. Instalar pm2 globalmente

```bash
npm install -g pm2
```

### 3. Levantar el bot-server con pm2

```bash
cd birthday-bot
pm2 start bot-server.js --name birthday-bot-server
pm2 save
pm2 startup   # seguir las instrucciones que imprime para autostart
```

### 4. Escanear el QR de WhatsApp

Al iniciar por primera vez, el bot-server imprime un QR en la terminal:

```bash
pm2 logs birthday-bot-server --lines 30 --nostream
```

Abre WhatsApp en tu celular → **Dispositivos vinculados** → **Vincular dispositivo** → escanea el QR.

> ⚡ El QR expira en ~20 segundos. Ten el celular listo antes de ver los logs.

La sesión queda guardada localmente — solo necesitas escanear una vez.

### 5. Configurar los contactos

Edita `contacts.json` con los datos reales de tu equipo:

```json
[
  {
    "name": "Nombre Apellido",
    "phone": "51999999999",
    "birthday": "21/03",
    "notes": "Contexto breve sobre la persona para personalizar el mensaje",
    "relationship": "equipo"
  }
]
```

- `phone`: número con código de país, sin `+` (ejemplo: `51` para Perú)
- `birthday`: formato `DD/MM`
- `notes`: cuanto más contexto, mejor el mensaje generado por Claude

### 6. Verificar que Claude CLI está instalado y autenticado

```bash
claude --version
claude -p "Di hola" --model claude-opus-4-5
```

Si no está instalado: [docs.anthropic.com/claude-code](https://docs.anthropic.com/claude-code)

### 7. Probar el orquestador manualmente

```bash
echo '{}' > sent-log.json

BOT_SECRET=birthday-bot-secret \
BOT_SERVER_URL=http://localhost:3001 \
node orchestrate.js
```

Deberías ver algo así:

```
[21/3/2026, 9:00:00 a. m.] ══ Birthday Orchestrator v4 (Claude) ══
[21/3/2026, 9:00:00 a. m.] 🎂 1 cumpleaños: Dennis Vivas
[21/3/2026, 9:00:00 a. m.] 🎯 Procesando: Dennis Vivas
[21/3/2026, 9:00:00 a. m.]   → Generando mensaje con Claude Opus...
[21/3/2026, 9:00:07 a. m.]   ✓ "Dennis, hoy celebramos a alguien que construye el futuro con cada línea de código"
[21/3/2026, 9:00:07 a. m.]   → Enviando via bot-server...
[21/3/2026, 9:00:07 a. m.]   → Intento 1/3...
[21/3/2026, 9:00:07 a. m.]   ✓ Enviado
[21/3/2026, 9:00:07 a. m.] ══ Listo ══
```

### 8. Configurar el cron

```bash
crontab -e
```

Agregar esta línea (reemplaza el path de node con el tuyo):

```
0 9 * * * BOT_SECRET=birthday-bot-secret BOT_SERVER_URL=http://localhost:3001 /ruta/a/node /home/tu-usuario/birthday-bot/orchestrate.js >> /home/tu-usuario/birthday-bot/cron.log 2>&1
```

Para encontrar el path de node:

```bash
which node
# ejemplo: /home/dvz/.nvm/versions/node/v24.13.0/bin/node
```

Verificar que quedó registrado:

```bash
crontab -l
```

---

## Estructura de archivos

```
birthday-bot/
├── orchestrate.js       # Orquestador principal
├── bot-server.js        # Servidor HTTP + WhatsApp Web
├── contacts.json        # Lista de contactos (no subir números reales)
├── package.json
├── sent-log.json        # Registro de envíos del día (generado automático)
├── failed-sends.jsonl   # Mensajes fallidos para reenvío (generado automático)
└── cron.log             # Logs del cron (generado automático)
```

---

## Troubleshooting

### Puerto 3001 ocupado (EADDRINUSE)
```bash
pm2 stop birthday-bot-server
fuser -k 3001/tcp
pm2 start birthday-bot-server
```

### QR expiró antes de escanearlo
```bash
pm2 restart birthday-bot-server
# Tener el celular listo ANTES de correr el comando
pm2 logs birthday-bot-server --lines 30 --nostream
```

### "No LID for user"
El número de teléfono no tiene cuenta de WhatsApp activa, o el formato es incorrecto. Verificar que incluye el código de país sin `+`.

### Mensaje no enviado hoy (ya registrado en sent-log)
```bash
echo '{}' > sent-log.json
# Volver a correr orchestrate.js
```

---

## .gitignore recomendado

```
sent-log.json
failed-sends.jsonl
cron.log
node_modules/
.env
.wwebjs_auth/
.wwebjs_cache/
```

---

## Resultado

El bot genera mensajes únicos para cada persona basados en su contexto:

> *"Dennis, hoy celebramos a alguien que construye el futuro con cada línea de código"*

> *"Franco, hoy celebramos al visionario que convierte ideas en productos que transforman"*

---

Construido el 21 de marzo de 2026 · [FintechLab](https://fintechlab.la)
