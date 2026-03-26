#!/usr/bin/env bash
# Stop hook: comprehensive project health checks
# Runs: build, TSC type check, Handlebars template validation, JSON validation, Prettier format, Knip dead code

VASP_ROOT="/Users/amirreza.alibeigi/Documents/GitHub/Vasp"
TSC="$VASP_ROOT/node_modules/.bin/tsc"
PRETTIER="$VASP_ROOT/node_modules/.bin/prettier"
KNIP="$VASP_ROOT/node_modules/.bin/knip"
HBS_BIN="$VASP_ROOT/packages/generator/node_modules/.bin/handlebars"
HBS_NODE="$VASP_ROOT/packages/generator/node_modules/handlebars"

ERRORS=""
WARNINGS=""

# --- 0. Build all packages (ensures dist is up to date before checking) ---
build_output=$(cd "$VASP_ROOT" && bun run build 2>&1) || {
  ERRORS+="### Build failed:
$build_output

"
}

# --- 1. TypeScript type checking ---
for dir in "$VASP_ROOT"/packages/*/; do
  if [[ -f "$dir/tsconfig.json" ]]; then
    pkg=$(basename "$dir")
    output=$(cd "$dir" && "$TSC" --noEmit 2>&1) || {
      ERRORS+="### TypeScript errors in $pkg:
$output

"
    }
  fi
done

# --- 2. Handlebars template validation ---
while IFS= read -r hbs_file; do
  rel="${hbs_file#$VASP_ROOT/}"
  output=$(node --input-type=module <<EOF 2>&1
import { readFileSync } from 'fs';
import Handlebars from '${HBS_NODE}/dist/cjs/handlebars.js';
try {
  Handlebars.precompile(readFileSync('${hbs_file}', 'utf8'));
} catch(e) {
  process.stderr.write(e.message + '\n');
  process.exit(1);
}
EOF
) || {
    ERRORS+="### Handlebars syntax error in $rel:
$output

"
  }
done < <(find "$VASP_ROOT/packages" -name "*.hbs" -not -path "*/node_modules/*")

# --- 3. JSON structural validation ---
while IFS= read -r json_file; do
  rel="${json_file#$VASP_ROOT/}"
  if ! jq . "$json_file" >/dev/null 2>&1; then
    err=$(jq . "$json_file" 2>&1)
    ERRORS+="### Invalid JSON in $rel:
$err

"
  fi
done < <(find "$VASP_ROOT" \
  -name "*.json" \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -name "*.snap")

# --- 4. Prettier auto-format ---
if [[ -x "$PRETTIER" ]]; then
  formatted=$(cd "$VASP_ROOT" && "$PRETTIER" --write \
    "packages/*/src/**/*.ts" \
    2>&1)
  # Report files that were changed (not "unchanged")
  changed=$(printf '%s\n' "$formatted" | grep -v "unchanged" | grep -v "^$") || true
  if [[ -n "$changed" ]]; then
    WARNINGS+="### Prettier reformatted:
$changed

"
  fi
fi

# --- 5. Knip dead code detection ---
if [[ -x "$KNIP" ]]; then
  knip_out=$(cd "$VASP_ROOT" && "$KNIP" --no-progress 2>&1) || {
    # Only report if there's actual output (knip exits non-zero when issues found)
    if [[ -n "$knip_out" ]]; then
      WARNINGS+="### Knip dead code:
$knip_out

"
    fi
  }
fi

# --- Output ---
NL=$'\n'
if [[ -n "$ERRORS" ]]; then
  FULL="Project health checks found errors — please fix before finishing:${NL}${NL}${ERRORS}"
  [[ -n "$WARNINGS" ]] && FULL+="Additional info:${NL}${WARNINGS}"
  printf '%s' "$FULL" | jq -Rs '{decision:"block",reason:.}'
elif [[ -n "$WARNINGS" ]]; then
  printf '%s' "Stop hook info:${NL}${NL}${WARNINGS}" \
    | jq -Rs '{stopReason:.}'
fi
