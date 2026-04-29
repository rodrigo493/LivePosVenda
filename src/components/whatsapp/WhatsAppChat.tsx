import { useState, useEffect, useRef } from "react";
import { Send, MessageSquare, Paperclip, X, Mic, Download, CornerUpLeft, ChevronDown, Copy, Forward, Check, CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CHAT_HISTORY_LIMIT } from "@/constants/limits";
import { useWhatsAppConversations } from "@/hooks/useWhatsAppConversations";

interface WhatsAppChatProps {
  clientId: string;
  ticketId?: string;
  clientPhone?: string;
  clientName?: string;
  hideHeader?: boolean;
  className?: string;
}

function useWhatsAppMessages(clientId: string | undefined, ticketId?: string) {
  return useQuery({
    queryKey: ["whatsapp-messages", clientId, ticketId],
    enabled: !!clientId,
    queryFn: async () => {
      let query = supabase
        .from("whatsapp_messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(CHAT_HISTORY_LIMIT);

      if (ticketId) {
        // Inclui mensagens pelo client_id OU pelo ticket_id para capturar
        // mensagens salvas com cliente duplicado ou sem client_id correto
        query = query.or(`client_id.eq.${clientId},ticket_id.eq.${ticketId}`);
      } else {
        query = query.eq("client_id", clientId!);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Deduplica por id caso o OR traga duplicatas
      const seen = new Set<string>();
      return (data ?? []).filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
    },
  });
}

function getMessagePreview(msg: any): string {
  if (msg.message_text?.startsWith("🎵")) return "🎵 Áudio";
  if (msg.message_text?.startsWith("📷")) return "📷 Imagem";
  if (msg.message_text?.startsWith("🎥")) return "🎥 Vídeo";
  if (msg.message_text?.startsWith("📎")) return "📎 Arquivo";
  return (msg.message_text || "").slice(0, 80);
}

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mpeg") && m.includes("audio")) return "mp3";
  if (m.includes("mp4") && m.includes("audio")) return "m4a";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("webm")) return "webm";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("gif")) return "gif";
  if (m.includes("webp")) return "webp";
  if (m.includes("pdf")) return "pdf";
  if (m.includes("spreadsheetml")) return "xlsx";
  if (m.includes("wordprocessingml") || m.includes("msword")) return "docx";
  if (m.includes("presentationml") || m.includes("powerpoint")) return "pptx";
  if (m.includes("zip")) return "zip";
  const tail = m.split("/")[1]?.split(";")[0]?.split(".").pop();
  return tail || "bin";
}

function buildFilename(prefix: string, mime: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `${prefix}_${stamp}.${extFromMime(mime)}`;
}

async function forceDownload(url: string, fallbackFilename: string, prefix?: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const ctype = blob.type || res.headers.get("Content-Type") || "";
    const finalName = prefix && ctype ? buildFilename(prefix, ctype) : fallbackFilename;
    const obj = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = obj;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(obj);
  } catch {
    const a = document.createElement("a");
    a.href = url;
    a.download = fallbackFilename;
    a.target = "_blank";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

function DownloadButton({
  url,
  filename,
  prefix,
  outbound,
  label = "Baixar",
  compact = false,
}: {
  url: string;
  filename: string;
  prefix?: string;
  outbound: boolean;
  label?: string;
  compact?: boolean;
}) {
  const base = outbound
    ? "text-white/80 hover:text-white hover:bg-white/10"
    : "text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100";
  if (compact) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); forceDownload(url, filename, prefix); }}
        className={`shrink-0 rounded-full p-1 transition-colors ${base}`}
        title={label}
      >
        <Download className="h-3.5 w-3.5" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); forceDownload(url, filename, prefix); }}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] transition-colors ${base}`}
      title={label}
    >
      <Download className="h-3 w-3" />
      {label}
    </button>
  );
}

function AudioPlayer({ src, outbound }: { src: string; outbound: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().catch(() => setError(true)); setPlaying(true); }
  };

  const onTimeUpdate = () => {
    const a = audioRef.current;
    if (!a) return;
    setCurrentTime(a.currentTime);
    setProgress(a.duration ? (a.currentTime / a.duration) * 100 : 0);
  };

  const onEnded = () => {
    setPlaying(false);
    setProgress(0);
    setCurrentTime(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
  };

  const onLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  };

  const onError = () => setError(true);

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - rect.left) / rect.width) * a.duration;
  };

  const fmt = (s: number) =>
    isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00";

  const filename = src.split("/").pop()?.split("?")[0] || "audio.ogg";

  if (error) {
    return (
      <div className="flex items-center gap-2 min-w-[160px] mt-0.5">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`h-4 w-4 shrink-0 ${outbound ? "text-white/70" : "text-muted-foreground"}`}>
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
        </svg>
        <span className={`text-[11px] ${outbound ? "text-white/70" : "text-muted-foreground"}`}>Áudio</span>
        <div className="ml-auto">
          <DownloadButton url={src} filename={filename} prefix="audio" outbound={outbound} label="Baixar" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-[200px] max-w-[240px] mt-0.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        onLoadedMetadata={onLoadedMetadata}
        onError={onError}
      />
      <button
        onClick={toggle}
        className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${outbound ? "bg-white/20 hover:bg-white/30 text-white" : "bg-emerald-100 hover:bg-emerald-200 text-emerald-700"}`}
      >
        {playing ? (
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
            <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <div className={`w-full h-1.5 rounded-full cursor-pointer ${outbound ? "bg-white/30" : "bg-muted-foreground/20"}`} onClick={seek}>
          <div className={`h-1.5 rounded-full ${outbound ? "bg-white" : "bg-emerald-500"}`} style={{ width: `${progress}%` }} />
        </div>
        <span className={`text-[10px] tabular-nums ${outbound ? "text-white/70" : "text-muted-foreground"}`}>
          {playing ? fmt(currentTime) : fmt(duration)}
        </span>
      </div>
      <DownloadButton url={src} filename={filename} prefix="audio" outbound={outbound} label="Baixar áudio" compact />
    </div>
  );
}

function ForwardModal({ msg, onClose }: { msg: any; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [forwarding, setForwarding] = useState(false);
  const { data: conversations } = useWhatsAppConversations();

  const filtered = (conversations || []).filter((c) =>
    c.client_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.client_phone || "").includes(search)
  );

  const selected = (conversations || []).find((c) => c.client_id === selectedId);

  const handleForward = async () => {
    if (!selected) return;
    setForwarding(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      let body: Record<string, any> = { client_id: selected.client_id, phone: selected.client_phone };

      if (msg.media_url) {
        const res = await fetch(msg.media_url);
        const blob = await res.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const filename = msg.media_url.split("/").pop()?.split("?")[0] || "arquivo";
        body = { ...body, media_base64: base64, media_mime_type: blob.type || "application/octet-stream", media_filename: filename };
      } else {
        body.message = msg.message_text;
      }

      const res2 = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        }
      );

      if (!res2.ok) {
        const err = await res2.json();
        throw new Error(err.error || "Erro ao encaminhar");
      }

      toast.success(`Mensagem encaminhada para ${selected.client_name}`);
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao encaminhar mensagem");
    } finally {
      setForwarding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-popover border rounded-2xl shadow-2xl w-[340px] max-h-[500px] flex flex-col z-10">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 className="font-semibold text-sm">Encaminhar mensagem</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 pb-3">
          <input
            autoFocus
            placeholder="Buscar contato..."
            className="w-full text-sm rounded-lg border px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5 min-h-0">
          {filtered.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-6">Nenhum contato encontrado</p>
          )}
          {filtered.map((conv) => (
            <button
              key={conv.client_id}
              onClick={() => setSelectedId(conv.client_id === selectedId ? null : conv.client_id)}
              className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors ${selectedId === conv.client_id ? "bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-emerald-400" : "hover:bg-muted"}`}
            >
              <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                {conv.client_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{conv.client_name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{conv.client_phone || ""}</p>
              </div>
              {selectedId === conv.client_id && (
                <svg className="h-4 w-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
        <div className="px-4 pb-4 pt-2 border-t">
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={!selectedId || forwarding}
            onClick={handleForward}
          >
            {forwarding ? "Encaminhando..." : "Encaminhar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function WhatsAppChat({ clientId, ticketId, clientPhone, clientName, hideHeader, className }: WhatsAppChatProps) {
  const qc = useQueryClient();
  const { data: messages, isLoading } = useWhatsAppMessages(clientId, ticketId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [mediaFile, setMediaFile] = useState<{ base64: string; mime: string; name: string } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [replyTo, setReplyTo] = useState<{ id: string; preview: string; direction: string } | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [forwardMsg, setForwardMsg] = useState<any | null>(null);

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
  const isSendingRef = useRef(false);

  // Realtime subscription — ouve por client_id e, quando disponível, por ticket_id
  useEffect(() => {
    if (!clientId) return;
    const invalidate = () => qc.invalidateQueries({ queryKey: ["whatsapp-messages", clientId, ticketId] });

    const channel = supabase
      .channel(`whatsapp-${clientId}-${ticketId ?? ""}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: `client_id=eq.${clientId}` }, invalidate)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "whatsapp_messages", filter: `client_id=eq.${clientId}` }, invalidate);

    if (ticketId) {
      channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: `ticket_id=eq.${ticketId}` }, invalidate)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "whatsapp_messages", filter: `ticket_id=eq.${ticketId}` }, invalidate);
    }

    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId, ticketId, qc]);

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

  const deleteMessage = async (msgId: string) => {
    const { error } = await supabase.from("whatsapp_messages").delete().eq("id", msgId);
    if (error) { toast.error("Erro ao apagar mensagem"); return; }
    qc.invalidateQueries({ queryKey: ["whatsapp-messages", clientId, ticketId] });
    toast.success("Mensagem apagada");
  };

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
      qc.invalidateQueries({ queryKey: ["whatsapp-messages", clientId, ticketId] });
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
    if (isSendingRef.current) return;
    if (!mediaFile && !draft.trim()) return;
    if (!clientPhone) return;
    isSendingRef.current = true;
    setSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const quotedPrefix = replyTo ? `↩ _${replyTo.preview}_\n\n` : "";
      const messageText = (quotedPrefix + (draft.trim() || "")).trim() || undefined;
      const body: Record<string, any> = { client_id: clientId, ticket_id: ticketId, phone: clientPhone, message: messageText };
      if (mediaFile) { body.media_base64 = mediaFile.base64; body.media_mime_type = mediaFile.mime; body.media_filename = mediaFile.name; }
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`,
        { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro ao enviar");
      setDraft("");
      setMediaFile(null);
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ["whatsapp-messages", clientId, ticketId] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar mensagem");
    } finally {
      isSendingRef.current = false;
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !mediaFile && !isSendingRef.current) { e.preventDefault(); sendMessage(); }
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
                {group.msgs.map((msg: any) => {
                  const outbound = msg.direction === "outbound";
                  const isTextMsg = !!msg.message_text && !msg.message_text.startsWith("🎵") && !msg.message_text.startsWith("📷") && !msg.message_text.startsWith("🎥") && !msg.message_text.startsWith("📎");
                  const hasMedia = !!msg.media_url;
                  return (
                    <div key={msg.id} className={`flex mb-1.5 group/msg ${outbound ? "justify-end" : "justify-start"}`}>
                      <div className="relative max-w-[75%]">
                        {/* Hover action button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === msg.id ? null : msg.id); }}
                          className={`absolute top-1.5 ${outbound ? "-left-6" : "-right-6"} opacity-0 group-hover/msg:opacity-100 transition-opacity h-5 w-5 rounded-full bg-background border shadow-sm flex items-center justify-center z-10 hover:bg-muted`}
                          title="Ações"
                        >
                          <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        </button>

                        {/* Dropdown menu */}
                        {openMenuId === msg.id && (
                          <div className={`absolute top-6 ${outbound ? "right-0" : "left-0"} z-30 bg-popover text-popover-foreground border rounded-xl shadow-xl py-1 min-w-[160px]`}>
                            <button
                              onClick={() => { setReplyTo({ id: msg.id, preview: getMessagePreview(msg), direction: msg.direction }); setOpenMenuId(null); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted text-left"
                            >
                              <CornerUpLeft className="h-3.5 w-3.5 text-muted-foreground" /> Responder
                            </button>
                            <button
                              onClick={() => { setForwardMsg(msg); setOpenMenuId(null); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted text-left"
                            >
                              <Forward className="h-3.5 w-3.5 text-muted-foreground" /> Encaminhar
                            </button>
                            {isTextMsg && (
                              <button
                                onClick={() => { navigator.clipboard.writeText(msg.message_text || ""); toast.success("Texto copiado"); setOpenMenuId(null); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted text-left"
                              >
                                <Copy className="h-3.5 w-3.5 text-muted-foreground" /> Copiar
                              </button>
                            )}
                            {hasMedia && (
                              <button
                                onClick={() => { forceDownload(msg.media_url, msg.media_url.split("/").pop()?.split("?")[0] || "arquivo"); setOpenMenuId(null); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted text-left"
                              >
                                <Download className="h-3.5 w-3.5 text-muted-foreground" /> Baixar
                              </button>
                            )}
                            {outbound && (
                              <>
                                <div className="my-1 border-t" />
                                <button
                                  onClick={() => { setOpenMenuId(null); deleteMessage(msg.id); }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 text-left"
                                >
                                  <Trash2 className="h-3.5 w-3.5" /> Apagar
                                </button>
                              </>
                            )}
                          </div>
                        )}

                        {/* Message bubble */}
                        <div className={`rounded-2xl px-3.5 py-2 text-sm ${outbound ? "bg-emerald-600 text-white rounded-br-md" : "bg-muted rounded-bl-md"}`}>
                          {!outbound && msg.sender_name && (
                            <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">{msg.sender_name}</p>
                          )}
                          {msg.message_text?.startsWith("🎵") ? (
                            msg.media_url
                              ? <AudioPlayer src={msg.media_url} outbound={outbound} />
                              : <span className="text-[12px] opacity-70 flex items-center gap-1.5">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 shrink-0"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                                  Áudio (não disponível)
                                </span>
                          ) : msg.message_text?.startsWith("📷") && !msg.media_url ? (
                            <span className="text-[12px] opacity-70 flex items-center gap-1.5">📷 Imagem (não disponível — peça reenvio)</span>
                          ) : msg.message_text?.startsWith("🎥") && !msg.media_url ? (
                            <span className="text-[12px] opacity-70 flex items-center gap-1.5">🎥 Vídeo (não disponível — peça reenvio)</span>
                          ) : msg.message_text?.startsWith("📎") && !msg.media_url ? (
                            <span className="text-[12px] opacity-70 flex items-center gap-1.5">📎 Arquivo (não disponível — peça reenvio)</span>
                          ) : msg.media_url && msg.message_text?.startsWith("📷") ? (
                            <div className="relative inline-block group/img">
                              <img
                                src={msg.media_url}
                                alt="imagem"
                                className="max-w-[200px] rounded-lg mt-0.5 cursor-pointer block"
                                onClick={() => window.open(msg.media_url, "_blank")}
                              />
                              <div className="absolute top-1 right-1">
                                <DownloadButton url={msg.media_url} filename={msg.media_url.split("/").pop()?.split("?")[0] || `imagem_${msg.id}.jpg`} prefix="imagem" outbound={outbound} label="Baixar imagem" compact />
                              </div>
                            </div>
                          ) : msg.media_url && msg.message_text?.startsWith("🎥") ? (
                            <div className="flex flex-col gap-1 mt-0.5">
                              <video controls src={msg.media_url} className="max-w-[220px] rounded-lg" />
                              <DownloadButton url={msg.media_url} filename={msg.media_url.split("/").pop()?.split("?")[0] || `video_${msg.id}.mp4`} prefix="video" outbound={outbound} label="Baixar vídeo" />
                            </div>
                          ) : msg.media_url ? (
                            <div className="flex items-center gap-2">
                              <a href={msg.media_url} target="_blank" rel="noreferrer" className="underline text-[13px]">{msg.message_text}</a>
                              <DownloadButton url={msg.media_url} filename={msg.media_url.split("/").pop()?.split("?")[0] || `arquivo_${msg.id}`} prefix="arquivo" outbound={outbound} label="Baixar" compact />
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{msg.message_text}</p>
                          )}
                          <div className={`flex items-center justify-end gap-0.5 mt-1 ${outbound ? "text-white/60" : "text-muted-foreground"}`}>
                            <span className="text-[9px]">{formatTime(msg.created_at)}</span>
                            {outbound && (
                              msg.status === "read" ? (
                                <CheckCheck size={12} className="flex-shrink-0 text-sky-300" />
                              ) : msg.status === "delivered" ? (
                                <CheckCheck size={12} className="flex-shrink-0" />
                              ) : (
                                <Check size={12} className="flex-shrink-0" />
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Click-outside overlay to close message menu */}
      {openMenuId && (
        <div className="fixed inset-0 z-20" onClick={() => setOpenMenuId(null)} />
      )}

      {/* Forward modal */}
      {forwardMsg && <ForwardModal msg={forwardMsg} onClose={() => setForwardMsg(null)} />}

      {/* Input area */}
      <div className="border-t pt-3 mt-2 pr-24">
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
            {replyTo && (
              <div className="flex items-center gap-2 mb-2 px-2.5 py-1.5 bg-muted rounded-lg border-l-[3px] border-emerald-500">
                <CornerUpLeft className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-emerald-600">Respondendo</p>
                  <p className="text-xs text-muted-foreground truncate">{replyTo.preview}</p>
                </div>
                <button onClick={() => setReplyTo(null)} className="shrink-0 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
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
