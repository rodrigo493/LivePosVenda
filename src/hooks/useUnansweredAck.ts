import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";

function storageKey(userId: string) {
  return `unanswered_ack_at_${userId}`;
}

function readAck(userId: string): string | null {
  try {
    return localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

function writeAck(userId: string, iso: string) {
  try {
    localStorage.setItem(storageKey(userId), iso);
  } catch { /* ignorar */ }
}

// Ack por usuário — armazenado em localStorage, sem tabela global
export function useUnansweredAck() {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const [ackAt, setAckAt] = useState<string | null>(() =>
    userId ? readAck(userId) : null
  );
  const [isAcking, setIsAcking] = useState(false);

  const ack = useCallback(() => {
    if (!userId) return;
    setIsAcking(true);
    const now = new Date().toISOString();
    writeAck(userId, now);
    setAckAt(now);
    setIsAcking(false);
  }, [userId]);

  return { ackAt, ack, isAcking };
}
