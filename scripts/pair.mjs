#!/usr/bin/env node
/**
 * Pair WhatsApp using a pairing code (no QR needed).
 * Usage: node scripts/pair.mjs <phone_number>
 * Phone number format: country code + number, no + or spaces (e.g. 17732662600)
 */
import makeWASocket, {
  Browsers,
  fetchLatestWaWebVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import path from 'path';
import fs from 'fs';

const phoneNumber = process.argv[2];
if (!phoneNumber) {
  console.error('Usage: node scripts/pair.mjs <phone_number>');
  console.error('Example: node scripts/pair.mjs 17732662600');
  process.exit(1);
}

const storeDir = path.join(process.cwd(), 'store');
const authDir = path.join(storeDir, 'auth');
fs.mkdirSync(authDir, { recursive: true });

const logger = pino({ level: 'warn' });

const { state, saveCreds } = await useMultiFileAuthState(authDir);

const { version } = await fetchLatestWaWebVersion({});
console.log('Using WA Web version:', version);

const sock = makeWASocket({
  version,
  auth: {
    creds: state.creds,
    keys: makeCacheableSignalKeyStore(state.keys, logger),
  },
  printQRInTerminal: false,
  logger,
  browser: Browsers.macOS('Chrome'),
});

sock.ev.on('creds.update', saveCreds);

sock.ev.on('connection.update', (update) => {
  const { connection, lastDisconnect } = update;

  if (connection === 'open') {
    console.log('\nConnected to WhatsApp successfully!');
    console.log('You can now start nanoclaw: systemctl --user start nanoclaw');
    setTimeout(() => process.exit(0), 2000);
  }

  if (connection === 'close') {
    const reason = lastDisconnect?.error?.output?.statusCode;
    if (reason === 401) {
      console.error('Logged out. Delete store/auth/ and try again.');
      process.exit(1);
    }
    // Don't reconnect — let the user retry manually
    console.error(`Connection closed (reason: ${reason}). Try running again.`);
    process.exit(1);
  }
});

// Wait a moment for the socket to connect, then request pairing code
setTimeout(async () => {
  try {
    const code = await sock.requestPairingCode(phoneNumber);
    console.log(`\nPairing code: ${code}`);
    console.log('\nOn your phone: WhatsApp > Settings > Linked Devices > Link a Device > Link with phone number');
    console.log('Enter the code above when prompted.');
    console.log('\nWaiting for pairing...');
  } catch (err) {
    console.error('Failed to request pairing code:', err.message);
    process.exit(1);
  }
}, 3000);
