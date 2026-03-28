// === WorldRoom Messages ===

export interface WorldMoveRequest {
  direction: "north" | "south" | "east" | "west";
}

export interface WorldInteractRequest {
  targetId: string;
}

export interface WorldExpressionRequest {
  expression: string;
}

export interface WorldPoseRequest {
  pose: string;
}

export interface WorldZoneChangeResponse {
  zoneId: string;
  zoneName: string;
}

export interface WorldNPCDialogueResponse {
  npcId: string;
  npcName: string;
  text: string; // inline tags included
}

// === ChatRoom Messages ===

export interface ChatRequest {
  text: string;
  channel: "global" | "zone" | "party" | "whisper";
  targetId?: string;
}

export interface ChatMessageEvent {
  sender: string;
  text: string;
  channel: "global" | "zone" | "party" | "whisper";
  whisper?: boolean;
  timestamp: number;
}

// === BattleRoom Messages ===

export interface BattleActionRequest {
  type: "attack" | "skill" | "item" | "defend" | "flee";
  targetId?: string;
  itemId?: string;
}

export interface BattleActionResultEvent {
  actorId: string;
  actorName: string;
  type: string;
  targetId?: string;
  targetName?: string;
  damage?: number;
  heal?: number;
  log: string; // inline tags included
}

export interface BattlePhaseChangeEvent {
  phase: string;
  currentActorId?: string;
}

export interface BattleResultEvent {
  result: "win" | "lose" | "flee";
  expGained?: number;
  goldGained?: number;
  drops?: { itemId: string; name: string }[];
  log: string;
}

// === TradeRoom Messages ===

export interface TradeOfferRequest {
  itemId: string;
  quantity: number;
  priceGold: number;
}

export interface TradeAcceptRequest {
  offerId: string;
}

export interface TradeCancelRequest {
  offerId: string;
}

export interface TradeOfferEvent {
  offerId: string;
  sellerId: string;
  sellerName: string;
  itemId: string;
  itemName: string;
  quantity: number;
  priceGold: number;
}

export interface TradeCompleteEvent {
  offerId: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  itemName: string;
  quantity: number;
  priceGold: number;
}

// === Error Messages ===

export interface AppError {
  code: AppErrorCode;
  message: string;
}

export type AppErrorCode =
  | "AUTH_INVALID_TOKEN"
  | "AUTH_EXPIRED_TOKEN"
  | "AUTH_SUSPENDED"
  | "ZONE_NOT_FOUND"
  | "ZONE_FULL"
  | "ZONE_NO_ADJACENT"
  | "NPC_NOT_FOUND"
  | "CHAT_RATE_LIMITED"
  | "CHAT_EMPTY"
  | "CHAT_TOO_LONG"
  | "CHAT_TARGET_NOT_FOUND"
  | "BATTLE_NOT_YOUR_TURN"
  | "BATTLE_INVALID_ACTION"
  | "BATTLE_INVALID_TARGET"
  | "BATTLE_ALREADY_DEAD"
  | "TRADE_ITEM_NOT_OWNED"
  | "TRADE_OFFER_NOT_FOUND"
  | "TRADE_INSUFFICIENT_GOLD"
  | "TRADE_SELF_TRADE"
  | "GENERAL_ERROR";
