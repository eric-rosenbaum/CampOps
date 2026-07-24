import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TreePine } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Styled element map so the Markdown renders as a clean, readable legal document
// (no @tailwindcss/typography dependency required).
const components: Components = {
  h1: ({ children }) => <h1 className="text-[26px] font-bold text-forest tracking-tight mt-0 mb-3">{children}</h1>,
  h2: ({ children }) => <h2 className="text-[18px] font-semibold text-forest mt-9 mb-2.5 pb-1.5 border-b border-border">{children}</h2>,
  h3: ({ children }) => <h3 className="text-[15px] font-semibold text-forest mt-6 mb-2">{children}</h3>,
  p:  ({ children }) => <p className="text-[14px] leading-relaxed text-forest/80 my-3">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 my-3 space-y-1.5 text-[14px] text-forest/80">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 my-3 space-y-1.5 text-[14px] text-forest/80">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a:  ({ href, children }) => <a href={href} className="text-sage underline underline-offset-2 hover:text-forest">{children}</a>,
  strong: ({ children }) => <strong className="font-semibold text-forest">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  hr: () => <hr className="my-7 border-border" />,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-4 border-amber bg-amber-bg/60 rounded-r-btn px-4 py-2.5 text-[13px] text-amber-text [&_p]:my-1 [&_p]:text-amber-text">
      {children}
    </blockquote>
  ),
  code: ({ children }) => <code className="text-[12.5px] bg-cream-dark rounded px-1.5 py-0.5 text-forest">{children}</code>,
  table: ({ children }) => (
    <div className="overflow-x-auto my-4 border border-border rounded-card">
      <table className="w-full text-[13px] border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-cream-dark">{children}</thead>,
  th: ({ children }) => <th className="text-left font-semibold text-forest px-3 py-2 border-b border-border">{children}</th>,
  td: ({ children }) => <td className="align-top px-3 py-2 border-b border-border text-forest/80">{children}</td>,
};

export function MarkdownDoc({ content }: { content: string }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-border bg-white/70 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-sage rounded-btn flex items-center justify-center">
              <TreePine className="w-3.5 h-3.5 text-forest" />
            </div>
            <span className="text-[14px] font-semibold text-forest">CampCommand</span>
          </div>
          <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-[13px] text-forest/60 hover:text-forest transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{content}</ReactMarkdown>
      </main>
    </div>
  );
}
