import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { api, type UsageStats, type ProjectUsage } from "@/lib/api";
import {
  Filter,
  Loader2,
  Briefcase,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { UsageSummary } from "@/components/usage/UsageSummary";
import { UsageCharts } from "@/components/usage/UsageCharts";

interface UsageDashboardProps {
  onBack: () => void;
}

const dataCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_DURATION = 10 * 60 * 1000;

export const UsageDashboard: React.FC<UsageDashboardProps> = ({ }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [sessionStats, setSessionStats] = useState<ProjectUsage[] | null>(null);
  const [selectedDateRange, setSelectedDateRange] = useState<"all" | "7d" | "30d">("7d");
  const [activeTab, setActiveTab] = useState("overview");
  const [hasLoadedTabs, setHasLoadedTabs] = useState<Set<string>>(new Set(["overview"]));

  const [projectsPage, setProjectsPage] = useState(1);
  const [sessionsPage, setSessionsPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const formatCurrency = useMemo(() => (amount: number): string => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  }, []);

  const formatNumber = useMemo(() => (num: number): string => {
    return new Intl.NumberFormat('en-US').format(num);
  }, []);

  const formatTokens = useMemo(() => (num: number): string => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    else if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return formatNumber(num);
  }, [formatNumber]);

  const getModelDisplayName = useCallback((model: string): string => {
    const modelMap: Record<string, string> = { "claude-4-opus": "Opus 4", "claude-4-sonnet": "Sonnet 4", "claude-3.5-sonnet": "Sonnet 3.5", "claude-3-opus": "Opus 3" };
    return modelMap[model] || model;
  }, []);

  const getCachedData = useCallback((key: string) => {
    const cached = dataCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) return cached.data;
    return null;
  }, []);

  const setCachedData = useCallback((key: string, data: unknown) => {
    dataCache.set(key, { data, timestamp: Date.now() });
  }, []);

  const loadUsageStats = useCallback(async () => {
    const cacheKey = `usage-${selectedDateRange}`;
    const cachedStats = getCachedData(`${cacheKey}-stats`) as UsageStats | null;
    const cachedSessions = getCachedData(`${cacheKey}-sessions`) as ProjectUsage[] | null;
    if (cachedStats && cachedSessions) { setStats(cachedStats); setSessionStats(cachedSessions); setLoading(false); return; }

    try {
      if (!stats && !sessionStats) setLoading(true);
      setError(null);
      let statsData: UsageStats;
      let sessionData: ProjectUsage[] = [];

      if (selectedDateRange === "all") {
        const [statsResult, sessionResult] = await Promise.all([api.getUsageStats(), api.getSessionStats()]);
        statsData = statsResult; sessionData = sessionResult;
      } else {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - (selectedDateRange === "7d" ? 7 : 30));
        const formatDateForApi = (date: Date) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
        const [statsResult, sessionResult] = await Promise.all([
          api.getUsageByDateRange(startDate.toISOString(), endDate.toISOString()),
          api.getSessionStats(formatDateForApi(startDate), formatDateForApi(endDate), 'desc')
        ]);
        statsData = statsResult; sessionData = sessionResult;
      }

      setStats(statsData); setSessionStats(sessionData);
      setCachedData(`${cacheKey}-stats`, statsData); setCachedData(`${cacheKey}-sessions`, sessionData);
    } catch (err: unknown) {
      console.error("Failed to load usage stats:", err);
      setError("Failed to load usage statistics. Please try again.");
    } finally { setLoading(false); }
  }, [selectedDateRange, getCachedData, setCachedData, stats, sessionStats]);

  useEffect(() => { setProjectsPage(1); setSessionsPage(1); loadUsageStats(); }, [loadUsageStats]);

  useEffect(() => {
    if (!stats || loading) return;
    const tabOrder = ["overview", "models", "projects", "sessions", "timeline"];
    const currentIndex = tabOrder.indexOf(activeTab);
    const schedulePreload = (callback: () => void) => { if ('requestIdleCallback' in window) { requestIdleCallback(callback, { timeout: 2000 }); } else { setTimeout(callback, 100); } };
    schedulePreload(() => {
      if (currentIndex > 0) setHasLoadedTabs(prev => new Set([...prev, tabOrder[currentIndex - 1]]));
      if (currentIndex < tabOrder.length - 1) setHasLoadedTabs(prev => new Set([...prev, tabOrder[currentIndex + 1]]));
    });
  }, [activeTab, stats, loading]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto flex flex-col h-full">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-heading-1">Usage Dashboard</h1>
              <p className="mt-1 text-body-small text-muted-foreground">Track your Claude Code usage and costs</p>
            </div>
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <div className="flex space-x-1">
                {(["7d", "30d", "all"] as const).map((range) => (
                  <Button key={range} variant={selectedDateRange === range ? "default" : "outline"} size="sm" onClick={() => setSelectedDateRange(range)} disabled={loading}>
                    {range === "all" ? "All Time" : range === "7d" ? "Last 7 Days" : "Last 30 Days"}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : error ? (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/50 text-body-small text-destructive">
              {error}<Button onClick={() => loadUsageStats()} size="sm" className="ml-4">Try Again</Button>
            </div>
          ) : stats ? (
            <div className="space-y-6">
              <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); setHasLoadedTabs(prev => new Set([...prev, value])); }} className="w-full">
                <TabsList className="grid grid-cols-5 w-full mb-6 h-auto p-1">
                  <TabsTrigger value="overview" className="py-2.5 px-3">Overview</TabsTrigger>
                  <TabsTrigger value="models" className="py-2.5 px-3">By Model</TabsTrigger>
                  <TabsTrigger value="projects" className="py-2.5 px-3">By Project</TabsTrigger>
                  <TabsTrigger value="sessions" className="py-2.5 px-3">By Session</TabsTrigger>
                  <TabsTrigger value="timeline" className="py-2.5 px-3">Timeline</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-6 mt-6">
                  <UsageSummary stats={stats} formatCurrency={formatCurrency} formatNumber={formatNumber} formatTokens={formatTokens} getModelDisplayName={getModelDisplayName} />
                </TabsContent>

                <TabsContent value="models" className="space-y-6 mt-6">
                  {hasLoadedTabs.has("models") && stats && (
                    <div style={{ display: activeTab === "models" ? "block" : "none" }}>
                      <Card className="p-6">
                        <h3 className="text-sm font-semibold mb-4">Usage by Model</h3>
                        <div className="space-y-4">
                          {stats.by_model.map((model) => (
                            <div key={model.model} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                  <Badge variant="outline" className="text-xs">{getModelDisplayName(model.model)}</Badge>
                                  <span className="text-sm text-muted-foreground">{model.session_count} sessions</span>
                                </div>
                                <span className="text-sm font-semibold">{formatCurrency(model.total_cost)}</span>
                              </div>
                              <div className="grid grid-cols-4 gap-2 text-xs">
                                <div><span className="text-muted-foreground">Input: </span><span className="font-medium">{formatTokens(model.input_tokens)}</span></div>
                                <div><span className="text-muted-foreground">Output: </span><span className="font-medium">{formatTokens(model.output_tokens)}</span></div>
                                <div><span className="text-muted-foreground">Cache W: </span><span className="font-medium">{formatTokens(model.cache_creation_tokens)}</span></div>
                                <div><span className="text-muted-foreground">Cache R: </span><span className="font-medium">{formatTokens(model.cache_read_tokens)}</span></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="projects" className="space-y-6 mt-6">
                  {hasLoadedTabs.has("projects") && stats && (
                    <div style={{ display: activeTab === "projects" ? "block" : "none" }}>
                      <Card className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-semibold">Usage by Project</h3>
                          <span className="text-xs text-muted-foreground">{stats.by_project.length} total projects</span>
                        </div>
                        <div className="space-y-3">
                          {(() => {
                            const startIndex = (projectsPage - 1) * ITEMS_PER_PAGE;
                            const endIndex = startIndex + ITEMS_PER_PAGE;
                            const paginatedProjects = stats.by_project.slice(startIndex, endIndex);
                            const totalPages = Math.ceil(stats.by_project.length / ITEMS_PER_PAGE);
                            return (<>
                              {paginatedProjects.map((project) => (
                                <div key={project.project_path} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                                  <div className="flex flex-col truncate">
                                    <span className="text-sm font-medium truncate" title={project.project_path}>{project.project_path}</span>
                                    <div className="flex items-center space-x-3 mt-1">
                                      <span className="text-caption text-muted-foreground">{project.session_count} sessions</span>
                                      <span className="text-caption text-muted-foreground">{formatTokens(project.total_tokens)} tokens</span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-semibold">{formatCurrency(project.total_cost)}</p>
                                    <p className="text-xs text-muted-foreground">{formatCurrency(project.total_cost / project.session_count)}/session</p>
                                  </div>
                                </div>
                              ))}
                              {totalPages > 1 && (
                                <div className="flex items-center justify-between pt-4">
                                  <span className="text-xs text-muted-foreground">Showing {startIndex + 1}-{Math.min(endIndex, stats.by_project.length)} of {stats.by_project.length}</span>
                                  <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setProjectsPage(prev => Math.max(1, prev - 1))} disabled={projectsPage === 1} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
                                    <span className="text-sm">Page {projectsPage} of {totalPages}</span>
                                    <Button variant="outline" size="sm" onClick={() => setProjectsPage(prev => Math.min(totalPages, prev + 1))} disabled={projectsPage === totalPages} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
                                  </div>
                                </div>
                              )}
                            </>);
                          })()}
                        </div>
                      </Card>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="sessions" className="space-y-6 mt-6">
                  {hasLoadedTabs.has("sessions") && (
                    <div style={{ display: activeTab === "sessions" ? "block" : "none" }}>
                      <Card className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-semibold">Usage by Session</h3>
                          {sessionStats && sessionStats.length > 0 && <span className="text-xs text-muted-foreground">{sessionStats.length} total sessions</span>}
                        </div>
                        <div className="space-y-3">
                          {sessionStats && sessionStats.length > 0 ? (() => {
                            const startIndex = (sessionsPage - 1) * ITEMS_PER_PAGE;
                            const endIndex = startIndex + ITEMS_PER_PAGE;
                            const paginatedSessions = sessionStats.slice(startIndex, endIndex);
                            const totalPages = Math.ceil(sessionStats.length / ITEMS_PER_PAGE);
                            return (<>
                              {paginatedSessions.map((session, index) => (
                                <div key={`${session.project_path}-${session.project_name}-${startIndex + index}`} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                                  <div className="flex flex-col">
                                    <div className="flex items-center space-x-2">
                                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                                      <span className="text-xs font-mono text-muted-foreground truncate max-w-[200px]" title={session.project_path}>{session.project_path.split('/').slice(-2).join('/')}</span>
                                    </div>
                                    <span className="text-sm font-medium mt-1">{session.project_name}</span>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-semibold">{formatCurrency(session.total_cost)}</p>
                                    <p className="text-xs text-muted-foreground">{session.last_used ? new Date(session.last_used).toLocaleDateString() : 'N/A'}</p>
                                  </div>
                                </div>
                              ))}
                              {totalPages > 1 && (
                                <div className="flex items-center justify-between pt-4">
                                  <span className="text-xs text-muted-foreground">Showing {startIndex + 1}-{Math.min(endIndex, sessionStats.length)} of {sessionStats.length}</span>
                                  <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setSessionsPage(prev => Math.max(1, prev - 1))} disabled={sessionsPage === 1} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
                                    <span className="text-sm">Page {sessionsPage} of {totalPages}</span>
                                    <Button variant="outline" size="sm" onClick={() => setSessionsPage(prev => Math.min(totalPages, prev + 1))} disabled={sessionsPage === totalPages} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
                                  </div>
                                </div>
                              )}
                            </>);
                          })() : (
                            <div className="text-center py-8 text-sm text-muted-foreground">No session data available for the selected period</div>
                          )}
                        </div>
                      </Card>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="timeline" className="space-y-6 mt-6">
                  {hasLoadedTabs.has("timeline") && stats && (
                    <div style={{ display: activeTab === "timeline" ? "block" : "none" }}>
                      <UsageCharts stats={stats} formatCurrency={formatCurrency} formatTokens={formatTokens} />
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
