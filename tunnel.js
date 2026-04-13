const localtunnel = require('localtunnel');
const fs = require('fs');
const path = require('path');

const BFF_PORT = 8765;
const ENV_FILE = path.join(__dirname, 'mobile', '.env');

function updateEnv(url) {
  let content = fs.readFileSync(ENV_FILE, 'utf8');
  content = content.replace(/^EXPO_PUBLIC_BFF_URL=.*/m, `EXPO_PUBLIC_BFF_URL=${url}`);
  fs.writeFileSync(ENV_FILE, content);
  console.log(`Updated mobile/.env: EXPO_PUBLIC_BFF_URL=${url}`);
}

(async () => {
  const tunnel = await localtunnel({ port: BFF_PORT });

  updateEnv(tunnel.url);
  console.log(`Tunnel open: ${tunnel.url} -> localhost:${BFF_PORT}`);
  console.log('Now restart Expo for the new URL to take effect.');

  tunnel.on('close', () => {
    console.log('Tunnel closed.');
  });

  tunnel.on('error', (err) => {
    console.error('Tunnel error:', err.message);
  });

  process.on('SIGINT', () => {
    console.log('\nClosing tunnel...');
    tunnel.close();
    process.exit(0);
  });
})();
