/**
 * Text MMO Browser Client
 * Vanilla JS, no build step. Uses Colyseus SDK from CDN.
 */

// ── Config ──
const ENDPOINT = `ws://${location.hostname}:3001`;
const JWT_SECRET = "mmo-dev-secret"; // dev only — prod uses server-side auth

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
let currentScreen = "login";
let playerData = {};
let chatLog = [];
let dialogueNodes = [];
let dialogueIndex = 0;
let battleLog = [];

// ── Helpers ──
function html(el, content) { el.innerHTML = content; }
function show(el) { el.classList.remove("hidden"); el.classList.remove("full"); }
function hide(el) { el.classList.add("hidden"); }
function fullLeft() { leftPanel.classList.add("full"); hide(rightPanel); }

function hpBar(current, max, width = 10) {
  const ratio = max > 0 ? current / max : 0;
  const filled = Math.round(ratio * width);
  const cls = ratio > 0.7 ? "fill" : ratio > 0.3 ? "fill mid" : "fill low";
  return `<span class="hp-bar"><span class="${cls}">${"#".repeat(filled)}</span><span class="empty">${"-".repeat(width - filled)}</span></span> ${current}/${max}`;
}

function setChoices(items) {
  textInput.classList.remove("visible");
  html(choicesEl, items.map(([key, label, action]) =>
    `<button class="choice-btn" data-action="${action || key}">[${key}] ${label}</button>`
  ).join(""));
  choicesEl.querySelectorAll(".choice-btn").forEach(btn => {
    btn.onclick = () => handleChoice(btn.dataset.action);
  });
}

function showTextInput(placeholder, onSubmit) {
  html(choicesEl, "");
  textInput.classList.add("visible");
  textInput.placeholder = placeholder;
  textInput.value = "";
  textInput.focus();
  textInput.onkeydown = e => {
    if (e.key === "Enter" && textInput.value.trim()) {
      onSubmit(textInput.value.trim());
      textInput.value = "";
    }
  };
}

function updateHeader() {
  if (playerData.name) {
    hdrPlayer.textContent = `${playerData.name} Lv.${playerData.level || 1}`;
    const hp = playerData.hp || 0;
    const maxHp = playerData.maxHp || 100;
    hdrHp.textContent = `HP:${hp}/${maxHp} MP:${playerData.mp || 0}`;
    hdrHp.className = hp / maxHp < 0.3 ? "hp low" : "hp";
  }
  hdrZone.textContent = playerData.zoneName || "";
}

// Emotion map
const EMOTIONS = { happy: "笑顔", sad: "悲しみ", angry: "怒り", surprised: "驚き", neutral: "" };

function stripTags(text) {
  return (text || "").replace(/\[e:\w+\]/g, "").replace(/\[p:\w+\]/g, "").replace(/\[click\]/g, "").replace(/\[wait:\d+\]/g, "").replace(/\[t\]/g, "").replace(/\[w\]/g, "").replace(/\[s\]/g, "");
}

function getEmotion(text) {
  const m = (text || "").match(/\[e:(\w+)\]/);
  return m ? (EMOTIONS[m[1]] || m[1]) : "";
}

// ── Screens ──

function renderLogin() {
  currentScreen = "login";
  fullLeft();
  hdrZone.textContent = "ログイン";
  html(leftPanel, `
    <div class="center-text">
      <div style="margin-bottom:20px;color:var(--accent)">Text MMO</div>
      <div class="system-msg">サーバーに接続中...</div>
    </div>
  `);
  setChoices([]);
  connect();
}

function renderCharCreate() {
  currentScreen = "char-create";
  fullLeft();
  hdrZone.textContent = "キャラクター作成";
  html(leftPanel, `
    <div style="max-width:400px;margin:20px auto">
      <div class="section-title">名前</div>
      <input type="text" id="char-name" style="width:100%;padding:8px;background:var(--bg);color:var(--text);border:1px solid var(--border);font-family:var(--font);font-size:14px;border-radius:4px" placeholder="名前を入力">
      <div class="section-title">職業</div>
      <div id="class-select"></div>
    </div>
  `);
  const classEl = $("class-select");
  html(classEl, `
    <button class="choice-btn" style="width:100%;margin:4px 0" onclick="selectClass('warrior')">[1] 戦士 (HP+ ATK+ DEF+)</button>
    <button class="choice-btn" style="width:100%;margin:4px 0" onclick="selectClass('mage')">[2] 魔法使い (MP+ MAG+)</button>
    <button class="choice-btn" style="width:100%;margin:4px 0" onclick="selectClass('thief')">[3] 盗賊 (SPD+ LUK+)</button>
  `);
  setChoices([]);
}

window.selectClass = function(classType) {
  const name = $("char-name")?.value?.trim();
  if (!name) { alert("名前を入力してください"); return; }
  worldRoom.send("create_character", { name, classType, gender: "male" });
};

function renderWorld() {
  currentScreen = "world";
  show(rightPanel);
  leftPanel.classList.remove("full");
  updateHeader();

  // Left: zone description + system messages
  const zone = playerData.zoneInfo;
  let leftHtml = "";
  if (zone) {
    leftHtml += `<div style="margin-bottom:12px">${zone.description || ""}</div>`;
  }
  // Recent system messages
  if (playerData.systemMessages?.length > 0) {
    leftHtml += playerData.systemMessages.map(m => `<div class="system-msg">${m}</div>`).join("");
  }
  html(leftPanel, leftHtml || `<div class="system-msg">周囲を見渡す...</div>`);

  // Right: players, NPCs, directions
  let rightHtml = "";

  // Players
  if (worldRoom?.state?.players) {
    const others = [];
    worldRoom.state.players.forEach(p => {
      if (p.name !== playerData.name) others.push(p);
    });
    if (others.length > 0) {
      rightHtml += `<div class="section-title">ここにいる人</div>`;
      others.forEach(p => {
        rightHtml += `<div><span class="player-name">${p.name}</span> <span class="text-dim">Lv.${p.level}</span></div>`;
      });
    }
  }

  // NPCs
  if (zone?.npcs?.length > 0) {
    rightHtml += `<div class="section-title">NPC</div>`;
    zone.npcs.forEach(n => { rightHtml += `<div class="npc-name">${n.name}</div>`; });
  }

  // Directions
  if (zone?.adjacentZones?.length > 0) {
    const dirMap = { north: "北", south: "南", east: "東", west: "西" };
    rightHtml += `<div class="section-title">方角</div>`;
    zone.adjacentZones.forEach(a => {
      rightHtml += `<div>${dirMap[a.direction] || a.direction}: ${a.zoneName || a.zoneId}</div>`;
    });
  }

  html(rightPanel, rightHtml || `<div class="system-msg">誰もいない</div>`);

  // Choices
  const choices = [];
  let n = 1;
  if (zone?.adjacentZones) {
    const dirMap = { north: "北", south: "南", east: "東", west: "西" };
    zone.adjacentZones.forEach(a => {
      choices.push([n++, `${dirMap[a.direction]}へ移動`, `move:${a.direction}`]);
    });
  }
  if (zone?.npcs) {
    zone.npcs.forEach(npc => {
      choices.push([n++, npc.name, `npc:${npc.id}`]);
    });
  }
  // Check if danger zone
  if (zone && !zone.isSafe) {
    choices.push([n++, "探索する", "explore"]);
  }
  choices.push([n++, "チャット", "chat"]);
  choices.push([n++, "ステータス", "status"]);
  choices.push([n++, "メニュー", "menu"]);
  setChoices(choices);
}

function renderDialogue(data) {
  currentScreen = "dialogue";
  show(rightPanel);
  leftPanel.classList.remove("full");

  const nodes = data.nodes || [];
  dialogueNodes = nodes;
  dialogueIndex = 0;
  playerData._dialogueData = data;
  showDialogueNode();
}

function showDialogueNode() {
  const data = playerData._dialogueData;
  if (dialogueIndex >= dialogueNodes.length) { renderWorld(); return; }

  const node = dialogueNodes[dialogueIndex];
  const emotion = EMOTIONS[node.emotion] || "";

  // Left: dialogue so far
  let leftHtml = `<div class="section-title">${data.npcName}</div>`;
  for (let i = 0; i <= dialogueIndex; i++) {
    const n = dialogueNodes[i];
    const em = EMOTIONS[n.emotion] || "";
    leftHtml += `<div>`;
    if (em) leftHtml += `<span class="emotion-tag">[${em}]</span> `;
    leftHtml += `<span class="npc-name">${n.speaker}</span>`;
    leftHtml += `</div>`;
    leftHtml += `<div class="dialogue-text">${stripTags(n.text)}</div>`;
  }
  html(leftPanel, leftHtml);

  // Right: memory info
  let rightHtml = "";
  if (data.memory) {
    const rel = data.memory.relationScore || 0;
    const relBar = rel > 0 ? "+".repeat(Math.min(rel / 5, 20)) : rel < 0 ? "-".repeat(Math.min(Math.abs(rel) / 5, 20)) : "0";
    rightHtml += `<div class="section-title">関係値</div><div>${relBar} (${rel})</div>`;
    rightHtml += `<div class="section-title">会話回数</div><div>${data.memory.interactionCount || 0}</div>`;
  }
  rightHtml += `<div class="section-title">会話</div><div>${data.label || ""}</div>`;
  rightHtml += `<div style="margin-top:4px" class="text-dim">${data.source || ""}</div>`;
  html(rightPanel, rightHtml);

  // Choices
  if (node.choices && node.choices.length > 0) {
    const choices = node.choices.map((c, i) => [i + 1, c.label, `choice:${c.next}`]);
    setChoices(choices);
  } else if (dialogueIndex < dialogueNodes.length - 1) {
    setChoices([[1, "次へ", "next"], [0, "戻る", "back"]]);
  } else {
    setChoices([[0, "戻る", "back"]]);
  }
}

function renderBattle() {
  currentScreen = "battle";
  show(rightPanel);
  leftPanel.classList.remove("full");

  // Left: battle log
  let leftHtml = "";
  battleLog.forEach(entry => {
    if (entry.type === "turn") {
      leftHtml += `<div class="log-turn">── ターン ${entry.turn} ──</div>`;
    } else if (entry.type === "action") {
      leftHtml += `<div class="log-entry">${stripTags(entry.text)}</div>`;
    } else if (entry.type === "result") {
      leftHtml += `<div class="log-entry ${entry.win ? 'success' : 'danger'}">${stripTags(entry.text)}</div>`;
    }
  });
  html(leftPanel, leftHtml || `<div class="system-msg">戦闘開始!</div>`);
  leftPanel.scrollTop = leftPanel.scrollHeight;

  // Right: HP bars
  let rightHtml = "";
  if (battleRoom?.state?.battlers) {
    const allies = [];
    const enemies = [];
    battleRoom.state.battlers.forEach((b, id) => {
      (b.isPlayer ? allies : enemies).push(b);
    });

    rightHtml += `<div class="section-title">味方</div>`;
    allies.forEach(b => {
      rightHtml += `<div><span class="player-name">${b.name}</span></div>`;
      rightHtml += `<div>HP ${hpBar(b.hp, b.maxHp)}</div>`;
      rightHtml += `<div style="margin-bottom:6px">MP ${hpBar(b.mp, 50, 6)}</div>`;
    });

    rightHtml += `<div class="section-title">敵</div>`;
    enemies.forEach(b => {
      rightHtml += `<div>${b.name}</div>`;
      rightHtml += `<div style="margin-bottom:6px">HP ${hpBar(b.hp, b.maxHp)}</div>`;
    });
  }
  html(rightPanel, rightHtml);

  // Choices
  if (battleRoom?.state?.phase === "selecting") {
    setChoices([
      [1, "攻撃", "battle:attack"],
      [2, "防御", "battle:defend"],
      [3, "アイテム", "battle:item"],
      [4, "逃走", "battle:flee"],
    ]);
  } else {
    setChoices([]);
  }
}

function renderVictory(data) {
  currentScreen = "victory";
  show(rightPanel);
  leftPanel.classList.remove("full");

  let leftHtml = `<div class="success" style="font-size:16px;margin-bottom:12px">勝利!</div>`;
  leftHtml += `<div>${stripTags(data.log)}</div>`;
  if (data.levelUps) {
    for (const [userId, lv] of Object.entries(data.levelUps)) {
      leftHtml += `<div class="success" style="margin-top:8px">★ レベルアップ! Lv.${lv.newLevel}</div>`;
      const sc = lv.statChanges;
      if (sc.hp) leftHtml += `<div>HP +${sc.hp}</div>`;
      if (sc.atk) leftHtml += `<div>ATK +${sc.atk}</div>`;
      if (sc.def) leftHtml += `<div>DEF +${sc.def}</div>`;
    }
  }
  html(leftPanel, leftHtml);

  let rightHtml = `<div class="section-title">獲得</div>`;
  rightHtml += `<div>EXP: +${data.expGained}</div>`;
  rightHtml += `<div>Gold: +${data.goldGained}</div>`;
  if (data.drops?.length > 0) {
    rightHtml += `<div class="section-title">ドロップ</div>`;
    data.drops.forEach(d => { rightHtml += `<div>${d.name}</div>`; });
  }
  if (data.questProgress) {
    rightHtml += `<div class="section-title">クエスト</div>`;
    for (const [userId, progress] of Object.entries(data.questProgress)) {
      progress.forEach(p => {
        rightHtml += `<div class="quest-progress">${p.targetName} (${p.current}/${p.required})${p.completed ? " ★" : ""}</div>`;
      });
    }
  }
  html(rightPanel, rightHtml);
  setChoices([[1, "続ける", "back"]]);
}

function renderDefeat(data) {
  currentScreen = "defeat";
  fullLeft();
  html(leftPanel, `
    <div class="center-text">
      <div class="danger" style="font-size:18px;margin-bottom:20px">全滅...</div>
      <div style="margin-bottom:16px">意識が遠のく…</div>
      <div>気がつくと村の井戸の前にいた。</div>
      <div style="margin-top:16px;color:var(--warning)">HP/MP は全回復した。</div>
    </div>
  `);
  setChoices([[1, "続ける", "back"]]);
}

function renderStatus() {
  currentScreen = "status";
  show(rightPanel);
  leftPanel.classList.remove("full");

  worldRoom.onMessage("player_status", data => {
    let leftHtml = `<div class="section-title">キャラクター</div>`;
    leftHtml += `<div class="stat-row"><span class="stat-label">名前</span><span>${data.name}</span></div>`;
    leftHtml += `<div class="stat-row"><span class="stat-label">職業</span><span>${data.classType === "warrior" ? "戦士" : data.classType === "mage" ? "魔法使い" : "盗賊"}</span></div>`;
    leftHtml += `<div class="stat-row"><span class="stat-label">レベル</span><span>Lv.${data.level} (EXP: ${data.exp})</span></div>`;
    leftHtml += `<div class="section-title">ステータス</div>`;
    leftHtml += `<div>HP ${hpBar(data.hp, data.maxHp, 15)}</div>`;
    leftHtml += `<div>MP ${hpBar(data.mp, data.maxMp, 10)}</div>`;
    leftHtml += `<div class="stat-row"><span class="stat-label">ATK</span><span>${data.atk}</span></div>`;
    leftHtml += `<div class="stat-row"><span class="stat-label">DEF</span><span>${data.def}</span></div>`;
    leftHtml += `<div class="stat-row"><span class="stat-label">MAG</span><span>${data.mag}</span></div>`;
    leftHtml += `<div class="stat-row"><span class="stat-label">SPD</span><span>${data.spd}</span></div>`;
    leftHtml += `<div class="section-title">所持金</div><div>${data.gold}G</div>`;
    html(leftPanel, leftHtml);
    playerData = { ...playerData, ...data };
    updateHeader();
  });
  worldRoom.send("status", {});

  // Right: quests
  worldRoom.onMessage("quest_log", data => {
    let rightHtml = `<div class="section-title">クエスト</div>`;
    const entries = Object.entries(data.quests || {});
    if (entries.length === 0) {
      rightHtml += `<div class="system-msg">なし</div>`;
    } else {
      entries.forEach(([id, q]) => {
        const cls = q.status === "completed" ? "quest-done" : "quest-active";
        rightHtml += `<div class="${cls}">${id} [${q.status === "completed" ? "完了" : "進行中"}]</div>`;
        Object.entries(q.progress || {}).forEach(([k, v]) => {
          rightHtml += `<div class="quest-progress">${k}: ${v}</div>`;
        });
      });
    }
    html(rightPanel, rightHtml);
  });
  worldRoom.send("quest_log", {});

  setChoices([[1, "装備", "equip"], [2, "インベントリ", "inventory"], [0, "戻る", "back"]]);
}

function renderChat() {
  currentScreen = "chat";
  show(rightPanel);
  leftPanel.classList.remove("full");

  // Left: chat log
  let leftHtml = chatLog.slice(-30).map(m => {
    if (m.whisper) return `<div class="warning" style="margin-left:12px">(ひそひそ) ${m.sender}: ${m.text}</div>`;
    return `<div><span class="player-name">${m.sender}</span>: ${m.text}</div>`;
  }).join("");
  html(leftPanel, leftHtml || `<div class="system-msg">チャットログなし</div>`);
  leftPanel.scrollTop = leftPanel.scrollHeight;

  // Right: online players
  let rightHtml = `<div class="section-title">オンライン</div>`;
  if (worldRoom?.state?.players) {
    worldRoom.state.players.forEach(p => {
      rightHtml += `<div class="player-name">${p.name} (Lv.${p.level})</div>`;
    });
  }
  html(rightPanel, rightHtml);

  showTextInput("メッセージを入力...", text => {
    if (chatRoom) chatRoom.send("chat", { text, channel: "global" });
    chatLog.push({ sender: playerData.name || "you", text });
    renderChat();
  });
}

function renderShop(data) {
  currentScreen = "shop";
  show(rightPanel);
  leftPanel.classList.remove("full");

  let leftHtml = `<div class="section-title">商品一覧</div>`;
  const choices = [];
  data.items.forEach((item, i) => {
    leftHtml += `<div class="item-row"><span>[${i + 1}] ${item.name}</span><span class="item-price">${item.price}G</span></div>`;
    if (item.description) leftHtml += `<div class="item-effect">${item.description}</div>`;
    choices.push([i + 1, `${item.name} (${item.price}G)`, `buy:${item.id}`]);
  });
  html(leftPanel, leftHtml);

  // Right: inventory
  worldRoom.onMessage("player_inventory", inv => {
    let rightHtml = `<div class="section-title">所持品</div>`;
    rightHtml += `<div style="margin-bottom:8px">Gold: ${inv.gold}G</div>`;
    inv.inventory.forEach(item => {
      rightHtml += `<div>${item.name} x${item.quantity}</div>`;
    });
    html(rightPanel, rightHtml);
  });
  worldRoom.send("inventory", {});

  choices.push([0, "戻る", "back"]);
  setChoices(choices);
  playerData._shopData = data;
}

// ── Choice handler ──
function handleChoice(action) {
  if (!action) return;

  if (action === "back") {
    if (battleRoom) { battleRoom.leave(); battleRoom = null; }
    renderWorld();
    return;
  }
  if (action === "next") { dialogueIndex++; showDialogueNode(); return; }
  if (action === "status") { renderStatus(); return; }
  if (action === "chat") { renderChat(); return; }
  if (action === "menu") { renderStatus(); return; }
  if (action === "inventory") {
    worldRoom.send("inventory", {});
    worldRoom.onMessage("player_inventory", data => {
      currentScreen = "inventory";
      fullLeft();
      let h = `<div class="section-title">インベントリ (Gold: ${data.gold}G)</div>`;
      data.inventory.forEach((item, i) => {
        h += `<div class="item-row"><span>[${i + 1}] ${item.name} x${item.quantity}</span><span class="text-dim">${item.type}</span></div>`;
      });
      html(leftPanel, h || `<div class="system-msg">何も持っていない</div>`);
      setChoices([[0, "戻る", "back"]]);
    });
    return;
  }
  if (action === "equip") {
    worldRoom.send("status", {});
    worldRoom.onMessage("player_status", data => {
      currentScreen = "equip";
      show(rightPanel);
      leftPanel.classList.remove("full");
      let leftHtml = `<div class="section-title">装備</div>`;
      leftHtml += `<div>武器: ${data.equipment?.weapon || "なし"}</div>`;
      leftHtml += `<div>防具: ${data.equipment?.armor || "なし"}</div>`;
      leftHtml += `<div>アクセ: ${data.equipment?.accessory || "なし"}</div>`;
      html(leftPanel, leftHtml);
      let rightHtml = `<div class="section-title">ステータス</div>`;
      rightHtml += `<div>ATK: ${data.atk} DEF: ${data.def}</div>`;
      rightHtml += `<div>MAG: ${data.mag} SPD: ${data.spd}</div>`;
      html(rightPanel, rightHtml);
      setChoices([[0, "戻る", "back"]]);
    });
    return;
  }
  if (action === "explore") {
    worldRoom.send("explore", {});
    return;
  }

  // Move
  if (action.startsWith("move:")) {
    worldRoom.send("move", { direction: action.split(":")[1] });
    return;
  }

  // NPC interact
  if (action.startsWith("npc:")) {
    worldRoom.send("interact", { targetId: action.split(":")[1] });
    return;
  }

  // Dialogue choice → jump to node
  if (action.startsWith("choice:")) {
    const nextId = action.split(":")[1];
    if (nextId === "end") { renderWorld(); return; }
    const idx = dialogueNodes.findIndex(n => n.id === nextId);
    if (idx >= 0) { dialogueIndex = idx; showDialogueNode(); }
    else { renderWorld(); }
    return;
  }

  // Shop buy
  if (action.startsWith("buy:")) {
    const itemId = action.split(":")[1];
    worldRoom.send("shop_buy", { npcId: playerData._shopData?.npcId, itemId });
    return;
  }

  // Battle actions
  if (action.startsWith("battle:")) {
    const type = action.split(":")[1];
    if (type === "item") {
      // TODO: item selection screen
      setChoices([[0, "戻る", "back"]]);
      return;
    }
    battleRoom.send("action", { type, targetId: "enemy-001" });
    return;
  }
}

// ── Keyboard ──
document.addEventListener("keydown", e => {
  if (textInput.classList.contains("visible")) return;
  const key = e.key;
  if (key >= "0" && key <= "9") {
    const btns = choicesEl.querySelectorAll(".choice-btn");
    const target = [...btns].find(b => b.textContent.startsWith(`[${key}]`));
    if (target) target.click();
  }
  if (key === "Escape") handleChoice("back");
  if (key === " " || key === "Enter") {
    if (currentScreen === "dialogue") handleChoice("next");
  }
});

// ── Connection ──
async function connect() {
  try {
    client = new Colyseus.Client(ENDPOINT);

    // Generate a simple token (dev mode)
    const userId = "browser-" + Math.random().toString(36).slice(2, 8);

    worldRoom = await client.joinOrCreate("world", {
      token: userId, // simplified for dev
      zoneId: "zone-001-village",
      zoneName: "はじまりの村",
    });

    setupWorldRoom();

  } catch (e) {
    html(leftPanel, `
      <div class="center-text">
        <div class="danger">接続失敗</div>
        <div style="margin-top:12px" class="system-msg">${e.message}</div>
        <div style="margin-top:12px" class="system-msg">サーバーを起動してください:</div>
        <div style="margin-top:4px">npx tsx mmo/server.ts</div>
      </div>
    `);
    setChoices([[1, "再接続", "reconnect"]]);
  }
}

function setupWorldRoom() {
  worldRoom.onMessage("need_character_creation", () => {
    renderCharCreate();
  });

  worldRoom.onMessage("welcome", data => {
    playerData = { ...playerData, name: data.name, level: data.level, zoneName: data.zoneName };
    updateHeader();
    renderWorld();
  });

  worldRoom.onMessage("character_created", data => {
    playerData = { ...playerData, name: data.name, level: 1, hp: data.hp, maxHp: data.maxHp, mp: data.mp, maxMp: data.maxMp, zoneName: "はじまりの村" };
    addSystemMsg(`${data.name} (${data.classType === "warrior" ? "戦士" : data.classType === "mage" ? "魔法使い" : "盗賊"}) が誕生した!`);
    updateHeader();
    renderWorld();
  });

  worldRoom.onMessage("zone_change", data => {
    playerData.zoneName = data.zoneName || data.zoneId;
    playerData.zoneInfo = null; // will be updated from options on rejoin
    addSystemMsg(`${data.zoneId} に移動した`);
    updateHeader();
    renderWorld();
  });

  worldRoom.onMessage("npc_dialogue", data => {
    // Legacy dialogue
    renderDialogue({
      npcName: data.npcName,
      label: "",
      source: "legacy",
      nodes: [{ id: "n0", speaker: data.npcName, text: data.text, emotion: "neutral" }],
      memory: null,
    });
  });

  worldRoom.onMessage("npc_conversation", data => {
    renderDialogue(data);
  });

  worldRoom.onMessage("encounter", data => {
    if (data.type === "battle") {
      addSystemMsg(`${data.enemy.name} が現れた!`);
      startBattle(data.enemy);
    } else if (data.type === "item") {
      addSystemMsg(`${data.itemName} x${data.quantity} を見つけた!`);
      renderWorld();
    } else {
      addSystemMsg("特に何も見つからなかった。");
      renderWorld();
    }
  });

  worldRoom.onMessage("shop_items", data => {
    renderShop(data);
  });

  worldRoom.onMessage("shop_bought", data => {
    addSystemMsg(`購入完了! Gold: ${data.gold}G`);
    // Refresh shop
    if (playerData._shopData) {
      worldRoom.send("shop_list", { npcId: playerData._shopData.npcId });
    }
  });

  worldRoom.onMessage("item_used", data => {
    addSystemMsg(data.log);
    playerData.hp = data.hp;
    playerData.mp = data.mp;
    updateHeader();
  });

  worldRoom.onMessage("quest_accepted", data => {
    addSystemMsg(`クエスト受注: ${data.questId}`);
  });

  worldRoom.onMessage("error", data => {
    addSystemMsg(`[エラー] ${data.message || data.code}`);
    if (currentScreen === "world") renderWorld();
  });

  // Chat
  try {
    client.joinOrCreate("chat", {
      token: "browser-chat",
      name: playerData.name || "anonymous",
      zoneId: "zone-001-village",
    }).then(room => {
      chatRoom = room;
      chatRoom.onMessage("chat_message", msg => {
        chatLog.push(msg);
        if (currentScreen === "chat") renderChat();
      });
    });
  } catch (e) { /* chat optional */ }

  // Store zone info from room options (if available from state)
  playerData.zoneInfo = {
    description: "穏やかな風が吹く小さな村。石畳の広場に井戸がある。",
    isSafe: true,
    npcs: [
      { id: "npc-elder", name: "長老ヨハン" },
      { id: "npc-merchant", name: "商人マリア" },
    ],
    adjacentZones: [{ direction: "north", zoneId: "zone-004-capital", zoneName: "王都セレス" }],
  };
  playerData.systemMessages = [];
}

function addSystemMsg(msg) {
  if (!playerData.systemMessages) playerData.systemMessages = [];
  playerData.systemMessages.push(msg);
  if (playerData.systemMessages.length > 10) playerData.systemMessages.shift();
}

async function startBattle(enemy) {
  battleLog = [];
  try {
    battleRoom = await client.joinOrCreate("battle", {
      token: "browser-battle",
      name: playerData.name || "Player",
      attack: 15, defense: 10, hp: playerData.hp || 100, maxHp: playerData.maxHp || 100,
      enemyName: enemy.name,
      enemyHp: enemy.hp, enemyAttack: enemy.atk, enemyDefense: enemy.def,
      enemyExp: enemy.exp, enemyGold: enemy.gold,
      enemyId: enemy.id,
      enemyDrops: enemy.drops || [],
    });

    battleRoom.onMessage("phase_change", data => {
      if (data.phase === "selecting" && battleLog.length === 0) {
        battleLog.push({ type: "turn", turn: 1 });
      }
      renderBattle();
    });

    battleRoom.onMessage("action_result", data => {
      battleLog.push({ type: "action", text: data.log });
      renderBattle();
    });

    battleRoom.onMessage("battle_result", data => {
      battleLog.push({ type: "result", text: data.log, win: data.result === "win" });
      if (data.result === "win") {
        renderVictory(data);
      } else if (data.result === "lose") {
        renderDefeat(data);
      } else {
        addSystemMsg("逃走した!");
        battleRoom.leave(); battleRoom = null;
        renderWorld();
      }
    });

    battleRoom.onMessage("error", data => {
      battleLog.push({ type: "action", text: `[エラー] ${data.message}` });
      renderBattle();
    });

  } catch (e) {
    addSystemMsg(`戦闘開始に失敗: ${e.message}`);
    renderWorld();
  }
}

// ── Start ──
renderLogin();
