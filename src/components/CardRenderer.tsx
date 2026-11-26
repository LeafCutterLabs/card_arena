import React, { useMemo, useState } from 'react';
import type { CardTemplate, DeckDefinition } from '../types/game';
import { resolveDeckAssetPath } from '../lib/decks';

export type CardSize = 'table' | 'hand' | 'inspect';

interface CardRendererProps {
  deck: DeckDefinition | null;
  template: CardTemplate | null;
  faceUp: boolean;
  size?: CardSize;
  className?: string;
}

interface FallbackTheme {
  bgStyle: React.CSSProperties;
  borderClass: string;
  badgeBg: string;
  isPlayingCard: boolean;
}

function getFallbackTheme(template: CardTemplate | null): FallbackTheme {
  const bg = (template?.background ?? '').toLowerCase();

  if (bg.includes('spades') || bg.includes('clubs') || bg.includes('hearts') || bg.includes('diamonds')) {
    return {
      bgStyle: {
        background: 'linear-gradient(155deg, #ffffff 0%, #f8fafc 55%, #eef2f6 100%)',
      },
      borderClass: 'border-slate-300/90',
      badgeBg: 'rgba(15, 23, 42, 0.06)',
      isPlayingCard: true,
    };
  }
  if (bg.includes('red') || bg.includes('fire')) {
    return {
      bgStyle: {
        background: 'linear-gradient(155deg, #dc2626 0%, #991b1b 60%, #450a0a 100%)',
      },
      borderClass: 'border-red-300/50',
      badgeBg: 'rgba(0, 0, 0, 0.28)',
      isPlayingCard: false,
    };
  }
  if (bg.includes('blue') || bg.includes('water')) {
    return {
      bgStyle: {
        background: 'linear-gradient(155deg, #2563eb 0%, #1d4ed8 55%, #172554 100%)',
      },
      borderClass: 'border-sky-300/50',
      badgeBg: 'rgba(0, 0, 0, 0.26)',
      isPlayingCard: false,
    };
  }
  if (bg.includes('green') || bg.includes('forest')) {
    return {
      bgStyle: {
        background: 'linear-gradient(155deg, #16a34a 0%, #166534 60%, #052e16 100%)',
      },
      borderClass: 'border-emerald-300/50',
      badgeBg: 'rgba(0, 0, 0, 0.26)',
      isPlayingCard: false,
    };
  }
  if (bg.includes('gold') || bg.includes('yellow')) {
    return {
      bgStyle: {
        background: 'linear-gradient(155deg, #fef08a 0%, #facc15 55%, #ca8a04 100%)',
      },
      borderClass: 'border-amber-200/70',
      badgeBg: 'rgba(255, 255, 255, 0.3)',
      isPlayingCard: false,
    };
  }
  if (bg.includes('purple') || bg.includes('wild')) {
    return {
      bgStyle: {
        background: 'linear-gradient(155deg, #9333ea 0%, #6b21a8 58%, #3b0764 100%)',
      },
      borderClass: 'border-fuchsia-300/50',
      badgeBg: 'rgba(0, 0, 0, 0.28)',
      isPlayingCard: false,
    };
  }
  if (bg.includes('dark') || bg.includes('void')) {
    return {
      bgStyle: {
        background: 'linear-gradient(155deg, #334155 0%, #1e293b 55%, #020617 100%)',
      },
      borderClass: 'border-slate-400/40',
      badgeBg: 'rgba(255, 255, 255, 0.1)',
      isPlayingCard: false,
    };
  }

  return {
    bgStyle: {
      background: 'linear-gradient(155deg, #f8fafc 0%, #e2e8f0 100%)',
    },
    borderClass: 'border-slate-300/80',
    badgeBg: 'rgba(15, 23, 42, 0.08)',
    isPlayingCard: false,
  };
}

function CardBackFallback() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-950 p-1.5">
      <div className="relative h-full w-full rounded-lg border border-amber-400/45 bg-indigo-950/70 overflow-hidden flex items-center justify-center">
        <svg
          className="absolute inset-0 h-full w-full opacity-30"
          xmlns="http://www.w3.org/2000/svg"
          width="100%"
          height="100%"
        >
          <defs>
            <pattern id="card-back-lattice" width="16" height="16" patternUnits="userSpaceOnUse">
              <path
                d="M8 0L16 8L8 16L0 8Z"
                fill="none"
                stroke="#f59e0b"
                strokeWidth="0.7"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#card-back-lattice)" />
        </svg>
        <div className="relative h-8 w-8 rounded-full border border-amber-400/50 bg-slate-950/70 flex items-center justify-center shadow-inner">
          <div className="h-3.5 w-3.5 rotate-45 border border-amber-300/75 bg-amber-400/20" />
        </div>
      </div>
    </div>
  );
}

const SIZE_CLASSES: Record<
  CardSize,
  {
    corner: string;
    title: string;
    pip: string;
    rules: string;
    pad: string;
  }
> = {
  table: {
    corner: 'text-[10px] leading-none font-bold',
    title: 'text-[10px] leading-tight font-extrabold tracking-wide',
    pip: 'text-2xl leading-none',
    rules: 'text-[7px] leading-[1.15] line-clamp-3',
    pad: 'p-1.5',
  },
  hand: {
    corner: 'text-xs leading-none font-bold',
    title: 'text-xs leading-tight font-extrabold tracking-wide',
    pip: 'text-3xl leading-none',
    rules: 'text-[9px] leading-tight line-clamp-3',
    pad: 'p-2',
  },
  inspect: {
    corner: 'text-2xl leading-none font-bold',
    title: 'text-2xl leading-tight font-black tracking-wide',
    pip: 'text-7xl leading-none',
    rules: 'text-sm leading-snug',
    pad: 'p-4',
  },
};

export const CardRenderer = React.memo(function CardRenderer({
  deck,
  template,
  faceUp,
  size = 'table',
  className = '',
}: CardRendererProps) {
  const [backFailed, setBackFailed] = useState(false);
  const [bgFailed, setBgFailed] = useState(false);
  const [artFailed, setArtFailed] = useState(false);

  const deckId = deck?.id ?? '';
  const backSrc = useMemo(
    () => (deck ? resolveDeckAssetPath(deck.id, deck.cardBack) : null),
    [deck],
  );
  const bgSrc = useMemo(
    () => (deck && template ? resolveDeckAssetPath(deck.id, template.background) : null),
    [deck, template],
  );
  const artSrc = useMemo(
    () => (deck && template?.foregroundArt ? resolveDeckAssetPath(deck.id, template.foregroundArt) : null),
    [deck, template],
  );

  // Reset error states if deck/template asset URLs change
  const assetKey = `${deckId}:${template?.templateId ?? ''}`;
  const [prevKey, setPrevKey] = useState(assetKey);
  if (assetKey !== prevKey) {
    setPrevKey(assetKey);
    setBackFailed(false);
    setBgFailed(false);
    setArtFailed(false);
  }

  const theme = useMemo(() => getFallbackTheme(template), [template]);
  const sizing = SIZE_CLASSES[size];
  const textColor = template?.textColor || deck?.defaultTextColor || '#111827';
  const isSingleGlyphTitle = Boolean(template?.title && template.title.length <= 2);

  return (
    <div
      className={`relative aspect-card w-full rounded-xl overflow-hidden select-none border shadow-card ${
        faceUp ? theme.borderClass : 'border-amber-300/40'
      } ${className}`}
    >
      {!faceUp ? (
        <>
          <CardBackFallback />
          {backSrc && !backFailed && (
            <img
              src={backSrc}
              alt="Card back"
              draggable={false}
              onError={() => setBackFailed(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
        </>
      ) : (
        <div className="relative h-full w-full" style={theme.bgStyle}>
          {/* Layer 1: Base background image */}
          {bgSrc && !bgFailed && (
            <img
              src={bgSrc}
              alt=""
              draggable={false}
              onError={() => setBgFailed(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}

          {/* Subtle safe-area inner frame for fallback aesthetics */}
          {bgFailed || !bgSrc ? (
            <div
              className="pointer-events-none absolute inset-[6%] rounded-lg border"
              style={{ borderColor: `${textColor}22` }}
            />
          ) : null}

          {/* Layer 2: Optional center foreground art */}
          {artSrc && !artFailed && (
            <div className="pointer-events-none absolute inset-[14%] flex items-center justify-center">
              <img
                src={artSrc}
                alt={template?.title ?? ''}
                draggable={false}
                onError={() => setArtFailed(true)}
                className="max-h-full max-w-full object-contain drop-shadow"
              />
            </div>
          )}

          {/* Layer 3: Dynamic Typography */}
          <div
            className={`relative z-10 flex h-full w-full flex-col justify-between ${sizing.pad}`}
            style={{ color: textColor }}
          >
            {/* Top-left corner index */}
            <div className="flex items-start justify-between">
              {template?.cornerValue && (
                <span className={`${sizing.corner} whitespace-nowrap drop-shadow-sm`}>
                  {template.cornerValue}
                </span>
              )}
            </div>

            {/* Center title / emblem */}
            <div className="flex flex-1 flex-col items-center justify-center text-center px-0.5">
              {template?.title && (
                <div
                  className={
                    isSingleGlyphTitle
                      ? `${sizing.pip} drop-shadow-sm`
                      : `${sizing.title} uppercase drop-shadow-sm`
                  }
                >
                  {template.title}
                </div>
              )}
            </div>

            {/* Rules text box (if present) */}
            {template?.rulesText && !theme.isPlayingCard && (
              <div
                className={`mb-1 rounded-md px-1.5 py-1 text-center backdrop-blur-[2px] ${sizing.rules}`}
                style={{ backgroundColor: theme.badgeBg }}
              >
                {template.rulesText}
              </div>
            )}

            {/* Bottom-right corner index (rotated 180 deg) */}
            <div className="flex items-end justify-end">
              {template?.cornerValue && (
                <span className={`${sizing.corner} rotate-180 whitespace-nowrap drop-shadow-sm`}>
                  {template.cornerValue}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
