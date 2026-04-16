#!/bin/bash

# 依存を全消しして完全再インストールするスクリプト
# 使用法:
#   bash clean-reinstall.sh              # git pull してから再インストール（push検知時）
#   bash clean-reinstall.sh --no-pull    # git pull をスキップ（日曜4時cron等）
#
# cron例:
#   */5 * * * * /home/ubuntu/attendance-system/scripts/auto-deploy.sh    # push検知→本スクリプト呼出
#   0 4 * * 0   /home/ubuntu/attendance-system/scripts/clean-reinstall.sh --no-pull

set -euo pipefail

# 設定
PROJECT_DIR="/home/ubuntu/attendance-system"
LOG_DIR="${PROJECT_DIR}/logs"
LOG_FILE="${LOG_DIR}/clean-reinstall.log"
LOCK_FILE="/tmp/attendance-clean-reinstall.lock"
PM2_APP_NAME="attendance-system"   # PM2プロセス名。異なる場合はここを修正

# cron から呼ばれた場合に HOME と PATH を明示（ログインシェルと環境が異なるため）
export HOME="/home/ubuntu"
if [ -d "$HOME/.nvm/versions/node" ]; then
    LATEST_NODE_DIR=$(ls "$HOME/.nvm/versions/node" | sort -V | tail -1)
    export PATH="$HOME/.nvm/versions/node/${LATEST_NODE_DIR}/bin:$PATH"
fi
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

# --no-pull 判定
DO_PULL=1
if [ "${1:-}" = "--no-pull" ]; then
    DO_PULL=0
fi

mkdir -p "$LOG_DIR"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1" | tee -a "$LOG_FILE"
}

# 多重起動防止（flockで排他、他が走っていれば静かに終了）
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    log "他プロセスが実行中のためスキップ"
    exit 0
fi

log "===== 再インストール開始 (pull=${DO_PULL}) ====="

cd "$PROJECT_DIR"

# Git最新化
if [ "$DO_PULL" -eq 1 ]; then
    log "git reset --hard HEAD"
    git reset --hard HEAD >> "$LOG_FILE" 2>&1
    log "git pull origin main"
    git pull origin main >> "$LOG_FILE" 2>&1
else
    log "git pull をスキップ（--no-pull）"
fi

# 依存とキャッシュを全消去
log "node_modules と package-lock.json を削除"
rm -rf node_modules package-lock.json

log "~/.cache/puppeteer を削除"
rm -rf "$HOME/.cache/puppeteer"

# 再インストール
log "npm install"
npm install >> "$LOG_FILE" 2>&1

log "npm install sharp"
npm install sharp >> "$LOG_FILE" 2>&1

log "npm install puppeteer"
npm install puppeteer >> "$LOG_FILE" 2>&1

# PM2でアプリ再起動（プロセスが無ければ起動）
if pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
    log "pm2 restart ${PM2_APP_NAME}"
    pm2 restart "$PM2_APP_NAME" --update-env >> "$LOG_FILE" 2>&1 || log "WARN: pm2 restart 失敗"
else
    log "pm2 プロセス未登録のため start（${PM2_APP_NAME}）"
    pm2 start "${PROJECT_DIR}/server.js" --name "$PM2_APP_NAME" >> "$LOG_FILE" 2>&1 || log "WARN: pm2 start 失敗"
fi

# 再起動状態を保存（サーバー再起動時の復帰用）
pm2 save >> "$LOG_FILE" 2>&1 || true

log "===== 再インストール完了 ====="
