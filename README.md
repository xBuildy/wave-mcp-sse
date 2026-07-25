# @xbuildy/wave-compute-mcp

The only MCP that gives Cursor developers access to **Base44 backend management + decentralized GPU compute** via Theta EdgeCloud.

## Install

### Cursor (stdio — recommended)

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "wave-compute": {
      "command": "npx",
      "args": ["-y", "@xbuildy/wave-compute-mcp"]
    }
  }
}
```

### Cursor (SSE — Railway-hosted)

```json
{
  "mcpServers": {
    "wave-compute": {
      "url": "https://dependable-energy-production.up.railway.app/sse"
    }
  }
}
```

## Tools (28)

- **6 b44_*** — Base44 entity CRUD, function deploy/logs (no Wave OS account needed)
- **8 theta_*** — Theta GPU compute, AI chat, image/video generation (requires Wave OS account)
- **14 wave_*** — Wave OS Assistant remote control (Eddie's personal setup)

## Publishing

```bash
npm login
npm publish --access public
```

## Architecture

```
Cursor → npx @xbuildy/wave-compute-mcp (stdio)
                    ↓
         oswave.io/api/functions/mcpRouter (Base44 backend)
                    ↓
         ┌──────────┼──────────┐
      b44_*      theta_*      wave_*
   (Base44)  (Theta GPU)  (Wave Assistant)
```

MIT License. Built by [xBuildy](https://oswave.io).
