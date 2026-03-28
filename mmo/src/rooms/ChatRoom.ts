import { Room, Client } from "colyseus";
import { Schema, type, MapSchema } from "@colyseus/schema";
import { KaedevnAuthAdapter, type KaedevnTokenPayload } from "../auth/KaedevnAuthAdapter.ts";
import type { ChatRequest, ChatMessageEvent, AppError } from "../types/messages.ts";

class ChatPlayerState extends Schema {
  @type("string") sessionId: string = "";
  @type("string") userId: string = "";
  @type("string") name: string = "";
  @type("string") zoneId: string = "";
}

class ChatState extends Schema {
  @type({ map: ChatPlayerState }) players = new MapSchema<ChatPlayerState>();
}

const MAX_MESSAGE_LENGTH = 200;
const RATE_LIMIT_MS = 500; // min interval between messages

export class ChatRoom extends Room<ChatState> {
  static authAdapterInstance: KaedevnAuthAdapter;

  private authAdapter!: KaedevnAuthAdapter;
  private lastMessageTime = new Map<string, number>();

  onCreate() {
    this.setState(new ChatState());
    this.authAdapter = ChatRoom.authAdapterInstance;

    this.onMessage("chat", (client, data: ChatRequest) => this.handleChat(client, data));
  }

  async onAuth(client: Client, options: { token?: string }): Promise<KaedevnTokenPayload> {
    const token = options.token;
    if (!token) throw new Error("No token provided");
    const payload = this.authAdapter.verify(token);
    if (!payload) throw new Error("Invalid or expired token");
    return payload;
  }

  async onJoin(client: Client, options: any, auth: KaedevnTokenPayload) {
    const player = new ChatPlayerState();
    player.sessionId = client.sessionId;
    player.userId = auth.userId;
    player.name = options.name || auth.userId;
    player.zoneId = options.zoneId || "";
    this.state.players.set(client.sessionId, player);
  }

  async onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.lastMessageTime.delete(client.sessionId);
  }

  private handleChat(client: Client, data: ChatRequest) {
    // Validate empty
    if (!data.text || data.text.trim().length === 0) {
      client.send("error", { code: "CHAT_EMPTY", message: "メッセージが空です" } satisfies AppError);
      return;
    }

    // Validate length
    if (data.text.length > MAX_MESSAGE_LENGTH) {
      client.send("error", { code: "CHAT_TOO_LONG", message: `メッセージは${MAX_MESSAGE_LENGTH}文字以内です` } satisfies AppError);
      return;
    }

    // Rate limit
    const now = Date.now();
    const lastTime = this.lastMessageTime.get(client.sessionId) || 0;
    if (now - lastTime < RATE_LIMIT_MS) {
      client.send("error", { code: "CHAT_RATE_LIMITED", message: "送信が速すぎます" } satisfies AppError);
      return;
    }
    this.lastMessageTime.set(client.sessionId, now);

    const sender = this.state.players.get(client.sessionId);
    if (!sender) return;

    const event: ChatMessageEvent = {
      sender: sender.name,
      text: data.text,
      channel: data.channel || "global",
      timestamp: now,
    };

    switch (data.channel) {
      case "global":
        this.broadcast("chat_message", event);
        break;

      case "zone": {
        // Send only to players in the same zone
        this.clients.forEach((c) => {
          const p = this.state.players.get(c.sessionId);
          if (p && p.zoneId === sender.zoneId) {
            c.send("chat_message", event);
          }
        });
        break;
      }

      case "whisper": {
        if (!data.targetId) {
          client.send("error", { code: "CHAT_TARGET_NOT_FOUND", message: "ウィスパー先が指定されていません" } satisfies AppError);
          return;
        }
        // Find target by userId
        let targetClient: Client | undefined;
        this.clients.forEach((c) => {
          const p = this.state.players.get(c.sessionId);
          if (p && p.userId === data.targetId) {
            targetClient = c;
          }
        });
        if (!targetClient) {
          client.send("error", { code: "CHAT_TARGET_NOT_FOUND", message: "対象プレイヤーが見つかりません" } satisfies AppError);
          return;
        }
        const whisperEvent = { ...event, whisper: true };
        targetClient.send("chat_message", whisperEvent);
        client.send("chat_message", whisperEvent); // echo back to sender
        break;
      }

      default:
        this.broadcast("chat_message", event);
        break;
    }
  }
}
