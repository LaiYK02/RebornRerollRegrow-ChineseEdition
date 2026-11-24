import { badgeBonus, cards, monsterProfile } from "./cards.mjs";
import {
  startBattle,
  battleActions,
  battleDiceReview,
  actBattle,
  playerStats as battlePlayerStats,
  recordDice,
  refreshAttackAllowance,
  refreshBattleStats,
  battleMonsterState,
  restoreEnemyLanes,
  restoreBattleRules,
} from "./battle.mjs";

const stats = { atk: "攻击", def: "防御", act: "行动" };
export const MAX_PLAYERS = 5;
const palette = ["#e76a51", "#35a89a", "#b18aef", "#e2af40", "#509be8"];
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
const rulesVersion = 8;
const matchId = () =>
  Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);

function log(game, message) {
  game.log.push(message);
  if (game.log.length > 120) game.log.splice(0, game.log.length - 120);
}

function board(rng) {
  const result = Array.from({ length: 100 }, (_, i) => {
    const biome = ["plain", "desert", "rainforest", "volcano"][
      Math.floor(i / 25)
    ];
    return { pos: i + 1, biome, terrain: biome };
  });
  const spaces = {
    start: [1],
    finish: [100],
    normal: [
      4, 9, 13, 14, 22, 25, 27, 28, 34, 36, 40, 41, 44, 46, 53, 61, 63, 71,
    ],
    elite: [19, 38, 49, 50, 59, 64, 66, 72, 74, 81, 84, 86, 91, 94, 96],
    boss: [32, 43, 54, 69, 78, 87, 98],
    chest: [6, 10, 17, 29, 39, 51, 62, 73],
    legendaryChest: [82, 92],
    item: [3, 12, 23, 31, 42, 52, 65, 75, 80, 83, 93],
    rest: [2, 8, 18, 26, 37, 48, 58, 68, 77, 88, 97],
    duel: [7, 11, 16, 20, 24, 35, 47, 55, 57, 67, 70, 79, 89, 95],
    trap: [5, 21, 30, 56, 85, 99],
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
  if (!rng) return result;
  const positions = result.map(({ pos }) => pos);
  for (let start = 0; start < positions.length; start += 25) {
    const first = Math.max(1, start);
    const last = Math.min(98, start + 24);
    for (let i = last; i > first; i--) {
      const j = first + Math.floor(rng() * (i - first + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
  }
  const shuffled = [];
  for (const tile of result) {
    const pos = positions[tile.pos - 1];
    const to = tile.to ? positions[tile.to - 1] : undefined;
    shuffled[pos - 1] = { ...tile, pos, ...(to ? { to } : {}) };
  }
  return shuffled;
}

export function restoreGame(game, rng = Math.random) {
  const legacyCombat = (game.rulesVersion ?? 0) < 4;
  const beforeV8 = (game.rulesVersion ?? 0) < 8;
  if (beforeV8) {
    for (const p of game.players) {
      if (p.badgeStat) upgrade(p, p.badgeStat, badgeBonus - 1);
    }
  }
  // Version 6 introduced shuffled maps; only earlier saves use the fixed layout.
  const layout = (game.rulesVersion ?? 0) < 6 ? board() : null;
  let wasLegacyBoard = false;
  for (const tile of game.board) {
    wasLegacyBoard ||= tile.terrain !== tile.biome;
    tile.terrain = tile.biome;
    if (layout && tile.type === "plain") tile.type = layout[tile.pos - 1].type;
    if (
      layout &&
      tile.type === "normal" &&
      layout[tile.pos - 1].type === "duel"
    ) {
      tile.type = "duel";
      delete tile.monster;
      delete tile.hp;
      delete tile.maxHp;
      delete tile.monsterState;
    }
    if (tile.type === "chest" && tile.biome === "volcano")
      tile.type = "legendaryChest";
    if (tile.type === "normal" && tile.biome === "volcano") {
      tile.type = "elite";
      delete tile.monster;
      delete tile.maxHp;
      delete tile.hp;
      delete tile.monsterState;
    }
    if (
      beforeV8 &&
      ["e01", "e02"].includes(tile.monster) &&
      tile.maxHp !== undefined
    ) {
      const maxHp = monsterProfile(tile.monster, tile.biome).hp;
      const delta = maxHp - tile.maxHp;
      if (tile.hp > 0) tile.hp += delta;
      if (tile.monsterState?.hp > 0) tile.monsterState.hp += delta;
      tile.maxHp = maxHp;
    }
  }
  if (legacyCombat) {
    game.upgrades ??= [];
    for (const p of game.players) {
      p.statuses = p.statuses.filter((status) => status.type !== "slipped");
      const saved = p.sp || 0;
      const badge =
        saved > 0 && p.badgeActive && !p.badgeStat && !p.badgeSpentByTrap;
      grantUpgrade(game, p, saved - Number(badge));
      if (badge) grantUpgrade(game, p, 1, "badge");
      delete p.sp;
      delete p.badgeSpentByTrap;
    }
    if (game.phase === "spend") goBack(game);
    if (game.phase === "landing" && game.check?.kind === "rain") {
      game.check = null;
      game.mods = {};
    }
    if (game.check) showRoll(game, player(game, game.actor));
  }
  if ((wasLegacyBoard || legacyCombat) && game.phase === "offer") {
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
  if (game.rulesVersion === 4) {
    migrateMonsterReward(game, player(game, game.actor), game, rng);
    for (const p of game.players)
      if (p.resume) migrateMonsterReward(game, p, p.resume, rng);
  }
  if ((game.rulesVersion ?? 0) < 6) {
    function migrateTurn(state, p) {
      const saved = state.pending.back?.pending ?? state.pending;
      state.turnTerrain = [];
      if (saved.rainChecked) state.turnTerrain.push("rainforest");
      if (saved.terrain === false)
        state.turnTerrain.push(tileAt(game, p).terrain);
    }
    migrateTurn(game, player(game));
    for (const p of game.players) {
      if (p.resume) migrateTurn(p.resume, p);
      if (p.locked.length) {
        p.locked = [];
        syncBadge(game, p);
      }
    }
    if (game.phase === "itemTarget" && game.pending.id === "i13") goBack(game);
    for (const p of game.players) {
      const saved = p.resume;
      if (saved?.phase !== "itemTarget" || saved.pending.id !== "i13") continue;
      const { value, pending } = saved.pending.back;
      saved.phase = value;
      saved.pending = pending;
    }
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
  if (legacyCombat && b) {
    const tile = tileAt(game, player(game, b.first));
    restoreBattleRules(game, tile.biome);
    if (tile.monster === b.monster) {
      tile.maxHp =
        monsterProfile(b.monster, tile.biome).hp +
        (b.monster === "e05" ? 5 : 0);
    }
  }
  const suspended = game.players.map((p) => p.resume?.pending?.battle);
  for (const battle of new Set([b, ...suspended])) {
    if (!battle) continue;
    if ((game.rulesVersion ?? 0) < 7 && battle.form === "final") {
      battle.base.atk = (battle.base.atk / 3) * 4;
      battle.base.def = (battle.base.def / 3) * 4;
    }
    if (beforeV8 && ["e01", "e02"].includes(battle.form)) {
      const maxHp = monsterProfile(
        battle.form,
        battle.biome || tileAt(game, player(game, battle.first)).biome,
      ).hp;
      if (battle.hp > 0) battle.hp += maxHp - battle.maxHp;
      battle.maxHp = maxHp;
    }
    const state = { ...game, battle };
    if (beforeV8 && battle.itemMenu) delete battle.itemMenu;
    restoreEnemyLanes(state);
    refreshBattleStats(state);
    if (beforeV8) {
      for (const id of battle.actors) {
        if (player(game, id).badgeStat === "act")
          refreshAttackAllowance(state, id);
      }
    }
  }
  if (beforeV8) {
    // A pending old confirmation must choose which group of statuses to clear.
    for (const state of [game, ...game.players.map((p) => p.resume)]) {
      if (state?.phase === "itemTarget" && state.pending.id === "i15")
        delete state.pending.target;
    }
  }
  game.rulesVersion = rulesVersion;
  game.matchId ??= matchId();
  advanceIdleTurn(game, rng);
  return game;
}

export function newGame(roster, rng = Math.random) {
  if (
    !Array.isArray(roster) ||
    roster.length < 1 ||
    roster.length > MAX_PLAYERS ||
    roster.some((p) => !p.id || !p.name) ||
    new Set(roster.map((p) => p.id)).size !== roster.length
  ) {
    throw new Error("需要 1 至 " + MAX_PLAYERS + " 名不同的玩家");
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
    upgrades: [],
    rulesVersion,
    matchId: matchId(),
    board: board(rng),
    turn,
    actor: turn,
    phase: "move",
    round: 1,
    sequence: 0,
    turnTerrain: [],
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

function nextTurn(game, rng) {
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
    game.turnTerrain = resume?.turnTerrain || [];
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
        restoreEnemyLanes(game);
        refreshAttackAllowance(game, next.id);
      } else if (tile.monster === saved.monster) resolveSpace(game, next, rng);
      else phase(game, "move");
    }
    return;
  }
}

function grantUpgrade(game, p, count = 1, kind = "permanent") {
  if (count > 0) game.upgrades.push({ id: p.id, count, kind });
}

function pendingUpgrade(game) {
  return game.upgrades.find((entry) => player(game, entry.id)?.online);
}

function syncBadge(game, p) {
  const active = equipped(p, "c13");
  if (active === p.badgeActive) return;
  if (active) grantUpgrade(game, p, 1, "badge");
  else if (p.badgeStat) {
    upgrade(p, p.badgeStat, -badgeBonus);
    p.badgeStat = null;
  } else
    game.upgrades = game.upgrades.filter(
      (entry) => entry.id !== p.id || entry.kind !== "badge",
    );
  p.badgeActive = active;
}

function upgrade(p, stat, change = 1) {
  p.alloc[stat] += change;
  p[stat] += change;
}

function permanentUpgrades(p, stat) {
  return p.alloc[stat] - (p.badgeStat === stat ? badgeBonus : 0);
}

function redistribute(game, p) {
  let count = 0;
  for (const stat of Object.keys(stats)) {
    count += permanentUpgrades(p, stat);
    p[stat] -= p.alloc[stat];
    p.alloc[stat] = 0;
  }
  grantUpgrade(game, p, count);
  if (p.badgeStat) grantUpgrade(game, p, 1, "badge");
  p.badgeStat = null;
}

function removeOne(array, value) {
  const index = array.indexOf(value);
  if (index >= 0) array.splice(index, 1);
}

function removeGear(game, p, id) {
  removeOne(p.gear, id);
  removeOne(p.locked, id);
  if (id === "l16") p.items = [];
  syncBadge(game, p);
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
    for (const stat of Object.keys(stats)) upgrade(p, stat);
    log(game, p.name + " 触发并弃置归途传承印，三项属性各永久 +1。");
    removeGear(game, p, "l13");
  }
}

function respawn(game, p, { duel = false, escaped = false } = {}) {
  // The seal's own death trigger can satisfy the one-legendary discard.
  const lostSeal = equipped(p, "l13");
  relocate(game, p, 1, true);
  p.hp = 10;
  p.statuses = [];
  p.movePenalty = 0;
  if (!escaped) log(game, p.name + " 在起点以 10 点生命重生。");
  phase(game, "end");
  if (!duel && !lostSeal && p.gear.some(legendary)) {
    if (equipped(p, "c16")) {
      removeGear(game, p, "c16");
      log(game, "替偿木偶代替传说装备被弃置。");
    } else phase(game, "deathDiscard", {}, p.id);
  }
}

function randomOne(array, rng) {
  return array[Math.min(array.length - 1, Math.floor(rng() * array.length))];
}

function awardMonsterUpgrade(game, p, rng) {
  const stat = randomOne(Object.keys(stats), rng);
  upgrade(p, stat);
  log(game, p.name + " 获得随机升级，" + stats[stat] + " +1。");
}

function migrateMonsterReward(game, p, state, rng) {
  if (state.phase !== "offer" && state.phase !== "replace") return;
  const tile = tileAt(game, p);
  if (tile.type !== "elite" && tile.type !== "boss") return;
  const pending = state.pending;
  const isItemReward =
    state.phase === "replace"
      ? pending.card.startsWith("i")
      : pending.ids.every((id) => id.startsWith("i"));
  awardMonsterUpgrade(game, p, rng);
  if (isItemReward) {
    state.phase = "end";
    state.pending = {};
  } else delete pending.followup;
}

function draw(game, type, count, rng) {
  const options = pool(type).flatMap((id) => {
    const stock = cards[id].copies ?? 1;
    const held = game.players.reduce((sum, q) => {
      const owned = (type === "i" ? q.items : q.gear).filter(
        (x) => x === id,
      ).length;
      const saved = q.resume?.pending;
      const reserved = saved?.ids?.includes(id) || saved?.card === id;
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

function needsReplacement(p, card) {
  return card.startsWith("i")
    ? p.items.length >= itemLimit(p)
    : p.gear.length >= 3 || Boolean(conflictingCharm(p, card));
}

function receive(game, p, card, replacing) {
  const isItem = card.startsWith("i");
  if (replacing) {
    if (isItem) removeOne(p.items, replacing);
    else removeGear(game, p, replacing);
  }
  if (needsReplacement(p, card)) {
    phase(game, "replace", { card }, p.id);
    return;
  }
  if (isItem) p.items.push(card);
  else p.gear.push(card);
  syncBadge(game, p);
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
    respawn(game, loser, { duel: true });
    grantUpgrade(game, winner);
    log(game, winner.name + " 赢得决斗，获得 1 次升级。");
    if (loser.gear.length + loser.items.length)
      phase(game, "loot", { loser: loser.id }, winner.id);
  } else if (outcome.type === "escape") {
    if (b.monster === "final") {
      log(game, p.name + " 逃离最终头目，按战败结算。");
      respawn(game, p, { escaped: true });
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
    if (tile.boss) tile.monster = tile.boss;
    else delete tile.monster;
    delete tile.hp;
    delete tile.maxHp;
    delete tile.monsterState;
    log(game, p.name + " 击败怪物。");
    if (b.monster.startsWith("n")) offer(game, p, draw(game, "i", 1, rng));
    else {
      awardMonsterUpgrade(game, p, rng);
      offer(game, p, draw(game, "l", 3, rng), true);
    }
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
      const deck = pool(tier);
      tile.monster ??= tile.boss || randomOne(deck, rng);
      tile.encounter = (tile.encounter || 0) + 1;
      const profile = monsterProfile(tile.monster, tile.biome);
      const maxHp = profile.hp + (tile.monster === "e05" ? 5 : 0);
      if (
        tile.hp !== undefined &&
        !tile.monsterState?.slimes &&
        !tile.monsterState?.enemies
      )
        tile.hp += maxHp - (tile.maxHp ?? maxHp);
      if (
        tile.monsterState &&
        !tile.monsterState.slimes &&
        !tile.monsterState.enemies
      )
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
      land(game, p, rng, { portal: true });
      return;
    case "rest":
      phase(game, "rest");
      return;
    case "trap":
      if (Object.keys(stats).some((stat) => permanentUpgrades(p, stat) > 0))
        grantUpgrade(game, p, 1, "downgrade");
      else log(game, p.name + " 触发陷阱，但没有可扣除的永久升级。");
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

function plannedDestination(game, p, destination) {
  return (
    game.board.slice(p.pos, destination).find((tile) => tile.banana)?.pos ??
    destination
  );
}

function moveForward(game, p, destination, rng, stepwise) {
  relocate(game, p, plannedDestination(game, p, destination), false, stepwise);
  log(game, p.name + " 移动至第 " + p.pos + " 格。");
  land(game, p, rng, { destination, stepwise });
}

function land(game, p, rng, arrival = {}) {
  const tile = tileAt(game, p);
  if (tile.banana) {
    delete tile.banana;
    log(game, p.name + " 踩到第 " + p.pos + " 格的香蕉皮。");
    if (carried(p, "i14")) {
      phase(game, "banana", arrival);
      return;
    }
    arrival = { ...arrival, trapped: true };
  }
  resolveArrival(game, p, rng, arrival);
}

function resolveArrival(game, p, rng, { portal, trapped, skipClash } = {}) {
  const arrival = p.pos;
  if (!applyArrival(game, p, trapped)) return;
  if (p.pos !== arrival) {
    land(game, p, rng, { trapped, skipClash });
    return;
  }
  const tile = tileAt(game, p);
  const others = game.players
    .filter((q) => q.id !== p.id && q.online)
    .sort((a, b) => a.arrived - b.arrived);
  const duelists =
    tile.type === "duel" && !equipped(p, "l08")
      ? others.filter(
          (q) => tileAt(game, q).type === "duel" && !equipped(q, "l08"),
        )
      : [];
  const sameSpaceDuel = duelists.find((q) => q.pos === p.pos);
  if (sameSpaceDuel) {
    startDuel(game, p, sameSpaceDuel, rng);
    return;
  }
  const opponent =
    !skipClash && p.pos !== 1 && others.find((q) => q.pos === p.pos);
  if (opponent) {
    if (equipped(opponent, "c11")) {
      relocate(game, p, p.pos - 2);
      log(game, opponent.name + " 的逐客路障使 " + p.name + " 后退 2 格。");
      land(game, p, rng, { trapped, skipClash: true });
    } else {
      phase(
        game,
        "skirmish",
        {
          entrant: p.id,
          incumbent: opponent.id,
          portal,
          trapped,
          first: null,
        },
        p.id,
      );
      log(game, p.name + " 与 " + opponent.name + " 同格交锋。");
    }
  } else if (duelists.length) {
    startDuel(game, p, duelists[0], rng);
  } else afterEncounter(game, p, rng, portal, trapped);
}

function startDuel(game, challenger, champion, rng) {
  log(game, champion.name + " 为擂主，先攻击挑战者 " + challenger.name + "。");
  startFight(game, { attackerId: champion.id, defenderId: challenger.id }, rng);
}

function applyArrival(game, p, trapped) {
  const tile = tileAt(game, p);
  if (
    equipped(p, "l10") ||
    !["desert", "volcano"].includes(tile.terrain) ||
    game.turnTerrain.includes(tile.terrain)
  )
    return true;
  game.turnTerrain.push(tile.terrain);
  if (tile.terrain === "desert") {
    if (!trapped) {
      relocate(game, p, p.pos - 1);
      log(game, p.name + " 在沙漠后退至第 " + p.pos + " 格。");
    }
  } else {
    p.hp--;
    log(game, p.name + " 受到 1 点火山伤害。");
    if (p.hp <= 0) {
      if (equipped(p, "l04")) {
        removeGear(game, p, "l04");
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

const rollNames = {
  move: "移动",
  rain: "雨林",
  skirmish: "交锋",
  rest: "休息升级",
};

function needsRainCheck(game, p) {
  return (
    tileAt(game, p).terrain === "rainforest" &&
    !equipped(p, "l10") &&
    !game.turnTerrain.includes("rainforest")
  );
}

function checkOutcome(check) {
  const threshold = { rain: 3, rest: 5 }[check?.kind];
  if (threshold === undefined) return null;
  return check.total >= threshold !== Boolean(check.flipped);
}

function checkDescription(check) {
  const outcome = checkOutcome(check);
  if (outcome === null) return String(check.total);
  return (
    check.total +
    " 点 · " +
    (outcome ? "成功" : "失败") +
    (check.flipped ? "（已反转）" : "")
  );
}

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
  log(
    game,
    p.name + " 的" + rollNames[c.kind] + "判定为 " + checkDescription(c) + "。",
  );
  if (c.kind === "rain") {
    game.turnTerrain.push("rainforest");
    if (!checkOutcome(c)) {
      log(game, p.name + " 雨林判定失败，无法移动。");
      if (game.phase === "landing") resolveSpace(game, p, rng);
      else phase(game, "end");
    } else {
      if (c.item) useItem(game, p, c.item, rng);
    }
  } else if (c.kind === "rest") {
    if (checkOutcome(c)) grantUpgrade(game, p);
    else log(game, p.name + " 休息格升级判定失败。");
    phase(game, "end");
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
      land(game, entrant, rng, {
        portal: match.portal && !displaced,
        trapped: match.trapped,
        skipClash: true,
      });
    }
  } else {
    p.movePenalty = 0;
    if (c.total <= 0) {
      log(game, p.name + " 留在当前格。");
      phase(game, "end");
    } else {
      const end = Math.min(100, p.pos + c.total);
      moveForward(game, p, end, rng, true);
    }
  }
}

function rollCheck(game, p, kind, rng, item) {
  const mods = game.mods;
  const values = Array.from({ length: mods.extra ? 2 : 1 }, (_, i) =>
    i === 0 && mods.face ? mods.face : 1 + Math.floor(rng() * 6),
  );
  game.check = { kind, values, weight: mods.weight || 0, item };
  delete mods.face;
  showRoll(game, p, true);
}

function removeStatus(game, p, key) {
  if (key === "snare") p.movePenalty = 0;
  else if (key.startsWith("gear-")) removeOne(p.locked, key.slice(5));
  else p.statuses.splice(Number(key), 1);
  syncBadge(game, p);
}

function statusOptions(p) {
  const options = p.statuses.map((s, i) => {
    const translated = {
      slipped: "滑倒",
      disarmed: "缴械",
      stunned: "晕眩",
      buff: "增益",
      debuff: "减益",
    };
    return {
      key: String(i),
      text: s.label || translated[s.type] || s.type,
      type: s.type === "buff" ? "buff" : "debuff",
    };
  });
  if (p.movePenalty)
    options.push({
      key: "snare",
      text: "移动判定 " + p.movePenalty,
      type: p.movePenalty > 0 ? "buff" : "debuff",
    });
  for (const id of p.locked)
    options.push({
      key: "gear-" + id,
      text: "封锁的" + nameOf(id),
      type: "debuff",
    });
  return options;
}

function targetOptions(game, p, id) {
  const result = [];
  const selected =
    game.phase === "itemTarget" ? game.pending.target : undefined;
  for (const [index, q] of game.players.entries()) {
    if (id === "i17")
      result.push(action("target:" + index, q.name + " · 移动判定 −2", id));
    if (id === "i14" || id === "i15") {
      const available = statusOptions(q);
      if (
        id === "i14" &&
        q === p &&
        (game.phase === "banana" || game.pending.back?.value === "banana")
      )
        available.push({
          key: "banana",
          text: "香蕉皮 · 继续移动",
          type: "debuff",
        });
      if (
        id === "i15" &&
        available.length &&
        (selected === undefined || selected === index)
      ) {
        const confirming = selected !== undefined;
        for (const type of confirming
          ? [game.pending.effectType]
          : ["buff", "debuff"]) {
          if (!available.some((status) => status.type === type)) continue;
          const group = type === "buff" ? "增益" : "减益";
          result.push({
            ...action(
              "target:" + index + ":" + (confirming ? "confirm" : type),
              (confirming ? "确认驱散" : "选择") + q.name + "的全部" + group,
              id,
            ),
            targetId: q.id,
            effectType: type,
          });
        }
      }
      if (id === "i14")
        for (const st of available) {
          result.push({
            ...action(
              "target:" + index + ":" + st.key,
              q.name + " · " + st.text,
              id,
            ),
            targetId: q.id,
            effectType: st.type,
            effectKey: st.key,
          });
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

const targetedItems = ["i14", "i15", "i17", "i18", "i19"];

function itemAction(card, label) {
  const result = action("use:" + card, label, card);
  if (targetedItems.includes(card)) result.opensItemMenu = true;
  return result;
}

function boardItemMenu(game) {
  const { id, target, effectType } = game.pending;
  if (id === "i15" && target !== undefined) {
    const q = game.players[target];
    return {
      card: id,
      stage: "confirm",
      target: q.name,
      targetId: q.id,
      effectType,
      summary:
        "确认后驱散" +
        q.name +
        "的全部" +
        (effectType === "buff" ? "增益" : "减益"),
      detail: statusOptions(q)
        .filter((option) => option.type === effectType)
        .map((option) => option.text),
    };
  }
  return {
    card: id,
    stage: id === "i14" ? "status" : "target",
    summary: id === "i14" ? "选择要驱散的一项状态" : "选择目标或点数",
  };
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
  if (targetedItems.includes(id)) {
    menu(game, "itemTarget", { id });
    return;
  }
  if ((id === "i05" || id === "i11") && needsRainCheck(game, p)) {
    rollCheck(game, p, "rain", rng, id);
    return;
  }
  consume(game, p, id);
  switch (id) {
    case "i01":
      game.check.flipped = !game.check.flipped;
      break;
    case "i02":
      capHP(p, 2);
      break;
    case "i05":
      moveForward(game, p, p.pos + 1, rng, false);
      break;
    case "i06":
      redistribute(game, p);
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
    case "i11": {
      relocate(game, p, 1);
      const before = p.hp;
      capHP(p, 3);
      log(
        game,
        p.name +
          " 回到起点，当前生命 " +
          p.hp +
          "（+" +
          (p.hp - before) +
          "）。",
      );
      phase(game, "end");
      break;
    }
  }
}

function resolveBanana(game, p, rng, cleansed) {
  const arrival = game.pending;
  if (cleansed) {
    consume(game, p, "i14");
    log(game, p.name + " 净化了香蕉皮，继续移动。");
    if (arrival.destination > p.pos) {
      moveForward(game, p, arrival.destination, rng, arrival.stepwise);
      return;
    }
  }
  resolveArrival(game, p, rng, { ...arrival, trapped: !cleansed });
}

function applyTarget(game, p, parts, rng) {
  const id = game.pending.id;
  const [, target, opt] = parts;
  if (id === "i15" && opt !== "confirm") {
    game.pending.target = Number(target);
    game.pending.effectType = opt;
    return;
  }
  const effectType = game.pending.effectType;
  goBack(game);
  if (id === "i14" && opt === "banana") {
    resolveBanana(game, p, rng, true);
    return;
  }
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
    else if (id === "i14") removeStatus(game, q, opt);
    else if (id === "i15") {
      for (const status of statusOptions(q).reverse()) {
        if (status.type === effectType) removeStatus(game, q, status.key);
      }
    }
  }
}

function boardItems(game, p) {
  if (game.check)
    return unique(p.items).filter(
      (id) =>
        id === "i08" ||
        id === "i19" ||
        (id === "i01" && checkOutcome(game.check) !== null),
    );
  const preRoll = ["move", "skirmish", "rest"].includes(game.phase);
  const roaming = ["move", "end", "landing", "finish", "rest"].includes(
    game.phase,
  );
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
    if (id === "i11") return game.phase === "move" && p.pos > 1;
    if (["i14", "i15", "i17"].includes(id))
      return targetOptions(game, p, id).length > 0;
    return false;
  });
}

function actorId(game) {
  return pendingUpgrade(game)?.id ?? game.battle?.actorId ?? game.actor;
}

function actions(game, id) {
  const p = player(game, id);
  if (!p?.online || game.winner || actorId(game) !== id) return [];
  const required = pendingUpgrade(game);
  if (required) {
    const loss = required.kind === "downgrade";
    return Object.entries(stats)
      .filter(([stat]) => !loss || permanentUpgrades(p, stat) > 0)
      .map(([stat, name]) =>
        action(
          "upgrade:" + stat,
          name +
            (loss
              ? " −1"
              : required.kind === "badge"
                ? " +" + badgeBonus
                : " +1"),
        ),
      );
  }
  if (game.phase === "battle") return battleActions(game, id);
  if (game.phase === "banana")
    return [
      ...(carried(p, "i14") ? [itemAction("i14", "使用净化")] : []),
      action("stopBanana", "停在当前格"),
    ];
  let options;
  if (game.phase === "itemTarget")
    return [
      ...targetOptions(game, p, game.pending.id),
      action("cancel", "取消"),
    ];
  if (game.check)
    options = [
      action("check:accept", "确认判定 · " + checkDescription(game.check)),
    ];
  else
    switch (game.phase) {
      case "move": {
        const rain = needsRainCheck(game, p);
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
        options = [
          action("heal", "回复 5 点生命"),
          action("rest", "掷骰争取升级 · 5–6 成功"),
        ];
        break;
      case "finish":
        options = [
          action("challenge", "挑战原初之王", "final"),
          action("return", "返回起点 · 升级一次"),
        ];
        break;
      case "offer":
        return [
          ...game.pending.ids.map((card) => ({
            ...action("take:" + card, nameOf(card), card),
            ...(needsReplacement(p, card) ? { needsReplacement: true } : {}),
          })),
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
  return [
    ...options,
    ...boardItems(game, p).map((c) =>
      itemAction(
        c,
        c === "i01"
          ? "命数棱镜 · 反转为" + (checkOutcome(game.check) ? "失败" : "成功")
          : "使用" + nameOf(c),
      ),
    ),
  ];
}

export function act(game, playerId, actionId, rng = Math.random) {
  performAction(game, playerId, actionId, rng);
  advanceIdleTurn(game, rng);
}

function advanceIdleTurn(game, rng) {
  if (!game.players.some((p) => p.online)) return;
  while (game.phase === "end" && !pendingUpgrade(game)) {
    const p = player(game, game.actor);
    if (p.online && boardItems(game, p).length) return;
    nextTurn(game, rng);
  }
}

function performAction(game, playerId, actionId, rng) {
  if (!actions(game, playerId).some((a) => a.id === actionId))
    throw new Error("当前无法执行这个行动");
  const p = player(game, playerId);
  game.movements = [];
  const required = pendingUpgrade(game);
  if (required) {
    const stat = actionId.split(":")[1];
    const loss = required.kind === "downgrade";
    const amount = loss ? -1 : required.kind === "badge" ? badgeBonus : 1;
    upgrade(p, stat, amount);
    if (required.kind === "badge") p.badgeStat = stat;
    if (--required.count === 0) removeOne(game.upgrades, required);
    if (stat === "act") refreshAttackAllowance(game, p.id);
    log(
      game,
      p.name +
        " 的" +
        stats[stat] +
        (loss ? "降低 1 点。" : "提升 " + amount + " 点。"),
    );
    return;
  }
  if (game.phase === "battle") {
    const outcome = actBattle(game, playerId, actionId, rng);
    if (game.battle.redistribute) {
      const owner = player(game, game.battle.redistribute);
      delete game.battle.redistribute;
      redistribute(game, owner);
      refreshAttackAllowance(game, owner.id);
    }
    game.players.forEach((p) => syncBadge(game, p));
    settleBattle(game, outcome, rng);
    if (game.log.length > 120) game.log.splice(0, game.log.length - 120);
    return;
  }
  const parts = actionId.split(":"),
    [verb, choice] = parts;
  switch (verb) {
    case "roll":
      rollCheck(game, p, needsRainCheck(game, p) ? "rain" : "move", rng);
      break;
    case "check":
      finishRoll(game, p, rng);
      break;
    case "clash":
      rollCheck(game, p, "skirmish", rng);
      break;
    case "end":
      nextTurn(game, rng);
      break;
    case "stopBanana":
      resolveBanana(game, p, rng, false);
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
      rollCheck(game, p, "rest", rng);
      break;
    case "cancel":
      goBack(game);
      break;
    case "challenge":
      startFight(game, { attackerId: p.id, monsterId: "final" }, rng);
      break;
    case "return":
      relocate(game, p, 1);
      grantUpgrade(game, p);
      log(game, p.name + " 放弃最终挑战，返乡获得 1 次升级。");
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
      removeGear(game, p, choice);
      phase(game, "end");
      break;
    case "loot":
    case "loot-item": {
      const loser = player(game, game.pending.loser);
      const card =
        verb === "loot-item"
          ? loser.items.splice(Number(choice), 1)[0]
          : choice;
      if (verb === "loot") removeGear(game, loser, card);
      receive(game, p, card);
      break;
    }
    case "use":
      useItem(game, p, choice, rng);
      break;
    case "target":
      applyTarget(game, p, parts, rng);
      break;
  }
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
      tile.monsterState = battleMonsterState(b);
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
      const { portal, trapped } = game.pending;
      land(game, entrant, Math.random, { portal, trapped, skipClash: true });
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
        turnTerrain: game.turnTerrain,
      };
    }
    game.check = null;
    game.mods = {};
    phase(game, "end");
    if (player(game).online) return;
  }
  if (!player(game).online && game.phase !== "loot" && game.phase !== "replace")
    nextTurn(game, Math.random);
}

export function setOnline(game, id, online) {
  const p = player(game, id);
  if (!p || p.online === Boolean(online)) return;
  p.online = Boolean(online);
  log(game, p.name + (p.online ? " 已重新连接。" : " 暂时离线。"));
  interruptOffline(game);
  advanceIdleTurn(game, Math.random);
}

function describe(game, viewer) {
  if (game.winner)
    return player(game, game.winner).name + " 击败原初之王，赢得本局。";
  const who = player(game, actorId(game))?.name || "";
  const required = pendingUpgrade(game);
  if (required)
    return (
      who +
      (required.kind === "downgrade"
        ? " · 选择一项已升级的属性降低 1 点"
        : required.kind === "badge"
          ? " · 立即选择悟技徽章加成的属性"
          : " · 立即选择一项属性升级")
    );
  if (game.phase === "battle") return who + " · " + game.battle.detail;
  if (game.phase === "itemTarget")
    return (
      who +
      (viewer === game.actor
        ? " · 选择" + nameOf(game.pending.id) + "的目标或点数"
        : " · 正在选择行动目标")
    );
  if (game.check)
    return (
      who +
      " · " +
      rollNames[game.check.kind] +
      "判定 " +
      checkDescription(game.check)
    );
  const labels = {
    move: "准备移动",
    end: "本回合的格子已结算",
    skirmish: "投骰进行同格交锋",
    banana: "踩到香蕉皮 · 可以净化后继续移动",
    landing: "结算当前格，或使用跨步符前进",
    rest: "选择回复生命或掷骰争取升级",
    finish: "挑战原初之王，或返回起点并升级一次",
    offer: "选择一张奖励牌",
    replace: "选择要替换的牌，或放弃新牌",
    loot: "从落败者的装备与道具中选择一件",
    deathDiscard: "选择要弃置的传说装备",
  };
  return who + " · " + labels[game.phase];
}

function diceReview(game) {
  if (game.battle) return battleDiceReview(game);
  const check = game.check;
  if (!check) return null;
  const outcome = checkOutcome(check);
  return {
    key: "board:" + game.actor + ":" + check.kind,
    result: outcome === null ? null : outcome ? "成功" : "失败",
  };
}

function movementPreview(game, viewer) {
  if (game.check?.kind !== "move") return null;
  const p = player(game, game.actor);
  const end = Math.min(100, p.pos + Math.max(0, game.check.total));
  const to = plannedDestination(game, p, end);
  const preview = {
    id: p.id,
    from: p.pos,
    to,
    path: game.board.slice(p.pos, to).map((tile) => tile.pos),
  };
  if (p.pos === to) return { ...preview, final: to };
  let pos = to,
    retreated = game.turnTerrain.includes("desert"),
    teleported = false;
  while (true) {
    const tile = game.board[pos - 1];
    // A cleanse, skirmish or lethal hazard can change the final position after confirmation.
    if (tile.banana && (viewer !== p.id || carried(p, "i14"))) return preview;
    if (!equipped(p, "l10")) {
      if (tile.terrain === "desert" && !retreated && !tile.banana) {
        retreated = true;
        pos--;
        continue;
      }
      if (
        tile.terrain === "volcano" &&
        p.hp <= 1 &&
        !game.turnTerrain.includes("volcano")
      )
        return preview;
    }
    if (
      pos > 1 &&
      game.players.some(
        (other) => other.id !== p.id && other.online && other.pos === pos,
      )
    )
      return preview;
    if (tile.type === "portal" && !teleported) {
      if (!tile.banana && (viewer !== p.id || carried(p, "i05")))
        return preview;
      teleported = true;
      pos = tile.to;
      continue;
    }
    return { ...preview, final: pos };
  }
}

function boardStats(p) {
  const bonus = equipped(p, "l14") ? Math.floor(p.act / 5) : 0;
  const crest = equipped(p, "l07");
  return {
    atk: p.atk + bonus + Number(crest && p.hp >= 6),
    def: p.def + bonus + Number(crest && p.hp <= 5),
    act: p.act,
  };
}

export function view(game, id) {
  const b = game.battle;
  let battle = null;
  const choosing =
    !game.winner && !pendingUpgrade(game) && actorId(game) === id;
  const itemMenu =
    choosing && game.phase === "itemTarget"
      ? boardItemMenu(game)
      : choosing && b?.itemMenu
        ? b.itemMenu
        : null;
  if (b) {
    const fields = [
      "monster",
      "form",
      "hp",
      "maxHp",
      "atk",
      "def",
      "actors",
      "first",
      "second",
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
      "enemies",
      "targetIndex",
      "attackingEnemy",
      "enemyAttackQueue",
      "enemyAttackCount",
      "strikeResult",
      "effectEntries",
      "statusEntries",
    ];
    battle = Object.fromEntries(
      fields.filter((k) => b[k] !== undefined).map((k) => [k, b[k]]),
    );
    battle.combatants = Object.fromEntries(
      b.actors.map((id) => [id, battlePlayerStats(game, id)]),
    );
    if (itemMenu && b.itemMenu) battle.itemMenu = itemMenu;
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
      effectiveStats: battle?.combatants[p.id] || boardStats(p),
      gear: p.gear,
      locked: [
        ...new Set([
          ...p.locked,
          ...(b?.fighters[p.id]?.locked || []),
          ...(b?.fighters[p.id]?.curseLocks || []),
        ]),
      ],
      statuses: p.statuses,
      statusEntries: statusOptions(p).map(({ key, text, type }) => ({
        id: key,
        label: text,
        type,
      })),
      movePenalty: p.movePenalty,
      equipCapacity: 3,
      itemCapacity: Number.isFinite(itemLimit(p)) ? itemLimit(p) : null,
      itemCount: p.items.length,
      ...(p.id === id ? { items: p.items } : {}),
    })),
    board: game.board.map(({ monsterState, encounter, ...tile }) => tile),
    matchId: game.matchId,
    maxPlayers: MAX_PLAYERS,
    combatEvents: game.combatEvents || [],
    battleEffectEvents: game.battleEffectEvents || [],
    turn: game.turn,
    actor: actorId(game),
    phase: pendingUpgrade(game) && !game.winner ? "upgrade" : game.phase,
    round: game.round,
    battle,
    itemMenu,
    actions: actions(game, id),
    winner: game.winner,
    log: game.log.slice(-120),
    prompt: describe(game, id),
    dice: game.dice ? { ...game.dice, review: diceReview(game) } : null,
    movementSequence: game.sequence,
    movementPreview: movementPreview(game, id),
    movements: game.movements || [],
  });
}
