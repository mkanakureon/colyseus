import { Schema, type, MapSchema } from "@colyseus/schema";

export class BattlerState extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("number") hp: number = 100;
  @type("number") maxHp: number = 100;
  @type("number") mp: number = 50;
  @type("number") attack: number = 10;
  @type("number") defense: number = 5;
  @type("string") status: string = "alive"; // alive | dead | fled
  @type("boolean") isPlayer: boolean = true;
}

export class BattleState extends Schema {
  @type("string") phase: string = "waiting"; // waiting | selecting | executing | result
  @type("number") turn: number = 0;
  @type({ map: BattlerState }) battlers = new MapSchema<BattlerState>();
  @type("string") currentActorId: string = "";
  @type("string") log: string = "";
  @type("string") result: string = ""; // win | lose | flee
}
