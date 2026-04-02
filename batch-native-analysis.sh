#!/usr/bin/env bash
# batch-native-analysis.sh — Analyze all unanalyzed sessions via `claude -p`.
#
# Uses `code-insights insights <id> --native --force` for each session.
# Stops immediately on rate limit (429) errors to avoid wasting API calls.
# Resume-safe: re-run anytime — already-analyzed sessions are skipped.
#
# Usage:
#   ./batch-native-analysis.sh              # Run all unanalyzed sessions
#   ./batch-native-analysis.sh --dry-run    # List sessions without running
#   ./batch-native-analysis.sh --delay 10   # Custom delay between calls (default: 5s)
#   ./batch-native-analysis.sh --min-msgs 5 # Min message count filter (default: 3)
#   ./batch-native-analysis.sh --retry-failed  # Re-run only previously failed sessions
#   ./batch-native-analysis.sh --model opus    # Use a specific model (default: sonnet)

set -euo pipefail

DB_PATH="${CODE_INSIGHTS_DB:-$HOME/.code-insights/data.db}"
FAILED_LOG="batch-native-failures.log"
DRY_RUN=false
DELAY_BETWEEN=5
MIN_MESSAGES=3
RETRY_FAILED=false
MODEL="sonnet"

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --delay) DELAY_BETWEEN="$2"; shift 2 ;;
    --min-msgs) MIN_MESSAGES="$2"; shift 2 ;;
    --retry-failed) RETRY_FAILED=true; shift ;;
    --model) MODEL="$2"; shift 2 ;;
    --help|-h)
      head -14 "$0" | tail -9
      exit 0
      ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

# ── Prerequisites ─────────────────────────────────────────────────────────────

if ! command -v sqlite3 &>/dev/null; then
  echo "Error: sqlite3 not found"
  exit 1
fi

if ! command -v claude &>/dev/null; then
  echo "Error: claude CLI not found in PATH"
  echo "Install from: https://claude.ai/download"
  exit 1
fi

if ! command -v code-insights &>/dev/null; then
  echo "Error: code-insights CLI not found in PATH"
  echo "Run: cd cli && pnpm build && npm link"
  exit 1
fi

if [ ! -f "$DB_PATH" ]; then
  echo "Error: Database not found at $DB_PATH"
  exit 1
fi

# ── Build session list ────────────────────────────────────────────────────────

if [ "$RETRY_FAILED" = true ] && [ -f "$FAILED_LOG" ]; then
  # Re-run only previously failed sessions
  SESSION_IDS=$(cat "$FAILED_LOG" | sort -u)
  SOURCE="failed log ($FAILED_LOG)"
else
  # All sessions missing analysis_usage (never analyzed), with enough messages
  SESSION_IDS=$(sqlite3 "$DB_PATH" "
    SELECT s.id
    FROM sessions s
    LEFT JOIN analysis_usage au ON au.session_id = s.id AND au.analysis_type = 'session'
    WHERE s.deleted_at IS NULL
      AND s.message_count >= $MIN_MESSAGES
      AND au.session_id IS NULL
    ORDER BY s.message_count DESC;
  ")
  SOURCE="unanalyzed (min ${MIN_MESSAGES} messages)"
fi

if [ -z "$SESSION_IDS" ]; then
  echo "No sessions to analyze."
  exit 0
fi

TOTAL=$(echo "$SESSION_IDS" | wc -l | tr -d ' ')

echo "============================================"
echo " Code Insights — Batch Native Analysis"
echo "============================================"
echo "  Source:       $SOURCE"
echo "  Sessions:     $TOTAL"
echo "  Model:        $MODEL"
echo "  Delay:        ${DELAY_BETWEEN}s between calls"
echo "  Min messages: $MIN_MESSAGES"
echo "  Dry run:      $DRY_RUN"
echo "  DB:           $DB_PATH"
echo "============================================"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo "Sessions to analyze:"
  IDX=0
  for SESSION_ID in $SESSION_IDS; do
    IDX=$((IDX + 1))
    INFO=$(sqlite3 "$DB_PATH" "SELECT message_count || ' msgs | ' || project_name FROM sessions WHERE id = '$SESSION_ID';")
    echo "  [$IDX/$TOTAL] $INFO  $SESSION_ID"
  done
  echo ""
  echo "(dry run — no analysis calls made)"
  exit 0
fi

# ── Run analysis ──────────────────────────────────────────────────────────────

# Clear failed log for this run (append mode — retry-failed reads it first)
> "$FAILED_LOG"

START_TIME=$(date +%s)
SUCCESS=0
FAILED=0
IDX=0

for SESSION_ID in $SESSION_IDS; do
  IDX=$((IDX + 1))

  INFO=$(sqlite3 "$DB_PATH" "
    SELECT message_count || ' msgs | ' || project_name
    FROM sessions WHERE id = '$SESSION_ID';
  ")

  printf "[$IDX/$TOTAL] $INFO ... "

  SESSION_START=$(date +%s)

  # Run analysis — capture both stdout and stderr
  OUTPUT=""
  EXIT_CODE=0
  OUTPUT=$(code-insights insights "$SESSION_ID" --native --force --model "$MODEL" 2>&1) || EXIT_CODE=$?

  ELAPSED=$(( $(date +%s) - SESSION_START ))

  if [ "$EXIT_CODE" -eq 0 ]; then
    SUCCESS=$((SUCCESS + 1))
    echo "done (${ELAPSED}s)"
  else
    # ── Rate limit / overloaded detection ──────────────────────────────
    # Check for 429, rate limit, overloaded, or capacity errors in output.
    # These mean we should STOP — not retry — to avoid hammering the API.
    if echo "$OUTPUT" | grep -qiE '429|rate.?limit|overloaded|too many requests|capacity|throttl'; then
      echo "RATE LIMITED"
      echo ""
      echo "============================================"
      echo " STOPPED — Rate limit or capacity error"
      echo "============================================"
      echo " Error output:"
      echo "   $OUTPUT" | head -5
      echo ""
      echo " $SUCCESS sessions completed before hitting the limit."
      echo " Remaining: $((TOTAL - IDX)) sessions not attempted."
      echo ""
      echo " To resume, wait a few minutes then re-run:"
      echo "   ./batch-native-analysis.sh"
      echo "============================================"

      # Log this session as failed so --retry-failed picks it up
      echo "$SESSION_ID" >> "$FAILED_LOG"

      # Also log remaining un-attempted sessions
      REMAINING_IDS=$(echo "$SESSION_IDS" | tail -n +$((IDX + 1)))
      if [ -n "$REMAINING_IDS" ]; then
        echo "$REMAINING_IDS" >> "$FAILED_LOG"
      fi

      # Print summary and exit
      END_TIME=$(date +%s)
      TOTAL_ELAPSED=$(( END_TIME - START_TIME ))
      echo ""
      echo "  Completed:   $SUCCESS"
      echo "  Failed:      $((FAILED + 1))"
      echo "  Not started: $((TOTAL - IDX))"
      echo "  Elapsed:     $((TOTAL_ELAPSED / 60))m $((TOTAL_ELAPSED % 60))s"
      echo "  Failed log:  $FAILED_LOG ($((FAILED + 1 + TOTAL - IDX)) session IDs)"
      exit 2
    fi

    # Non-rate-limit error — log and continue
    FAILED=$((FAILED + 1))
    echo "FAILED (${ELAPSED}s)"
    echo "  Error: $(echo "$OUTPUT" | head -3)"
    echo "$SESSION_ID" >> "$FAILED_LOG"
  fi

  # Delay between calls (skip after last session)
  if [ "$IDX" -lt "$TOTAL" ]; then
    sleep "$DELAY_BETWEEN"
  fi
done

# ── Summary ───────────────────────────────────────────────────────────────────

END_TIME=$(date +%s)
TOTAL_ELAPSED=$(( END_TIME - START_TIME ))

echo ""
echo "============================================"
echo " Summary"
echo "============================================"
echo "  Total:      $TOTAL"
echo "  Model:      $MODEL"
echo "  Success:    $SUCCESS"
echo "  Failed:     $FAILED"
echo "  Elapsed:    $((TOTAL_ELAPSED / 60))m $((TOTAL_ELAPSED % 60))s"
if [ "$FAILED" -gt 0 ]; then
  echo "  Failed log: $FAILED_LOG ($FAILED session IDs)"
  echo ""
  echo "  To retry failed sessions:"
  echo "    ./batch-native-analysis.sh --retry-failed"
fi
echo "============================================"
