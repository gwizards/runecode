# DDD Refactor: 5 Bounded Contexts at 5/5 Maturity

## Context

RuneCode currently has **one** formal bounded context (`ruflo`) scoring **3.6/5** DDD maturity.
Four other domains exist as logic scattered across `src/stores/`, `src/lib/api.ts`, and components,
with no domain layer at all — scoring **0.6–1.6/5**.

**Target**: 5 bounded contexts × 5 axes × 5/5 each.

---

## Current Score (Audit 2026-03-22)

| Bounded Context | Aggregates | Value Objects | Events | App Services | Repos | Avg |
|---|---|---|---|---|---|---|
| `ruflo` | 4 | 5 | 2 | 3 | 4 | **3.6** |
| `session` | 2 | 1 | 1 | 2 | 2 | **1.6** |
| `agent` | 1 | 1 | 0 | 1 | 0 | **0.6** |
| `project` | 1 | 1 | 0 | 1 | 0 | **0.6** |
| `mcp` | 1 | 1 | 0 | 1 | 0 | **0.6** |
| **OVERALL** | **1.8** | **1.8** | **0.6** | **1.6** | **1.2** | **1.6/5** |

---

## Target Score

| Bounded Context | Aggregates | Value Objects | Events | App Services | Repos | Avg |
|---|---|---|---|---|---|---|
| `ruflo` | 5 | 5 | 5 | 5 | 5 | **5.0** |
| `session` | 5 | 5 | 5 | 5 | 5 | **5.0** |
| `agent` | 5 | 5 | 5 | 5 | 5 | **5.0** |
| `project` | 5 | 5 | 5 | 5 | 5 | **5.0** |
| `mcp` | 5 | 5 | 5 | 5 | 5 | **5.0** |

---

## Acceptance Criteria

- [ ] `src/domain/ruflo/` — upgraded to 5/5 (factory guards, typed events raised from aggregates, event sourcing)
- [ ] `src/domain/session/` — new domain (Session aggregate, typed events, service, store, tests)
- [ ] `src/domain/agent/` — new domain (LiveAgent aggregate, AgentStatus VO, events, service, store, tests)
- [ ] `src/domain/project/` — new domain (Project aggregate, ProjectPath VO, events, service, store, tests)
- [ ] `src/domain/mcp/` — new domain (MCPServer aggregate, ServerStatus VO, events, service, store, tests)
- [ ] All 5 domains export from `src/domain/<name>/index.ts` barrel
- [ ] Each domain has ≥10 vitest tests
- [ ] `src/stores/sessionStore.ts` delegates to `src/domain/session/store.ts` (no API calls inline)
- [ ] `src/stores/agentStore.ts` delegates to `src/domain/agent/store.ts` (no API calls inline)
- [ ] Components import ONLY from `src/domain/*/index.ts` — never from `src/lib/api.ts` directly
- [ ] `npm run build` passes · vitest passes · cargo check clean

---

## Technical Approach

### DDD Maturity Ladder (axes defined)

**Aggregates (→5)**: Factory function enforces invariants; internal state is private; only exposes
domain methods (no raw field mutation). Aggregate records internal domain events.

**Value Objects (→5)**: Branded types for all IDs; self-validating constructors that throw on invalid
input; immutable; equality by value; rich behavior (not just data containers).

**Domain Events (→5)**: Events are `readonly` objects with typed payloads; raised **inside** aggregate
methods (not by store or service); stored in `aggregate._events[]`; dispatched by application service
after persistence; events are the only coupling between bounded contexts.

**Application Services (→5)**: Thin command/query handlers; each handler: (1) loads aggregate from
repo, (2) calls aggregate method, (3) persists, (4) dispatches events. No business logic.

**Repositories (→5)**: Interface + in-memory test implementation + production implementation;
Unit of Work pattern across aggregate boundaries; dependency-injected into application services.

---

## Domain 1: `ruflo` — Upgrade to 5/5

### Gap: Aggregates (4→5)
**Problem**: `RuFloSwarm` and `RuFloInstallation` are interfaces — any code can construct them.
Mappers like `toRuFloSwarm()` set raw fields without invariant validation.

**Fix**: Convert to class-based aggregates with private constructors:
```typescript
// src/domain/ruflo/aggregates/swarm.aggregate.ts
export class RuFloSwarmAggregate {
  private constructor(
    private readonly _id: SwarmId,
    private _agents: ReadonlyArray<RuFloAgent>,
    private readonly _topology: string,
    private readonly _maxAgents: number,
    private _events: DomainEvent[] = [],
  ) {}

  static create(raw: RuFloSwarmRaw): RuFloSwarmAggregate {
    if (!raw.topology) throw new Error('Swarm topology required');
    const agents = raw.agents.map(a => RuFloAgent.fromRaw(a));
    const swarm = new RuFloSwarmAggregate(
      toSwarmId(raw.memory_namespace ?? 'default'),
      agents,
      raw.topology,
      raw.max_agents ?? 15,
    );
    swarm._events.push(new SwarmInitializedEvent(swarm._id, agents.length));
    return swarm;
  }

  addAgent(agent: RuFloAgent): void {
    if (this._agents.length >= this._maxAgents) throw new Error('Swarm at capacity');
    this._agents = [...this._agents, agent];
    this._events.push(new AgentAddedEvent(agent.id));
  }

  get events(): ReadonlyArray<DomainEvent> { return this._events; }
  clearEvents(): void { this._events = []; }
}
```

### Gap: Domain Events (2→5)
**Problem**: Events dispatched from store via `dispatchRuFloEvent()` using browser CustomEvent —
no typed payloads, no sourcing, not raised from within aggregates.

**Fix**: Typed event classes raised inside aggregate methods:
```typescript
// src/domain/ruflo/events/index.ts
export interface DomainEvent {
  readonly type: string;
  readonly occurredAt: number;
  readonly aggregateId: string;
}

export class SwarmInitializedEvent implements DomainEvent {
  readonly type = 'SwarmInitialized' as const;
  readonly occurredAt = Date.now();
  constructor(
    readonly aggregateId: string,
    readonly agentCount: number,
    readonly topology: string,
  ) {}
}

export class AgentAddedEvent implements DomainEvent { ... }
export class MemoryBackendChangedEvent implements DomainEvent { ... }
export class InstallationCompletedEvent implements DomainEvent { ... }
export class InstallationFailedEvent implements DomainEvent { ... }
```

### Gap: Application Services (3→5)
**Problem**: `useRuFloStore` mixes domain state with UI state (`loading`, `error`, `actionInProgress`).

**Fix**: Separate application service from UI store:
```typescript
// src/domain/ruflo/application/ruflo.service.ts
export class RuFloApplicationService {
  constructor(
    private repo: IRuFloRepository,
    private eventBus: IEventBus,
  ) {}

  async initializeSwarm(topology: string): Promise<void> {
    const swarm = await this.repo.getSwarm();
    swarm.initialize(topology);
    await this.repo.saveSwarm(swarm);
    this.eventBus.dispatch(swarm.events);
    swarm.clearEvents();
  }
}
```

### Gap: Repositories (4→5)
**Fix**: Repository interface + implementations:
```typescript
// src/domain/ruflo/repositories/ruflo.repository.ts
export interface IRuFloRepository {
  getInstallation(): Promise<RuFloInstallation>;
  getSwarm(): Promise<RuFloSwarmAggregate>;
  saveSwarm(swarm: RuFloSwarmAggregate): Promise<void>;
  getMemoryStats(): Promise<MemoryStats>;
}

export class TauriRuFloRepository implements IRuFloRepository { ... }   // production
export class InMemoryRuFloRepository implements IRuFloRepository { ... } // tests
```

---

## Domain 2: `session` — New (0→5)

**What exists**: `src/stores/sessionStore.ts` — Zustand store with raw API calls, no domain types.
**Source types**: `Session`, `Project` in `src/lib/api.ts`

### Files to create:
```
src/domain/session/
├── types.ts          — Session aggregate class, ProjectId/SessionId VOs
├── events.ts         — SessionCreated, SessionCompleted, OutputAppended, ProjectCreated
├── service.ts        — SessionApplicationService (load/create/delete/appendOutput)
├── repository.ts     — ISessionRepository + InMemorySessionRepository
├── store.ts          — Thin Zustand store (delegates to service)
├── index.ts          — Barrel
└── session.test.ts   — ≥10 tests
```

### Key types:
```typescript
// Branded IDs
export type SessionId = string & { readonly _brand: 'SessionId' };
export type ProjectId = string & { readonly _brand: 'ProjectId' };
export function toSessionId(id: string): SessionId { return id as SessionId; }
export function toProjectId(id: string): ProjectId { return id as ProjectId; }

// Value Objects
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
}
export function emptyTokenUsage(): TokenUsage { ... }
export function addTokenUsage(a: TokenUsage, b: Partial<TokenUsage>): TokenUsage { ... }

// Aggregate (class with private constructor)
export class SessionAggregate {
  private constructor(readonly id: SessionId, ...) {}
  static create(raw: RawSession): SessionAggregate { ... } // factory + invariants
  appendOutput(chunk: string): void { ... }  // raises OutputAppended event
  complete(): void { ... }                   // raises SessionCompleted event
  get events(): ReadonlyArray<DomainEvent> { ... }
}
```

---

## Domain 3: `agent` — New (0→5)

**What exists**: `src/stores/agentStore.ts` — tracks `LiveAgent` objects from WebSocket.

### Files to create:
```
src/domain/agent/
├── types.ts          — LiveAgentAggregate, AgentStatus VO, AgentId branded type
├── events.ts         — AgentStarted, AgentThinking, AgentCompleted, AgentFailed
├── service.ts        — AgentApplicationService
├── repository.ts     — IAgentRepository (in-memory only — agents are ephemeral)
├── store.ts          — Thin Zustand store
├── index.ts
└── agent.test.ts     — ≥10 tests
```

### Key types:
```typescript
export type AgentId = string & { readonly _brand: 'AgentId' };

export type AgentStatus = 'running' | 'thinking' | 'completed' | 'failed';
export function isTerminalStatus(s: AgentStatus): boolean {
  return s === 'completed' || s === 'failed';
}
export function isActiveStatus(s: AgentStatus): boolean {
  return s === 'running' || s === 'thinking';
}

export class LiveAgentAggregate {
  private constructor(
    readonly id: AgentId,
    private _status: AgentStatus,
    private _tokenCount: number,
    readonly startedAt: number,
    private _elapsedMs: number,
    private _events: DomainEvent[] = [],
  ) {}

  static start(id: string, name: string): LiveAgentAggregate { ... }

  tick(elapsedMs: number, tokenCount: number): void {
    this._elapsedMs = elapsedMs;
    this._tokenCount = tokenCount;
  }

  complete(): void {
    if (isTerminalStatus(this._status)) throw new Error('Agent already terminated');
    this._status = 'completed';
    this._events.push(new AgentCompletedEvent(this.id, this._tokenCount));
  }

  fail(reason: string): void { ... }
}
```

---

## Domain 4: `project` — New (0→5)

**What exists**: `Project` interface in api.ts; `CreateProjectDialog.tsx` contains project creation logic.

### Files to create:
```
src/domain/project/
├── types.ts          — ProjectAggregate, ProjectPath VO, ProjectName VO
├── events.ts         — ProjectCreated, ProjectOpened, ProjectDeleted
├── service.ts        — ProjectApplicationService
├── repository.ts     — IProjectRepository + InMemoryProjectRepository
├── store.ts          — Thin Zustand store (replaces project section of sessionStore)
├── index.ts
└── project.test.ts   — ≥10 tests
```

### Key types:
```typescript
// Value Object: ProjectPath validates existence + home-dir constraint
export class ProjectPath {
  private constructor(readonly value: string) {}
  static create(raw: string): ProjectPath {
    if (!raw.trim()) throw new Error('Project path required');
    if (!raw.startsWith('/') && !raw.match(/^[A-Z]:\\/)) throw new Error('Absolute path required');
    return new ProjectPath(raw);
  }
  get name(): string { return this.value.split('/').pop() ?? this.value; }
  equals(other: ProjectPath): boolean { return this.value === other.value; }
}

// Value Object: ProjectName (1-100 chars, no special chars)
export class ProjectName {
  private constructor(readonly value: string) {}
  static create(raw: string): ProjectName {
    const v = raw.trim();
    if (!v || v.length > 100) throw new Error('Name must be 1-100 characters');
    return new ProjectName(v);
  }
}

export class ProjectAggregate {
  private constructor(
    readonly id: ProjectId,
    private _path: ProjectPath,
    private _name: ProjectName,
    private _events: DomainEvent[] = [],
  ) {}

  static create(id: string, path: string, name: string): ProjectAggregate {
    const agg = new ProjectAggregate(
      toProjectId(id),
      ProjectPath.create(path),
      ProjectName.create(name),
    );
    agg._events.push(new ProjectCreatedEvent(agg.id, path, name));
    return agg;
  }

  get path(): string { return this._path.value; }
  get name(): string { return this._name.value; }
}
```

---

## Domain 5: `mcp` — New (0→5)

**What exists**: `MCPServer`, `MCPProjectConfig`, `MCPServerConfig` in api.ts; `MCPManager.tsx`, `MCPAddServer.tsx`.

### Files to create:
```
src/domain/mcp/
├── types.ts          — MCPServerAggregate, ServerStatus VO, ServerUrl VO
├── events.ts         — ServerAdded, ServerRemoved, ServerStatusChanged, ServerEnabled
├── service.ts        — MCPApplicationService
├── repository.ts     — IMCPRepository
├── store.ts          — Thin Zustand store
├── index.ts
└── mcp.test.ts       — ≥10 tests
```

### Key types:
```typescript
export type ServerId = string & { readonly _brand: 'ServerId' };

export type ServerTransport = 'stdio' | 'sse';
export type ServerStatusValue = 'connected' | 'disconnected' | 'error' | 'pending';

// Value Object: ServerUrl validates transport-appropriate format
export class ServerUrl {
  private constructor(readonly value: string, readonly transport: ServerTransport) {}
  static create(url: string, transport: ServerTransport): ServerUrl {
    if (transport === 'sse' && !url.startsWith('http')) throw new Error('SSE URLs must start with http');
    return new ServerUrl(url, transport);
  }
}

export class MCPServerAggregate {
  private _status: ServerStatusValue = 'pending';
  private _events: DomainEvent[] = [];

  private constructor(
    readonly id: ServerId,
    readonly name: string,
    readonly transport: ServerTransport,
    private _url: ServerUrl,
    private _enabled: boolean = true,
  ) {}

  static create(raw: RawMCPServer): MCPServerAggregate { ... }

  setStatus(status: ServerStatusValue): void {
    if (status === this._status) return;
    const prev = this._status;
    this._status = status;
    this._events.push(new ServerStatusChangedEvent(this.id, prev, status));
  }

  disable(): void { this._enabled = false; }
  enable(): void { this._enabled = true; }
  get status(): ServerStatusValue { return this._status; }
  get isConnected(): boolean { return this._status === 'connected'; }
}
```

---

## Cross-Domain Event Bus

All 5 domains dispatch through a shared event bus, enabling loose coupling:

```typescript
// src/domain/shared/event-bus.ts
export interface DomainEvent {
  readonly type: string;
  readonly occurredAt: number;
  readonly aggregateId: string;
}

export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => void | Promise<void>;

export class DomainEventBus {
  private handlers = new Map<string, EventHandler[]>();

  on<T extends DomainEvent>(type: string, handler: EventHandler<T>): () => void {
    const existing = this.handlers.get(type) ?? [];
    this.handlers.set(type, [...existing, handler as EventHandler]);
    return () => { this.off(type, handler as EventHandler); };
  }

  dispatch(events: ReadonlyArray<DomainEvent>): void {
    for (const event of events) {
      const handlers = this.handlers.get(event.type) ?? [];
      for (const h of handlers) void h(event);
    }
  }

  private off(type: string, handler: EventHandler): void { ... }
}

export const globalEventBus = new DomainEventBus();
```

---

## Shared Kernel

```
src/domain/shared/
├── event-bus.ts     — DomainEventBus, DomainEvent interface
├── result.ts        — Result<T, E> monad (Ok/Err)
├── repository.ts    — IRepository<T> base interface
└── index.ts
```

The `Result<T, E>` monad replaces string errors across all domain operations:
```typescript
export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };
export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

---

## Implementation Order

### Sprint 1 (DDD v9): `shared` kernel + `ruflo` aggregate upgrade
- `src/domain/shared/` — event-bus, result, repository base
- Convert `RuFloSwarm` → `RuFloSwarmAggregate` class with factory + events
- Typed domain events raised from within aggregate
- Application service separating domain from UI state
- **Target**: ruflo → 5/5

### Sprint 2 (DDD v10): `session` + `project` domains
- `src/domain/session/` — full 5/5
- `src/domain/project/` — full 5/5
- Migrate `sessionStore.ts` to delegate to domain stores
- **Target**: session + project → 5/5

### Sprint 3 (DDD v11): `agent` + `mcp` domains
- `src/domain/agent/` — full 5/5
- `src/domain/mcp/` — full 5/5
- Migrate `agentStore.ts`, migrate `MCPManager` imports
- **Target**: agent + mcp → 5/5

---

## Out of Scope

- Analytics / observability (infrastructure concern, not domain)
- Hooks manager (cross-cutting, stays in `src/lib/`)
- UI component refactoring beyond import migration

---

## Test Requirements

- Each new domain: ≥10 vitest tests covering: factory invariants, VO validation, event emission, service orchestration, in-memory repo
- Rust domain: `cargo test` must stay green (41+ tests)
- Total target: ≥100 vitest tests after Sprint 3

---

## Dependencies

- None — each sprint is additive, no breaking changes to existing behavior
- Existing components continue working via stores; domain migration is behind stores
- `src/lib/api.ts` remains untouched — domain services call it internally
