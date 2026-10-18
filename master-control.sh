#!/usr/bin/env bash
# ====================================================================
#  master-control.sh - the te-op1 dev toolbox
#
#  Everything you need to work on this repo without memorizing it:
#  set up, run the local site, build the C tools and the web app, seed
#  the local database, smoke-test and screenshot pages, and ship.
#
#    ./master-control.sh help         list every command
#
#  Runs in bash: Git Bash on Windows, or any macOS / Linux shell.
#  Plain git (commit, push, branches) is not wrapped: use git.
# ====================================================================
set -euo pipefail

# Git Bash rewrites "/library/editor" into "C:/Program Files/Git/library/editor"
# when passing it to node; site paths must reach the scripts as typed.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

DB="te-op1-db"
PROJECT="te-op1"
PROD="https://te-op1.pages.dev"
LOCAL="http://127.0.0.1:8788"
DEV_PORTS=(8788 8789)            # Vite (the site) and wrangler (the /api Functions)
MC_DIR="$ROOT/.wrangler/mc"      # gitignored with the rest of .wrangler/
PID_FILE="$MC_DIR/dev.pid"
LOG_FILE="$MC_DIR/dev.log"

# ── output ──────────────────────────────────────────────────
if [ -t 1 ]; then B=$'\e[1m'; DIM=$'\e[2m'; RED=$'\e[31m'; GRN=$'\e[32m'; YEL=$'\e[33m'; R=$'\e[0m'
else B=""; DIM=""; RED=""; GRN=""; YEL=""; R=""; fi
say()  { printf '%s\n' "${B}==>${R} $*"; }
ok()   { printf '%s\n' "  ${GRN}ok${R}   $*"; }
warn() { printf '%s\n' "  ${YEL}warn${R} $*"; }
bad()  { printf '%s\n' "  ${RED}fail${R} $*"; }
die()  { printf '%s\n' "${RED}error:${R} $*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
confirm() { local a; read -r -p "$1 [y/N] " a; [[ "$a" =~ ^[Yy]$ ]]; }
is_windows() { [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* || "${OSTYPE:-}" == win32 ]]; }
wrangler() { npx --no-install wrangler "$@"; }

# ── help ────────────────────────────────────────────────────
usage() {
  cat <<EOF
${B}master-control.sh${R} - te-op1 dev toolbox

${B}Getting started${R}
  setup                        install deps, create .dev.vars, local DB schema, Playwright browser
  doctor                       check Node, deps, .dev.vars, compiler, ports, gh

${B}Local site${R}  (http://localhost:8788)
  dev up                       build, then run the dev server in the background
  dev down                     stop it and free ports ${DEV_PORTS[*]}
  dev status                   is it running, and does it answer
  dev restart                  down + up (after .dev.vars or public/_redirects changes)
  dev logs                     follow the dev server log
  dev login [persona]          sign-in link for a mock persona: musician, github, admin, banned

${B}Build${R}
  build c                      compile mondo (cl, else clang, else gcc)
  build web                    vite build into dist/ (the dev server serves dist/)
  build all                    build c + webapp typecheck + build web
  webapp typecheck             tsc -b
  webapp build                 same as build web

${B}C tools${R}
  c dump <file.aif|dir>        print presets as JSON (default dir: presets/)
  c samples                    regenerate samples.js from collection/

${B}OP-1${R}  (a connected OP-1 Field over USB; Windows, via mondo op1)
  op1 <verb> [args]            ls, pull, push, mkdir, rm, mv on the device (see README: mondo op1)

${B}Probes${R}  (hardware test patches in sandbox/, gitignored)
  probe list                   the probe sets in sandbox/
  probe sweep <base.json> <array> <index> <v1,v2,...> <name>
                               one patch per value of one slot, built to .aif in sandbox/<name>/
  probe build <name>           rebuild sandbox/<name>/*.json into .aif
  probe push <name>            copy the set to the OP-1 as synth/_<name>/
  probe pull <name>            copy synth/_<name>/ back (as the device saved it) into
                               sandbox/<name>/from-device/ and dump it to JSON
  probe clean <name>           delete synth/_<name>/ from the OP-1

${B}Database${R}  (local D1 unless --remote)
  db migrate [--remote]        apply migrations/
  db seed [--remote]           import samples.js into patches
  db volume [--clean]          fill local DB with ~1000 'vol' rows for long lists (or remove them)
  db reset                     wipe the local DB and re-apply migrations
  db sql "<sql>"               run a query against the local DB

${B}Test${R}  (against the running dev server; --base URL to point elsewhere)
  test website                 smoke-test every page: loads, no errors, no sideways scroll, logins
  smoke                        same as test website
  shot <path> [opts]           screenshot a page into shots/
                                 --mobile  --as <persona>  --out <dir>  --base <url>

${B}Ship${R}
  deploy                       push master, follow the CI deploy, then check prod
  deploy status                last 5 deploy runs
  prod check                   live pages and API answer 200
EOF
}

# ── processes and ports ─────────────────────────────────────
# PIDs listening on a TCP port (Windows PIDs under Git Bash).
port_pids() {
  local port=$1
  if is_windows; then
    netstat -ano 2>/dev/null | awk -v p=":$port" '$2 ~ p"$" && $4 == "LISTENING" { print $5 }' | sort -u
  elif have lsof; then
    lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null | sort -u
  fi
}
# Windows commands take /flags, which Git Bash would rewrite as paths
# (/PID -> C:/Program Files/Git/PID); win runs one with that conversion off.
win() { MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' "$@"; }
kill_tree() {
  local pid=$1
  if is_windows; then win taskkill /PID "$pid" /T /F >/dev/null 2>&1 || true
  else kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true; fi
}
http_code() { curl -s -o /dev/null -m 5 -w '%{http_code}' "$1" 2>/dev/null || true; }
our_pid() { [ -f "$PID_FILE" ] && cat "$PID_FILE" || true; }
# The Windows PID of a Git Bash background job, so taskkill can take its tree.
win_pid() { if is_windows && [ -r "/proc/$1/winpid" ]; then cat "/proc/$1/winpid"; else echo "$1"; fi; }

# ── setup / doctor ──────────────────────────────────────────
cmd_setup() {
  say "Installing npm dependencies"
  npm ci
  if [ ! -f .dev.vars ]; then
    cp .dev.vars.example .dev.vars
    ok "created .dev.vars from .dev.vars.example (mock login on; add OAuth keys only if you need real sign-in)"
  else
    ok ".dev.vars already exists"
  fi
  say "Applying migrations to the local database"
  wrangler d1 migrations apply "$DB" --local
  say "Installing the Playwright browser (for test website / shot)"
  npx --no-install playwright install chromium
  say "Done. Next: ./master-control.sh dev up"
}

compiler() {
  if have cl; then echo cl; elif have clang; then echo clang; elif have gcc; then echo gcc; fi
}

cmd_doctor() {
  local fails=0
  if have node; then
    local v; v=$(node -p 'process.versions.node.split(".")[0]')
    if [ "$v" -ge 22 ]; then ok "node $(node -v)"; else bad "node $(node -v): wrangler 4 needs 22+"; fails=$((fails+1)); fi
  else bad "node not found (install Node 22+)"; fails=$((fails+1)); fi
  if [ -d node_modules/wrangler ] && [ -d node_modules/vite ]; then ok "npm dependencies installed"
  else bad "npm dependencies missing: run ./master-control.sh setup"; fails=$((fails+1)); fi
  if [ -f .dev.vars ]; then
    if grep -q '^DEV_LOGIN=1' .dev.vars; then ok ".dev.vars (mock login on)"
    else warn ".dev.vars has no DEV_LOGIN=1: dev login and the persona checks in test website won't work"; fi
  else bad ".dev.vars missing: run ./master-control.sh setup"; fails=$((fails+1)); fi
  local cc; cc=$(compiler)
  if [ -n "$cc" ]; then ok "C compiler: $cc"; else warn "no C compiler (cl, clang or gcc): build c won't work"; fi
  if [ -d "$HOME/AppData/Local/ms-playwright" ] || [ -d "$HOME/.cache/ms-playwright" ] || [ -d "$HOME/Library/Caches/ms-playwright" ]; then
    ok "Playwright browser installed"
  else warn "Playwright browser not found: run npx playwright install chromium"; fi
  local p pids mine; mine=$(our_pid)
  for p in "${DEV_PORTS[@]}"; do
    pids=$(port_pids "$p" | xargs)
    if [ -z "$pids" ]; then ok "port $p free"
    elif [ -n "$mine" ]; then ok "port $p in use by the dev server"
    else warn "port $p in use (pid $pids) by something dev up didn't start"; fi
  done
  if have gh; then ok "gh $(gh --version | head -1 | awk '{print $3}')"; else warn "gh not found: deploy can't follow CI"; fi
  [ "$fails" -eq 0 ] || die "$fails problem(s) above"
}

# ── dev server ──────────────────────────────────────────────
cmd_dev_up() {
  mkdir -p "$MC_DIR"
  local mine; mine=$(our_pid)
  if [ -n "$mine" ] && [ "$(http_code "$LOCAL/")" = "200" ]; then ok "already running ($LOCAL)"; return; fi
  local p
  for p in "${DEV_PORTS[@]}"; do
    [ -z "$(port_pids "$p")" ] || die "port $p is already in use. If it's an old dev server: ./master-control.sh dev down"
  done
  [ -f .dev.vars ] || die ".dev.vars missing: run ./master-control.sh setup"
  # Vite on 8788 serves the source live; it forwards /api to wrangler on 8789
  say "Starting the dev server (log: .wrangler/mc/dev.log)"
  if have setsid && ! is_windows; then setsid npm run dev >"$LOG_FILE" 2>&1 < /dev/null &
  else npm run dev >"$LOG_FILE" 2>&1 < /dev/null & fi
  win_pid $! >"$PID_FILE"
  local i
  for i in $(seq 1 60); do
    if [ "$(http_code "$LOCAL/")" = "200" ]; then ok "up at http://localhost:8788  (dev login: ./master-control.sh dev login)"; return; fi
    sleep 1
  done
  tail -20 "$LOG_FILE" >&2 || true
  die "the dev server didn't answer within 60s (see .wrangler/mc/dev.log)"
}

cmd_dev_down() {
  local mine; mine=$(our_pid)
  [ -n "$mine" ] && kill_tree "$mine"
  rm -f "$PID_FILE"
  # anything still holding the dev ports (orphaned children, an older dev server)
  local p pid
  for p in "${DEV_PORTS[@]}"; do
    for pid in $(port_pids "$p"); do kill_tree "$pid"; done
  done
  sleep 1
  for p in "${DEV_PORTS[@]}"; do
    [ -z "$(port_pids "$p")" ] && ok "port $p free" || warn "port $p still in use"
  done
}

cmd_dev_status() {
  local mine; mine=$(our_pid)
  [ -n "$mine" ] && ok "started by dev up (pid $mine)" || warn "not started by dev up"
  local p pids
  for p in "${DEV_PORTS[@]}"; do
    pids=$(port_pids "$p" | xargs)
    [ -n "$pids" ] && ok "port $p listening (pid $pids)" || warn "port $p not listening"
  done
  local c
  c=$(http_code "$LOCAL/");             [ "$c" = "200" ] && ok "GET / -> $c" || bad "GET / -> ${c:-no answer}"
  c=$(http_code "$LOCAL/api/auth/me");  [ "$c" = "200" ] && ok "GET /api/auth/me -> $c" || bad "GET /api/auth/me -> ${c:-no answer}"
}

cmd_dev_logs() { [ -f "$LOG_FILE" ] || die "no log yet: ./master-control.sh dev up"; tail -n 50 -f "$LOG_FILE"; }

cmd_dev_login() {
  local who=${1:-musician}
  case "$who" in musician|github|admin|banned) ;; *) die "persona is one of: musician, github, admin, banned" ;; esac
  local url="http://localhost:8788/api/auth/dev?as=$who&next=/"
  echo "$url"
  if is_windows; then win cmd /c start "" "$url" 2>/dev/null || true
  elif have open; then open "$url"; elif have xdg-open; then xdg-open "$url" >/dev/null 2>&1 || true; fi
}

# ── build ───────────────────────────────────────────────────
cmd_build_c() {
  local cc; cc=$(compiler)
  [ -n "$cc" ] || die "no C compiler found (install MSVC Build Tools, clang or gcc)"
  say "Building mondo with $cc"
  case "$cc" in
    cl) win cmd /c "$(cygpath -w "$ROOT/build.bat")" ;;
    *)  local out=mondo; is_windows && out=mondo.exe
        "$cc" -O2 -Wall -D_CRT_SECURE_NO_WARNINGS -o "$out" mondo.c cJSON.c -lm
        ok "built $out" ;;
  esac
}
mondo_bin() {
  if [ -x ./mondo.exe ]; then echo ./mondo.exe; elif [ -x ./mondo ]; then echo ./mondo
  else die "mondo isn't built: ./master-control.sh build c"; fi
}

# ── probes: hardware test patches ───────────────────────────
# A probe set is a folder of patches in sandbox/ (gitignored) that differ in
# one array slot: built to .aif, copied to the OP-1, and read off its screen.
# Pulling the set back shows what the device itself saved. Exports that
# become ground truth go into oracle/ by hand; nothing here writes there.
probe_dir() {
  [ -n "${1:-}" ] || die "which probe set? ./master-control.sh probe list"
  [ -d "sandbox/$1" ] || die "no probe set sandbox/$1 (./master-control.sh probe list)"
}
# Only the set's own .json files: mondo build <dir> recurses and overwrites,
# which would rebuild the device's exports in from-device/.
probe_build() {
  probe_dir "$1"
  local bin f n=0; bin=$(mondo_bin)
  for f in "sandbox/$1"/*.json; do
    [ -e "$f" ] || continue
    rm -f "${f%.json}.aif"
    "$bin" build "$f" >/dev/null || die "mondo build failed: $f"
    n=$((n+1))
  done
  ok "built $n patch(es) in sandbox/$1"
}
cmd_probe() {
  local sub=${1:-list}; shift || true
  local bin
  case "$sub" in
    list)
      if [ -d sandbox ] && [ -n "$(ls -A sandbox 2>/dev/null)" ]; then
        local d; for d in sandbox/*/; do printf '  %-24s %s patch(es)\n' "$(basename "$d")" "$(ls "$d" | grep -c '\.aif$')"; done
      else echo "  (no probe sets yet: ./master-control.sh probe sweep ...)"; fi ;;
    sweep)
      [ $# -ge 5 ] || die "probe sweep <base.json> <array> <index> <v1,v2,...> <name>"
      node scripts/mc/probe-sweep.mjs "$@"
      probe_build "$5" ;;
    build) probe_build "${1:-}" ;;
    push)
      probe_dir "${1:-}"; bin=$(mondo_bin)
      "$bin" op1 mkdir -p "synth/_$1" >/dev/null
      local f n=0
      for f in "sandbox/$1"/*.aif; do
        [ -e "$f" ] || continue
        "$bin" op1 push -f "$f" "synth/_$1" >/dev/null || die "push failed: $f"
        n=$((n+1))
      done
      ok "pushed $n patch(es) to synth/_$1 on the OP-1" ;;
    pull)
      probe_dir "${1:-}"; bin=$(mondo_bin)
      rm -rf "sandbox/$1/from-device"
      "$bin" op1 pull "synth/_$1" "sandbox/$1/from-device" >/dev/null || die "pull failed (is synth/_$1 on the device?)"
      local f n=0
      for f in "sandbox/$1/from-device"/*.aif; do [ -e "$f" ] || continue; "$bin" dump "$f" >/dev/null; n=$((n+1)); done
      ok "pulled $n patch(es) into sandbox/$1/from-device (with .json sidecars)" ;;
    clean)
      [ -n "${1:-}" ] || die "probe clean <name>"
      "$(mondo_bin)" op1 rm -r "synth/_$1" ;;
    *) die "probe list | sweep | build | push | pull | clean" ;;
  esac
}

# ── database ────────────────────────────────────────────────
cmd_db() {
  local sub=${1:-}; shift || true
  case "$sub" in
    migrate)
      if [ "${1:-}" = "--remote" ]; then
        confirm "Apply migrations to the PRODUCTION database?" || die "cancelled"
        wrangler d1 migrations apply "$DB" --remote
      else wrangler d1 migrations apply "$DB" --local; fi ;;
    seed)
      if [ "${1:-}" = "--remote" ]; then
        confirm "Seed the PRODUCTION database from samples.js?" || die "cancelled"
        node scripts/seed.mjs --remote
      else node scripts/seed.mjs --local; fi ;;
    volume) node scripts/seed-volume.mjs "$@" ;;
    reset)
      confirm "Delete every row in the LOCAL database and re-apply migrations?" || die "cancelled"
      [ -z "$(port_pids 8788)" ] || die "stop the dev server first (it holds the database): ./master-control.sh dev down"
      rm -rf .wrangler/state/v3/d1
      wrangler d1 migrations apply "$DB" --local
      ok "local database reset (dev login personas are recreated on first sign-in)" ;;
    sql)
      [ $# -ge 1 ] || die 'usage: db sql "<sql>"'
      wrangler d1 execute "$DB" --local --command "$1" ;;
    *) die "unknown db command: '$sub' (migrate, seed, volume, reset, sql)" ;;
  esac
}

# ── ship ────────────────────────────────────────────────────
cmd_prod_check() {
  local fails=0 path out code ms
  say "Checking $PROD"
  for path in / /library /library/packs /library/editor /lab /lab/layout /lab/mappings /lab/inspector "/api/patches" "/api/patches/counts"; do
    out=$(curl -s -o /dev/null -m 15 -w '%{http_code} %{time_total}' "$PROD$path" || true)
    code=${out%% *}
    ms=$(awk -v t="${out#* }" 'BEGIN { printf "%d", t * 1000 }')
    if [ "$code" = "200" ]; then ok "$(printf '%-22s %s  %5d ms' "$path" "$code" "$ms")"
    else bad "$(printf '%-22s %s' "$path" "${code:-no answer}")"; fails=$((fails+1)); fi
  done
  [ "$fails" -eq 0 ] || die "$fails page(s) didn't answer 200"
}

cmd_deploy() {
  have gh || die "deploy follows the CI run with gh (https://cli.github.com)"
  [ "$(git rev-parse --abbrev-ref HEAD)" = "master" ] || die "deploys come from master; you're on $(git rev-parse --abbrev-ref HEAD)"
  [ -z "$(git status --porcelain --untracked-files=no)" ] || die "uncommitted changes to tracked files: commit or stash them first"
  local sha; sha=$(git rev-parse HEAD)
  say "Pushing master ($(git log -1 --format='%h %s'))"
  git push origin master
  say "Waiting for the Deploy workflow run for ${sha:0:7}"
  local id="" i
  for i in $(seq 1 30); do
    id=$(gh run list --workflow deploy.yml --commit "$sha" -L 1 --json databaseId -q '.[0].databaseId' 2>/dev/null || true)
    [ -n "$id" ] && break
    sleep 2
  done
  [ -n "$id" ] || die "no Deploy run showed up for $sha (was it already deployed? see: ./master-control.sh deploy status)"
  gh run watch "$id" --exit-status
  cmd_prod_check
}

# ── dispatch ────────────────────────────────────────────────
main() {
  local cmd=${1:-help}; shift || true
  case "$cmd" in
    help|-h|--help) usage ;;
    setup)  cmd_setup ;;
    doctor) cmd_doctor ;;
    dev)
      local sub=${1:-status}; shift || true
      case "$sub" in
        up) cmd_dev_up ;; down) cmd_dev_down ;; status) cmd_dev_status ;;
        restart) cmd_dev_down; cmd_dev_up ;; logs) cmd_dev_logs ;; login) cmd_dev_login "$@" ;;
        *) die "unknown dev command: '$sub' (up, down, status, restart, logs, login)" ;;
      esac ;;
    build)
      case "${1:-}" in
        c) cmd_build_c ;;
        web) npm run build ;;
        all) cmd_build_c; npm run typecheck; npm run build ;;
        *) die "build what? c, web or all" ;;
      esac ;;
    webapp)
      case "${1:-}" in
        typecheck) npm run typecheck ;;
        build) npm run build ;;
        *) die "webapp typecheck | webapp build" ;;
      esac ;;
    c)
      local sub=${1:-}; shift || true
      case "$sub" in
        dump)
          local bin target f n=0; bin=$(mondo_bin); target=${1:-presets}
          if [ -d "$target" ]; then
            for f in "$target"/*.aif; do [ -e "$f" ] || continue; "$bin" dump "$f"; n=$((n+1)); done
            say "dumped $n file(s)"
          else "$bin" dump "$target"; fi ;;
        samples) "$(mondo_bin)" samples collection samples.js ;;
        *) die "c dump <file|dir> | c samples" ;;
      esac ;;
    op1) "$(mondo_bin)" op1 "$@" ;;
    probe) cmd_probe "$@" ;;
    db) cmd_db "$@" ;;
    test)
      case "${1:-}" in
        website) shift; node scripts/mc/smoke.mjs "$@" ;;
        *) die "test website" ;;
      esac ;;
    smoke) node scripts/mc/smoke.mjs "$@" ;;
    shot) node scripts/mc/shot.mjs "$@" ;;
    deploy)
      case "${1:-}" in
        "") cmd_deploy ;;
        status) gh run list --workflow deploy.yml -L 5 ;;
        *) die "deploy | deploy status" ;;
      esac ;;
    prod)
      case "${1:-}" in check) cmd_prod_check ;; *) die "prod check" ;; esac ;;
    *) usage; echo; die "unknown command: '$cmd'" ;;
  esac
}

main "$@"
