import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { CardTemplate, DeckDefinition } from './types/game';
import { fetchDeckDefinition, instantiateDeck } from './lib/decks';
import {
  getOrCreatePlayerId,
  getSavedPlayerName,
  normalizeRoomCode,
  savePlayerName,
} from './lib/roomUtils';
import { useGameRoom } from './hooks/useGameRoom';
import { Lobby } from './components/Lobby';
import { TopBar, type ActiveView } from './components/TopBar';
import { HandView } from './components/HandView';
import { TableCanvas } from './components/TableCanvas';
import { DeckSetupModal } from './components/DeckSetupModal';
import { CardInspectModal } from './components/CardInspectModal';

function getInitialRoomFromUrl(): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return normalizeRoomCode(params.get('room') ?? '');
}

export default function App() {
  const [playerId] = useState<string>(() => getOrCreatePlayerId());
  const [playerName, setPlayerName] = useState<string>(() => getSavedPlayerName());
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [initialUrlRoom] = useState<string>(() => getInitialRoomFromUrl());
  const [activeView, setActiveView] = useState<ActiveView>('TABLE');
  const [deck, setDeck] = useState<DeckDefinition | null>(null);
  const [deckPickerOpen, setDeckPickerOpen] = useState(false);
  const [inspectState, setInspectState] = useState<{
    template: CardTemplate | null;
    faceUp: boolean;
  } | null>(null);

  const { roomState, status, lastError, send } = useGameRoom({
    roomCode,
    playerId,
    playerName,
  });

  // Sync URL ?room=XXXX for easy sharing
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (roomCode) {
      url.searchParams.set('room', roomCode);
    } else {
      url.searchParams.delete('room');
    }
    window.history.replaceState({}, '', url.toString());
  }, [roomCode]);

  // Fetch deck definition whenever roomState.deckId changes
  useEffect(() => {
    const deckId = roomState?.deckId;
    if (!deckId) {
      setDeck(null);
      return;
    }
    let cancelled = false;
    fetchDeckDefinition(deckId)
      .then((loaded) => {
        if (!cancelled) setDeck(loaded);
      })
      .catch(() => {
        if (!cancelled) setDeck(null);
      });
    return () => {
      cancelled = true;
    };
  }, [roomState?.deckId]);

  const templatesById = useMemo(() => {
    const map = new Map<string, CardTemplate>();
    if (!deck) return map;
    for (const template of deck.cards) {
      map.set(template.templateId, template);
    }
    return map;
  }, [deck]);

  const players = useMemo(() => {
    if (!roomState) return [];
    return Object.values(roomState.players).sort((a, b) => {
      if (a.id === playerId) return -1;
      if (b.id === playerId) return 1;
      if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [roomState, playerId]);

  const currentPlayer = roomState?.players[playerId] ?? null;
  const hostPlayer = players.find((p) => p.isHost) ?? players[0] ?? null;

  const allCards = useMemo(() => Object.values(roomState?.cards ?? {}), [roomState?.cards]);

  const handCards = useMemo(
    () => allCards.filter((c) => c.zone === 'HAND' && c.ownerId === playerId),
    [allCards, playerId],
  );

  const tableCardCount = useMemo(
    () => allCards.filter((c) => c.zone === 'TABLE').length,
    [allCards],
  );

  const handleEnterRoom = useCallback((code: string, name: string) => {
    savePlayerName(name);
    setPlayerName(name);
    setRoomCode(code);
    setActiveView('TABLE');
  }, []);

  const handleSelectDeck = useCallback(
    async (deckId: string, dealCount: number) => {
      const definition = await fetchDeckDefinition(deckId);
      setDeck(definition);
      const cards = instantiateDeck(definition);
      send({ type: 'LOAD_DECK', deckId, cards, dealCount });
      if (dealCount > 0) {
        setActiveView('HAND');
      }
    },
    [send],
  );

  const handlePlayFromHand = useCallback(
    (instanceId: string, faceUp: boolean) => {
      // Slight scatter near center-bottom so consecutive plays stay individually visible
      const jitterX = Math.round((Math.random() - 0.5) * 80);
      const jitterY = Math.round((Math.random() - 0.5) * 40);
      send({
        type: 'PLAY_FROM_HAND',
        instanceId,
        faceUp,
        x: 500 + jitterX,
        y: 560 + jitterY,
      });
    },
    [send],
  );

  if (!roomCode) {
    return (
      <Lobby
        initialName={playerName}
        initialRoomCode={initialUrlRoom}
        onEnterRoom={handleEnterRoom}
      />
    );
  }

  const hasCardsLoaded = allCards.length > 0;
  const showSetupModal = Boolean(roomState) && (!hasCardsLoaded || deckPickerOpen);

  return (
    <div className="flex h-full w-full flex-col bg-slate-950 overflow-hidden">
      <TopBar
        roomCode={roomCode}
        activeView={activeView}
        onChangeView={setActiveView}
        handCount={handCards.length}
        canUndo={(roomState?.history.length ?? 0) > 0}
        onUndo={() => send({ type: 'UNDO' })}
        connectionStatus={status}
        onOpenDeckPicker={() => setDeckPickerOpen(true)}
        onDealCards={(count) => send({ type: 'DEAL_CARDS', countPerPlayer: count })}
        onShuffleDeck={() => send({ type: 'SHUFFLE_DECK' })}
        onRecallAll={() => send({ type: 'RECALL_ALL' })}
        onResetBoard={() => send({ type: 'RESET_BOARD' })}
        onLeaveRoom={() => {
          setDeckPickerOpen(false);
          setRoomCode(null);
        }}
      />

      {lastError && (
        <div className="bg-rose-950/90 border-b border-rose-500/40 px-4 py-1.5 text-center text-xs text-rose-200">
          {lastError}
        </div>
      )}

      <main className="relative flex-1 overflow-hidden">
        {!roomState ? (
          <div className="felt-table flex h-full w-full flex-col items-center justify-center gap-3 text-slate-300">
            <Loader2 className="h-7 w-7 animate-spin text-emerald-400" />
            <div className="text-sm font-medium">Connecting to room {roomCode}...</div>
            <div className="text-xs text-slate-400">
              Ensure PartyKit server is running (`npm run dev`)
            </div>
          </div>
        ) : activeView === 'HAND' ? (
          <HandView
            roomCode={roomCode}
            playerId={playerId}
            handCards={handCards}
            players={players}
            deck={deck}
            templatesById={templatesById}
            tableCardCount={tableCardCount}
            onPlayCard={handlePlayFromHand}
            onPassCard={(instanceId, targetPlayerId) =>
              send({ type: 'PASS_CARD', instanceId, targetPlayerId })
            }
            onInspectCard={(template, faceUp) => setInspectState({ template, faceUp })}
            onSwitchToTable={() => setActiveView('TABLE')}
          />
        ) : (
          <TableCanvas
            playerId={playerId}
            players={players}
            cards={roomState.cards}
            deck={deck}
            templatesById={templatesById}
            onMoveCard={(instanceId, x, y, transient) =>
              send({ type: 'MOVE_CARD', instanceId, x, y, transient })
            }
            onFlipCard={(instanceId) => send({ type: 'FLIP_CARD', instanceId })}
            onRotateCard={(instanceId) => send({ type: 'ROTATE_CARD', instanceId, delta: 90 })}
            onDrawToHand={(instanceId) => send({ type: 'DRAW_TO_HAND', instanceId, playerId })}
            onPassCard={(instanceId, targetPlayerId) =>
              send({ type: 'PASS_CARD', instanceId, targetPlayerId })
            }
            onShuffleStack={(instanceIds) => send({ type: 'SHUFFLE_STACK', instanceIds })}
            onSpreadStack={(instanceIds) => send({ type: 'SPREAD_STACK', instanceIds })}
            onTakeStack={(instanceIds) => send({ type: 'TAKE_STACK', instanceIds, playerId })}
            onInspectCard={(template, faceUp) => setInspectState({ template, faceUp })}
          />
        )}
      </main>

      <DeckSetupModal
        isOpen={showSetupModal}
        canClose={hasCardsLoaded}
        isHost={Boolean(currentPlayer?.isHost)}
        hostName={hostPlayer?.name || 'Host'}
        currentDeckId={roomState?.deckId || 'standard-52'}
        playerCount={players.length}
        onClose={() => setDeckPickerOpen(false)}
        onSelectDeck={handleSelectDeck}
      />

      {inspectState && (
        <CardInspectModal
          deck={deck}
          template={inspectState.template}
          faceUp={inspectState.faceUp}
          onClose={() => setInspectState(null)}
        />
      )}
    </div>
  );
}
