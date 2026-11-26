# Packaged Deck & Artwork Conventions

## 1. Image Specifications
- **Aspect Ratio:** `5:7` (Standard Poker/Bridge card proportion).
- **Resolution:** `750 x 1050 px` (300 DPI equivalent at mobile retina scale; crisp when zoomed, lightweight over cellular).
- **Format:** `.webp` (preferred for fast mobile loading with alpha transparency) or `.png`.
- **Target File Size:** `< 150 KB` per image.
- **Corner Radius & Safe Zone:**
  - Leave artwork square-cornered (`0px` radius); CSS applies `rounded-xl` (`12px` radius) and card borders automatically.
  - Keep critical artwork inside a `60px` outer margin (`630 x 930 px` safe area) so corner index badges do not obscure focal art.

## 2. Layered Card Architecture
Instead of exporting 52–100+ individual flattened images per prototype, cards are rendered by compositing up to **4 distinct layers**:

1. **Layer 0 (Card Back):** `back.webp` — Displayed whenever `faceUp === false`.
2. **Layer 1 (Base Background):** `bg_<name>.webp` — Full-bleed card frame/background (e.g., `bg_red.webp`, `bg_wood.webp`, `bg_action.webp`).
3. **Layer 2 (Optional Center Art/Icon):** `art_<name>.webp` — Transparent PNG/WebP overlay centered on the card (e.g., suit icon, character illustration, or symbol).
4. **Layer 3 (Dynamic Typography):** Rendered via HTML/CSS on top of the image layers using values from `deck.json`:
   - `cornerValue`: Top-left and bottom-right (rotated 180°) short string (e.g., `"A"`, `"10"`, `"+2"`, `"★"`).
   - `title`: Center banner text (e.g., `"SKIP"`, `"FIREBALL"`).
   - `rulesText`: Bottom box description text for prototype ability cards.
   - `textColor`: Hex color code (e.g., `"#FFFFFF"` or `"#1A1A1A"`) to ensure contrast against the chosen `bg_` image.

## 3. Directory & File Naming Structure
Every packaged deck lives in `/public/decks/<deck-id>/`:

```text
/public/decks/my-custom-deck/
├── deck.json
└── assets/
    ├── back.webp              # Required: Shared back graphic for the deck
    ├── bg_default.webp        # Required: Default card front background
    ├── bg_special.webp        # Optional: Variant background
    └── art_dragon.webp        # Optional: Transparent foreground illustration
```

## 4. `manifest.json` & `deck.json` Schemas

### `/public/decks/manifest.json`
```json
{
  "decks": [
    {
      "id": "standard-52",
      "name": "Standard 52 Playing Cards",
      "description": "Classic poker deck for testing traditional games."
    },
    {
      "id": "my-custom-deck",
      "name": "Prototype v1",
      "description": "Custom 40-card test deck."
    }
  ]
}
```

### `/public/decks/<deck-id>/deck.json`
```json
{
  "id": "my-custom-deck",
  "name": "Prototype v1",
  "cardBack": "assets/back.webp",
  "defaultTextColor": "#111827",
  "cards": [
    {
      "templateId": "fire-3",
      "count": 4,
      "background": "assets/bg_red.webp",
      "foregroundArt": "assets/art_flame.webp",
      "cornerValue": "3",
      "title": "EMBER",
      "rulesText": "Draw 1 card when played.",
      "textColor": "#FFFFFF"
    },
    {
      "templateId": "wild-skip",
      "count": 2,
      "background": "assets/bg_special.webp",
      "cornerValue": "⊘",
      "title": "BLOCK",
      "rulesText": ""
    }
  ]
}
```
*Note: During game initialization, the engine expands each entry by its `count` property into unique runtime card instances (`instanceId`).*
