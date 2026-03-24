/**
 * Static catalogue of popular MCP servers shown in the directory and
 * recommended-servers strip.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PopularMcpServer {
  name: string;
  description: string;
  package: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  category: string;
  tokens?: string;
  recommended?: boolean;
  note?: string;
}

// ─── Popular server catalogue ─────────────────────────────────────────────────

export const POPULAR_MCP_SERVERS: PopularMcpServer[] = [
  // ── Recommended ──
  {
    name: "github",
    description:
      "GitHub integration — repos, issues, PRs, code search, actions. Essential for any project on GitHub.",
    package: "@modelcontextprotocol/server-github",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
    category: "Recommended",
    tokens: "~500 per tool call",
    recommended: true,
  },
  {
    name: "jcodemunch",
    description:
      "Code intelligence — symbol search, dependency graphs, blast radius analysis, class hierarchy. Deep codebase understanding without reading every file.",
    package: "jcodemunch-mcp (uvx)",
    command: "uvx",
    args: ["jcodemunch-mcp"],
    category: "Recommended",
    tokens: "~200-800 per query (indexed, very efficient)",
    recommended: true,
  },
  {
    name: "context7",
    description:
      "Up-to-date documentation for any library. Pulls latest docs so Claude never uses outdated APIs. Dramatically reduces hallucinated function calls.",
    package: "@upstash/context7-mcp",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp"],
    category: "Recommended",
    tokens: "~1000-3000 per doc lookup (returns relevant sections)",
    recommended: true,
  },
  {
    name: "memory",
    description:
      "Persistent knowledge graph — Claude remembers facts, decisions, and context across sessions. Builds a project knowledge base over time.",
    package: "@modelcontextprotocol/server-memory",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    category: "Recommended",
    tokens: "~100-500 per read/write (lightweight)",
    recommended: true,
  },
  // ── Code Analysis ──
  {
    name: "sequential-thinking",
    description:
      "Step-by-step reasoning — forces Claude to think through complex problems methodically before acting.",
    package: "@modelcontextprotocol/server-sequential-thinking",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    category: "Code Analysis",
    tokens: "~200-400 per step (minimal overhead)",
  },
  // ── Databases ──
  {
    name: "postgres",
    description:
      "Query and manage PostgreSQL — schema inspection, SQL execution, data analysis.",
    package: "@modelcontextprotocol/server-postgres",
    command: "npx",
    args: [
      "-y",
      "@modelcontextprotocol/server-postgres",
      "postgresql://localhost/mydb",
    ],
    category: "Databases",
    tokens: "~200-2000 per query (depends on result size)",
  },
  // ── Web & Search ──
  {
    name: "brave-search",
    description:
      "Web search via Brave API — Claude can search the internet for current information, docs, and solutions.",
    package: "@modelcontextprotocol/server-brave-search",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    env: { BRAVE_API_KEY: "" },
    category: "Web & Search",
    tokens: "~500-1500 per search (results summary)",
  },
  {
    name: "puppeteer",
    description:
      "Browser automation — navigate pages, take screenshots, fill forms, scrape content.",
    package: "@modelcontextprotocol/server-puppeteer",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-puppeteer"],
    category: "Web & Search",
    tokens: "~1000-5000 per action (screenshots are large)",
  },
  // ── Communication ──
  {
    name: "slack",
    description:
      "Slack integration — send messages, read channels, search conversations.",
    package: "@modelcontextprotocol/server-slack",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    env: { SLACK_BOT_TOKEN: "", SLACK_TEAM_ID: "" },
    category: "Communication",
    tokens: "~300-1000 per message/search",
  },
  // ── Infrastructure ──
  {
    name: "filesystem",
    description:
      "Sandboxed file access — read, write, search files in a specific directory. Useful for restricting Claude to a sandbox.",
    package: "@modelcontextprotocol/server-filesystem",
    command: "npx",
    args: [
      "-y",
      "@modelcontextprotocol/server-filesystem",
      "/path/to/dir",
    ],
    category: "Infrastructure",
    tokens: "~100-2000 per operation (file-size dependent)",
  },
  {
    name: "google-maps",
    description:
      "Geocoding, directions, and place search via Google Maps API.",
    package: "@modelcontextprotocol/server-google-maps",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-google-maps"],
    env: { GOOGLE_MAPS_API_KEY: "" },
    category: "Infrastructure",
    tokens: "~300-800 per query",
  },
];
