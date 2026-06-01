require('dotenv').config({ path: '/root/media-producer-mcp/.env' });

module.exports = {
  apps: [{
    name: 'media-producer-mcp',
    script: 'dist/index.js',
    cwd: '/root/media-producer-mcp',
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      HEYGEN_API_KEY: process.env.HEYGEN_API_KEY,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      JAMENDO_CLIENT_ID: process.env.JAMENDO_CLIENT_ID,
    }
  }]
};
