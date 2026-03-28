import { Room, Client } from "colyseus";
import { Schema, type, MapSchema } from "@colyseus/schema";
import { KaedevnAuthAdapter, type KaedevnTokenPayload } from "../auth/KaedevnAuthAdapter.ts";
import { type IPlayerPersistence } from "../persistence/PlayerPersistence.ts";
import type { TradeOfferRequest, TradeAcceptRequest, TradeCancelRequest, TradeOfferEvent, TradeCompleteEvent, AppError } from "../types/messages.ts";

class TradePlayerState extends Schema {
  @type("string") sessionId: string = "";
  @type("string") userId: string = "";
  @type("string") name: string = "";
  @type("number") gold: number = 0;
}

class TradeOfferState extends Schema {
  @type("string") offerId: string = "";
  @type("string") sellerId: string = "";
  @type("string") sellerName: string = "";
  @type("string") itemId: string = "";
  @type("string") itemName: string = "";
  @type("number") quantity: number = 0;
  @type("number") priceGold: number = 0;
}

class TradeState extends Schema {
  @type({ map: TradePlayerState }) players = new MapSchema<TradePlayerState>();
  @type({ map: TradeOfferState }) offers = new MapSchema<TradeOfferState>();
}

interface PlayerInventory {
  itemId: string;
  name: string;
  quantity: number;
}

export class TradeRoom extends Room<TradeState> {
  static authAdapterInstance: KaedevnAuthAdapter;
  static playerDBInstance: IPlayerPersistence;

  private authAdapter!: KaedevnAuthAdapter;
  private playerDB!: IPlayerPersistence;
  private playerInventories = new Map<string, PlayerInventory[]>(); // userId -> items
  private playerGold = new Map<string, number>();
  private clientToUser = new Map<string, string>(); // sessionId -> userId
  private offerCounter = 0;

  onCreate() {
    this.setState(new TradeState());
    this.authAdapter = TradeRoom.authAdapterInstance;
    this.playerDB = TradeRoom.playerDBInstance;

    this.onMessage("offer", (client, data: TradeOfferRequest) => this.handleOffer(client, data));
    this.onMessage("accept", (client, data: TradeAcceptRequest) => this.handleAccept(client, data));
    this.onMessage("cancel", (client, data: TradeCancelRequest) => this.handleCancel(client, data));
  }

  async onAuth(client: Client, options: { token?: string }): Promise<KaedevnTokenPayload> {
    const token = options.token;
    if (!token) throw new Error("No token provided");
    const payload = this.authAdapter.verify(token);
    if (!payload) throw new Error("Invalid or expired token");
    return payload;
  }

  async onJoin(client: Client, options: any, auth: KaedevnTokenPayload) {
    const player = new TradePlayerState();
    player.sessionId = client.sessionId;
    player.userId = auth.userId;
    player.name = options.name || auth.userId;
    player.gold = options.gold ?? 100;
    this.state.players.set(client.sessionId, player);
    this.clientToUser.set(client.sessionId, auth.userId);
    this.playerGold.set(auth.userId, options.gold ?? 100);

    // Load inventory from options (for testing)
    if (options.inventory) {
      this.playerInventories.set(auth.userId, [...options.inventory]);
    } else {
      this.playerInventories.set(auth.userId, []);
    }
  }

  async onLeave(client: Client) {
    const userId = this.clientToUser.get(client.sessionId);
    if (userId) {
      // Remove all offers by this player
      const toRemove: string[] = [];
      this.state.offers.forEach((offer, id) => {
        if (offer.sellerId === userId) toRemove.push(id);
      });
      toRemove.forEach(id => this.state.offers.delete(id));
      this.clientToUser.delete(client.sessionId);
    }
    this.state.players.delete(client.sessionId);
  }

  private handleOffer(client: Client, data: TradeOfferRequest) {
    const userId = this.clientToUser.get(client.sessionId);
    if (!userId) return;

    const inventory = this.playerInventories.get(userId) || [];
    const item = inventory.find(i => i.itemId === data.itemId);
    if (!item || item.quantity < data.quantity) {
      client.send("error", { code: "TRADE_ITEM_NOT_OWNED", message: "アイテムを所持していません" } satisfies AppError);
      return;
    }

    const offerId = `offer-${++this.offerCounter}`;
    const player = this.state.players.get(client.sessionId)!;

    const offer = new TradeOfferState();
    offer.offerId = offerId;
    offer.sellerId = userId;
    offer.sellerName = player.name;
    offer.itemId = data.itemId;
    offer.itemName = item.name;
    offer.quantity = data.quantity;
    offer.priceGold = data.priceGold;
    this.state.offers.set(offerId, offer);

    this.broadcast("trade_offer", {
      offerId,
      sellerId: userId,
      sellerName: player.name,
      itemId: data.itemId,
      itemName: item.name,
      quantity: data.quantity,
      priceGold: data.priceGold,
    } satisfies TradeOfferEvent);
  }

  private handleAccept(client: Client, data: TradeAcceptRequest) {
    const buyerId = this.clientToUser.get(client.sessionId);
    if (!buyerId) return;

    const offer = this.state.offers.get(data.offerId);
    if (!offer) {
      client.send("error", { code: "TRADE_OFFER_NOT_FOUND", message: "オファーが見つかりません" } satisfies AppError);
      return;
    }

    if (offer.sellerId === buyerId) {
      client.send("error", { code: "TRADE_SELF_TRADE", message: "自分のオファーは購入できません" } satisfies AppError);
      return;
    }

    const buyerGold = this.playerGold.get(buyerId) || 0;
    if (buyerGold < offer.priceGold) {
      client.send("error", { code: "TRADE_INSUFFICIENT_GOLD", message: "ゴールドが足りません" } satisfies AppError);
      return;
    }

    // Execute trade
    // Deduct gold from buyer
    this.playerGold.set(buyerId, buyerGold - offer.priceGold);
    // Add gold to seller
    const sellerGold = this.playerGold.get(offer.sellerId) || 0;
    this.playerGold.set(offer.sellerId, sellerGold + offer.priceGold);

    // Transfer item
    const sellerInv = this.playerInventories.get(offer.sellerId) || [];
    const sellerItem = sellerInv.find(i => i.itemId === offer.itemId);
    if (sellerItem) {
      sellerItem.quantity -= offer.quantity;
      if (sellerItem.quantity <= 0) {
        const idx = sellerInv.indexOf(sellerItem);
        sellerInv.splice(idx, 1);
      }
    }

    const buyerInv = this.playerInventories.get(buyerId) || [];
    const existingItem = buyerInv.find(i => i.itemId === offer.itemId);
    if (existingItem) {
      existingItem.quantity += offer.quantity;
    } else {
      buyerInv.push({ itemId: offer.itemId, name: offer.itemName, quantity: offer.quantity });
    }

    // Update state
    const buyerPlayer = this.state.players.get(client.sessionId);
    if (buyerPlayer) buyerPlayer.gold = this.playerGold.get(buyerId)!;

    // Find seller client and update their state
    this.state.players.forEach((p) => {
      if (p.userId === offer.sellerId) {
        p.gold = this.playerGold.get(offer.sellerId)!;
      }
    });

    const buyerName = buyerPlayer?.name || buyerId;

    // Remove offer
    this.state.offers.delete(data.offerId);

    this.broadcast("trade_complete", {
      offerId: data.offerId,
      buyerId,
      buyerName,
      sellerId: offer.sellerId,
      sellerName: offer.sellerName,
      itemName: offer.itemName,
      quantity: offer.quantity,
      priceGold: offer.priceGold,
    } satisfies TradeCompleteEvent);
  }

  private handleCancel(client: Client, data: TradeCancelRequest) {
    const userId = this.clientToUser.get(client.sessionId);
    if (!userId) return;

    const offer = this.state.offers.get(data.offerId);
    if (!offer) {
      client.send("error", { code: "TRADE_OFFER_NOT_FOUND", message: "オファーが見つかりません" } satisfies AppError);
      return;
    }

    if (offer.sellerId !== userId) {
      client.send("error", { code: "TRADE_OFFER_NOT_FOUND", message: "自分のオファーではありません" } satisfies AppError);
      return;
    }

    this.state.offers.delete(data.offerId);
    client.send("trade_cancelled", { offerId: data.offerId });
  }
}
