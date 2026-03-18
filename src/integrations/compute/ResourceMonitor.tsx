import { useQuery } from '@tanstack/react-query';

export interface SystemResources {
  cpuPercent: number;
  ramPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
  diskPercent: number;
  diskUsedGb: number;
  diskTotalGb: number;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  ports: string;
  cpu: number;
  mem: number;
  memMb: number;
  memLimitMb: number;
  netIO: string;
  blockIO: string;
  pids: number;
}

export interface DockerStats {
  available: boolean;
  running: number;
  total: number;
  totalCpu: number;
  totalMemMb: number;
  containers: DockerContainer[];
}

async function fetchResources(): Promise<SystemResources> {
  try {
    const isRealTauri = window.__TAURI__ && !window.__TAURI_INTERNALS__?.__WEB_MODE_MOCK__;
    if (isRealTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_system_resources') as SystemResources;
    }
    const res = await fetch('/api/resources');
    if (!res.ok) throw new Error('Failed to fetch resources');
    return await res.json();
  } catch {
    // Return zeros if monitoring unavailable
    return { cpuPercent: 0, ramPercent: 0, ramUsedGb: 0, ramTotalGb: 0, diskPercent: 0, diskUsedGb: 0, diskTotalGb: 0 };
  }
}

export function useResourceMonitor() {
  const { data: resources = { cpuPercent: 0, ramPercent: 0, ramUsedGb: 0, ramTotalGb: 0, diskPercent: 0, diskUsedGb: 0, diskTotalGb: 0 } } = useQuery({
    queryKey: ['system-resources'],
    queryFn: fetchResources,
    refetchInterval: 5000,
  });

  return resources;
}

const emptyDocker: DockerStats = { available: false, running: 0, total: 0, totalCpu: 0, totalMemMb: 0, containers: [] };

async function fetchDocker(): Promise<DockerStats> {
  try {
    const res = await fetch('/api/resources/docker');
    if (!res.ok) return emptyDocker;
    return await res.json();
  } catch {
    return emptyDocker;
  }
}

export function useDockerMonitor() {
  const { data: docker = emptyDocker } = useQuery({
    queryKey: ['docker-stats'],
    queryFn: fetchDocker,
    refetchInterval: 8000,
    staleTime: 5000,
  });

  return docker;
}
