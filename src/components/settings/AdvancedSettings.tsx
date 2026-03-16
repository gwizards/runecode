import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClaudeSettings } from "@/lib/api";

interface AdvancedSettingsProps {
  settings: ClaudeSettings | null;
  onSettingsChange: (key: string, value: any) => void;
}

export function AdvancedSettings({ settings, onSettingsChange }: AdvancedSettingsProps) {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold mb-1">Advanced</h3>
        <p className="text-sm text-muted-foreground mb-4">API configuration and debugging</p>
      </div>

      {/* API Key Helper Script */}
      <div className="space-y-2">
        <Label htmlFor="apiKeyHelper">API Key Helper Script</Label>
        <Input
          id="apiKeyHelper"
          placeholder="/path/to/generate_api_key.sh"
          value={settings?.apiKeyHelper || ""}
          onChange={(e) => onSettingsChange("apiKeyHelper", e.target.value || undefined)}
        />
        <p className="text-xs text-muted-foreground">
          Custom script to generate auth values for API requests
        </p>
      </div>

      {/* Raw JSON Viewer */}
      <div className="space-y-2">
        <Label>Raw Settings (JSON)</Label>
        <div className="p-3 rounded-md bg-muted font-mono text-xs overflow-x-auto whitespace-pre-wrap">
          <pre>{JSON.stringify(settings, null, 2)}</pre>
        </div>
        <p className="text-xs text-muted-foreground">
          This shows the raw JSON that will be saved to ~/.claude/settings.json
        </p>
      </div>
    </div>
  );
}
