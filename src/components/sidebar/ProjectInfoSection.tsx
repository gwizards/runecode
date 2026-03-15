import { useState, useEffect } from "react";
import { Code2, GitBranch, ChevronDown, ChevronRight, Info } from "lucide-react";

interface ProjectInfo {
  name: string;
  description?: string;
  techStack: string[];
  repoUrl?: string;
}

interface ProjectInfoSectionProps {
  projectPath: string;
}

export function ProjectInfoSection({ projectPath }: ProjectInfoSectionProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!projectPath) {
      setError(true);
      return;
    }

    let cancelled = false;

    async function fetchInfo() {
      try {
        const res = await fetch(
          `/api/project-info?path=${encodeURIComponent(projectPath)}`
        );
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        if (!cancelled) {
          setInfo(data);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    fetchInfo();
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  return (
    <div className="border-b border-border/40">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-4 py-3 flex items-center gap-2 text-sm font-medium text-foreground/80 hover:bg-accent/30 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        )}
        <Info className="h-3.5 w-3.5 flex-shrink-0" />
        Project Info
      </button>

      {isOpen && (
        <div className="px-4 pb-3 space-y-2">
          {error || !info ? (
            <p className="text-xs text-muted-foreground">
              Project info unavailable
            </p>
          ) : (
            <>
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="text-sm text-foreground">{info.name}</p>
              </div>

              {info.description && (
                <div>
                  <p className="text-xs text-muted-foreground">Description</p>
                  <p className="text-sm text-foreground">{info.description}</p>
                </div>
              )}

              {info.techStack.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Tech Stack
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {info.techStack.map((tech) => (
                      <span
                        key={tech}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-accent/50 text-foreground/80"
                      >
                        <Code2 className="h-3 w-3" />
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {info.repoUrl && (
                <div>
                  <p className="text-xs text-muted-foreground">Repository</p>
                  <p className="text-sm text-foreground flex items-center gap-1">
                    <GitBranch className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{info.repoUrl}</span>
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
