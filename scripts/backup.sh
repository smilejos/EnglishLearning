#!/usr/bin/env bash
#
# backup.sh — 備份 DB（pg_dump custom format）與 audio volume，輪替保留最近 N 份。
#
# 用法：
#   ./scripts/backup.sh                              # 備份到 ~/EnglishLearningBackups
#   BACKUP_DIR=/Volumes/NAS/elb ./scripts/backup.sh  # 指定目的地（外接碟／NAS）
#   BACKUP_KEEP=14 ./scripts/backup.sh               # 保留最近 14 份（預設 7）
#
# 注意：備份內含使用者 email（users 表），請放在私人儲存空間；
#       如需異地備份，建議先以 age / gpg 加密。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

BACKUP_DIR="${BACKUP_DIR:-$HOME/EnglishLearningBackups}"
BACKUP_KEEP="${BACKUP_KEEP:-7}"
POSTGRES_USER="${POSTGRES_USER:-app}"
POSTGRES_DB="${POSTGRES_DB:-english_learning}"

die() { echo "✘ $*" >&2; exit 1; }

[ -n "$(docker compose ps -q --status running db 2>/dev/null)" ] \
  || die "db 服務未啟動（先 ./scripts/deploy.sh up）"
[ -n "$(docker compose ps -q --status running api 2>/dev/null)" ] \
  || die "api 服務未啟動（audio volume 經由 api 容器複製）"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/$STAMP"
mkdir -p "$OUT"

echo "▶ pg_dump → $OUT/db.dump"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --format=custom > "$OUT/db.dump"

echo "▶ audio volume → $OUT/audio.tgz"
docker compose cp api:/data/audio "$OUT/audio"
tar -czf "$OUT/audio.tgz" -C "$OUT" audio
rm -rf "$OUT/audio"

# 輪替：僅保留最近 BACKUP_KEEP 份（目錄名以數字時間戳開頭）。
ls -1d "$BACKUP_DIR"/[0-9]* 2>/dev/null | sort -r \
  | awk -v keep="$BACKUP_KEEP" 'NR > keep' \
  | while read -r old; do
      echo "▶ 移除過期備份 $old"
      rm -rf "$old"
    done

echo "✔ 備份完成：${OUT}（db.dump + audio.tgz）"
