import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../App.js',import.meta.url),'utf8');

test('ticket scanning and hub pairing both use a neutral camera prompt (App Review 5.1.1(iv))',()=>{
 assert.doesNotMatch(app,/\b(?:allow|enable)\b[^\n"']*\bcamera\b/i);
 assert.match(app,/const needsSettings=permission\?\.canAskAgain===false/);
 assert.match(app,/title=\{needsSettings\?'Open Settings':'Continue'\}/);
 assert.match(app,/onPress=\{needsSettings\?\(\)=>Linking\.openSettings\(\):requestPermission\}/);
 assert.equal([...app.matchAll(/<CameraPermissionPrompt permission=\{permission\} requestPermission=\{requestPermission\}/g)].length,2);
 assert.match(app,/!hubPairing&&\(permission\?\.granted\?<View style=\{s\.cameraFrame\}>/);
});

test('sign-in screen is addressed to any organiser and links to free organiser sign-up (App Review 3.2)',()=>{
 assert.doesNotMatch(app,/WELCOME, DOOR CREW/);
 assert.match(app,/FOR EVENT ORGANISERS AND DOOR STAFF/);
 assert.match(app,/Linking\.openURL\('https:\/\/theticketbunker\.com\/organiser\?signup=1'\)/);
});
