#!/usr/bin/env node
/**
 * Quick WhatsApp test via Baileys
 */

import { resolve } from 'path';
import { writeFileSync } from 'fs';
import QRCode from 'qrcode';
import { createBaileysWhatsApp } from './integrations/whatsapp-baileys.js';

const storageDir = process.env.HOME + '/.sonder';
const userPhone = '+919209872088';
const qrPath = '/tmp/whatsapp-qr.png';

async function main() {
  console.log('Starting Baileys WhatsApp test...');

  const adapter = createBaileysWhatsApp({
    authDir: resolve(storageDir, 'whatsapp-auth'),
    printQRInTerminal: false, // We'll save as image instead
    onQR: async (qr) => {
      // Save QR as image
      await QRCode.toFile(qrPath, qr, { width: 400 });
      console.log(`\n📱 QR code saved to: ${qrPath}`);
      console.log(`   Open it with: open ${qrPath}\n`);
    },
    onReady: async () => {
      console.log('\n✓ Connected! Sending test message...\n');

      const result = await adapter.sendMessage(
        userPhone,
        `Hey! How's your day going? 😊`,
      );

      if (result.success) {
        console.log(`✓ Message sent! ID: ${result.messageId}`);
      } else {
        console.log(`✗ Failed: ${result.error}`);
      }

      // Wait a bit then exit
      setTimeout(() => {
        console.log('\nDone! Disconnecting...');
        adapter.disconnect();
        process.exit(0);
      }, 3000);
    },
  });

  await adapter.connect();

  // If not ready after 90s, exit
  setTimeout(() => {
    if (!adapter.isReady()) {
      console.log('\nTimeout - please scan QR code');
      process.exit(1);
    }
  }, 90000);
}

main().catch(console.error);
