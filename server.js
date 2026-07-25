/**
 * Wave Compute MCP — Railway SSE Bridge
 * 
 * Eliminates the local proxy entirely. Cursor connects via HTTP/SSE.
 * Forwards all JSON-RPC to the Base44 mcpRouter backend function.
 * 
 * Deploy: Railway app from this repo, set env var MCP_BACKEND_URL
 * Cursor mcp.json: { "url": "https://wave-mcp.up.railway.app/sse", "type": "http" }
 */

import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  InitializeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MCP_BACKEND_URL = process.env.MCP_BACKEND_URL ||
  "https://app.base44.com/api/apps/6a6442fdfedd7c7980f4f40b/functions/mcpRouter";

// ── Forward JSON-RPC to Base44 backend ──
async function forwardToBackend(method, params, id) {
  try {
    const resp = await fetch(MCP_BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: id || "rail-1",
        method,
        params: params || {},
      }),
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    if (data && data.result) return data.result;
    if (data && data.error) throw new Error(data.error.message || "Backend error");
    throw new Error("No result in response");
  } catch (err) {
    return {
      content: [{ type: "text", text: "Wave Compute error: " + err.message }],
      isError: true,
    };
  }
}

// ── MCP Server instance ──
const server = new Server(
  { name: "wave-compute", version: "4.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(InitializeRequestSchema, async (request) => {
  return {
    protocolVersion: request.params.protocolVersion || "2024-11-05",
    capabilities: { tools: {} },
    serverInfo: { name: "wave-compute", version: "4.0.0" },
  };
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const result = await forwardToBackend("tools/list", {});
  return result;
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return await forwardToBackend("tools/call", { name, arguments: args || {} }, request.id);
});

// ── SSE transport ──
const transports = {};

// GET /sse — Cursor opens this connection
app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;
  
  res.on("close", () => {
    delete transports[transport.sessionId];
  });
  
  await server.connect(transport);
});

// POST /messages — Cursor sends JSON-RPC through this
app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports[sessionId];
  if (!transport) {
    res.status(400).json({ error: "No transport for session " + sessionId });
    return;
  }
  await transport.handlePostMessage(req, res);
});

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "wave-compute-mcp",
    version: "4.0.0",
    backend: MCP_BACKEND_URL,
    sessions: Object.keys(transports).length,
  });
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log("Wave Compute MCP SSE bridge running on port " + PORT);
  console.log("SSE endpoint: http://localhost:" + PORT + "/sse");
  console.log("Backend: " + MCP_BACKEND_URL);
});
