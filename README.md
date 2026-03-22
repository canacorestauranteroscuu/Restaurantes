# Restaurantes CANACO Chihuahua — Donde Comemos

Public directory of restaurants in the Sección Restauranteros CANACO Chihuahua.

**Live site:** [canacorestauranteroscuu.github.io/Restaurantes/dondecomemos.html](https://canacorestauranteroscuu.github.io/Restaurantes/dondecomemos.html)

## How it works

The directory auto-syncs daily from two sources:

1. **Notion** — Directorio de Empresas (2026) database. Controls which restaurants appear (must have "Pagado" status), plus emoji and categories.
2. **Google Places API** — Pulls live business data: hours, address, rating, phone, website, Google Maps link.

A GitHub Action runs `sync.py` daily at 6 AM (Chihuahua time), merges both sources, and updates the site.

## Setup

Three secrets are required in the repo settings (Settings → Secrets → Actions):

| Secret | Description |
|--------|-------------|
| `NOTION_TOKEN` | Notion internal integration token |
| `GOOGLE_API_KEY` | Google Cloud API key with Places API enabled |
| `NOTION_DB_ID` | Notion database ID (default: `2f03b368f49680c4adefdd8d3a244068`) |

## Adding a new restaurant

1. Add the restaurant to the Notion database
2. Set status to "Pagado"
3. Add the Google Place ID (find it via [Google Maps](https://www.google.com/maps))
4. Add an emoji
5. The next daily sync (or manual trigger) updates the site

## Multi-location restaurants

Put comma-separated Place IDs in the "Google Place ID" field:
```
ChIJr9wn5TtD6oYR-mtNxo-v9p4, ChIJAaAxRzVD6oYR3XKBTQDTNDc
```
Each Place ID generates its own card with the same restaurant branding.

## Manual sync

Go to Actions → "Sync Restaurant Directory" → "Run workflow" to trigger an immediate sync.
