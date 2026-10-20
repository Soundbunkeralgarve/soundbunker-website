import {test} from 'node:test';
import assert from 'node:assert/strict';
import followUp from '../.github/scripts/mac-notary-follow-up.cjs';
const {decide, appleDecision} = followUp;
const now = Date.parse('2026-10-20T15:00:00Z');
function run(overrides = {}) {
  return {id:39428219795,head_sha:'d53ee66c22504d406776306805a1c9ec7e63cddf',head_branch:'main',event:'workflow_dispatch',repository:{full_name:'Soundbunkeralgarve/soundbunker-website'},path:'.github/workflows/ticketbunker-hub-mac-release.yml',status:'completed',conclusion:'failure',run_attempt:1,...overrides};
}
function jobs() {
  return [{name:'mac',conclusion:'timed_out',steps:[{name:'Run npm test',number:9,conclusion:'success'},{name:'Build Developer ID signed apps and disk images',number:10,conclusion:'cancelled'}]}];
}
test('leaves an active build alone and recognises a successful release', () => {
  assert.equal(decide(run({status:'in_progress',conclusion:null}),[],now),'running');
  assert.equal(decide(run({conclusion:'success'}),[],now),'released');
});
test('allows Apple lookup only after a build timeout with earlier checks passed', () => {
  assert.equal(decide(run(),jobs(),now),'check-apple');
  const failed = jobs(); failed[0].steps[0].conclusion='failure';
  assert.equal(decide(run(),failed,now),'needs-fix');
});
test('never retries user cancellation, signing failure or a later verification timeout', () => {
  assert.equal(decide(run({conclusion:'cancelled'}),jobs(),now),'needs-fix');
  for(const conclusion of ['cancelled','failure']) {
    const failed=jobs(); failed[0].conclusion=conclusion;
    assert.equal(decide(run(),failed,now),'needs-fix');
  }
  const later=jobs(); later[0].steps[1].conclusion='success';
  assert.equal(decide(run(),later,now),'needs-fix');
});
test('pins repository, source, branch, trigger, workflow and run', () => {
  for(const override of [{id:1},{head_sha:'other'},{head_branch:'other'},{event:'pull_request'},{repository:{full_name:'other/repo'}},{path:'.github/workflows/other.yml'}]) assert.throws(()=>decide(run(override),jobs(),now),/pinned trusted run/);
});
test('permits one recovery attempt and stops after eight days', () => {
  assert.equal(decide(run({run_attempt:2}),jobs(),now),'retry-finished');
  assert.equal(decide(run(),jobs(),Date.parse('2026-10-29T00:00:00Z')),'expired');
});
test('waits for Apple and retries only an Accepted original submission', () => {
  const submission=status=>({id:'d79bc994-9e31-4ffd-ba2e-830bef9fb720',attributes:{status}});
  assert.equal(appleDecision(submission('In Progress')),'waiting');
  assert.equal(appleDecision(submission('Accepted')),'retry');
  assert.equal(appleDecision(submission('Invalid')),'rejected');
  assert.throws(()=>appleDecision({...submission('Accepted'),id:'other'}),/different submission/);
  assert.throws(()=>appleDecision(submission('unknown')),/Unexpected/);
});
