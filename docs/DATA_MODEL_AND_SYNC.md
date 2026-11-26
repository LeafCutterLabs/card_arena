# Multiplayer State & WebSocket Protocol

## 1. Normalized Coordinate System
- The shared table uses a virtual `1000 x 1000` coordinate grid.
- All card positions (`x`, `y`) are stored as numbers between `0` and `1000`.
- The frontend converts virtual coordinates to screen pixels based on the user's viewport container size, ensuring a card placed in the center `(500, 500)` appears in the center on every phone screen.

## 2. Shared TypeScript Interfaces (`src/types/game.ts`)
```typescript
export type CardZone = 'TABLE' | 'HAND';

export interface CardInstance {
  instanceId: string;       // Unique UUID per card in play
  templateId: string;       // References card template in deck.json
  zone: CardZone;
  ownerId: string | null;   // Player ID if zone === 'HAND', otherwise null
  faceUp: boolean;
  x: number;                // 0 - 1000 virtual coordinate (used when zone === 'TABLE')
  y: number;                // 0 - 1000 virtual coordinate (used when zone === 'TABLE')
  zIndex: number;           // Higher renders on top
  rotation: number;         // 0, 90, 180, 270 degrees
}

export interface Player {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
}

export interface RoomState {
  roomCode: string;
  deckId: string;
  players: Record<string, Player>;
  cards: Record<string, CardInstance>;
  maxZIndex: number;
  history: string[];        // Serialized snapshots (max 15) for instant Undo
}
```

## 3. Client-to-Server Events (PartyKit Messages)
All state mutations are dispatched as JSON actions to the PartyKit room server, which validates, pushes a snapshot to `history`, updates `RoomState`, and broadcasts the new state:

- `JOIN_ROOM`: `{ type: 'JOIN_ROOM', playerId: string, name: string }`
- `LOAD_DECK`: `{ type: 'LOAD_DECK', deckId: string, cards: CardInstance[] }`
- `MOVE_CARD`: `{ type: 'MOVE_CARD', instanceId: string, x: number, y: number }` (Automatically sets `zIndex = ++maxZIndex` so dragged cards come to the front)
- `FLIP_CARD`: `{ type: 'FLIP_CARD', instanceId: string }`
- `PLAY_FROM_HAND`: `{ type: 'PLAY_FROM_HAND', instanceId: string, faceUp: boolean, x: number, y: number }`
- `DRAW_TO_HAND`: `{ type: 'DRAW_TO_HAND', instanceId: string, playerId: string }`
- `PASS_CARD`: `{ type: 'PASS_CARD', instanceId: string, targetPlayerId: string }`
- `SHUFFLE_STACK`: `{ type: 'SHUFFLE_STACK', instanceIds: string[] }` (Randomizes `zIndex` order of overlapping cards at a given `(x, y)` cluster)
- `DEAL_CARDS`: `{ type: 'DEAL_CARDS', countPerPlayer: number }`
- `UNDO`: `{ type: 'UNDO' }` (Restores previous snapshot from `history`)
- `RESET_BOARD`: `{ type: 'RESET_BOARD' }` (Recalls all cards to center `(500, 500)`, sets `faceUp: false`, and shuffles)

## 4. UX Polish Requirements for Mobile Touch
- **Snap-to-Stack Threshold:** When dragging a card on the table within `25` virtual units (`2.5%` of board width) of another card's `(x, y)`, snap it cleanly onto that stack (with a slight `2px` visual offset per card so stack thickness is visible).
- **Stack Interaction Menu:** Tapping a stack of >= 2 cards opens a compact radial/bottom action sheet:
  - `Draw Top Card` (moves highest `zIndex` card in stack to player's hand)
  - `Flip Top Card`
  - `Shuffle Stack`
  - `Spread / Fan Stack` (offsets cards horizontally so individual cards can be grabbed)
- **Optimistic UI:** Dragging a card updates local coordinates immediately at 60fps and throttles WebSocket `MOVE_CARD` broadcasts to every `50ms` (plus final drop coordinates) for lag-free touch movement.
