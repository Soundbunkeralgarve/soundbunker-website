import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=load('organiser.html'),client=load('organiser.js'),api=load('api/organiser.js'),styles=load('ticketbunker-launch.css');
test('ticket choice presets are simple, labelled and multi-select',()=>{
 for(const type of ['General Admission','VIP','Concessions 60+','Kids','Student','Early Bird']){
  assert.ok(html.includes('data-ticket-preset="'+type+'"'),type+' option missing');
 }
 assert.match(html,/data-ticket-preset="custom"/);
 for(const name of ['ticketPicker','newTicketRows','savedTicketList','ticketCapacitySummary','saveAllTickets']){
  assert.ok(html.includes('id="'+name+'"'),'Missing '+name);
 }
 assert.doesNotMatch(html,/name="price" type="number"/);
 assert.match(client,/function addTicketRow\(preset\)/);
 assert.match(client,/function renderSavedTickets\(\)/);
 assert.match(client,/aria-pressed/);
 assert.match(styles,/\.tb-ticket-picker/);
 assert.match(styles,/@media\(max-width:760px\)/);
});
test('several prices and quantities are validated and saved as one database batch',()=>{
 assert.match(client,/const selected=rows\.map\(row=>/);
 assert.match(client,/priceCents:Math\.round\(Number\(/);
 assert.match(client,/capacity:Number\(/);
 assert.match(client,/currentTotal\+added>2000/);
 assert.match(client,/action:'tiers',eventId,tiers:selected/);
 assert.match(api,/if\(action==='tiers'\)/);
 assert.match(api,/!Array\.isArray\(body\.tiers\)/);
 assert.match(api,/unique\.size!==items\.length/);
 assert.match(api,/already\.has\(item\.name\.toLocaleLowerCase\(\)\)/);
 assert.match(api,/currentCount\+addedCount>2000/);
 assert.match(api,/\.insert\(\s*items\.map\(/);
 assert.match(api,/\.eq\('organiser_profile_id',organisation\.id\)/);
 assert.match(api,/ev\.data\.internal_free_test/);
 assert.match(api,/201\);/);
});
test('saved ticket prices are visible and user can add another type on review',()=>{
 assert.match(client,/ev\.tiers/);
 assert.match(client,/tb-saved-ticket/);
 assert.match(client,/displayMoney\(t\.price_cents,ev\.currency\)/);
 assert.match(client,/add\.hidden=false/);
 assert.match(client,/Add another ticket type/);
 assert.match(client,/renderSavedTickets\(\)/);
 assert.match(client,/type\+' is already saved/);
 assert.match(client,/refresh\(\)/);
});
test('saving and uploading have unambiguous pending, completed and error feedback',()=>{
 assert.match(client,/startOperation\('Saving ticket types'/);
 assert.match(client,/finishOperation\(message\)/);
 assert.match(client,/Ticket types were not saved:/);
 assert.match(html,/id="dismissOperation"/);
 assert.match(client,/dismissOperation/);
 assert.match(client,/if\(!activeOperation&&\$\('#operationStatus'\)\.dataset\.state==='error'\)/);
});
