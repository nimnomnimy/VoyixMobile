#!/usr/bin/env node
/**
 * Pushes an OTA update via EAS Update.
 * Does NOT bump the app version — version only changes on a full rebuild.
 *
 * Usage (from mobile/):
 *   npm run update
 *   npm run update -- --branch production --message "fix: loyalty toast"
 */
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const branchIdx = args.indexOf('--branch');
const branch = branchIdx !== -1 ? args[branchIdx + 1] : 'preview';
const msgIdx = args.indexOf('--message');
const message = msgIdx !== -1 ? args[msgIdx + 1] : `OTA update ${new Date().toISOString().slice(0, 16)}`;

const cmd = `eas update --branch ${branch} --message "${message}" --non-interactive`;
console.log(`Running: ${cmd}`);
execSync(cmd, { stdio: 'inherit' });
