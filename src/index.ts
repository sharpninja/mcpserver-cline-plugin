#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { execSync } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { ReplBridge } from './transport/repl-bridge.js';
import { fullBootstrap } from './discovery/marker-resolver.js';
import { cacheFlush } from './cache/cache-manager.js';
import { todoTools, canHandleTodoTool, handleTodoTool } from './tools/todo.js';
import { sessionTools, canHandleSessionTool, handleSessionTool } from './tools/session.js';
import { requirementsTools, canHandleRequirementsTool, handleRequirementsTool } from './tools/requirements.js';
import { graphragTools, canHandleGraphragTool, handleGraphragTool } from './tools/graphrag.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const allTools = [
  ...todoTools,
  ...sessionTools,
  ...requirementsTools,
  ...graphragTools,
];

const bridge = new ReplBridge();

const server = new Server(
  { name: 'mcpserver', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: allTools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const typedArgs = args as Record<string, unknown>;

  // Ensure REPL is running before any tool call
  await bridge.ensure();

  if (canHandleTodoTool(name)) return handleTodoTool(name, typedArgs, bridge);
  if (canHandleSessionTool(name)) return handleSessionTool(name, typedArgs, bridge);
  if (canHandleRequirementsTool(name)) return handleRequirementsTool(name, typedArgs, bridge);
  if (canHandleGraphragTool(name)) return handleGraphragTool(name, typedArgs, bridge);

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  // Bootstrap: find marker file and verify HMAC signature
  try {
    const ctx = await fullBootstrap(process.env.MCP_WORKSPACE_PATH ?? process.cwd());
    process.env.MCPSERVER_BASE_URL = ctx.baseUrl;
    process.env.MCPSERVER_API_KEY = ctx.apiKey;
    process.env.MCPSERVER_WORKSPACE_PATH = ctx.workspacePath;
    process.env.MCPSERVER_WORKSPACE = ctx.workspace;
    process.stderr.write(`[mcpserver] Connected to ${ctx.baseUrl} (workspace: ${ctx.workspace})\n`);
  } catch (e) {
    process.stderr.write(`[mcpserver] Bootstrap failed (offline mode): ${e}\n`);
    process.stderr.write('[mcpserver] Tool calls will be cached and replayed when server is available\n');
  }

  // Ensure mcpserver-repl is installed
  try {
    execSync('which mcpserver-repl', { stdio: 'pipe' });
  } catch {
    const ensureScript = path.join(__dirname, '../../lib/ensure-repl.sh');
    try {
      execSync(`bash "${ensureScript}"`, { stdio: 'inherit' });
    } catch {
      process.stderr.write('[mcpserver] Warning: mcpserver-repl could not be installed automatically\n');
    }
  }

  // Flush any offline cache on startup
  try {
    const result = await cacheFlush(bridge);
    if (result.flushed > 0 || result.failed > 0) {
      process.stderr.write(
        `[mcpserver] Cache flush: flushed=${result.flushed} failed=${result.failed} pending=${result.pending}\n`,
      );
    }
  } catch {
    // Ignore flush errors on startup
  }

  // Start MCP server on stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[mcpserver] MCP server ready (${allTools.length} tools)\n`);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await bridge.close();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await bridge.close();
    process.exit(0);
  });
}

main().catch((e) => {
  process.stderr.write(`[mcpserver] Fatal: ${e}\n`);
  process.exit(1);
});
