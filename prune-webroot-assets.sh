#!/bin/bash
# Removes the build files of earlier deploys from a webroot's assets folder.
#
#   prune-webroot-assets.sh [--state <dir>] <dist dir> <webroot> [days]
#
# A deploy copies its build over the webroot and removes nothing, so every
# earlier build's hashed files stay there. Run after the copy, this script
# records the file list of the new build and then removes a file only when
# all of these hold:
#   - it is a regular file under <webroot>/assets;
#   - the new build has no file at the same path;
#   - no recorded build that was still live during the last <days> days
#     (default 30) contains it. A build is live until the next deploy, so the
#     build before this one is always kept, however long ago it was deployed;
#   - it was last written more than <days> days ago, which covers files from
#     before the first recorded build.
# A browser tab that is still open on a recently replaced build therefore
# keeps loading its parts.
#
# The file lists live in <state dir>, one per deploy, named by the time of
# the deploy. The default is .webroot-builds/<hash of the webroot path> next
# to this script. Lists that can no longer protect a file are deleted.
set -euo pipefail

usage() {
  echo "usage: prune-webroot-assets.sh [--state <dir>] <dist dir> <webroot> [days]" >&2
  exit 2
}

state_base=""
if [ "${1-}" = "--state" ]; then
  [ "$#" -ge 2 ] || usage
  state_base="$2"
  shift 2
fi
if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  usage
fi

days="${3-30}"
case "$days" in
  '' | *[!0-9]*)
    echo "prune: days must be a whole number" >&2
    exit 2
    ;;
esac
if [ "$days" -lt 7 ]; then
  echo "prune: refusing a window shorter than 7 days" >&2
  exit 2
fi

if [ ! -f "$1/index.html" ] || [ ! -d "$1/assets" ]; then
  echo "prune: $1 is no build (index.html and assets expected)" >&2
  exit 2
fi
if [ ! -f "$2/index.html" ] || [ ! -d "$2/assets" ] || [ -L "$2/assets" ]; then
  echo "prune: $2 is no webroot of this app (index.html and an assets folder expected)" >&2
  exit 2
fi

dist="$(cd "$1" && pwd -P)"
webroot="$(cd "$2" && pwd -P)"
if [ "$webroot" = "/" ] || [ "$webroot" = "$dist" ]; then
  echo "prune: refusing to work on $webroot" >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
if [ -z "$state_base" ]; then
  state_base="$script_dir/.webroot-builds"
fi
state="$state_base/$(printf '%s' "$webroot" | sha256sum | cut -c1-16)"
mkdir -p "$state"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# The new build's files, relative to the build folder, NUL-separated.
(cd "$dist" && find assets -type f -print0) > "$work/current"
current="$(tr -cd '\0' < "$work/current" | wc -c)"
# A build with almost no assets is no reason to empty the webroot.
if [ "$current" -lt 10 ]; then
  echo "prune: the build has only $current asset files; nothing recorded or removed" >&2
  exit 2
fi

now="$(date +%s)"
cutoff=$((now - days * 86400))
cp "$work/current" "$state/$now.list"

# Recorded builds, oldest first. A build protects its files while the deploy
# that replaced it is younger than the window; the newest build always does.
mapfile -t lists < <(find "$state" -maxdepth 1 -type f -name '[0-9]*.list' -printf '%f\n' | sort -n)
declare -A keep=()
for i in "${!lists[@]}"; do
  next=$((i + 1))
  if [ "$next" -lt "${#lists[@]}" ]; then
    replaced_at="${lists[$next]%.list}"
    if [ "$replaced_at" -lt "$cutoff" ]; then
      rm -f -- "$state/${lists[$i]}"
      continue
    fi
  fi
  while IFS= read -r -d '' path; do
    keep["$path"]=1
  done < "$state/${lists[$i]}"
done

# Candidates: regular files in the webroot's assets that are old enough.
if ! find "$webroot/assets" -xdev -type f -mmin +"$((days * 1440))" -print0 > "$work/old"; then
  echo "prune: could not list $webroot/assets; nothing removed" >&2
  exit 1
fi

: > "$work/remove"
removed=0
while IFS= read -r -d '' file; do
  relative="${file#"$webroot"/}"
  if [ -n "${keep[$relative]-}" ]; then
    continue
  fi
  printf '%s\0' "$file" >> "$work/remove"
  removed=$((removed + 1))
done < "$work/old"

if [ "$removed" -gt 0 ]; then
  # The webroot usually belongs to root; the deploy user removes through sudo.
  if [ -w "$webroot/assets" ]; then
    xargs -0 rm -f -- < "$work/remove"
  else
    sudo xargs -0 rm -f -- < "$work/remove"
  fi
fi

echo "prune: removed $removed files from $webroot/assets (window $days days, ${#keep[@]} files protected)"
