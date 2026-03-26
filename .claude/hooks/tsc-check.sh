#!/usr/bin/env bash
# Post-tool-use hook: runs tsc --noEmit after editing TypeScript files.
# Feeds errors back to Claude via additionalContext.

set -euo pipefail

FILE=$(jq -r '.tool_input.file_path // empty')

# Only process TypeScript files
[[ -n "$FILE" ]] || exit 0
echo "$FILE" | grep -qE '\.tsx?$' || exit 0

# Walk up to find the nearest package tsconfig.json
DIR=$(dirname "$FILE")
while [[ "$DIR" != "/" ]] && [[ ! -f "$DIR/tsconfig.json" ]]; do
  DIR=$(dirname "$DIR")
done
[[ -f "$DIR/tsconfig.json" ]] || exit 0

TSC="/Users/amirreza.alibeigi/Documents/GitHub/Vasp/node_modules/.bin/tsc"

OUTPUT=$(cd "$DIR" && "$TSC" --noEmit 2>&1) && exit 0

# Errors found — inject context back into Claude
BASENAME=$(basename "$FILE")
printf '%s' "TypeScript errors found after editing $BASENAME:

$OUTPUT

Please review and fix all TypeScript type errors in the affected files." \
  | jq -Rs '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:.}}'
