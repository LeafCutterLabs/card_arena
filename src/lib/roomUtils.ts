const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excludes ambiguous I and O

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return code;
}

export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);
}

const PLAYER_ID_KEY = 'card_arena_player_id';
const PLAYER_NAME_KEY = 'card_arena_player_name';

export function getOrCreatePlayerId(): string {
  try {
    const existing = localStorage.getItem(PLAYER_ID_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(PLAYER_ID_KEY, id);
    return id;
  } catch {
    return `p_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function getSavedPlayerName(): string {
  try {
    return localStorage.getItem(PLAYER_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(PLAYER_NAME_KEY, name);
  } catch {
    // ignore storage errors
  }
}

export function getHandOrderKey(roomCode: string, playerId: string): string {
  return `card_arena_hand_order_${roomCode}_${playerId}`;
}

export function loadLocalHandOrder(roomCode: string, playerId: string): string[] {
  try {
    const raw = localStorage.getItem(getHandOrderKey(roomCode, playerId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveLocalHandOrder(roomCode: string, playerId: string, order: string[]): void {
  try {
    localStorage.setItem(getHandOrderKey(roomCode, playerId), JSON.stringify(order));
  } catch {
    // ignore storage errors
  }
}

export function shouldUsePartyKit(): boolean {
  const envHost = import.meta.env.VITE_PARTYKIT_HOST as string | undefined;
  if (envHost && envHost.trim().length > 0) return true;
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('transport') === 'partykit') return true;
  }
  return false;
}

export function getPartyHost(): string {
  const envHost = import.meta.env.VITE_PARTYKIT_HOST as string | undefined;
  if (envHost && envHost.trim().length > 0) {
    return envHost.trim();
  }
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname || 'localhost';
    return `${hostname}:1999`;
  }
  return 'localhost:1999';
}
