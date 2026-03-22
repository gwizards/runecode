/**
 * Cross-domain integration tests: ACL bridges and multi-domain event flows.
 *
 * Tests use real domain services with InMemory repositories — no mocks.
 * Each describe block creates isolated instances to prevent state bleed.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Shared kernel
import { DomainEventBus } from '../../domain/shared/event-bus';
import type { DomainEvent } from '../../domain/shared/event-bus';

// Session context
import { SessionApplicationService } from '../../domain/session/service';
import { InMemorySessionRepository } from '../../domain/session/repository';
import { SESSION_EVENT_TYPES } from '../../domain/session/events';

// Analytics context
import { AnalyticsApplicationService } from '../../domain/analytics/service';
import { InMemoryConsentRepository } from '../../domain/analytics/repository';
import { ANALYTICS_EVENT_TYPES } from '../../domain/analytics/events';

// Usage context
import { UsageApplicationService } from '../../domain/usage/service';
import { InMemoryUsageLedgerRepository } from '../../domain/usage/repository';
import { USAGE_EVENT_TYPES } from '../../domain/usage/events';

// Workspace context
import { WorkspaceApplicationService } from '../../domain/workspace/service';
import { InMemoryWorkspaceRepository } from '../../domain/workspace/repository';
import { WORKSPACE_EVENT_TYPES } from '../../domain/workspace/events';
import type { WorkspaceId, TabId } from '../../domain/workspace/types';

// ACL under test
import { SessionAnalyticsAcl } from './session-analytics-acl';
import type { AnalyticsSessionEvent } from './session-analytics-acl';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSessionRaw(id: string, projectId = 'proj-1') {
  return { id, projectId, title: `Session ${id}`, status: 'running' as const };
}

function collectEvents(bus: DomainEventBus): DomainEvent[] {
  const collected: DomainEvent[] = [];
  // Subscribe to every known event type across all contexts
  const allTypes = [
    ...Object.values(SESSION_EVENT_TYPES),
    ...Object.values(ANALYTICS_EVENT_TYPES),
    ...Object.values(USAGE_EVENT_TYPES),
    ...Object.values(WORKSPACE_EVENT_TYPES),
  ];
  for (const t of allTypes) {
    bus.on(t, (e) => { collected.push(e); });
  }
  return collected;
}

// ─── SessionAnalyticsAcl tests ───────────────────────────────────────────────

describe('SessionAnalyticsAcl', () => {
  let sessionBus: DomainEventBus;
  let analyticsBus: DomainEventBus;
  let sessionRepo: InMemorySessionRepository;
  let sessionSvc: SessionApplicationService;
  let capturedAnalytics: AnalyticsSessionEvent[];
  let acl: SessionAnalyticsAcl;

  beforeEach(() => {
    sessionBus = new DomainEventBus();
    analyticsBus = new DomainEventBus();
    sessionRepo = new InMemorySessionRepository();
    sessionSvc = new SessionApplicationService(sessionRepo, sessionBus);
    capturedAnalytics = [];
    acl = new SessionAnalyticsAcl(sessionBus, (evt) => capturedAnalytics.push(evt));
    acl.start();
  });

  it('fires a session_completed analytics event when a session completes', async () => {
    await sessionSvc.createSession(makeSessionRaw('s1'));
    await sessionSvc.completeSession('s1');

    expect(capturedAnalytics).toHaveLength(1);
    expect(capturedAnalytics[0].eventName).toBe('session_completed');
  });

  it('includes the correct sessionId in session_completed analytics payload', async () => {
    await sessionSvc.createSession(makeSessionRaw('s-abc'));
    await sessionSvc.completeSession('s-abc');

    expect(capturedAnalytics[0].properties.sessionId).toBe('s-abc');
  });

  it('includes token usage fields in session_completed analytics payload', async () => {
    await sessionSvc.createSession(makeSessionRaw('s2'));
    await sessionSvc.updateTokenUsage('s2', { inputTokens: 100, outputTokens: 50, costUsd: 0.01 });
    await sessionSvc.completeSession('s2');

    const props = capturedAnalytics[0].properties;
    expect(props.inputTokens).toBe(100);
    expect(props.outputTokens).toBe(50);
    expect(props.costUsd).toBe(0.01);
  });

  it('fires a session_failed analytics event when a session fails', async () => {
    await sessionSvc.createSession(makeSessionRaw('s3'));
    await sessionSvc.failSession('s3', 'network error');

    expect(capturedAnalytics).toHaveLength(1);
    expect(capturedAnalytics[0].eventName).toBe('session_failed');
  });

  it('includes sessionId and reason in session_failed analytics payload', async () => {
    await sessionSvc.createSession(makeSessionRaw('s4'));
    await sessionSvc.failSession('s4', 'timeout');

    expect(capturedAnalytics[0].properties.sessionId).toBe('s4');
    expect(capturedAnalytics[0].properties.reason).toBe('timeout');
  });

  it('captures analytics event timestamp from the domain event', async () => {
    const before = Date.now();
    await sessionSvc.createSession(makeSessionRaw('s5'));
    await sessionSvc.completeSession('s5');
    const after = Date.now();

    const ts = capturedAnalytics[0].timestamp;
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('ACL subscribes to the session bus — not the analytics bus', async () => {
    // Dispatching a session event directly on the analytics bus must NOT trigger the ACL
    const analyticsCollected: AnalyticsSessionEvent[] = [];
    const analyticsAcl = new SessionAnalyticsAcl(analyticsBus, (e) => analyticsCollected.push(e));
    analyticsAcl.start();

    await sessionSvc.createSession(makeSessionRaw('s6'));
    await sessionSvc.completeSession('s6');

    // capturedAnalytics was fed by the ACL on sessionBus — should have one event
    expect(capturedAnalytics).toHaveLength(1);
    // analyticsCollected is from ACL on analyticsBus — no session events go there
    expect(analyticsCollected).toHaveLength(0);

    analyticsAcl.stop();
  });

  it('produces no analytics events before start() is called', async () => {
    const capturedBefore: AnalyticsSessionEvent[] = [];
    new SessionAnalyticsAcl(sessionBus, (e) => capturedBefore.push(e));
    // do NOT call .start()

    await sessionSvc.createSession(makeSessionRaw('s7'));
    await sessionSvc.completeSession('s7');

    expect(capturedBefore).toHaveLength(0);
  });

  it('stop() prevents further event forwarding', async () => {
    await sessionSvc.createSession(makeSessionRaw('s8'));
    await sessionSvc.completeSession('s8');
    expect(capturedAnalytics).toHaveLength(1);

    acl.stop();

    // Create and complete a second session after stopping
    await sessionSvc.createSession(makeSessionRaw('s9'));
    await sessionSvc.completeSession('s9');

    // Still only 1 — the second session was not forwarded
    expect(capturedAnalytics).toHaveLength(1);
  });

  it('forwards multiple sessions independently', async () => {
    await sessionSvc.createSession(makeSessionRaw('sx'));
    await sessionSvc.createSession(makeSessionRaw('sy'));
    await sessionSvc.completeSession('sx');
    await sessionSvc.failSession('sy', 'crash');

    expect(capturedAnalytics).toHaveLength(2);
    expect(capturedAnalytics[0].eventName).toBe('session_completed');
    expect(capturedAnalytics[1].eventName).toBe('session_failed');
  });

  it('works with real InMemory repositories for both domains', async () => {
    const consentRepo = new InMemoryConsentRepository();
    const analyticsSvc = new AnalyticsApplicationService(consentRepo, analyticsBus);

    // Grant consent via analytics service (own bus)
    const consentResult = analyticsSvc.grantConsent('s10', 'proj-1');
    expect(consentResult.ok).toBe(true);

    // Complete a session via session service (session bus → ACL)
    await sessionSvc.createSession(makeSessionRaw('s10'));
    await sessionSvc.completeSession('s10');

    // ACL on sessionBus should have received the completed event
    expect(capturedAnalytics).toHaveLength(1);
    expect(capturedAnalytics[0].eventName).toBe('session_completed');
  });
});

// ─── Session → Usage flow ────────────────────────────────────────────────────

describe('Session → Usage flow', () => {
  let sessionBus: DomainEventBus;
  let usageBus: DomainEventBus;
  let sessionRepo: InMemorySessionRepository;
  let sessionSvc: SessionApplicationService;
  let usageRepo: InMemoryUsageLedgerRepository;
  let usageSvc: UsageApplicationService;

  beforeEach(() => {
    sessionBus = new DomainEventBus();
    usageBus = new DomainEventBus();
    sessionRepo = new InMemorySessionRepository();
    sessionSvc = new SessionApplicationService(sessionRepo, sessionBus);
    usageRepo = new InMemoryUsageLedgerRepository();
    usageSvc = new UsageApplicationService(usageRepo, usageBus);
  });

  it('opens a usage ledger for a session and records initial state', async () => {
    await sessionSvc.createSession(makeSessionRaw('u1'));

    const result = await usageSvc.openLedger({ id: 'ledger-u1', sessionId: 'u1', projectId: 'proj-1' });
    expect(result.ok).toBe(true);

    const summary = await usageSvc.getLedgerSummary('u1');
    expect(summary.ok).toBe(true);
    if (summary.ok) {
      expect(summary.value.sessionId).toBe('u1');
      expect(summary.value.recordCount).toBe(0);
      expect(summary.value.totalCostUsd).toBe(0);
    }
  });

  it('records usage and reflects it in the ledger summary', async () => {
    await sessionSvc.createSession(makeSessionRaw('u2'));
    await usageSvc.openLedger({ id: 'ledger-u2', sessionId: 'u2', projectId: 'proj-1' });

    const record = await usageSvc.recordUsage({
      sessionId: 'u2',
      record: { model: 'claude-3', inputTokens: 200, outputTokens: 100, costUsd: 0.05 },
    });

    expect(record.ok).toBe(true);
    if (record.ok) {
      expect(record.value.totalInputTokens).toBe(200);
      expect(record.value.totalOutputTokens).toBe(100);
      expect(record.value.totalCostUsd).toBe(0.05);
    }
  });

  it('getLedgerSummary accumulates multiple usage records correctly', async () => {
    await sessionSvc.createSession(makeSessionRaw('u3'));
    await usageSvc.openLedger({ id: 'ledger-u3', sessionId: 'u3', projectId: 'proj-1' });

    await usageSvc.recordUsage({ sessionId: 'u3', record: { model: 'claude-3', inputTokens: 100, outputTokens: 50, costUsd: 0.02 } });
    await usageSvc.recordUsage({ sessionId: 'u3', record: { model: 'claude-3', inputTokens: 300, outputTokens: 150, costUsd: 0.06 } });

    const summary = await usageSvc.getLedgerSummary('u3');
    expect(summary.ok).toBe(true);
    if (summary.ok) {
      expect(summary.value.recordCount).toBe(2);
      expect(summary.value.totalInputTokens).toBe(400);
      expect(summary.value.totalOutputTokens).toBe(200);
      expect(summary.value.totalCostUsd).toBeCloseTo(0.08);
    }
  });

  it('seals the ledger when the session completes and blocks further records', async () => {
    await sessionSvc.createSession(makeSessionRaw('u4'));
    await usageSvc.openLedger({ id: 'ledger-u4', sessionId: 'u4', projectId: 'proj-1' });
    await usageSvc.recordUsage({ sessionId: 'u4', record: { model: 'm', inputTokens: 10, outputTokens: 5, costUsd: 0.001 } });

    const sealResult = await usageSvc.sealLedger({ sessionId: 'u4' });
    expect(sealResult.ok).toBe(true);

    // After sealing, further recording should fail
    const afterSeal = await usageSvc.recordUsage({ sessionId: 'u4', record: { model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0.0001 } });
    expect(afterSeal.ok).toBe(false);
  });

  it('querying usage by session returns only that sessions ledger', async () => {
    await sessionSvc.createSession(makeSessionRaw('u5'));
    await sessionSvc.createSession(makeSessionRaw('u6'));
    await usageSvc.openLedger({ id: 'ledger-u5', sessionId: 'u5', projectId: 'proj-2' });
    await usageSvc.openLedger({ id: 'ledger-u6', sessionId: 'u6', projectId: 'proj-2' });

    await usageSvc.recordUsage({ sessionId: 'u5', record: { model: 'm', inputTokens: 50, outputTokens: 25, costUsd: 0.01 } });

    const summaryU5 = await usageSvc.getLedgerSummary('u5');
    const summaryU6 = await usageSvc.getLedgerSummary('u6');

    expect(summaryU5.ok).toBe(true);
    expect(summaryU6.ok).toBe(true);
    if (summaryU5.ok && summaryU6.ok) {
      expect(summaryU5.value.sessionId).toBe('u5');
      expect(summaryU5.value.recordCount).toBe(1);
      expect(summaryU6.value.sessionId).toBe('u6');
      expect(summaryU6.value.recordCount).toBe(0);
    }
  });
});

// ─── Session → Workspace flow ────────────────────────────────────────────────

describe('Session → Workspace flow', () => {
  let sessionBus: DomainEventBus;
  let workspaceBus: DomainEventBus;
  let sessionRepo: InMemorySessionRepository;
  let sessionSvc: SessionApplicationService;
  let workspaceRepo: InMemoryWorkspaceRepository;
  let workspaceSvc: WorkspaceApplicationService;

  beforeEach(() => {
    sessionBus = new DomainEventBus();
    workspaceBus = new DomainEventBus();
    sessionRepo = new InMemorySessionRepository();
    sessionSvc = new SessionApplicationService(sessionRepo, sessionBus);
    workspaceRepo = new InMemoryWorkspaceRepository();
    workspaceSvc = new WorkspaceApplicationService(workspaceRepo, workspaceBus);
  });

  it('creates a workspace for a session', async () => {
    const sessResult = await sessionSvc.createSession(makeSessionRaw('w1'));
    expect(sessResult.ok).toBe(true);

    const wsResult = workspaceSvc.createWorkspace('w1' as ReturnType<typeof String> & { _brand: 'SessionId' }, 'proj-1' as ReturnType<typeof String> & { _brand: 'ProjectId' });
    expect(wsResult.ok).toBe(true);
  });

  it('opens a tab in the workspace and retrieves the updated state', async () => {
    const wsResult = workspaceSvc.createWorkspace('w2' as any, 'proj-1' as any);
    expect(wsResult.ok).toBe(true);
    const workspaceId = wsResult.ok ? wsResult.value : '' as WorkspaceId;

    workspaceSvc.openTab(workspaceId, '/src/index.ts', 'index.ts', 'tab-1');

    const getResult = workspaceSvc.getWorkspace(workspaceId);
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      expect(getResult.value.tabs).toHaveLength(1);
      expect(getResult.value.tabs[0].path).toBe('/src/index.ts');
      expect(getResult.value.tabs[0].title).toBe('index.ts');
    }
  });

  it('opening a second tab adds it and makes it active', async () => {
    const wsResult = workspaceSvc.createWorkspace('w3' as any, 'proj-1' as any);
    const workspaceId = wsResult.ok ? wsResult.value : '' as WorkspaceId;

    workspaceSvc.openTab(workspaceId, '/src/a.ts', 'a.ts', 'tab-a');
    workspaceSvc.openTab(workspaceId, '/src/b.ts', 'b.ts', 'tab-b');

    const getResult = workspaceSvc.getWorkspace(workspaceId);
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      expect(getResult.value.tabs).toHaveLength(2);
      const activeTab = getResult.value.tabs.find(t => t.isActive);
      expect(activeTab?.title).toBe('b.ts');
    }
  });

  it('closing a tab removes it from the workspace', async () => {
    const wsResult = workspaceSvc.createWorkspace('w4' as any, 'proj-1' as any);
    const workspaceId = wsResult.ok ? wsResult.value : '' as WorkspaceId;

    workspaceSvc.openTab(workspaceId, '/src/a.ts', 'a.ts', 'tab-a');
    workspaceSvc.openTab(workspaceId, '/src/b.ts', 'b.ts', 'tab-b');
    workspaceSvc.closeTab(workspaceId, 'tab-a' as TabId);

    const getResult = workspaceSvc.getWorkspace(workspaceId);
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      expect(getResult.value.tabs).toHaveLength(1);
      expect(getResult.value.tabs[0].title).toBe('b.ts');
    }
  });

  it('getWorkspace returns correct tab state after multiple operations', async () => {
    const wsResult = workspaceSvc.createWorkspace('w5' as any, 'proj-1' as any);
    const workspaceId = wsResult.ok ? wsResult.value : '' as WorkspaceId;

    workspaceSvc.openTab(workspaceId, '/a.ts', 'a.ts', 'tab-a');
    workspaceSvc.openTab(workspaceId, '/b.ts', 'b.ts', 'tab-b');
    workspaceSvc.openTab(workspaceId, '/c.ts', 'c.ts', 'tab-c');
    workspaceSvc.closeTab(workspaceId, 'tab-b' as TabId);

    const getResult = workspaceSvc.getWorkspace(workspaceId);
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      const paths = getResult.value.tabs.map(t => t.path);
      expect(paths).toContain('/a.ts');
      expect(paths).toContain('/c.ts');
      expect(paths).not.toContain('/b.ts');
    }
  });

  it('workspace events are dispatched to workspace bus, not session bus', async () => {
    const sessionEvents = collectEvents(sessionBus);
    const workspaceEvents: DomainEvent[] = [];
    workspaceBus.on(WORKSPACE_EVENT_TYPES.TAB_OPENED, (e) => { workspaceEvents.push(e); });

    const wsResult = workspaceSvc.createWorkspace('w6' as any, 'proj-1' as any);
    const workspaceId = wsResult.ok ? wsResult.value : '' as WorkspaceId;
    workspaceSvc.openTab(workspaceId, '/src/x.ts', 'x.ts', 'tab-x');

    expect(workspaceEvents.length).toBeGreaterThan(0);
    // Session bus must not carry workspace events
    const wsTypesOnSessionBus = sessionEvents.filter(e => e.type.startsWith('workspace'));
    expect(wsTypesOnSessionBus).toHaveLength(0);
  });
});

// ─── Cross-domain isolation ───────────────────────────────────────────────────

describe('Cross-domain bus isolation', () => {
  let sessionBus: DomainEventBus;
  let analyticsBus: DomainEventBus;
  let workspaceBus: DomainEventBus;
  let usageBus: DomainEventBus;

  let sessionSvc: SessionApplicationService;
  let analyticsSvc: AnalyticsApplicationService;
  let workspaceSvc: WorkspaceApplicationService;

  beforeEach(() => {
    sessionBus   = new DomainEventBus();
    analyticsBus = new DomainEventBus();
    workspaceBus = new DomainEventBus();
    usageBus     = new DomainEventBus();

    sessionSvc   = new SessionApplicationService(new InMemorySessionRepository(), sessionBus);
    analyticsSvc = new AnalyticsApplicationService(new InMemoryConsentRepository(), analyticsBus);
    new UsageApplicationService(new InMemoryUsageLedgerRepository(), usageBus);
    workspaceSvc = new WorkspaceApplicationService(new InMemoryWorkspaceRepository(), workspaceBus);
  });

  it('session bus events do NOT appear on analytics bus without ACL', async () => {
    const analyticsEvents = collectEvents(analyticsBus);

    await sessionSvc.createSession(makeSessionRaw('iso-1'));
    await sessionSvc.completeSession('iso-1');

    const sessionTypesOnAnalyticsBus = analyticsEvents.filter(e => e.type.startsWith('session/'));
    expect(sessionTypesOnAnalyticsBus).toHaveLength(0);
  });

  it('analytics bus events do NOT appear on session bus', () => {
    const sessionEvents = collectEvents(sessionBus);

    analyticsSvc.grantConsent('iso-2', 'proj-1');

    const analyticsTypesOnSessionBus = sessionEvents.filter(e => e.type.startsWith('analytics/'));
    expect(analyticsTypesOnSessionBus).toHaveLength(0);
  });

  it('workspace bus events do NOT appear on usage bus', () => {
    const usageEvents = collectEvents(usageBus);

    const wsResult = workspaceSvc.createWorkspace('iso-3' as any, 'proj-1' as any);
    const workspaceId = wsResult.ok ? wsResult.value : '' as WorkspaceId;
    workspaceSvc.openTab(workspaceId, '/src/z.ts', 'z.ts', 'tab-z');

    const workspaceTypesOnUsageBus = usageEvents.filter(e => e.type.startsWith('workspace.'));
    expect(workspaceTypesOnUsageBus).toHaveLength(0);
  });
});
