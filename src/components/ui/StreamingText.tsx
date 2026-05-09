import { useEffect, useMemo, useRef } from 'react';

/**
 * StreamingText — affiche du texte en streaming (typewriter) avec un curseur
 * clignotant.
 *
 * SÉCURITÉ : ce composant rend du texte arbitraire (provenant potentiellement
 * d'un LLM ou de l'utilisateur). On REFUSE `dangerouslySetInnerHTML` qui ouvre
 * un risque XSS. Le markdown limité (bold, listes à puces, retours ligne) est
 * parsé en React elements typés — aucune injection HTML possible.
 */
export function StreamingText({ text, streaming }: { text: string; streaming: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [text]);

  const nodes = useMemo(() => parseMarkdown(text), [text]);

  return (
    <div ref={containerRef} className="text-sm leading-relaxed text-primary-800 dark:text-primary-200 whitespace-pre-wrap">
      {nodes}
      {streaming && (
        <span className="inline-block w-2 h-4 bg-primary-500 dark:bg-primary-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
      )}
    </div>
  );
}

/**
 * Parse un sous-ensemble sûr de markdown :
 *   - **gras** → <strong>
 *   - lignes commençant par "- " → puce avec bullet
 *   - sauts de ligne préservés (CSS `whitespace-pre-wrap`)
 *
 * Retourne un tableau de ReactNode.
 */
function parseMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  return lines.flatMap((line, lineIdx) => {
    const isBullet = line.startsWith('- ');
    const content = isBullet ? line.slice(2) : line;
    const inline = parseInline(content);
    const out: React.ReactNode[] = [];
    if (isBullet) {
      out.push(
        <span key={`b-${lineIdx}`}>
          {'• '}
          {inline}
        </span>,
      );
    } else {
      out.push(<span key={`l-${lineIdx}`}>{inline}</span>);
    }
    if (lineIdx < lines.length - 1) {
      out.push(<br key={`br-${lineIdx}`} />);
    }
    return out;
  });
}

/**
 * Parse les segments inline (**gras**) sans HTML.
 */
function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<strong key={`s-${key++}`}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}
