#!/usr/bin/env bash
# Stop hook: comprehensive project health checks + fullstack E2E tests
# Runs: build, TSC type check, Handlebars template validation, JSON validation,
#       Prettier format, Knip dead code detection, and (when Docker is available)
#       the fullstack E2E test suite which is fed back to Claude.

# Resolve repo root relative to this script's location so the hook works on
# any machine regardless of the local checkout path.
VASP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
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

# --- 6. Fullstack E2E tests (runs when Docker is available) ---
# Results are included in the hook output so Claude can read all errors from:
#   generation, server startup, REST API, and browser interactions.
if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  e2e_output=$(cd "$VASP_ROOT" && bun run test:e2e:fullstack 2>&1)
  e2e_status=$?

  if [[ $e2e_status -ne 0 ]]; then
    ERRORS+="### Fullstack E2E tests failed (exit ${e2e_status}):
$e2e_output

"
  else
    # Include the summary lines so Claude knows tests passed and how many ran
    e2e_summary=$(printf '%s\n' "$e2e_output" | grep -E '(passed|failed|skipped|flaky|error|✓|✗|×)' | tail -10) || true
    if [[ -n "$e2e_summary" ]]; then
      WARNINGS+="### Fullstack E2E tests passed:
$e2e_summary

"
    fi
  fi
else
  WARNINGS+="### Fullstack E2E tests skipped (Docker not available).

"
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
