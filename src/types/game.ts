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

export interface DeckManifestEntry {
  id: string;
  name: string;
  description: string;
}

export interface DeckManifest {
  decks: DeckManifestEntry[];
}

export interface CardTemplate {
  templateId: string;
  count: number;
  background: string;
  foregroundArt?: string;
  cornerValue?: string;
  title?: string;
  rulesText?: string;
  textColor?: string;
}

export interface DeckDefinition {
  id: string;
  name: string;
  cardBack: string;
  defaultTextColor: string;
  cards: CardTemplate[];
}

export type ClientMessage =
  | { type: 'JOIN_ROOM'; playerId: string; name: string }
  | { type: 'LOAD_DECK'; deckId: string; cards: CardInstance[]; dealCount?: number }
  | { type: 'MOVE_CARD'; instanceId: string; x: number; y: number; transient?: boolean }
  | { type: 'FLIP_CARD'; instanceId: string }
  | { type: 'ROTATE_CARD'; instanceId: string; delta?: number }
  | { type: 'PLAY_FROM_HAND'; instanceId: string; faceUp: boolean; x: number; y: number }
  | { type: 'DRAW_TO_HAND'; instanceId: string; playerId: string }
  | { type: 'PASS_CARD'; instanceId: string; targetPlayerId: string }
  | { type: 'SHUFFLE_STACK'; instanceIds: string[] }
  | { type: 'SPREAD_STACK'; instanceIds: string[] }
  | { type: 'TAKE_STACK'; instanceIds: string[]; playerId: string }
  | { type: 'DEAL_CARDS'; countPerPlayer: number }
  | { type: 'UNDO' }
  | { type: 'RESET_BOARD' }
  | { type: 'RECALL_ALL' }
  | { type: 'SHUFFLE_DECK' };

export type ServerMessage =
  | { type: 'SYNC_STATE'; state: RoomState }
  | { type: 'ERROR'; message: string };
