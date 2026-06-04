module.exports = {
  apps: [{
    name: "media-producer-mcp",
    script: "dist/index.js",
    cwd: "/root/media-producer-mcp",
    env_file: "/root/media-producer-mcp/.env",
  }]
};
