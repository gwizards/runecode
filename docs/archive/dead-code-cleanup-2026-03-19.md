# Dead Code Cleanup — March 19, 2026

## Pass 1: Initial cleanup (~3,000 lines)

### Unused Sidebar Components
| File | Lines | Reason |
|------|-------|--------|
| sidebar/AccountSelector.tsx | 156 | Replaced by EnvironmentSelector |
| sidebar/ActiveSessions.tsx | 73 | Tabs visible in tab bar |
| sidebar/AgentsSection.tsx | 169 | Moved to Settings |
| sidebar/LocalModelSection.tsx | 92 | Never wired |
| sidebar/MCPServersSection.tsx | 177 | Moved to Settings |
| sidebar/PluginsSection.tsx | 175 | Plugin discovery issues |
| sidebar/ProjectProcesses.tsx | 102 | Replaced |
| sidebar/SkillsCatalogSection.tsx | 180 | Depends on plugins |
| sidebar/UsageStatsSection.tsx | 621 | Replaced by PlanUsagePanel |

### Unused Settings Components
| File | Lines | Reason |
|------|-------|--------|
| settings/AccountsSettings.tsx | 409 | Replaced by EnvironmentsSettings |
| settings/AdvancedSettings.tsx | 44 | Never wired |
| settings/BinarySettings.tsx | 23 | Installation removed |

### Alternate Versions
| File | Lines | Reason |
|------|-------|--------|
| FilePicker.optimized.tsx | 418 | Never used |
| SessionList.optimized.tsx | 208 | Never used |
| ToolWidgets.new.tsx | 3 | Duplicate |
| UsageDashboard.original.tsx | 493 | Old version |

### Integrations + Demo
| File | Lines | Reason |
|------|-------|--------|
| GatewayRecommendation.tsx | 67 | Partner Stack removed |
| HeliconeToggle.tsx | 62 | Never imported |
| AgentExecutionDemo.tsx | 180 | Demo only |

---

## Pass 2: Deep cleanup (~4,500 lines)

### Orphan Components (never imported)
| File | Lines | Reason |
|------|-------|--------|
| AgentRunView.tsx | 378 | Old agent run viewer, replaced by AgentExecution |
| AnalyticsConsent.tsx | 235 | Analytics consent dialog, never shown |
| CustomTitlebar.tsx | 112 | Replaced by native OS decorations |
| NFOCredits.tsx | 298 | Easter egg / credits screen, never triggered |
| PreviewPromptDialog.tsx | 112 | Preview dialog, never used |
| ReasoningSelector.tsx | 43 | Thinking mode selector, replaced by ConfigPill |
| ScrollToBottomButton.tsx | 31 | Replaced by lock/unlock scroll system |
| SessionOutputViewer.tsx | 690 | Old session viewer, replaced by ClaudeCodeSession |
| TimelineNavigator.tsx | 633 | Timeline UI, import removed, never rendered |
| TokenCounter.tsx | 53 | Token display, replaced by PlanUsagePanel |
| Topbar.tsx | 173 | Old top bar, commented out in App.tsx |

### Dead Subdirectory: claude-code-session/
| File | Lines | Reason |
|------|-------|--------|
| MessageList.tsx | 154 | Refactored session component, never used |
| PromptQueue.tsx | 83 | Queue UI, integrated into ClaudeCodeSession |
| SessionHeader.tsx | 174 | Header component, integrated into ClaudeCodeSession |
| useCheckpoints.ts | 121 | Checkpoint hook, integrated into ClaudeCodeSession |
| useClaudeMessages.ts | 180 | Message hook, integrated into ClaudeCodeSession |

### Dead Libraries
| File | Lines | Reason |
|------|-------|--------|
| lib/accountManager.ts | 274 | Multi-account system disabled |
| lib/api-tracker.ts | 115 | API call tracker, never used |
| lib/localModelManager.ts | 325 | Local AI model manager, never wired |

### Dead Sidebar
| File | Lines | Reason |
|------|-------|--------|
| sidebar/SessionStatsSection.tsx | 120 | Never wired to sidebar |

### Components in Commented-Out Code Only
| File | Lines | Where Referenced |
|------|-------|------------------|
| AgentRunsList.tsx | 201 | Comment in CCAgents.tsx |
| AgentsModal.tsx | 280 | Commented-out code in App.tsx |

---

## Notes
- WebviewPreview.tsx kept — may be implemented with Tauri webview
- CheckpointSettings.tsx kept — actively used in ClaudeCodeSession
- RunningClaudeSessions.tsx kept — used by outputCache and sidebar
- All widget files (widgets/*.tsx) kept — imported via StreamMessage.tsx
