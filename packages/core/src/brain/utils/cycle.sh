#!/bin/sh
# One run: place the seeker by camera at plan x y (first leg heading, 180 backs off a contact), then seek.
# Skips the seek when the placement did not end over 50 cm apart. Prints the result, the camera track, the collisions.
#   BRIDGE_HOST=192.168.5.2 sh packages/core/src/brain/utils/cycle.sh 245 438 180 [--move]
# usage: cycle.sh x y [first]  -- place the seeker, then seek; prints summary
P=$(timeout 200 npx tsx packages/core/src/brain/place.mjs SB-9129 $1 $2 ${3:-0} 2>&1 | grep -E "apart|ERROR" | tail -1); echo "$P"; D=$(echo "$P" | sed -nE "s/^apart ([0-9]+).*/\1/p"); [ "${D:-0}" -gt 50 ] || { echo "placement failed"; exit 1; }
sleep 2
timeout 150 npx tsx packages/core/src/brain/seek.mjs SB-9129 $4 2>&1 | grep -v "^    at" | grep -vE "ladder|camera off" | tail -5
T=$(ls -t frames/*trace* | head -1)
grep -E "cam" $T | awk 'NR%3==0' | sed -E 's/ to sender / d/;s/  cam //;s/ cm//' | paste -d'|' - - - - - - | tail -5
grep collision $T | grep -v "SB-9129.*y 2[01]$" | tail -3
