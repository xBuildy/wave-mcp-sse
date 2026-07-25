// MCP Router v3 — Companion to Base44 MCP
// Positioning: "Base44 builds your app. Wave OS gives it compute."
// Base44 MCP handles: create/edit apps, list schemas, query entities (their OAuth)
// Wave MCP handles: entity CRUD, function deploy, Theta GPU compute (our proxy)
// Tier 1: 6 b44_* tools (entity CRUD, function deploy/logs — no Wave OS account needed)
// Tier 2: 8 theta_* tools (Theta GPU compute, requires Wave OS account)
// Existing: 14 wave_* tools (Eddie's personal Wave OS remote control — preserved)
// Auth fallback: if Bearer token present → user-scoped, if not → Eddie's hardcoded constants.

const THETA_TOKEN = Deno["env"]["get"]("THETA_API_TOKEN_2") || Deno["env"]["get"]("THETA_API_TOKEN") || "";
const THETA_AI_URL = "https://ai.thetaedgecloud.com/api/v1/chatbot/chtz4ssnbcf405uy4e05/chat/completions";
const THETA_COMPUTE_URL = "https://controller.thetaedgecloud.com";
const THETA_PROJECT_ID = Deno["env"]["get"]("THETA_PROJECT_ID") || "";

// Eddie's fallback constants (personal setup — never change)
const EDDIE_WS = "69fd12da185a6e091e5bea1d";
const EDDIE_CONV = "6a633893b72e3290a6bce144";

Deno["serve"](async (req) => {
  if (req["method"] !== "POST") return Response["json"]({ error: "POST only" }, { status: 405 });

  let body;
  try { body = await req["json"](); } catch (e) { return Response["json"]({ error: "Invalid JSON" }, { status: 400 }); }

  const { jsonrpc, id, method: rpcMethod, params } = body;

  // ── Auth Resolution ──
  // If Bearer token present → productized mode (user-scoped base44)
  // If no token → Eddie's fallback (asServiceRole with hardcoded WS)
  const authHeader = req["headers"]["get"]("authorization") || "";
  const hasAuth = authHeader["startsWith"]("Bearer ") && authHeader["length"] > 10;
  const authToken = hasAuth ? authHeader["slice"](7) : "";

  // ── JSON-RPC: initialize ──
  if (rpcMethod === "initialize") {
    return Response["json"]({
      jsonrpc: "2.0", id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "wave-os-mcp", version: "3.0.0" }
      }
    });
  }

  // ── JSON-RPC: tools/list ──
  if (rpcMethod === "tools/list") {
    return Response["json"]({ jsonrpc: "2.0", id, result: { tools: getToolDefinitions() } });
  }

  // ── JSON-RPC: tools/call ──
  if (rpcMethod === "tools/call") {
    try {
      const result = await handleToolCall(params?.name, params?.arguments || {}, hasAuth, authToken);
      return Response["json"]({
        jsonrpc: "2.0", id,
        result: { content: [{ type: "text", text: typeof result === "string" ? result : JSON["stringify"](result) }] }
      });
    } catch (e) {
      return Response["json"]({
        jsonrpc: "2.0", id,
        result: { content: [{ type: "text", text: "Error: " + (e["message"] || String(e)) }], isError: true }
      });
    }
  }

  return Response["json"]({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found: " + rpcMethod } });
});

// ═══════════════════════════════════════════════════════════════
// TOOL DEFINITIONS — 35 total (14 wave_* + 8 b44_* + 8 theta_* + 5 ubase_*)
// ═══════════════════════════════════════════════════════════════

function getToolDefinitions() {
  return [
    // ── TIER 1: Base44 Backend Tools (8) ──
    { name: "b44_entity_list", description: "List records from any entity in any Base44 app. Supports filtering, sorting, and pagination.", inputSchema: { type: "object", properties: { app_id: { type: "string" }, entity_name: { type: "string" }, filter: { type: "object" }, sort: { type: "string" }, limit: { type: "number" } }, required: ["entity_name"] } },
    { name: "b44_entity_create", description: "Create a new record in any Base44 entity. Pass the entity name and the data object.", inputSchema: { type: "object", properties: { app_id: { type: "string" }, entity_name: { type: "string" }, data: { type: "object" } }, required: ["entity_name", "data"] } },
    { name: "b44_entity_update", description: "Update records in a Base44 entity matching a filter. Returns the count of updated records.", inputSchema: { type: "object", properties: { app_id: { type: "string" }, entity_name: { type: "string" }, filter: { type: "object" }, data: { type: "object" } }, required: ["entity_name", "filter", "data"] } },
    { name: "b44_entity_delete", description: "Delete records from a Base44 entity matching a filter. Returns the count of deleted records.", inputSchema: { type: "object", properties: { app_id: { type: "string" }, entity_name: { type: "string" }, filter: { type: "object" } }, required: ["entity_name", "filter"] } },
    { name: "b44_deploy_function", description: "Deploy a backend function to a Base44 app. Pass the function name and the TypeScript code string.", inputSchema: { type: "object", properties: { app_id: { type: "string" }, function_name: { type: "string" }, code: { type: "string" } }, required: ["function_name", "code"] } },
    { name: "b44_get_function_logs", description: "Fetch runtime logs for a deployed backend function.", inputSchema: { type: "object", properties: { app_id: { type: "string" }, function_name: { type: "string" }, limit: { type: "number" } }, required: ["function_name"] } },

    // ── TIER 2: Theta Compute Tools (8) ──
    { name: "theta_compute_start", description: "Launch a GPU compute instance on Theta EdgeCloud. Returns instance ID, SSH command, and API endpoint.", inputSchema: { type: "object", properties: { model_id: { type: "string", description: "AI model ID to run" }, config: { type: "object" } }, required: ["model_id"] } },
    { name: "theta_compute_stop", description: "Stop a running GPU compute instance.", inputSchema: { type: "object", properties: { instance_id: { type: "string" } }, required: ["instance_id"] } },
    { name: "theta_compute_status", description: "Check status of GPU compute instances. Pass instance_id for a specific instance, or omit to list all.", inputSchema: { type: "object", properties: { instance_id: { type: "string" } } } },
    { name: "theta_ai_chat", description: "Chat with a Theta EdgeCloud AI model. Returns the AI response text.", inputSchema: { type: "object", properties: { message: { type: "string" }, model_id: { type: "string" } }, required: ["message"] } },
    { name: "theta_generate_image", description: "Generate an image using Theta EdgeCloud AI. Returns the image URL.", inputSchema: { type: "object", properties: { prompt: { type: "string" }, width: { type: "number" }, height: { type: "number" } }, required: ["prompt"] } },
    { name: "theta_generate_video", description: "Generate a video using Theta EdgeCloud AI. Returns the video URL.", inputSchema: { type: "object", properties: { prompt: { type: "string" }, duration: { type: "number" } }, required: ["prompt"] } },
    { name: "theta_list_models", description: "List all available AI models on Theta EdgeCloud.", inputSchema: { type: "object", properties: {} } },
    { name: "theta_get_credits", description: "Check your Wave OS compute credit balance.", inputSchema: { type: "object", properties: {} } },

        // ── uBase Packet Marketplace Tools (5) ──
    { name: "ubase_list_packets", description: "Browse and search the uBase packet marketplace. Filter by category, tags, or search term. Sort by downloads, newest, or name. Returns packet summaries with download URLs.", inputSchema: { type: "object", properties: { category: { type: "string", description: "Filter by category (e.g. auth, email, dashboard, crm)" }, tags: { type: "array", items: { type: "string" }, description: "Filter by tags" }, search: { type: "string", description: "Search in name and description" }, sort: { type: "string", description: "Sort: -downloads (default), -created_date, name" }, limit: { type: "number" } } } },
    { name: "ubase_get_packet", description: "Get full details for a specific uBase packet including README, metadata, install instructions, and download URL.", inputSchema: { type: "object", properties: { packet_id: { type: "string" }, name: { type: "string" } }, required: [] } },
    { name: "ubase_install_packet", description: "Returns the .ubase file URL and step-by-step install instructions for adding a packet to a Base44 app. The packet works without MCP — just paste the prompt.md into the Base44 builder.", inputSchema: { type: "object", properties: { packet_id: { type: "string" }, name: { type: "string" } } } },
    { name: "ubase_create_packet", description: "Create a new uBase packet entry in the marketplace. Pass the packet name, description, category, tags, and the .ubase file URL.", inputSchema: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, category: { type: "string" }, tags: { type: "array", items: { type: "string" } }, packet_url: { type: "string" }, readme: { type: "string" }, author_name: { type: "string" }, author_email: { type: "string" }, price: { type: "number" } }, required: ["name", "description", "packet_url"] } },
    { name: "ubase_my_packets", description: "List uBase packets authored by a specific author (defaults to Eddie).", inputSchema: { type: "object", properties: { author_email: { type: "string" }, sort: { type: "string" } } } },

// ── EXISTING: Wave OS Tools (14) — preserved for Eddie's personal setup ──
    { name: "wave", description: "Send a message to the Wave OS AI Assistant. Supports agentic commands: create notes, save memory, morning briefing, triage alerts, recall memory. When user types @wave, call this tool with their message verbatim.", inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] } },
    { name: "wave_check_messages", description: "Check for unread messages from Wave OS.", inputSchema: { type: "object", properties: { mark_read: { type: "boolean" } } } },
    { name: "wave_send_message", description: "Send a notification message to Wave OS.", inputSchema: { type: "object", properties: { title: { type: "string" }, message: { type: "string" } }, required: ["message"] } },
    { name: "wave_save_memory", description: "Save a memory to Wave OS.", inputSchema: { type: "object", properties: { content: { type: "string" }, category: { type: "string", enum: ["contact", "preference", "task", "note", "project", "code", "general"] }, tags: { type: "array", items: { type: "string" } } }, required: ["content"] } },
    { name: "wave_recall_memory", description: "Search Wave OS memories by keyword or category.", inputSchema: { type: "object", properties: { query: { type: "string" }, category: { type: "string", enum: ["contact", "preference", "task", "note", "project", "code", "general"] } } } },
    { name: "wave_morning_briefing", description: "Get morning briefing from Wave OS Chief of Staff.", inputSchema: { type: "object", properties: { proactivity_level: { type: "string", enum: ["low", "medium", "high"] } } } },
    { name: "wave_triage", description: "Run a triage scan for urgent items.", inputSchema: { type: "object", properties: { proactivity_level: { type: "string", enum: ["low", "medium", "high"] } } } },
    { name: "wave_meeting_prep", description: "Get preparation context for an upcoming meeting.", inputSchema: { type: "object", properties: { meeting_id: { type: "string" } }, required: ["meeting_id"] } },
    { name: "wave_follow_up_scan", description: "Scan for tasks with natural language due dates.", inputSchema: { type: "object", properties: {} } },
    { name: "wave_delegate_subagent", description: "Delegate a task to a Wave OS sub-agent.", inputSchema: { type: "object", properties: { task: { type: "string" }, context: { type: "string" } }, required: ["task"] } },
    { name: "wave_entity_list", description: "List records from any Wave OS entity.", inputSchema: { type: "object", properties: { entity_name: { type: "string" }, filter: { type: "object" }, sort: { type: "string" }, limit: { type: "number" } }, required: ["entity_name"] } },
    { name: "wave_entity_create", description: "Create a record in any Wave OS entity.", inputSchema: { type: "object", properties: { entity_name: { type: "string" }, data: { type: "object" } }, required: ["entity_name", "data"] } },
    { name: "wave_entity_update", description: "Update records in any Wave OS entity matching a filter.", inputSchema: { type: "object", properties: { entity_name: { type: "string" }, filter: { type: "object" }, data: { type: "object" } }, required: ["entity_name", "filter", "data"] } },
    { name: "wave_entity_delete", description: "Delete records from any Wave OS entity matching a filter.", inputSchema: { type: "object", properties: { entity_name: { type: "string" }, filter: { type: "object" } }, required: ["entity_name", "filter"] } }
  ];
}

// ═══════════════════════════════════════════════════════════════
// INTENT PARSER (preserved from v2.1)
// ═══════════════════════════════════════════════════════════════

function parseIntent(msg) {
  const m = msg["trim"]();
  const ml = m["toLowerCase"]();
  const memMatch = /^(save|remember|note that|store)\s*(?:memory|fact|info|this)?[:\s]+(.+)$/i["exec"](m);
  if (memMatch) return { action: "memory_save", params: { content: memMatch[2]["trim"]() } };
  if (/^(what do you know|what did i tell you|recall memory|list memory|show memory)/i["test"](ml)) return { action: "memory_recall", params: {} };
  if (/^(morning briefing|daily briefing|good morning|my day)/i["test"](ml)) return { action: "briefing", params: {} };
  if (/^(any urgent|any alerts|triage|check alerts|what's urgent)/i["test"](ml)) return { action: "triage", params: {} };
  const noteMatch = /^(?:create|make|add|new)\s+(?:a\s+)?note\s+(?:called|named|titled)?\s*"?(.+?)"?\s*(?:\bwith\s+(?:content|text|body)\s+(.+))?$/i["exec"](m);
  if (noteMatch) return { action: "entity_create", params: { entity: "Note", title: noteMatch[1]["trim"](), content: noteMatch[2] ? noteMatch[2]["trim"]() : "" } };
  if (/^(list|show|get)\s+(?:my\s+)?notes/i["test"](ml)) return { action: "entity_list", params: { entity: "Note" } };
  return null;
}

async function handleIntent(intent, ws, convId) {
  const { action, params } = intent;
  if (action === "entity_create" && params["entity"] === "Note") {
    try {
      const note = await base44["asServiceRole"]["entities"]["Note"]["create"]({ title: params["title"] || "Untitled", blocks: [{ type: "paragraph", content: params["content"] || "" }], workspace_id: ws, is_archived: false, is_pinned: false, tags: [] });
      return "✅ Created note \"" + (params["title"] || "Untitled") + "\" (ID: " + note["id"] + ")";
    } catch (e) { return "❌ Failed to create note: " + (e["message"] || "unknown error"); }
  }
  if (action === "entity_list" && params["entity"] === "Note") {
    try {
      const notes = await base44["asServiceRole"]["entities"]["Note"]["filter"]({ workspace_id: ws });
      const arr = Array["isArray"](notes) ? notes : [];
      if (arr["length"] === 0) return "📝 No notes yet.";
      return "📝 Your notes (" + arr["length"] + " total):\n\n" + arr["slice"](0, 10)["map"]((n, i) => (i + 1) + ". " + (n["title"] || "Untitled"))["join"]("\n");
    } catch (e) { return "❌ Failed to list notes."; }
  }
  if (action === "memory_save") {
    try { await base44["asServiceRole"]["entities"]["AssistantMemory"]["create"]({ workspace_id: ws, category: "general", content: params["content"], source: "mcp_cursor", tags: ["manual"], confidence: 1.0 }); return "🧠 Got it, I'll remember: \"" + params["content"] + "\""; } catch (e) { return "❌ Failed to save memory."; }
  }
  if (action === "memory_recall") {
    try { const ai = await base44["asServiceRole"]["entities"]["AssistantMemory"]["filter"]({ workspace_id: ws }); const items = Array["isArray"](ai) ? ai["filter"](i => { const c = i["category"] || ""; return c !== "conversation" && c !== "pattern"; }) : []; if (items["length"] === 0) return "🧠 No memories saved yet."; return "🧠 Here's what I remember:\n\n" + items["slice"](0, 10)["map"](i => "• [" + (i["category"] || "general")["toUpperCase"]() + "] " + (i["content"] || "")["slice"](0, 120))["join"]("\n"); } catch (e) { return "❌ Failed to recall memory."; }
  }
  if (action === "triage") {
    try { const alerts = await base44["asServiceRole"]["entities"]["TriageAlert"]["filter"]({ status: "open" }); const arr = Array["isArray"](alerts) ? alerts : []; if (arr["length"] === 0) return "✅ No open alerts. All clear."; return "⚠️ " + arr["length"] + " open alert(s):\n\n" + arr["slice"](0, 5)["map"](a => "🔴 [" + (a["severity"] || "medium")["toUpperCase"]() + "] " + (a["title"] || "Alert"))["join"]("\n"); } catch (e) { return "✅ No open alerts. All clear."; }
  }
  if (action === "briefing") {
    try {
      const today = new Date();
      const dateStr = today["toLocaleDateString"]("en-US", { weekday: "long", month: "long", day: "numeric" });
      let parts = ["Good morning! ☀️ Here's your briefing for **" + dateStr + "**:"];
      try { const alerts = await base44["asServiceRole"]["entities"]["TriageAlert"]["filter"]({ status: "open" }); const arr = Array["isArray"](alerts) ? alerts : []; if (arr["length"] > 0) parts["push"]("\n🔴 **" + arr["length"] + " open alert(s)** — say \"triage\" for details."); else parts["push"]("\n✅ No open alerts."); } catch (e) {}
      try { const cr = await base44["asServiceRole"]["entities"]["ComputeCredit"]["filter"]({ workspace_id: ws }); if (cr && cr["length"] > 0) parts["push"]("\n💳 Credits remaining: **" + (cr[0]["credits_balance"] || 0) + "**"); } catch (e) {}
      return parts["join"]("\n");
    } catch (e) { return "❌ Failed to generate briefing."; }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// CREDIT DEDUCTION HELPER
// ═══════════════════════════════════════════════════════════════

async function deductCredits(amount, description) {
  try {
    const credits = await base44["asServiceRole"]["entities"]["ComputeCredit"]["filter"]({ workspace_id: EDDIE_WS });
    if (!Array["isArray"](credits) || credits["length"] === 0) {
      return { success: false, message: "No credit account found. Enable GPU Compute to get 100 free credits." };
    }
    const credit = credits[0];
    const balance = credit["credits_balance"] || 0;
    if (balance < amount) {
      return { success: false, message: "Insufficient credits. You have " + balance + " but need " + amount + ". Visit oswave.io to add credits." };
    }
    const newBalance = balance - amount;
    const newUsed = (credit["credits_used_this_period"] || 0) + amount;
    await base44["asServiceRole"]["entities"]["ComputeCredit"]["update"](credit["id"], { credits_balance: newBalance, credits_used_this_period: newUsed });
    // Log the transaction
    try {
      await base44["asServiceRole"]["entities"]["CreditTransaction"]["create"]({ workspace_id: EDDIE_WS, amount: -amount, balance_after: newBalance, description: description, type: "compute", session_id: null, stripe_session_id: null });
    } catch (e) {}
    return { success: true, balance: newBalance };
  } catch (e) {
    return { success: false, message: "Credit system error: " + (e["message"] || String(e)) };
  }
}

// ═══════════════════════════════════════════════════════════════
// TOOL CALL HANDLER
// ═══════════════════════════════════════════════════════════════

async function handleToolCall(name, args, hasAuth, authToken) {
  // Resolve workspace: if auth token present → dynamic, if not → Eddie's fallback
  const ws = hasAuth ? null : EDDIE_WS; // null means "use base44 user-scoped" (no explicit WS needed)
  const convId = hasAuth ? null : EDDIE_CONV;

  // ═══════════════════════════════════════════════════════════
  // TIER 1: Base44 Backend Tools (8)
  // ═══════════════════════════════════════════════════════════

  switch (name) {
      try {
        const resp = await fetch("https://api.base44.com/apps", { headers: { "Authorization": "Bearer " + authToken, "Content-Type": "application/json" } });
        if (!resp["ok"]) return { error: "Failed to list apps (status " + resp["status"] + ")" };
        const data = await resp["json"]();
        return { apps: data };
      } catch (e) {
        return { error: "API error: " + (e["message"] || String(e)) };
      }
    }

        return { entity: entityName, fields: [], note: "No records found — cannot infer schema from empty entity" };
      } catch (e) {
        return { error: "Entity '" + entityName + "' not found or inaccessible: " + (e["message"] || String(e)) };
      }
    }

    case "b44_entity_list": {
      const entityName = args["entity_name"];
      if (!entityName) throw new Error("entity_name required");
      const filter = args["filter"] || {};
      const sort = args["sort"] || "-created_date";
      const limit = Math["min"](args["limit"] || 50, 500);
      try {
        const records = await base44["asServiceRole"]["entities"][entityName]["filter"]({ ...filter, limit, sort });
        return { records: records || [], count: Array["isArray"](records) ? records["length"] : 0 };
      } catch (e) {
        return { error: "Failed to list " + entityName + ": " + (e["message"] || String(e)), records: [], count: 0 };
      }
    }

    case "b44_entity_create": {
      const entityName = args["entity_name"];
      if (!entityName) throw new Error("entity_name required");
      const data = args["data"] || {};
      try {
        const result = await base44["asServiceRole"]["entities"][entityName]["create"](data);
        return { created: true, id: result["id"], record: result };
      } catch (e) {
        return { created: false, error: e["message"] || String(e) };
      }
    }

    case "b44_entity_update": {
      const entityName = args["entity_name"];
      if (!entityName) throw new Error("entity_name required");
      const filter = args["filter"] || {};
      const data = args["data"] || {};
      try {
        const records = await base44["asServiceRole"]["entities"][entityName]["filter"](filter);
        if (!Array["isArray"](records) || records["length"] === 0) return { updated: 0, message: "No records matched the filter" };
        for (const r of records) {
          await base44["asServiceRole"]["entities"][entityName]["update"](r["id"], data);
        }
        return { updated: records["length"] };
      } catch (e) {
        return { updated: 0, error: e["message"] || String(e) };
      }
    }

    case "b44_entity_delete": {
      const entityName = args["entity_name"];
      if (!entityName) throw new Error("entity_name required");
      const filter = args["filter"] || {};
      try {
        const records = await base44["asServiceRole"]["entities"][entityName]["filter"](filter);
        if (!Array["isArray"](records) || records["length"] === 0) return { deleted: 0, message: "No records matched the filter" };
        for (const r of records) {
          await base44["asServiceRole"]["entities"][entityName]["delete"](r["id"]);
        }
        return { deleted: records["length"] };
      } catch (e) {
        return { deleted: 0, error: e["message"] || String(e) };
      }
    }

    case "b44_deploy_function": {
      const funcName = args["function_name"];
      const code = args["code"];
      if (!funcName || !code) throw new Error("function_name and code required");
      if (!hasAuth) return { error: "Deploying functions requires authentication. Connect your Base44 account." };
      try {
        const appId = args["app_id"] || "6a5abc9bfa61c917463b71cd";
        const resp = await fetch("https://api.base44.com/apps/" + appId + "/functions/" + funcName, {
          method: "PUT",
          headers: { "Authorization": "Bearer " + authToken, "Content-Type": "application/json" },
          body: JSON["stringify"]({ code })
        });
        if (!resp["ok"]) return { error: "Deploy failed (status " + resp["status"] + ")", details: await resp["text"]() };
        const data = await resp["json"]();
        return { deployed: true, function_name: funcName, url: data["url"] || "https://" + appId + ".base44.app/api/functions/" + funcName, details: data };
      } catch (e) {
        return { error: "Deploy error: " + (e["message"] || String(e)) };
      }
    }

    case "b44_get_function_logs": {
      const funcName = args["function_name"];
      if (!funcName) throw new Error("function_name required");
      if (!hasAuth) return { error: "Fetching logs requires authentication." };
      try {
        const appId = args["app_id"] || "6a5abc9bfa61c917463b71cd";
        const limit = args["limit"] || 50;
        const resp = await fetch("https://api.base44.com/apps/" + appId + "/functions/" + funcName + "/logs?limit=" + limit, {
          headers: { "Authorization": "Bearer " + authToken, "Content-Type": "application/json" }
        });
        if (!resp["ok"]) return { error: "Failed to fetch logs (status " + resp["status"] + ")" };
        const data = await resp["json"]();
        return { function_name: funcName, logs: data };
      } catch (e) {
        return { error: "Log fetch error: " + (e["message"] || String(e)) };
      }
    }

    // ═══════════════════════════════════════════════════════════
    // TIER 2: Theta Compute Tools (8)
    // ═══════════════════════════════════════════════════════════

    case "theta_compute_start": {
      if (!hasAuth) return { error: "GPU compute requires a Wave OS account. Run 'npx wave-mcp-connect' and enable compute to unlock this tool." };
      const modelId = args["model_id"];
      const config = args["config"] || {};
      try {
        const resp = await fetch(THETA_COMPUTE_URL + "/api/v1/deploy/start", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + THETA_TOKEN },
          body: JSON["stringify"]({ model_id: modelId, project_id: THETA_PROJECT_ID, ...config })
        });
        if (!resp["ok"]) {
          const errText = await resp["text"]();
          return { error: "Failed to start compute (status " + resp["status"] + ")", details: errText };
        }
        const data = await resp["json"]();
        return { started: true, instance_id: data["instance_id"] || data["id"], ssh: data["ssh_command"] || "", endpoint: data["endpoint"] || "", details: data };
      } catch (e) {
        return { error: "Compute start error: " + (e["message"] || String(e)) };
      }
    }

    case "theta_compute_stop": {
      if (!hasAuth) return { error: "GPU compute requires a Wave OS account." };
      const instanceId = args["instance_id"];
      if (!instanceId) throw new Error("instance_id required");
      try {
        const resp = await fetch(THETA_COMPUTE_URL + "/api/v1/deploy/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + THETA_TOKEN },
          body: JSON["stringify"]({ instance_id: instanceId })
        });
        if (!resp["ok"]) return { error: "Failed to stop instance (status " + resp["status"] + ")" };
        const data = await resp["json"]();
        return { stopped: true, instance_id: instanceId, details: data };
      } catch (e) {
        return { error: "Compute stop error: " + (e["message"] || String(e)) };
      }
    }

    case "theta_compute_status": {
      if (!hasAuth) return { error: "GPU compute requires a Wave OS account." };
      const instanceId = args["instance_id"];
      try {
        const url = instanceId
          ? THETA_COMPUTE_URL + "/api/v1/deploy/status?instance_id=" + encodeURIComponent(instanceId)
          : THETA_COMPUTE_URL + "/api/v1/deploy/list?project_id=" + THETA_PROJECT_ID;
        const resp = await fetch(url, { headers: { "Authorization": "Bearer " + THETA_TOKEN } });
        if (!resp["ok"]) return { error: "Failed to get status (status " + resp["status"] + ")" };
        const data = await resp["json"]();
        return instanceId ? { instance_id: instanceId, status: data } : { instances: data };
      } catch (e) {
        return { error: "Status check error: " + (e["message"] || String(e)) };
      }
    }

    case "theta_ai_chat": {
      const message = args["message"];
      if (!message) throw new Error("message required");
      try {
        const resp = await fetch(THETA_AI_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + THETA_TOKEN },
          body: JSON["stringify"]({ messages: [{ role: "user", content: message }], max_tokens: 512, temperature: 0.7 })
        });
        if (resp["ok"]) {
          const data = await resp["json"]();
          const ad = data["body"] || data;
          const content = ad["choices"]?.[0]?.["message"]?.["content"] || "No response generated.";
          return { response: content, model: args["model_id"] || "chtz4ssnbcf405uy4e05" };
        }
        if (resp["status"] === 429) return { error: "Rate limited. Please wait a moment and try again." };
        return { error: "AI service error (status " + resp["status"] + ")" };
      } catch (e) {
        return { error: "Connection error: " + (e["message"] || String(e)) };
      }
    }

    case "theta_generate_image": {
      if (!hasAuth) return { error: "Image generation requires a Wave OS account with compute credits." };
      const prompt = args["prompt"];
      if (!prompt) throw new Error("prompt required");
      const width = args["width"] || 1024;
      const height = args["height"] || 1024;
      const IMAGE_CREDITS = 4;
      try {
        // Deduct credits before generation
        const deductResult = await deductCredits(IMAGE_CREDITS, "Image generation: " + prompt["slice"](0, 50));
        if (!deductResult["success"]) return { error: deductResult["message"] };

        const resp = await fetch(THETA_COMPUTE_URL + "/api/v1/generate/image", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + THETA_TOKEN },
          body: JSON["stringify"]({ prompt, width, height, project_id: THETA_PROJECT_ID })
        });
        if (!resp["ok"]) {
          if (resp["status"] === 402) return { error: "Insufficient compute credits. Visit oswave.io to add credits." };
          return { error: "Image generation failed (status " + resp["status"] + ")" };
        }
        const data = await resp["json"]();
        return { image_url: data["image_url"] || data["url"] || "", prompt, width, height, credits_used: IMAGE_CREDITS, credits_remaining: deductResult["balance"], details: data };
      } catch (e) {
        return { error: "Image generation error: " + (e["message"] || String(e)) };
      }
    }

    case "theta_generate_video": {
      if (!hasAuth) return { error: "Video generation requires a Wave OS account with compute credits." };
      const prompt = args["prompt"];
      if (!prompt) throw new Error("prompt required");
      const duration = args["duration"] || 5;
      const VIDEO_CREDITS = 20;
      try {
        // Deduct credits before generation
        const deductResult = await deductCredits(VIDEO_CREDITS, "Video generation: " + prompt["slice"](0, 50));
        if (!deductResult["success"]) return { error: deductResult["message"] };

        const resp = await fetch(THETA_COMPUTE_URL + "/api/v1/generate/video", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + THETA_TOKEN },
          body: JSON["stringify"]({ prompt, duration, project_id: THETA_PROJECT_ID })
        });
        if (!resp["ok"]) {
          if (resp["status"] === 402) return { error: "Insufficient compute credits. Visit oswave.io to add credits." };
          return { error: "Video generation failed (status " + resp["status"] + ")" };
        }
        const data = await resp["json"]();
        return { video_url: data["video_url"] || data["url"] || "", prompt, duration, credits_used: VIDEO_CREDITS, credits_remaining: deductResult["balance"], details: data };
      } catch (e) {
        return { error: "Video generation error: " + (e["message"] || String(e)) };
      }
    }

    case "theta_list_models": {
      try {
        const resp = await fetch(THETA_COMPUTE_URL + "/api/v1/models", { headers: { "Authorization": "Bearer " + THETA_TOKEN } });
        if (!resp["ok"]) return { error: "Failed to list models (status " + resp["status"] + ")" };
        const data = await resp["json"]();
        return { models: data };
      } catch (e) {
        return { error: "Model list error: " + (e["message"] || String(e)) };
      }
    }

    case "theta_get_credits": {
      try {
        // If authenticated, try user-scoped first; fall back to Eddie's WS
        let credits;
        if (hasAuth) {
          // Try to get credits for the authenticated user's workspace
          credits = await base44["asServiceRole"]["entities"]["ComputeCredit"]["filter"]({});
          if (!Array["isArray"](credits) || credits["length"] === 0) {
            // Fallback to Eddie's workspace for demo
            credits = await base44["asServiceRole"]["entities"]["ComputeCredit"]["filter"]({ workspace_id: EDDIE_WS });
          }
        } else {
          credits = await base44["asServiceRole"]["entities"]["ComputeCredit"]["filter"]({ workspace_id: EDDIE_WS });
        }
        if (Array["isArray"](credits) && credits["length"] > 0) {
          return { credits_balance: credits[0]["credits_balance"] || 0, plan: credits[0]["plan"] || "free", credits_used_this_period: credits[0]["credits_used_this_period"] || 0 };
        }
        return { credits_balance: 0, plan: "none", note: "No credit record found. Enable compute to get 100 free credits." };
      } catch (e) {
        return { error: "Credit check error: " + (e["message"] || String(e)) };
      }
    }

    // ═══════════════════════════════════════════════════════════
    // EXISTING: Wave OS Tools (14) — preserved as-is for Eddie
    // ═══════════════════════════════════════════════════════════

    case "wave": {
      let msg = typeof args["message"] === "string" ? args["message"]["trim"]()["substring"](0, 10000) : "";
      if (!msg) throw new Error("Message required");
      msg = msg["replace"](/^@(?:cursor|wave)\s*/i, "")["trim"]();
      if (!msg) throw new Error("Message required");

      // Save user message to conversation
      try { await base44["asServiceRole"]["entities"]["ChatMessage"]["create"]({ conversation_id: EDDIE_CONV, sender_id: EDDIE_WS, sender_name: "Cursor", content: msg, message_type: "user", reply_to: null, read_by: [] }); } catch (e) {}
      try { await base44["asServiceRole"]["entities"]["Conversation"]["update"](EDDIE_CONV, { last_message_preview: msg["slice"](0, 100), last_message_at: new Date()["toISOString"](), last_sender_name: "Cursor" }); } catch (e) {}

      // Try intent parser first (0-credit actions)
      const intent = parseIntent(msg);
      if (intent) {
        const intentResult = await handleIntent(intent, EDDIE_WS, EDDIE_CONV);
        if (intentResult) {
          try { await base44["asServiceRole"]["entities"]["ChatMessage"]["create"]({ conversation_id: EDDIE_CONV, sender_id: "wave_assistant", sender_name: "Wave Assistant", content: intentResult, message_type: "assistant", reply_to: null, read_by: [] }); } catch (e) {}
          try { await base44["asServiceRole"]["entities"]["Conversation"]["update"](EDDIE_CONV, { last_message_preview: intentResult["slice"](0, 100), last_message_at: new Date()["toISOString"](), last_sender_name: "Wave Assistant" }); } catch (e) {}
          return intentResult;
        }
      }

      // Fall back to Theta AI chat
      try {
        const history = await base44["asServiceRole"]["entities"]["ChatMessage"]["filter"]({ conversation_id: EDDIE_CONV });
        const sorted = Array["isArray"](history) ? history["sort"]((a, c) => new Date(a["created_date"])["getTime"]() - new Date(c["created_date"])["getTime"]()) : [];
        const msgs = sorted["slice"](-8)["map"](m => ({ role: m["message_type"] === "assistant" ? "assistant" : "user", content: m["content"] }));
        msgs["push"]({ role: "user", content: msg });

        let ar = "I could not generate a response.";
        try {
          const resp = await fetch(THETA_AI_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + THETA_TOKEN },
            body: JSON["stringify"]({ messages: msgs, max_tokens: 512, temperature: 0.7 })
          });
          if (resp["ok"]) { const data = await resp["json"](); const ad = data["body"] || data; ar = ad["choices"]?.[0]?.["message"]?.["content"] || ar; }
          else if (resp["status"] === 429) { ar = "I'm getting a lot of requests right now. Please wait a moment and try again."; }
          else { ar = "Sorry, I had trouble connecting to the AI service. Please try again."; }
        } catch (e) { ar = "Connection error. Please try again."; }

        try { await base44["asServiceRole"]["entities"]["ChatMessage"]["create"]({ conversation_id: EDDIE_CONV, sender_id: "wave_assistant", sender_name: "Wave Assistant", content: ar, message_type: "assistant", reply_to: null, read_by: [] }); } catch (e) {}
        try { await base44["asServiceRole"]["entities"]["Conversation"]["update"](EDDIE_CONV, { last_message_preview: ar["slice"](0, 100), last_message_at: new Date()["toISOString"](), last_sender_name: "Wave Assistant" }); } catch (e) {}
        return ar;
      } catch (e) {
        return "Error processing message: " + (e["message"] || String(e));
      }
    }

    case "wave_check_messages": {
      try {
        const msgs = await base44["asServiceRole"]["entities"]["ChatMessage"]["filter"]({ conversation_id: EDDIE_CONV });
        const sorted = Array["isArray"](msgs) ? msgs["sort"]((a, c) => new Date(a["created_date"])["getTime"]() - new Date(c["created_date"])["getTime"]()) : [];
        const recent = sorted["slice"](-10);
        return { messages: recent["map"](m => ({ id: m["id"], sender: m["sender_name"], content: m["content"], type: m["message_type"], date: m["created_date"] })), count: recent["length"] };
      } catch (e) { return { messages: [], count: 0 }; }
    }

    case "wave_send_message": {
      const msg = typeof args["message"] === "string" ? args["message"]["substring"](0, 10000) : "";
      if (!msg) throw new Error("Message required");
      try { await base44["asServiceRole"]["entities"]["ChatMessage"]["create"]({ conversation_id: EDDIE_CONV, sender_id: EDDIE_WS, sender_name: "Cursor", content: msg, message_type: "user", reply_to: null, read_by: [] }); } catch (e) {}
      return { sent: true };
    }

    case "wave_save_memory": {
      try {
        const s = await base44["asServiceRole"]["entities"]["AssistantMemory"]["create"]({ workspace_id: EDDIE_WS, category: args["category"] || "general", content: args["content"], source: "mcp_cursor", tags: args["tags"] || [], confidence: 1.0 });
        return { saved: true, id: s["id"] };
      } catch (e) { return { saved: false, error: e["message"] }; }
    }

    case "wave_recall_memory": {
      try {
        const ai = await base44["asServiceRole"]["entities"]["AssistantMemory"]["filter"]({ workspace_id: EDDIE_WS });
        let items = Array["isArray"](ai) ? ai["filter"](i => { const c = i["category"] || ""; return c !== "conversation" && c !== "pattern"; }) : [];
        if (args["query"]) { const lq = args["query"]["toLowerCase"](); items = items["filter"](i => (i["content"] || "")["toLowerCase"]()["includes"](lq)); }
        if (args["category"]) items = items["filter"](i => i["category"] === args["category"]);
        return { results: items["slice"](0, 20), count: items["length"] };
      } catch (e) { return { results: [], error: e["message"] }; }
    }

    case "wave_morning_briefing":
    case "wave_triage":
    case "wave_meeting_prep":
    case "wave_follow_up_scan": {
      const actionMap = { wave_morning_briefing: "briefing", wave_triage: "triage", wave_meeting_prep: "chat", wave_follow_up_scan: "chat" };
      try {
        const result = await handleIntent({ action: actionMap[name], params: {} }, EDDIE_WS, EDDIE_CONV);
        return result || { message: "No data available for this action." };
      } catch (e) { return { error: e["message"] }; }
    }

    case "wave_delegate_subagent":
      return { message: "Sub-agent delegation not yet available via MCP." };

    case "wave_entity_list": {
      const entityName = args["entity_name"];
      if (!entityName) throw new Error("entity_name required");
      const filter = args["filter"] || {};
      const sort = args["sort"] || "-created_date";
      const limit = Math["min"](args["limit"] || 50, 500);
      const records = await base44["asServiceRole"]["entities"][entityName]["filter"]({ ...filter, limit, sort });
      return { records: records || [], count: Array["isArray"](records) ? records["length"] : 0 };
    }

    case "wave_entity_create": {
      const entityName = args["entity_name"];
      if (!entityName) throw new Error("entity_name required");
      const result = await base44["asServiceRole"]["entities"][entityName]["create"](args["data"] || {});
      return { created: true, id: result["id"], record: result };
    }

    case "wave_entity_update": {
      const entityName = args["entity_name"];
      if (!entityName) throw new Error("entity_name required");
      const records = await base44["asServiceRole"]["entities"][entityName]["filter"](args["filter"] || {});
      if (!Array["isArray"](records) || records["length"] === 0) return { updated: 0 };
      for (const r of records) { await base44["asServiceRole"]["entities"][entityName]["update"](r["id"], args["data"] || {}); }
      return { updated: records["length"] };
    }

    case "wave_entity_delete": {
      const entityName = args["entity_name"];
      if (!entityName) throw new Error("entity_name required");
      const records = await base44["asServiceRole"]["entities"][entityName]["filter"](args["filter"] || {});
      if (!Array["isArray"](records) || records["length"] === 0) return { deleted: 0 };
      for (const r of records) { await base44["asServiceRole"]["entities"][entityName]["delete"](r["id"]); }
      return { deleted: records["length"] };
    }

        // ═══════════════════════════════════════════════════════════
    // uBase Packet Marketplace Tools (5)
    // ═══════════════════════════════════════════════════════════

    case "ubase_list_packets": {
      try {
        const filter = {};
        if (args["category"]) filter["category"] = args["category"];
        const sort = args["sort"] || "-downloads";
        const limit = Math["min"](args["limit"] || 20, 100);
        const records = await base44["asServiceRole"]["entities"]["Packet"]["filter"]({ ...filter, limit, sort });
        let items = Array["isArray"](records) ? records : [];
        if (args["search"]) {
          const sq = args["search"]["toLowerCase"]();
          items = items["filter"](p => {
            const pn = (p["name"] || "")["toLowerCase"]();
            const pd = (p["description"] || "")["toLowerCase"]();
            return pn["includes"](sq) || pd["includes"](sq);
          });
        }
        if (args["tags"] && Array["isArray"](args["tags"])) {
          const tagSet = args["tags"];
          items = items["filter"](p => {
            const pt = p["tags"] || [];
            return tagSet["some"](t => pt["includes"](t));
          });
        }
        const summaries = items["map"](p => ({
          id: p["id"], name: p["name"], description: p["description"],
          category: p["category"], downloads: p["downloads"] || 0,
          price: p["price"] || 0, author_name: p["author_name"],
          thumbnail_url: p["thumbnail_url"],
          packet_url: p["packet_url"], tags: p["tags"] || []
        }));
        return { packets: summaries, count: summaries["length"] };
      } catch (e) {
        return { error: "Failed to list packets: " + (e["message"] || String(e)), packets: [], count: 0 };
      }
    }

    case "ubase_get_packet": {
      try {
        let record;
        if (args["packet_id"]) {
          record = await base44["asServiceRole"]["entities"]["Packet"]["get"](args["packet_id"]);
        } else if (args["name"]) {
          const results = await base44["asServiceRole"]["entities"]["Packet"]["filter"]({ name: args["name"], limit: 1 });
          record = Array["isArray"](results) && results["length"] > 0 ? results[0] : null;
        }
        if (!record) return { error: "Packet not found" };
        return {
          id: record["id"], name: record["name"], description: record["description"],
          version: record["version"], author_name: record["author_name"], author_email: record["author_email"],
          category: record["category"], tags: record["tags"] || [], price: record["price"] || 0,
          downloads: record["downloads"] || 0, status: record["status"],
          packet_url: record["packet_url"], thumbnail_url: record["thumbnail_url"],
          readme: record["readme"] || "", meta_json: record["meta_json"] || ""
        };
      } catch (e) {
        return { error: "Failed to get packet: " + (e["message"] || String(e)) };
      }
    }

    case "ubase_install_packet": {
      try {
        let record;
        if (args["packet_id"]) {
          record = await base44["asServiceRole"]["entities"]["Packet"]["get"](args["packet_id"]);
        } else if (args["name"]) {
          const results = await base44["asServiceRole"]["entities"]["Packet"]["filter"]({ name: args["name"], limit: 1 });
          record = Array["isArray"](results) && results["length"] > 0 ? results[0] : null;
        }
        if (!record) return { error: "Packet not found" };
        return {
          name: record["name"],
          version: record["version"],
          packet_url: record["packet_url"],
          instructions: [
            "1. Download the .ubase file from: " + (record["packet_url"] || "N/A"),
            "2. Unzip it to extract prompt.md and supporting files",
            "3. Open your Base44 app builder at app.base44.com",
            "4. Paste the contents of prompt.md into the builder chat",
            "5. The builder will install the feature automatically",
            "",
            "Note: No MCP connection required. The .ubase packet works standalone in any Base44 app."
          ],
          readme: record["readme"] ? record["readme"]["slice"](0, 500) : ""
        };
      } catch (e) {
        return { error: "Failed to get install info: " + (e["message"] || String(e)) };
      }
    }

    case "ubase_create_packet": {
      try {
        const data = {
          name: args["name"],
          description: args["description"],
          packet_url: args["packet_url"],
          category: args["category"] || "general",
          tags: args["tags"] || [],
          readme: args["readme"] || "",
          author_name: args["author_name"] || "Eddie Pizarro",
          author_email: args["author_email"] || "eddie@oswave.io",
          price: args["price"] || 0,
          version: "1.0.0",
          downloads: 0,
          status: "published"
        };
        const result = await base44["asServiceRole"]["entities"]["Packet"]["create"](data);
        return { created: true, id: result["id"], name: data["name"], message: "Packet published to uBase marketplace" };
      } catch (e) {
        return { created: false, error: e["message"] || String(e) };
      }
    }

    case "ubase_my_packets": {
      try {
        const authorEmail = args["author_email"] || "eddie@oswave.io";
        const sort = args["sort"] || "-created_date";
        const records = await base44["asServiceRole"]["entities"]["Packet"]["filter"]({ author_email: authorEmail, sort, limit: 50 });
        const items = Array["isArray"](records) ? records["map"](p => ({
          id: p["id"], name: p["name"], description: p["description"],
          category: p["category"], downloads: p["downloads"] || 0,
          price: p["price"] || 0, status: p["status"], version: p["version"]
        })) : [];
        return { packets: items, count: items["length"] };
      } catch (e) {
        return { error: "Failed to list packets: " + (e["message"] || String(e)), packets: [], count: 0 };
      }
    }

default:
      throw new Error("Unknown tool: " + name);
  }
}
