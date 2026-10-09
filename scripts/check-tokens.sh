#!/bin/sh
# UI tokens check: fails on one-off colours and pixel sizes in components.
#
# src/index.css is the tokens file: it defines the colour variables (--background, --foreground,
# --muted) and is the only place a hex colour may appear. Components use those variables.
cd "$(dirname "$0")/.." || exit 2
status=0

report() {
  echo "✘ $1"
  echo "$2" | sed 's/^/    /'
  status=1
}

# src/site-blocks is the website's own code, copied (D-030); the website's tokens check covers it.
hex=$(grep -rnE '#[0-9a-fA-F]{3,8}\b' src --exclude=index.css --exclude-dir=site-blocks)
[ -n "$hex" ] && report "hex colour outside src/index.css (use a CSS variable)" "$hex"

px=$(grep -rnE '[^a-zA-Z0-9_-][0-9.]+px\b|-\[-?[0-9.]+px\]' src --include='*.tsx' --include='*.ts' --exclude-dir=site-blocks)
[ -n "$px" ] && report "raw pixel value in a component (use a token or rem in the stylesheet)" "$px"

[ "$status" -eq 0 ] && echo "✔ tokens: no one-off colours or pixel values"
exit "$status"
