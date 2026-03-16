import { CheckCircle, XCircle, Clock } from 'lucide-react';

interface TaskNotificationProps {
  taskId: string;
  status: string;
  summary: string;
  result?: string;
  usage?: { totalTokens?: number; toolUses?: number; durationMs?: number };
}

export function TaskNotificationWidget({ taskId, status, summary, result, usage }: TaskNotificationProps) {
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';
  const StatusIcon = isCompleted ? CheckCircle : isFailed ? XCircle : Clock;
  const statusColor = isCompleted ? 'var(--color-success)' : isFailed ? 'var(--color-error)' : 'var(--color-warning)';

  return (
    <div className="rounded-lg my-2 overflow-hidden" style={{ border: '1px solid var(--color-border-subtle)', backgroundColor: 'var(--color-void-raised)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
        <StatusIcon className="h-4 w-4 flex-shrink-0" style={{ color: statusColor }} />
        <span className="text-sm font-medium flex-1">{summary}</span>
        <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
          {taskId.slice(0, 8)}
        </span>
      </div>

      {/* Result preview */}
      {result && (
        <div className="px-3 py-2 text-xs max-h-32 overflow-y-auto" style={{ color: 'var(--color-text-secondary)' }}>
          {result.length > 300 ? result.slice(0, 300) + '...' : result}
        </div>
      )}

      {/* Usage stats */}
      {usage && (
        <div className="flex items-center gap-3 px-3 py-1.5 text-[10px]" style={{ color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border-subtle)' }}>
          {usage.totalTokens && <span>{(usage.totalTokens / 1000).toFixed(1)}k tokens</span>}
          {usage.toolUses && <span>{usage.toolUses} tool calls</span>}
          {usage.durationMs && <span>{(usage.durationMs / 1000).toFixed(1)}s</span>}
        </div>
      )}
    </div>
  );
}
