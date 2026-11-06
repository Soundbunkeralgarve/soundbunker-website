import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../App.js',import.meta.url),'utf8');

test('camera pre-permission screen uses a neutral Continue button (App Review 5.1.1(iv))',()=>{
 assert.doesNotMatch(app,/Allow camera access/);
 assert.match(app,/permission\?\.canAskAgain===false\?'Open Settings':'Continue'/);
});

test('sign-in screen is addressed to any organiser and links to free organiser sign-up (App Review 3.2)',()=>{
 assert.doesNotMatch(app,/WELCOME, DOOR CREW/);
 assert.match(app,/FOR EVENT ORGANISERS AND DOOR STAFF/);
 assert.match(app,/Linking\.openURL\('https:\/\/theticketbunker\.com\/organiser\?signup=1'\)/);
});
