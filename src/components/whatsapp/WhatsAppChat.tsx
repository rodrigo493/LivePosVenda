import { useState, useEffect, useRef } from "react";
import { Send, MessageSquare, Paperclip, X, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CHAT_HISTORY_LIMIT } from "@/constants/limits";

interface WhatsAppChatProps {
  clientId: string;
  ticketId?: string;
  clientPhone?: string;
  clientName?: string;
  hideHeader?: boolean;
  className?: string;
}

function useWhatsAppMessages(clientId: string | undefined) {
  return useQuery({
    queryKey: ["whatsapp-messages", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: true })
        .limit(CHAT_HISTORY_LIMIT);
      if (error) throw error;
      return data;
    },
  });
}

export function WhatsAppChat({ clientId, ticketId, clientPhone, clientName, hideHeader, className }: WhatsAppChatProps) {
  const qc = useQueryClient();
  const { data: messages, isLoading } = useWhatsAppMessages(clientId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [mediaFile, setMediaFile] = useState<{ base64: string; mime: string; name: string } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const shouldSendRef = useRef(false);

  // Realtime subscription
  useEffect(() => {
    if (!clientId) return;
    const channel = supabase
      .channel(`whatsapp-${clientId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: `client_id=eq.${clientId}` }, () => {
        qc.invalidateQueries({ queryKey: ["whatsapp-messages", clientId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId, qc]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const formatRecTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const drawWaveform = (analyser: AnalyserNode) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const barCount = 26;
    const barW = 3;
    const gap = 2;
    const totalW = barCount * (barW + gap) - gap;
    const step = Math.floor(dataArray.length / barCount);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let x = (canvas.width - totalW) / 2;
      for (let i = 0; i < barCount; i++) {
        const v = dataArray[i * step] / 255;
        const h = Math.max(4, v * canvas.height * 0.85);
        const y = (canvas.height - h) / 2;
        ctx.fillStyle = "#10b981";
        ctx.beginPath();
        ctx.roundRect(x, y, barW, h, 1.5);
        ctx.fill();
        x += barW + gap;
      }
    };
    draw();
  };

  const sendAudioBlob = async (blob: Blob) => {
    if (!clientPhone) return;
    setSending(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            client_id: clientId,
            ticket_id: ticketId,
            phone: clientPhone,
            media_base64: base64,
            media_mime_type: blob.type || "audio/webm",
            media_filename: `audio_${Date.now()}.webm`,
          }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro ao enviar");
      qc.invalidateQueries({ queryKey: ["whatsapp-messages", clientId] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar áudio");
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"]
        .find(t => MediaRecorder.isTypeSupported(t)) || "";

      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        if (shouldSendRef.current) await sendAudioBlob(blob);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
      drawWaveform(analyser);
    } catch {
      toast.error("Não foi possível acessar o microfone");
    }
  };

  const stopRecording = (send: boolean) => {
    shouldSendRef.current = send;
    cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setMediaFile({ base64: reader.result as string, mime: file.type, name: file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const sendMessage = async () => {
    if (!mediaFile && !draft.trim()) return;
    if (!clientPhone) return;
    setSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const body: Record<string, any> = { client_id: clientId, ticket_id: ticketId, phone: clientPhone, message: draft.trim() || undefined };
      if (mediaFile) { body.media_base64 = mediaFile.base64; body.media_mime_type = mediaFile.mime; body.media_filename = mediaFile.name; }
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`,
        { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro ao enviar");
      setDraft("");
      setMediaFile(null);
      qc.invalidateQueries({ queryKey: ["whatsapp-messages", clientId] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !mediaFile) { e.preventDefault(); sendMessage(); }
  };

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const groupedMessages = (messages || []).reduce<{ date: string; msgs: any[] }[]>((acc, msg) => {
    const date = new Date(msg.created_at).toLocaleDateString("pt-BR");
    const last = acc[acc.length - 1];
    if (last && last.date === date) last.msgs.push(msg);
    else acc.push({ date, msgs: [msg] });
    return acc;
  }, []);

  if (!clientPhone) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <MessageSquare className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">Este cliente não possui WhatsApp ou telefone cadastrado.</p>
        <p className="text-xs mt-1">Adicione um número no cadastro do cliente para usar o chat.</p>
      </div>
    );
  }

  return (
    <div className={className ?? "flex flex-col h-[60vh]"}>
      {/* Chat header */}
      {!hideHeader && (
        <div className="flex items-center gap-3 pb-3 border-b mb-2">
          <div className="h-9 w-9 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold">{clientName || "Cliente"}</p>
            <p className="text-[11px] text-muted-foreground">{clientPhone}</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-[10px] text-muted-foreground">WhatsApp</span>
          </div>
        </div>
      )}

      {/* Messages area */}
      <ScrollArea className="flex-1 pr-2" ref={scrollRef}>
        <div className="space-y-1 py-2">
          {isLoading ? (
            <p className="text-center text-xs text-muted-foreground py-8">Carregando mensagens...</p>
          ) : groupedMessages.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-xs">Nenhuma mensagem ainda.</p>
              <p className="text-[10px] mt-1">Envie a primeira mensagem para iniciar a conversa.</p>
            </div>
          ) : (
            groupedMessages.map((group) => (
              <div key={group.date}>
                <div className="flex justify-center my-3">
                  <span className="text-[10px] bg-muted px-3 py-0.5 rounded-full text-muted-foreground">
                    {group.date}
                  </span>
                </div>
                {group.msgs.map((msg: any) => (
                  <div key={msg.id} className={`flex mb-1.5 ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${msg.direction === "outbound" ? "bg-emerald-600 text-white rounded-br-md" : "bg-muted rounded-bl-md"}`}>
                      {msg.direction === "inbound" && msg.sender_name && (
                        <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">{msg.sender_name}</p>
                      )}
                      {msg.media_url && msg.message_text?.startsWith("🎵") ? (
                        <audio controls src={msg.media_url} className="max-w-[220px] h-8 mt-0.5" />
                      ) : msg.media_url && msg.message_text?.startsWith("📷") ? (
                        <img src={msg.media_url} alt="imagem" className="max-w-[200px] rounded-lg mt-0.5 cursor-pointer" onClick={() => window.open(msg.media_url, "_blank")} />
                      ) : msg.media_url && msg.message_text?.startsWith("🎥") ? (
                        <video controls src={msg.media_url} className="max-w-[220px] rounded-lg mt-0.5" />
                      ) : msg.media_url ? (
                        <a href={msg.media_url} target="_blank" rel="noreferrer" className="underline text-[13px]">{msg.message_text}</a>
                      ) : (
                        <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{msg.message_text}</p>
                      )}
                      <p className={`text-[9px] mt-1 text-right ${msg.direction === "outbound" ? "text-white/60" : "text-muted-foreground"}`}>
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="border-t pt-3 mt-2">
        {isRecording ? (
          /* Recording UI — waveform + timer + cancel/send */
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-10 w-10 shrink-0 text-red-500 hover:bg-red-50"
              onClick={() => stopRecording(false)}
              title="Cancelar gravação"
            >
              <X className="h-4 w-4" />
            </Button>
            <div className="flex-1 flex items-center gap-2 bg-muted rounded-xl px-3 h-10 min-w-0">
              <span className="text-[11px] text-red-500 font-mono tabular-nums shrink-0">
                {formatRecTime(recordingSeconds)}
              </span>
              <canvas ref={canvasRef} width={160} height={28} className="flex-1 min-w-0" style={{ maxWidth: "100%" }} />
            </div>
            <Button
              onClick={() => stopRecording(true)}
              disabled={sending}
              size="icon"
              className="h-10 w-10 shrink-0 bg-emerald-600 hover:bg-emerald-700"
              title="Enviar áudio"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          /* Normal input UI */
          <>
            {mediaFile && (
              <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-muted rounded-lg text-xs">
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate text-muted-foreground">{mediaFile.name}</span>
                <button onClick={() => setMediaFile(null)} className="shrink-0 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" onChange={handleFileSelect} className="hidden" />
              <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => fileInputRef.current?.click()} title="Anexar arquivo">
                <Paperclip className="h-4 w-4" />
              </Button>
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={mediaFile ? "Adicionar legenda (opcional)..." : "Digite sua mensagem..."}
                className="min-h-[44px] max-h-[120px] resize-none text-sm"
                rows={1}
              />
              {!draft.trim() && !mediaFile ? (
                <Button
                  onClick={startRecording}
                  size="icon"
                  variant="ghost"
                  className="h-10 w-10 shrink-0 text-emerald-600 hover:bg-emerald-50"
                  title="Gravar áudio"
                >
                  <Mic className="h-5 w-5" />
                </Button>
              ) : (
                <Button onClick={sendMessage} disabled={sending} size="icon" className="h-10 w-10 shrink-0 bg-emerald-600 hover:bg-emerald-700">
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">Enter para enviar · Shift+Enter para nova linha</p>
          </>
        )}
      </div>
    </div>
  );
}
