import { cards, monsterProfile } from "./cards.mjs";
import {
  startBattle,
  battleActions,
  actBattle,
  recordDice,
  parityOf,
  restoreBattleRules,
} from "./battle.mjs";

const stats = { atk: "攻击", def: "防御", act: "行动" };
const palette = ["#e76a51", "#35a89a", "#b18aef", "#e2af40"];
const legendary = (id) => cards[id]?.kind === "传说装备";
const inPool = (id, prefix) =>
  prefix === "l"
    ? legendary(id)
    : prefix === "c"
      ? cards[id]?.kind === "普通装备"
      : id.startsWith(prefix);
const pool = (prefix) => Object.keys(cards).filter((id) => inPool(id, prefix));
const nameOf = (id) => cards[id]?.name ?? id;
const player = (game, id = game.turn) => game.players.find((p) => p.id === id);
const equipped = (p, id) => p.gear.includes(id) && !p.locked.includes(id);
const carried = (p, id) => p.items.includes(id);
const tileAt = (game, p) => game.board[p.pos - 1];
const unique = (values) => [...new Set(values)];
const capHP = (p, amount) => {
  p.hp = Math.min(10, p.hp + amount);
};
const itemLimit = (p) => (equipped(p, "l16") ? Infinity : 5);
const action = (id, label, card) =>
  card ? { id, label, card } : { id, label };
const rulesVersion = 3;

function log(game, message) {
  game.log.push(message);
  if (game.log.length > 120) game.log.splice(0, game.log.length - 120);
}

function board() {
  const result = Array.from({ length: 100 }, (_, i) => {
    const biome = ["plain", "desert", "rainforest", "volcano"][
      Math.floor(i / 25)
    ];
    return { pos: i + 1, type: "plain", biome, terrain: biome };
  });
  const spaces = {
    start: [1],
    finish: [100],
    normal: [
      4, 7, 9, 13, 14, 16, 22, 25, 27, 28, 34, 36, 40, 41, 44, 46, 53, 61, 71,
    ],
    elite: [19, 38, 49, 50, 59, 64, 66, 72, 74, 81, 84, 86, 91, 94, 96],
    boss: [32, 43, 54, 69, 78, 87, 98],
    chest: [6, 17, 29, 39, 51, 62, 73],
    legendaryChest: [82, 92],
    item: [3, 12, 23, 31, 42, 52, 65, 75, 83, 93],
    rest: [8, 18, 26, 37, 48, 58, 68, 77, 88, 97],
    duel: [11, 20, 24, 35, 47, 55, 57, 67, 70, 79, 89, 95],
    trap: [21, 30, 56, 85, 99],
    portal: [15, 33, 45, 60, 76, 90],
  };
  for (const [type, positions] of Object.entries(spaces)) {
    for (const pos of positions) result[pos - 1].type = type;
  }
  spaces.boss.forEach((pos, i) => {
    const id = "b0" + (i + 1);
    Object.assign(result[pos - 1], { boss: id, monster: id });
  });
  for (const [a, b] of [
    [15, 33],
    [45, 60],
    [76, 90],
  ]) {
    result[a - 1].to = b;
    result[b - 1].to = a;
  }
  return result;
}

export function restoreGame(game, rng = Math.random) {
  const oldRules = game.rulesVersion !== rulesVersion;
  const layout = oldRules ? board() : null;
  let wasLegacyBoard = false;
  for (const tile of game.board) {
    wasLegacyBoard ||= tile.terrain !== tile.biome;
    tile.terrain = tile.biome;
    if (layout && tile.type === "plain") tile.type = layout[tile.pos - 1].type;
    if (tile.type === "chest" && tile.biome === "volcano")
      tile.type = "legendaryChest";
    if (tile.type === "normal" && tile.biome === "volcano") {
      tile.type = "elite";
      delete tile.monster;
      delete tile.maxHp;
      delete tile.hp;
      delete tile.monsterState;
    }
  }
  if (oldRules) {
    for (const p of game.players)
      p.statuses = p.statuses.filter((status) => status.type !== "slipped");
    if (game.phase === "landing" && game.check?.kind === "rain") {
      game.check = null;
      game.mods = {};
    }
    if (game.check) showRoll(game, player(game, game.actor));
  }
  if ((wasLegacyBoard || oldRules) && game.phase === "offer") {
    const p = player(game);
    const tile = tileAt(game, p);
    if (tile.type === "chest" || tile.type === "legendaryChest") {
      const tier = tile.type === "chest" ? "c" : "l";
      if (game.pending.ids.some((id) => !inPool(id, tier)))
        offer(
          game,
          p,
          draw(game, tier, 3 + Number(equipped(p, "c14")), rng),
          true,
        );
      else game.pending.canPass = true;
    }
    if (tile.type === "item") game.pending.canPass = true;
  }
  const b = game.battle;
  if (b?.monster) {
    for (const roll of [b.attackRoll, b.defenseRoll]) {
      if (!roll || roll.id === b.first || !roll.dice.length) continue;
      roll.dice = [];
      roll.count = 0;
      roll.total = roll.cannot ? 0 : b[roll.type];
      if (b.phase === "reaction") {
        const own = b.side === b.first ? b.attackRoll : b.defenseRoll;
        if (own?.dice.length)
          recordDice(
            game,
            own.dice,
            own.total,
            player(game, own.id).name + " · 战斗判定",
            false,
          );
      }
    }
  }
  if (oldRules && b) {
    const tile = tileAt(game, player(game, b.first));
    restoreBattleRules(game, tile.biome);
    if (tile.monster === b.monster) {
      tile.maxHp =
        monsterProfile(b.monster, tile.biome).hp +
        (b.monster === "e05" ? 5 : 0);
    }
  }
  game.rulesVersion = rulesVersion;
  return game;
}

export function newGame(roster) {
  if (
    !Array.isArray(roster) ||
    roster.length < 1 ||
    roster.length > 4 ||
    roster.some((p) => !p.id || !p.name) ||
    new Set(roster.map((p) => p.id)).size !== roster.length
  ) {
    throw new Error("需要 1 至 4 名不同的玩家");
  }
  const players = roster.map((p, i) => ({
    id: p.id,
    name: p.name,
    color: p.color || palette[i],
    online: p.online !== false,
    pos: 1,
    hp: 10,
    atk: 1,
    def: 1,
    act: 1,
    sp: 0,
    alloc: { atk: 0, def: 0, act: 0 },
    badgeActive: false,
    badgeStat: null,
    gear: [],
    items: [],
    locked: [],
    statuses: [],
    movePenalty: 0,
    arrived: 0,
  }));
  const turn = (players.find((p) => p.online) || players[0]).id;
  return {
    players,
    rulesVersion,
    board: board(),
    turn,
    actor: turn,
    phase: "move",
    round: 1,
    sequence: 0,
    battle: null,
    pending: {},
    check: null,
    mods: {},
    dice: null,
    winner: null,
    log: ["冒险开始。所有玩家从第 1 格出发。"],
  };
}

function phase(game, value, pending = {}, actor = game.turn) {
  game.phase = value;
  game.pending = pending;
  game.actor = actor;
}

function nextTurn(game) {
  const index = game.players.findIndex((p) => p.id === game.turn);
  for (let step = 1; step <= game.players.length; step++) {
    const n = index + step;
    const next = game.players[n % game.players.length];
    if (!next.online) continue;
    game.round += Math.floor(n / game.players.length);
    game.turn = next.id;
    const resume = next.resume;
    delete next.resume;
    game.mods = resume?.mods || {};
    game.check = resume?.check || null;
    phase(game, resume?.phase || "move", resume?.pending);
    if (game.check) showRoll(game, next);
    if (game.phase === "loot") {
      const loser = player(game, game.pending.loser);
      if (!loser.gear.length && !loser.items.length) phase(game, "move");
    }
    if (game.phase === "resumeMonster") {
      const tile = tileAt(game, next);
      const saved = game.pending;
      if (
        saved.monster === "final" ||
        (tile.monster === saved.monster && tile.encounter === saved.encounter)
      ) {
        phase(game, "battle");
        game.battle = saved.battle;
        game.dice = saved.dice;
      } else if (tile.monster === saved.monster)
        resolveSpace(game, next, Math.random);
      else phase(game, "move");
    }
    return;
  }
}

function syncBadge(p) {
  const active = equipped(p, "c13");
  if (active === p.badgeActive) return;
  if (active) p.sp++;
  else if (p.badgeStat) {
    p[p.badgeStat]--;
    p.alloc[p.badgeStat]--;
    p.badgeStat = null;
  } else if (!p.badgeSpentByTrap) p.sp = Math.max(0, p.sp - 1);
  delete p.badgeSpentByTrap;
  p.badgeActive = active;
}

function upgrade(p, stat, spend) {
  if (spend) {
    p.sp--;
    if (p.badgeActive && !p.badgeStat && !p.badgeSpentByTrap)
      p.badgeStat = stat;
  }
  p.alloc[stat]++;
  p[stat]++;
}

function removeOne(array, value) {
  const index = array.indexOf(value);
  if (index >= 0) array.splice(index, 1);
}

function removeGear(p, id) {
  removeOne(p.gear, id);
  removeOne(p.locked, id);
  if (id === "l16") p.items = [];
  syncBadge(p);
}

function relocate(game, p, position, death = false, stepwise = false) {
  const dest = Math.max(1, Math.min(100, position));
  const moved = p.pos !== dest;
  if (moved)
    (game.movements ??= []).push({ id: p.id, from: p.pos, to: dest, stepwise });
  p.pos = dest;
  p.arrived = ++game.sequence;
  if (moved && equipped(p, "l11")) capHP(p, 1);
  if (dest === 1 && (moved || death) && equipped(p, "l13")) {
    for (const stat of Object.keys(stats)) upgrade(p, stat, false);
    log(game, p.name + " 触发并弃置归途传承印，三项属性各永久 +1。");
    removeGear(p, "l13");
  }
}

function respawn(game, p, duel = false) {
  // The seal's own death trigger can satisfy the one-legendary discard.
  const lostSeal = equipped(p, "l13");
  relocate(game, p, 1, true);
  p.hp = 10;
  p.statuses = [];
  p.movePenalty = 0;
  log(game, p.name + " 在起点以 10 点生命重生。");
  phase(game, "end");
  if (!duel && !lostSeal && p.gear.some(legendary)) {
    if (equipped(p, "c16")) {
      removeGear(p, "c16");
      log(game, "替偿木偶代替传说装备被弃置。");
    } else phase(game, "deathDiscard", {}, p.id);
  }
}

function randomOne(array, rng) {
  return array[Math.min(array.length - 1, Math.floor(rng() * array.length))];
}

function draw(game, type, count, rng) {
  const options = pool(type).flatMap((id) => {
    const stock = cards[id].copies ?? 1;
    const held = game.players.reduce((sum, q) => {
      const owned = (type === "i" ? q.items : q.gear).filter(
        (x) => x === id,
      ).length;
      const reserved =
        q.resume?.phase === "offer"
          ? q.resume.pending.ids.includes(id)
          : q.resume?.phase === "replace" && q.resume.pending.card === id;
      return sum + owned + Number(Boolean(reserved));
    }, 0);
    return Array(Math.max(0, stock - held)).fill(id);
  });
  const result = [];
  let bag = options;
  while (bag.length && result.length < count) {
    const id = randomOne(bag, rng);
    result.push(id);
    bag = bag.filter((other) => other !== id);
  }
  return result;
}

function offer(game, p, ids, canPass = false) {
  if (!ids.length) {
    log(game, "牌池暂时没有可领取的卡牌。");
    phase(game, "end");
  } else phase(game, "offer", { ids, canPass }, p.id);
}

function conflictingCharm(p, card) {
  const other = card === "c07" ? "c08" : card === "c08" ? "c07" : null;
  return other && p.gear.includes(other) ? other : null;
}

function receive(game, p, card, replacing) {
  const isItem = card.startsWith("i");
  if (replacing) {
    if (isItem) removeOne(p.items, replacing);
    else removeGear(p, replacing);
  }
  if (
    isItem
      ? p.items.length >= itemLimit(p)
      : p.gear.length >= 3 || conflictingCharm(p, card)
  ) {
    phase(game, "replace", { card }, p.id);
    return;
  }
  if (isItem) p.items.push(card);
  else p.gear.push(card);
  syncBadge(p);
  log(
    game,
    p.name + (isItem ? " 收下了一件道具。" : " 装备了" + nameOf(card) + "。"),
  );
  phase(game, "end");
}

function startFight(game, options, rng) {
  phase(game, "battle");
  startBattle(game, options, rng);
}

function settleBattle(game, outcome, rng) {
  if (!outcome) return;
  const b = game.battle;
  const p = player(
    game,
    outcome.playerId ||
      (outcome.type === "monsterLoss" ? outcome.loserId : outcome.winnerId) ||
      game.turn,
  );
  const tile = tileAt(game, p);
  game.battle = null;
  phase(game, "end");
  if (outcome.type === "pvpWin") {
    const winner = player(game, outcome.winnerId),
      loser = player(game, outcome.loserId);
    respawn(game, loser, true);
    winner.sp++;
    log(game, winner.name + " 赢得决斗，获得 1 技能点。");
    if (loser.gear.length + loser.items.length)
      phase(game, "loot", { loser: loser.id }, winner.id);
  } else if (outcome.type === "escape") {
    if (b.monster === "final") {
      log(game, p.name + " 逃离最终头目，按战败结算。");
      respawn(game, p);
      return;
    }
    if (tile.monster === b.monster) {
      tile.monsterState = outcome.monsterState || { hp: outcome.monsterHp };
      tile.hp = outcome.monsterHp;
    }
    log(game, p.name + " 逃离战斗。");
  } else if (outcome.type === "monsterLoss") {
    delete tile.monsterState;
    if (tile.monster === b.monster) tile.hp = tile.maxHp ?? b.maxHp;
    respawn(game, p);
  } else if (outcome.type === "victory") {
    game.winner = p.id;
    phase(game, "won", {}, p.id);
    log(game, p.name + " 击败原初之王，赢得本局！");
  } else if (outcome.type === "monsterWin") {
    const tier =
      b.monster[0] === "n" ? "normal" : b.monster[0] === "e" ? "elite" : "boss";
    if (tile.boss) tile.monster = tile.boss;
    else delete tile.monster;
    delete tile.hp;
    delete tile.maxHp;
    delete tile.monsterState;
    if (tier !== "normal") p.sp++;
    const reward = tier === "boss" ? "l" : tier === "elite" ? "c" : "i";
    log(
      game,
      p.name + " 击败怪物" + (tier === "normal" ? "。" : "，获得 1 技能点。"),
    );
    offer(game, p, draw(game, reward, 1, rng));
  }
}

function resolveSpace(game, p, rng) {
  const tile = tileAt(game, p);
  switch (tile.type) {
    case "finish":
      phase(game, "finish");
      return;
    case "normal":
    case "elite":
    case "boss": {
      const tier =
        tile.type === "normal" ? "n" : tile.type === "elite" ? "e" : "b";
      const deck = pool(tier).flatMap((id) =>
        Array(id === "n04" ? 2 : 1).fill(id),
      );
      tile.monster ??= tile.boss || randomOne(deck, rng);
      tile.encounter = (tile.encounter || 0) + 1;
      const profile = monsterProfile(tile.monster, tile.biome);
      const maxHp = profile.hp + (tile.monster === "e05" ? 5 : 0);
      if (tile.hp !== undefined && !tile.monsterState?.slimes)
        tile.hp += maxHp - (tile.maxHp ?? maxHp);
      if (tile.monsterState && !tile.monsterState.slimes)
        tile.monsterState.hp = tile.hp;
      tile.maxHp = maxHp;
      tile.hp ??= tile.maxHp;
      startFight(
        game,
        {
          attackerId: p.id,
          monsterId: tile.monster,
          biome: tile.biome,
          monsterHp: tile.hp,
          monsterState: tile.monsterState,
        },
        rng,
      );
      return;
    }
    case "chest":
    case "legendaryChest":
    case "item": {
      const isItem = tile.type === "item";
      const count = 3 + Number(equipped(p, isItem ? "c15" : "c14"));
      const tier = isItem ? "i" : tile.type === "legendaryChest" ? "l" : "c";
      offer(game, p, draw(game, tier, count, rng), true);
      return;
    }
    case "portal":
      relocate(game, p, tile.to);
      log(game, p.name + " 经传送门抵达第 " + p.pos + " 格。");
      land(game, p, rng, true);
      return;
    case "rest":
      phase(game, "rest");
      return;
    case "trap":
      if (p.sp > 0) {
        if (p.sp === 1 && p.badgeActive && !p.badgeStat)
          p.badgeSpentByTrap = true;
        p.sp--;
        log(game, p.name + " 触发陷阱，失去 1 点未分配技能点。");
      } else log(game, p.name + " 触发陷阱，但没有未分配的技能点。");
      phase(game, "end");
      return;
    default:
      phase(game, "end");
  }
}

function afterEncounter(game, p, rng, portal, trapped = false) {
  if (portal) phase(game, "end");
  else if (!trapped && carried(p, "i05") && tileAt(game, p).type !== "start")
    phase(game, "landing");
  else resolveSpace(game, p, rng);
}

function resolveArrival(
  game,
  p,
  rng,
  portal,
  trapped,
  terrain,
  checkDisplacement = false,
) {
  const arrival = p.pos;
  if (terrain && !applyArrival(game, p)) return;
  if (checkDisplacement && p.pos !== arrival) {
    land(game, p, rng, false, false, trapped);
    return;
  }
  const tile = tileAt(game, p);
  portal &&= p.pos === arrival;
  const others = game.players.filter((q) => q.id !== p.id && q.online);
  if (tile.type === "duel" && !equipped(p, "l08")) {
    const champion = others
      .filter((q) => tileAt(game, q).type === "duel" && !equipped(q, "l08"))
      .sort((a, b) => a.arrived - b.arrived)[0];
    if (champion) {
      log(game, champion.name + " 为擂主，先攻击挑战者 " + p.name + "。");
      startFight(game, { attackerId: champion.id, defenderId: p.id }, rng);
      return;
    }
  }
  afterEncounter(game, p, rng, portal, trapped);
}

function land(
  game,
  p,
  rng,
  portal = false,
  terrain = true,
  alreadyTrapped = false,
) {
  const trapped = consumeBanana(game, p) || alreadyTrapped;
  const others = game.players.filter((q) => q.id !== p.id && q.online);
  const opponent =
    p.pos === 1
      ? null
      : others
          .filter((q) => q.pos === p.pos)
          .sort((a, b) => a.arrived - b.arrived)[0];
  if (opponent) {
    if (equipped(opponent, "c11")) {
      relocate(game, p, p.pos - 2);
      log(game, opponent.name + " 的逐客路障使 " + p.name + " 后退 2 格。");
      const landedOnTrap = consumeBanana(game, p);
      resolveArrival(game, p, rng, false, trapped || landedOnTrap, true);
    } else {
      phase(
        game,
        "skirmish",
        {
          entrant: p.id,
          incumbent: opponent.id,
          portal,
          trapped,
          terrain,
          first: null,
        },
        p.id,
      );
      log(game, p.name + " 与 " + opponent.name + " 同格交锋。");
    }
  } else resolveArrival(game, p, rng, portal, trapped, terrain, true);
}

function consumeBanana(game, p) {
  const tile = tileAt(game, p);
  if (!tile.banana) return false;
  delete tile.banana;
  log(game, p.name + " 踩到香蕉皮，停在第 " + p.pos + " 格。");
  return true;
}

function applyArrival(game, p) {
  const tile = tileAt(game, p);
  if (tile.terrain === "desert") {
    relocate(game, p, p.pos - 1);
    log(game, p.name + " 在沙漠后退至第 " + p.pos + " 格。");
  } else if (tile.terrain === "volcano" && !equipped(p, "l10")) {
    p.hp--;
    log(game, p.name + " 受到 1 点火山伤害。");
    if (p.hp <= 0) {
      if (equipped(p, "l04")) {
        removeGear(p, "l04");
        p.hp = 10;
        log(game, p.name + " 使用凤凰之泪满血复活。");
      } else {
        respawn(game, p);
        return false;
      }
    }
  }
  return true;
}

const rollNames = { move: "移动", rain: "雨林", skirmish: "交锋" };

function showRoll(game, p, rolled = false) {
  const c = game.check;
  let total =
    c.values.reduce((sum, v) => sum + v, 0) +
    c.weight +
    Number(equipped(p, "c03"));
  if (c.kind === "move") total += p.movePenalty + Number(equipped(p, "c06"));
  c.total = total;
  c.parity = equipped(p, "c07")
    ? "even"
    : equipped(p, "c08")
      ? "odd"
      : undefined;
  recordDice(
    game,
    [...c.values],
    total,
    p.name + " · " + rollNames[c.kind] + "判定",
    rolled,
    c.parity,
  );
}

function finishRoll(game, p, rng) {
  const c = game.check;
  game.check = null;
  game.mods = {};
  log(game, p.name + " 的" + rollNames[c.kind] + "判定为 " + c.total + "。");
  if (c.kind === "rain") {
    if (parityOf(c.total, c.parity) === "odd") {
      log(game, p.name + " 未能穿过雨林，跳过本回合。");
      phase(game, "end");
    } else phase(game, "move", { rainChecked: true });
  } else if (c.kind === "skirmish") {
    const match = game.pending;
    if (match.first === null) {
      match.first = c.total;
      game.actor = match.incumbent;
    } else if (c.total === match.first) {
      match.first = null;
      game.actor = match.entrant;
      log(game, "交锋平手，双方重新判定。");
    } else {
      const loser = player(
        game,
        c.total < match.first ? match.incumbent : match.entrant,
      );
      relocate(game, loser, loser.pos - 1);
      log(game, loser.name + " 交锋落败，后退 1 格。");
      const entrant = player(game, match.entrant);
      const displaced = loser === entrant;
      const landedOnTrap = displaced && consumeBanana(game, entrant);
      resolveArrival(
        game,
        entrant,
        rng,
        match.portal && !displaced,
        match.trapped || landedOnTrap,
        displaced || match.terrain !== false,
      );
    }
  } else {
    p.movePenalty = 0;
    if (c.total <= 0) {
      log(game, p.name + " 留在当前格。");
      phase(game, "end");
    } else {
      const end = Math.min(100, p.pos + c.total);
      const trap = game.board.slice(p.pos, end).find((tile) => tile.banana);
      relocate(game, p, trap?.pos ?? end, false, true);
      log(game, p.name + " 移动至第 " + p.pos + " 格。");
      land(game, p, rng);
    }
  }
}

function rollCheck(game, p, kind, rng) {
  const mods = game.mods;
  const values = Array.from({ length: mods.extra ? 2 : 1 }, (_, i) =>
    i === 0 && mods.face ? mods.face : 1 + Math.floor(rng() * 6),
  );
  game.check = { kind, values, weight: mods.weight || 0 };
  delete mods.face;
  showRoll(game, p, true);
}

function removeStatus(p, key) {
  if (key === "snare") p.movePenalty = 0;
  else if (key.startsWith("gear-")) removeOne(p.locked, key.slice(5));
  else p.statuses.splice(Number(key), 1);
  syncBadge(p);
}

function statusOptions(p, strong) {
  const options = p.statuses.flatMap((s, i) => {
    if (s.type === "stunned" && !strong) return [];
    const translated = {
      slipped: "滑倒",
      disarmed: "缴械",
      stunned: "晕眩",
      buff: "增益",
      debuff: "减益",
    };
    return [{ key: String(i), text: s.label || translated[s.type] || s.type }];
  });
  if (p.movePenalty) options.push({ key: "snare", text: "移动减益" });
  for (const id of p.locked)
    options.push({ key: "gear-" + id, text: "封锁的" + nameOf(id) });
  return options;
}

function targetOptions(game, p, id) {
  const result = [];
  for (const [index, q] of game.players.entries()) {
    if (id === "i17")
      result.push(action("target:" + index, q.name + " · 移动判定 −2", id));
    if (id === "i13" && q.id !== p.id) {
      for (const card of q.gear)
        if (card !== "l16" && !q.locked.includes(card)) {
          result.push(
            action(
              "target:" + index + ":" + card,
              q.name + " · " + nameOf(card),
              card,
            ),
          );
        }
    }
    if (id === "i14" || id === "i15") {
      const available = statusOptions(q, id === "i15");
      if (id === "i15" && available.length)
        result.push(action("target:" + index, q.name + " · 驱散全部", id));
      if (id === "i14")
        for (const st of available) {
          result.push(
            action(
              "target:" + index + ":" + st.key,
              q.name + " · " + st.text,
              id,
            ),
          );
        }
    }
  }
  if (id === "i18")
    for (let i = 1; i <= 6; i++)
      result.push(action("target:" + i, "指定 " + i + " 点", id));
  if (id === "i19")
    for (const i of [2, -2])
      result.push(action("target:" + i, "判定值 " + (i > 0 ? "+2" : "−2"), id));
  return result;
}

function menu(game, value, extra = {}) {
  const back = { value: game.phase, pending: game.pending, actor: game.actor };
  phase(game, value, { ...extra, back }, game.actor);
}
function goBack(game) {
  const { value, pending, actor } = game.pending.back;
  phase(game, value, pending, actor);
}

function consume(game, p, id) {
  removeOne(p.items, id);
  log(game, p.name + " 使用了" + nameOf(id) + "。");
}

function useItem(game, p, id, rng) {
  if (["i13", "i14", "i15", "i17", "i18", "i19"].includes(id)) {
    menu(game, "itemTarget", { id });
    return;
  }
  consume(game, p, id);
  switch (id) {
    case "i01":
      game.check.values = game.check.values.map((n) => 7 - n);
      showRoll(game, p);
      break;
    case "i02":
      capHP(p, 2);
      break;
    case "i05":
      relocate(game, p, p.pos + 1);
      log(game, p.name + " 使用跨步符前进至第 " + p.pos + " 格。");
      land(game, p, rng);
      break;
    case "i06":
      for (const stat of Object.keys(stats)) {
        p.sp += p.alloc[stat];
        p[stat] -= p.alloc[stat];
        p.alloc[stat] = 0;
      }
      p.badgeStat = null;
      break;
    case "i08": {
      const c = game.check;
      c.values = c.values.map(() => 1 + Math.floor(rng() * 6));
      showRoll(game, p, true);
      break;
    }
    case "i09":
      game.mods.extra = true;
      break;
    case "i10":
      tileAt(game, p).banana = true;
      break;
    case "i11":
      relocate(game, p, 1);
      phase(game, "end");
      break;
  }
}

function applyTarget(game, p, parts) {
  const id = game.pending.id;
  const [, target, opt] = parts;
  goBack(game);
  consume(game, p, id);
  if (id === "i18") game.mods.face = Number(target);
  else if (id === "i19") {
    if (game.check) {
      game.check.weight += Number(target);
      showRoll(game, p);
    } else game.mods.weight = (game.mods.weight || 0) + Number(target);
  } else {
    const q = game.players[Number(target)];
    if (id === "i17") q.movePenalty -= 2;
    else if (id === "i13") {
      q.locked.push(opt);
      syncBadge(q);
    } else if (id === "i14") removeStatus(q, opt);
    else if (id === "i15") {
      q.statuses = [];
      q.movePenalty = 0;
      q.locked = [];
      syncBadge(q);
    }
  }
}

function boardItems(game, p) {
  if (game.check)
    return unique(p.items).filter((id) => ["i01", "i08", "i19"].includes(id));
  const preRoll = game.phase === "move" || game.phase === "skirmish";
  const roaming = ["move", "end", "landing", "finish", "rest"].includes(
    game.phase,
  );
  const needsRainCheck =
    tileAt(game, p).terrain === "rainforest" && !game.pending.rainChecked;
  return unique(p.items).filter((id) => {
    if (id === "i18") return preRoll && !game.mods.face;
    if (id === "i09") return preRoll && !game.mods.extra;
    if (id === "i19") return preRoll;
    if (!roaming) return false;
    if (id === "i02") return p.hp < 10;
    if (id === "i05")
      return p.pos < 100 && ["move", "landing"].includes(game.phase);
    if (id === "i06") return Object.values(p.alloc).some((n) => n > 0);
    if (id === "i10") return !tileAt(game, p).banana;
    if (id === "i11")
      return game.phase === "move" && p.pos > 1 && !needsRainCheck;
    if (["i13", "i14", "i15", "i17"].includes(id))
      return targetOptions(game, p, id).length > 0;
    return false;
  });
}

function actorId(game) {
  return game.battle?.actorId ?? game.actor;
}

function actions(game, id) {
  const p = player(game, id);
  if (!p?.online || game.winner || actorId(game) !== id) return [];
  if (game.phase === "battle") return battleActions(game, id);
  let options;
  const statOptions = (prefix) =>
    Object.entries(stats).map(([key, name]) =>
      action(prefix + ":" + key, name + " +1"),
    );
  if (game.phase === "itemTarget")
    return [
      ...targetOptions(game, p, game.pending.id),
      action("cancel", "取消"),
    ];
  if (game.check)
    options = [action("check:accept", "确认判定 · " + game.check.total)];
  else
    switch (game.phase) {
      case "move": {
        const rain =
          tileAt(game, p).terrain === "rainforest" && !game.pending.rainChecked;
        options = [action("roll", rain ? "投掷雨林判定" : "投骰移动")];
        break;
      }
      case "landing":
        options = [action("resolve", "结算当前格")];
        break;
      case "end":
        options = [action("end", "结束回合")];
        break;
      case "skirmish":
        options = [action("clash", "投掷交锋判定")];
        break;
      case "rest":
        options = [action("heal", "回复 5 点生命"), ...statOptions("rest")];
        break;
      case "finish":
        options = [
          action("challenge", "挑战原初之王", "final"),
          action("return", "返回起点 · 技能点 +1"),
        ];
        break;
      case "spend":
        return [...statOptions("upgrade"), action("cancel", "取消")];
      case "offer":
        return [
          ...game.pending.ids.map((card) =>
            action("take:" + card, nameOf(card), card),
          ),
          ...(game.pending.canPass ? [action("passOffer", "放弃领取")] : []),
        ];
      case "replace": {
        const card = game.pending.card,
          forced = conflictingCharm(p, card);
        const old = forced
          ? [forced]
          : unique(card.startsWith("i") ? p.items : p.gear);
        return [
          ...old.map((c) => action("replace:" + c, "替换" + nameOf(c), c)),
          action("decline", "放弃" + nameOf(card), card),
        ];
      }
      case "loot": {
        const loser = player(game, game.pending.loser);
        return [
          ...unique(loser.gear).map((c) =>
            action("loot:" + c, "取得" + nameOf(c), c),
          ),
          ...loser.items.map((_, i) =>
            action("loot-item:" + i, "取得面朝下的道具 " + (i + 1)),
          ),
        ];
      }
      case "deathDiscard":
        return p.gear
          .filter(legendary)
          .map((c) => action("discard:" + c, "弃置" + nameOf(c), c));
      default:
        return [];
    }
  if (
    !game.check &&
    p.sp > 0 &&
    ["move", "end", "landing", "finish", "rest"].includes(game.phase)
  ) {
    options.push(action("spend", "分配技能点（" + p.sp + "）"));
  }
  return [
    ...options,
    ...boardItems(game, p).map((c) =>
      action("use:" + c, "使用" + nameOf(c), c),
    ),
  ];
}

export function act(game, playerId, actionId, rng = Math.random) {
  if (!actions(game, playerId).some((a) => a.id === actionId))
    throw new Error("当前无法执行这个行动");
  const p = player(game, playerId);
  game.movements = [];
  if (game.phase === "battle") {
    const outcome = actBattle(game, playerId, actionId, rng);
    game.players.forEach(syncBadge);
    settleBattle(game, outcome, rng);
    if (game.phase === "end" && !player(game).online) nextTurn(game);
    if (game.log.length > 120) game.log.splice(0, game.log.length - 120);
    return;
  }
  const parts = actionId.split(":"),
    [verb, choice] = parts;
  switch (verb) {
    case "roll":
      rollCheck(
        game,
        p,
        tileAt(game, p).terrain === "rainforest" && !game.pending.rainChecked
          ? "rain"
          : "move",
        rng,
      );
      break;
    case "check":
      finishRoll(game, p, rng);
      break;
    case "clash":
      rollCheck(game, p, "skirmish", rng);
      break;
    case "end":
      nextTurn(game);
      break;
    case "resolve":
      resolveSpace(game, p, rng);
      break;
    case "heal":
      capHP(p, 5);
      log(game, p.name + " 在休息格回复生命。");
      phase(game, "end");
      break;
    case "rest":
      upgrade(p, choice, false);
      log(game, p.name + " 在休息格提升" + stats[choice] + "。");
      phase(game, "end");
      break;
    case "spend":
      menu(game, "spend");
      break;
    case "upgrade":
      upgrade(p, choice, true);
      goBack(game);
      break;
    case "cancel":
      goBack(game);
      break;
    case "challenge":
      startFight(game, { attackerId: p.id, monsterId: "final" }, rng);
      break;
    case "return":
      relocate(game, p, 1);
      p.sp++;
      log(game, p.name + " 放弃最终挑战，返乡获得 1 技能点。");
      phase(game, "end");
      break;
    case "take":
      receive(game, p, choice);
      break;
    case "replace":
      receive(game, p, game.pending.card, choice);
      break;
    case "decline":
    case "passOffer":
      phase(game, "end");
      break;
    case "discard":
      removeGear(p, choice);
      phase(game, "end");
      break;
    case "loot":
    case "loot-item": {
      const loser = player(game, game.pending.loser);
      const card =
        verb === "loot-item"
          ? loser.items.splice(Number(choice), 1)[0]
          : choice;
      if (verb === "loot") removeGear(loser, card);
      receive(game, p, card);
      break;
    }
    case "use":
      useItem(game, p, choice, rng);
      break;
    case "target":
      applyTarget(game, p, parts);
      break;
  }
  if (game.phase === "end" && !player(game).online) nextTurn(game);
}

function interruptOffline(game) {
  if (!game.players.some((p) => p.online) || game.winner) return;
  let b = game.battle;
  if (b?.pendingOutcome && b.actors.some((id) => !player(game, id).online)) {
    settleBattle(game, b.pendingOutcome, Math.random);
    b = null;
  }
  if (b && b.actors.some((id) => !player(game, id).online)) {
    if (b.monster) {
      const tile = tileAt(game, player(game, b.first));
      tile.hp = b.hp;
      tile.monsterState = { hp: b.hp, form: b.form, slimes: b.slimes };
      phase(game, "resumeMonster", {
        monster: b.monster,
        encounter: tile.encounter,
        battle: b,
        dice: game.dice,
      });
    } else {
      phase(game, "end");
    }
    game.battle = null;
    log(game, "战斗因玩家离线中断。");
  }
  if (game.phase === "itemTarget" && game.pending.back.value === "skirmish") {
    const match = game.pending.back.pending;
    if (
      !player(game, match.entrant).online ||
      !player(game, match.incumbent).online
    )
      goBack(game);
  }
  if (game.phase === "skirmish") {
    const entrant = player(game, game.pending.entrant);
    if (!entrant.online) {
      game.check = null;
      game.mods = {};
      phase(game, "end");
    } else if (!player(game, game.pending.incumbent).online) {
      game.check = null;
      game.mods = {};
      resolveArrival(
        game,
        entrant,
        Math.random,
        game.pending.portal,
        game.pending.trapped,
        game.pending.terrain !== false,
      );
    }
  }
  const owner = player(game, game.actor);
  if (!owner.online) {
    // The seat retains its private selection and already-spent roll modifiers.
    if (game.phase !== "end") {
      owner.resume = {
        phase: game.phase,
        pending: game.pending,
        check: game.check,
        mods: game.mods,
      };
    }
    game.check = null;
    game.mods = {};
    phase(game, "end");
    if (player(game).online) return;
  }
  if (!player(game).online && game.phase !== "loot" && game.phase !== "replace")
    nextTurn(game);
}

export function setOnline(game, id, online) {
  const p = player(game, id);
  if (!p || p.online === Boolean(online)) return;
  p.online = Boolean(online);
  log(game, p.name + (p.online ? " 已重新连接。" : " 暂时离线。"));
  interruptOffline(game);
}

function describe(game, viewer) {
  if (game.winner)
    return player(game, game.winner).name + " 击败原初之王，赢得本局。";
  const who = player(game, actorId(game))?.name || "";
  if (game.phase === "battle") return who + " · " + game.battle.detail;
  if (game.phase === "itemTarget")
    return (
      who +
      (viewer === game.actor
        ? " · 选择" + nameOf(game.pending.id) + "的目标或点数"
        : " · 正在选择行动目标")
    );
  if (game.check) return who + " · 采用本次判定，或使用道具调整点数";
  const labels = {
    move: "准备移动",
    end: "本回合的格子已结算",
    skirmish: "投骰进行同格交锋",
    landing: "结算当前格，或使用跨步符前进",
    rest: "选择回复生命或提升一项属性",
    finish: "挑战原初之王，或返回起点获得 1 技能点",
    spend: "选择要提升的属性",
    offer: "选择一张奖励牌",
    replace: "选择要替换的牌，或放弃新牌",
    loot: "从落败者的装备与道具中选择一件",
    deathDiscard: "选择要弃置的传说装备",
  };
  return who + " · " + labels[game.phase];
}

export function view(game, id) {
  const b = game.battle;
  let battle = null;
  if (b) {
    const fields = [
      "monster",
      "form",
      "hp",
      "maxHp",
      "atk",
      "def",
      "actors",
      "effects",
      "actorId",
      "phase",
      "round",
      "detail",
      "attackRoll",
      "defenseRoll",
      "last",
      "lastDice",
      "statuses",
      "remaining",
      "side",
      "shield",
      "shieldMax",
      "baseAtk",
      "rageBonus",
      "slimes",
    ];
    battle = Object.fromEntries(
      fields.filter((k) => b[k] !== undefined).map((k) => [k, b[k]]),
    );
  }
  return structuredClone({
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      online: p.online,
      pos: p.pos,
      hp: p.hp,
      atk: p.atk,
      def: p.def,
      act: p.act,
      sp: p.sp,
      gear: p.gear,
      locked: p.locked,
      statuses: p.statuses,
      movePenalty: p.movePenalty,
      equipCapacity: 3,
      itemCapacity: Number.isFinite(itemLimit(p)) ? itemLimit(p) : null,
      itemCount: p.items.length,
      ...(p.id === id ? { items: p.items } : {}),
    })),
    board: game.board.map(({ monsterState, encounter, ...tile }) => tile),
    turn: game.turn,
    actor: actorId(game),
    phase: game.phase,
    round: game.round,
    battle,
    actions: actions(game, id),
    winner: game.winner,
    log: game.log.slice(-120),
    prompt: describe(game, id),
    dice: game.dice,
    movementSequence: game.sequence,
    movements: game.movements || [],
  });
}
