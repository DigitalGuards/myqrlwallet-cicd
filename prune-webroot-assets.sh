#!/bin/bash
# Removes the build files of earlier deploys from a webroot's assets folder.
#
#   prune-webroot-assets.sh <dist dir> <webroot> [days]
#
# A deploy copies its build over the webroot and removes nothing, so every
# earlier build's hashed files stay there. This script removes a file only
# when all of these hold: it is a regular file under <webroot>/assets, the new
# build has no file at the same path, and it was last written more than
# <days> days ago (default 30). The files of recent deploys stay, so a browser
# tab that is still open on an earlier build keeps loading its parts.
#
# PRUNE_SUDO is the command that runs the removal (default: sudo); the tests
# set it to an empty string.
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "usage: prune-webroot-assets.sh <dist dir> <webroot> [days]" >&2
  exit 2
fi

days="${3-30}"
case "$days" in
  '' | *[!0-9]*)
    echo "prune: days must be a whole number" >&2
    exit 2
    ;;
esac
if [ "$days" -lt 7 ]; then
  echo "prune: refusing to remove files newer than 7 days" >&2
  exit 2
fi

if [ ! -f "$1/index.html" ] || [ ! -d "$1/assets" ]; then
  echo "prune: $1 is no build (index.html and assets expected)" >&2
  exit 2
fi
if [ ! -f "$2/index.html" ] || [ ! -d "$2/assets" ]; then
  echo "prune: $2 is no webroot of this app (index.html and assets expected)" >&2
  exit 2
fi

dist="$(cd "$1" && pwd -P)"
webroot="$(cd "$2" && pwd -P)"
if [ "$webroot" = "/" ] || [ "$webroot" = "$dist" ]; then
  echo "prune: refusing to work on $webroot" >&2
  exit 2
fi

# A build with almost no assets is no reason to empty the webroot.
current="$(find "$dist/assets" -type f | wc -l)"
if [ "$current" -lt 10 ]; then
  echo "prune: the build has only $current asset files; nothing removed" >&2
  exit 2
fi

sudo_command="${PRUNE_SUDO-sudo}"
removed=0
while IFS= read -r -d '' file; do
  relative="${file#"$webroot"/}"
  if [ -e "$dist/$relative" ]; then
    continue
  fi
  $sudo_command rm -f -- "$file"
  removed=$((removed + 1))
done < <(find "$webroot/assets" -xdev -type f -mtime +"$days" -print0)

echo "prune: removed $removed files older than $days days from $webroot/assets"
