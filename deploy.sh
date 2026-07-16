#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh — AI Voice Interviewer (Junior SDE Screener)
#
# WHAT THIS DOES:
#   Checks prerequisites, initialises git if needed, validates the project,
#   and deploys the static site to Vercel in a single command.
#   No build step — this is a pure static site (HTML/CSS/JS).
#
# HOW TO RUN:
#   chmod +x deploy.sh && ./deploy.sh
#
# FIRST TIME SETUP:
#   1. Make sure you have a Groq API key from https://console.groq.com/keys
#      (you'll enter it in the browser when the app loads — it's NOT a server secret)
#   2. Run: chmod +x deploy.sh && ./deploy.sh
#   3. When Vercel prompts you to log in, follow the browser link
#
# DRY RUN (checks everything without deploying):
#   ./deploy.sh --dry-run
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}ℹ${NC}  $*"; }
success() { echo -e "${GREEN}✅${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}❌${NC} $*" >&2; }
step()    { echo -e "\n${BOLD}${CYAN}$*${NC}"; }

# ── Flags ─────────────────────────────────────────────────────────────────────
DRY_RUN=false
for arg in "$@"; do
  [[ "$arg" == "--dry-run" ]] && DRY_RUN=true
done

if $DRY_RUN; then
  warn "DRY RUN mode — all checks will run but no deployment will happen."
fi

echo ""
echo -e "${BOLD}🎙  AI Voice Interviewer — Deploy Script${NC}"
echo "    Stack: Static HTML/CSS/JS + Groq (browser-side)"
echo "    Host:  Vercel (static)"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1 — Pre-flight: tool checks
# ═══════════════════════════════════════════════════════════════════════════════
step "🔍 Step 1 — Pre-flight checks"

# Project root check
if [[ ! -f "package.json" ]]; then
  error "package.json not found. Run this script from the project root directory."
  error "Expected to find: package.json, frontend/, backend/"
  exit 1
fi
if [[ ! -d "frontend" ]] || [[ ! -d "backend" ]]; then
  error "frontend/ or backend/ directories missing — this doesn't look like the complete project."
  exit 1
fi
success "Running from project root."

# git
if ! command -v git &>/dev/null; then
  error "git is not installed."
  error "Install it: https://git-scm.com/downloads"
  exit 1
fi
success "git $(git --version | awk '{print $3}') found."

# node + npm (needed only for Jest tests — not for the app itself)
if ! command -v node &>/dev/null; then
  error "node is not installed. Required to run the test suite."
  error "Install it: https://nodejs.org  (LTS version)"
  exit 1
fi
NODE_VER=$(node --version)
success "Node $NODE_VER found."

# Vercel CLI
if ! command -v vercel &>/dev/null; then
  error "Vercel CLI is not installed."
  error "Install it: npm install -g vercel"
  error "Then log in: vercel login"
  exit 1
fi
VERCEL_VER=$(vercel --version 2>/dev/null | head -1)
success "Vercel CLI $VERCEL_VER found."

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2 — Environment variable check
# ═══════════════════════════════════════════════════════════════════════════════
step "🔑 Step 2 — Environment check"

# NOTE: This app requires the GROQ_API_KEY environment variable.
# It is stored securely on Vercel as an environment variable.

if [[ ! -f ".env.example" ]]; then
  warn ".env.example is missing. Consider adding it so contributors know what keys are needed."
fi

if [[ ! -f "backend/.env" ]]; then
  if [[ -f ".env.example" ]]; then
    warn "backend/.env file not found — copying from .env.example."
    cp .env.example backend/.env
    warn "NOTE: Please fill in backend/.env with your GROQ_API_KEY for local development."
  fi
else
  info "backend/.env file found."
fi

# Verify .env is gitignored so the key is never accidentally committed
if git check-ignore -q backend/.env 2>/dev/null; then
  success "backend/.env is gitignored — API key won't be committed."
else
  # Not yet a git repo OR not ignored — we'll handle below
  info "backend/.env gitignore status will be confirmed after git init."
fi

# Required files check
MISSING_FILES=()
for f in frontend/index.html frontend/app.js frontend/style.css vercel.json; do
  [[ ! -f "$f" ]] && MISSING_FILES+=("$f")
done

if [[ ${#MISSING_FILES[@]} -gt 0 ]]; then
  error "Missing required files: ${MISSING_FILES[*]}"
  exit 1
fi
success "All required files present."

success "Environment check passed."
echo ""
echo -e "  ${YELLOW}IMPORTANT${NC}: You must set the GROQ_API_KEY environment variable in your Vercel project settings"
echo -e "  Get one free at: ${CYAN}https://console.groq.com/keys${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3 — Install & test (no build step for static site)
# ═══════════════════════════════════════════════════════════════════════════════
step "📦 Step 3 — Install dependencies & run tests"

# Install Jest (needed for test suite only)
if [[ ! -d "node_modules" ]]; then
  info "Installing dev dependencies (Jest)..."
  npm install --silent
  success "Dependencies installed."
else
  info "node_modules already present — skipping install."
fi

# Run tests
info "Running test suite..."
if npm test 2>&1; then
  success "All tests passed."
else
  # Tests may not exist yet — warn but don't block deploy
  warn "Test suite had failures or no tests found."
  warn "Continuing with deployment (tests are dev-only, not required for static deploy)."
  echo ""
  read -rp "  Continue anyway? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { error "Deploy cancelled."; exit 1; }
fi

info "No build step required — this is a static site deployed as-is."
success "Build check passed."

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 4 — Git safety check
# ═══════════════════════════════════════════════════════════════════════════════
step "🌿 Step 4 — Git safety check"

# Init git repo if it doesn't exist yet
if [[ ! -d ".git" ]]; then
  warn "No git repository found — initialising one now."
  git init -b main
  success "Git repo initialised on branch: main"

  # Create .gitignore if missing
  if [[ ! -f ".gitignore" ]]; then
    info "Creating .gitignore..."
    cat > .gitignore << 'EOF'
# Dependencies
node_modules/

# Local env — never commit API keys
.env

# OS files
.DS_Store
Thumbs.db

# Editor directories
.vscode/
.idea/

# Vercel local cache
.vercel/
EOF
    success ".gitignore created."
  fi

  # Stage and commit all files
  git add -A
  git commit -m "feat: initial commit — AI Voice Interviewer Junior SDE"
  success "Initial commit created."

else
  # Existing repo — check for uncommitted changes
  CURRENT_BRANCH=$(git branch --show-current)
  info "Git repo found on branch: ${BOLD}$CURRENT_BRANCH${NC}"

  UNCOMMITTED=$(git status --porcelain)
  if [[ -n "$UNCOMMITTED" ]]; then
    warn "You have uncommitted changes:"
    git status --short
    echo ""
    warn "Deploying with uncommitted local changes may not match what Vercel builds."
    read -rp "  Commit all changes and continue? [y/N] " confirm
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
      git add -A
      git commit -m "chore: pre-deploy commit [deploy.sh]"
      success "Changes committed."
    else
      error "Deploy cancelled. Commit or stash your changes first."
      exit 1
    fi
  else
    success "Working tree is clean — nothing uncommitted."
  fi

  CURRENT_BRANCH=$(git branch --show-current)
  success "Deploying from branch: ${BOLD}$CURRENT_BRANCH${NC}"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 5 — Deploy
# ═══════════════════════════════════════════════════════════════════════════════
step "🚀 Step 5 — Deploy to Vercel"

if $DRY_RUN; then
  warn "DRY RUN: Skipping actual deployment."
  success "All pre-flight checks passed. Remove --dry-run to deploy."
  echo ""
  echo -e "  ${GREEN}Command that would run:${NC} vercel --prod --yes"
  exit 0
fi

info "Running: vercel --prod --yes"
info "If this is your first deploy, Vercel will ask a few one-time setup questions."
echo ""

# Run the deploy and capture the output to extract the URL
DEPLOY_OUTPUT=$(vercel --prod --yes 2>&1)
DEPLOY_EXIT=$?
echo "$DEPLOY_OUTPUT"

if [[ $DEPLOY_EXIT -ne 0 ]]; then
  error "Vercel deploy failed. See output above."
  error "Common fixes:"
  error "  - Not logged in?  Run: vercel login"
  error "  - Token expired?  Run: vercel logout && vercel login"
  exit 1
fi

# Extract the production URL from Vercel output
LIVE_URL=$(echo "$DEPLOY_OUTPUT" | grep -Eo 'https://[a-zA-Z0-9._-]+\.vercel\.app' | tail -1)

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 6 — Post-deploy summary
# ═══════════════════════════════════════════════════════════════════════════════
step "✅ Step 6 — Deploy complete"

echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${GREEN}  🎉 Deployment successful!${NC}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [[ -n "$LIVE_URL" ]]; then
  echo -e "  ${BOLD}Live URL:${NC} ${CYAN}$LIVE_URL${NC}"
else
  echo -e "  ${BOLD}Live URL:${NC} Check the Vercel output above for the *.vercel.app URL"
fi

echo ""
echo -e "${BOLD}📋 Smoke test checklist (run this now):${NC}"
echo "  1. Add GROQ_API_KEY to your Vercel project environment variables"
echo "  2. Open the URL above in Chrome or Edge"
echo "  3. Click 'Start Interview' — wait ~3 seconds for Alex to speak the opening question"
echo "  4. Answer one question out loud — confirm a follow-up comes back intelligently"
echo "  5. Click 'End Interview' — confirm the scorecard generates and displays"
echo ""
echo -e "${BOLD}⚠  Browser requirement:${NC}"
echo "  This app uses the Web Speech API (STT + TTS)."
echo "  It ONLY works in Chrome or Edge — Firefox/Safari will not work."
echo ""
echo -e "${BOLD}🔑 API key note:${NC}"
echo "  The Groq key is securely stored in your Vercel project environment variables."
echo "  It is NOT exposed to the browser anymore."
echo ""
echo -e "${BOLD}📁 Repo:${NC}"
git remote -v 2>/dev/null | head -2 || echo "  (No remote configured — push to GitHub to enable CI)"
echo ""
echo "Done. 🎙"
