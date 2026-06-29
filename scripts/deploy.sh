#!/usr/bin/env bash
#
# deploy.sh — 英文學習平台 Docker 部署 / 啟用輔助腳本
#
# 目標機器：家中 Mac Mini（Apple Silicon / arm64）。
# 這支腳本把日常會用到的 docker compose 操作包成子命令，並加上防呆：
#   - 自動從 .env.example 建立 .env（若不存在）
#   - 確認 Docker daemon 有啟動
#   - 啟動後等待所有服務變成 healthy 才回報成功
#
# 用法：
#   ./scripts/deploy.sh up        # 建置（如有需要）並啟動所有服務，等待 healthy
#   ./scripts/deploy.sh deploy    # 重新拉取最新 image / 重建並啟動（部署用）
#   ./scripts/deploy.sh rebuild   # 強制不使用快取重建後啟動
#   ./scripts/deploy.sh down      # 停止並移除容器（保留資料 volume）
#   ./scripts/deploy.sh restart   # 重啟所有服務
#   ./scripts/deploy.sh status    # 顯示各服務狀態
#   ./scripts/deploy.sh health    # 只檢查 / 等待 healthy
#   ./scripts/deploy.sh logs [svc]# 跟看日誌（可指定服務名）
#   ./scripts/deploy.sh ps        # docker compose ps 簡寫
#   ./scripts/deploy.sh clean     # 停止並移除容器＋資料 volume（會清空 DB！）
#
set -euo pipefail

# --- 路徑：永遠以 repo 根目錄為基準，不管從哪裡呼叫 ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# --- 顏色輸出（非 TTY 時自動關閉）---
if [ -t 1 ]; then
  C_RESET="\033[0m"; C_INFO="\033[36m"; C_OK="\033[32m"; C_WARN="\033[33m"; C_ERR="\033[31m"
else
  C_RESET=""; C_INFO=""; C_OK=""; C_WARN=""; C_ERR=""
fi
log()  { printf "${C_INFO}▶ %s${C_RESET}\n" "$*"; }
ok()   { printf "${C_OK}✔ %s${C_RESET}\n" "$*"; }
warn() { printf "${C_WARN}⚠ %s${C_RESET}\n" "$*"; }
die()  { printf "${C_ERR}✘ %s${C_RESET}\n" "$*" >&2; exit 1; }

# --- docker compose 指令偵測（新版 plugin vs 舊版 docker-compose）---
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  die "找不到 docker compose，請先安裝 Docker Desktop / Docker Engine。"
fi

# --- 前置檢查：Docker daemon 是否在線 ---
ensure_docker() {
  if docker info >/dev/null 2>&1; then
    return
  fi
  warn "Docker daemon 尚未啟動，嘗試開啟 Docker Desktop…"
  if [ "$(uname)" = "Darwin" ]; then
    open -a Docker 2>/dev/null || true
  fi
  log "等待 Docker daemon 就緒…"
  for _ in $(seq 1 60); do
    if docker info >/dev/null 2>&1; then ok "Docker daemon 已就緒"; return; fi
    sleep 2
  done
  die "等待逾時：Docker daemon 仍未啟動。"
}

# --- 確保 .env 存在（部署前一定要有）---
ensure_env() {
  if [ -f .env ]; then
    return
  fi
  if [ -f .env.example ]; then
    cp .env.example .env
    warn ".env 不存在，已從 .env.example 複製一份。請確認其中的金鑰 / 設定是否正確。"
  else
    die "找不到 .env 也找不到 .env.example，無法繼續。"
  fi
}

# --- 等待所有服務 healthy ---
# 沒有 healthcheck 的服務只要 running 即視為通過。
wait_healthy() {
  local timeout="${1:-180}"
  log "等待服務變成 healthy（最多 ${timeout}s）…"
  local deadline=$(( $(date +%s) + timeout ))
  while :; do
    local ids unhealthy=0 starting=0 total=0
    ids="$("${COMPOSE[@]}" ps -q || true)"
    [ -z "$ids" ] && die "沒有任何容器在執行。"
    while IFS= read -r id; do
      [ -z "$id" ] && continue
      total=$((total + 1))
      local status health
      status="$(docker inspect -f '{{.State.Status}}' "$id" 2>/dev/null || echo "unknown")"
      health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null || echo "none")"
      case "$health" in
        healthy) ;;
        none)    [ "$status" = "running" ] || unhealthy=$((unhealthy + 1)) ;;
        starting) starting=$((starting + 1)) ;;
        *)       unhealthy=$((unhealthy + 1)) ;;
      esac
    done <<< "$ids"

    if [ "$starting" -eq 0 ] && [ "$unhealthy" -eq 0 ]; then
      ok "全部 ${total} 個服務皆 healthy / running。"
      return 0
    fi
    if [ "$(date +%s)" -ge "$deadline" ]; then
      warn "等待逾時，目前狀態："
      "${COMPOSE[@]}" ps
      die "有服務未能在 ${timeout}s 內 healthy。可用 './scripts/deploy.sh logs' 查看原因。"
    fi
    sleep 3
  done
}

cmd_up() {
  ensure_docker; ensure_env
  log "建置（如有需要）並啟動所有服務…"
  "${COMPOSE[@]}" up -d --build
  wait_healthy
  cmd_status
}

cmd_deploy() {
  ensure_docker; ensure_env
  log "部署：拉取 base image 並重建後啟動…"
  "${COMPOSE[@]}" pull --ignore-buildable-images 2>/dev/null || true
  "${COMPOSE[@]}" up -d --build
  wait_healthy
  cmd_status
}

cmd_rebuild() {
  ensure_docker; ensure_env
  log "強制不使用快取重建…"
  "${COMPOSE[@]}" build --no-cache
  "${COMPOSE[@]}" up -d
  wait_healthy
  cmd_status
}

cmd_down()    { ensure_docker; log "停止並移除容器（保留資料）…"; "${COMPOSE[@]}" down; ok "已停止。"; }
cmd_restart() { ensure_docker; log "重啟所有服務…"; "${COMPOSE[@]}" restart; wait_healthy; cmd_status; }
cmd_status()  { ensure_docker; "${COMPOSE[@]}" ps; }
cmd_ps()      { cmd_status; }
cmd_health()  { ensure_docker; wait_healthy; }
cmd_logs()    { ensure_docker; "${COMPOSE[@]}" logs -f --tail=100 "$@"; }

cmd_clean() {
  ensure_docker
  warn "這會移除所有容器與資料 volume（資料庫內容將遺失）。"
  printf "確定要繼續嗎？輸入 yes 確認："
  read -r ans
  [ "$ans" = "yes" ] || { log "已取消。"; return; }
  "${COMPOSE[@]}" down -v
  ok "已清除容器與 volume。"
}

usage() {
  # 印出檔案開頭的註解區塊（第 2 行開始，遇到第一個非註解行就停）。
  awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "${BASH_SOURCE[0]}"
}

main() {
  local sub="${1:-up}"
  [ $# -gt 0 ] && shift || true
  case "$sub" in
    up)       cmd_up "$@" ;;
    deploy)   cmd_deploy "$@" ;;
    rebuild)  cmd_rebuild "$@" ;;
    down)     cmd_down "$@" ;;
    restart)  cmd_restart "$@" ;;
    status)   cmd_status "$@" ;;
    ps)       cmd_ps "$@" ;;
    health)   cmd_health "$@" ;;
    logs)     cmd_logs "$@" ;;
    clean)    cmd_clean "$@" ;;
    -h|--help|help) usage ;;
    *) die "未知子命令：$sub（用 './scripts/deploy.sh help' 查看用法）" ;;
  esac
}

main "$@"
