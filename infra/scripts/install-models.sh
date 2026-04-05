#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Lynx Model Installer
#
# Downloads Ollama models for a given bundle and stores them in:
#   <REPO_ROOT>/models/  (via OLLAMA_MODELS env var)
#
# Usage:
#   ./install-models.sh [bundle-id] [--dry-run]
#
# Bundle IDs:
#   minimal       8GB  RAM  — phi3.5-mini + qwen2.5-coder-3b + deepseek 1.3b + deepseek-r1-8b
#   standard      16GB RAM  — llama3.1-8b + qwen2.5-coder-7b + qwen2.5-1.5b + deepseek-r1-14b
#   workstation   24GB RAM  — llama3.1-8b + qwen2.5-coder-14b + qwen2.5-1.5b + deepseek-r1-14b
#   power         32GB RAM  — llama3.1-8b + qwen2.5-coder-32b + qwen2.5-1.5b + qwq-32b
#   general-only   4GB RAM  — llama3.2-3b + deepseek-r1-7b
#
# Model storage:
#   By default, Ollama stores models globally (~/.ollama/models).
#   This script sets OLLAMA_MODELS to <repo>/models/ so:
#     - All models live inside your repo (portable)
#     - Deleting the repo deletes the models
#     - No pollution of your global Ollama install
#
# To reclaim space: rm -rf <repo>/models/
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MODELS_DIR="$REPO_ROOT/models"

# ─── Colors ──────────────────────────────────────────────────────────────────
RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
PURPLE='\033[0;35m'

log()  { echo -e "${DIM}[lynx]${RESET} $*"; }
ok()   { echo -e "${GREEN}✓${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET}  $*"; }
err()  { echo -e "${RED}✗${RESET}  $*" >&2; }
hi()   { echo -e "${BOLD}${PURPLE}$*${RESET}"; }

# ─── Bundle definitions ───────────────────────────────────────────────────────
# Format: "role:tag:name:ramGB"

declare -A BUNDLE_DESCRIPTIONS
BUNDLE_DESCRIPTIONS[minimal]="Minimal (8GB RAM) — 4 models, serial only"
BUNDLE_DESCRIPTIONS[standard]="Standard (16GB RAM) — 4 models, parallel capable"
BUNDLE_DESCRIPTIONS[workstation]="Workstation (24GB RAM) — 4 models, full parallel"
BUNDLE_DESCRIPTIONS[power]="Power (32GB+ RAM) — 4 models, near-GPT-4 local"
BUNDLE_DESCRIPTIONS[general-only]="General Use (4GB RAM) — 2 models, chat only"

declare -A BUNDLE_MIN_RAM
BUNDLE_MIN_RAM[minimal]=6
BUNDLE_MIN_RAM[standard]=14
BUNDLE_MIN_RAM[workstation]=20
BUNDLE_MIN_RAM[power]=28
BUNDLE_MIN_RAM[general-only]=4

# Tags per bundle (space-separated)
declare -A BUNDLE_TAGS
BUNDLE_TAGS[minimal]="phi3.5:3.8b-mini-instruct-q4_K_M qwen2.5-coder:3b-instruct-q4_K_M deepseek-coder:1.3b-instruct-q4_K_M deepseek-r1:8b-q4_K_M"
BUNDLE_TAGS[standard]="llama3.1:8b-instruct-q4_K_M qwen2.5-coder:7b-instruct-q4_K_M qwen2.5-coder:1.5b-instruct-q4_K_M deepseek-r1:14b-q4_K_M"
BUNDLE_TAGS[workstation]="llama3.1:8b-instruct-q4_K_M qwen2.5-coder:14b-instruct-q4_K_M qwen2.5-coder:1.5b-instruct-q4_K_M deepseek-r1:14b-q4_K_M"
BUNDLE_TAGS[power]="llama3.1:8b-instruct-q4_K_M qwen2.5-coder:32b-instruct-q4_K_M qwen2.5-coder:1.5b-instruct-q4_K_M qwq:32b-q4_K_M"
BUNDLE_TAGS[general-only]="llama3.2:3b-instruct-q4_K_M deepseek-r1:7b-q4_K_M"

# ─── Argument parsing ─────────────────────────────────────────────────────────
BUNDLE_ID="${1:-}"
DRY_RUN=false

for arg in "$@"; do
  [[ "$arg" == "--dry-run" ]] && DRY_RUN=true
done

# ─── Check Ollama ─────────────────────────────────────────────────────────────
check_ollama() {
  if ! command -v ollama &>/dev/null; then
    err "Ollama not found. Install it first:"
    echo ""
    echo "  Linux/macOS: curl -fsSL https://ollama.com/install.sh | sh"
    echo "  Windows:     https://ollama.com/download"
    echo ""
    exit 1
  fi

  # Check if ollama is running
  if ! ollama list &>/dev/null; then
    warn "Ollama is not running. Starting it..."
    ollama serve &>/dev/null &
    sleep 2
    if ! ollama list &>/dev/null; then
      err "Could not start Ollama. Run 'ollama serve' manually."
      exit 1
    fi
  fi

  ok "Ollama $(ollama --version 2>/dev/null | head -1) ready"
}

# ─── Detect system RAM ────────────────────────────────────────────────────────
detect_ram_gb() {
  local ram_kb
  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    ram_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    echo $(( ram_kb / 1024 / 1024 ))
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    local ram_bytes
    ram_bytes=$(sysctl -n hw.memsize)
    echo $(( ram_bytes / 1024 / 1024 / 1024 ))
  else
    echo 8  # default guess
  fi
}

# ─── Interactive bundle picker ────────────────────────────────────────────────
pick_bundle() {
  local ram_gb
  ram_gb=$(detect_ram_gb)

  echo ""
  hi "  ██╗  ██╗   ██╗███╗  ██╗██╗  ██╗"
  hi "  ██║  ╚██╗ ██╔╝████╗ ██║╚██╗██╔╝"
  hi "  ██║   ╚████╔╝ ██╔██╗██║ ╚███╔╝ "
  hi "  ██║    ╚██╔╝  ██║╚████║ ██╔██╗ "
  hi "  ███████╗██║   ██║ ╚███║██╔╝╚██╗"
  hi "  ╚══════╝╚═╝   ╚═╝  ╚══╝╚═╝  ╚═╝"
  echo ""
  echo -e "  ${DIM}AI-first DevOps platform — model installer${RESET}"
  echo ""
  echo -e "  Detected RAM: ${BOLD}${ram_gb}GB${RESET}"
  echo ""

  echo -e "  ${BOLD}Available bundles:${RESET}"
  echo ""

  local i=1
  local bundle_order=("minimal" "standard" "workstation" "power" "general-only")
  for bid in "${bundle_order[@]}"; do
    local min_ram="${BUNDLE_MIN_RAM[$bid]}"
    local desc="${BUNDLE_DESCRIPTIONS[$bid]}"
    local marker=""
    local status_color="$DIM"

    if (( ram_gb >= min_ram )); then
      status_color="$RESET"
      # Auto-recommend the largest viable bundle
      if (( ram_gb >= min_ram && ram_gb < min_ram + 8 )) || [[ "$bid" == "general-only" && ram_gb -lt 8 ]]; then
        marker=" ${GREEN}← recommended${RESET}"
      fi
    else
      marker=" ${DIM}(need ${min_ram}GB)${RESET}"
    fi

    echo -e "  ${status_color}[$i] ${desc}${RESET}${marker}"
    (( i++ ))
  done

  echo ""
  echo -e "  [q] Quit"
  echo ""

  local choice
  while true; do
    read -rp "  Choose bundle [1-5]: " choice
    case "$choice" in
      1) BUNDLE_ID="minimal"; break ;;
      2) BUNDLE_ID="standard"; break ;;
      3) BUNDLE_ID="workstation"; break ;;
      4) BUNDLE_ID="power"; break ;;
      5) BUNDLE_ID="general-only"; break ;;
      q|Q) echo "Bye."; exit 0 ;;
      *) warn "Enter 1-5 or q" ;;
    esac
  done
}

# ─── Show what will be pulled ─────────────────────────────────────────────────
show_plan() {
  local tags=($1)
  echo ""
  log "Bundle:  ${BOLD}${BUNDLE_ID}${RESET} — ${BUNDLE_DESCRIPTIONS[$BUNDLE_ID]}"
  log "Storage: ${BOLD}${MODELS_DIR}${RESET}"
  echo ""
  echo -e "  ${BOLD}Models to download:${RESET}"
  for tag in "${tags[@]}"; do
    echo -e "    ${CYAN}•${RESET} $tag"
  done
  echo ""
}

# ─── Estimate disk space ──────────────────────────────────────────────────────
estimate_disk_gb() {
  local bundle="$1"
  case "$bundle" in
    minimal)      echo "~11 GB" ;;
    standard)     echo "~22 GB" ;;
    workstation)  echo "~27 GB" ;;
    power)        echo "~55 GB" ;;
    general-only) echo "~7 GB"  ;;
    *)            echo "unknown" ;;
  esac
}

# ─── Pull models ──────────────────────────────────────────────────────────────
pull_models() {
  local tags=($1)
  local total="${#tags[@]}"
  local current=0

  for tag in "${tags[@]}"; do
    (( current++ ))
    echo ""
    echo -e "${BOLD}[${current}/${total}]${RESET} Pulling ${CYAN}${tag}${RESET}..."

    if $DRY_RUN; then
      echo -e "${DIM}  dry-run: would run: OLLAMA_MODELS=${MODELS_DIR} ollama pull ${tag}${RESET}"
    else
      OLLAMA_MODELS="$MODELS_DIR" ollama pull "$tag"
      ok "Pulled $tag"
    fi
  done
}

# ─── Write .lynx-bundle marker ────────────────────────────────────────────────
write_marker() {
  local marker_file="$MODELS_DIR/.lynx-bundle"
  mkdir -p "$MODELS_DIR"
  cat > "$marker_file" <<EOF
# Lynx model bundle marker — DO NOT EDIT
bundle=$BUNDLE_ID
installed=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
models_dir=$MODELS_DIR
EOF
  log "Wrote bundle marker: ${marker_file}"
}

# ─── List installed models ────────────────────────────────────────────────────
list_installed() {
  local marker_file="$MODELS_DIR/.lynx-bundle"
  if [[ -f "$marker_file" ]]; then
    echo ""
    hi "  Installed bundle:"
    cat "$marker_file" | grep -v '^#' | while IFS='=' read -r key val; do
      echo -e "    ${DIM}${key}:${RESET} ${val}"
    done
    echo ""
    echo -e "  ${DIM}Models on disk:${RESET}"
    if command -v ollama &>/dev/null; then
      OLLAMA_MODELS="$MODELS_DIR" ollama list 2>/dev/null | tail -n +2 | while read -r line; do
        echo "    $line"
      done
    fi
  else
    warn "No Lynx bundle installed in $MODELS_DIR"
  fi
}

# ─── Uninstall ────────────────────────────────────────────────────────────────
uninstall() {
  if [[ ! -d "$MODELS_DIR" ]]; then
    warn "No models directory found at $MODELS_DIR"
    exit 0
  fi

  echo ""
  warn "This will delete ALL models in: $MODELS_DIR"
  local size
  size=$(du -sh "$MODELS_DIR" 2>/dev/null | cut -f1)
  warn "Disk space to reclaim: ~${size}"
  echo ""
  read -rp "  Type 'yes' to confirm: " confirm
  if [[ "$confirm" == "yes" ]]; then
    rm -rf "$MODELS_DIR"
    ok "Deleted $MODELS_DIR"
  else
    log "Aborted."
  fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
  # Handle special commands
  case "${1:-}" in
    list)    list_installed; exit 0 ;;
    remove|uninstall) uninstall; exit 0 ;;
    --help|-h)
      echo ""
      echo "Usage: $0 [bundle-id|list|remove] [--dry-run]"
      echo ""
      echo "  Bundle IDs: minimal | standard | workstation | power | general-only"
      echo "  list        Show installed bundle info"
      echo "  remove      Delete all downloaded models"
      echo "  --dry-run   Show what would be done without pulling"
      echo ""
      exit 0
      ;;
  esac

  # Interactive picker if no bundle specified
  if [[ -z "$BUNDLE_ID" || "$BUNDLE_ID" == "--dry-run" ]]; then
    pick_bundle
  fi

  # Validate bundle ID
  if [[ -z "${BUNDLE_TAGS[$BUNDLE_ID]+x}" ]]; then
    err "Unknown bundle: '$BUNDLE_ID'"
    echo "Valid bundles: minimal standard workstation power general-only"
    exit 1
  fi

  local tags_str="${BUNDLE_TAGS[$BUNDLE_ID]}"
  local disk_est
  disk_est=$(estimate_disk_gb "$BUNDLE_ID")

  check_ollama
  show_plan "$tags_str"

  echo -e "  ${DIM}Estimated disk usage: ${disk_est}${RESET}"
  echo -e "  ${DIM}Storage location:     ${MODELS_DIR}${RESET}"
  echo ""

  if ! $DRY_RUN; then
    read -rp "  Proceed? [Y/n] " confirm
    [[ "$confirm" =~ ^[Nn] ]] && { log "Aborted."; exit 0; }
  fi

  mkdir -p "$MODELS_DIR"

  pull_models "$tags_str"

  if ! $DRY_RUN; then
    write_marker
    echo ""
    ok "Bundle '${BUNDLE_ID}' installed."
    echo ""
    echo -e "  ${DIM}Models stored in:${RESET} ${MODELS_DIR}"
    echo -e "  ${DIM}To use these models, Lynx sets OLLAMA_MODELS automatically.${RESET}"
    echo -e "  ${DIM}To reclaim space later: $0 remove${RESET}"
    echo ""
  fi
}

main "$@"
