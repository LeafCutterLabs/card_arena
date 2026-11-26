import { CardInstance, DeckDefinition, DeckManifest } from '../types/game';

const deckCache = new Map<string, DeckDefinition>();

function getBaseUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

export async function fetchDeckManifest(): Promise<DeckManifest> {
  const res = await fetch(`${getBaseUrl()}decks/manifest.json`);
  if (!res.ok) {
    throw new Error(`Failed to load deck manifest (${res.status})`);
  }
  return res.json();
}

export async function fetchDeckDefinition(deckId: string): Promise<DeckDefinition> {
  const cached = deckCache.get(deckId);
  if (cached) return cached;

  const res = await fetch(`${getBaseUrl()}decks/${encodeURIComponent(deckId)}/deck.json`);
  if (!res.ok) {
    throw new Error(`Failed to load deck "${deckId}" (${res.status})`);
  }
  const deck: DeckDefinition = await res.json();
  deckCache.set(deckId, deck);
  return deck;
}

export function resolveDeckAssetPath(deckId: string, relativePath?: string): string | null {
  if (!relativePath) return null;
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://') || relativePath.startsWith('/')) {
    return relativePath;
  }
  return `${getBaseUrl()}decks/${encodeURIComponent(deckId)}/${relativePath}`;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Expands a deck definition's card templates by their `count` property into
 * shuffled CardInstances placed face-down in a neat center stack (500, 500).
 */
export function instantiateDeck(deck: DeckDefinition): CardInstance[] {
  const instances: CardInstance[] = [];

  for (const template of deck.cards) {
    const qty = Math.max(1, Math.floor(template.count || 1));
    for (let i = 0; i < qty; i++) {
      instances.push({
        instanceId: generateId(),
        templateId: template.templateId,
        zone: 'TABLE',
        ownerId: null,
        faceUp: false,
        x: 500,
        y: 500,
        zIndex: 0,
        rotation: 0,
      });
    }
  }

  // Fisher-Yates shuffle
  for (let i = instances.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [instances[i], instances[j]] = [instances[j], instances[i]];
  }

  return instances.map((card, index) => ({
    ...card,
    zIndex: index + 1,
  }));
}
