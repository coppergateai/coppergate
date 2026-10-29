"use client";

import ReactMarkdown from "react-markdown";

type Props = {
  markdown: string;
  className?: string;
};

/** Renders skill/procedure markdown as formatted prose (no raw HTML). */
export function MarkdownProse({ markdown, className }: Props) {
  return (
    <div className={className}>
      <ReactMarkdown
        skipHtml
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
