# RuneCode Startup Diagnostics

This document explains how to diagnose silent startup failures in RuneCode. These instructions apply to all platforms. The most common symptom is: the app process starts, then exits immediately with no window and no visible error.

## Log File Locations

RuneCode writes two diagnostic log files on every launch. They are flushed synchronously at each step, so even a crash mid-startup leaves a partial but useful record.

| Platform | `startup.log` path | `panic.log` path |
|----------|-------------------|-----------------|
| Windows  | `%APPDATA%\runecode\startup.log` | `%APPDATA%\runecode\panic.log` |
| macOS    | `~/Library/Application Support/runecode/startup.log` | `~/Library/Application Support/runecode/panic.log` |
| Linux    | `~/.local/share/runecode/startup.log` | `~/.local/share/runecode/panic.log` |

Open `startup.log` first. Each entry is timestamped in UTC ISO-8601 format.

## Reading startup.log

A healthy startup produces these entries in order:

```
[...] RuneCode 0.5.x starting
[...] OS: windows x86_64
[...] Panic hook installed
[...] Checking WebView2 runtime...
[...] WebView2 runtime OK
[...] env_logger initialized
[...] Registering Tauri plugins...
[...] setup() entered
[...] DB init OK — proxy settings loaded (enabled=false)
[...] Proxy settings applied
[...] AgentDb state registered
[...] CheckpointState created
[...] ~/.claude found — scheduling async dir set     (or: ~/.claude not found)
[...] App state managed (checkpoint, process registry, claude process)
[...] setup() complete
[...] tauri run() returned — exiting normally
```

If the log is **truncated** — stops at a particular line — the crash occurred at the step immediately following that line.

## Diagnosing Common Failures

### Log is empty / file does not exist

The process crashed before `init_startup_log()` completed. This is extremely rare. Check:
- Disk full (`df -h` on Linux/macOS, `dir` on Windows)
- `%APPDATA%` or `~/.local/share` not writable (permissions issue)
- Binary corrupted — reinstall

### Stops after "RuneCode X.Y.Z starting"

Panic hook setup failed. Check panic.log (may also be absent). Usually indicates a memory-layout issue in a very early dependency.

### Stops after "Checking WebView2 runtime..."

**Windows only**: WebView2 is missing or its registry keys are inaccessible.

Fix: Install the [WebView2 Evergreen Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

Note: The app logs `WARNING: WebView2 runtime not detected` but does not abort — Tauri surfaces its own error. If the app still exits silently with this warning, the WebView2 installer itself may be failing silently.

### Stops after "Registering Tauri plugins..."

A Tauri plugin failed to initialize. The setup closure never ran. Check:
- File system permissions (tauri-plugin-fs requires read/write access)
- Shell plugin requires a valid default shell

### Stops after "setup() entered"

A panic occurred inside the Tauri setup closure. Check `panic.log` for the exact file and line.

### Stops after "DB init OK..."

The second database connection (for `AgentDb` state) failed. The app runs in degraded mode without agent history. Check disk space.

### Stops after "App state managed..."

**macOS only**: The `window_vibrancy` call panicked or the main window was not found. This is non-fatal — the app continues. If a WARNING is logged here, check macOS version (requires 10.15+).

### "tauri run() returned" present but no window appeared

Tauri ran successfully but the WebView failed to render. On Windows this is almost always a WebView2 issue. On Linux it means WebKit2GTK is missing. On macOS it typically means the entitlements are incorrect or the app is not code-signed.

## Windows-Specific: Silent Exit with No Log

If no log file is created at all and the process exits in under 1 second:

1. Run from a terminal: `runecode.exe` — any error will appear in stdout/stderr
2. Check Windows Event Viewer > Windows Logs > Application for crash entries
3. The most common causes:
   - Missing `VCRUNTIME140.dll` — install [VC++ Redistributable](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)
   - Missing WebView2 — install from [Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)
   - Stack overflow (STATUS_STACK_OVERFLOW / 0xC00000FD) — this was fixed in v0.5.42 by raising the PE stack to 8 MB

## Linux-Specific: AppImage

The AppImage bundles its own media framework (`bundleMediaFramework: true` in tauri.conf.json). Users do not need WebKit installed system-wide. If the AppImage exits silently:

1. Run from terminal: `./RuneCode.AppImage` — stderr will show the error
2. Check FUSE is installed: `sudo apt install fuse libfuse2` (Ubuntu/Debian)
3. Check the system GLIBC version: AppImages require glibc 2.17+

For the `.deb` package, ensure these system packages are installed:
- `libwebkit2gtk-4.1-0`
- `libgtk-3-0`
- `libssl3`

## macOS-Specific

1. Check System Preferences > Privacy & Security — the app may be blocked from running unsigned
2. Run from terminal: `open -a RuneCode` or `./RuneCode.app/Contents/MacOS/runecode` to see stderr
3. If "damaged" error appears: `xattr -dr com.apple.quarantine RuneCode.app`
4. Minimum macOS version is 10.15 (Catalina) — older versions are not supported

## CSP Errors (All Platforms)

If the window opens but shows a blank page, the Content Security Policy may be blocking resources. Open the browser devtools:
- **Windows/Linux**: Right-click > Inspect (in debug builds only)
- **macOS**: Safari > Develop > [app name] > Web Inspector

The CSP allows:
- `ws://127.0.0.1:*` and `wss://127.0.0.1:*` for the internal WebSocket server
- PostHog analytics domains
- `blob:` and `data:` for images
- `asset:` and `https://asset.localhost` for Tauri asset protocol
