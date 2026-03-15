import { useShiki, highlightCode } from '../hooks/useShiki';
import { useThemeContext } from '../contexts/ThemeContext';

interface ShikiCodeBlockProps {
  code: string;
  language?: string;
  theme?: string;
}

export function ShikiCodeBlock({ code, language = 'text', theme: themeProp }: ShikiCodeBlockProps) {
  const { theme: appTheme } = useThemeContext();
  const theme = themeProp ?? (appTheme === 'light' ? 'github-light' : 'github-dark');
  const highlighter = useShiki();

  if (!highlighter) {
    // Loading fallback — plain code block
    return (
      <pre className="p-3 rounded-md bg-muted overflow-x-auto">
        <code className="text-sm font-mono">{code}</code>
      </pre>
    );
  }

  const html = highlightCode(highlighter, code, language, theme);

  return (
    <div
      className="shiki-code-block overflow-x-auto rounded-md text-sm [&_pre]:p-3 [&_pre]:m-0 [&_pre]:bg-transparent"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
