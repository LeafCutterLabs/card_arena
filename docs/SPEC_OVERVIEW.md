# Project Specification: Sandbox Card Table (Mobile-First)

## 1. Core Concept
A rules-agnostic, real-time multiplayer card game sandbox designed for rapid game prototyping and playtesting on mobile phones. The system enforces **no game rules**—it provides synchronized state for card locations, orientations (face-up/face-down), stacking order, and ownership, allowing players to enforce rules socially.

## 2. Tech Stack & Deployment
- **Frontend:** React 18+ (Vite), TypeScript, Tailwind CSS
- **Animations & Touch Gestures:** `framer-motion` (for smooth drag-and-drop and hand reordering)
- **Multiplayer State Sync:** PartyKit (WebSockets with room-based state persistence)
- **Frontend Hosting:** Netlify (auto-deployed from GitHub)
- **Asset Delivery:** Static `/public/decks/` directory bundled with the repo (supports easy drag-and-drop addition of new deck folders)

## 3. Repository Structure
```text
/
├── public/
│   └── decks/
│       ├── manifest.json         # Registry of available packaged decks
│       ├── standard-52/          # Example deck package
│       │   ├── deck.json         # Card definitions and counts
│       │   └── assets/           # Layered card graphics
│       └── prototype-alpha/      # Custom prototype deck
├── party/
│   └── gameRoom.ts               # PartyKit WebSocket server & authoritative room state
├── src/
│   ├── components/
│   │   ├── CardRenderer.tsx      # Composites background + back + dynamic text layers
│   │   ├── HandView.tsx          # Private player hand (drag-to-reorder + quick actions)
│   │   └── TableCanvas.tsx       # Shared free-form 2D play area
│   ├── types/
│   │   └── game.ts               # Shared TypeScript interfaces
│   └── App.tsx                   # Lobby, room joiner, and view switcher
└── netlify.toml                  # Build settings for Netlify
```

## 4. Key User Flows
1. **Lobby:** Enter display name -> `Create Room` (generates 4-letter code) or `Join Room` (enter 4-letter code).
2. **Deck Selection (Host):** Choose any deck listed in `/public/decks/manifest.json`, optionally deal N cards to all connected players, and start.
3. **Top Navigation Bar (Persistent):** Displays Room Code, View Toggle (`My Hand` vs. `Table`), Undo Last Action button, and Room Menu (`Reset Board`, `Recall All to Deck`, `Shuffle Deck`).
4. **My Hand View (Private):**
   - Horizontal scrollable/reorderable row of cards owned by the current player.
   - Local drag-and-drop reordering (persisted in `localStorage` per room so network bandwidth isn't wasted).
   - Tap a card to open quick-action overlay: `Play Face Up`, `Play Face Down`, `Zoom/Inspect`, or `Pass to [Player]`.
5. **Table View (Shared Free-Form Canvas):**
   - Full-bleed touch-friendly 2D board normalized to a `1000 x 1000` virtual coordinate space (scales cleanly across all phone aspect ratios).
   - Players can drag any card or stack freely across the canvas (`x`, `y`, `zIndex`).
   - Tap a card/stack to flip (`faceUp` toggle) or open stack actions (`Draw 1 to Hand`, `Shuffle Stack`, `Flip Top`, `Take Stack`).
   - Player avatars/badges docked along the top edge showing card counts; dragging a table card onto a player badge deals/passes it to their hand.
