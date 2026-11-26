import { useEffect, useState } from 'react';
import { CheckCircle2, Layers, Loader2, Play, X } from 'lucide-react';
import type { DeckManifestEntry } from '../types/game';
import { fetchDeckManifest } from '../lib/decks';

interface DeckSetupModalProps {
  isOpen: boolean;
  canClose: boolean;
  isHost: boolean;
  hostName: string;
  currentDeckId: string;
  playerCount: number;
  onClose: () => void;
  onSelectDeck: (deckId: string, dealCount: number) => Promise<void>;
}

const DEAL_PRESETS = [0, 3, 5, 7];

export function DeckSetupModal({
  isOpen,
  canClose,
  isHost,
  hostName,
  currentDeckId,
  playerCount,
  onClose,
  onSelectDeck,
}: DeckSetupModalProps) {
  const [decks, setDecks] = useState<DeckManifestEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string>(currentDeckId || 'standard-52');
  const [dealCount, setDealCount] = useState<number>(5);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrideWait, setOverrideWait] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setOverrideWait(false);
    setLoading(true);
    setError(null);
    fetchDeckManifest()
      .then((manifest) => {
        setDecks(manifest.decks);
        if (manifest.decks.length > 0 && !manifest.decks.some((d) => d.id === selectedId)) {
          setSelectedId(manifest.decks[0].id);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load decks.');
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStart = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSelectDeck(selectedId, dealCount);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load deck.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Choose a Deck</h2>
              <p className="text-xs text-slate-400">
                {playerCount} {playerCount === 1 ? 'player' : 'players'} in room
              </p>
            </div>
          </div>
          {canClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {!isHost && !canClose && !overrideWait ? (
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5 text-center">
            <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-emerald-400" />
            <p className="text-sm font-medium text-white">
              Waiting for <span className="text-emerald-400">{hostName}</span> to choose a deck...
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Cards will appear automatically as soon as the host starts.
            </p>
            <button
              type="button"
              onClick={() => setOverrideWait(true)}
              className="mt-4 text-xs font-medium text-slate-400 underline underline-offset-2 hover:text-white"
            >
              Pick a deck myself instead
            </button>
          </div>
        ) : (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-10 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-0.5">
                {decks.map((deck) => {
                  const active = deck.id === selectedId;
                  return (
                    <button
                      key={deck.id}
                      type="button"
                      onClick={() => setSelectedId(deck.id)}
                      className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition ${
                        active
                          ? 'border-emerald-400 bg-emerald-500/15'
                          : 'border-white/10 bg-slate-950/50 hover:border-white/20'
                      }`}
                    >
                      <CheckCircle2
                        className={`mt-0.5 h-5 w-5 shrink-0 ${
                          active ? 'text-emerald-400' : 'text-slate-600'
                        }`}
                      />
                      <div>
                        <div className="text-sm font-semibold text-white">{deck.name}</div>
                        <div className="mt-0.5 text-xs text-slate-400">{deck.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Deal N Cards Option */}
            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/50 p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Initial Deal per Player
                </span>
                <span className="font-mono text-sm font-bold text-emerald-400">
                  {dealCount === 0 ? 'Keep all in deck' : `${dealCount} cards`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {DEAL_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setDealCount(n)}
                    className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
                      dealCount === n
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {n === 0 ? 'None' : n}
                  </button>
                ))}
                <div className="flex items-center rounded-xl bg-slate-800 p-0.5">
                  <button
                    type="button"
                    onClick={() => setDealCount((c) => Math.max(0, c - 1))}
                    className="h-7 w-7 rounded-lg text-sm font-bold text-slate-200 hover:bg-slate-700"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={() => setDealCount((c) => Math.min(15, c + 1))}
                    className="h-7 w-7 rounded-lg text-sm font-bold text-slate-200 hover:bg-slate-700"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-950/60 px-3 py-2 text-xs text-rose-200">
                {error}
              </div>
            )}

            <button
              type="button"
              disabled={submitting || loading || !selectedId}
              onClick={handleStart}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3.5 text-sm font-bold text-slate-950 shadow-lg transition active:scale-[0.98] disabled:opacity-50 hover:bg-emerald-400"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {canClose ? 'Load Deck & Reset Table' : 'Load Deck & Start'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
