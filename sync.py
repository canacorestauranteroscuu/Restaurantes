#!/usr/bin/env python3
"""
Sync script: Notion DB + Google Places API → dondecomemos.html
Pulls active (Pagado) restaurants from Notion, enriches with Google Places data,
and updates the restaurant array in the HTML file.
"""
import os, json, re, sys
import urllib.request, urllib.parse

NOTION_TOKEN = os.environ["NOTION_TOKEN"]
NOTION_DB_ID = os.environ.get("NOTION_DB_ID", "2f03b368f49680c4adefdd8d3a244068")
GOOGLE_API_KEY = os.environ["GOOGLE_API_KEY"]
HTML_FILE = os.environ.get("HTML_FILE", "dondecomemos.html")

# ── Notion API ──────────────────────────────────────────────

def notion_query(db_id, start_cursor=None):
    """Query Notion database for all entries with 'Pagado' status."""
    url = f"https://api.notion.com/v1/databases/{db_id}/query"
    payload = {
        "filter": {
            "property": "Estado",
            "multi_select": {"contains": "Pagado"}
        },
        "page_size": 100
    }
    if start_cursor:
        payload["start_cursor"] = start_cursor

    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
    })
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def get_all_restaurants():
    """Fetch all Pagado restaurants from Notion, handling pagination."""
    results = []
    cursor = None
    while True:
        resp = notion_query(NOTION_DB_ID, cursor)
        results.extend(resp["results"])
        if not resp.get("has_more"):
            break
        cursor = resp.get("next_cursor")
    return results


def extract_notion_data(page):
    """Extract relevant fields from a Notion page object."""
    props = page["properties"]

    def get_title(p):
        t = p.get("title", [])
        return t[0]["plain_text"].strip() if t else ""

    def get_text(p):
        rt = p.get("rich_text", [])
        return rt[0]["plain_text"].strip() if rt else ""

    def get_phone(p):
        return (p.get("phone_number") or "").strip()

    def get_url(p):
        return (p.get("url") or "").strip()

    def get_multi(p):
        return [o["name"] for o in p.get("multi_select", [])]

    def get_number(p):
        return p.get("number") or 1

    name = get_title(props.get("Nombre Restaurante", {}))
    categories = get_multi(props.get("Categoría ", {}))
    phone = get_phone(props.get("Teléfono restaurante", {}))
    whatsapp = get_phone(props.get("WhatsApp Restaurante", {}))
    web = get_url(props.get("Página web (opcional)", {}))
    social = get_url(props.get("Nombre en redes sociales ", {}))
    emoji = get_text(props.get("Emoji", {}))
    place_ids_raw = get_text(props.get("Google Place ID", {}))
    num_locations = get_number(props.get("# de Ubicaciónes", {}))

    # Support comma-separated Place IDs for multi-location restaurants
    place_ids = [pid.strip() for pid in place_ids_raw.split(",") if pid.strip()] if place_ids_raw else []

    return {
        "name": name,
        "categories": categories,
        "phone": phone,
        "whatsapp": whatsapp or None,
        "web": web or None,
        "social": social or None,
        "emoji": emoji or "🍽️",
        "place_ids": place_ids,
        "num_locations": int(num_locations) if num_locations else 1
    }


# ── Google Places API ───────────────────────────────────────

PLACES_FIELDS = "name,formatted_address,formatted_phone_number,rating,user_ratings_total,opening_hours,website,url,geometry"

def fetch_place_details(place_id):
    """Fetch details from Google Places API for a given Place ID."""
    params = urllib.parse.urlencode({
        "place_id": place_id,
        "fields": PLACES_FIELDS,
        "key": GOOGLE_API_KEY,
        "language": "es"
    })
    url = f"https://maps.googleapis.com/maps/api/place/details/json?{params}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        if data.get("status") == "OK":
            return data["result"]
        print(f"  ⚠️  Places API error for {place_id}: {data.get('status')}", file=sys.stderr)
    except Exception as e:
        print(f"  ⚠️  Failed to fetch {place_id}: {e}", file=sys.stderr)
    return None


def parse_hours(place_data):
    """Convert Google Places opening_hours to our JS format."""
    hours = {}
    oh = place_data.get("opening_hours", {})
    periods = oh.get("periods", [])
    weekday_text = oh.get("weekday_text", [])

    day_map = {
        0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday",
        4: "Thursday", 5: "Friday", 6: "Saturday"
    }

    if weekday_text:
        # Parse from weekday_text (e.g., "lunes: 8:00–17:00")
        gday_to_eng = {
            "lunes": "Monday", "martes": "Tuesday", "miércoles": "Wednesday",
            "jueves": "Thursday", "viernes": "Friday", "sábado": "Saturday",
            "domingo": "Sunday"
        }
        for text in weekday_text:
            parts = text.split(":", 1)
            if len(parts) < 2:
                continue
            day_es = parts[0].strip().lower()
            day_en = gday_to_eng.get(day_es)
            if not day_en:
                continue
            time_str = parts[1].strip()
            if "cerrado" in time_str.lower() or "closed" in time_str.lower():
                hours[day_en] = "Cerrado"
            else:
                hours[day_en] = convert_to_12h(time_str)
    elif periods:
        # Build from periods
        open_days = set()
        for period in periods:
            open_info = period.get("open", {})
            close_info = period.get("close", {})
            day_num = open_info.get("day")
            if day_num is None:
                continue
            day_en = day_map[day_num]
            open_days.add(day_num)
            open_time = format_time(open_info.get("time", ""))
            close_time = format_time(close_info.get("time", "")) if close_info else ""
            if open_time and close_time:
                hours[day_en] = f"{open_time} – {close_time}"
        for d in range(7):
            if d not in open_days:
                hours[day_map[d]] = "Cerrado"

    return hours


def convert_to_12h(time_range_str):
    """Convert '8:00–17:00' to '8:00 AM – 5:00 PM'."""
    def to12(t):
        t = t.strip().replace("\u2013", "-").replace("–", "-")
        match = re.match(r"(\d{1,2}):(\d{2})", t)
        if not match:
            return t
        h, m = int(match.group(1)), match.group(2)
        if h == 0:
            return f"12:{m} AM"
        elif h < 12:
            return f"{h}:{m} AM"
        elif h == 12:
            return f"12:{m} PM"
        else:
            return f"{h-12}:{m} PM"

    # Handle ranges like "8:00–17:00" or "8:00 a 17:00"
    for sep in ["–", "-", "\u2013", " a "]:
        if sep in time_range_str:
            parts = time_range_str.split(sep)
            if len(parts) == 2:
                return f"{to12(parts[0])} – {to12(parts[1])}"
    return time_range_str


def format_time(time_str):
    """Convert '0800' to '8:00 AM'."""
    if not time_str or len(time_str) < 4:
        return ""
    h = int(time_str[:2])
    m = time_str[2:]
    if h == 0:
        return f"12:{m} AM"
    elif h < 12:
        return f"{h}:{m} AM"
    elif h == 12:
        return f"12:{m} PM"
    else:
        return f"{h-12}:{m} PM"


# ── Build restaurant entries ────────────────────────────────

def build_location(place_data):
    """Build a single location object from Google Places data."""
    addr = place_data.get("formatted_address", "").replace(", Mexico", "").replace(", México", "").strip() or None
    return {
        "address": addr,
        "phone": place_data.get("formatted_phone_number") or None,
        "rating": place_data.get("rating"),
        "mapsUrl": place_data.get("url") or None,
        "hours": parse_hours(place_data),
        "website": place_data.get("website") or None
    }


def build_restaurant_entry(notion_data, locations):
    """Combine Notion + Google Places data into one restaurant JS object.
    locations is a list of location dicts from build_location()."""
    primary = locations[0] if locations else {}

    entry = {
        "name": notion_data["name"],
        "emoji": notion_data["emoji"],
        "categories": notion_data["categories"],
        "phone": primary.get("phone") or notion_data["phone"] or None,
        "whatsapp": notion_data["whatsapp"],
        "web": notion_data["web"],
        "social": notion_data["social"],
        "mapsUrl": primary.get("mapsUrl"),
        "address": primary.get("address"),
        "rating": primary.get("rating"),
        "hours": primary.get("hours", {}),
        "locations": locations if len(locations) > 1 else []
    }

    # Use Google website if Notion doesn't have one
    if not entry["web"] and primary.get("website"):
        entry["web"] = primary["website"]

    return entry


def js_val(v):
    """Convert a Python value to a JS literal string."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, list) and v and isinstance(v[0], dict):
        # Array of objects (locations)
        items = ", ".join(location_to_js(loc) for loc in v)
        return f"[{items}]"
    if isinstance(v, list):
        items = ", ".join(f'"{i}"' for i in v)
        return f"[{items}]"
    if isinstance(v, dict):
        if not v:
            return "{}"
        items = ", ".join(f'{k}:"{val}"' for k, val in v.items() if val)
        return f"{{ {items} }}"
    # Escape quotes in strings
    s = str(v).replace('"', '\\"')
    return f'"{s}"'


def location_to_js(loc):
    """Convert a location dict to a JS object string (inline)."""
    h = loc.get("hours", {})
    if h:
        h_str = ", ".join(f'{k}:"{v}"' for k, v in h.items() if v)
        hours_js = f"{{ {h_str} }}"
    else:
        hours_js = "{}"
    return (f'{{ address:{js_val(loc.get("address"))}, phone:{js_val(loc.get("phone"))}, '
            f'rating:{js_val(loc.get("rating"))}, mapsUrl:{js_val(loc.get("mapsUrl"))}, '
            f'hours:{hours_js} }}')


def entry_to_js(entry):
    """Convert a restaurant dict to a JS object string."""
    lines = []
    lines.append("  {")
    lines.append(f'    name: {js_val(entry["name"])},')
    lines.append(f'    emoji: {js_val(entry["emoji"])},')
    lines.append(f'    categories: {js_val(entry["categories"])},')
    lines.append(f'    phone: {js_val(entry["phone"])},')
    lines.append(f'    whatsapp: {js_val(entry["whatsapp"])},')
    lines.append(f'    web: {js_val(entry["web"])},')
    lines.append(f'    social: {js_val(entry["social"])},')
    lines.append(f'    mapsUrl: {js_val(entry["mapsUrl"])},')
    lines.append(f'    address: {js_val(entry["address"])},')
    lines.append(f'    rating: {js_val(entry["rating"])},')

    # Hours as object
    if entry["hours"]:
        h_items = ", ".join(f'{day}:"{time}"' for day, time in entry["hours"].items())
        lines.append(f'    hours: {{ {h_items} }},')
    else:
        lines.append(f'    hours: {{}},')

    # Locations array (multi-location only)
    if entry["locations"]:
        lines.append(f'    locations: {js_val(entry["locations"])}')
    else:
        lines.append(f'    locations: []')

    lines.append("  }")
    return "\n".join(lines)


# ── Main ────────────────────────────────────────────────────

def main():
    print("🔄 Fetching restaurants from Notion...")
    pages = get_all_restaurants()
    print(f"   Found {len(pages)} restaurants with 'Pagado' status")

    all_entries = []

    for page in pages:
        notion_data = extract_notion_data(page)
        if not notion_data["name"]:
            continue

        print(f"\n📍 {notion_data['name']}")

        if notion_data["place_ids"]:
            locations = []
            for pid in notion_data["place_ids"]:
                print(f"   Fetching Google Places: {pid}")
                place_data = fetch_place_details(pid)
                if place_data:
                    locations.append(build_location(place_data))
            entry = build_restaurant_entry(notion_data, locations)
            all_entries.append(entry)
        else:
            print("   ⚠️  No Google Place ID — using Notion data only")
            entry = build_restaurant_entry(notion_data, [])
            all_entries.append(entry)

    # Generate JS array
    js_entries = ",\n".join(entry_to_js(e) for e in all_entries)
    js_array = f"const restaurants = [\n{js_entries}\n].sort((a,b) => a.name.localeCompare(b.name, 'es'));"

    # Update HTML file
    print(f"\n📝 Updating {HTML_FILE}...")
    with open(HTML_FILE, "r", encoding="utf-8") as f:
        html = f.read()

    # Replace the restaurants array (from 'const restaurants = [' to '].sort(...);')
    pattern = r'const restaurants = \[.*?\]\.sort\(\(a,b\) => a\.name\.localeCompare\(b\.name, \'es\'\)\);'
    new_html = re.sub(pattern, js_array, html, flags=re.DOTALL)

    if new_html == html:
        # Check if the pattern exists at all (real error) vs data just hasn't changed
        if not re.search(r'const restaurants = \[', html):
            print("⚠️  Pattern not found in HTML — file structure may have changed!")
            sys.exit(1)
        print("ℹ️  No changes — restaurant data is already up to date.")
        sys.exit(0)

    with open(HTML_FILE, "w", encoding="utf-8") as f:
        f.write(new_html)

    print(f"\n✅ Done! Updated {len(all_entries)} restaurant entries in {HTML_FILE}")


if __name__ == "__main__":
    main()
