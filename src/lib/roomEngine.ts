import type { CardInstance, ClientMessage, RoomState } from '../types/game';

const MAX_HISTORY = 15;
const STACK_DISTANCE = 25;

interface StateSnapshot {
  deckId: string;
  cards: Record<string, CardInstance>;
  maxZIndex: number;
}

export interface RoomEngineContext {
  state: RoomState;
  dragStartSnapshots: Map<string, string>;
}

export function clampCoord(value: number): number {
  if (!Number.isFinite(value)) return 500;
  return Math.max(40, Math.min(960, Math.round(value * 10) / 10));
}

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createInitialRoomState(roomCode: string): RoomState {
  return {
    roomCode: roomCode.toUpperCase(),
    deckId: '',
    players: {},
    cards: {},
    maxZIndex: 0,
    history: [],
  };
}

export function createRoomEngineContext(roomCode: string, saved?: RoomState | null): RoomEngineContext {
  if (saved) {
    const players = { ...saved.players };
    for (const id of Object.keys(players)) {
      players[id] = { ...players[id], connected: false };
    }
    return {
      state: {
        ...saved,
        roomCode: roomCode.toUpperCase(),
        players,
      },
      dragStartSnapshots: new Map(),
    };
  }
  return {
    state: createInitialRoomState(roomCode),
    dragStartSnapshots: new Map(),
  };
}

function cloneState(state: RoomState): RoomState {
  return {
    ...state,
    players: { ...state.players },
    cards: { ...state.cards },
    history: [...state.history],
  };
}

function serializeSnapshot(state: RoomState): string {
  const snapshot: StateSnapshot = {
    deckId: state.deckId,
    cards: state.cards,
    maxZIndex: state.maxZIndex,
  };
  return JSON.stringify(snapshot);
}

function pushRawSnapshot(state: RoomState, serialized: string): void {
  state.history.push(serialized);
  if (state.history.length > MAX_HISTORY) {
    state.history.splice(0, state.history.length - MAX_HISTORY);
  }
}

function pushSnapshot(state: RoomState): void {
  pushRawSnapshot(state, serializeSnapshot(state));
}

function findLargestTableStack(tableCards: CardInstance[]): CardInstance[] {
  const visited = new Set<string>();
  let best: CardInstance[] = [];

  for (const card of tableCards) {
    if (visited.has(card.instanceId)) continue;
    const cluster: CardInstance[] = [];
    const queue = [card];
    visited.add(card.instanceId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      cluster.push(current);
      for (const other of tableCards) {
        if (visited.has(other.instanceId)) continue;
        const dist = Math.hypot(current.x - other.x, current.y - other.y);
        if (dist <= STACK_DISTANCE) {
          visited.add(other.instanceId);
          queue.push(other);
        }
      }
    }

    if (cluster.length > best.length) {
      best = cluster;
    }
  }

  return best.sort((a, b) => a.zIndex - b.zIndex);
}

function ensureActiveHost(state: RoomState): void {
  const players = Object.values(state.players);
  const connected = players.filter((p) => p.connected);
  if (connected.length === 0) return;

  const hasConnectedHost = connected.some((p) => p.isHost);
  if (!hasConnectedHost) {
    for (const p of players) {
      state.players[p.id] = { ...p, isHost: false };
    }
    state.players[connected[0].id] = { ...connected[0], isHost: true };
  }
}

function dealCardsInternal(state: RoomState, countPerPlayer: number): void {
  const allPlayers = Object.values(state.players);
  const recipients = allPlayers.filter((p) => p.connected);
  const targetPlayers = recipients.length > 0 ? recipients : allPlayers;
  if (targetPlayers.length === 0) return;

  const tableCards = Object.values(state.cards).filter((c) => c.zone === 'TABLE');
  if (tableCards.length === 0) return;

  const largestStack = findLargestTableStack(tableCards);
  const largestIds = new Set(largestStack.map((c) => c.instanceId));
  const orderedPool = [
    ...[...largestStack].sort((a, b) => b.zIndex - a.zIndex),
    ...tableCards.filter((c) => !largestIds.has(c.instanceId)).sort((a, b) => b.zIndex - a.zIndex),
  ];

  let cursor = 0;
  for (let round = 0; round < countPerPlayer; round++) {
    for (const player of targetPlayers) {
      if (cursor >= orderedPool.length) return;
      const card = orderedPool[cursor++];
      state.cards[card.instanceId] = {
        ...card,
        zone: 'HAND',
        ownerId: player.id,
        faceUp: true,
        rotation: 0,
      };
    }
  }
}

export function markPlayerDisconnected(ctx: RoomEngineContext, playerId: string): boolean {
  const existing = ctx.state.players[playerId];
  if (!existing || !existing.connected) return false;
  const next = cloneState(ctx.state);
  next.players[playerId] = { ...existing, connected: false };
  ensureActiveHost(next);
  ctx.state = next;
  return true;
}

export interface ActionResult {
  changed: boolean;
  persist: boolean;
  error?: string;
}

export function applyRoomAction(ctx: RoomEngineContext, msg: ClientMessage): ActionResult {
  const next = cloneState(ctx.state);

  switch (msg.type) {
    case 'JOIN_ROOM': {
      const cleanName = (msg.name || 'Player').trim().slice(0, 24) || 'Player';
      const existing = next.players[msg.playerId];
      const hasConnectedHost = Object.values(next.players).some(
        (p) => p.isHost && p.connected && p.id !== msg.playerId,
      );

      next.players[msg.playerId] = {
        id: msg.playerId,
        name: cleanName,
        connected: true,
        isHost: existing ? existing.isHost || !hasConnectedHost : !hasConnectedHost,
      };
      ensureActiveHost(next);
      ctx.state = next;
      return { changed: true, persist: true };
    }

    case 'LOAD_DECK': {
      if (Object.keys(next.cards).length > 0) {
        pushSnapshot(next);
      }
      const cardsMap: Record<string, CardInstance> = {};
      let maxZ = 0;

      for (const card of msg.cards) {
        const z = card.zIndex || ++maxZ;
        if (z > maxZ) maxZ = z;
        cardsMap[card.instanceId] = {
          ...card,
          x: clampCoord(card.x),
          y: clampCoord(card.y),
          zIndex: z,
          rotation: (((card.rotation || 0) % 360) + 360) % 360,
        };
      }

      next.deckId = msg.deckId;
      next.cards = cardsMap;
      next.maxZIndex = maxZ;
      ctx.dragStartSnapshots.clear();

      if (msg.dealCount && msg.dealCount > 0) {
        dealCardsInternal(next, msg.dealCount);
      }

      ctx.state = next;
      return { changed: true, persist: true };
    }

    case 'MOVE_CARD': {
      const card = next.cards[msg.instanceId];
      if (!card) return { changed: false, persist: false };

      if (msg.transient) {
        if (!ctx.dragStartSnapshots.has(msg.instanceId)) {
          ctx.dragStartSnapshots.set(msg.instanceId, serializeSnapshot(next));
        }
      } else {
        const preDragSnapshot = ctx.dragStartSnapshots.get(msg.instanceId);
        if (preDragSnapshot) {
          pushRawSnapshot(next, preDragSnapshot);
          ctx.dragStartSnapshots.delete(msg.instanceId);
        } else {
          pushSnapshot(next);
        }
      }

      next.cards[msg.instanceId] = {
        ...card,
        zone: 'TABLE',
        ownerId: null,
        x: clampCoord(msg.x),
        y: clampCoord(msg.y),
        zIndex: ++next.maxZIndex,
      };
      ctx.state = next;
      return { changed: true, persist: !msg.transient };
    }

    case 'FLIP_CARD': {
      const card = next.cards[msg.instanceId];
      if (!card) return { changed: false, persist: false };
      pushSnapshot(next);
      next.cards[msg.instanceId] = { ...card, faceUp: !card.faceUp };
      ctx.state = next;
      return { changed: true, persist: true };
    }

    case 'ROTATE_CARD': {
      const card = next.cards[msg.instanceId];
      if (!card) return { changed: false, persist: false };
      pushSnapshot(next);
      const delta = typeof msg.delta === 'number' ? msg.delta : 90;
      next.cards[msg.instanceId] = {
        ...card,
        rotation: ((((card.rotation || 0) + delta) % 360) + 360) % 360,
      };
      ctx.state = next;
      return { changed: true, persist: true };
    }

    case 'PLAY_FROM_HAND': {
      const card = next.cards[msg.instanceId];
      if (!card) return { changed: false, persist: false };
      pushSnapshot(next);
      next.cards[msg.instanceId] = {
        ...card,
        zone: 'TABLE',
        ownerId: null,
        faceUp: Boolean(msg.faceUp),
        x: clampCoord(msg.x),
        y: clampCoord(msg.y),
        zIndex: ++next.maxZIndex,
        rotation: 0,
      };
      ctx.state = next;
      return { changed: true, persist: true };
    }

    case 'DRAW_TO_HAND': {
      const card = next.cards[msg.instanceId];
      if (!card || !next.players[msg.playerId]) return { changed: false, persist: false };
      pushSnapshot(next);
      next.cards[msg.instanceId] = {
        ...card,
        zone: 'HAND',
        ownerId: msg.playerId,
        faceUp: true,
        rotation: 0,
      };
      ctx.state = next;
      return { changed: true, persist: true };
    }

    case 'PASS_CARD': {
      const card = next.cards[msg.instanceId];
      if (!card || !next.players[msg.targetPlayerId]) return { changed: false, persist: false };
      pushSnapshot(next);
      next.cards[msg.instanceId] = {
        ...card,
        zone: 'HAND',
        ownerId: msg.targetPlayerId,
        faceUp: true,
        rotation: 0,
      };
      ctx.dragStartSnapshots.delete(msg.instanceId);
      ctx.state = next;
      return { changed: true, persist: true };
    }

    case 'SHUFFLE_STACK': {
      const targets = msg.instanceIds
        .map((id) => next.cards[id])
        .filter((c): c is CardInstance => Boolean(c && c.zone === 'TABLE'));
      if (targets.length < 2) return { changed: false, persist: false };

      pushSnapshot(next);
      const anchor = targets.reduce(
        (top, curr) => (curr.zIndex > top.zIndex ? curr : top),
        targets[0],
      );
      const shuffled = shuffleArray(targets);
      for (const card of shuffled) {
        next.cards[card.instanceId] = {
          ...card,
          x: anchor.x,
          y: anchor.y,
          zIndex: ++next.maxZIndex,
        };
      }
      ctx.state = next;
      return { changed: true, persist: true };
    }

    case 'SPREAD_STACK': {
      const targets = msg.instanceIds
        .map((id) => next.cards[id])
        .filter((c): c is CardInstance => Boolean(c && c.zone === 'TABLE'))
        .sort((a, b) => a.zIndex - b.zIndex);
      if (targets.length < 2) return { changed: false, persist: false };

      pushSnapshot(next);
      const anchor = targets[targets.length - 1];
      const maxPerRow = 7;
      const stepX = 92;
      const stepY = 125;

      targets.forEach((card, idx) => {
        const row = Math.floor(idx / maxPerRow);
        const col = idx % maxPerRow;
        const rowCount = Math.min(maxPerRow, targets.length - row * maxPerRow);
        const offsetX = (col - (rowCount - 1) / 2) * stepX;
        const offsetY = row * stepY;

        next.cards[card.instanceId] = {
          ...card,
          x: clampCoord(anchor.x + offsetX),
          y: clampCoord(anchor.y + offsetY),
          zIndex: ++next.maxZIndex,
        };
      });

      ctx.state = next;
      return { changed: true, persist: true };
    }

    case 'TAKE_STACK': {
      if (!next.players[msg.playerId]) return { changed: false, persist: false };
      const targets = msg.instanceIds
        .map((id) => next.cards[id])
        .filter((c): c is CardInstance => Boolean(c && c.zone === 'TABLE'));
      if (targets.length === 0) return { changed: false, persist: false };

      pushSnapshot(next);
      for (const card of targets) {
        next.cards[card.instanceId] = {
          ...card,
          zone: 'HAND',
          ownerId: msg.playerId,
          faceUp: true,
          rotation: 0,
        };
      }
      ctx.state = next;
      return { changed: true, persist: true };
    }

    case 'DEAL_CARDS': {
      const count = Math.max(1, Math.min(20, Math.floor(msg.countPerPlayer || 0)));
      if (count <= 0) return { changed: false, persist: false };
      pushSnapshot(next);
      dealCardsInternal(next, count);
      ctx.state = next;
      return { changed: true, persist: true };
    }

    case 'RECALL_ALL': {
      const allCards = Object.values(next.cards);
      if (allCards.length === 0) return { changed: false, persist: false };
      pushSnapshot(next);
      const sorted = [...allCards].sort((a, b) => a.zIndex - b.zIndex);
      sorted.forEach((card, idx) => {
        next.cards[card.instanceId] = {
          ...card,
          zone: 'TABLE',
          ownerId: null,
          faceUp: false,
          x: 500,
          y: 500,
          rotation: 0,
          zIndex: idx + 1,
        };
      });
      next.maxZIndex = sorted.length;
      ctx.dragStartSnapshots.clear();
      ctx.state = next;
      return { changed: true, persist: true };
    }

    case 'SHUFFLE_DECK': {
      const tableCards = Object.values(next.cards).filter((c) => c.zone === 'TABLE');
      if (tableCards.length < 2) return { changed: false, persist: false };
      pushSnapshot(next);

      const largestStack = findLargestTableStack(tableCards);
      const toShuffle = largestStack.length >= 2 ? largestStack : tableCards;
      const anchor =
        largestStack.length >= 2 ? largestStack[largestStack.length - 1] : { x: 500, y: 500 };

      const shuffled = shuffleArray(toShuffle);
      for (const card of shuffled) {
        next.cards[card.instanceId] = {
          ...card,
          x: anchor.x,
          y: anchor.y,
          zIndex: ++next.maxZIndex,
        };
      }
      ctx.state = next;
      return { changed: true, persist: true };
    }

    case 'RESET_BOARD': {
      const allCards = Object.values(next.cards);
      if (allCards.length === 0) return { changed: false, persist: false };
      pushSnapshot(next);
      const shuffled = shuffleArray(allCards);
      shuffled.forEach((card, idx) => {
        next.cards[card.instanceId] = {
          ...card,
          zone: 'TABLE',
          ownerId: null,
          faceUp: false,
          x: 500,
          y: 500,
          rotation: 0,
          zIndex: idx + 1,
        };
      });
      next.maxZIndex = shuffled.length;
      ctx.dragStartSnapshots.clear();
      ctx.state = next;
      return { changed: true, persist: true };
    }

    case 'UNDO': {
      const raw = next.history.pop();
      if (!raw) return { changed: false, persist: false };
      try {
        const snapshot = JSON.parse(raw) as StateSnapshot;
        next.deckId = snapshot.deckId;
        next.cards = snapshot.cards;
        next.maxZIndex = snapshot.maxZIndex;
        ctx.dragStartSnapshots.clear();
        ctx.state = next;
        return { changed: true, persist: true };
      } catch {
        return { changed: false, persist: false, error: 'Failed to restore undo snapshot.' };
      }
    }
  }
}
