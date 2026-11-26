import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Crown,
  Expand,
  FlipHorizontal2,
  Hand,
  Layers,
  RotateCw,
  Shuffle,
  SquareStack,
  X,
  ZoomIn,
} from 'lucide-react';
import type { CardInstance, CardTemplate, DeckDefinition, Player } from '../types/game';
import { CardRenderer } from './CardRenderer';

const SNAP_THRESHOLD = 25; // 25 virtual units (2.5% of 1000x1000 board)
const THROTTLE_MS = 50;
const DRAG_ACTIVATION_PX = 7;

interface CardStack {
  id: string;
  anchorX: number;
  anchorY: number;
  cards: CardInstance[]; // sorted ascending by zIndex; last is top card
}

interface DragState {
  instanceId: string;
  x: number;
  y: number;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  hasMoved: boolean;
}

interface TableCanvasProps {
  playerId: string;
  players: Player[];
  cards: Record<string, CardInstance>;
  deck: DeckDefinition | null;
  templatesById: Map<string, CardTemplate>;
  onMoveCard: (instanceId: string, x: number, y: number, transient?: boolean) => void;
  onFlipCard: (instanceId: string) => void;
  onRotateCard: (instanceId: string) => void;
  onDrawToHand: (instanceId: string) => void;
  onPassCard: (instanceId: string, targetPlayerId: string) => void;
  onShuffleStack: (instanceIds: string[]) => void;
  onSpreadStack: (instanceIds: string[]) => void;
  onTakeStack: (instanceIds: string[]) => void;
  onInspectCard: (template: CardTemplate | null, faceUp: boolean) => void;
}

function clampVirtual(v: number): number {
  return Math.max(40, Math.min(960, Math.round(v * 10) / 10));
}

function clusterTableCards(tableCards: CardInstance[]): CardStack[] {
  const sorted = [...tableCards].sort((a, b) => a.zIndex - b.zIndex);
  const visited = new Set<string>();
  const stacks: CardStack[] = [];

  for (const card of sorted) {
    if (visited.has(card.instanceId)) continue;
    const cluster: CardInstance[] = [];
    const queue = [card];
    visited.add(card.instanceId);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      cluster.push(curr);
      for (const other of sorted) {
        if (visited.has(other.instanceId)) continue;
        if (Math.hypot(curr.x - other.x, curr.y - other.y) <= SNAP_THRESHOLD) {
          visited.add(other.instanceId);
          queue.push(other);
        }
      }
    }

    cluster.sort((a, b) => a.zIndex - b.zIndex);
    const top = cluster[cluster.length - 1];
    stacks.push({
      id: top.instanceId,
      anchorX: top.x,
      anchorY: top.y,
      cards: cluster,
    });
  }

  return stacks;
}

export function TableCanvas({
  playerId,
  players,
  cards,
  deck,
  templatesById,
  onMoveCard,
  onFlipCard,
  onRotateCard,
  onDrawToHand,
  onPassCard,
  onShuffleStack,
  onSpreadStack,
  onTakeStack,
  onInspectCard,
}: TableCanvasProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const badgeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lastBroadcastRef = useRef<number>(0);

  const [boardSize, setBoardSize] = useState({ width: 390, height: 600 });
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoveredPlayerId, setHoveredPlayerId] = useState<string | null>(null);
  const [snapTarget, setSnapTarget] = useState<{ x: number; y: number; stackId: string } | null>(
    null,
  );
  const [selectedTopId, setSelectedTopId] = useState<string | null>(null);

  // Measure board container responsively
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setBoardSize({ width: rect.width, height: rect.height });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const allCardValues = useMemo(() => Object.values(cards), [cards]);

  const handCountsByPlayer = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of allCardValues) {
      if (c.zone === 'HAND' && c.ownerId) {
        counts[c.ownerId] = (counts[c.ownerId] || 0) + 1;
      }
    }
    return counts;
  }, [allCardValues]);

  const tableCards = useMemo(
    () => allCardValues.filter((c) => c.zone === 'TABLE'),
    [allCardValues],
  );

  // Cluster non-dragged table cards so the dragged card smoothly separates from its stack
  const activeDraggedId = dragState?.hasMoved ? dragState.instanceId : null;

  const stacks = useMemo(() => {
    const remaining = activeDraggedId
      ? tableCards.filter((c) => c.instanceId !== activeDraggedId)
      : tableCards;
    return clusterTableCards(remaining);
  }, [tableCards, activeDraggedId]);

  const draggedCard = activeDraggedId ? cards[activeDraggedId] ?? null : null;

  const selectedStack = useMemo(() => {
    if (!selectedTopId) return null;
    return (
      stacks.find((s) => s.cards.some((c) => c.instanceId === selectedTopId)) ?? null
    );
  }, [stacks, selectedTopId]);

  const cardWidth = Math.max(58, Math.min(94, Math.round(Math.min(boardSize.width, boardSize.height) * 0.17)));
  const cardHeight = Math.round((cardWidth * 7) / 5);

  const virtualToPx = (vx: number, vy: number) => ({
    left: (vx / 1000) * boardSize.width - cardWidth / 2,
    top: (vy / 1000) * boardSize.height - cardHeight / 2,
  });

  const clientToVirtual = (clientX: number, clientY: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 500, y: 500 };
    const x = ((clientX - rect.left) / rect.width) * 1000;
    const y = ((clientY - rect.top) / rect.height) * 1000;
    return { x: clampVirtual(x), y: clampVirtual(y) };
  };

  const findHoveredPlayer = (clientX: number, clientY: number): string | null => {
    const pad = 10;
    for (const player of players) {
      const el = badgeRefs.current[player.id];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (
        clientX >= rect.left - pad &&
        clientX <= rect.right + pad &&
        clientY >= rect.top - pad &&
        clientY <= rect.bottom + pad
      ) {
        return player.id;
      }
    }
    return null;
  };

  const findSnapTarget = (
    vx: number,
    vy: number,
    ignoreInstanceId: string,
  ): { x: number; y: number; stackId: string } | null => {
    let closest: { x: number; y: number; stackId: string; dist: number } | null = null;
    for (const stack of stacks) {
      if (stack.cards.length === 1 && stack.cards[0].instanceId === ignoreInstanceId) continue;
      const dist = Math.hypot(stack.anchorX - vx, stack.anchorY - vy);
      if (dist <= SNAP_THRESHOLD && (!closest || dist < closest.dist)) {
        closest = { x: stack.anchorX, y: stack.anchorY, stackId: stack.id, dist };
      }
    }
    return closest ? { x: closest.x, y: closest.y, stackId: closest.stackId } : null;
  };

  const handleCardPointerDown = (e: React.PointerEvent<HTMLDivElement>, topCard: CardInstance) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragState({
      instanceId: topCard.instanceId,
      x: topCard.x,
      y: topCard.y,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      hasMoved: false,
    });
  };

  const handleCardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    e.stopPropagation();

    const distPx = Math.hypot(
      e.clientX - dragState.startClientX,
      e.clientY - dragState.startClientY,
    );
    const hasMoved = dragState.hasMoved || distPx > DRAG_ACTIVATION_PX;
    if (!hasMoved) return;

    if (selectedTopId) setSelectedTopId(null);

    const { x, y } = clientToVirtual(e.clientX, e.clientY);
    setDragState((prev) => (prev ? { ...prev, x, y, hasMoved: true } : null));

    const playerHit = findHoveredPlayer(e.clientX, e.clientY);
    setHoveredPlayerId(playerHit);

    if (playerHit) {
      setSnapTarget(null);
    } else {
      setSnapTarget(findSnapTarget(x, y, dragState.instanceId));
    }

    const now = performance.now();
    if (now - lastBroadcastRef.current >= THROTTLE_MS) {
      lastBroadcastRef.current = now;
      onMoveCard(dragState.instanceId, x, y, true);
    }
  };

  const handleCardPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const { instanceId, hasMoved } = dragState;

    if (!hasMoved) {
      // Tap -> toggle selection / open action sheet
      setSelectedTopId((prev) => (prev === instanceId ? null : instanceId));
    } else {
      const playerHit = findHoveredPlayer(e.clientX, e.clientY);
      if (playerHit) {
        onPassCard(instanceId, playerHit);
      } else {
        const { x, y } = clientToVirtual(e.clientX, e.clientY);
        const snap = findSnapTarget(x, y, instanceId);
        if (snap) {
          onMoveCard(instanceId, snap.x, snap.y, false);
        } else {
          onMoveCard(instanceId, x, y, false);
        }
      }
    }

    setDragState(null);
    setHoveredPlayerId(null);
    setSnapTarget(null);
  };

  const handleCardPointerCancel = () => {
    setDragState(null);
    setHoveredPlayerId(null);
    setSnapTarget(null);
  };

  return (
    <div className="felt-table relative flex h-full w-full flex-col overflow-hidden select-none touch-none">
      {/* Docked Player Badges Bar (Drop Targets for Dealing / Passing) */}
      <div className="relative z-30 flex items-center gap-2 overflow-x-auto border-b border-white/10 bg-slate-950/60 px-3 py-2 backdrop-blur-md no-scrollbar">
        {players.map((p) => {
          const isMe = p.id === playerId;
          const isHovered = hoveredPlayerId === p.id;
          const count = handCountsByPlayer[p.id] || 0;
          const initials = p.name.slice(0, 2).toUpperCase();

          return (
            <div
              key={p.id}
              ref={(el) => {
                badgeRefs.current[p.id] = el;
              }}
              className={`flex shrink-0 items-center gap-2 rounded-2xl border px-2.5 py-1.5 transition-all ${
                isHovered
                  ? 'scale-105 border-emerald-400 bg-emerald-500/30 shadow-lg shadow-emerald-500/25 ring-2 ring-emerald-400/60'
                  : isMe
                    ? 'border-emerald-400/40 bg-slate-900/90'
                    : 'border-white/10 bg-slate-900/75'
              }`}
            >
              <div className="relative flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-800 text-[10px] font-bold text-white">
                {initials}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-slate-900 ${
                    p.connected ? 'bg-emerald-400' : 'bg-slate-500'
                  }`}
                />
              </div>
              <div className="flex items-center gap-1">
                {p.isHost && <Crown className="h-3 w-3 text-amber-400" />}
                <span className="max-w-[76px] truncate text-xs font-semibold text-slate-100">
                  {isMe ? `${p.name} (You)` : p.name}
                </span>
              </div>
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                {count}
              </span>
            </div>
          );
        })}

        {activeDraggedId && (
          <div className="ml-auto hidden sm:block text-[11px] font-medium text-emerald-300/90 pr-1">
            Drop on a player to deal
          </div>
        )}
      </div>

      {/* 1000 x 1000 Normalized Virtual Play Area */}
      <div
        ref={boardRef}
        onPointerDown={() => setSelectedTopId(null)}
        className="relative flex-1 w-full overflow-hidden"
      >
        {/* Subtle center mat ring */}
        <div className="pointer-events-none absolute inset-6 rounded-3xl border border-white/[0.06]" />

        {tableCards.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <Layers className="mb-2 h-8 w-8 text-emerald-200/30" />
            <p className="text-sm font-medium text-emerald-100/50">
              Table is clear — play cards from your Hand or open the Room Menu.
            </p>
          </div>
        )}

        {/* Render each clustered stack */}
        {stacks.map((stack) => {
          const topCard = stack.cards[stack.cards.length - 1];
          const isStack = stack.cards.length >= 2;
          const isSnapHighlighted = snapTarget?.stackId === stack.id;
          const isSelected = selectedStack?.id === stack.id;
          const visibleLayers = stack.cards.slice(-5); // max 5 rendered depth layers for 60fps
          const pos = virtualToPx(stack.anchorX, stack.anchorY);

          return (
            <motion.div
              key={stack.id}
              initial={false}
              animate={{ x: pos.left, y: pos.top }}
              transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.6 }}
              style={{
                width: cardWidth,
                height: cardHeight,
                zIndex: topCard.zIndex,
              }}
              onPointerDown={(e) => handleCardPointerDown(e, topCard)}
              onPointerMove={handleCardPointerMove}
              onPointerUp={handleCardPointerUp}
              onPointerCancel={handleCardPointerCancel}
              className="absolute left-0 top-0 cursor-grab active:cursor-grabbing"
            >
              {/* Under-cards for subtle 2px physical stack thickness */}
              {visibleLayers.slice(0, -1).map((underCard, idx) => {
                const depthFromTop = visibleLayers.length - 1 - idx;
                const offset = depthFromTop * 2;
                const underTemplate = templatesById.get(underCard.templateId) ?? null;

                return (
                  <div
                    key={underCard.instanceId}
                    className="pointer-events-none absolute inset-0"
                    style={{
                      transform: `translate(${-offset}px, ${offset}px) rotate(${underCard.rotation}deg)`,
                    }}
                  >
                    <CardRenderer
                      deck={deck}
                      template={underTemplate}
                      faceUp={underCard.faceUp}
                      size="table"
                    />
                  </div>
                );
              })}

              {/* Top interactive card */}
              <div
                className={`relative h-full w-full rounded-xl transition-shadow ${
                  isSnapHighlighted
                    ? 'ring-2 ring-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.65)]'
                    : isSelected
                      ? 'ring-2 ring-amber-300 shadow-[0_0_20px_rgba(252,211,77,0.45)]'
                      : ''
                }`}
                style={{
                  transform: `rotate(${topCard.rotation}deg)`,
                }}
              >
                <CardRenderer
                  deck={deck}
                  template={templatesById.get(topCard.templateId) ?? null}
                  faceUp={topCard.faceUp}
                  size="table"
                />
              </div>

              {/* Stack count pill */}
              {isStack && (
                <div className="pointer-events-none absolute -top-2 -right-2 z-20 rounded-full border border-emerald-300/60 bg-slate-950/90 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300 shadow">
                  ×{stack.cards.length}
                </div>
              )}
            </motion.div>
          );
        })}

        {/* Active Dragged Card Overlay (60fps zero-lag local position) */}
        {dragState?.hasMoved && draggedCard && (
          <div
            style={{
              width: cardWidth,
              height: cardHeight,
              transform: `translate3d(${virtualToPx(dragState.x, dragState.y).left}px, ${
                virtualToPx(dragState.x, dragState.y).top
              }px, 0) scale(1.09) rotate(${draggedCard.rotation}deg)`,
              zIndex: 9999,
            }}
            className="pointer-events-none absolute left-0 top-0 will-change-transform"
          >
            <CardRenderer
              deck={deck}
              template={templatesById.get(draggedCard.templateId) ?? null}
              faceUp={draggedCard.faceUp}
              size="table"
              className="shadow-card-lifted ring-2 ring-emerald-400/80"
            />
          </div>
        )}
      </div>

      {/* Compact Bottom Action Sheet for Tapped Card or Stack */}
      <AnimatePresence>
        {selectedStack && (
          <motion.div
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 90, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 460, damping: 36 }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute inset-x-3 bottom-3 z-40 mx-auto max-w-md rounded-3xl border border-white/15 bg-slate-950/92 p-3.5 shadow-2xl backdrop-blur-xl"
          >
            {(() => {
              const topCard = selectedStack.cards[selectedStack.cards.length - 1];
              const topTemplate = templatesById.get(topCard.templateId) ?? null;
              const stackIds = selectedStack.cards.map((c) => c.instanceId);
              const isMulti = selectedStack.cards.length >= 2;

              return (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-emerald-500/15 px-2 py-0.5 font-mono text-xs font-bold text-emerald-300">
                        {isMulti ? `Stack · ${selectedStack.cards.length}` : 'Card'}
                      </span>
                      <span className="truncate text-sm font-semibold text-white">
                        {topCard.faceUp
                          ? topTemplate?.title || topTemplate?.cornerValue || 'Face-Up Card'
                          : 'Face-Down'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedTopId(null)}
                      className="flex h-7 w-7 items-center justify-center rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {isMulti ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onDrawToHand(topCard.instanceId);
                          if (selectedStack.cards.length <= 2) setSelectedTopId(null);
                        }}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2.5 text-xs font-bold text-slate-950 transition active:scale-95 hover:bg-emerald-400"
                      >
                        <Hand className="h-4 w-4" />
                        Draw Top Card
                      </button>
                      <button
                        type="button"
                        onClick={() => onFlipCard(topCard.instanceId)}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2.5 text-xs font-semibold text-white transition active:scale-95 hover:bg-slate-700"
                      >
                        <FlipHorizontal2 className="h-4 w-4 text-sky-400" />
                        Flip Top Card
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onShuffleStack(stackIds);
                          setSelectedTopId(null);
                        }}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2.5 text-xs font-semibold text-white transition active:scale-95 hover:bg-slate-700"
                      >
                        <Shuffle className="h-4 w-4 text-amber-400" />
                        Shuffle Stack
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSpreadStack(stackIds);
                          setSelectedTopId(null);
                        }}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2.5 text-xs font-semibold text-white transition active:scale-95 hover:bg-slate-700"
                      >
                        <Expand className="h-4 w-4 text-indigo-400" />
                        Spread / Fan
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onTakeStack(stackIds);
                          setSelectedTopId(null);
                        }}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition active:scale-95 hover:bg-slate-800"
                      >
                        <SquareStack className="h-3.5 w-3.5 text-emerald-400" />
                        Take Stack ({selectedStack.cards.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onInspectCard(topTemplate, topCard.faceUp);
                          setSelectedTopId(null);
                        }}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition active:scale-95 hover:bg-slate-800"
                      >
                        <ZoomIn className="h-3.5 w-3.5 text-sky-400" />
                        Inspect Top
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => onFlipCard(topCard.instanceId)}
                        className="flex flex-col items-center justify-center gap-1 rounded-xl bg-emerald-500 px-2 py-2.5 text-[11px] font-bold text-slate-950 transition active:scale-95 hover:bg-emerald-400"
                      >
                        <FlipHorizontal2 className="h-4 w-4" />
                        Flip
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onDrawToHand(topCard.instanceId);
                          setSelectedTopId(null);
                        }}
                        className="flex flex-col items-center justify-center gap-1 rounded-xl bg-slate-800 px-2 py-2.5 text-[11px] font-semibold text-white transition active:scale-95 hover:bg-slate-700"
                      >
                        <Hand className="h-4 w-4 text-emerald-400" />
                        Draw
                      </button>
                      <button
                        type="button"
                        onClick={() => onRotateCard(topCard.instanceId)}
                        className="flex flex-col items-center justify-center gap-1 rounded-xl bg-slate-800 px-2 py-2.5 text-[11px] font-semibold text-white transition active:scale-95 hover:bg-slate-700"
                      >
                        <RotateCw className="h-4 w-4 text-amber-400" />
                        Rotate
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onInspectCard(topTemplate, topCard.faceUp);
                          setSelectedTopId(null);
                        }}
                        className="flex flex-col items-center justify-center gap-1 rounded-xl bg-slate-800 px-2 py-2.5 text-[11px] font-semibold text-white transition active:scale-95 hover:bg-slate-700"
                      >
                        <ZoomIn className="h-4 w-4 text-sky-400" />
                        Inspect
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
