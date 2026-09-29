#!/usr/bin/env node
// Classic entry kept so the old command still regenerates data/.
// The per-map tool is tools/convert-map.mjs.

const { spawnSync } = require('child_process');
const path = require('path');

const result = spawnSync(process.execPath, [
  path.join(__dirname, 'convert-map.mjs'),
  'classic',
], { stdio: 'inherit' });

process.exit(result.status == null ? 1 : result.status);
