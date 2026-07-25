# Wave Compute MCP — Railway SSE Bridge

Eliminates the local proxy entirely. Cursor connects via HTTP/SSE.

## Deploy
1. Railway → New Project → Deploy from GitHub repo (xBuildy/wave-mcp-sse)
2. Set env var: MCP_BACKEND_URL=https://app.base44.com/api/apps/6a6442fdfedd7c7980f4f40b/functions/mcpRouter
3. Railway auto-deploys, gives you a URL like https://wave-mcp.up.railway.app

## Cursor Config
```json
{
  "mcpServers": {
    "base44": { "url": "https://app.base44.com/mcp", "type": "http" },
    "wave-compute": { "url": "https://wave-mcp.up.railway.app/sse", "type": "http" }
  }
}
```

No local files. No stdio. No race conditions.
