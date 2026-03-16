import { ClaudeVersionSelector } from "@/components/ClaudeVersionSelector";
import type { ClaudeInstallation } from "@/lib/api";

interface BinarySettingsProps {
  selectedPath: string | null;
  onSelect: (installation: ClaudeInstallation) => void;
}

export function BinarySettings({ selectedPath, onSelect }: BinarySettingsProps) {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold mb-1">Claude Binary</h3>
        <p className="text-sm text-muted-foreground mb-4">Select which Claude Code installation to use</p>
      </div>
      <ClaudeVersionSelector
        selectedPath={selectedPath}
        onSelect={onSelect}
        simplified={true}
      />
    </div>
  );
}
