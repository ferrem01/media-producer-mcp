const fs = require('fs');
const path = require('path');

// Load .env file into env object for PM2
function loadEnv(filePath) {
  const env = {};
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      // Strip quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  } catch (e) { /* no .env file */ }
  return env;
}

module.exports = {
  apps: [{
    name: 'media-producer-mcp',
    script: 'dist/index.js',
    cwd: '/root/media-producer-mcp',
    env: loadEnv('/root/media-producer-mcp/.env'),
  }]
};
