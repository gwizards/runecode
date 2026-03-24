use clap::Parser;

// These modules are compiled in the web-server binary so that web_server.rs can reference their
// types (CheckpointState, AgentDb, etc.) without duplicating definitions.  Not all items in each
// module are exercised by this binary, hence the dead_code suppression.
#[allow(dead_code)]
mod checkpoint;
#[allow(dead_code)]
mod claude_binary;
#[allow(dead_code)]
mod claude_binary_env;
#[allow(dead_code)]
mod commands;
#[allow(dead_code)]
mod process;
mod path_guard;
#[allow(dead_code)]
mod terminal_pty;
mod ws_types;
mod web_server;

#[derive(Parser)]
#[command(name = "runecode")]
#[command(about = "RuneCode Web Server - Run RuneCode in your browser")]
struct Args {
    /// Port to run the web server on
    #[arg(short, long, default_value = "8080")]
    port: u16,

    /// Automatically open the browser
    #[arg(long)]
    open: bool,
}

#[tokio::main]
async fn main() {
    env_logger::init();

    let args = Args::parse();

    println!("RuneCode running at http://127.0.0.1:{}", args.port);
    println!("Press Ctrl+C to stop");

    if args.open {
        let url = format!("http://localhost:{}", args.port);
        let _ = open::that(&url);
    }

    if let Err(e) = web_server::start_web_mode(Some(args.port)).await {
        eprintln!("Failed to start web server: {}", e);
        std::process::exit(1);
    }
}
