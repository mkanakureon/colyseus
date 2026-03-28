/**
 * Text MMO Browser Client v2
 *
 * All message handlers registered ONCE in setupWorldRoom().
 * Screen rendering is driven by state, not by onMessage callbacks.
 */

const ENDPOINT = `ws://${location.hostname}:3001`;

// ── DOM ──
const $ = id => document.getElementById(id);
const leftPanel = $("left-panel");
const rightPanel = $("right-panel");
const choicesEl = $("choices");
const textInput = $("text-input");
const hdrPlayer = $("hdr-player");
const hdrHp = $("hdr-hp");
const hdrZone = $("hdr-zone");

// ── State ──
let client = null;
let worldRoom = null;
let chatRoom = null;
let battleRoom = null;
let screen = "login";
let player = { name: "", level: 1, hp: 100, maxHp: 100, mp: 50, maxMp: 50 };
let zoneInfo = null;
let chatLog = [];
let sysLog = [];
let dialogueData = null;
let dialogueIdx = 0;
let battleLog = [];
let shopData = null;
let statusCache = null;
let invCache = null;
let questCache = null;

// ── Helpers ──
function h(el, s) { el.innerHTML = s; }
function showRight() { rightPanel.classList.remove("hidden"); leftPanel.classList.remove("full"); }
function hideRight() { rightPanel.classList.add("hidden"); leftPanel.classList.add("full"); }

function hpBar(cur, max, w = 10) {
  const r = max > 0 ? cur / max : 0;
  const f = Math.round(r * w);
  const c = r > 0.7 ? "fill" : r > 0.3 ? "fill mid" : "fill low";
  return `<span class="hp-bar"><span class="${c}">${"#".repeat(f)}</span><span class="empty">${"-".repeat(w - f)}</span></span> ${cur}/${max}`;
}

function strip(t) {
  return (t||"").replace(/\[e:\w+\]/g,"").replace(/\[p:\w+\]/g,"").replace(/\[click\]/g,"").replace(/\[wait:\d+\]/g,"").replace(/\[t\]|\[w\]|\[s\]/g,"");
}

const EMO = { happy:"笑顔", sad:"悲しみ", angry:"怒り", surprised:"驚き", neutral:"" };

function setChoices(items) {
  textInput.classList.remove("visible");
  textInput.onkeydown = null;
  h(choicesEl, items.map(([k,l,a]) =>
    `<button class="choice-btn" data-a="${a||k}">[${k}] ${l}</button>`
  ).join(""));
  choicesEl.querySelectorAll(".choice-btn").forEach(b => b.onclick = () => act(b.dataset.a));
}

function showInput(ph, fn) {
  h(choicesEl, `<button class="choice-btn" data-a="back">[0] 戻る</button>`);
  choicesEl.querySelector(".choice-btn").onclick = () => act("back");
  textInput.classList.add("visible");
  textInput.placeholder = ph;
  textInput.value = "";
  textInput.focus();
  textInput.onkeydown = e => { if (e.key === "Enter" && textInput.value.trim()) { fn(textInput.value.trim()); textInput.value = ""; } };
}

function updHeader() {
  hdrPlayer.textContent = player.name ? `${player.name} Lv.${player.level}` : "---";
  hdrHp.textContent = player.name ? `HP:${player.hp}/${player.maxHp} MP:${player.mp}/${player.maxMp}` : "";
  hdrHp.className = (player.hp / player.maxHp < 0.3) ? "hp low" : "hp";
  hdrZone.textContent = player.zoneName || "";
}

function sysMsg(t) { sysLog.push(t); if (sysLog.length > 15) sysLog.shift(); }

// ── Render functions (pure, no onMessage) ──

function render() {
  updHeader();
  switch (screen) {
    case "login": rLogin(); break;
    case "create": rCreate(); break;
    case "world": rWorld(); break;
    case "dialogue": rDialogue(); break;
    case "battle": rBattle(); break;
    case "victory": rVictory(); break;
    case "defeat": rDefeat(); break;
    case "status": rStatus(); break;
    case "inventory": rInventory(); break;
    case "chat": rChat(); break;
    case "shop": rShop(); break;
  }
}

function rLogin() {
  hideRight();
  hdrZone.textContent = "接続中...";
  h(leftPanel, `<div class="center-text"><div style="color:var(--accent)">Text MMO</div><div class="system-msg" style="margin-top:12px">接続中...</div></div>`);
  setChoices([]);
}

function rCreate() {
  hideRight();
  hdrZone.textContent = "キャラクター作成";
  h(leftPanel, `
    <div style="max-width:400px;margin:20px auto">
      <div class="section-title">名前</div>
      <input type="text" id="char-name" style="width:100%;padding:8px;background:var(--bg);color:var(--text);border:1px solid var(--border);font-family:var(--font);font-size:14px;border-radius:4px" placeholder="名前を入力" autofocus>
      <div class="section-title">職業</div>
      <button class="choice-btn" style="width:100%;margin:4px 0" onclick="doCreate('warrior')">[1] 戦士 (HP↑ ATK↑ DEF↑)</button>
      <button class="choice-btn" style="width:100%;margin:4px 0" onclick="doCreate('mage')">[2] 魔法使い (MP↑ MAG↑)</button>
      <button class="choice-btn" style="width:100%;margin:4px 0" onclick="doCreate('thief')">[3] 盗賊 (SPD↑)</button>
    </div>
  `);
  setChoices([]);
}
window.doCreate = cls => {
  const n = document.getElementById("char-name")?.value?.trim();
  if (!n) return alert("名前を入力してください");
  worldRoom.send("create_character", { name: n, classType: cls, gender: "male" });
};

function rWorld() {
  showRight();
  let left = "";
  if (zoneInfo) left += `<div style="margin-bottom:8px">${zoneInfo.description || ""}</div>`;
  if (sysLog.length) left += sysLog.map(m => `<div class="system-msg">${m}</div>`).join("");
  h(leftPanel, left || `<div class="system-msg">周囲を見渡す...</div>`);

  let right = "";
  if (worldRoom?.state?.players) {
    const others = [];
    worldRoom.state.players.forEach(p => { if (p.name !== player.name) others.push(p); });
    if (others.length) {
      right += `<div class="section-title">ここにいる人</div>`;
      others.forEach(p => { right += `<div><span class="player-name">${p.name}</span> Lv.${p.level}</div>`; });
    }
  }
  if (zoneInfo?.npcs?.length) {
    right += `<div class="section-title">NPC</div>`;
    zoneInfo.npcs.forEach(n => { right += `<div class="npc-name">${n.name}</div>`; });
  }
  if (zoneInfo?.adjacentZones?.length) {
    const D = { north:"北", south:"南", east:"東", west:"西" };
    right += `<div class="section-title">方角</div>`;
    zoneInfo.adjacentZones.forEach(a => { right += `<div>${D[a.direction]||a.direction}: ${a.zoneName||a.zoneId}</div>`; });
  }
  h(rightPanel, right || `<div class="system-msg">---</div>`);

  const ch = [];
  let n = 1;
  const D = { north:"北", south:"南", east:"東", west:"西" };
  if (zoneInfo?.adjacentZones) zoneInfo.adjacentZones.forEach(a => ch.push([n++, `${D[a.direction]}へ移動`, `move:${a.direction}`]));
  if (zoneInfo?.npcs) zoneInfo.npcs.forEach(npc => ch.push([n++, npc.name, `npc:${npc.id}`]));
  if (zoneInfo && !zoneInfo.isSafe) ch.push([n++, "探索する", "explore"]);
  ch.push([n++, "チャット", "chat"]);
  ch.push([n++, "ステータス", "status"]);
  setChoices(ch);
}

function rDialogue() {
  if (!dialogueData) { screen = "world"; render(); return; }
  showRight();
  const nodes = dialogueData.nodes || [];
  if (dialogueIdx >= nodes.length) { screen = "world"; render(); return; }
  const node = nodes[dialogueIdx];

  let left = `<div class="section-title">${dialogueData.npcName}</div>`;
  for (let i = 0; i <= dialogueIdx; i++) {
    const nd = nodes[i];
    const em = EMO[nd.emotion] || "";
    left += `<div>`;
    if (em) left += `<span class="emotion-tag">[${em}]</span> `;
    left += `<span class="npc-name">${nd.speaker}</span></div>`;
    left += `<div class="dialogue-text">${strip(nd.text)}</div>`;
  }
  h(leftPanel, left);

  let right = "";
  if (dialogueData.memory) {
    const r = dialogueData.memory.relationScore || 0;
    right += `<div class="section-title">関係値</div><div>${r > 0 ? "+".repeat(Math.min(r/5,20)) : r < 0 ? "-".repeat(Math.min(-r/5,20)) : "0"} (${r})</div>`;
    right += `<div class="section-title">会話回数</div><div>${dialogueData.memory.interactionCount||0}</div>`;
  }
  right += `<div class="section-title">会話</div><div>${dialogueData.label||""}</div>`;
  if (dialogueData.source) right += `<div class="text-dim">${dialogueData.source}</div>`;
  h(rightPanel, right);

  const ch = [];
  let cn = 1;
  if (node.choices?.length) {
    node.choices.forEach((c,i) => ch.push([cn++, c.label, `choice:${c.next}`]));
  } else if (dialogueIdx < nodes.length - 1) {
    ch.push([cn++, "次へ", "dnext"]);
  }

  // Last node: show shop/quest buttons if NPC has them
  if (dialogueIdx >= nodes.length - 1 || !node.choices?.length) {
    const npcId = dialogueData.npcId;
    const npcInfo = zoneInfo?.npcs?.find(n => n.id === npcId);
    if (npcInfo?.shop) ch.push([cn++, "ショップ", `shop:${npcInfo.shop}`]);
    if (npcInfo?.quests?.length) ch.push([cn++, "クエスト", `quest_list:${npcId}`]);
  }

  ch.push([0, "戻る", "back"]);
  setChoices(ch);
}

function rBattle() {
  showRight();
  let left = battleLog.map(e => {
    if (e.type === "turn") return `<div class="log-turn">── ターン ${e.turn} ──</div>`;
    if (e.type === "result") return `<div class="log-entry ${e.win?'success':'danger'}">${strip(e.text)}</div>`;
    return `<div class="log-entry">${strip(e.text)}</div>`;
  }).join("");
  h(leftPanel, left || `<div class="system-msg">戦闘開始!</div>`);
  leftPanel.scrollTop = leftPanel.scrollHeight;

  let right = "";
  if (battleRoom?.state?.battlers) {
    const allies = [], enemies = [];
    battleRoom.state.battlers.forEach(b => (b.isPlayer ? allies : enemies).push(b));
    right += `<div class="section-title">味方</div>`;
    allies.forEach(b => { right += `<div class="player-name">${b.name}</div><div>HP ${hpBar(b.hp,b.maxHp)}</div><div style="margin-bottom:4px">MP ${hpBar(b.mp,50,6)}</div>`; });
    right += `<div class="section-title">敵</div>`;
    enemies.forEach(b => { right += `<div>${b.name}</div><div>HP ${hpBar(b.hp,b.maxHp)}</div>`; });
  }
  h(rightPanel, right);

  if (battleRoom?.state?.phase === "selecting") {
    setChoices([[1,"攻撃","b:attack"],[2,"防御","b:defend"],[3,"アイテム","b:item"],[4,"逃走","b:flee"]]);
  } else { setChoices([]); }
}

function rVictory() {
  showRight();
  const d = player._victory;
  if (!d) { screen = "world"; render(); return; }
  let left = `<div class="success" style="font-size:16px;margin-bottom:12px">勝利!</div><div>${strip(d.log)}</div>`;
  if (d.levelUps) Object.values(d.levelUps).forEach(lv => {
    left += `<div class="success" style="margin-top:8px">★ Lv UP! Lv.${lv.newLevel}</div>`;
    const s = lv.statChanges; if (s.hp) left += `<div>HP+${s.hp}</div>`; if (s.atk) left += `<div>ATK+${s.atk}</div>`;
  });
  h(leftPanel, left);
  let right = `<div class="section-title">獲得</div><div>EXP +${d.expGained}</div><div>Gold +${d.goldGained}</div>`;
  if (d.drops?.length) { right += `<div class="section-title">ドロップ</div>`; d.drops.forEach(x => right += `<div>${x.name}</div>`); }
  h(rightPanel, right);
  setChoices([[1, "続ける", "back"]]);
}

function rDefeat() {
  hideRight();
  h(leftPanel, `<div class="center-text"><div class="danger" style="font-size:18px;margin-bottom:20px">全滅...</div><div>意識が遠のく…</div><div style="margin-top:12px">気がつくと村の井戸の前にいた。</div><div style="margin-top:12px;color:var(--warning)">HP/MP全回復</div></div>`);
  setChoices([[1, "続ける", "back"]]);
}

function rStatus() {
  showRight();
  if (!statusCache) { h(leftPanel, `<div class="system-msg">読み込み中...</div>`); setChoices([[0,"戻る","back"]]); return; }
  const d = statusCache;
  const cn = { warrior:"戦士", mage:"魔法使い", thief:"盗賊" };
  let left = `<div class="section-title">キャラクター</div>`;
  left += `<div class="stat-row"><span class="stat-label">名前</span><span>${d.name}</span></div>`;
  left += `<div class="stat-row"><span class="stat-label">職業</span><span>${cn[d.classType]||d.classType}</span></div>`;
  left += `<div class="stat-row"><span class="stat-label">レベル</span><span>Lv.${d.level} (EXP:${d.exp})</span></div>`;
  left += `<div class="section-title">ステータス</div>`;
  left += `<div>HP ${hpBar(d.hp,d.maxHp,15)}</div><div>MP ${hpBar(d.mp,d.maxMp,10)}</div>`;
  ["atk","def","mag","spd"].forEach(k => left += `<div class="stat-row"><span class="stat-label">${k.toUpperCase()}</span><span>${d[k]}</span></div>`);
  left += `<div class="section-title">所持金</div><div>${d.gold}G</div>`;
  h(leftPanel, left);

  let right = `<div class="section-title">クエスト</div>`;
  if (questCache) {
    const q = Object.entries(questCache);
    if (q.length === 0) right += `<div class="system-msg">なし</div>`;
    else q.forEach(([id,v]) => { right += `<div class="${v.status==="completed"?"quest-done":"quest-active"}">${id} [${v.status==="completed"?"完了":"進行中"}]</div>`; });
  }
  h(rightPanel, right);
  setChoices([[1,"装備","equip"],[2,"インベントリ","inventory"],[0,"戻る","back"]]);
}

function rInventory() {
  hideRight();
  if (!invCache) { h(leftPanel, `<div class="system-msg">読み込み中...</div>`); setChoices([[0,"戻る","back"]]); return; }
  let left = `<div class="section-title">インベントリ (Gold: ${invCache.gold}G)</div>`;
  if (invCache.inventory.length === 0) left += `<div class="system-msg">何も持っていない</div>`;
  else invCache.inventory.forEach((it,i) => { left += `<div class="item-row"><span>[${i+1}] ${it.name} x${it.quantity}</span><span class="text-dim">${it.type}</span></div>`; });
  h(leftPanel, left);
  setChoices([[0,"戻る","back"]]);
}

function rChat() {
  showRight();
  h(leftPanel, chatLog.slice(-30).map(m => m.whisper
    ? `<div class="warning" style="margin-left:12px">(ひそひそ) ${m.sender}: ${m.text}</div>`
    : `<div><span class="player-name">${m.sender}</span>: ${m.text}</div>`
  ).join("") || `<div class="system-msg">チャットログなし</div>`);
  leftPanel.scrollTop = leftPanel.scrollHeight;

  let right = `<div class="section-title">オンライン</div>`;
  if (worldRoom?.state?.players) worldRoom.state.players.forEach(p => { right += `<div class="player-name">${p.name} Lv.${p.level}</div>`; });
  h(rightPanel, right);

  showInput("メッセージを入力...", text => {
    if (chatRoom) chatRoom.send("chat", { text, channel: "global" });
    chatLog.push({ sender: player.name || "you", text });
    rChat();
  });
}

function rShop() {
  if (!shopData) { screen = "world"; render(); return; }
  showRight();
  let left = `<div class="section-title">${shopData.npcName || "ショップ"}</div>`;
  const ch = [];
  shopData.items.forEach((it,i) => {
    left += `<div class="item-row"><span>[${i+1}] ${it.name}</span><span class="item-price">${it.price}G</span></div>`;
    if (it.description) left += `<div class="item-effect">${it.description}</div>`;
    ch.push([i+1, `${it.name} (${it.price}G)`, `buy:${it.id}`]);
  });
  h(leftPanel, left);

  let right = `<div class="section-title">所持品</div><div style="margin-bottom:4px">Gold: ${invCache?.gold ?? "?"}G</div>`;
  if (invCache) invCache.inventory.forEach(it => { right += `<div>${it.name} x${it.quantity}</div>`; });
  h(rightPanel, right);

  ch.push([0, "戻る", "back"]);
  setChoices(ch);
}

// ── Action handler ──
function act(a) {
  if (!a) return;
  if (a === "back") { if (battleRoom) { battleRoom.leave(); battleRoom = null; } screen = "world"; render(); return; }
  if (a === "dnext") { dialogueIdx++; render(); return; }
  if (a === "status") { worldRoom.send("status",{}); worldRoom.send("quest_log",{}); screen = "status"; render(); return; }
  if (a === "inventory") { worldRoom.send("inventory",{}); screen = "inventory"; render(); return; }
  if (a === "equip") { screen = "status"; render(); return; } // TODO
  if (a === "chat") { screen = "chat"; render(); return; }
  if (a === "explore") { worldRoom.send("explore",{}); return; }
  if (a.startsWith("move:")) { worldRoom.send("move", { direction: a.split(":")[1] }); return; }
  if (a.startsWith("npc:")) { worldRoom.send("interact", { targetId: a.split(":")[1] }); return; }
  if (a.startsWith("shop:")) { player._shopNpcId = a.split(":")[1]; worldRoom.send("shop_list", { npcId: a.split(":")[1] }); return; }
  if (a.startsWith("quest_list:")) { worldRoom.send("quest_list", { npcId: a.split(":")[1] }); return; }
  if (a.startsWith("quest_accept:")) { worldRoom.send("quest_accept", { questId: a.split(":")[1] }); return; }
  if (a.startsWith("choice:")) {
    const next = a.split(":")[1];
    if (next === "end") { screen = "world"; render(); return; }
    const idx = dialogueData?.nodes?.findIndex(n => n.id === next);
    if (idx >= 0) { dialogueIdx = idx; render(); } else { screen = "world"; render(); }
    return;
  }
  if (a.startsWith("buy:")) {
    worldRoom.send("shop_buy", { npcId: shopData?.npcId, itemId: a.split(":")[1] });
    return;
  }
  if (a.startsWith("b:")) {
    const type = a.split(":")[1];
    battleRoom.send("action", { type, targetId: "enemy-001" });
    return;
  }
  if (a === "shop") { worldRoom.send("shop_list", { npcId: player._shopNpcId }); return; }
}

// ── Keyboard ──
document.addEventListener("keydown", e => {
  if (textInput.classList.contains("visible") && e.key !== "Escape") return;
  if (e.key === "Escape") { act("back"); return; }
  if (e.key >= "0" && e.key <= "9") {
    const btn = [...choicesEl.querySelectorAll(".choice-btn")].find(b => b.textContent.startsWith(`[${e.key}]`));
    if (btn) btn.click();
  }
  if ((e.key === " " || e.key === "Enter") && screen === "dialogue") act("dnext");
});

// ── Connect ──
async function connect() {
  try {
    client = new Colyseus.Client(ENDPOINT);
    const userId = "browser-" + Math.random().toString(36).slice(2,8);
    player._token = userId;  // save for rejoin

    worldRoom = await client.joinOrCreate("world", {
      token: userId,
      zoneId: "zone-001-village",
      zoneName: "はじまりの村",
    });

    player.zoneName = "はじまりの村";
    setupHandlers();

  } catch (e) {
    h(leftPanel, `<div class="center-text"><div class="danger">接続失敗</div><div class="system-msg" style="margin-top:12px">${e.message}</div><div class="system-msg" style="margin-top:8px">npx tsx mmo/server.ts</div></div>`);
    setChoices([]);
  }
}

// ALL message handlers registered ONCE
function setupHandlers() {
  // Zone info from server (replaces hardcoded buildZoneInfo)
  worldRoom.onMessage("zone_info", d => {
    zoneInfo = {
      description: d.description,
      isSafe: d.isSafe,
      adjacentZones: d.adjacentZones,
      npcs: d.npcs,
    };
    player.zoneName = d.zoneName || d.zoneId;
    if (screen === "world" || screen === "login") { screen = "world"; render(); }
  });

  worldRoom.onMessage("need_character_creation", () => { screen = "create"; render(); });

  worldRoom.onMessage("welcome", d => {
    player = { ...player, name: d.name, level: d.level, zoneName: d.zoneName };
    screen = "world"; render();
  });

  worldRoom.onMessage("character_created", d => {
    player = { ...player, name: d.name, level: 1, hp: d.hp, maxHp: d.maxHp, mp: d.mp, maxMp: d.maxMp };
    sysMsg(`${d.name}が誕生した!`);
    screen = "world"; render();
  });

  worldRoom.onMessage("zone_change", async d => {
    const newZoneId = d.zoneId;
    sysMsg(`${d.zoneName || newZoneId} に移動`);

    // Leave current room and join new zone
    try {
      await worldRoom.leave();
      worldRoom = await client.create("world", {
        token: player._token,
        zoneId: newZoneId,
        zoneName: d.zoneName || newZoneId,
      });
      setupHandlers(); // re-register on new room (zone_info will update zoneInfo)
    } catch (e) {
      sysMsg(`移動失敗: ${e.message}`);
      screen = "world"; render();
    }
  });

  worldRoom.onMessage("npc_dialogue", d => {
    dialogueData = { npcId: d.npcId, npcName: d.npcName, label: "", source: "legacy", nodes: [{ id:"n0", speaker: d.npcName, text: d.text, emotion:"neutral" }], memory: null };
    dialogueIdx = 0; screen = "dialogue"; render();
  });

  worldRoom.onMessage("npc_conversation", d => {
    dialogueData = d; dialogueIdx = 0; screen = "dialogue"; render();
  });

  worldRoom.onMessage("encounter", d => {
    if (d.type === "battle") { sysMsg(`${d.enemy.name}が現れた!`); startBattle(d.enemy); }
    else if (d.type === "item") { sysMsg(`${d.itemName} x${d.quantity} を発見!`); render(); }
    else { sysMsg("何も見つからなかった。"); render(); }
  });

  worldRoom.onMessage("shop_items", d => { shopData = d; worldRoom.send("inventory",{}); screen = "shop"; render(); });

  worldRoom.onMessage("shop_bought", d => { sysMsg(`購入! Gold:${d.gold}G`); worldRoom.send("inventory",{}); if (screen==="shop" && shopData) worldRoom.send("shop_list",{npcId:shopData.npcId}); });

  worldRoom.onMessage("shop_sold", d => { sysMsg(`売却! Gold:${d.gold}G`); });

  worldRoom.onMessage("item_used", d => { sysMsg(d.log); player.hp = d.hp; player.mp = d.mp; render(); });

  worldRoom.onMessage("quest_list", d => {
    // Show quest selection
    hideRight();
    let left = `<div class="section-title">クエスト (${d.npcId})</div>`;
    const ch = [];
    if (d.quests.length === 0) { left += `<div class="system-msg">クエストなし</div>`; }
    else d.quests.forEach((q, i) => {
      left += `<div style="margin:8px 0"><strong>[${i+1}] ${q.name}</strong></div><div class="text-dim" style="margin-left:12px">${q.description}</div>`;
      ch.push([i+1, q.name, `quest_accept:${q.id}`]);
    });
    h(leftPanel, left);
    ch.push([0, "戻る", "back"]);
    setChoices(ch);
    screen = "quest_select";
  });

  worldRoom.onMessage("quest_accepted", d => { sysMsg(`クエスト受注: ${d.questId}`); screen = "world"; render(); });

  worldRoom.onMessage("player_status", d => { statusCache = d; player = { ...player, ...d }; if (screen==="status") render(); });

  worldRoom.onMessage("player_inventory", d => { invCache = d; if (screen==="inventory") render(); if (screen==="shop") render(); });

  worldRoom.onMessage("quest_log", d => { questCache = d.quests; if (screen==="status") render(); });

  worldRoom.onMessage("error", d => { sysMsg(`${d.message||d.code}`); if (screen==="world") render(); });

  // Chat room (only join once)
  if (!chatRoom) {
    client.joinOrCreate("chat", { token: player._token || "browser-chat", name: player.name || "anonymous", zoneId: "zone-001-village" })
      .then(room => { chatRoom = room; chatRoom.onMessage("chat_message", m => { chatLog.push(m); if (screen==="chat") rChat(); }); })
      .catch(() => {});
  }
}

async function startBattle(enemy) {
  battleLog = [{ type: "turn", turn: 1 }];
  try {
    battleRoom = await client.joinOrCreate("battle", {
      token: "browser-battle",
      name: player.name || "Player",
      attack: 15, defense: 10, hp: player.hp || 100, maxHp: player.maxHp || 100,
      enemyName: enemy.name, enemyHp: enemy.hp, enemyAttack: enemy.atk, enemyDefense: enemy.def,
      enemyExp: enemy.exp, enemyGold: enemy.gold, enemyId: enemy.id, enemyDrops: enemy.drops || [],
    });
    screen = "battle"; render();

    battleRoom.onMessage("phase_change", () => render());
    battleRoom.onMessage("action_result", d => { battleLog.push({ type:"action", text: d.log }); render(); });
    battleRoom.onMessage("battle_result", d => {
      battleLog.push({ type:"result", text: d.log, win: d.result==="win" });
      if (d.result === "win") { player._victory = d; screen = "victory"; }
      else if (d.result === "lose") { screen = "defeat"; }
      else { sysMsg("逃走した!"); battleRoom.leave(); battleRoom = null; screen = "world"; }
      render();
    });
    battleRoom.onMessage("error", d => { battleLog.push({ type:"action", text: `[Error] ${d.message}` }); render(); });
  } catch (e) { sysMsg(`戦闘エラー: ${e.message}`); screen = "world"; render(); }
}

// ── Start ──
screen = "login"; render(); connect();
