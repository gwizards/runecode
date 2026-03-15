use serde::Serialize;
use std::sync::Mutex;
use sysinfo::System;

static SYSTEM: once_cell::sync::Lazy<Mutex<System>> = once_cell::sync::Lazy::new(|| {
    let mut sys = System::new_all();
    sys.refresh_all();
    Mutex::new(sys)
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
pub fn get_system_resources() -> SystemResources {
    let mut sys = SYSTEM.lock().unwrap();
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpu_percent = sys.global_cpu_usage();
    let total_memory = sys.total_memory() as f64;
    let used_memory = sys.used_memory() as f64;
    let ram_percent = if total_memory > 0.0 {
        (used_memory / total_memory * 100.0) as f32
    } else {
        0.0
    };

    SystemResources {
        cpu_percent,
        ram_percent,
        ram_used_gb: (used_memory / 1_073_741_824.0) as f32,
        ram_total_gb: (total_memory / 1_073_741_824.0) as f32,
    }
}
