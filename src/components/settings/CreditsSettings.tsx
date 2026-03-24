import { ExternalLink } from 'lucide-react';
import { version } from '../../../package.json';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">{title}</h3>
      {children}
    </div>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-purple-400/80 hover:text-purple-300 text-sm transition-colors"
    >
      {children}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

export function CreditsSettings() {
  return (
    <div className="space-y-8 max-w-xl">
      <div>
        <h2 className="text-xl font-semibold">RuneCode</h2>
        <p className="text-sm text-white/40 mt-1">v{version} · AGPL-3.0</p>
        <p className="text-sm text-white/50 mt-2">
          A blazingly fast desktop engine for Claude Code.
        </p>
      </div>

      <Section title="Authors">
        <div className="bg-white/5 rounded-xl p-4 space-y-2 text-sm text-white/70">
          <div>mufeedvh</div>
          <div>123vviekr</div>
          <div className="text-white/50 text-xs pt-1">© 2025 Wizards. All rights reserved.</div>
        </div>
      </Section>

      <Section title="Built with">
        <div className="bg-white/5 rounded-xl p-4 grid grid-cols-2 gap-y-2 gap-x-6 text-sm text-white/60">
          {[
            'Tauri 2', 'React', 'TypeScript', 'Rust',
            'xterm.js', 'Zustand', 'Vite', 'Tailwind CSS',
          ].map(dep => (
            <div key={dep}>{dep}</div>
          ))}
        </div>
      </Section>

      <Section title="Links">
        <div className="bg-white/5 rounded-xl p-4 space-y-2">
          <div><Link href="https://github.com/gwizards/runecode">GitHub — gwizards/runecode</Link></div>
          <div><Link href="https://github.com/ruvnet/claude-flow">claude-flow (RuFlo engine)</Link></div>
        </div>
      </Section>
    </div>
  );
}
