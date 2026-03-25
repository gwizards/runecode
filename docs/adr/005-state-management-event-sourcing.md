# ADR-005: State Management and Event Sourcing

## Status: Accepted (2026-03-25)

## Context
RuneCode has 10 DDD bounded contexts that need state management with cross-context communication without tight coupling.

## Decision
1. **Per-context Zustand stores**: Each bounded context owns its Zustand store (e.g., `ruflo/store.ts`, `usage/store.ts`)
2. **Domain Event Bus**: `globalEventBus` in shared kernel for cross-context communication
3. **Result<T> monad**: All domain factories return `Result<T>`, never throw
4. **Port injection**: Stores use setter functions (`setXxxPort()`) for infrastructure dependencies, injected at app bootstrap in `App.tsx`
5. **TanStack Query**: Used for server-state caching in components (`useQuery` with `refetchInterval`)
6. **Value Objects**: All domain IDs are branded VOs (SessionId, ProjectId, AgentId, etc.) — not raw strings
7. **Shared kernel shims**: Cross-context type references go through `domain/shared/` re-export files

## Consequences
- Zero domain->infrastructure imports (verified by audit)
- Stores can be tested without Tauri/infrastructure
- Event bus enables loose coupling between contexts
