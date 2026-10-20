'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const REPOSITORY = 'Soundbunkeralgarve/soundbunker-website';
const RUN_ID = 39428219795;
const COMMIT = 'd53ee66c22504d406776306805a1c9ec7e63cddf';
const SUBMISSION = 'd79bc994-9e31-4ffd-ba2e-830bef9fb720';
const EXPIRY = Date.parse('2026-10-28T13:13:23.875Z');
const WORKFLOW = 'ticketbunker-mac-notary-follow-up.yml';

// This is a one-off recovery for the existing trusted release, not a general
// mechanism for retrying failing builds or bypassing any release checks.
function decide(run, jobs, now = Date.now()) {
  if (run.id !== RUN_ID || run.head_sha !== COMMIT || run.head_branch !== 'main' ||
      run.event !== 'workflow_dispatch' || run.repository?.full_name !== REPOSITORY ||
      run.path?.split('@')[0] !== '.github/workflows/ticketbunker-hub-mac-release.yml') {
    throw Error('The release no longer matches the pinned trusted run');
  }
  if (now >= EXPIRY) return 'expired';
  if (run.status !== 'completed') return 'running';
  if (run.conclusion === 'success') return 'released';
  if (run.conclusion === 'cancelled') return 'needs-fix';
  if (run.run_attempt !== 1) return 'retry-finished';
  const mac = jobs.find(job => job.name === 'mac');
  const build = mac?.steps?.find(step => step.name === 'Build Developer ID signed apps and disk images');
  const beforeBuild = mac?.steps?.filter(step => step.number < build?.number) || [];
  if (mac?.conclusion !== 'timed_out' || !build ||
      !['cancelled', 'timed_out'].includes(build.conclusion) ||
      !beforeBuild.length || beforeBuild.some(step => step.conclusion !== 'success')) return 'needs-fix';
  return 'check-apple';
}

function appleDecision(submission) {
  if (submission?.id !== SUBMISSION) throw Error('Apple returned a different submission');
  const status = submission.attributes?.status;
  if (status === 'Accepted') return 'retry';
  if (status === 'In Progress') return 'waiting';
  if (status === 'Invalid' || status === 'Rejected') return 'rejected';
  throw Error('Unexpected Apple submission status');
}

async function request(url, options = {}) {
  const response = await fetch(url, {...options, signal: AbortSignal.timeout(20000)});
  if (!response.ok) throw Error(new URL(url).hostname + ' returned HTTP ' + response.status);
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

async function main() {
  if (process.env.GITHUB_REPOSITORY !== REPOSITORY) throw Error('Run this only in the intended repository');
  if (!process.env.GH_TOKEN) throw Error('GitHub workflow token is required');
  const headers = {Authorization: 'Bearer ' + process.env.GH_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'};
  const api = 'https://api.github.com/repos/' + REPOSITORY;
  const run = await request(api + '/actions/runs/' + RUN_ID, {headers});
  const jobs = run.status === 'completed' ? (await request(api + '/actions/runs/' + RUN_ID + '/jobs?filter=latest', {headers})).jobs : [];
  let action = decide(run, jobs);
  if (action === 'check-apple') {
    const key = process.env.HUB_APPLE_API_KEY_P8;
    const keyId = process.env.HUB_APPLE_API_KEY_ID;
    const issuer = process.env.HUB_APPLE_API_ISSUER;
    if (!key || !keyId || !issuer) throw Error('Notarisation credentials are required');
    const now = Math.floor(Date.now() / 1000);
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = encode({alg: 'ES256', kid: keyId, typ: 'JWT'}) + '.' + encode({iss: issuer, iat: now, exp: now + 300, aud: 'appstoreconnect-v1'});
    const signature = crypto.sign('sha256', Buffer.from(unsigned), {key, dsaEncoding: 'ieee-p1363'}).toString('base64url');
    const result = await request('https://appstoreconnect.apple.com/notary/v2/submissions/' + SUBMISSION, {headers: {Authorization: 'Bearer ' + unsigned + '.' + signature}});
    action = appleDecision(result.data);
    if (action === 'retry') {
      // Retry exactly this original commit, only after Apple accepts its first
      // upload. The original signing, Gatekeeper and publish gates run again.
      await request(api + '/actions/runs/' + RUN_ID + '/rerun-failed-jobs', {method: 'POST', headers});
    }
  }
  const terminal = ['expired', 'released', 'retry-finished', 'needs-fix', 'rejected'].includes(action);
  if (terminal) await request(api + '/actions/workflows/' + WORKFLOW + '/disable', {method: 'PUT', headers});
  const messages = {
    running: 'The original signed release is still running. No duplicate build was started.',
    waiting: 'Apple is still processing the original submission. The next scheduled check will follow up.',
    retry: 'Apple accepted the original submission. Requested one retry of the same trusted release commit, with every original release gate intact.',
    released: 'The verified release succeeded. This temporary follow-up workflow is now disabled.',
    expired: 'The eight-day follow-up window ended. This temporary workflow is disabled; inspect Apple status manually.',
    'retry-finished': 'The single permitted recovery attempt finished. This workflow is disabled; inspect the release result.',
    'needs-fix': 'The release stopped for a reason other than the expected Apple build timeout. No automatic retry; inspect the failure. Follow-up disabled.',
    rejected: 'Apple rejected the original submission. No automatic retry; inspect Apple logs. Follow-up disabled.'
  };
  console.log(messages[action]);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, messages[action] + '\n');
  if (['needs-fix', 'rejected', 'retry-finished', 'expired'].includes(action) && run.conclusion !== 'success') process.exitCode = 1;
}
module.exports = {decide, appleDecision};
if (require.main === module) main().catch(error => {console.error(error.message); process.exitCode = 1;});
