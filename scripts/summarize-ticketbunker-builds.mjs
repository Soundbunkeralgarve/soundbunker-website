import { appendFileSync, readFileSync } from 'node:fs';

const result = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const builds = Array.isArray(result) ? result : [result];
const summaries = builds.map(build => ({
  id: build.id,
  platform: build.platform,
  status: build.status,
  version: build.appVersion,
  buildNumber: build.appBuildVersion,
  commit: build.gitCommitHash,
}));
console.log(JSON.stringify(summaries, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n\`\`\`json\n${JSON.stringify(summaries, null, 2)}\n\`\`\`\n`);
const platform = process.env.RELEASE_PLATFORM?.toUpperCase();
if (!['IOS', 'ANDROID'].includes(platform) || builds.length !== 1 ||
    !builds.every(build => build.status === 'FINISHED' && build.platform === platform &&
      build.appVersion === '1.0.0' && build.gitCommitHash === process.env.GITHUB_SHA)) {
  throw new Error('The signed platform build must finish for the exact release commit and version.');
}
