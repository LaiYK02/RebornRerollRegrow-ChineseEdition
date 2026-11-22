import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createRoomServer, listAddresses } from "./server.mjs";

test("shareable addresses prefer physical LAN then active VPN, and exclude disconnected and host-only adapters", () => {
  const link = (address) => [{ address, family: "IPv4", internal: false }];
  const rows = listAddresses(4567, {
    "Radmin VPN": link("26.5.4.3"),
    "vEthernet (WSL)": link("172.29.16.1"),
    "VMware Network Adapter VMnet8": link("192.168.87.1"),
    "VPN disconnected": link("169.254.22.58"),
    Ethernet: link("192.168.1.62"),
    Duplicate: link("192.168.1.62"),
    Loopback: link("127.0.0.1"),
  });
  assert.deepEqual(
    rows.map((row) => row.address),
    ["192.168.1.62", "26.5.4.3"],
  );
  assert.equal(rows[1].url, "http://26.5.4.3:4567");
  assert.deepEqual(
    listAddresses(5000, {}).map((row) => row.address),
    ["127.0.0.1"],
  );
});

async function openServer(t) {
  let now = 1_000;
  const server = createRoomServer({ now: () => now, offlineMs: 10_000 });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const origin = "http://127.0.0.1:" + server.address().port;
  async function request(path, { body, token, headers = {} } = {}) {
    const response = await fetch(origin + "/api/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined
          ? {}
          : { "Content-Type": "application/json", Origin: origin }),
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, ...(await response.json()) };
  }
  return {
    origin,
    request,
    advance: (time) => {
      now += time;
    },
  };
}

test("four seats, private chat, authenticated controls and a fresh room after destruction", async (t) => {
  const { request } = await openServer(t);
  assert.equal(
    (await request("join", { body: { name: "Guest" } })).status,
    404,
  );
  const info = await request("info");
  assert.equal(info.canHost, true);
  const chosen = info.addresses.at(-1);
  const host = await request("create", {
    body: { name: "Host", color: "#22aacc", address: chosen.address },
  });
  assert.equal(host.status, 200);
  assert.equal(host.room.url, chosen.url);
  assert.equal(host.room.hostId, host.room.you);
  assert.equal(host.room.players[0].color, "#22aacc");
  assert.equal(
    (await request("create", { body: { name: "Duplicate" } })).status,
    409,
  );
  const guest = await request("join", { body: { name: "Mei" } });
  assert.notEqual(guest.token, host.token);
  assert.notEqual(guest.room.you, host.room.you);
  assert.deepEqual(guest.room.addresses, [chosen]);
  assert.equal(
    (
      await request("address", {
        token: guest.token,
        body: { address: chosen.address },
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("join", { body: { name: " mei " } })).status,
    409,
  );
  await request("join", { body: { name: "Sam" } });
  await request("join", { body: { name: "Nia" } });
  assert.equal(
    (await request("join", { body: { name: "Fifth" } })).status,
    409,
  );
  assert.equal(
    (await request("start", { token: guest.token, body: {} })).status,
    403,
  );
  assert.equal(
    (await request("destroy", { token: guest.token, body: {} })).status,
    403,
  );
  assert.equal((await request("state")).status, 401);
  assert.equal(
    (await request("chat", { body: { text: "stranger" } })).status,
    401,
  );
  await request("chat", {
    token: guest.token,
    body: { text: "Hello room", name: "Host" },
  });
  const state = await request("state", { token: host.token });
  assert.equal(state.room.chat.at(-1).name, "Mei");
  assert.equal(state.room.chat.at(-1).text, "Hello room");
  assert.ok(!JSON.stringify(state.room).includes(guest.token));
  await request("destroy", { token: host.token, body: {} });
  const fresh = await request("create", { body: { name: "Host" } });
  assert.notEqual(fresh.room.id, host.room.id);
  assert.equal(fresh.room.chat.length, 0);
  assert.equal((await request("state", { token: guest.token })).status, 401);
});

test("the host can start solo and a stale or illegal action cannot advance the game", async (t) => {
  const { request } = await openServer(t);
  const host = await request("create", { body: { name: "Host" } });
  const token = host.token;
  const started = await request("start", { token, body: {} });
  assert.equal(started.status, 200);
  assert.equal(started.room.phase, "game");
  assert.ok(started.room.game);
  assert.equal((await request("join", { body: { name: "Late" } })).status, 409);
  const revision = started.room.revision;
  assert.equal(
    (
      await request("action", {
        token,
        body: { actionId: "illegal", revision },
      })
    ).status,
    400,
  );
  assert.equal((await request("state", { token })).room.revision, revision);
  assert.equal(
    (
      await request("action", {
        token,
        body: { actionId: "illegal", revision: revision - 1 },
      })
    ).status,
    409,
  );
  const move = { actionId: started.room.game.actions[0].id, revision };
  const duplicate = await Promise.all([
    request("action", { token, body: move }),
    request("action", { token, body: move }),
  ]);
  assert.deepEqual(
    duplicate.map((response) => response.status).sort(),
    [200, 409],
  );
  assert.equal((await request("state", { token })).room.revision, revision + 1);
  const rolled = duplicate.find((response) => response.status === 200).room;
  assert.equal(rolled.game.players[0].pos, 1);
  assert.ok(rolled.game.dice.values.length);
  const confirmed = await request("action", {
    token,
    body: { actionId: "check:accept", revision: rolled.revision },
  });
  assert.ok(confirmed.room.game.players[0].pos > 1);
  const restarted = await request("restart", { token, body: {} });
  assert.ok(restarted.room.revision > revision);
});

test("a guest who reconnects can recover their in-game seat and the match continues", async (t) => {
  const { request, advance } = await openServer(t);
  const host = await request("create", { body: { name: "Host" } });
  const guest = await request("join", { body: { name: "Sam" } });
  await request("start", { token: host.token, body: {} });
  advance(6_000);
  await request("state", { token: host.token });
  advance(6_000);
  const snapshot = await request("state", { token: host.token });
  assert.equal(
    snapshot.room.players.find((p) => p.id === guest.room.you).online,
    false,
  );
  const recovered = await request("state", { token: guest.token });
  assert.equal(recovered.room.you, guest.room.you);
  assert.equal(
    recovered.room.players.find((p) => p.id === guest.room.you).online,
    true,
  );
  assert.equal(recovered.room.phase, "game");
  assert.equal(
    (await request("leave", { body: {}, token: guest.token })).status,
    200,
  );
  const left = await request("state", { token: host.token });
  assert.equal(
    left.room.players.find((p) => p.id === guest.room.you).online,
    false,
  );
});

test("a lobby departure frees a seat, and browser requests from foreign origins cannot change a room", async (t) => {
  const { request, origin } = await openServer(t);
  const hostile = await request("create", {
    body: { name: "Host" },
    headers: { Origin: "https://elsewhere.example" },
  });
  assert.equal(hostile.status, 403);
  assert.equal(
    (
      await request("create", {
        body: { name: "Host" },
        headers: { "Content-Type": "text/plain" },
      })
    ).status,
    415,
  );
  const host = await request("create", { body: { name: "Host" } });
  const guest = await request("join", { body: { name: "Sam" } });
  await request("leave", { body: {}, token: guest.token });
  assert.equal(
    (await request("state", { token: host.token })).room.players.length,
    1,
  );
  assert.equal((await request("state", { token: guest.token })).status, 401);
  assert.equal((await fetch(origin + "/server.mjs")).status, 404);
  assert.equal((await fetch(origin + "/connect?mode=join")).status, 200);
});
