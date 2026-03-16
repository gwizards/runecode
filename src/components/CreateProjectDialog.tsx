import React, { useState } from 'react';
import { FolderOpen, Plus } from 'lucide-react';
import { api } from '@/lib/api';

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onProjectCreated: (projectPath: string, projectName: string) => void;
}

export function CreateProjectDialog({ open, onClose, onProjectCreated }: CreateProjectDialogProps) {
  const [projectPath, setProjectPath] = useState('');
  const [projectName, setProjectName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleBrowse = async () => {
    try {
      if ((window as any).__TAURI__) {
        const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
        const selected = await openDialog({
          directory: true,
          multiple: false,
          title: 'Select Project Directory',
          defaultPath: await api.getHomeDirectory(),
        });
        if (selected && typeof selected === 'string') {
          setProjectPath(selected);
          // Auto-fill name from directory
          const name = selected.split('/').pop() || selected.split('\\').pop() || '';
          if (!projectName) setProjectName(name);
        }
      }
    } catch {
      // Web mode: just use manual input
    }
  };

  const handleCreate = async () => {
    if (!projectPath || creating) return;
    const name = projectName || projectPath.split('/').pop() || projectPath.split('\\').pop() || 'New Project';

    setCreating(true);
    try {
      // Initialize the project via backend
      await api.initializeProject(projectPath, name);
      onProjectCreated(projectPath, name);
      // Reset state
      setProjectPath('');
      setProjectName('');
      onClose();
    } catch (err) {
      console.error('Failed to create project:', err);
      // Still try to open even if initialization fails
      onProjectCreated(projectPath, name);
      setProjectPath('');
      setProjectName('');
      onClose();
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && projectPath) {
      handleCreate();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="glass-elevated rounded-xl p-6 w-[480px] space-y-4">
        <h2 className="text-lg font-semibold">Create New Project</h2>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Project Directory</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={projectPath}
              onChange={(e) => {
                setProjectPath(e.target.value);
                if (!projectName) {
                  const name = e.target.value.split('/').pop() || e.target.value.split('\\').pop() || '';
                  setProjectName(name);
                }
              }}
              placeholder="/path/to/your/project"
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
              autoFocus
            />
            <button
              onClick={handleBrowse}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted transition-colors"
            >
              <FolderOpen className="h-4 w-4" />
              Browse
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Project Name</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="my-project"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!projectPath || creating}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {creating ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}
