# Restaurantes CANACO Chihuahua — Donde Comemos

Public directory of restaurants in the Sección Restauranteros CANACO Chihuahua.

**Live site:** [canacorestauranteroscuu.github.io/Restaurantes/dondecomemos.html](https://canacorestauranteroscuu.github.io/Restaurantes/dondecomemos.html)

## How it works

The directory auto-syncs daily from two sources:

1. **Notion** — Directorio de Empresas (2026) database. Controls which restaurants appear (must have "Pagado" status), plus emoji and categories.
2. **Google Places API** — Pulls live business data: hours, address, rating, phone, website, Google Maps link.

A GitHub Action runs `sync.py` daily at 6 AM (Chihuahua time). It always reads **Notion** (who is listed, emoji, categories). **Google Places** is called only for Place IDs that are not yet in `places_cache.json`, so routine syncs do not re-bill every restaurant.

You can also trigger a sync immediately via `repository_dispatch` (event type `sync-restaurants`) when a new restaurantero is added—see below.

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
5. The next sync updates the site. Only that restaurant’s Place ID triggers a Google Places API call (unless you force a full refresh).

### Event-driven sync (optional)

To run the workflow when Notion changes (instead of waiting for the daily job), send a GitHub `repository_dispatch` from any webhook-capable tool (Notion automation, Zapier, etc.):

1. Create a fine-grained or classic PAT with `contents: read` on this repo and permission to trigger workflows.
2. POST to `https://api.github.com/repos/canacorestauranteroscuu/restaurantes/dispatches` with body `{"event_type":"sync-restaurants","client_payload":{}}` and header `Authorization: Bearer <PAT>`.

No Places calls are made if the new row reuses Place IDs already in `places_cache.json`.

## Multi-location restaurants

Put comma-separated Place IDs in the "Google Place ID" field:
```
ChIJr9wn5TtD6oYR-mtNxo-v9p4, ChIJAaAxRzVD6oYR3XKBTQDTNDc
```
Each Place ID generates its own card with the same restaurant branding.

## Manual sync

Go to Actions → "Sync Restaurant Directory" → "Run workflow" to trigger an immediate sync.

Enable **“Refrescar todos los datos de Google Places”** only when you want to re-fetch hours, ratings, and phones for every restaurant (~one Places Details call per Place ID). Normal runs leave this unchecked.
