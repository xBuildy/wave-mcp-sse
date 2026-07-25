#!/usr/bin/env node

/**
 * Wave Compute MCP — stdio entry point for npx @xbuildy/wave-compute-mcp
 * Forwards JSON-RPC over stdio to the Wave OS mcpRouter backend.
 * No local HTTP server, no secrets, no port conflicts.
 */

const MCP_BACKEND_URL = process.env.MCP_BACKEND_URL || "https://oswave.io/api/functions/mcpRouter";

let inputBuffer = "";

process.stdin.setEncoding("utf8");

async function handleData(chunk) {
  inputBuffer += chunk;
  const lines = inputBuffer.split("\n");
  inputBuffer = lines.pop() || "";

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.jsonrpc === "2.0") await handleMessage(msg);
    } catch (e) { /* skip incomplete */ }
  }

  // Also try parsing as a standalone JSON object (no newline)
  const trimmed = inputBuffer.trim();
  if (trimmed.startsWith("{")) {
    try {
      const msg = JSON.parse(trimmed);
      if (msg.jsonrpc === "2.0") {
        inputBuffer = "";
        await handleMessage(msg);
      }
    } catch (e) { /* incomplete JSON, wait for more */ }
  }
}

process.stdin.on("data", handleData);

async function handleMessage(msg) {
  const { jsonrpc, id, method, params } = msg;

  if (method === "initialize") {
    sendResponse(id, {
      protocolVersion: (params && params.protocolVersion) || "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "wave-compute", version: "4.1.0" }
    });
    return;
  }

  if (method === "tools/list" || method === "tools/call") {
    try {
      const resp = await fetch(MCP_BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: id || "stdio-1", method, params: params || {} })
      });
      if (!resp["ok"]) {
        sendResponse(id, { error: { code: -32000, message: "Backend HTTP " + resp["status"] } });
        return;
      }
      const data = await resp["json"]();
      if (data["result"]) sendResponse(id, data["result"]);
      else if (data["error"]) sendResponse(id, { error: data["error"] });
      else sendResponse(id, { error: { code: -32000, message: "No result from backend" } });
    } catch (e) {
      sendResponse(id, { error: { code: -32000, message: e["message"] } });
    }
    return;
  }

  if (method === "notifications/initialized") {
    // No response needed for notifications
    return;
  }

  sendResponse(id, { error: { code: -32601, message: "Method not found: " + method } });
}

function sendResponse(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

process.stderr.write("Wave Compute MCP stdio bridge v4.1.0 — backend: " + MCP_BACKEND_URL + "\n");
