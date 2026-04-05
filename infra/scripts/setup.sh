#!/usr/bin/env bash
# Lynx Setup Wizard
# Detects OS, installs dependencies, configures channels, starts services.

set -euo pipefail

LYNX_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$LYNX_DIR/.env"
COMPOSE_LITE="$LYNX_DIR/infra/docker/docker-compose.lite.yml"
COMPOSE_FULL="$LYNX_DIR/infra/docker/docker-compose.full.yml"

# ─── Colors ──────────────────────────────────────────────────────────────────
PURPLE='\033[38;2;127;119;221m'
TEAL='\033[38;2;29;158;117m'
CORAL='\033[38;2;216;90;48m'
BOLD='\033[1m'
RESET='\033[0m'

header() { echo -e "\n${PURPLE}${BOLD}$1${RESET}"; }
success() { echo -e "${TEAL}✓ $1${RESET}"; }
warn()    { echo -e "${CORAL}⚠ $1${RESET}"; }

# ─── Header ──────────────────────────────────────────────────────────────────
clear
echo -e "${PURPLE}${BOLD}"
cat << 'EOF'
  ██╗  ██╗   ██╗███╗   ██╗██╗  ██╗
  ██║  ╚██╗ ██╔╝████╗  ██║╚██╗██╔╝
  ██║   ╚████╔╝ ██╔██╗ ██║ ╚███╔╝
  ██║    ╚██╔╝  ██║╚██╗██║ ██╔██╗
  ███████╗██║   ██║ ╚████║██╔╝ ██╗
  ╚══════╝╚═╝   ╚═╝  ╚═══╝╚═╝  ╚═╝
EOF
echo -e "${RESET}"
echo -e "${BOLD}Hello, partner. I'm Lynx.${RESET}"
echo -e "Your AI engineering partner. Let's get you set up.\n"

# ─── Step 1: Check prerequisites ─────────────────────────────────────────────
header "Step 1 — Checking prerequisites"

check_cmd() {
  if command -v "$1" &> /dev/null; then
    success "$1 found ($(command -v "$1"))"
  else
    warn "$1 not found — install it from $2"
    MISSING_DEPS=1
  fi
}

MISSING_DEPS=0
check_cmd "node" "https://nodejs.org"
check_cmd "pnpm" "https://pnpm.io/installation"
check_cmd "docker" "https://docs.docker.com/get-docker"
check_cmd "docker compose" "https://docs.docker.com/compose"

if [ $MISSING_DEPS -eq 1 ]; then
  echo -e "\n${CORAL}Please install missing dependencies and re-run this script.${RESET}"
  exit 1
fi

# ─── Step 2: Detect system profile ───────────────────────────────────────────
header "Step 2 — Detecting your system"

TOTAL_RAM_GB=$(awk '/MemTotal/ {printf "%d", $2/1024/1024}' /proc/meminfo 2>/dev/null || sysctl -n hw.memsize 2>/dev/null | awk '{printf "%d", $1/1024/1024/1024}' || echo "8")

echo "  RAM detected: ${TOTAL_RAM_GB}GB"

if [ "$TOTAL_RAM_GB" -ge 32 ]; then
  RECOMMENDED_PROFILE="full"
  RECOMMENDED_MODEL="qwen2.5:32b-instruct-q4_K_M"
  echo -e "  Profile: ${TEAL}Full (32GB+)${RESET} — SigNoz + Ollama enabled"
elif [ "$TOTAL_RAM_GB" -ge 16 ]; then
  RECOMMENDED_PROFILE="full"
  RECOMMENDED_MODEL="qwen2.5:14b-instruct-q4_K_M"
  echo -e "  Profile: ${TEAL}Full${RESET} — Qwen 2.5 14B recommended"
elif [ "$TOTAL_RAM_GB" -ge 8 ]; then
  RECOMMENDED_PROFILE="lite"
  RECOMMENDED_MODEL="mistral:7b-instruct-q4_K_M"
  echo -e "  Profile: ${TEAL}Lite (8GB)${RESET} — Mistral 7B recommended, no SigNoz"
else
  RECOMMENDED_PROFILE="lite"
  RECOMMENDED_MODEL="phi3.5:3.8b-mini-instruct-q4_K_M"
  echo -e "  Profile: ${CORAL}Lite (4GB)${RESET} — Phi-3.5 Mini recommended"
fi

echo ""
read -p "  Use recommended profile '$RECOMMENDED_PROFILE'? [Y/n]: " USE_RECOMMENDED
PROFILE="${USE_RECOMMENDED:-Y}"
if [[ "$PROFILE" =~ ^[Nn] ]]; then
  read -p "  Profile [full/lite/minimal]: " PROFILE
else
  PROFILE="$RECOMMENDED_PROFILE"
fi

# ─── Step 3: LLM configuration ───────────────────────────────────────────────
header "Step 3 — Configure AI (LLM)"
echo "  How should Lynx think?"
echo "  1) Groq API — free, Llama 3.3 70B, requires internet"
echo "  2) Ollama — local, private, uses your GPU/CPU"
echo "  3) Both (Groq for heavy, Ollama for normal) — recommended"
echo "  4) I have my own API key (Claude/OpenAI/Gemini)"
echo ""
read -p "  Choice [1-4]: " LLM_CHOICE

GROQ_KEY=""
OLLAMA_MODEL="$RECOMMENDED_MODEL"
ANTHROPIC_KEY=""

case "$LLM_CHOICE" in
  1)
    read -p "  Groq API key (get free at console.groq.com): " GROQ_KEY
    ;;
  2)
    echo "  Ollama will be used. Recommended model: $RECOMMENDED_MODEL"
    read -p "  Model [press Enter for $RECOMMENDED_MODEL]: " CUSTOM_MODEL
    OLLAMA_MODEL="${CUSTOM_MODEL:-$RECOMMENDED_MODEL}"
    ;;
  3)
    read -p "  Groq API key (optional, press Enter to skip): " GROQ_KEY
    echo "  Ollama model: $RECOMMENDED_MODEL"
    ;;
  4)
    echo "  Supported: Anthropic (claude), OpenAI (gpt-4), Google (gemini)"
    read -p "  Anthropic API key (or Enter to skip): " ANTHROPIC_KEY
    ;;
esac

# ─── Step 4: Notification channel ────────────────────────────────────────────
header "Step 4 — Notification channel"
echo "  How should Lynx reach you?"
echo "  1) Slack webhook"
echo "  2) Discord webhook"
echo "  3) Email (SMTP)"
echo "  4) Custom webhook"
echo "  5) Dashboard only — no external notifications"
echo ""
read -p "  Choice [1-5]: " NOTIF_CHOICE

SLACK_WEBHOOK=""
DISCORD_WEBHOOK=""
SMTP_HOST=""
CUSTOM_WEBHOOK=""

case "$NOTIF_CHOICE" in
  1) read -p "  Slack webhook URL: " SLACK_WEBHOOK ;;
  2) read -p "  Discord webhook URL: " DISCORD_WEBHOOK ;;
  3)
    read -p "  SMTP host: " SMTP_HOST
    read -p "  SMTP user: " SMTP_USER
    read -p "  SMTP from: " SMTP_FROM
    ;;
  4) read -p "  Webhook URL: " CUSTOM_WEBHOOK ;;
  5) echo "  Dashboard-only mode selected." ;;
esac

# ─── Step 5: Write .env ───────────────────────────────────────────────────────
header "Step 5 — Writing configuration"

cp "$LYNX_DIR/.env.example" "$ENV_FILE" 2>/dev/null || touch "$ENV_FILE"

set_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

set_env "LYNX_PROFILE" "$PROFILE"
[ -n "$GROQ_KEY" ]        && set_env "GROQ_API_KEY" "$GROQ_KEY"
[ -n "$OLLAMA_MODEL" ]    && set_env "OLLAMA_MODEL" "$OLLAMA_MODEL"
[ -n "$ANTHROPIC_KEY" ]   && set_env "ANTHROPIC_API_KEY" "$ANTHROPIC_KEY"
[ -n "$SLACK_WEBHOOK" ]   && set_env "SLACK_WEBHOOK_URL" "$SLACK_WEBHOOK"
[ -n "$DISCORD_WEBHOOK" ] && set_env "DISCORD_WEBHOOK_URL" "$DISCORD_WEBHOOK"
[ -n "$CUSTOM_WEBHOOK" ]  && set_env "WEBHOOK_URL" "$CUSTOM_WEBHOOK"

success ".env written to $ENV_FILE"

# ─── Step 6: Start Docker services ───────────────────────────────────────────
header "Step 6 — Starting services"

COMPOSE_FILE="$COMPOSE_LITE"
[ "$PROFILE" = "full" ] && COMPOSE_FILE="$COMPOSE_FULL"

echo "  Starting ${PROFILE} stack..."
docker compose -f "$COMPOSE_FILE" up -d

echo ""
echo "  Waiting for PostgreSQL..."
until docker exec lynx-postgres pg_isready -U lynx > /dev/null 2>&1; do
  printf '.'
  sleep 2
done
echo ""
success "PostgreSQL ready"

# ─── Step 7: Install dependencies and build ───────────────────────────────────
header "Step 7 — Installing dependencies"

cd "$LYNX_DIR"
pnpm install
success "Dependencies installed"

echo ""
echo "  Building packages..."
pnpm turbo build
success "Build complete"

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${PURPLE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${TEAL}${BOLD}  Lynx is ready, partner.${RESET}"
echo ""
echo -e "  Dashboard:  ${BOLD}http://localhost:3000${RESET}"
echo -e "  API:        ${BOLD}http://localhost:4000/api/health${RESET}"
echo ""
echo -e "  Start everything:   ${BOLD}pnpm dev${RESET}"
echo -e "  Monitor logs:       ${BOLD}docker compose -f infra/docker/docker-compose.${PROFILE}.yml logs -f${RESET}"
echo -e "${PURPLE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
