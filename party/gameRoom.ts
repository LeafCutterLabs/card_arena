import type * as Party from 'partykit/server';
import type { CardInstance, ClientMessage, RoomState, ServerMessage } from '../src/types/game';

const MAX_HISTORY = 15;
const STORAGE_KEY = 'roomState';
const STACK_DISTANCE = 25;

interface StateSnapshot {
  deckId: string;
  cards: Record<string, CardInstance>;
  maxZIndex: number;
}

function clampCoord(value: number): number {
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

export default class GameRoomServer implements Party.Server {
  private state: RoomState;
  private connectionToPlayer = new Map<string, string>();
  private dragStartSnapshots = new Map<string, string>();

  constructor(readonly room: Party.Room) {
    this.state = {
      roomCode: room.id.toUpperCase(),
      deckId: '',
      players: {},
      cards: {},
      maxZIndex: 0,
      history: [],
    };
  }

  async onStart(): Promise<void> {
    const saved = await this.room.storage.get<RoomState>(STORAGE_KEY);
    if (saved) {
      // Reset connected flags on cold start; active sockets will reconnect and re-join
      const players = { ...saved.players };
      for (const id of Object.keys(players)) {
        players[id] = { ...players[id], connected: false };
      }
      this.state = {
        ...saved,
        roomCode: this.room.id.toUpperCase(),
        players,
      };
    }
  }

  onConnect(conn: Party.Connection): void {
    this.sendTo(conn, { type: 'SYNC_STATE', state: this.state });
  }

  onRequest(): Response {
    return new Response(
      JSON.stringify({
        roomCode: this.state.roomCode,
        deckId: this.state.deckId,
        playerCount: Object.keys(this.state.players).length,
        cardCount: Object.keys(this.state.cards).length,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }

  async onClose(conn: Party.Connection): Promise<void> {
    const playerId = this.connectionToPlayer.get(conn.id);
    this.connectionToPlayer.delete(conn.id);

    if (!playerId || !this.state.players[playerId]) return;

    // Check if the same player still has another open connection
    const stillConnected = Array.from(this.connectionToPlayer.values()).includes(playerId);
    if (!stillConnected) {
      this.state.players[playerId] = {
        ...this.state.players[playerId],
        connected: false,
      };
      this.ensureActiveHost();
      await this.persistAndBroadcast();
    }
  }

  async onMessage(rawMessage: string, sender: Party.Connection): Promise<void> {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(rawMessage) as ClientMessage;
    } catch {
      this.sendTo(sender, { type: 'ERROR', message: 'Invalid JSON payload.' });
      return;
    }

    switch (msg.type) {
      case 'JOIN_ROOM': {
        const cleanName = (msg.name || 'Player').trim().slice(0, 24) || 'Player';
        const existing = this.state.players[msg.playerId];
        const hasConnectedHost = Object.values(this.state.players).some(
          (p) => p.isHost && p.connected && p.id !== msg.playerId,
        );

        this.connectionToPlayer.set(sender.id, msg.playerId);
        this.state.players[msg.playerId] = {
          id: msg.playerId,
          name: cleanName,
          connected: true,
          isHost: existing ? existing.isHost || !hasConnectedHost : !hasConnectedHost,
        };
        this.ensureActiveHost();
        await this.persistAndBroadcast();
        break;
      }

      case 'LOAD_DECK': {
        if (Object.keys(this.state.cards).length > 0) {
          this.pushSnapshot();
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
            rotation: ((card.rotation || 0) % 360 + 360) % 360,
          };
        }

        this.state.deckId = msg.deckId;
        this.state.cards = cardsMap;
        this.state.maxZIndex = maxZ;
        this.dragStartSnapshots.clear();

        if (msg.dealCount && msg.dealCount > 0) {
          this.dealCardsInternal(msg.dealCount);
        }

        await this.persistAndBroadcast();
        break;
      }

      case 'MOVE_CARD': {
        const card = this.state.cards[msg.instanceId];
        if (!card) return;

        if (msg.transient) {
          if (!this.dragStartSnapshots.has(msg.instanceId)) {
            this.dragStartSnapshots.set(msg.instanceId, this.serializeSnapshot());
          }
        } else {
          const preDragSnapshot = this.dragStartSnapshots.get(msg.instanceId);
          if (preDragSnapshot) {
            this.pushRawSnapshot(preDragSnapshot);
            this.dragStartSnapshots.delete(msg.instanceId);
          } else {
            this.pushSnapshot();
          }
        }

        card.zone = 'TABLE';
        card.ownerId = null;
        card.x = clampCoord(msg.x);
        card.y = clampCoord(msg.y);
        card.zIndex = ++this.state.maxZIndex;

        if (msg.transient) {
          this.broadcastState();
        } else {
          await this.persistAndBroadcast();
        }
        break;
      }

      case 'FLIP_CARD': {
        const card = this.state.cards[msg.instanceId];
        if (!card) return;
        this.pushSnapshot();
        card.faceUp = !card.faceUp;
        await this.persistAndBroadcast();
        break;
      }

      case 'ROTATE_CARD': {
        const card = this.state.cards[msg.instanceId];
        if (!card) return;
        this.pushSnapshot();
        const delta = typeof msg.delta === 'number' ? msg.delta : 90;
        card.rotation = (((card.rotation || 0) + delta) % 360 + 360) % 360;
        await this.persistAndBroadcast();
        break;
      }

      case 'PLAY_FROM_HAND': {
        const card = this.state.cards[msg.instanceId];
        if (!card) return;
        this.pushSnapshot();
        card.zone = 'TABLE';
        card.ownerId = null;
        card.faceUp = Boolean(msg.faceUp);
        card.x = clampCoord(msg.x);
        card.y = clampCoord(msg.y);
        card.zIndex = ++this.state.maxZIndex;
        card.rotation = 0;
        await this.persistAndBroadcast();
        break;
      }

      case 'DRAW_TO_HAND': {
        const card = this.state.cards[msg.instanceId];
        if (!card || !this.state.players[msg.playerId]) return;
        this.pushSnapshot();
        card.zone = 'HAND';
        card.ownerId = msg.playerId;
        card.faceUp = true;
        card.rotation = 0;
        await this.persistAndBroadcast();
        break;
      }

      case 'PASS_CARD': {
        const card = this.state.cards[msg.instanceId];
        if (!card || !this.state.players[msg.targetPlayerId]) return;
        this.pushSnapshot();
        card.zone = 'HAND';
        card.ownerId = msg.targetPlayerId;
        card.faceUp = true;
        card.rotation = 0;
        this.dragStartSnapshots.delete(msg.instanceId);
        await this.persistAndBroadcast();
        break;
      }

      case 'SHUFFLE_STACK': {
        const targets = msg.instanceIds
          .map((id) => this.state.cards[id])
          .filter((c): c is CardInstance => Boolean(c && c.zone === 'TABLE'));
        if (targets.length < 2) return;

        this.pushSnapshot();
        const anchor = targets.reduce((top, curr) => (curr.zIndex > top.zIndex ? curr : top), targets[0]);
        const shuffled = shuffleArray(targets);
        for (const card of shuffled) {
          card.x = anchor.x;
          card.y = anchor.y;
          card.zIndex = ++this.state.maxZIndex;
        }
        await this.persistAndBroadcast();
        break;
      }

      case 'SPREAD_STACK': {
        const targets = msg.instanceIds
          .map((id) => this.state.cards[id])
          .filter((c): c is CardInstance => Boolean(c && c.zone === 'TABLE'))
          .sort((a, b) => a.zIndex - b.zIndex);
        if (targets.length < 2) return;

        this.pushSnapshot();
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

          card.x = clampCoord(anchor.x + offsetX);
          card.y = clampCoord(anchor.y + offsetY);
          card.zIndex = ++this.state.maxZIndex;
        });

        await this.persistAndBroadcast();
        break;
      }

      case 'TAKE_STACK': {
        if (!this.state.players[msg.playerId]) return;
        const targets = msg.instanceIds
          .map((id) => this.state.cards[id])
          .filter((c): c is CardInstance => Boolean(c && c.zone === 'TABLE'));
        if (targets.length === 0) return;

        this.pushSnapshot();
        for (const card of targets) {
          card.zone = 'HAND';
          card.ownerId = msg.playerId;
          card.faceUp = true;
          card.rotation = 0;
        }
        await this.persistAndBroadcast();
        break;
      }

      case 'DEAL_CARDS': {
        const count = Math.max(1, Math.min(20, Math.floor(msg.countPerPlayer || 0)));
        if (count <= 0) return;
        this.pushSnapshot();
        this.dealCardsInternal(count);
        await this.persistAndBroadcast();
        break;
      }

      case 'RECALL_ALL': {
        const allCards = Object.values(this.state.cards);
        if (allCards.length === 0) return;
        this.pushSnapshot();
        const sorted = [...allCards].sort((a, b) => a.zIndex - b.zIndex);
        sorted.forEach((card, idx) => {
          card.zone = 'TABLE';
          card.ownerId = null;
          card.faceUp = false;
          card.x = 500;
          card.y = 500;
          card.rotation = 0;
          card.zIndex = idx + 1;
        });
        this.state.maxZIndex = sorted.length;
        this.dragStartSnapshots.clear();
        await this.persistAndBroadcast();
        break;
      }

      case 'SHUFFLE_DECK': {
        const tableCards = Object.values(this.state.cards).filter((c) => c.zone === 'TABLE');
        if (tableCards.length < 2) return;
        this.pushSnapshot();

        // Prefer shuffling the largest stack on the table; otherwise shuffle all table cards to center
        const largestStack = this.findLargestTableStack(tableCards);
        const toShuffle = largestStack.length >= 2 ? largestStack : tableCards;
        const anchor = largestStack.length >= 2 ? largestStack[largestStack.length - 1] : { x: 500, y: 500 };

        const shuffled = shuffleArray(toShuffle);
        for (const card of shuffled) {
          card.x = anchor.x;
          card.y = anchor.y;
          card.zIndex = ++this.state.maxZIndex;
        }
        await this.persistAndBroadcast();
        break;
      }

      case 'RESET_BOARD': {
        const allCards = Object.values(this.state.cards);
        if (allCards.length === 0) return;
        this.pushSnapshot();
        const shuffled = shuffleArray(allCards);
        shuffled.forEach((card, idx) => {
          card.zone = 'TABLE';
          card.ownerId = null;
          card.faceUp = false;
          card.x = 500;
          card.y = 500;
          card.rotation = 0;
          card.zIndex = idx + 1;
        });
        this.state.maxZIndex = shuffled.length;
        this.dragStartSnapshots.clear();
        await this.persistAndBroadcast();
        break;
      }

      case 'UNDO': {
        const raw = this.state.history.pop();
        if (!raw) return;
        try {
          const snapshot = JSON.parse(raw) as StateSnapshot;
          this.state.deckId = snapshot.deckId;
          this.state.cards = snapshot.cards;
          this.state.maxZIndex = snapshot.maxZIndex;
          this.dragStartSnapshots.clear();
          await this.persistAndBroadcast();
        } catch {
          this.sendTo(sender, { type: 'ERROR', message: 'Failed to restore undo snapshot.' });
        }
        break;
      }
    }
  }

  private dealCardsInternal(countPerPlayer: number): void {
    const allPlayers = Object.values(this.state.players);
    const recipients = allPlayers.filter((p) => p.connected);
    const targetPlayers = recipients.length > 0 ? recipients : allPlayers;
    if (targetPlayers.length === 0) return;

    const tableCards = Object.values(this.state.cards).filter((c) => c.zone === 'TABLE');
    if (tableCards.length === 0) return;

    // Deal from the largest stack on the table first (top card down), then any other table cards
    const largestStack = this.findLargestTableStack(tableCards);
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
        card.zone = 'HAND';
        card.ownerId = player.id;
        card.faceUp = true;
        card.rotation = 0;
      }
    }
  }

  private findLargestTableStack(tableCards: CardInstance[]): CardInstance[] {
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

  private ensureActiveHost(): void {
    const players = Object.values(this.state.players);
    const connected = players.filter((p) => p.connected);
    if (connected.length === 0) return;

    const hasConnectedHost = connected.some((p) => p.isHost);
    if (!hasConnectedHost) {
      for (const p of players) {
        p.isHost = false;
      }
      connected[0].isHost = true;
    }
  }

  private serializeSnapshot(): string {
    const snapshot: StateSnapshot = {
      deckId: this.state.deckId,
      cards: this.state.cards,
      maxZIndex: this.state.maxZIndex,
    };
    return JSON.stringify(snapshot);
  }

  private pushSnapshot(): void {
    this.pushRawSnapshot(this.serializeSnapshot());
  }

  private pushRawSnapshot(serialized: string): void {
    this.state.history.push(serialized);
    if (this.state.history.length > MAX_HISTORY) {
      this.state.history.splice(0, this.state.history.length - MAX_HISTORY);
    }
  }

  private sendTo(conn: Party.Connection, message: ServerMessage): void {
    conn.send(JSON.stringify(message));
  }

  private broadcastState(): void {
    const payload = JSON.stringify({ type: 'SYNC_STATE', state: this.state } satisfies ServerMessage);
    this.room.broadcast(payload);
  }

  private async persistAndBroadcast(): Promise<void> {
    this.broadcastState();
    await this.room.storage.put(STORAGE_KEY, this.state);
  }
}

GameRoomServer satisfies Party.Worker;
