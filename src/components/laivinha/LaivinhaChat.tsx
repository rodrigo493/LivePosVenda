import { useState, useRef, useEffect } from "react";
import { Brain, X, Send, Paperclip, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
  media?: string[];
}

interface MediaItem {
  type: "image" | "video";
  url: string;
}

const WELCOME: Message = {
  role: "assistant",
  content:
    "Olá! Sou a Laivinha 🤖. Pode me perguntar sobre qualquer problema de equipamento — roldanas, elásticos, peças, defeitos comuns. Também consigo analisar fotos e vídeos que você enviar.",
};

export function LaivinhaChat() {
  const { user } = useAuth();
  const [open, setOpen]               = useState(false);
  const [messages, setMessages]       = useState<Message[]>([WELCOME]);
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [pendingMedia, setPendingMedia] = useState<MediaItem[]>([]);
  const [pendingUrls, setPendingUrls]   = useState<string[]>([]);
  const [uploading, setUploading]     = useState(false);
  const fileRef   = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const handleUpload = async (files: FileList) => {
    if (!user) return;
    setUploading(true);
    const newMedia: MediaItem[] = [];
    const newUrls: string[]     = [];

    for (const file of Array.from(files)) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`${file.name} excede 50 MB`);
        continue;
      }
      const ts       = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path     = `chat/${user.id}/${ts}_${safeName}`;

      const { error } = await supabase.storage
        .from("posvenda-evidencias")
        .upload(path, file, { upsert: false });

      if (error) { toast.error(`Erro ao enviar ${file.name}`); continue; }

      const { data: urlData } = supabase.storage
        .from("posvenda-evidencias")
        .getPublicUrl(path);

      const type = file.type.startsWith("video/") ? "video" : "image";
      newMedia.push({ type, url: urlData.publicUrl });
      newUrls.push(urlData.publicUrl);
    }

    setPendingMedia((p) => [...p, ...newMedia]);
    setPendingUrls((p) => [...p, ...newUrls]);
    setUploading(false);
  };

  const handleSend = async () => {
    if (!input.trim() && pendingMedia.length === 0) return;

    const mediaSnapshot = [...pendingMedia];
    const urlSnapshot   = [...pendingUrls];

    const userMsg: Message = {
      role:    "user",
      content: input.trim(),
      media:   urlSnapshot.length > 0 ? urlSnapshot : undefined,
    };

    const history = messages.slice(1).slice(-10);

    setMessages((m) => [...m, userMsg]);
    setInput("");
    setPendingMedia([]);
    setPendingUrls([]);
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("posvenda-chat", {
        body: {
          message: userMsg.content || "Analise esta mídia.",
          history: history.map((m) => ({ role: m.role, content: m.content })),
          media:   mediaSnapshot,
        },
      });
      if (error) throw error;
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Ocorreu um erro ao consultar a Laivinha. Tente novamente." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-violet-600 hover:bg-violet-700 text-white shadow-lg flex items-center justify-center transition-all hover:scale-105 focus:outline-none"
        title="Chat com a Laivinha"
        aria-label="Abrir chat com Laivinha"
      >
        {open ? <X className="h-6 w-6" /> : <Brain className="h-6 w-6" />}
      </button>

      {/* Chat bubble */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] h-[520px] rounded-2xl shadow-2xl border bg-background flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b bg-violet-50 shrink-0">
            <div className="h-8 w-8 rounded-full bg-violet-600 flex items-center justify-center">
              <Brain className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-violet-900">Laivinha</p>
              <p className="text-[10px] text-violet-600">Assistente técnica de pós-venda</p>
            </div>
          </div>

          {/* Mensagens */}
          <ScrollArea className="flex-1 px-4 py-3">
            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-violet-600 text-white rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm"
                    }`}
                  >
                    {msg.media && msg.media.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {msg.media.map((url, idx) => {
                          const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
                          return isImg ? (
                            <img key={idx} src={url} className="h-16 w-16 object-cover rounded" alt="anexo" />
                          ) : (
                            <div key={idx} className="flex items-center gap-1 text-xs bg-black/20 rounded px-2 py-1">
                              <FileText className="h-3 w-3" /> vídeo
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm max-w-none [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0">
                        <ReactMarkdown skipHtml>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}

              {/* Loading dots */}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="h-2 w-2 rounded-full bg-violet-400 animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          {/* Preview de mídia pendente */}
          {pendingMedia.length > 0 && (
            <div className="px-4 py-2 border-t flex gap-2 flex-wrap shrink-0">
              {pendingMedia.map((m, i) => (
                <div key={i} className="relative">
                  {m.type === "image" ? (
                    <img src={m.url} className="h-12 w-12 object-cover rounded" alt="preview" />
                  ) : (
                    <div className="h-12 w-12 bg-muted rounded flex items-center justify-center">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <button
                    className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[10px] leading-none"
                    onClick={() => {
                      setPendingMedia((p) => p.filter((_, j) => j !== i));
                      setPendingUrls((p) => p.filter((_, j) => j !== i));
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-3 py-3 border-t flex gap-2 items-end shrink-0">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleUpload(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              className="text-muted-foreground hover:text-violet-600 transition-colors flex-shrink-0 mb-[5px] disabled:opacity-40"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || loading}
              title="Anexar imagem ou vídeo"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <Textarea
              className="flex-1 text-sm min-h-[36px] max-h-[96px] resize-none"
              placeholder="Pergunte sobre qualquer equipamento..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              disabled={loading}
            />
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 flex-shrink-0 h-8 w-8 p-0 mb-[1px]"
              onClick={handleSend}
              disabled={loading || uploading || (!input.trim() && pendingMedia.length === 0)}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>

        </div>
      )}
    </>
  );
}
