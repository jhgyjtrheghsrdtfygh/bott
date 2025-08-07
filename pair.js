const express = require('express');
const fs = require('fs');
const pino = require("pino");
const path = require("path");
const { ByteID } = require('./id'); // Random ID generator
const {
  default: Byte,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers
} = require("maher-zubair-baileys"); // Your existing Baileys fork

const router = express.Router();

// Helper: Delete temp session folder
function removeFile(FilePath) {
  if (!fs.existsSync(FilePath)) return false;
  fs.rmSync(FilePath, { recursive: true, force: true });
}

// Main route
router.get('/', async (req, res) => {
  const id = ByteID(); // Unique ID for temp session
  let num = req.query.number || "";
  let attempt = 0;

  // Sanitize number
  num = num.replace(/[^0-9]/g, '');
  if (!num.startsWith("91")) num = "91" + num;

  if (!num || num.length < 10) {
    return res.send({ error: "Invalid number" });
  }

  async function Byte_Pair() {
    const sessionPath = path.join(__dirname, 'temp', id);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    try {
      const Hamza = Byte({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }),
        browser: ["Safari", "macOS", "13.6"] // ✅ Universal spoof
      });

      Hamza.ev.on('creds.update', saveCreds);

      Hamza.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect, qr } = s;

        if (qr && !res.headersSent) {
          return res.send({
            qr: qr,
            message: "📱 Scan this QR in WhatsApp within 30 seconds."
          });
        }

        if (connection === "open") {
          await Hamza.sendMessage(Hamza.user.id, { text: "*_Sending session ID..._*" });
          await delay(4000);

          const credsPath = path.join(sessionPath, "creds.json");
          const data = fs.readFileSync(credsPath);
          const b64data = Buffer.from(data).toString('base64');

          const session = await Hamza.sendMessage(Hamza.user.id, { text: 'Byte;;;' + b64data });
          await delay(2000);
          await Hamza.sendMessage(Hamza.user.id, { text: `_SESSION ID_` }, { quoted: session });

          await delay(1000);
          await Hamza.ws.close();
          removeFile(sessionPath);
        }

        else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
          if (attempt < 1) {
            attempt++;
            console.log("Retrying...");
            await delay(10000);
            return await Byte_Pair();
          } else {
            console.log("Max retry reached.");
            removeFile(sessionPath);
            if (!res.headersSent) {
              return res.send({ code: "Service Unavailable" });
            }
          }
        }
      });

      // Try pairing code first
      if (!Hamza.authState.creds.registered) {
        await delay(1000);
        try {
          const code = await Hamza.requestPairingCode(num);
          console.log("Pairing code:", code);

          if (!res.headersSent) {
            return res.send({
              code: code,
              message: "✅ Use this code in WhatsApp within 1 minute."
            });
          }
        } catch (err) {
          console.log("❌ Pairing code failed. Fallback to QR.");
          // QR will be handled by connection.update
        }
      }

    } catch (err) {
      console.error("❌ Service Error:", err);
      removeFile(sessionPath);
      if (!res.headersSent) {
        return res.send({ code: "Service Unavailable" });
      }
    }
  }

  return await Byte_Pair();
});

module.exports = router;
