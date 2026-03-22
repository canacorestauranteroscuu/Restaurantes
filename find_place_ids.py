#!/usr/bin/env python3
"""One-time utility: Find Google Place IDs for restaurants by name + city."""
import os, json, urllib.request, urllib.parse

GOOGLE_API_KEY = os.environ["GOOGLE_API_KEY"]

restaurants = [
    "Woko Loco Chihuahua restaurante",
    "Betty Cooker Comida Casera Chihuahua",
    "Mamá Carola Chihuahua restaurante",
    "Naranja y Limón Chihuahua restaurante",
    "Las Brasas Parrilla Mexicana Chihuahua",
    "Mariscos La Iguana Chihuahua",
    "El Hojaldre Chihuahua panaderia",
    "Sorrento Chihuahua restaurante Pedro Zuloaga",
    "Pastelería Dulce Noviembre Chihuahua",
]

def find_place(query):
    params = urllib.parse.urlencode({
        "input": query,
        "inputtype": "textquery",
        "fields": "place_id,name,formatted_address",
        "locationbias": "circle:50000@28.6353,-106.0889",
        "key": GOOGLE_API_KEY
    })
    url = f"https://maps.googleapis.com/maps/api/place/findplacefromtext/json?{params}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())

for r in restaurants:
    print(f"\n🔍 Searching: {r}")
    try:
        result = find_place(r)
        candidates = result.get("candidates", [])
        if candidates:
            for c in candidates:
                print(f"   ✅ {c['name']}")
                print(f"      Place ID: {c['place_id']}")
                print(f"      Address: {c.get('formatted_address', 'N/A')}")
        else:
            print(f"   ❌ No results found (status: {result.get('status')})")
    except Exception as e:
        print(f"   ❌ Error: {e}")
