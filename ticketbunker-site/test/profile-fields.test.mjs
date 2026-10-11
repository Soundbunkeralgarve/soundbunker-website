import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBusinessWebsite} from '../profile-fields.js';
test('accepts common website formats and pasted slash mistakes',()=>{for(const value of ['www.soundbunker.pt','http://www.soundbunker.pt','https://www.soundbunker.pt','http:\\\\www.soundbunker.pt','http:||www.soundbunker.pt'])assert.equal(normalizeBusinessWebsite(value),'https://www.soundbunker.pt/');});
test('rejects unsafe schemes and credentials; permits an empty optional website',()=>{assert.equal(normalizeBusinessWebsite(''),'');for(const value of ['javascript:alert(1)','file:///etc/test','https://user:pass@example.org','not a website'])assert.throws(()=>normalizeBusinessWebsite(value));});
