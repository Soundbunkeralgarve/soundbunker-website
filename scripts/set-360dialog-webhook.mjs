// Points the studio number's 360dialog webhook at the Ask the Studio endpoint.
// Reads the 360dialog API key and the webhook key from ~/.soundbunker so neither is typed anywhere.
// Run once after connecting the number: node scripts/set-360dialog-webhook.mjs
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';

const secret = name => readFile(`${homedir()}/.soundbunker/${name}`, 'utf8').then(text => text.trim());
const apiKey = await secret('d360-api-key.txt').catch(() => '');
const hookKey = await secret('whatsapp-verify-token.txt').catch(() => '');
if (!apiKey) throw Error('Save the 360dialog API key to ~/.soundbunker/d360-api-key.txt first.');
if (!hookKey) throw Error('~/.soundbunker/whatsapp-verify-token.txt is missing.');

const url = `${process.env.SITE_URL || 'https://www.soundbunker.pt'}/api/whatsapp-webhook?key=${hookKey}`;
const response = await fetch('https://waba-v2.360dialog.io/v1/configs/webhook', {
  method: 'POST',
  headers: { 'D360-API-KEY': apiKey, 'content-type': 'application/json' },
  body: JSON.stringify({ url }),
});
const text = await response.text();
if (!response.ok) throw Error(`360dialog refused the webhook (${response.status}): ${text.slice(0, 300)}`);
console.log('Webhook set for the studio number (address hidden; it contains the webhook key).');
