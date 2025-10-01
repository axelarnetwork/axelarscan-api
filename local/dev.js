#!/usr/bin/env node

/*
  Start the local API development server using AWS SAM.

  Usage:
    node local/dev.js
    # Or with custom port:
    node local/dev.js --port=3001

  The API will be available at http://localhost:3000 (or your custom port).
*/

const { spawn } = require('child_process');

const args = process.argv.slice(2);
const portArg = args.find(arg => arg.startsWith('--port='));
const port = portArg ? portArg.replace('--port=', '') : '3000';

console.log('🚀 Starting Axelarscan API development server...');
console.log(`📡 Port: ${port}`);
console.log(`🔗 URL: http://localhost:${port}\n`);

const sam = spawn(
  'sam',
  [
    'local',
    'start-api',
    '--port',
    port,
    '--add-host',
    'host.docker.internal:host-gateway',
  ],
  { cwd: __dirname, stdio: 'inherit' }
);

sam.on('close', code => {
  if (code !== 0) {
    console.error(`❌ SAM process exited with code ${code}`);
    process.exit(code);
  }
});

process.on('SIGINT', () => {
  console.log('\n🛑 Stopping development server...');
  sam.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Stopping development server...');
  sam.kill('SIGTERM');
});
