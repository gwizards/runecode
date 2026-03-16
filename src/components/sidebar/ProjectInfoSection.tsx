import { useState, useEffect } from "react";
import { Code2, ExternalLink } from "lucide-react";

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

  if (error || !info) {
    return (
      <div className="px-4 py-2">
        <p className="text-xs text-muted-foreground">Project info unavailable</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-2 space-y-1.5">
      {/* Project name + repo link */}
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-semibold text-foreground truncate">
          {info.name}
        </h3>
        {info.repoUrl && (
          <a
            href={info.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            title={info.repoUrl}
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* Tech stack badges inline */}
      {info.techStack.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {info.techStack.map((tech) => (
            <span
              key={tech}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-accent/50 text-foreground/70 font-medium"
            >
              <Code2 className="h-2.5 w-2.5" />
              {tech}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
