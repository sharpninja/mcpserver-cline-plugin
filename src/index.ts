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

import {
  ReplBridge,
  fullBootstrap,
  cacheFlush,
  todoTools,
  canHandleTodoTool,
  handleTodoTool,
  sessionTools,
  canHandleSessionTool,
  handleSessionTool,
  memoryTools,
  canHandleMemoryTool,
  handleMemoryTool,
  requirementsTools,
  canHandleRequirementsTool,
  handleRequirementsTool,
  graphragTools,
  canHandleGraphragTool,
  handleGraphragTool,
  setMarkerEnvironment,
} from '@sharpninja/mcpserver-plugin-core';
import {
  pluginHelperTools,
  canHandlePluginHelperTool,
  handlePluginHelperTool,
} from './tools/plugin-helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const allTools = [
  ...todoTools,
  ...sessionTools,
  ...memoryTools,
  ...requirementsTools,
  ...graphragTools,
  ...pluginHelperTools,
];

const bridge = new ReplBridge();

const server = new Server(
  { name: 'mcpserver', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: allTools,
}));

/** Wrap a core tool result in the MCP {content:[{type:'text'}]} envelope. */
function wrapResult(result: unknown) {
  if (
    result &&
    typeof result === 'object' &&
    Array.isArray((result as { content?: unknown }).content)
  ) {
    return result;
  }
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const typedArgs = args as Record<string, unknown>;

  if (canHandlePluginHelperTool(name)) return handlePluginHelperTool(name, typedArgs, bridge);

  // Ensure REPL is running before any tool call
  await bridge.ensure();

  if (canHandleTodoTool(name)) return wrapResult(await handleTodoTool(name, typedArgs, bridge));
  if (canHandleSessionTool(name)) return wrapResult(await handleSessionTool(name, typedArgs, bridge));
  if (canHandleMemoryTool(name)) return wrapResult(await handleMemoryTool(name, typedArgs, bridge));
  if (canHandleRequirementsTool(name))
    return wrapResult(await handleRequirementsTool(name, typedArgs, bridge));
  if (canHandleGraphragTool(name)) return wrapResult(await handleGraphragTool(name, typedArgs, bridge));

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  // Bootstrap: find marker file and verify HMAC signature
  try {
    const marker = await fullBootstrap(process.env.MCP_WORKSPACE_PATH ?? process.cwd());
    setMarkerEnvironment(marker, 'Cline');
    process.stderr.write(
      `[mcpserver] Connected to ${marker.baseUrl} (workspace: ${marker.workspace})\n`,
    );
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
