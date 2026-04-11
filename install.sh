#!/usr/bin/env bash
# install.sh — Install the McpServer Cline MCP server into Cline's settings.
# Runs npm ci + build if dist/index.js is missing, then merges the MCP server
# entry into cline_mcp_settings.json.
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_JS="${PLUGIN_DIR}/dist/index.js"

echo "McpServer Cline Plugin installer"
echo "Plugin directory: ${PLUGIN_DIR}"

# Build if dist/index.js is missing
if [ ! -f "$SERVER_JS" ]; then
    echo "Building TypeScript..."
    cd "$PLUGIN_DIR"
    if command -v npm >/dev/null 2>&1; then
        npm ci && npm run build
    else
        echo "ERROR: npm not found. Install Node.js 18+ and try again." >&2
        exit 1
    fi
fi

# Ensure mcpserver-repl is installed
if ! command -v mcpserver-repl >/dev/null 2>&1; then
    echo "Installing mcpserver-repl..."
    bash "$PLUGIN_DIR/lib/ensure-repl.sh" || echo "Warning: mcpserver-repl auto-install failed; install it manually."
fi

# Determine Cline settings path by OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    CLINE_SETTINGS="${HOME}/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"
elif [[ "$OSTYPE" == "msys"* ]] || [[ "$OSTYPE" == "cygwin"* ]] || [[ "$OSTYPE" == "win"* ]]; then
    CLINE_SETTINGS="${APPDATA}/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"
else
    CLINE_SETTINGS="${HOME}/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"
fi

mkdir -p "$(dirname "$CLINE_SETTINGS")"

# Merge mcpserver entry into existing settings using node
node -e "
const fs = require('fs');
const settingsPath = process.argv[1];
const serverJs = process.argv[2];
const workspacePath = process.argv[3] || process.cwd();

let settings = {};
if (fs.existsSync(settingsPath)) {
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    console.error('Warning: could not parse existing settings, starting fresh');
  }
}

if (!settings.mcpServers) settings.mcpServers = {};

settings.mcpServers['mcpserver'] = {
  command: 'node',
  args: [serverJs],
  env: {
    MCP_WORKSPACE_PATH: workspacePath
  },
  disabled: false,
  autoApprove: []
};

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
console.log('Cline MCP settings updated: ' + settingsPath);
console.log('Restart VS Code to apply changes.');
" "$CLINE_SETTINGS" "$SERVER_JS" "${MCP_WORKSPACE_PATH:-}"

echo ""
echo "Installation complete!"
echo "Restart VS Code and open the Cline MCP panel to see 56 workflow tools."
