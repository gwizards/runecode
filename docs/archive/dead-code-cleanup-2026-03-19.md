# Dead Code Cleanup — March 19, 2026

## Removed Components (~3,400 lines)

### Unused Sidebar Components (removed)
| File | Lines | Reason |
|------|-------|--------|
| sidebar/AccountSelector.tsx | 156 | Replaced by EnvironmentSelector |
| sidebar/ActiveSessions.tsx | 73 | Removed from sidebar, tabs visible in tab bar |
| sidebar/AgentsSection.tsx | 169 | Moved to Settings |
| sidebar/LocalModelSection.tsx | 92 | Settings feature, never wired to sidebar |
| sidebar/MCPServersSection.tsx | 177 | Moved to Settings |
| sidebar/PluginsSection.tsx | 175 | Plugin discovery issues, moved to Settings |
| sidebar/ProjectProcesses.tsx | 102 | Replaced by ActiveSessions then removed |
| sidebar/SkillsCatalogSection.tsx | 180 | Depends on plugins, moved to Settings |
| sidebar/UsageStatsSection.tsx | 621 | Replaced by PlanUsagePanel |

### Unused Settings Components (removed)
| File | Lines | Reason |
|------|-------|--------|
| settings/AccountsSettings.tsx | 409 | Replaced by EnvironmentsSettings |
| settings/AdvancedSettings.tsx | 44 | Never wired to Settings.tsx |
| settings/BinarySettings.tsx | 23 | Installation section removed (SDK-based, not CLI) |

### Alternate/Backup Versions (removed)
| File | Lines | Reason |
|------|-------|--------|
| FilePicker.optimized.tsx | 418 | Never used, FilePicker.tsx is the active version |
| SessionList.optimized.tsx | 208 | Never used, larger than original |
| ToolWidgets.new.tsx | 3 | Duplicate barrel export of ToolWidgets.tsx |
| UsageDashboard.original.tsx | 493 | Old version, UsageDashboard.tsx is current |

### Unused Integrations (removed)
| File | Lines | Reason |
|------|-------|--------|
| integrations/intelligence/GatewayRecommendation.tsx | 67 | Partner Stack removed |
| integrations/observability/HeliconeToggle.tsx | 62 | Never imported |

### Demo Components (removed)
| File | Lines | Reason |
|------|-------|--------|
| AgentExecutionDemo.tsx | 180 | Demo only, never used in production |

## Unused API Methods (removed from api.ts)
- getClaudeBinaryPath() — Installation section removed
- getLiveSessionOutput() — Replaced by WebSocket streaming
- openNewSession() — Tab system handles this
- slashCommandGet() — Never called
- trackCheckpointMessage() — Never called
- validateHookCommand() — Never called

## Notes
- WebviewPreview.tsx kept (366 lines) — iframe placeholder, may be implemented with Tauri webview later
- TODOs (121 instances) kept — tracked in code, not dead code
- index.ts barrel exports cleaned to remove references to deleted files
