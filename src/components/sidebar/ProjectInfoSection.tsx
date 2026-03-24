import { Code2, ExternalLink, GitBranch, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { applyStartupToken } from "@/lib/startupToken";

interface ProjectInfo {
  name: string;
  description?: string;
  techStack: string[];
  repoUrl?: string;
  gitBranch?: string;
  lastCommit?: string;
  uncommittedCount?: number;
  hasClaudeMd?: boolean;
  fileCount?: number;
  diskUsageMb?: number;
}

interface ProjectInfoSectionProps {
  projectPath: string;
}

export function ProjectInfoSection({ projectPath }: ProjectInfoSectionProps) {
  const { data: info } = useQuery<ProjectInfo | null>({
    queryKey: ['project-info', projectPath],
    queryFn: async () => {
      if (!projectPath) return null;
      const res = await fetch(`/api/project-info?path=${encodeURIComponent(projectPath)}`, { headers: applyStartupToken({}) });
      if (!res.ok) return null;
      const data = await res.json();
      return {
        name: data.name || "",
        description: data.description,
        techStack: data.techStack || data.tech_stack || [],
        repoUrl: data.repoUrl || data.repo_url,
        gitBranch: data.gitBranch || data.git_branch,
        lastCommit: data.last_commit || data.lastCommit,
        uncommittedCount: data.uncommitted_count ?? data.uncommittedCount,
        hasClaudeMd: data.has_claude_md ?? data.hasClaudeMd,
        fileCount: data.file_count ?? data.fileCount,
        diskUsageMb: data.disk_usage_mb ?? data.diskUsageMb,
      };
    },
    enabled: !!projectPath,
    staleTime: 30000,       // Reuse cached data for 30s — project info doesn't change often
    refetchInterval: 60000, // Refresh every 60s in background
    placeholderData: (prev: any) => prev, // Keep previous project's data while loading
  });

  if (!info) return null;

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

      {/* Description */}
      {info.description && (
        <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5" title={info.description}>
          {info.description}
        </p>
      )}

      {/* Git context */}
      {(info.gitBranch || info.uncommittedCount !== undefined) && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
          {info.gitBranch && (
            <span className="flex items-center gap-0.5">
              <GitBranch className="h-2.5 w-2.5 text-green-400" />
              <span className="font-mono">{info.gitBranch}</span>
            </span>
          )}
          {info.uncommittedCount !== undefined && info.uncommittedCount > 0 && (
            <span className="text-yellow-400/80">{info.uncommittedCount} changed</span>
          )}
        </div>
      )}

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

      {/* CLAUDE.md indicator */}
      {info.hasClaudeMd && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary font-medium mt-1">
          <FileText className="h-2.5 w-2.5" />
          CLAUDE.md
        </span>
      )}

      {/* Last commit */}
      {info.lastCommit && (
        <p className="text-[10px] text-muted-foreground/60 truncate mt-1" title={info.lastCommit}>
          Last: {info.lastCommit}
        </p>
      )}

      {/* Project stats */}
      {(info.fileCount || info.diskUsageMb) && (
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground/50 mt-1">
          {info.fileCount && <span>{info.fileCount.toLocaleString()} files</span>}
          {info.diskUsageMb && <span>{info.diskUsageMb < 1024 ? `${info.diskUsageMb} MB` : `${(info.diskUsageMb / 1024).toFixed(1)} GB`}</span>}
        </div>
      )}
    </div>
  );
}
