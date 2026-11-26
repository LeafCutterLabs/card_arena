import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, Reorder, motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  Send,
  X,
  ZoomIn,
} from 'lucide-react';
import type { CardInstance, CardTemplate, DeckDefinition, Player } from '../types/game';
import { loadLocalHandOrder, saveLocalHandOrder } from '../lib/roomUtils';
import { CardRenderer } from './CardRenderer';

interface HandViewProps {
  roomCode: string;
  playerId: string;
  handCards: CardInstance[];
  players: Player[];
  deck: DeckDefinition | null;
  templatesById: Map<string, CardTemplate>;
  tableCardCount: number;
  onPlayCard: (instanceId: string, faceUp: boolean) => void;
  onPassCard: (instanceId: string, targetPlayerId: string) => void;
  onInspectCard: (template: CardTemplate | null, faceUp: boolean) => void;
  onSwitchToTable: () => void;
}

export function HandView({
  roomCode,
  playerId,
  handCards,
  players,
  deck,
  templatesById,
  tableCardCount,
  onPlayCard,
  onPassCard,
  onInspectCard,
  onSwitchToTable,
}: HandViewProps) {
  const [orderedIds, setOrderedIds] = useState<string[]>(() =>
    loadLocalHandOrder(roomCode, playerId),
  );
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const cardMap = useMemo(() => {
    const map = new Map<string, CardInstance>();
    for (const c of handCards) {
      map.set(c.instanceId, c);
    }
    return map;
  }, [handCards]);

  // Reconcile server hand cards with persisted local ordering
  useEffect(() => {
    setOrderedIds((prev) => {
      const currentSet = new Set(handCards.map((c) => c.instanceId));
      const kept = prev.filter((id) => currentSet.has(id));
      const keptSet = new Set(kept);
      const added = handCards
        .map((c) => c.instanceId)
        .filter((id) => !keptSet.has(id));
      const next = [...kept, ...added];

      if (next.length !== prev.length || next.some((id, idx) => id !== prev[idx])) {
        saveLocalHandOrder(roomCode, playerId, next);
        return next;
      }
      return prev;
    });
  }, [handCards, roomCode, playerId]);

  // Close overlay if selected card leaves hand
  useEffect(() => {
    if (selectedCardId && !cardMap.has(selectedCardId)) {
      setSelectedCardId(null);
    }
  }, [selectedCardId, cardMap]);

  const handleReorder = (newOrder: string[]) => {
    setOrderedIds(newOrder);
    saveLocalHandOrder(roomCode, playerId, newOrder);
  };

  const nudgeCard = (instanceId: string, direction: -1 | 1) => {
    const idx = orderedIds.indexOf(instanceId);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= orderedIds.length) return;
    const next = [...orderedIds];
    [next[idx], next[target]] = [next[target], next[idx]];
    handleReorder(next);
  };

  const otherPlayers = useMemo(
    () => players.filter((p) => p.id !== playerId),
    [players, playerId],
  );

  const selectedCard = selectedCardId ? cardMap.get(selectedCardId) ?? null : null;
  const selectedTemplate = selectedCard ? templatesById.get(selectedCard.templateId) ?? null : null;

  return (
    <div className="relative flex h-full w-full flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Subtle header bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div>
          <h2 className="text-sm font-bold text-white">Your Private Hand</h2>
          <p className="text-xs text-slate-400">
            Drag horizontally to sort · Tap a card for actions
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-slate-800/80 px-2.5 py-1 text-xs font-semibold text-emerald-400">
          {handCards.length} {handCards.length === 1 ? 'card' : 'cards'}
        </span>
      </div>

      {/* Hand Area */}
      {handCards.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-500">
            <Layers className="h-8 w-8" />
          </div>
          <h3 className="text-base font-semibold text-white">Your hand is empty</h3>
          <p className="mt-1 max-w-xs text-xs text-slate-400">
            {tableCardCount > 0
              ? 'Switch to the Table view and tap a stack to draw cards, or have the host deal.'
              : 'Load a deck from the Room Menu to start playing.'}
          </p>
          <button
            type="button"
            onClick={onSwitchToTable}
            className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 shadow transition active:scale-95 hover:bg-emerald-400"
          >
            <Layers className="h-4 w-4" />
            Go to Table
          </button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center overflow-hidden">
          <div className="no-scrollbar flex w-full items-center overflow-x-auto px-5 py-8">
            <Reorder.Group
              axis="x"
              values={orderedIds}
              onReorder={handleReorder}
              className="mx-auto flex items-center gap-3"
            >
              {orderedIds.map((id) => {
                const card = cardMap.get(id);
                if (!card) return null;
                const template = templatesById.get(card.templateId) ?? null;
                const isSelected = selectedCardId === id;

                return (
                  <Reorder.Item
                    key={id}
                    value={id}
                    whileDrag={{ scale: 1.07, y: -12, zIndex: 30 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    onPointerDown={(e: React.PointerEvent) => {
                      pointerDownPos.current = { x: e.clientX, y: e.clientY };
                    }}
                    onClick={(e: React.MouseEvent) => {
                      const start = pointerDownPos.current;
                      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) {
                        return;
                      }
                      setSelectedCardId(id);
                    }}
                    className={`w-[122px] sm:w-[144px] shrink-0 cursor-grab active:cursor-grabbing rounded-xl transition-transform ${
                      isSelected ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900 -translate-y-2' : ''
                    }`}
                  >
                    <CardRenderer deck={deck} template={template} faceUp={true} size="hand" />
                  </Reorder.Item>
                );
              })}
            </Reorder.Group>
          </div>
        </div>
      )}

      {/* Quick-Action Overlay when a card is tapped */}
      <AnimatePresence>
        {selectedCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedCardId(null)}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-4 shadow-2xl"
            >
              {/* Card preview + header */}
              <div className="mb-4 flex items-center gap-3.5">
                <div className="w-16 shrink-0">
                  <CardRenderer
                    deck={deck}
                    template={selectedTemplate}
                    faceUp={true}
                    size="table"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-bold text-white">
                    {selectedTemplate?.title || selectedTemplate?.cornerValue || 'Card'}
                  </div>
                  {selectedTemplate?.cornerValue && selectedTemplate?.title !== selectedTemplate?.cornerValue && (
                    <div className="text-xs font-semibold text-emerald-400">
                      {selectedTemplate.cornerValue}
                    </div>
                  )}
                  {selectedTemplate?.rulesText && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-300">
                      {selectedTemplate.rulesText}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCardId(null)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Primary Actions */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    onPlayCard(selectedCard.instanceId, true);
                    setSelectedCardId(null);
                  }}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-3 py-3 text-sm font-bold text-slate-950 transition active:scale-95 hover:bg-emerald-400"
                >
                  <Eye className="h-4 w-4" />
                  Play Face Up
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onPlayCard(selectedCard.instanceId, false);
                    setSelectedCardId(null);
                  }}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-800 px-3 py-3 text-sm font-bold text-white transition active:scale-95 hover:bg-slate-700"
                >
                  <EyeOff className="h-4 w-4" />
                  Play Face Down
                </button>
              </div>

              {/* Zoom + Quick Sort Controls */}
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onInspectCard(selectedTemplate, true);
                    setSelectedCardId(null);
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
                >
                  <ZoomIn className="h-4 w-4 text-sky-400" />
                  Zoom / Inspect
                </button>
                <button
                  type="button"
                  onClick={() => nudgeCard(selectedCard.instanceId, -1)}
                  disabled={orderedIds.indexOf(selectedCard.instanceId) <= 0}
                  title="Move card left"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-950/60 text-slate-200 disabled:opacity-30 hover:bg-slate-800"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => nudgeCard(selectedCard.instanceId, 1)}
                  disabled={orderedIds.indexOf(selectedCard.instanceId) >= orderedIds.length - 1}
                  title="Move card right"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-950/60 text-slate-200 disabled:opacity-30 hover:bg-slate-800"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Pass to Player */}
              {otherPlayers.length > 0 && (
                <div className="mt-3.5 border-t border-white/10 pt-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <Send className="h-3.5 w-3.5" />
                    Pass to Player
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {otherPlayers.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          onPassCard(selectedCard.instanceId, p.id);
                          setSelectedCardId(null);
                        }}
                        className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs font-semibold text-white transition active:scale-95 hover:border-emerald-400/50 hover:bg-slate-700"
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            p.connected ? 'bg-emerald-400' : 'bg-slate-500'
                          }`}
                        />
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
