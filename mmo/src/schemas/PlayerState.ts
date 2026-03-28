import { Schema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string") sessionId: string = "";
  @type("string") userId: string = "";
  @type("string") name: string = "";
  @type("string") gender: string = "female";
  @type("string") preset: string = "hanako";
  @type("string") expression: string = "normal";
  @type("string") pose: string = "standing";
  @type("string") lipMode: string = "off";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") status: string = "idle"; // idle | talking | battle
  @type("number") hp: number = 100;
  @type("number") maxHp: number = 100;
  @type("number") mp: number = 50;
  @type("number") level: number = 1;
}
