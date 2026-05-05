import { describe, it, expect } from "vitest";

// Pure functions extracted for testability
function normalizeInstagramConversation(row: {
  id: string;
  ig_sender_id: string;
  sender_username: string | null;
  sender_picture: string | null;
  last_message: string | null;
  last_message_at: string;
  unread_count: number;
  assigned_user_id: string | null;
  client_id: string | null;
}) {
  return {
    ...row,
    channel: "instagram" as const,
    display_name: row.sender_username ? `@${row.sender_username}` : `IG ${row.ig_sender_id.slice(-6)}`,
  };
}

function mergeAndSortConversations(
  whatsapp: Array<{ last_message_at: string; channel: "whatsapp" }>,
  instagram: Array<{ last_message_at: string; channel: "instagram" }>
) {
  return [...whatsapp, ...instagram].sort(
    (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  );
}

describe("normalizeInstagramConversation", () => {
  it("usa @username quando disponível", () => {
    const result = normalizeInstagramConversation({
      id: "1", ig_sender_id: "123456789", sender_username: "ana_pilates",
      sender_picture: null, last_message: "oi", last_message_at: "2026-05-05T10:00:00Z",
      unread_count: 1, assigned_user_id: null, client_id: null,
    });
    expect(result.display_name).toBe("@ana_pilates");
    expect(result.channel).toBe("instagram");
  });

  it("usa últimos 6 dígitos do ig_sender_id quando sem username", () => {
    const result = normalizeInstagramConversation({
      id: "2", ig_sender_id: "987654321000", sender_username: null,
      sender_picture: null, last_message: null, last_message_at: "2026-05-05T09:00:00Z",
      unread_count: 0, assigned_user_id: null, client_id: null,
    });
    expect(result.display_name).toBe("IG 321000");
  });
});

describe("mergeAndSortConversations", () => {
  it("ordena por last_message_at decrescente misturando canais", () => {
    const waMsgs = [
      { last_message_at: "2026-05-05T08:00:00Z", channel: "whatsapp" as const },
    ];
    const igMsgs = [
      { last_message_at: "2026-05-05T10:00:00Z", channel: "instagram" as const },
      { last_message_at: "2026-05-05T07:00:00Z", channel: "instagram" as const },
    ];
    const result = mergeAndSortConversations(waMsgs, igMsgs);
    expect(result[0].channel).toBe("instagram");
    expect(result[0].last_message_at).toBe("2026-05-05T10:00:00Z");
    expect(result[1].channel).toBe("whatsapp");
    expect(result[2].channel).toBe("instagram");
  });
});
