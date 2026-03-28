import { Schema, type, MapSchema } from "@colyseus/schema";
import { PlayerState } from "./PlayerState.ts";

export class NPCState extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("string") expression: string = "normal";
  @type("string") pose: string = "standing";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") dialogue: string = "";
}

export class WorldState extends Schema {
  @type("string") zoneId: string = "";
  @type("string") zoneName: string = "";
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: NPCState }) npcs = new MapSchema<NPCState>();
  @type("number") time: number = 0;
  @type("string") weather: string = "clear";
}
