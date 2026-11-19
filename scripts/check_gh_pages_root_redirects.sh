#!/usr/bin/env bash
# Fails CI if legacy GitHub Pages root files stop being sercanaco.com redirects.
set -euo pipefail

ROOT="${1:-.}"
DC="${ROOT}/dondecomemos.html"
IDX="${ROOT}/index.html"

if [[ ! -f "$DC" ]]; then
  echo "Missing ${DC}"
  exit 1
fi

grep -q 'data-redirect="https://sercanaco.com/restaurantes/"' "$DC" || {
  echo "${DC} must set data-redirect to https://sercanaco.com/restaurantes/"
  exit 1
}

grep -qi 'http-equiv="refresh"' "$DC" || {
  echo "${DC} must include a meta refresh redirect"
  exit 1
}

grep -q 'redirect\.js' "$DC" || {
  echo "${DC} must load redirect.js for location.replace with query/hash"
  exit 1
}

if [[ -f "$IDX" ]]; then
  grep -q 'data-redirect="https://sercanaco.com/"' "$IDX" || {
    echo "${IDX} must redirect to https://sercanaco.com/"
    exit 1
  }
fi

if [[ -f "${ROOT}/sitemap.xml" ]]; then
  echo "Remove root sitemap.xml — canonical sitemap lives under site/ for sercanaco.com"
  exit 1
fi

echo "GitHub Pages root redirect checks passed."