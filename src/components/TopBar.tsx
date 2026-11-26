import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Hand,
  Layers,
  LogOut,
  Menu,
  RotateCcw,
  Shuffle,
  Sparkles,
  SquareStack,
  Undo2,
  Users,
} from 'lucide-react';
import type { ConnectionStatus } from '../hooks/useGameRoom';

export type ActiveView = 'HAND' | 'TABLE';

interface TopBarProps {
  roomCode: string;
  activeView: ActiveView;
  onChangeView: (view: ActiveView) => void;
  handCount: number;
  canUndo: boolean;
  onUndo: () => void;
  connectionStatus: ConnectionStatus;
  onOpenDeckPicker: () => void;
  onDealCards: (count: number) => void;
  onShuffleDeck: () => void;
  onRecallAll: () => void;
  onResetBoard: () => void;
  onLeaveRoom: () => void;
}

export function TopBar({
  roomCode,
  activeView,
  onChangeView,
  handCount,
  canUndo,
  onUndo,
  connectionStatus,
  onOpenDeckPicker,
  onDealCards,
  onShuffleDeck,
  onRecallAll,
  onResetBoard,
  onLeaveRoom,
}: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dealPromptOpen, setDealPromptOpen] = useState(false);
  const [dealCount, setDealCount] = useState(5);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setDealPromptOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  const handleCopyCode = async () => {
    try {
      const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Fallback: copy plain code
      try {
        await navigator.clipboard.writeText(roomCode);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      } catch {
        // ignore clipboard failure
      }
    }
  };

  const statusColor =
    connectionStatus === 'connected'
      ? 'bg-emerald-400'
      : connectionStatus === 'connecting' || connectionStatus === 'reconnecting'
        ? 'bg-amber-400 animate-pulse'
        : 'bg-rose-500';

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-slate-950/95 px-3 backdrop-blur-md">
      {/* Room Code Pill */}
      <button
        type="button"
        onClick={handleCopyCode}
        title="Copy invite link"
        className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900 px-2.5 py-1.5 text-left transition active:scale-95 hover:border-emerald-400/50"
      >
        <span className={`h-2 w-2 rounded-full ${statusColor}`} />
        <span className="font-mono text-sm font-bold tracking-widest text-white">{roomCode}</span>
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <Copy className="h-3.5 w-3.5 text-slate-400" />
        )}
      </button>

      {/* View Toggle: My Hand vs Table */}
      <div className="flex items-center rounded-xl border border-white/10 bg-slate-900 p-1">
        <button
          type="button"
          onClick={() => onChangeView('HAND')}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
            activeView === 'HAND'
              ? 'bg-emerald-500 text-slate-950 shadow-sm'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <Hand className="h-3.5 w-3.5" />
          <span>Hand</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
              activeView === 'HAND' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {handCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onChangeView('TABLE')}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
            activeView === 'TABLE'
              ? 'bg-emerald-500 text-slate-950 shadow-sm'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Table</span>
        </button>
      </div>

      {/* Right controls: Undo + Room Menu */}
      <div className="flex items-center gap-1.5" ref={menuRef}>
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo last action"
          aria-label="Undo last action"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 transition active:scale-95 disabled:opacity-35 disabled:pointer-events-none hover:bg-slate-800"
        >
          <Undo2 className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => {
            setMenuOpen((o) => !o);
            setDealPromptOpen(false);
          }}
          title="Room Menu"
          aria-label="Room Menu"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 transition active:scale-95 hover:bg-slate-800"
        >
          <Menu className="h-4 w-4" />
        </button>

        {menuOpen && (
          <div className="absolute right-3 top-14 z-50 w-60 rounded-2xl border border-white/10 bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur-xl">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onOpenDeckPicker();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-100 transition hover:bg-white/10"
            >
              <Sparkles className="h-4 w-4 text-emerald-400" />
              Select / Change Deck
            </button>

            {!dealPromptOpen ? (
              <button
                type="button"
                onClick={() => setDealPromptOpen(true)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-100 transition hover:bg-white/10"
              >
                <Users className="h-4 w-4 text-sky-400" />
                Deal Cards to All...
              </button>
            ) : (
              <div className="my-1 rounded-xl border border-white/10 bg-slate-950/70 p-2.5">
                <div className="mb-2 text-xs font-semibold text-slate-300">Cards per player</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDealCount((c) => Math.max(1, c - 1))}
                    className="h-8 w-8 rounded-lg bg-slate-800 font-bold text-white"
                  >
                    -
                  </button>
                  <span className="flex-1 text-center font-mono text-sm font-bold text-white">
                    {dealCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDealCount((c) => Math.min(15, c + 1))}
                    className="h-8 w-8 rounded-lg bg-slate-800 font-bold text-white"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDealCards(dealCount);
                      setDealPromptOpen(false);
                      setMenuOpen(false);
                    }}
                    className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950"
                  >
                    Deal
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                onShuffleDeck();
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-100 transition hover:bg-white/10"
            >
              <Shuffle className="h-4 w-4 text-amber-400" />
              Shuffle Deck
            </button>

            <button
              type="button"
              onClick={() => {
                onRecallAll();
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-100 transition hover:bg-white/10"
            >
              <SquareStack className="h-4 w-4 text-indigo-400" />
              Recall All to Deck
            </button>

            <button
              type="button"
              onClick={() => {
                onResetBoard();
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-amber-200 transition hover:bg-white/10"
            >
              <RotateCcw className="h-4 w-4 text-amber-400" />
              Reset Board
            </button>

            <div className="my-1.5 h-px bg-white/10" />

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onLeaveRoom();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-rose-300 transition hover:bg-rose-500/15"
            >
              <LogOut className="h-4 w-4 text-rose-400" />
              Leave Room
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
