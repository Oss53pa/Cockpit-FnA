import { useEffect, useRef } from 'react';

/** Affiche du texte en streaming avec un curseur clignotant */
export function StreamingText({ text, streaming }: { text: string; streaming: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [text]);

  // Simple markdown-like rendering (bold, bullets)
  const rendered = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- /gm, '&bull; ')
    .replace(/\n/g, '<br/>');

  return (
    <div ref={containerRef} className="text-sm leading-relaxed text-primary-800 dark:text-primary-200">
      <span dangerouslySetInnerHTML={{ __html: rendered }} />
      {streaming && (
        <span className="inline-block w-2 h-4 bg-primary-500 dark:bg-primary-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
      )}
    </div>
  );
}
