const express = require('express');
const fs = require('fs');
const pino = require("pino");
const { ByteID } = require('./id');
const {
    default: Byte,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = require("maher-zubair-baileys");

const router = express.Router();

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    const id = ByteID();
    let num = req.query.number || "";
    let attempt = 0;

    // ✅ Sanitize number
    num = num.replace(/[^0-9]/g, '');
    if (!num.startsWith("91")) num = "91" + num; // default to Indian country code

    if (!num || num.length < 10) {
        return res.send({ error: "Invalid number" });
    }

    async function Byte_Pair() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        try {
            const Hamza = Byte({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                browser: Browsers.macOS("Desktop")
            });

            Hamza.ev.on('creds.update', saveCreds);

            Hamza.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    await Hamza.sendMessage(Hamza.user.id, { text: "*_Sending session id, Wait..._*" });
                    await delay(20000);

                    let data = fs.readFileSync(__dirname + `/temp/${id}/creds.json`);
                    let b64data = Buffer.from(data).toString('base64');
                    let session = await Hamza.sendMessage(Hamza.user.id, { text: 'Byte;;;' + b64data });
                    await delay(8000);

                    await Hamza.sendMessage(Hamza.user.id, { text: `_SESSION ID_` }, { quoted: session });
                    await delay(100);
                    await Hamza.ws.close();
                    removeFile('./temp/' + id);
                }

                else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
                    if (attempt < 1) {
                        attempt++;
                        console.log("Retrying connection...");
                        await delay(10000);
                        return await Byte_Pair();
                    } else {
                        console.log("Max retry reached.");
                        removeFile('./temp/' + id);
                        if (!res.headersSent) {
                            return res.send({ code: "Service Unavailable" });
                        }
                    }
                }
            });

            if (!Hamza.authState.creds.registered) {
                await delay(1500);
                const code = await Hamza.requestPairingCode(num);
                console.log("Pairing code generated for:", num, "→", code);

                if (!res.headersSent) {
                    return res.send({
                        code: code,
                        message: "Use this code in WhatsApp within 1 minute."
                    });
                }
            }

        } catch (err) {
            console.error("Service Error:", err);
            removeFile('./temp/' + id);
            if (!res.headersSent) {
                return res.send({ code: "Service Unavailable" });
            }
        }
    }

    return await Byte_Pair();
});

module.exports = router;
