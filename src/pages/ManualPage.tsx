import { useState, useEffect } from "react";
import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";

const ManualPage = () => {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/MANUAL_USUARIO_LIVE_CARE.md")
      .then((r) => r.text())
      .then((text) => { setContent(text); setLoading(false); })
      .catch(() => { setContent("Erro ao carregar o manual."); setLoading(false); });
  }, []);

  return (
    <div>
      <PageHeader title="Manual do Usuário" description="Guia completo de uso do Live Care" icon={BookOpen} />
      {loading ? (
        <p className="text-sm text-muted-foreground p-8 text-center">Carregando manual...</p>
      ) : (
        <ScrollArea className="h-[calc(100vh-160px)]">
          <article className="prose prose-sm dark:prose-invert max-w-4xl mx-auto p-6 
            prose-headings:text-foreground prose-p:text-foreground/80 
            prose-strong:text-foreground prose-li:text-foreground/80
            prose-code:bg-muted prose-code:text-foreground prose-code:px-1 prose-code:py-0.5 prose-code:rounded
            prose-blockquote:border-primary prose-blockquote:text-muted-foreground
            prose-hr:border-border">
            <ReactMarkdown skipHtml>{content}</ReactMarkdown>
          </article>
        </ScrollArea>
      )}
    </div>
  );
};

export default ManualPage;
