import { X } from 'lucide-react';
import type { CardTemplate, DeckDefinition } from '../types/game';
import { CardRenderer } from './CardRenderer';

interface CardInspectModalProps {
  deck: DeckDefinition | null;
  template: CardTemplate | null;
  faceUp: boolean;
  onClose: () => void;
}

export function CardInspectModal({ deck, template, faceUp, onClose }: CardInspectModalProps) {
  if (!template && faceUp) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/85 p-6 backdrop-blur-md"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full max-w-[300px] flex-col items-center"
      >
        <CardRenderer
          deck={deck}
          template={template}
          faceUp={faceUp}
          size="inspect"
          className="shadow-card-lifted"
        />

        {faceUp && template?.rulesText && (
          <div className="mt-4 w-full rounded-2xl border border-white/10 bg-slate-900/90 p-3.5 text-center">
            {template.title && (
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                {template.title}
              </div>
            )}
            <p className="mt-1 text-sm text-slate-200">{template.rulesText}</p>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 flex items-center gap-1.5 rounded-full border border-white/15 bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition active:scale-95 hover:bg-slate-800"
        >
          <X className="h-4 w-4" />
          Close
        </button>
      </div>
    </div>
  );
}
