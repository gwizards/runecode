/**
 * Vite Dev API Plugin
 *
 * Serves real data from ~/.claude/ when running `npm run dev`
 * without the Tauri backend. Uses the official Claude Agent SDK
 * for session listing, history, and chat execution.
 */

import type { Plugin, ViteDevServer } from "vite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync, exec, spawn } from "node:child_process";
import { promisify } from "node:util";
const execAsync = promisify(exec);
import { WebSocketServer, WebSocket } from "ws";
import crypto from "node:crypto";

// SDK imports — dynamic to avoid issues when the package isn't installed
type SdkModule = typeof import("@anthropic-ai/claude-agent-sdk");
let sdkQuery: SdkModule["query"];
let sdkListSessions: SdkModule["listSessions"];
let sdkGetSessionMessages: SdkModule["getSessionMessages"];
let sdkForkSession: SdkModule["forkSession"];

async function loadSdk() {
  const sdk = await import("@anthropic-ai/claude-agent-sdk");
  sdkQuery = sdk.query;
  sdkListSessions = sdk.listSessions;
  sdkGetSessionMessages = sdk.getSessionMessages;
  sdkForkSession = sdk.forkSession;
}

// Cached initialization data from SDK
let cachedInitData: {
  models: any[];
  account: any;
  commands: any[];
  agents: any[];
  mcpServers: any[];
  timestamp: number;
} | null = null;

const INIT_CACHE_TTL = 60_000; // 1 minute cache

// Cached usage data from active sessions
let cachedRateLimitInfo: any = null;

// Autocomplete: limit to one in-flight request at a time
let _autocompleteAbort: AbortController | null = null;
let windowResetsAt = 0; // track when to reset accumulator

function createEmptyUsage() {
  return {
    totalCostUsd: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheCreationTokens: 0,
    totalTurns: 0,
    totalDurationMs: 0,
    sessionCount: 0,
    modelUsage: {} as Record<string, any>,
  };
}
let cachedTotalUsage = createEmptyUsage();

/** Reset usage accumulator and rate limit info if the rate limit window has expired */
function checkWindowReset() {
  if (windowResetsAt > 0 && Date.now() / 1000 >= windowResetsAt) {
    cachedTotalUsage = createEmptyUsage();
    cachedRateLimitInfo = null;
    windowResetsAt = 0;
  }
}

// Pending promise for in-flight getInitData — deduplicates concurrent callers
let _initDataPending: Promise<typeof cachedInitData> | null = null;

async function getInitData() {
  if (cachedInitData && Date.now() - cachedInitData.timestamp < INIT_CACHE_TTL) {
    return cachedInitData;
  }

  // If another caller is already fetching, piggyback on that promise
  if (_initDataPending) return _initDataPending;

  _initDataPending = (async () => {
    try {
      const probeQuery = sdkQuery({
        prompt: ".",
        options: {
          maxTurns: 0,
          settingSources: ["user", "project", "local"],
        }
      });

      const [initResult, models, account, agents, mcpServers] = await Promise.all([
        probeQuery.initializationResult(),
        probeQuery.supportedModels(),
        probeQuery.accountInfo(),
        probeQuery.supportedAgents().catch(() => []),
        probeQuery.mcpServerStatus().catch(() => []),
      ]);

      probeQuery.close();

      cachedInitData = {
        models: models || [],
        account: account || {},
        commands: initResult?.commands || [],
        agents: agents || [],
        mcpServers: mcpServers || [],
        timestamp: Date.now(),
      };

      return cachedInitData;
    } catch (err: any) {
      console.log("[dev-api] SDK probe failed:", err.message);
      return { models: [], account: {}, commands: [], agents: [], mcpServers: [], timestamp: Date.now() };
    } finally {
      _initDataPending = null;
    }
  })();

  return _initDataPending;
}

// ---------------------------------------------------------------------------
// Project helpers — group sessions by cwd to build the project list
// ---------------------------------------------------------------------------

interface ProjectEntry {
  id: string;
  path: string;
  sessions: string[];
  created_at: number;
  most_recent_session?: number;
}

interface SessionEntry {
  id: string;
  project_id: string;
  project_path: string;
  created_at: number;
  first_message?: string;
  message_timestamp?: string;
}

/** Encode a path like /home/koves/GitHub/runecode → -home-koves-GitHub-runecode */
function encodePathToId(p: string): string {
  return p.replace(/\//g, "-");
}

// ---------------------------------------------------------------------------
// Session list cache — sdkListSessions() scans the filesystem on every call.
// Cache for a short window to avoid redundant scans when the UI hits
// /api/projects then /api/projects/{id}/sessions in quick succession.
// ---------------------------------------------------------------------------
let _sessionsCache: { data: any[]; ts: number } | null = null;
const SESSIONS_CACHE_TTL = 15_000; // 15 seconds

async function cachedListSessions(): Promise<any[]> {
  const now = Date.now();
  if (_sessionsCache && now - _sessionsCache.ts < SESSIONS_CACHE_TTL) {
    return _sessionsCache.data;
  }
  const data = await sdkListSessions();
  _sessionsCache = { data, ts: now };
  return data;
}

/** Invalidate the session list cache (call after creating/deleting sessions) */
function invalidateSessionsCache() {
  _sessionsCache = null;
}

async function listProjects(): Promise<ProjectEntry[]> {
  const allSessions = await cachedListSessions();

  // Group sessions by cwd (project directory)
  const byProject = new Map<string, typeof allSessions>();
  for (const s of allSessions) {
    const cwd = s.cwd || "unknown";
    if (!byProject.has(cwd)) byProject.set(cwd, []);
    byProject.get(cwd)!.push(s);
  }

  const projects: ProjectEntry[] = [];
  for (const [projectPath, sessions] of byProject) {
    const id = encodePathToId(projectPath);
    const sessionIds = sessions.map((s) => s.sessionId);
    const mostRecent = Math.max(...sessions.map((s) => s.lastModified));
    const oldest = Math.min(...sessions.map((s) => s.lastModified));

    projects.push({
      id,
      path: projectPath,
      sessions: sessionIds,
      created_at: oldest / 1000,
      most_recent_session: mostRecent / 1000,
    });
  }

  projects.sort((a, b) => (b.most_recent_session || 0) - (a.most_recent_session || 0));
  return projects;
}

async function getProjectSessions(projectId: string): Promise<SessionEntry[]> {
  const all = await cachedListSessions();
  const sessions = all.filter((s) => encodePathToId(s.cwd || "") === projectId);
  const projectPath = sessions[0]?.cwd || "";

  return sessions.map((s) => ({
    id: s.sessionId,
    project_id: projectId,
    project_path: s.cwd || projectPath,
    created_at: s.lastModified / 1000,
    first_message: s.firstPrompt || s.summary || undefined,
    message_timestamp: new Date(s.lastModified).toISOString(),
  }));
}

async function resolveProjectPath(projectId: string): Promise<string | null> {
  try {
    const all = await cachedListSessions();
    const match = all.find((s) => encodePathToId(s.cwd || "") === projectId);
    return match?.cwd || null;
  } catch {
    return null;
  }
}

async function loadSessionHistory(projectId: string, sessionId: string): Promise<any[]> {
  // Try JSONL first — has timestamps, full metadata, and tool progress events
  // that SDK's getSessionMessages() strips out
  const jsonlResult = await loadSessionHistoryFromJsonl(projectId, sessionId);
  if (jsonlResult.length > 0) return jsonlResult;

  // Fallback to SDK if JSONL not found (e.g., session from different machine)
  try {
    const projectPath = await resolveProjectPath(projectId);
    const messages = await sdkGetSessionMessages(sessionId, {
      dir: projectPath || undefined,
    });

    if (messages && messages.length > 0) {
      return messages.map((m: any) => {
        const msg = m.message;
        const result: any = {
          type: m.type,
          uuid: m.uuid,
          session_id: m.session_id,
        };

        if (msg) {
          result.message = msg;
          // Expose model, usage, stop_reason at top level for the UI
          if (msg.model) result.model = msg.model;
          if (msg.usage) result.usage = msg.usage;
          if (msg.stop_reason) result.stop_reason = msg.stop_reason;
        }

        return result;
      });
    }
  } catch (err: any) {
    console.log("[dev-api] SDK getSessionMessages failed, falling back to JSONL:", err.message);
  }

  // Fallback to JSONL for sessions the SDK can't find
  return loadSessionHistoryFromJsonl(projectId, sessionId);
}

/** Fallback JSONL reader for session history when SDK can't find the session */
async function loadSessionHistoryFromJsonl(projectId: string, sessionId: string): Promise<any[]> {
  const readline = await import("node:readline");
  const claudeDir = path.join(os.homedir(), ".claude", "projects");
  const jsonlPath = path.join(claudeDir, projectId, `${sessionId}.jsonl`);
  if (!fs.existsSync(jsonlPath)) return [];

  const entries: any[] = [];
  const stream = fs.createReadStream(jsonlPath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { entries.push(JSON.parse(line)); } catch { /* skip */ }
  }
  rl.close();
  stream.destroy();
  return entries;
}

// ---------------------------------------------------------------------------
// Vite Plugin
// ---------------------------------------------------------------------------

export function devApiPlugin(): Plugin {
  return {
    name: "runecode-dev-api",
    configureServer(server: ViteDevServer) {
      // Load SDK on server start
      loadSdk().then(() => {
        console.log("[dev-api] Claude Agent SDK loaded successfully");
      }).catch((err) => {
        console.error("[dev-api] Failed to load Claude Agent SDK:", err.message);
      });

      // Auto-start local model server if enabled
      try {
        const lsKey = 'runecode-ai-autocomplete-enabled';
        const providerKey = 'runecode-ai-autocomplete-provider';
        // Read from localStorage is not available server-side — check a file-based flag instead
        const flagFile = path.join(os.homedir(), '.runecode', 'autocomplete-local-enabled');
        if (fs.existsSync(flagFile)) {
          import('./src/lib/localModelManager').then(({ startServer }) => {
            startServer().then(() => {
              console.log("[dev-api] Local autocomplete model auto-started");
            }).catch((err) => {
              console.log("[dev-api] Local autocomplete model failed to auto-start:", err.message);
            });
          });
        }
      } catch { /* ignore */ }

      // REST API middleware
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();

        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");

        try {
          // ---- Account Management ----

          // GET /api/accounts — list all account profiles
          if (req.url === "/api/accounts" && req.method === "GET") {
            try {
              const { listAccounts, ensureCurrentProfileSaved } = await import('./src/lib/accountManager');
              // Only create a profile if one doesn't exist yet — never overwrite
              // credentials on list requests (that would poison profiles after a switch)
              try {
                ensureCurrentProfileSaved();
              } catch { /* ignore — SDK may not be ready */ }
              res.end(JSON.stringify(listAccounts()));
            } catch (err: any) {
              res.end(JSON.stringify({ accounts: [], activeId: null, error: err.message }));
            }
            return;
          }

          // POST /api/accounts/switch — switch active account
          if (req.url === "/api/accounts/switch" && req.method === "POST") {
            const chunks: Buffer[] = [];
            req.on("data", (chunk: Buffer) => chunks.push(chunk));
            req.on("end", async () => {
              try {
                const { accountId } = JSON.parse(Buffer.concat(chunks).toString());
                const { switchAccount } = await import('./src/lib/accountManager');
                const success = switchAccount(accountId);
                if (success) {
                  // Invalidate ALL SDK caches so next request uses new credentials
                  cachedInitData = null;
                  _sessionsCache = null;
                  _initDataPending = null;
                }
                res.end(JSON.stringify({ success }));
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }

          // POST /api/accounts/save-current — save current credentials as a profile
          // Enriches with email/org from SDK accountInfo (not in creds file)
          if (req.url === "/api/accounts/save-current" && req.method === "POST") {
            try {
              const { saveCurrentAsProfile } = await import('./src/lib/accountManager');
              // Force fresh SDK probe to get the correct account identity
              cachedInitData = null;
              _initDataPending = null;
              let sdkEmail: string | undefined;
              let sdkOrg: string | undefined;
              let sdkSub: string | undefined;
              let sdkOrgId: string | undefined;
              try {
                const initData = await getInitData();
                sdkEmail = initData.account?.email;
                sdkOrg = initData.account?.organization;
                sdkSub = initData.account?.subscriptionType;
                sdkOrgId = initData.account?.orgId;
              } catch { /* ignore */ }
              const profile = saveCurrentAsProfile(sdkEmail, sdkOrg, sdkSub, sdkOrgId);
              res.end(JSON.stringify({ success: !!profile, profile }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          // PUT /api/accounts/{id} — update account profile
          const accountUpdateMatch = req.url?.match(/^\/api\/accounts\/([^/]+)$/);
          if (accountUpdateMatch && req.method === "PUT") {
            const chunks: Buffer[] = [];
            req.on("data", (chunk: Buffer) => chunks.push(chunk));
            req.on("end", async () => {
              try {
                const updates = JSON.parse(Buffer.concat(chunks).toString());
                const { updateProfile } = await import('./src/lib/accountManager');
                const profile = updateProfile(decodeURIComponent(accountUpdateMatch[1]), updates);
                res.end(JSON.stringify({ success: !!profile, profile }));
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }

          // DELETE /api/accounts/{id} — remove an account profile
          const accountDeleteMatch = req.url?.match(/^\/api\/accounts\/([^/]+)$/);
          if (accountDeleteMatch && req.method === "DELETE") {
            try {
              const { removeAccount } = await import('./src/lib/accountManager');
              const success = removeAccount(decodeURIComponent(accountDeleteMatch[1]));
              res.end(JSON.stringify({ success }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          // POST /api/accounts/login — spawn `claude auth login`, return OAuth URL + metadata
          if (req.url === "/api/accounts/login" && req.method === "POST") {
            try {
              // Kill any previous login process
              if ((global as any).__loginProc) {
                try { (global as any).__loginProc.kill(); } catch {}
                (global as any).__loginProc = null;
              }

              const proc = spawn('claude', ['auth', 'login'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, BROWSER: 'echo' },
              });

              let output = '';
              proc.stdout?.on('data', (data: Buffer) => {
                const chunk = data.toString();
                output += chunk;
                console.log(`[accounts] login stdout: ${chunk.trim()}`);
              });
              proc.stderr?.on('data', (data: Buffer) => {
                const chunk = data.toString();
                output += chunk;
                console.log(`[accounts] login stderr: ${chunk.trim()}`);
              });
              proc.on('exit', (code) => console.log(`[accounts] login proc exited code=${code}, full output: ${output.replace(/https:\/\/[^\s]+/g, '[URL]').trim()}`));

              // Wait for the URL to appear
              const url = await new Promise<string>((resolve) => {
                const check = () => {
                  const match = output.match(/(https:\/\/claude\.ai\/oauth\/authorize[^\s]+)/);
                  if (match) resolve(match[1]);
                };
                proc.stdout?.on('data', check);
                proc.stderr?.on('data', check);
                setTimeout(() => resolve(''), 8000);
              });

              if (!url) {
                proc.kill();
                res.end(JSON.stringify({ success: false, error: 'Could not get login URL' }));
                return;
              }

              // Get the CLI's local callback port
              const pid = proc.pid;
              let port = '';
              try {
                const { stdout } = await execAsync(`ss -tlnp 2>/dev/null | grep "pid=${pid}" | grep -oP '127.0.0.1:\\K\\d+' | head -1`, { timeout: 3000 });
                port = stdout.trim();
              } catch {}

              // Extract state from the URL
              const stateMatch = url.match(/state=([^&\s]+)/);
              const state = stateMatch ? stateMatch[1] : '';

              (global as any).__loginProc = proc;
              (global as any).__loginMeta = { url, port, state, pid };

              console.log(`[accounts] Login started: pid=${pid}, port=${port}, state=${state.slice(0, 10)}...`);
              res.end(JSON.stringify({ success: true, url, port, state }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          // POST /api/accounts/login/code — relay auth code to CLI's callback server
          if (req.url === "/api/accounts/login/code" && req.method === "POST") {
            const chunks: Buffer[] = [];
            req.on("data", (chunk: Buffer) => chunks.push(chunk));
            req.on("end", async () => {
              try {
                let { code } = JSON.parse(Buffer.concat(chunks).toString());
                // Strip the #STATE fragment if present
                code = code.split('#')[0].trim();

                const meta = (global as any).__loginMeta;
                if (!meta || !meta.port) {
                  res.end(JSON.stringify({ success: false, error: 'No login session active' }));
                  return;
                }

                console.log(`[accounts] Relaying code to CLI callback: port=${meta.port}, code=${code.slice(0, 10)}...`);

                // Hit the CLI's local callback server (don't follow redirects)
                const callbackUrl = `http://127.0.0.1:${meta.port}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(meta.state)}`;
                let cbStatus = 0;
                let cbLocation = '';
                try {
                  const cbRes = await fetch(callbackUrl, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
                  cbStatus = cbRes.status;
                  cbLocation = cbRes.headers.get('location') || '';
                  console.log(`[accounts] Callback response: status=${cbStatus}, location=${cbLocation}`);
                } catch (cbErr: any) {
                  console.log(`[accounts] Callback error: ${cbErr.message}`);
                }

                const isSuccess = cbLocation.includes('/success');

                if (isSuccess) {
                  // Wait for CLI to finish writing credentials
                  const proc = (global as any).__loginProc;
                  if (proc) {
                    await new Promise<void>((resolve) => {
                      if (proc.exitCode !== null) { resolve(); return; }
                      const timeout = setTimeout(resolve, 10000);
                      proc.on('exit', () => { clearTimeout(timeout); resolve(); });
                    });
                  }

                  // Save the new account profile
                  const { saveCurrentAsProfile } = await import('./src/lib/accountManager');
                  try {
                    const result = execSync('claude auth status --json', { encoding: 'utf-8', timeout: 10000 });
                    const status = JSON.parse(result);
                    console.log(`[accounts] Login success: email=${status.email}, org=${status.orgName}, orgId=${status.orgId}`);
                    const profile = saveCurrentAsProfile(status.email, status.orgName, status.subscriptionType, status.orgId);
                    cachedInitData = null;
                    _sessionsCache = null;
                    (global as any).__loginProc = null;
                    (global as any).__loginMeta = null;
                    res.end(JSON.stringify({ success: true, profile }));
                  } catch (statusErr: any) {
                    console.log(`[accounts] auth status failed after success redirect: ${statusErr.message}`);
                    res.end(JSON.stringify({ success: false, error: 'Login appeared to succeed but credentials not found. Try again.' }));
                  }
                } else {
                  const errMsg = cbStatus === 400 ? 'Invalid state or code. Try starting a new login.' : `Callback failed (${cbStatus})`;
                  res.end(JSON.stringify({ success: false, error: errMsg }));
                }
              } catch (err: any) {
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
            });
            return;
          }

          // GET /api/projects
          if (req.url === "/api/projects") {
            const projects = await listProjects();
            res.end(JSON.stringify(projects));
            return;
          }

          // GET /api/projects/{projectId}/sessions
          const sessionsMatch = req.url.match(/^\/api\/projects\/([^/]+)\/sessions/);
          if (sessionsMatch) {
            const projectId = decodeURIComponent(sessionsMatch[1]);
            const sessions = await getProjectSessions(projectId);
            res.end(JSON.stringify(sessions));
            return;
          }

          // GET /api/home-directory
          if (req.url === "/api/home-directory") {
            res.end(JSON.stringify(os.homedir()));
            return;
          }

          // GET /api/sessions/{sessionId}/history/{projectId}
          const historyMatch = req.url.match(/^\/api\/sessions\/([^/]+)\/history\/([^/?]+)/);
          if (historyMatch) {
            const sessionId = decodeURIComponent(historyMatch[1]);
            const projectId = decodeURIComponent(historyMatch[2]);
            const history = await loadSessionHistory(projectId, sessionId);
            res.end(JSON.stringify(history));
            return;
          }

          // --- Stub endpoints for dev mode ---

          if (req.url === "/api/sessions/running") {
            res.end(JSON.stringify([]));
            return;
          }
          if (req.url?.startsWith("/api/storage/")) {
            const settingsFile = path.join(os.homedir(), ".runecode", "dev-settings.json");

            // Only handle app_settings table specially; other tables keep the stub
            if (req.url.startsWith("/api/storage/tables/app_settings")) {
              if (req.method === "GET") {
                // Read settings and return as rows
                let settings: Record<string, string> = {};
                try {
                  if (fs.existsSync(settingsFile)) {
                    settings = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
                  }
                } catch { /* return empty */ }

                const data = Object.entries(settings).map(([key, value]) => ({
                  id: key,
                  key,
                  value,
                }));
                res.end(JSON.stringify({ data, total: data.length }));
                return;
              }

              if (req.method === "POST" || req.method === "PUT") {
                // Read the request body and upsert settings
                const chunks: Buffer[] = [];
                req.on("data", (chunk: Buffer) => chunks.push(chunk));
                req.on("end", () => {
                  try {
                    const body = JSON.parse(Buffer.concat(chunks).toString());
                    // Support multiple formats:
                    // 1. { key, value } — direct
                    // 2. { primaryKeyValues: {key}, updates: {value} } — storageUpdateRow
                    // 3. { tableName, key, value } — storageInsertRow
                    // 4. { tableName, values: {key, value} } — storageInsertRow (apiCall format)
                    const key: string | undefined =
                      body.key || body.primaryKeyValues?.key || body.values?.key;
                    const value: string | undefined =
                      body.value ?? body.updates?.value ?? body.values?.value;

                    if (!key) {
                      res.statusCode = 400;
                      res.end(JSON.stringify({ error: "key is required" }));
                      return;
                    }

                    // Ensure directory exists
                    const dir = path.dirname(settingsFile);
                    if (!fs.existsSync(dir)) {
                      fs.mkdirSync(dir, { recursive: true });
                    }

                    // Read existing, merge, write
                    let settings: Record<string, string> = {};
                    try {
                      if (fs.existsSync(settingsFile)) {
                        settings = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
                      }
                    } catch { /* start fresh */ }

                    settings[key] = value ?? "";
                    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), "utf-8");

                    res.end(JSON.stringify({ id: key, key, value: settings[key] }));
                  } catch (err: any) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: err.message }));
                  }
                });
                return;
              }
            }

            // All other /api/storage/ routes — keep stub
            res.end(JSON.stringify({ data: [], total: 0 }));
            return;
          }
          if (req.url?.startsWith("/api/project-info")) {
            const urlObj = new URL(req.url, "http://localhost");
            const projPath = urlObj.searchParams.get("path") || "";
            let name = projPath.split("/").pop() || "unknown";
            let description: string | undefined;
            const techStack: string[] = [];
            let repoUrl: string | undefined;
            let gitBranch: string | undefined;

            if (projPath && fs.existsSync(projPath)) {
              // package.json — name, description, dependency-based tech detection
              const pkgPath = path.join(projPath, "package.json");
              if (fs.existsSync(pkgPath)) {
                try {
                  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
                  if (pkg.name) name = pkg.name;
                  if (pkg.description) description = pkg.description;
                  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
                  const depChecks: Record<string, string> = {
                    react: "React",
                    next: "Next.js",
                    vue: "Vue",
                    "@angular/core": "Angular",
                    svelte: "Svelte",
                    express: "Express",
                    fastify: "Fastify",
                    tailwindcss: "Tailwind CSS",
                    typescript: "TypeScript",
                  };
                  for (const [dep, label] of Object.entries(depChecks)) {
                    if (allDeps && dep in allDeps) techStack.push(label);
                  }
                } catch { /* ignore malformed package.json */ }
              }

              // Cargo.toml — Rust
              const cargoPath = path.join(projPath, "Cargo.toml");
              if (fs.existsSync(cargoPath)) {
                techStack.push("Rust");
                try {
                  const cargo = fs.readFileSync(cargoPath, "utf-8");
                  const nameMatch = cargo.match(/^\s*name\s*=\s*"([^"]+)"/m);
                  if (nameMatch && name === projPath.split("/").pop()) name = nameMatch[1];
                } catch { /* ignore */ }
              }

              // Python — pyproject.toml or requirements.txt
              if (
                fs.existsSync(path.join(projPath, "pyproject.toml")) ||
                fs.existsSync(path.join(projPath, "requirements.txt"))
              ) {
                techStack.push("Python");
              }

              // Go — go.mod
              if (fs.existsSync(path.join(projPath, "go.mod"))) {
                techStack.push("Go");
              }

              // TypeScript — tsconfig.json (only if not already added via package.json deps)
              if (
                fs.existsSync(path.join(projPath, "tsconfig.json")) &&
                !techStack.includes("TypeScript")
              ) {
                techStack.push("TypeScript");
              }

              // Docker
              if (fs.existsSync(path.join(projPath, "Dockerfile"))) {
                techStack.push("Docker");
              }

              // Git — remote URL and current branch
              const gitConfigPath = path.join(projPath, ".git", "config");
              if (fs.existsSync(gitConfigPath)) {
                try {
                  const gitConfig = fs.readFileSync(gitConfigPath, "utf-8");
                  const urlMatch = gitConfig.match(/url\s*=\s*(.+)/);
                  if (urlMatch) repoUrl = urlMatch[1].trim();
                } catch { /* ignore */ }
              }

              try {
                gitBranch = (await execAsync(`git -C "${projPath}" branch --show-current`, { timeout: 3000 })).stdout.trim() || undefined;
              } catch { /* not a git repo or git not available */ }
            }

            const result: Record<string, any> = { name, path: projPath, tech_stack: techStack };
            if (description) result.description = description;
            if (repoUrl) result.repo_url = repoUrl;
            if (gitBranch) result.git_branch = gitBranch;

            // Additional git + filesystem metadata — run in parallel to avoid serial blocking
            if (projPath && fs.existsSync(projPath)) {
              result.has_claude_md = fs.existsSync(path.join(projPath, "CLAUDE.md")) ||
                                    fs.existsSync(path.join(projPath, ".claude", "CLAUDE.md"));

              const [lastCommitRes, statusRes, countRes, duRes] = await Promise.allSettled([
                execAsync(`git -C "${projPath}" log -1 --format=%s`, { timeout: 3000 }),
                execAsync(`git -C "${projPath}" status --porcelain`, { timeout: 3000 }),
                execAsync(`find "${projPath}" -maxdepth 3 -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/target/*" -not -path "*/__pycache__/*" | wc -l`, { timeout: 5000 }),
                execAsync(`du -sm "${projPath}" --exclude=node_modules --exclude=.git --exclude=target 2>/dev/null | cut -f1`, { timeout: 5000 }),
              ]);

              if (lastCommitRes.status === 'fulfilled') {
                const v = lastCommitRes.value.stdout.trim();
                if (v) result.last_commit = v;
              }
              if (statusRes.status === 'fulfilled') {
                const v = statusRes.value.stdout.trim();
                result.uncommitted_count = v ? v.split("\n").length : 0;
              } else {
                result.uncommitted_count = 0;
              }
              if (countRes.status === 'fulfilled') {
                result.file_count = parseInt(countRes.value.stdout.trim()) || 0;
              }
              if (duRes.status === 'fulfilled') {
                result.disk_usage_mb = parseInt(duRes.value.stdout.trim()) || 0;
              }
            }

            res.end(JSON.stringify(result));
            return;
          }
          // GET /api/claude-md — discover CLAUDE.md files
          if (req.url?.startsWith("/api/claude-md/read")) {
            const urlObj = new URL(req.url, "http://localhost");
            const filePath = urlObj.searchParams.get("filePath") || "";
            if (!filePath) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "filePath query param required" }));
              return;
            }
            try {
              const content = fs.readFileSync(filePath, "utf-8");
              res.end(JSON.stringify({ path: filePath, content }));
            } catch {
              res.statusCode = 404;
              res.end(JSON.stringify({ path: filePath, content: "", error: "File not found" }));
            }
            return;
          }
          if (req.url?.startsWith("/api/claude-md")) {
            const urlObj = new URL(req.url, "http://localhost");
            const projectPath = urlObj.searchParams.get("projectPath") || "";

            const candidates = [
              { path: path.join(os.homedir(), ".claude", "CLAUDE.md"), scope: "user" as const },
              ...(projectPath
                ? [
                    { path: path.join(projectPath, "CLAUDE.md"), scope: "project" as const },
                    { path: path.join(projectPath, ".claude", "CLAUDE.md"), scope: "project" as const },
                  ]
                : []),
            ];

            const results = candidates
              .filter((c) => fs.existsSync(c.path))
              .map((c) => {
                try {
                  const stat = fs.statSync(c.path);
                  const relativePath = projectPath
                    ? c.path.replace(projectPath + "/", "")
                    : c.path.replace(os.homedir() + "/", "~/");
                  return {
                    relative_path: relativePath,
                    absolute_path: c.path,
                    size: stat.size,
                    modified: stat.mtimeMs / 1000,
                  };
                } catch {
                  return null;
                }
              })
              .filter(Boolean);

            res.end(JSON.stringify(results));
            return;
          }

          // GET /api/settings/claude/version — run `claude --version`
          if (req.url?.startsWith("/api/settings/claude/version")) {
            try {
              const output = execSync("claude --version", { encoding: "utf-8", timeout: 5000 }).trim();
              // Extract version number (e.g. "1.0.3" from "claude 1.0.3")
              const versionMatch = output.match(/(\d+\.\d+\.\d+[\w.-]*)/);
              res.end(JSON.stringify({
                is_installed: true,
                version: versionMatch ? versionMatch[1] : output,
                output,
              }));
            } catch {
              res.end(JSON.stringify({
                is_installed: false,
                version: null,
                output: "Claude Code not found",
              }));
            }
            return;
          }

          // GET/POST /api/settings/claude — read/write ~/.claude/settings.json
          if (req.url?.startsWith("/api/settings/claude")) {
            const settingsPath = path.join(os.homedir(), ".claude", "settings.json");

            if (req.method === "POST" || req.method === "PUT") {
              // Save settings
              const chunks: Buffer[] = [];
              req.on("data", (chunk: Buffer) => chunks.push(chunk));
              req.on("end", () => {
                try {
                  const body = JSON.parse(Buffer.concat(chunks).toString());
                  // apiCall wraps payload as { settings: {...} } — unwrap if present
                  const settingsData = body.settings || body;
                  fs.writeFileSync(settingsPath, JSON.stringify(settingsData, null, 2), "utf-8");
                  res.end(JSON.stringify({ success: true }));
                } catch (err: any) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
              return;
            }

            // GET
            try {
              if (fs.existsSync(settingsPath)) {
                const raw = fs.readFileSync(settingsPath, "utf-8");
                res.end(raw);
              } else {
                res.end(JSON.stringify({}));
              }
            } catch {
              res.end(JSON.stringify({}));
            }
            return;
          }

          // Fallback for other /api/settings/ routes
          if (req.url?.startsWith("/api/settings/")) { res.end(JSON.stringify({})); return; }
          // GET /api/slash-commands — discover slash command .md files
          if (req.url?.startsWith("/api/slash-commands")) {
            const urlObj = new URL(req.url, "http://localhost");
            const projectPath = urlObj.searchParams.get("projectPath") || "";

            interface SlashCommand {
              id: string;
              name: string;
              full_command: string;
              description: string;
              content: string;
              scope: "default" | "user" | "project";
              namespace?: string;
            }

            const commands: SlashCommand[] = [];

            // --- Default built-in commands ---
            const defaults: Array<{ name: string; description: string }> = [
              { name: "add-dir", description: "Add additional directories" },
              { name: "init", description: "Initialize project" },
              { name: "review", description: "Code review" },
              { name: "compact", description: "Compact conversation" },
              { name: "cost", description: "Show cost" },
              { name: "clear", description: "Clear conversation" },
              { name: "help", description: "Show help" },
              { name: "model", description: "Switch model" },
              { name: "permissions", description: "View permissions" },
              { name: "status", description: "Show status" },
              { name: "undo", description: "Undo last change" },
              { name: "pr-comments", description: "PR comments" },
              { name: "release-notes", description: "Generate release notes" },
              { name: "security-review", description: "Security review" },
            ];
            for (const d of defaults) {
              commands.push({
                id: `default-${d.name}`,
                name: d.name,
                full_command: `/${d.name}`,
                description: d.description,
                content: "",
                scope: "default",
              });
            }

            // --- Helper: parse a .md file with optional YAML frontmatter ---
            function parseCommandFile(filePath: string, scope: "user" | "project"): SlashCommand | null {
              try {
                const raw = fs.readFileSync(filePath, "utf-8");
                const basename = path.basename(filePath, ".md");
                const dir = path.dirname(filePath);
                const parentName = path.basename(dir);
                const namespace = parentName !== "commands" ? parentName : undefined;

                let description = "";
                let content = raw;

                const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
                if (fmMatch) {
                  const frontmatter = fmMatch[1];
                  content = (fmMatch[2] || "").trim();
                  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
                  if (descMatch) {
                    description = descMatch[1].trim().replace(/^["']|["']$/g, "");
                  }
                }

                const name = namespace ? `${namespace}:${basename}` : basename;
                return {
                  id: basename,
                  name,
                  full_command: `/${name}`,
                  description,
                  content,
                  scope,
                  ...(namespace ? { namespace } : {}),
                };
              } catch {
                return null;
              }
            }

            // --- Helper: scan a commands directory for .md files (one level of subdirs) ---
            function scanCommandsDir(dir: string, scope: "user" | "project") {
              if (!fs.existsSync(dir)) return;
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                  const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
                  for (const sub of subEntries) {
                    if (sub.isFile() && sub.name.endsWith(".md")) {
                      const cmd = parseCommandFile(path.join(fullPath, sub.name), scope);
                      if (cmd) commands.push(cmd);
                    }
                  }
                } else if (entry.isFile() && entry.name.endsWith(".md")) {
                  const cmd = parseCommandFile(fullPath, scope);
                  if (cmd) commands.push(cmd);
                }
              }
            }

            scanCommandsDir(path.join(os.homedir(), ".claude", "commands"), "user");

            if (projectPath) {
              scanCommandsDir(path.join(projectPath, ".claude", "commands"), "project");
            }

            res.end(JSON.stringify(commands));
            return;
          }
          // ---------------------------------------------------------------
          // Agent CRUD — native .md format in ~/.claude/agents/ and .claude/agents/
          // GET /api/agents — list all agents
          // GET /api/agents/{name} — get a specific agent by name
          // POST /api/agents — create agent
          // PUT /api/agents/{name} — update agent
          // DELETE /api/agents/{name} — delete agent
          // GET /api/agents/{name}/export — export as raw .md
          // POST /api/agents/import — import from .md content
          // ---------------------------------------------------------------
          if (req.url?.startsWith("/api/agents") || req.url?.startsWith("/api/commands/agents")) {
            const userAgentsDir = path.join(os.homedir(), ".claude", "agents");
            const urlPath = req.url.split("?")[0];

            /** Parse a .md agent file (YAML frontmatter + markdown body) */
            const parseAgentMd = (filePath: string, scope: "user" | "project"): any | null => {
              try {
                // Normalise CRLF → LF so the regex works on Windows-authored files
                const raw = fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
                const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
                let frontmatter: Record<string, any> = {};
                let body = raw;
                if (fmMatch) {
                  // Simple YAML parser for flat keys
                  for (const line of fmMatch[1].split("\n")) {
                    const m = line.match(/^(\w+):\s*(.*)$/);
                    if (m) {
                      let val: any = m[2].trim();
                      // Parse arrays like [Bash, Read, Write]
                      if (val.startsWith("[") && val.endsWith("]")) {
                        val = val.slice(1, -1).split(",").map((s: string) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
                      } else if (val === "true") val = true;
                      else if (val === "false") val = false;
                      else if (/^\d+$/.test(val)) val = parseInt(val, 10);
                      else val = val.replace(/^["']|["']$/g, "");
                      frontmatter[m[1]] = val;
                    }
                  }
                  body = fmMatch[2].trim();
                }
                const fileName = path.basename(filePath, ".md");
                return {
                  name: frontmatter.name || fileName,
                  description: frontmatter.description || "",
                  model: frontmatter.model || undefined,
                  tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : undefined,
                  disallowedTools: Array.isArray(frontmatter.disallowedTools) ? frontmatter.disallowedTools : undefined,
                  skills: Array.isArray(frontmatter.skills) ? frontmatter.skills : undefined,
                  maxTurns: typeof frontmatter.maxTurns === "number" ? frontmatter.maxTurns : undefined,
                  system_prompt: body,
                  scope,
                  file_path: filePath,
                  source: "file" as const,
                };
              } catch (e) {
                console.warn("[dev-api] Failed to parse agent .md:", filePath, e);
                return null;
              }
            };

            /** Load all .md agents from a directory */
            const loadAgentsFromDir = (dir: string, scope: "user" | "project") => {
              if (!fs.existsSync(dir)) return [];
              try {
                return fs.readdirSync(dir)
                  .filter((f) => f.endsWith(".md"))
                  .map((f) => parseAgentMd(path.join(dir, f), scope))
                  .filter(Boolean);
              } catch { return []; }
            };

            /** Escape a YAML string value if it contains special characters */
            const yamlEscape = (val: string): string => {
              if (!val) return '""';
              if (/[\n\r:{}\[\]*&!%@`#|>?,]/.test(val) || val.startsWith('"') || val.startsWith("'") || val.trim() !== val) {
                return `"${val.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;
              }
              return val;
            };

            /** Serialize an agent to .md format */
            const serializeAgentMd = (agent: any): string => {
              const lines: string[] = ["---"];
              if (agent.name) lines.push(`name: ${yamlEscape(agent.name)}`);
              if (agent.description) lines.push(`description: ${yamlEscape(agent.description)}`);
              if (agent.model) lines.push(`model: ${agent.model}`);
              if (agent.tools?.length) lines.push(`tools: [${agent.tools.join(", ")}]`);
              if (agent.disallowedTools?.length) lines.push(`disallowedTools: [${agent.disallowedTools.join(", ")}]`);
              if (agent.skills?.length) lines.push(`skills: [${agent.skills.join(", ")}]`);
              if (agent.maxTurns) lines.push(`maxTurns: ${agent.maxTurns}`);
              lines.push("---", "");
              lines.push(agent.system_prompt || "");
              return lines.join("\n") + "\n";
            };

            /** Get the target directory for a scope */
            const getAgentDir = (scope?: string) => {
              return scope === "project"
                ? path.join(process.cwd(), ".claude", "agents")
                : userAgentsDir;
            };

            /** Slugify a name for use as filename */
            const slugify = (name: string) =>
              name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

            // POST /api/agents — create new agent
            if (req.method === "POST" && (urlPath === "/api/agents" || urlPath === "/api/agents/import")) {
              const chunks: Buffer[] = [];
              req.on("data", (chunk: Buffer) => chunks.push(chunk));
              req.on("end", () => {
                try {
                  const body = JSON.parse(Buffer.concat(chunks).toString());

                  // Handle import (raw .md content)
                  if (urlPath === "/api/agents/import" && body.content) {
                    const dir = getAgentDir(body.scope);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    // Write to a temp file, parse to extract name, then rename
                    const tmpPath = path.join(dir, `_import_tmp_${Date.now()}.md`);
                    try {
                      fs.writeFileSync(tmpPath, body.content, "utf-8");
                      const parsed = parseAgentMd(tmpPath, body.scope || "user");
                      const name = parsed?.name ? slugify(parsed.name) : `imported-${Date.now()}`;
                      const finalPath = path.join(dir, `${name}.md`);
                      fs.renameSync(tmpPath, finalPath);
                      const agent = parseAgentMd(finalPath, body.scope || "user");
                      cachedInitData = null;
                      res.end(JSON.stringify(agent));
                    } catch (importErr: any) {
                      // Clean up temp file on failure
                      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* ignore */ }
                      throw importErr;
                    }
                    return;
                  }

                  // Standard create
                  const dir = getAgentDir(body.scope);
                  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                  const slug = slugify(body.name || "untitled");
                  const filePath = path.join(dir, `${slug}.md`);
                  const content = serializeAgentMd(body);
                  fs.writeFileSync(filePath, content, "utf-8");
                  const agent = parseAgentMd(filePath, body.scope || "user");
                  // Invalidate cached init data so SDK picks up the new agent
                  cachedInitData = null;
                  res.end(JSON.stringify(agent));
                } catch (err: any) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
              return;
            }

            // PUT /api/agents/{name} — update agent
            const putMatch = urlPath.match(/^\/api\/agents\/([^/]+)$/);
            if (req.method === "PUT" && putMatch) {
              const agentName = decodeURIComponent(putMatch[1]);
              const chunks: Buffer[] = [];
              req.on("data", (chunk: Buffer) => chunks.push(chunk));
              req.on("end", () => {
                try {
                  const body = JSON.parse(Buffer.concat(chunks).toString());
                  // Find existing file
                  const slug = slugify(agentName);
                  const dir = getAgentDir(body.scope);
                  const filePath = path.join(dir, `${slug}.md`);
                  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                  const content = serializeAgentMd(body);
                  fs.writeFileSync(filePath, content, "utf-8");
                  cachedInitData = null;
                  const agent = parseAgentMd(filePath, body.scope || "user");
                  res.end(JSON.stringify(agent));
                } catch (err: any) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
              return;
            }

            // DELETE /api/agents/{name}?scope=user|project
            const deleteMatch = urlPath.match(/^\/api\/agents\/([^/]+)$/);
            if (req.method === "DELETE" && deleteMatch) {
              const agentName = decodeURIComponent(deleteMatch[1]);
              const slug = slugify(agentName);
              const urlObj = new URL(req.url!, "http://localhost");
              const scope = urlObj.searchParams.get("scope");

              let deleted = false;
              if (!scope || scope === "user") {
                const userPath = path.join(userAgentsDir, `${slug}.md`);
                if (fs.existsSync(userPath)) { fs.unlinkSync(userPath); deleted = true; }
              }
              if (!scope || scope === "project") {
                const projectPath = path.join(process.cwd(), ".claude", "agents", `${slug}.md`);
                if (fs.existsSync(projectPath)) { fs.unlinkSync(projectPath); deleted = true; }
              }
              cachedInitData = null;
              if (deleted) {
                res.end(JSON.stringify({ success: true }));
              } else {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: "Agent not found" }));
              }
              return;
            }

            // GET /api/agents/{name}/export — raw .md content
            const exportMatch = urlPath.match(/^\/api\/agents\/([^/]+)\/export$/);
            if (exportMatch) {
              const agentName = decodeURIComponent(exportMatch[1]);
              const slug = slugify(agentName);
              const userPath = path.join(userAgentsDir, `${slug}.md`);
              const projectPath = path.join(process.cwd(), ".claude", "agents", `${slug}.md`);
              const filePath = fs.existsSync(userPath) ? userPath : fs.existsSync(projectPath) ? projectPath : null;
              if (filePath) {
                const content = fs.readFileSync(filePath, "utf-8");
                res.end(JSON.stringify({ content }));
              } else {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: "Agent not found" }));
              }
              return;
            }

            // GET /api/agents/{name} — single agent by name
            const nameMatch = urlPath.match(/^\/api\/agents\/([^/]+)$/);
            if (req.method === "GET" && nameMatch && nameMatch[1] !== "github" && nameMatch[1] !== "import") {
              const agentName = decodeURIComponent(nameMatch[1]);
              const slug = slugify(agentName);
              const userPath = path.join(userAgentsDir, `${slug}.md`);
              const projectPath = path.join(process.cwd(), ".claude", "agents", `${slug}.md`);
              const filePath = fs.existsSync(userPath) ? userPath : fs.existsSync(projectPath) ? projectPath : null;
              if (filePath) {
                const scope = filePath.startsWith(os.homedir()) ? "user" : "project";
                const agent = parseAgentMd(filePath, scope as "user" | "project");
                res.end(JSON.stringify(agent));
              } else {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: "Agent not found" }));
              }
              return;
            }

            // GET /api/agents — list all agents (SDK + filesystem)
            const fileAgents = [
              ...loadAgentsFromDir(userAgentsDir, "user"),
              ...loadAgentsFromDir(path.join(process.cwd(), ".claude", "agents"), "project"),
            ];

            // Merge with SDK-discovered agents (they may include agents from other sources)
            try {
              const initData = await getInitData();
              if (initData.agents?.length) {
                const fileNames = new Set(fileAgents.map((a: any) => a.name));
                for (const sdkAgent of initData.agents) {
                  const name = sdkAgent.name || sdkAgent.displayName;
                  if (name && !fileNames.has(name)) {
                    fileAgents.push({
                      name,
                      description: sdkAgent.description || "",
                      model: sdkAgent.model || undefined,
                      system_prompt: "",
                      source: "sdk",
                    });
                  }
                }
              }
            } catch { /* SDK unavailable */ }

            res.end(JSON.stringify(fileAgents));
            return;
          }
          // MCP server management — POST, DELETE, GET
          // Also handle /api/commands/mcp (alias used by MCPServersSection sidebar)
          if (req.url?.startsWith("/api/mcp/") || req.url?.startsWith("/api/commands/mcp")) {

            // POST /api/mcp/servers — add a new MCP server
            if (req.method === 'POST' && (req.url === '/api/mcp/servers' || req.url?.startsWith('/api/mcp/servers?'))) {
              let body = '';
              req.on('data', (chunk: Buffer) => body += chunk.toString());
              req.on('end', async () => {
                try {
                  const params = JSON.parse(body);
                  const { name, transport, command, args, env, url, scope } = params;

                  if (!name) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ success: false, message: 'Server name is required' }));
                    return;
                  }

                  // Determine config file path based on scope
                  const configPath = scope === 'project' && params.projectPath
                    ? path.join(params.projectPath, '.mcp.json')
                    : path.join(os.homedir(), '.claude', '.mcp.json');

                  // Read existing config
                  let config: Record<string, any> = {};
                  try {
                    if (fs.existsSync(configPath)) {
                      const raw = fs.readFileSync(configPath, 'utf-8');
                      config = JSON.parse(raw);
                    }
                  } catch { /* start fresh */ }

                  // Ensure mcpServers key exists
                  if (!config.mcpServers) config.mcpServers = {};

                  // Add the new server
                  const serverConfig: Record<string, any> = {};
                  if (transport === 'stdio') {
                    serverConfig.command = command || '';
                    serverConfig.args = args || [];
                  } else if (transport === 'sse') {
                    serverConfig.type = 'sse';
                    serverConfig.url = url || '';
                  }
                  if (env && Object.keys(env).length > 0) {
                    serverConfig.env = env;
                  }

                  config.mcpServers[name] = serverConfig;

                  // Ensure directory exists
                  const configDir = path.dirname(configPath);
                  if (!fs.existsSync(configDir)) {
                    fs.mkdirSync(configDir, { recursive: true });
                  }

                  // Write config
                  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

                  // Invalidate cache so next list reflects the change
                  cachedInitData = null;

                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true, message: `Server "${name}" added`, server_name: name }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ success: false, message: err.message }));
                }
              });
              return;
            }

            // POST /api/mcp/servers/json — add from JSON config
            if (req.method === 'POST' && req.url?.startsWith('/api/mcp/servers/json')) {
              let body = '';
              req.on('data', (chunk: Buffer) => body += chunk.toString());
              req.on('end', async () => {
                try {
                  const params = JSON.parse(body);
                  const { name, jsonConfig, scope } = params;
                  const serverConfig = typeof jsonConfig === 'string' ? JSON.parse(jsonConfig) : jsonConfig;

                  const configPath = scope === 'project' && params.projectPath
                    ? path.join(params.projectPath, '.mcp.json')
                    : path.join(os.homedir(), '.claude', '.mcp.json');

                  let config: Record<string, any> = {};
                  try {
                    if (fs.existsSync(configPath)) config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                  } catch {}
                  if (!config.mcpServers) config.mcpServers = {};
                  config.mcpServers[name] = serverConfig;

                  const configDir = path.dirname(configPath);
                  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
                  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
                  cachedInitData = null;

                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true, message: `Server "${name}" added from JSON`, server_name: name }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ success: false, message: err.message }));
                }
              });
              return;
            }

            // POST /api/mcp/servers/{name} — remove an MCP server (mcp_remove goes through writeCommands as POST)
            // Also handle DELETE /api/mcp/servers/{name}
            if ((req.method === 'POST' || req.method === 'DELETE') && req.url?.match(/\/api\/mcp\/servers\/[^/]+/)) {
              // For POST, read body to get params; for DELETE, extract name from URL
              const urlServerName = decodeURIComponent(req.url.split('/api/mcp/servers/')[1].split('?')[0]);

              const handleRemove = async (serverName: string) => {
                try {
                  // Try removing from user config
                  const userConfigPath = path.join(os.homedir(), '.claude', '.mcp.json');
                  let removed = false;

                  if (fs.existsSync(userConfigPath)) {
                    const config = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'));
                    if (config.mcpServers && config.mcpServers[serverName]) {
                      delete config.mcpServers[serverName];
                      fs.writeFileSync(userConfigPath, JSON.stringify(config, null, 2), 'utf-8');
                      removed = true;
                    }
                  }

                  // Invalidate cache
                  cachedInitData = null;

                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true, message: removed ? `Removed "${serverName}"` : `"${serverName}" not found in user config` }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ success: false, message: err.message }));
                }
              };

              if (req.method === 'DELETE') {
                await handleRemove(urlServerName);
              } else {
                // POST — read body for name param, fall back to URL name
                let body = '';
                req.on('data', (chunk: Buffer) => body += chunk.toString());
                req.on('end', async () => {
                  try {
                    const params = JSON.parse(body);
                    await handleRemove(params.name || urlServerName);
                  } catch {
                    await handleRemove(urlServerName);
                  }
                });
              }
              return;
            }

            // GET handlers below
            const urlObj = new URL(req.url, "http://localhost");

            // Read and merge MCP configs from user and project level
            const readMcpConfig = (filePath: string): Record<string, any> => {
              try {
                if (fs.existsSync(filePath)) {
                  const raw = fs.readFileSync(filePath, "utf-8");
                  const parsed = JSON.parse(raw);
                  return parsed.mcpServers || {};
                }
              } catch (e) {
                console.warn("[dev-api] Failed to read MCP config:", filePath, e);
              }
              return {};
            };

            const userConfigPath = path.join(os.homedir(), ".claude", ".mcp.json");
            const userServers = readMcpConfig(userConfigPath);

            const projectPath = urlObj.searchParams.get("project") || "";
            const projectServers = projectPath
              ? readMcpConfig(path.join(projectPath, ".mcp.json"))
              : {};

            // Build unified server list matching MCPServer interface
            const buildServerEntry = (name: string, config: any, scope: string) => ({
              name,
              transport: config.type === 'sse' ? 'sse' : 'stdio',
              command: config.command || undefined,
              args: config.args || [],
              env: config.env || {},
              url: config.url || undefined,
              scope,
              is_active: true,
              status: { running: false, error: undefined, last_checked: undefined },
            });

            const serverList: any[] = [];

            for (const [name, config] of Object.entries(userServers)) {
              serverList.push(buildServerEntry(name, config, "user"));
            }

            for (const [name, config] of Object.entries(projectServers)) {
              const existing = serverList.findIndex((s) => s.name === name);
              const entry = buildServerEntry(name, config, "project");
              if (existing >= 0) {
                serverList[existing] = entry;
              } else {
                serverList.push(entry);
              }
            }

            if (req.url?.startsWith("/api/mcp/servers") || req.url?.startsWith("/api/commands/mcp")) {
              res.end(JSON.stringify(serverList));
              return;
            }

            if (req.url?.startsWith("/api/mcp/status") || req.url?.startsWith("/api/mcp/live-status")) {
              // Try SDK for live connection status
              try {
                const initData = await getInitData();
                if (initData.mcpServers && initData.mcpServers.length > 0) {
                  res.end(JSON.stringify(initData.mcpServers));
                  return;
                }
              } catch { /* SDK unavailable */ }
            }

            if (req.url?.startsWith("/api/mcp/status")) {
              // Return status entries for each configured server
              const statusList = serverList.map((s: any) => ({
                name: s.name,
                status: s.status || { running: false },
                scope: s.scope,
              }));
              res.end(JSON.stringify(statusList));
              return;
            }

            res.end(JSON.stringify([]));
            return;
          }
          // GET /api/hooks/config — extract hooks from ~/.claude/settings.json
          if (req.url?.startsWith("/api/hooks/config")) {
            const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
            try {
              if (fs.existsSync(settingsPath)) {
                const raw = fs.readFileSync(settingsPath, "utf-8");
                const parsed = JSON.parse(raw);
                res.end(JSON.stringify(parsed.hooks || {}));
              } else {
                res.end(JSON.stringify({}));
              }
            } catch {
              res.end(JSON.stringify({}));
            }
            return;
          }
          if (req.url?.startsWith("/api/hooks/")) { res.end(JSON.stringify({})); return; }

          // GET /api/skills — list installed plugins from ~/.claude/plugins/cache/
          // Structure: cache/{repo-name}/{hash}/.claude-plugin/plugin.json
          // OR legacy: cache/{name}/plugin.json
          if (req.url?.startsWith("/api/skills")) {
            const pluginsCacheDir = path.join(os.homedir(), ".claude", "plugins", "cache");
            const plugins: Array<{ plugin_name: string; description?: string; skills: Array<{ name: string; description: string }> }> = [];

            /** Recursively find plugin.json files in a directory */
            const findPluginJsons = (dir: string): string[] => {
              const results: string[] = [];
              try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                  const full = path.join(dir, entry.name);
                  if (entry.isFile() && entry.name === 'plugin.json') {
                    results.push(full);
                  } else if (entry.isDirectory()) {
                    // Recurse max 3 levels deep
                    const depth = full.replace(pluginsCacheDir, '').split(path.sep).length;
                    if (depth <= 4) results.push(...findPluginJsons(full));
                  }
                }
              } catch { /* skip unreadable dirs */ }
              return results;
            };

            try {
              if (fs.existsSync(pluginsCacheDir)) {
                const pluginJsonFiles = findPluginJsons(pluginsCacheDir);
                const seen = new Set<string>();
                for (const jsonPath of pluginJsonFiles) {
                  try {
                    const raw = fs.readFileSync(jsonPath, "utf-8");
                    const parsed = JSON.parse(raw);
                    const name = parsed.name || path.basename(path.dirname(jsonPath));
                    if (seen.has(name)) continue; // dedupe by name
                    seen.add(name);
                    plugins.push({
                      plugin_name: name,
                      description: parsed.description || undefined,
                      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
                    });
                  } catch { /* skip malformed */ }
                }
              }
            } catch { /* cache dir doesn't exist */ }

            res.end(JSON.stringify(plugins));
            return;
          }

          // GET /api/resources/processes — top processes by CPU/memory with cwd
          if (req.url?.startsWith("/api/resources/processes")) {
            try {
              const raw = execSync("ps aux --sort=-%cpu | head -31", { encoding: "utf-8", timeout: 5000 });
              const lines = raw.trim().split("\n");
              const processes = lines.slice(1).map(line => {
                const parts = line.split(/\s+/);
                const pid = parseInt(parts[1]);
                const cmd = parts.slice(10).join(" ").slice(0, 120);
                let cwd = "";
                try {
                  cwd = execSync(`readlink -f /proc/${pid}/cwd 2>/dev/null`, { encoding: "utf-8", timeout: 1000 }).trim();
                } catch {}
                let project = "";
                if (cwd) {
                  const homeMatch = cwd.match(/\/home\/[^/]+\/(?:[^/]+\/)?([^/]+)/);
                  const optMatch = cwd.match(/\/opt\/([^/]+)/);
                  project = homeMatch ? homeMatch[1] : optMatch ? optMatch[1] : "";
                }
                return { user: parts[0], pid, cpu: parseFloat(parts[2]), mem: parseFloat(parts[3]), rss: Math.round(parseInt(parts[5]) / 1024), command: cmd, cwd, project };
              }).filter(p => p.cpu > 0.1 || p.mem > 0.5);
              res.end(JSON.stringify({ processes }));
            } catch {
              res.end(JSON.stringify({ processes: [] }));
            }
            return;
          }

          // GET /api/resources/docker — Docker container stats (fully async)
          if (req.url?.startsWith("/api/resources/docker")) {
            try {
              // Check if Docker daemon is running
              await execAsync("docker info >/dev/null 2>&1", { timeout: 3000 });
              // Run stats + ps in parallel
              const [statsRes, psRes] = await Promise.all([
                execAsync(
                  'docker stats --no-stream --format "{{.ID}}\\t{{.Name}}\\t{{.CPUPerc}}\\t{{.MemPerc}}\\t{{.MemUsage}}\\t{{.NetIO}}\\t{{.BlockIO}}\\t{{.PIDs}}\\t{{.Container}}"',
                  { timeout: 8000 }
                ),
                execAsync(
                  'docker ps -a --format "{{.ID}}\\t{{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}"',
                  { timeout: 5000 }
                ),
              ]);
              const parseMemUnit = (val: number, unit: string) => {
                if (unit === "GiB") return val * 1024;
                if (unit === "MiB") return val;
                if (unit === "KiB") return val / 1024;
                return val / (1024 * 1024);
              };
              const containers = statsRes.stdout.trim().split("\n").filter(Boolean).map(line => {
                const [id, name, cpuStr, memStr, memUsage, netIO, blockIO, pidsStr] = line.split("\t");
                const cpu = parseFloat(cpuStr) || 0;
                const mem = parseFloat(memStr) || 0;
                const memMatch = memUsage?.match(/([\d.]+)\s*(KiB|MiB|GiB|B)/);
                const memMb = memMatch ? Math.round(parseMemUnit(parseFloat(memMatch[1]), memMatch[2])) : 0;
                const memLimitMatch = memUsage?.match(/\/\s*([\d.]+)\s*(KiB|MiB|GiB|B)/);
                const memLimitMb = memLimitMatch ? Math.round(parseMemUnit(parseFloat(memLimitMatch[1]), memLimitMatch[2])) : 0;
                return { id: (id || "").slice(0, 12), name, cpu, mem, memMb, memLimitMb, netIO: netIO || "", blockIO: blockIO || "", pids: parseInt(pidsStr) || 0 };
              });
              const allContainers = psRes.stdout.trim().split("\n").filter(Boolean).map(line => {
                const [cid, cname, image, status, ports] = line.split("\t");
                const stats = containers.find(c => c.id === (cid || "").slice(0, 12) || c.name === cname);
                return { id: (cid || "").slice(0, 12), name: cname, image, status, ports: ports || "", cpu: stats?.cpu || 0, mem: stats?.mem || 0, memMb: stats?.memMb || 0, memLimitMb: stats?.memLimitMb || 0, netIO: stats?.netIO || "", blockIO: stats?.blockIO || "", pids: stats?.pids || 0 };
              });
              const totalCpu = containers.reduce((s, c) => s + c.cpu, 0);
              const totalMemMb = containers.reduce((s, c) => s + c.memMb, 0);
              const running = allContainers.filter(c => c.status.startsWith("Up")).length;
              res.end(JSON.stringify({ available: true, running, total: allContainers.length, totalCpu, totalMemMb, containers: allContainers }));
            } catch {
              res.end(JSON.stringify({ available: false, running: 0, total: 0, totalCpu: 0, totalMemMb: 0, containers: [] }));
            }
            return;
          }

          // GET /api/resources — system resource info
          if (req.url?.startsWith("/api/resources")) {
            const cpus = os.cpus().length;
            const loadAvg = os.loadavg()[0];
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const result: Record<string, any> = {
              cpuPercent: (loadAvg / cpus) * 100,
              ramPercent: ((1 - freeMem / totalMem) * 100),
              ramUsedGb: (totalMem - freeMem) / (1024 ** 3),
              ramTotalGb: totalMem / (1024 ** 3),
            };
            try {
              const df = execSync("df -B1 / | tail -1", { encoding: "utf-8", timeout: 3000 }).trim().split(/\s+/);
              const diskTotal = parseInt(df[1]) || 0;
              const diskUsed = parseInt(df[2]) || 0;
              result.diskPercent = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;
              result.diskUsedGb = diskUsed / (1024 ** 3);
              result.diskTotalGb = diskTotal / (1024 ** 3);
            } catch { /* skip disk metrics */ }
            res.end(JSON.stringify(result));
            return;
          }

          // GET /api/usage — empty usage stats (wrapped in { data } to match frontend)
          // GET /api/auth/status
          if (req.url === "/api/auth/status") {
            const data = await getInitData();
            res.end(JSON.stringify({
              plan: data.account?.planType || data.account?.plan || "unknown",
              authenticated: true,
              ...data.account
            }));
            return;
          }

          // GET /api/usage/window — plan info + rate limits + accumulated usage
          if (req.url?.startsWith("/api/usage/window")) {
            checkWindowReset(); // Clear stale rate limit data if window expired
            const initData = await getInitData();
            res.end(JSON.stringify({
              // Plan info
              subscriptionType: initData.account?.subscriptionType || "unknown",
              email: initData.account?.email || null,
              organization: initData.account?.organization || null,
              // Rate limit
              rateLimitInfo: cachedRateLimitInfo || null,
              // Accumulated usage across all sessions since server start
              usage: cachedTotalUsage,
            }));
            return;
          }

          // GET /api/usage/cost — service tier info
          if (req.url?.startsWith("/api/usage/cost")) {
            res.end(JSON.stringify({ tier: "standard", speed: "standard" }));
            return;
          }

          // GET /api/usage — usage stats
          if (req.url?.startsWith("/api/usage")) {
            res.end(JSON.stringify({
              data: {
                total_cost: 0,
                total_tokens: 0,
                total_input_tokens: 0,
                total_output_tokens: 0,
                total_cache_creation_tokens: 0,
                total_cache_read_tokens: 0,
                total_sessions: 0,
                by_model: [],
                by_project: [],
                by_date: [],
              }
            }));
            return;
          }

          // GET /api/models — real model list from SDK
          if (req.url === "/api/models") {
            const data = await getInitData();
            res.end(JSON.stringify(data.models));
            return;
          }

          // GET /api/commands/builtin — builtin slash commands from SDK
          if (req.url?.startsWith("/api/commands/builtin")) {
            const data = await getInitData();
            res.end(JSON.stringify(data.commands));
            return;
          }

          // POST/GET /api/sessions/fork — fork a session at a specific message
          if (req.url?.startsWith("/api/sessions/fork")) {
            if (req.method === "POST") {
              const chunks: Buffer[] = [];
              req.on("data", (chunk: Buffer) => chunks.push(chunk));
              req.on("end", async () => {
                try {
                  const body = JSON.parse(Buffer.concat(chunks).toString());
                  const result = await sdkForkSession(body.sessionId, {
                    upToMessageId: body.upToMessageId,
                    title: body.title,
                    dir: body.dir,
                  });
                  res.end(JSON.stringify(result));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
              return;
            }
            // GET fallback
            const urlObj = new URL(req.url, "http://localhost");
            try {
              const result = await sdkForkSession(urlObj.searchParams.get("sessionId") || "", {
                upToMessageId: urlObj.searchParams.get("upToMessageId") || undefined,
                title: urlObj.searchParams.get("title") || undefined,
              });
              res.end(JSON.stringify(result));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          // POST /api/local-model/auto-start-flag — set/clear auto-start on launch
          if (req.url === "/api/local-model/auto-start-flag" && req.method === "POST") {
            const chunks: Buffer[] = [];
            req.on("data", (chunk: Buffer) => chunks.push(chunk));
            req.on("end", () => {
              try {
                const body = JSON.parse(Buffer.concat(chunks).toString());
                const flagFile = path.join(os.homedir(), '.runecode', 'autocomplete-local-enabled');
                const dir = path.dirname(flagFile);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                if (body.enabled) {
                  fs.writeFileSync(flagFile, '1');
                } else {
                  try { fs.unlinkSync(flagFile); } catch {}
                }
                res.end(JSON.stringify({ success: true }));
              } catch (err: any) {
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }

          // GET /api/local-model/status — check if local model server is running + stats
          if (req.url === "/api/local-model/status") {
            try {
              const { isServerRunning, getServerUrl, getProcessStats } = await import('./src/lib/localModelManager');
              const running = isServerRunning();
              const stats = running ? await getProcessStats() : null;
              res.end(JSON.stringify({
                running,
                url: running ? getServerUrl() : null,
                pid: stats?.pid || null,
                cpuPercent: stats?.cpuPercent || 0,
                memMb: stats?.memMb || 0,
              }));
            } catch {
              res.end(JSON.stringify({ running: false, url: null, pid: null, cpuPercent: 0, memMb: 0 }));
            }
            return;
          }

          // POST /api/local-model/start — download model + start server
          if (req.url === "/api/local-model/start" && req.method === "POST") {
            try {
              const { startServer } = await import('./src/lib/localModelManager');
              const url = await startServer();
              res.end(JSON.stringify({ success: true, url }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          // POST /api/local-model/stop — stop the server
          if (req.url === "/api/local-model/stop" && req.method === "POST") {
            try {
              const { stopServer } = await import('./src/lib/localModelManager');
              stopServer();
              res.end(JSON.stringify({ success: true }));
            } catch (err: any) {
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
            return;
          }

          // POST /api/autocomplete — completion via SDK (haiku) or local model
          if (req.url === "/api/autocomplete" && req.method === "POST") {
            const chunks: Buffer[] = [];
            req.on("data", (chunk: Buffer) => chunks.push(chunk));
            req.on("end", async () => {
              try {
                const body = JSON.parse(Buffer.concat(chunks).toString());
                const { prefix, suffix, projectPath, provider } = body;
                if (!prefix) { res.statusCode = 400; res.end(JSON.stringify({ error: "prefix required" })); return; }

                // Local model provider — fast, no SDK overhead
                if (provider === 'local') {
                  try {
                    const { localComplete, isServerRunning } = await import('./src/lib/localModelManager');
                    if (!isServerRunning()) {
                      res.end(JSON.stringify({ choices: [{ text: '' }], error: 'Local model not running. Start it from Settings.' }));
                      return;
                    }
                    const text = await localComplete(prefix, suffix);
                    res.end(JSON.stringify({ choices: [{ text }] }));
                  } catch (err: any) {
                    res.end(JSON.stringify({ choices: [{ text: '' }], error: err.message }));
                  }
                  return;
                }

                // Cancel any previous in-flight autocomplete
                if (_autocompleteAbort) { try { _autocompleteAbort.abort(); } catch {} }
                const abort = new AbortController();
                _autocompleteAbort = abort;

                const prompt = `Complete this text: "${prefix}"${suffix ? ` [cursor] "${suffix}"` : ''}`;

                const q = sdkQuery({
                  prompt,
                  options: {
                    maxTurns: 1,
                    model: 'haiku',
                    systemPrompt: 'Output ONLY the completion text. No quotes, no formatting. Under 20 words.',
                    tools: [], // empty = no tools available, forces pure text response
                    settingSources: [],
                    permissionMode: 'auto',
                    abortController: abort,
                    cwd: projectPath || os.homedir(),
                  },
                });

                let result = '';
                const timeout = setTimeout(() => { try { abort.abort(); } catch {} }, 6000);

                for await (const msg of q) {
                  if (abort.signal.aborted) break;
                  const m = msg as any;
                  if (m?.message?.content && Array.isArray(m.message.content)) {
                    for (const b of m.message.content) { if (b.type === 'text') result += b.text; }
                    if (result) { clearTimeout(timeout); try { q.close(); } catch {} break; }
                  }
                }
                clearTimeout(timeout);

                result = result.replace(/^["']|["']$/g, '').trim().split('\n')[0];
                if (_autocompleteAbort === abort) _autocompleteAbort = null;
                res.end(JSON.stringify({ choices: [{ text: result }] }));
              } catch (err: any) {
                if (err.name !== 'AbortError') console.debug('[autocomplete] Error:', err.message);
                res.end(JSON.stringify({ choices: [{ text: '' }] }));
              }
            });
            return;
          }

          // POST /api/environments/test — test remote environment connectivity
          if (req.url === "/api/environments/test" && req.method === "POST") {
            const chunks: Buffer[] = [];
            req.on("data", (chunk: Buffer) => chunks.push(chunk));
            req.on("end", async () => {
              try {
                const env = JSON.parse(Buffer.concat(chunks).toString());
                let success = false;
                let message = '';

                if (env.type === 'ssh' && env.sshHost) {
                  try {
                    const portArgs = env.sshPort && env.sshPort !== 22 ? ['-p', String(env.sshPort)] : [];
                    const keyArgs = env.sshIdentityFile ? ['-i', env.sshIdentityFile] : [];
                    const { stdout } = await execAsync(
                      `ssh -o ConnectTimeout=5 -o BatchMode=yes -o StrictHostKeyChecking=accept-new ${portArgs.join(' ')} ${keyArgs.join(' ')} ${env.sshHost} "echo ok && claude --version 2>/dev/null || echo 'claude not found'"`,
                      { timeout: 10000 }
                    );
                    success = stdout.includes('ok');
                    message = stdout.trim();
                  } catch (err: any) {
                    message = err.message || 'SSH connection failed';
                  }
                } else if (env.type === 'wsl') {
                  try {
                    const distroArgs = env.wslDistro ? `-d ${env.wslDistro}` : '';
                    const { stdout } = await execAsync(
                      `wsl ${distroArgs} -- echo ok && wsl ${distroArgs} -- claude --version 2>/dev/null || echo 'claude not found'`,
                      { timeout: 10000 }
                    );
                    success = stdout.includes('ok');
                    message = stdout.trim();
                  } catch (err: any) {
                    message = err.message || 'WSL connection failed';
                  }
                } else if (env.type === 'docker' && env.dockerContainer) {
                  try {
                    const { stdout } = await execAsync(
                      `docker exec ${env.dockerContainer} sh -c "echo ok && claude --version 2>/dev/null || echo 'claude not found'"`,
                      { timeout: 10000 }
                    );
                    success = stdout.includes('ok');
                    message = stdout.trim();
                  } catch (err: any) {
                    message = err.message || 'Docker connection failed';
                  }
                } else {
                  message = 'Unknown environment type';
                }

                res.end(JSON.stringify({ success, message }));
              } catch (err: any) {
                res.end(JSON.stringify({ success: false, message: err.message }));
              }
            });
            return;
          }

          // Catch-all
          res.end(JSON.stringify({}));
        } catch (err: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      // -----------------------------------------------------------------------
      // WebSocket — Claude Agent SDK streaming
      // -----------------------------------------------------------------------

      const wss = new WebSocketServer({ noServer: true });

      server.httpServer?.on("upgrade", (request, socket, head) => {
        if (request.url === "/ws/claude") {
          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit("connection", ws, request);
          });
        }
      });

      // -----------------------------------------------------------------
      // Persistent Session Manager
      // -----------------------------------------------------------------

      interface PersistentSession {
        query: ReturnType<SdkModule["query"]>;
        inputChannel: ReturnType<typeof createInputChannel>;
        abortController: AbortController;
        sessionId: string | null;
        ws: WebSocket;
        outputLoopRunning: boolean;
      }

      const activeSessions = new Map<string, PersistentSession>();

      /** Map a WebSocket instance to its connection ID */
      const wsToConnectionId = new Map<WebSocket, string>();

      /**
       * Create a persistent input channel that yields SDKUserMessages.
       * The channel stays open between turns, allowing multi-turn conversations.
       * Push new messages with push(), end with close().
       */
      function createInputChannel() {
        const queue: string[] = [];
        let waitResolve: (() => void) | null = null;
        let done = false;

        const push = (text: string) => {
          queue.push(text);
          if (waitResolve) {
            waitResolve();
            waitResolve = null;
          }
        };

        const close = () => {
          done = true;
          if (waitResolve) {
            waitResolve();
            waitResolve = null;
          }
        };

        const iterable: AsyncIterable<any> = {
          [Symbol.asyncIterator]() {
            return {
              async next() {
                while (queue.length === 0 && !done) {
                  await new Promise<void>((r) => { waitResolve = r; });
                }
                if (done && queue.length === 0) {
                  return { done: true as const, value: undefined };
                }
                const text = queue.shift()!;
                // Yield as SDKUserMessage (type, message: MessageParam, parent_tool_use_id, session_id)
                const userMsg = {
                  type: "user" as const,
                  message: { role: "user" as const, content: text },
                  parent_tool_use_id: null,
                  session_id: "",
                };
                return { done: false as const, value: userMsg };
              },
              async return() {
                done = true;
                return { done: true as const, value: undefined };
              },
            };
          },
        };

        return { push, close, iterable };
      }

      /**
       * Build SDK options from an init request. Reused for session creation.
       */
      function buildSdkOptions(req: {
        project_path?: string;
        model?: string;
        session_id?: string;
        thinking_mode?: string;
        permission_mode?: string;
        max_turns?: number;
        max_budget_usd?: number;
        effort?: string;
        resume_at?: string;
        teams_enabled?: boolean;
        subagent_default_model?: string;
        subagent_default_permission_mode?: string;
        subagent_progress_summaries?: boolean;
        subagent_max_turns?: number;
        team_max_concurrent?: number;
        team_default_model?: string;
        environment?: {
          type: 'local' | 'ssh' | 'wsl' | 'docker';
          sshHost?: string;
          sshPort?: number;
          sshIdentityFile?: string;
          startDirectory?: string;
          wslDistro?: string;
          dockerContainer?: string;
        };
      }, abortController: AbortController): Parameters<SdkModule["query"]>[0]["options"] {
        const cwd = req.project_path && fs.existsSync(req.project_path)
          ? req.project_path
          : os.homedir();

        const options: Parameters<SdkModule["query"]>[0]["options"] = {
          cwd,
          abortController,

          // Use the Claude Code preset for the full system prompt and tool set
          systemPrompt: { type: "preset", preset: "claude_code" },
          tools: { type: "preset", preset: "claude_code" },

          // Load all user/project/local settings (CLAUDE.md, hooks, etc.)
          settingSources: ["user", "project", "local"],

          // Disable partial messages — they create empty intermediate cards in the UI.
          // Complete messages arrive once the turn finishes, which is cleaner.
          includePartialMessages: false,

          // Enable file checkpointing for the timeline/rewind feature
          enableFileCheckpointing: true,

          // Enable sub-agent progress summaries for the UI
          agentProgressSummaries: req.subagent_progress_summaries !== false,

          // Identify RuneCode as the client app in User-Agent
          env: {
            ...process.env,
            CLAUDE_AGENT_SDK_CLIENT_APP: "RuneCode",
            ...(req.teams_enabled !== false ? { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" } : {}),
          },

          // Permission mode — default to 'bypassPermissions' (auto-approve everything)
          permissionMode: req.permission_mode || "bypassPermissions",
          // Required for bypassPermissions mode
          ...((!req.permission_mode || req.permission_mode === 'bypassPermissions') ? { allowDangerouslySkipPermissions: true } : {}),
        };

        // Map thinking mode to SDK thinking config
        if (req.thinking_mode && req.thinking_mode !== "auto") {
          const thinkingBudgets: Record<string, number> = {
            think: 5000,
            think_hard: 10000,
            think_harder: 20000,
            ultrathink: 50000,
          };
          const budget = thinkingBudgets[req.thinking_mode];
          if (budget) {
            options.thinking = { type: "enabled", budgetTokens: budget };
          }
        }

        if (req.effort && req.effort !== 'auto') {
          (options as any).effort = req.effort;
        }

        if (req.model) options.model = req.model;
        if (req.max_turns) options.maxTurns = req.max_turns;
        if (req.max_budget_usd) options.maxBudgetUsd = req.max_budget_usd;
        if (req.session_id) options.resume = req.session_id;
        if (req.resume_at) options.resumeSessionAt = req.resume_at;

        // Sub-agent defaults — passed as SDK subagentOptions when available
        if (req.subagent_max_turns && req.subagent_max_turns > 0) {
          (options as any).subagentMaxTurns = req.subagent_max_turns;
        }
        if (req.team_max_concurrent && req.team_max_concurrent > 0) {
          (options as any).maxConcurrentAgents = req.team_max_concurrent;
        }

        // Remote environment support
        if (req.environment && req.environment.type === 'ssh' && req.environment.sshHost) {
          (options as any).sshConfigs = [{
            id: `ssh_${req.environment.sshHost}`,
            name: req.environment.sshHost,
            sshHost: req.environment.sshHost,
            ...(req.environment.sshPort ? { sshPort: req.environment.sshPort } : {}),
            ...(req.environment.sshIdentityFile ? { sshIdentityFile: req.environment.sshIdentityFile } : {}),
            ...(req.environment.startDirectory ? { startDirectory: req.environment.startDirectory } : {}),
          }];
        }

        // WSL2 — custom process spawner
        if (req.environment && req.environment.type === 'wsl') {
          const distro = req.environment.wslDistro;
          const startDir = req.environment.startDirectory;
          (options as any).spawnClaudeCodeProcess = (spawnOpts: any) => {
            const wslArgs = distro ? ['-d', distro, '--'] : ['--'];
            if (startDir) wslArgs.push('cd', startDir, '&&');
            wslArgs.push(spawnOpts.command, ...spawnOpts.args);
            const child = spawn('wsl', wslArgs, {
              env: spawnOpts.env,
              signal: spawnOpts.signal,
              stdio: ['pipe', 'pipe', 'pipe'],
            });
            return child;
          };
        }

        // Docker — custom process spawner
        if (req.environment && req.environment.type === 'docker' && req.environment.dockerContainer) {
          const container = req.environment.dockerContainer;
          const startDir = req.environment.startDirectory;
          (options as any).spawnClaudeCodeProcess = (spawnOpts: any) => {
            const dockerArgs = ['exec', '-i'];
            // Pass env vars
            for (const [key, val] of Object.entries(spawnOpts.env || {})) {
              if (key && val) dockerArgs.push('-e', `${key}=${val}`);
            }
            if (startDir) dockerArgs.push('-w', startDir);
            dockerArgs.push(container, spawnOpts.command, ...spawnOpts.args);
            const child = spawn('docker', dockerArgs, {
              signal: spawnOpts.signal,
              stdio: ['pipe', 'pipe', 'pipe'],
            });
            return child;
          };
        }

        return options;
      }

      /**
       * Start the async output loop for a persistent session.
       * Streams SDK messages to the WebSocket and detects turn completion
       * by watching for 'result' type messages from the SDK.
       */
      async function startOutputLoop(connectionId: string, session: PersistentSession) {
        session.outputLoopRunning = true;
        try {
          for await (const message of session.query) {
            if (session.ws.readyState !== WebSocket.OPEN) break;

            // Forward the message to the frontend
            session.ws.send(JSON.stringify({ type: "message", content: JSON.stringify(message), session_id: session.sessionId }));

            // Forward dedicated subagent lifecycle events
            if (typeof message === "object" && message !== null && "type" in message) {
              const msg = message as any;
              if (msg.type === 'system' && (msg.subtype === 'task_started' || msg.subtype === 'task_progress' || msg.subtype === 'task_notification')) {
                session.ws.send(JSON.stringify({
                  type: 'subagent_event',
                  event: msg.subtype,
                  task_id: msg.task_id,
                  description: msg.description,
                  task_type: msg.task_type,
                  status: msg.status,
                  summary: msg.summary,
                  usage: msg.usage,
                  last_tool_name: msg.last_tool_name,
                  output_file: msg.output_file,
                  prompt: msg.prompt,
                  session_id: session.sessionId,
                }));
              }

              // Detect Agent tool invocations with team context
              if (msg.type === 'assistant' && msg.content && Array.isArray(msg.content)) {
                for (const block of msg.content) {
                  if (block.type === 'tool_use' && block.name === 'Agent' && block.input?.team_name) {
                    session.ws.send(JSON.stringify({
                      type: 'team_event',
                      event: 'teammate_spawned',
                      teammate_name: block.input.name,
                      team_name: block.input.team_name,
                      description: block.input.description,
                      session_id: session.sessionId,
                    }));
                  }
                }
              }
            }

            // Extract session ID from the first system:init message
            if (
              session.sessionId === null &&
              typeof message === "object" &&
              message !== null &&
              "type" in message &&
              (message as any).type === "system" &&
              "subtype" in message &&
              (message as any).subtype === "init" &&
              "sessionId" in message
            ) {
              session.sessionId = (message as any).sessionId;
              session.ws.send(JSON.stringify({
                type: "session_id",
                session_id: session.sessionId,
              }));
            }

            // Cache rate limit + usage data from SDK for the usage panel
            if (typeof message === "object" && message !== null && "type" in message) {
              const msgType = (message as any).type;

              if (msgType === "rate_limit_event") {
                cachedRateLimitInfo = (message as any).rate_limit_info || message;
                // Track window reset time for usage accumulator
                if (cachedRateLimitInfo?.resetsAt) {
                  const newReset = cachedRateLimitInfo.resetsAt;
                  if (newReset !== windowResetsAt) {
                    // New window — check if old one expired
                    checkWindowReset();
                    windowResetsAt = newReset;
                  }
                }
              }

              if (msgType === "result" && !(message as any).is_error) {
                checkWindowReset(); // reset if window expired
                const r = message as any;
                cachedTotalUsage.totalCostUsd += r.total_cost_usd || 0;
                cachedTotalUsage.totalTurns += r.num_turns || 0;
                cachedTotalUsage.totalDurationMs += r.duration_ms || 0;
                cachedTotalUsage.sessionCount += 1;
                if (r.usage) {
                  cachedTotalUsage.totalInputTokens += r.usage.input_tokens || 0;
                  cachedTotalUsage.totalOutputTokens += r.usage.output_tokens || 0;
                  cachedTotalUsage.totalCacheReadTokens += r.usage.cache_read_input_tokens || 0;
                  cachedTotalUsage.totalCacheCreationTokens += r.usage.cache_creation_input_tokens || 0;
                }
                if (r.modelUsage) {
                  for (const [model, usage] of Object.entries(r.modelUsage)) {
                    if (!cachedTotalUsage.modelUsage[model]) {
                      cachedTotalUsage.modelUsage[model] = { ...(usage as any) };
                    } else {
                      const u = cachedTotalUsage.modelUsage[model];
                      const mu = usage as any;
                      u.inputTokens = (u.inputTokens || 0) + (mu.inputTokens || 0);
                      u.outputTokens = (u.outputTokens || 0) + (mu.outputTokens || 0);
                      u.costUSD = (u.costUSD || 0) + (mu.costUSD || 0);
                    }
                  }
                }
              }
            }

            // Detect turn completion — the SDK emits a 'result' message at the end of a turn
            if (
              typeof message === "object" &&
              message !== null &&
              "type" in message &&
              (message as any).type === "result"
            ) {
              if (session.ws.readyState === WebSocket.OPEN) {
                session.ws.send(JSON.stringify({ type: "turn_complete", session_id: session.sessionId }));
              }
            }
          }

          // The for-await loop exited — the query has fully ended
          if (session.ws.readyState === WebSocket.OPEN) {
            session.ws.send(JSON.stringify({ type: "session_ended", session_id: session.sessionId }));
          }
        } catch (err: any) {
          if (err.name === "AbortError") return;
          console.error("[dev-api] Output loop error:", err.message);
          if (session.ws.readyState === WebSocket.OPEN) {
            session.ws.send(JSON.stringify({ type: "error", message: err.message, session_id: session.sessionId }));
          }
        } finally {
          session.outputLoopRunning = false;
          // Don't destroy the session here — keep it alive for follow-up prompts.
          // Session is only destroyed on explicit {type: "close"} or WebSocket disconnect.
        }
      }

      /**
       * Tear down a persistent session and clean up all resources.
       */
      function destroySession(connectionId: string) {
        const session = activeSessions.get(connectionId);
        if (!session) return;

        try { session.inputChannel.close(); } catch { /* ignore */ }
        try { session.abortController.abort(); } catch { /* ignore */ }
        try { session.query.close(); } catch { /* ignore */ }
        activeSessions.delete(connectionId);
        wsToConnectionId.delete(session.ws);
        console.log("[dev-api] Session destroyed:", connectionId.slice(0, 8));
      }

      wss.on("connection", (ws: WebSocket) => {
        const connectionId = crypto.randomUUID();
        wsToConnectionId.set(ws, connectionId);

        console.log("[dev-api] WebSocket connected:", connectionId.slice(0, 8));

        ws.on("message", async (data: Buffer) => {
          try {
            const msg = JSON.parse(data.toString());

            // ----------------------------------------------------------
            // {type: "init", text, project_path, model?, session_id?, ...}
            // Create a new persistent session with the first prompt.
            // ----------------------------------------------------------
            if (msg.type === "init") {
              // Destroy any existing session for this connection
              destroySession(connectionId);

              const abortController = new AbortController();
              const options = buildSdkOptions({
                project_path: msg.project_path,
                model: msg.model,
                session_id: msg.session_id,
                thinking_mode: msg.thinking_mode,
                permission_mode: msg.permission_mode,
                max_turns: msg.max_turns,
                max_budget_usd: msg.max_budget_usd,
                effort: msg.effort,
                resume_at: msg.resume_at,
                teams_enabled: msg.teams_enabled,
                subagent_default_model: msg.subagent_default_model,
                subagent_default_permission_mode: msg.subagent_default_permission_mode,
                subagent_progress_summaries: msg.subagent_progress_summaries,
                subagent_max_turns: msg.subagent_max_turns,
                team_max_concurrent: msg.team_max_concurrent,
                team_default_model: msg.team_default_model,
                environment: msg.environment,
              }, abortController);

              console.log("[dev-api] Init session:", {
                connectionId: connectionId.slice(0, 8),
                cwd: options.cwd,
                model: msg.model,
                resume: msg.session_id?.slice(0, 8),
                permission_mode: options.permissionMode,
                effort: msg.effort,
              });

              // Create persistent input channel and push the first prompt
              const inputChannel = createInputChannel();
              const firstPrompt = msg.text || msg.prompt || ".";
              inputChannel.push(firstPrompt);

              // Create query with AsyncIterable — keeps process alive for multi-turn
              const query = sdkQuery({ prompt: inputChannel.iterable, options });

              const session: PersistentSession = {
                query,
                inputChannel,
                abortController,
                sessionId: msg.session_id || null,
                ws,
                outputLoopRunning: false,
              };

              activeSessions.set(connectionId, session);

              // Send acknowledgement
              ws.send(JSON.stringify({
                type: "start",
                session_id: msg.session_id || "",
                connection_id: connectionId,
              }));

              // Start the output loop (runs in background)
              startOutputLoop(connectionId, session);
              return;
            }

            // ----------------------------------------------------------
            // {type: "init_agent", agent_name, text, project_path, model?, ...}
            // Create a new persistent session using a native .md agent.
            // The SDK loads the agent's system prompt, tools, and model
            // from the discovered agent file automatically.
            // ----------------------------------------------------------
            if (msg.type === "init_agent") {
              destroySession(connectionId);

              const abortController = new AbortController();
              const options = buildSdkOptions({
                project_path: msg.project_path,
                model: msg.model,
                thinking_mode: msg.thinking_mode,
                permission_mode: msg.permission_mode,
                effort: msg.effort,
                teams_enabled: msg.teams_enabled,
                subagent_default_model: msg.subagent_default_model,
                subagent_default_permission_mode: msg.subagent_default_permission_mode,
                subagent_progress_summaries: msg.subagent_progress_summaries,
                subagent_max_turns: msg.subagent_max_turns,
                team_max_concurrent: msg.team_max_concurrent,
                team_default_model: msg.team_default_model,
                environment: msg.environment,
              }, abortController);

              // Set the agent option — SDK will load the .md file's prompt, tools, model
              (options as any).agent = msg.agent_name;

              console.log("[dev-api] Init agent session:", {
                connectionId: connectionId.slice(0, 8),
                agent: msg.agent_name,
                cwd: options.cwd,
                model: msg.model,
              });

              const inputChannel = createInputChannel();
              const firstPrompt = msg.text || msg.prompt || ".";
              inputChannel.push(firstPrompt);

              const query = sdkQuery({ prompt: inputChannel.iterable, options });

              const session: PersistentSession = {
                query,
                inputChannel,
                abortController,
                sessionId: null,
                ws,
                outputLoopRunning: false,
              };

              activeSessions.set(connectionId, session);

              ws.send(JSON.stringify({
                type: "start",
                agent_name: msg.agent_name,
                connection_id: connectionId,
              }));

              startOutputLoop(connectionId, session);
              return;
            }

            // ----------------------------------------------------------
            // {type: "prompt", text, thinking_mode?}
            // Push a follow-up prompt into the existing persistent session.
            // ----------------------------------------------------------
            if (msg.type === "prompt") {
              const session = activeSessions.get(connectionId);
              if (!session) {
                ws.send(JSON.stringify({
                  type: "error",
                  message: "No active session. Send {type: 'init'} first.",
                }));
                return;
              }

              const text = msg.text || msg.prompt;
              if (!text) {
                ws.send(JSON.stringify({ type: "error", message: "Missing 'text' field." }));
                return;
              }

              console.log("[dev-api] Sending follow-up via streamInput:", connectionId.slice(0, 8));

              // Push into the session's persistent input channel
              // The for-await output loop is still running and will pick this up
              session.inputChannel.push(text);
              return;
            }

            // ----------------------------------------------------------
            // {type: "interrupt"}
            // Interrupt the current turn without closing the session.
            // ----------------------------------------------------------
            if (msg.type === "interrupt") {
              const session = activeSessions.get(connectionId);
              if (session) {
                console.log("[dev-api] Interrupting session:", connectionId.slice(0, 8));
                try { session.query.interrupt(); } catch { /* ignore */ }
              }
              return;
            }

            // ----------------------------------------------------------
            // {type: "set_model", model: string}
            // Change model mid-session via SDK's setModel().
            // ----------------------------------------------------------
            if (msg.type === "set_model") {
              const session = activeSessions.get(connectionId);
              if (session) {
                try {
                  await session.query.setModel(msg.model || undefined);
                  ws.send(JSON.stringify({ type: "model_changed", model: msg.model }));
                } catch (err: any) {
                  ws.send(JSON.stringify({ type: "error", message: `setModel failed: ${err.message}` }));
                }
              }
              return;
            }

            // ----------------------------------------------------------
            // {type: "set_permission_mode", mode: string}
            // Change permission mode mid-session.
            // ----------------------------------------------------------
            if (msg.type === "set_permission_mode") {
              const session = activeSessions.get(connectionId);
              if (session) {
                try {
                  await session.query.setPermissionMode(msg.mode);
                  ws.send(JSON.stringify({ type: "permission_mode_changed", mode: msg.mode }));
                } catch (err: any) {
                  ws.send(JSON.stringify({ type: "error", message: `setPermissionMode failed: ${err.message}` }));
                }
              }
              return;
            }

            // ----------------------------------------------------------
            // {type: "rewind_files", user_message_id: string, dry_run?: boolean}
            // Rewind files to a specific message checkpoint.
            // ----------------------------------------------------------
            if (msg.type === "rewind_files") {
              const session = activeSessions.get(connectionId);
              if (session) {
                try {
                  const result = await session.query.rewindFiles(msg.user_message_id, {
                    dryRun: msg.dry_run || false,
                  });
                  ws.send(JSON.stringify({ type: "rewind_result", ...result }));
                } catch (err: any) {
                  ws.send(JSON.stringify({ type: "error", message: `rewindFiles failed: ${err.message}` }));
                }
              }
              return;
            }

            // ----------------------------------------------------------
            // {type: "stop_task", task_id: string}
            // Stop a running background task.
            // ----------------------------------------------------------
            if (msg.type === "stop_task") {
              const session = activeSessions.get(connectionId);
              if (session && msg.task_id) {
                try {
                  await session.query.stopTask(msg.task_id);
                  ws.send(JSON.stringify({ type: "task_stopped", task_id: msg.task_id }));
                } catch (err: any) {
                  ws.send(JSON.stringify({ type: "error", message: `stopTask failed: ${err.message}` }));
                }
              }
              return;
            }

            // ----------------------------------------------------------
            // {type: "reconnect_mcp", server_name: string}
            // Reconnect a specific MCP server.
            // ----------------------------------------------------------
            if (msg.type === "reconnect_mcp") {
              const session = activeSessions.get(connectionId);
              if (session && msg.server_name) {
                try {
                  await session.query.reconnectMcpServer(msg.server_name);
                  ws.send(JSON.stringify({ type: "mcp_reconnected", server_name: msg.server_name }));
                } catch (err: any) {
                  ws.send(JSON.stringify({ type: "error", message: `reconnectMcpServer failed: ${err.message}` }));
                }
              }
              return;
            }

            // ----------------------------------------------------------
            // {type: "toggle_mcp", server_name: string, enabled: boolean}
            // Enable or disable an MCP server.
            // ----------------------------------------------------------
            if (msg.type === "toggle_mcp") {
              const session = activeSessions.get(connectionId);
              if (session && msg.server_name !== undefined) {
                try {
                  await session.query.toggleMcpServer(msg.server_name, msg.enabled !== false);
                  ws.send(JSON.stringify({ type: "mcp_toggled", server_name: msg.server_name, enabled: msg.enabled }));
                } catch (err: any) {
                  ws.send(JSON.stringify({ type: "error", message: `toggleMcpServer failed: ${err.message}` }));
                }
              }
              return;
            }

            // ----------------------------------------------------------
            // {type: "get_mcp_status"}
            // Get live MCP server status from active session.
            // ----------------------------------------------------------
            if (msg.type === "get_mcp_status") {
              const session = activeSessions.get(connectionId);
              if (session) {
                try {
                  const status = await session.query.mcpServerStatus();
                  ws.send(JSON.stringify({ type: "mcp_status", servers: status }));
                } catch (err: any) {
                  ws.send(JSON.stringify({ type: "error", message: `mcpServerStatus failed: ${err.message}` }));
                }
              }
              return;
            }

            // ----------------------------------------------------------
            // {type: "close"}
            // Explicitly close the session and free resources.
            // ----------------------------------------------------------
            if (msg.type === "close") {
              console.log("[dev-api] Closing session:", connectionId.slice(0, 8));
              destroySession(connectionId);
              ws.send(JSON.stringify({ type: "session_closed" }));
              return;
            }

            // ----------------------------------------------------------
            // Legacy support: {command_type: "cancel" | ...}
            // Bridge old protocol messages to the new session model.
            // ----------------------------------------------------------
            if (msg.command_type === "cancel") {
              const session = activeSessions.get(connectionId);
              if (session) {
                try { session.query.interrupt(); } catch { /* ignore */ }
              }
              return;
            }

            // Legacy: treat any message with command_type or prompt as an init
            if (msg.command_type || msg.prompt) {
              // Destroy existing session first
              destroySession(connectionId);

              const abortController = new AbortController();
              const options = buildSdkOptions({
                project_path: msg.project_path,
                model: msg.model,
                session_id: msg.session_id,
                thinking_mode: msg.thinking_mode,
                permission_mode: msg.permission_mode,
                max_turns: msg.max_turns,
                max_budget_usd: msg.max_budget_usd,
                effort: msg.effort,
              }, abortController);

              if (msg.command_type === "resume" && msg.session_id) {
                options.resume = msg.session_id;
              }
              if (msg.command_type === "continue") {
                options.continue = true;
              }

              console.log("[dev-api] Legacy SDK query:", {
                command_type: msg.command_type,
                cwd: options.cwd,
                model: msg.model,
                session_id: msg.session_id?.slice(0, 8),
                permission_mode: options.permissionMode,
              });

              const inputChannel = createInputChannel();
              inputChannel.push(msg.prompt || ".");
              const query = sdkQuery({ prompt: inputChannel.iterable, options });

              const session: PersistentSession = {
                query,
                inputChannel,
                abortController,
                sessionId: msg.session_id || null,
                ws,
                outputLoopRunning: false,
              };

              activeSessions.set(connectionId, session);

              ws.send(JSON.stringify({
                type: "start",
                session_id: msg.session_id || "",
                connection_id: connectionId,
              }));

              startOutputLoop(connectionId, session);
              return;
            }

            // Unknown message type
            console.warn("[dev-api] Unknown WS message type:", msg.type || msg.command_type);
          } catch (err: any) {
            console.error("[dev-api] WS message handler error:", err.message);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "error", message: err.message }));
            }
          }
        });

        ws.on("close", () => {
          console.log("[dev-api] WebSocket disconnected:", connectionId.slice(0, 8));
          destroySession(connectionId);
          wsToConnectionId.delete(ws);
        });
      });
    },
  };
}
