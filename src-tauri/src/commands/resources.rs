use serde::Serialize;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use sysinfo::System;

/// Minimum interval between sysinfo refreshes — prevents latency spikes on rapid IPC calls.
const REFRESH_TTL: Duration = Duration::from_secs(2);

/// Cached system info: the sysinfo handle plus the timestamp of the last refresh.
struct CachedSystem {
    sys: System,
    last_refresh: Instant,
}

static SYSTEM: once_cell::sync::Lazy<Mutex<CachedSystem>> =
    once_cell::sync::Lazy::new(|| {
        let mut sys = System::new_all();
        sys.refresh_all();
        Mutex::new(CachedSystem {
            sys,
            last_refresh: Instant::now(),
        })
    });

#[derive(Serialize)]
pub struct SystemResources {
    #[serde(rename = "cpuPercent")]
    cpu_percent: f32,
    #[serde(rename = "ramPercent")]
    ram_percent: f32,
    #[serde(rename = "ramUsedGb")]
    ram_used_gb: f32,
    #[serde(rename = "ramTotalGb")]
    ram_total_gb: f32,
}

#[tauri::command]
pub fn get_system_resources() -> Result<SystemResources, String> {
    let mut cache = match SYSTEM.lock() {
        Ok(c) => c,
        Err(poisoned) => poisoned.into_inner(),
    };

    // Only refresh sysinfo if the cached data is older than REFRESH_TTL (2 s).
    // This prevents repeated expensive kernel calls on rapid successive IPC requests.
    if cache.last_refresh.elapsed() >= REFRESH_TTL {
        cache.sys.refresh_cpu_usage();
        cache.sys.refresh_memory();
        cache.last_refresh = Instant::now();
    }

    let cpu_percent = cache.sys.global_cpu_usage();
    let total_memory = cache.sys.total_memory() as f64;
    let used_memory = cache.sys.used_memory() as f64;
    let ram_percent = if total_memory > 0.0 {
        (used_memory / total_memory * 100.0) as f32
    } else {
        0.0
    };

    Ok(SystemResources {
        cpu_percent,
        ram_percent,
        ram_used_gb: (used_memory / 1_073_741_824.0) as f32,
        ram_total_gb: (total_memory / 1_073_741_824.0) as f32,
    })
}
