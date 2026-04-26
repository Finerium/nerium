#!/bin/bash
#
# T-ASSET A3 inline rescue: downsize + copy 96 assets from
# _Reference/ai_generated_assets/ to public/assets/ai/ to bypass
# the suspended Vercel Blob store. Background JPGs to 1920px Q75,
# transparent PNGs to 512px, character spritesheets passthrough
# (frame metadata 512x512 in SPRITESHEET_FRAMES depends on 2048x2048
# source layout; territory-locked scene setScale constants prevent
# downsize without scene edits).
#
# Outputs sips downsize stats plus before/after totals.
#
set -e

SRC=_Reference/ai_generated_assets
DST=public/assets/ai

mkdir -p "$DST"

SPRITESHEETS=(
  "characters/apollo_spritesheet"
  "characters/player_spritesheet"
  "characters/caravan_vendor_spritesheet"
  "characters/synth_vendor_spritesheet"
  "characters/treasurer_spritesheet"
)

is_spritesheet() {
  local stem=$1
  for ss in "${SPRITESHEETS[@]}"; do
    [ "$stem" = "$ss" ] && return 0
  done
  return 1
}

processed=0
skipped=0
total_before=0
total_after=0

# Read manifest entries one by one
while IFS=$'\t' read -r stem ext; do
  src_file="$SRC/$stem.$ext"
  dst_file="$DST/$stem.$ext"
  dst_dir=$(dirname "$dst_file")
  mkdir -p "$dst_dir"

  if [ ! -f "$src_file" ]; then
    echo "MISS  $stem.$ext"
    skipped=$((skipped + 1))
    continue
  fi

  before=$(stat -f %z "$src_file")
  total_before=$((total_before + before))

  if is_spritesheet "$stem"; then
    cp "$src_file" "$dst_file"
    method="copy"
  elif [ "$ext" = "jpg" ]; then
    sips -Z 1920 -s formatOptions 75 "$src_file" --out "$dst_file" >/dev/null 2>&1
    method="jpg1920"
  else
    sips -Z 512 -s format png "$src_file" --out "$dst_file" >/dev/null 2>&1
    method="png512"
  fi

  after=$(stat -f %z "$dst_file")
  total_after=$((total_after + after))
  processed=$((processed + 1))
  printf "[%2d/96] %-7s %4dKB -> %4dKB  %s\n" \
    "$processed" "$method" "$((before/1024))" "$((after/1024))" "$stem.$ext"
done < <(jq -r '.[] | "\(.stem)\t" + (if .contentType == "image/jpeg" then "jpg" else "png" end)' public/asset_manifest.json)

echo ""
echo "==== T-ASSET inline summary ===="
echo "Processed: $processed / 96"
echo "Skipped (missing): $skipped"
printf "Total before: %d KB = %d MB\n" $((total_before/1024)) $((total_before/1024/1024))
printf "Total after:  %d KB = %d MB\n" $((total_after/1024)) $((total_after/1024/1024))
printf "Reduction: %d MB (%.1f%%)\n" \
  $(((total_before-total_after)/1024/1024)) \
  $(echo "scale=1; (1 - $total_after/$total_before) * 100" | bc)
