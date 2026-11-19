# Restaurantes CANACO Chihuahua — sercanaco.com (fase 1)

Directorio público y **Ruleta del Sabor** de la Sección Restauranteros CANACO Chihuahua.

| Entorno | URL |
|--------|-----|
| GitHub Pages (legacy, sigue activo hasta el corte) | [canacorestauranteroscuu.github.io/Restaurantes/dondecomemos.html](https://canacorestauranteroscuu.github.io/Restaurantes/dondecomemos.html) |
| Cloudflare Pages (nuevo sitio, fase 1) | `https://sercanaco.com` — raíz del directorio `site/` |

## Cloudflare Pages

| Ajuste | Valor |
|--------|--------|
| **Build command** | *(ninguno — sitio estático)* |
| **Build output directory** | `site` |
| **Root directory** | `/` (raíz del repositorio) |

No hace falta instalar dependencias para desplegar. El workflow de GitHub Actions solo actualiza datos; Cloudflare puede usar deploy al hacer push.

Archivos de borde en `site/`:

- `_redirects` — 301 desde rutas legacy (`/dondecomemos.html`, páginas antiguas de GitHub Pages)
- `_headers` — cabeceras de seguridad básicas
- `sitemap.xml` / `robots.txt` — canónicos en `https://sercanaco.com`

## Cómo funciona la sincronización

1. **Notion** — base «Directorio de Empresas». Solo entradas con estado «Pagado».
2. **Google Places API** — horarios, dirección, calificación, etc. (con caché en `places_cache.json`).

El Action `Sync Restaurant Directory` ejecuta `sync.py` y actualiza:

- `dondecomemos.html` (GitHub Pages, ruta histórica)
- `site/assets/restaurants-data.js` (sitio nuevo)

Secretos en el repositorio (solo nombres): `NOTION_TOKEN`, `GOOGLE_API_KEY`, `NOTION_DB_ID`.

## Desarrollo local

Sirve el directorio `site/` con cualquier servidor estático, por ejemplo:

```bash
python3 -m http.server 8787 --directory site
```

Abre `http://localhost:8787/` para probar la Ruleta y las rutas públicas. La raíz del repositorio no es el preview de Cloudflare; `dondecomemos.html` en la raíz se prueba abriéndolo por su ruta en GitHub Pages o sirviendo el repo desde la raíz si lo necesitas.

## Estructura

```
site/                 # Output de Cloudflare Pages
  index.html          # Ruleta (/)
  restaurantes/
  restauranteros/     # La Sección, únete, renovar, FAQ, contacto
  aviso-de-privacidad/
  terminos/
  404.html
dondecomemos.html     # Legacy GitHub Pages (se mantiene)
sync.py               # Sincronización Notion + Places
places_cache.json
```

## Agregar un restaurante

Igual que antes: alta en Notion, estado «Pagado», Google Place ID y emoji. El siguiente sync actualiza ambos destinos de datos.

### Sincronización manual o por evento

Ver `.github/workflows/sync.yml` — cron diario y `workflow_dispatch`. Opcional: `repository_dispatch` con `sync-restaurants`.

## Multi-sucursal

Place IDs separados por comas en Notion, como antes.