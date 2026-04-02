import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const lt = require('C:/Users/nima/AppData/Local/npm-cache/_npx/75ac80b86e83d4a2/node_modules/localtunnel');

const tunnel = await lt({ port: 8765 });
console.log('BFF_TUNNEL_URL=' + tunnel.url);
tunnel.on('error', (e) => { console.error('tunnel error:', e.message); });
// Keep alive
setInterval(() => {}, 60000);
