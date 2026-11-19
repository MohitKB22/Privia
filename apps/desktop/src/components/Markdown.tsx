/**
 * Assistant replies rendered as Markdown.
 *
 * Safety: raw HTML in a reply is never rendered (react-markdown escapes it
 * unless a raw-HTML plugin is added, and none is), unsafe URL schemes are
 * stripped by react-markdown's default URL transform, and links open in the
 * system browser through the shell instead of navigating the app window.
 */

import { memo, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { openExternal } from '@/lib/connection';
import { Icon } from './primitives';

function CodeBlock({ language, children }: { language: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard can be unavailable; the text is still selectable */
    }
  };
  return (
    <div className="overflow-hidden rounded-lg border border-graphite-700 bg-graphite-950">
      <div className="flex items-center justify-between border-b border-graphite-800 px-3 py-1.5">
        <span className="font-mono text-2xs text-graphite-500">{language || 'text'}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="flex items-center gap-1 text-2xs text-graphite-500 hover:text-graphite-200"
          aria-label="Copy code"
        >
          <Icon name={copied ? 'check' : 'copy'} className="h-3 w-3" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[0.8rem] leading-relaxed text-graphite-200">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return '';
}

const components: Components = {
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const match = /language-([\w+-]+)/.exec(className ?? '');
    const text = textOf(children);
    // Fenced blocks carry a language class or span lines; inline code does not.
    if (match || text.includes('\n')) {
      return <CodeBlock language={match?.[1] ?? ''}>{text.replace(/\n$/, '')}</CodeBlock>;
    }
    return <code>{children}</code>;
  },
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        if (href) void openExternal(href);
      }}
      title={href}
    >
      {children}
    </a>
  ),
  img: ({ alt }) => <span className="text-graphite-500">[image: {alt || 'untitled'}]</span>,
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
};

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-privia break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
