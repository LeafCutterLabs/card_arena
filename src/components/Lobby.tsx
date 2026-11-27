import React, { useState } from 'react';
import { Layers, Plus, ArrowRight, Sparkles } from 'lucide-react';
import { generateRoomCode, normalizeRoomCode } from '../lib/roomUtils';
import type { RoomMode } from '../hooks/useGameRoom';

interface LobbyProps {
  initialName: string;
  initialRoomCode?: string;
  onEnterRoom: (roomCode: string, playerName: string, mode: RoomMode) => void;
}

export function Lobby({ initialName, initialRoomCode = '', onEnterRoom }: LobbyProps) {
  const [name, setName] = useState(initialName);
  const [joinCode, setJoinCode] = useState(normalizeRoomCode(initialRoomCode));
  const [error, setError] = useState<string | null>(null);

  const validateName = (): string | null => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter your display name first.');
      return null;
    }
    setError(null);
    return trimmed.slice(0, 24);
  };

  const handleCreate = () => {
    const validName = validateName();
    if (!validName) return;
    const code = generateRoomCode();
    onEnterRoom(code, validName, 'host');
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const validName = validateName();
    if (!validName) return;
    const normalized = normalizeRoomCode(joinCode);
    if (normalized.length !== 4) {
      setError('Enter a 4-letter room code.');
      return;
    }
    setError(null);
    onEnterRoom(normalized, validName, 'join');
  };

  return (
    <div className="felt-table flex h-full w-full flex-col items-center justify-center p-5 overflow-y-auto">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/85 p-6 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 shadow-lg shadow-emerald-950/60">
            <Layers className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Sandbox Card Table</h1>
          <p className="mt-1 text-sm text-slate-400">
            Rules-agnostic multiplayer table for rapid playtesting.
          </p>
        </div>

        {/* Name Field */}
        <div className="mb-5">
          <label htmlFor="player-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Display Name
          </label>
          <input
            id="player-name"
            type="text"
            value={name}
            maxLength={24}
            placeholder="e.g. Alex"
            autoComplete="nickname"
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            className="w-full rounded-xl border border-slate-700/80 bg-slate-900/90 px-4 py-3 text-base text-white placeholder-slate-500 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-950/60 px-3.5 py-2.5 text-sm text-rose-200">
            {error}
          </div>
        )}

        {/* Create Room */}
        <button
          type="button"
          onClick={handleCreate}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3.5 text-base font-semibold text-slate-950 shadow-lg shadow-emerald-950/50 transition active:scale-[0.98] hover:bg-emerald-400"
        >
          <Plus className="h-5 w-5" />
          Create New Room
        </button>

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-800" />
          <span className="text-xs font-medium uppercase tracking-wider text-slate-500">or join room</span>
          <div className="h-px flex-1 bg-slate-800" />
        </div>

        {/* Join Room */}
        <form onSubmit={handleJoin} className="flex gap-2.5">
          <input
            type="text"
            inputMode="text"
            value={joinCode}
            maxLength={4}
            placeholder="CODE"
            onChange={(e) => {
              setJoinCode(normalizeRoomCode(e.target.value));
              if (error) setError(null);
            }}
            className="w-full flex-1 rounded-xl border border-slate-700/80 bg-slate-900/90 px-4 py-3 text-center font-mono text-lg font-bold tracking-[0.35em] text-white uppercase placeholder-slate-600 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30"
          />
          <button
            type="submit"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-5 py-3 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-slate-700"
          >
            Join
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-500">
          <Sparkles className="h-3.5 w-3.5 text-emerald-400/80" />
          <span>Zero-server WebRTC multiplayer · Mobile-first touch canvas</span>
        </div>
      </div>
    </div>
  );
}
