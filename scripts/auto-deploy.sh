#!/bin/bash

# push を検知して clean-reinstall.sh を自動実行するスクリプト
# 仕組み: origin/main を fetch し、ローカルHEADと差分があれば再インストール実行
# cron例: */5 * * * * /home/ubuntu/attendance-system/scripts/auto-deploy.sh

set -euo pipefail

PROJECT_DIR="/home/ubuntu/attendance-system"
LOG_DIR="${PROJECT_DIR}/logs"
LOG_FILE="${LOG_DIR}/auto-deploy.log"

# cron用 PATH / HOME
export HOME="/home/ubuntu"
if [ -d "$HOME/.nvm/versions/node" ]; then
    LATEST_NODE_DIR=$(ls "$HOME/.nvm/versions/node" | sort -V | tail -1)
    export PATH="$HOME/.nvm/versions/node/${LATEST_NODE_DIR}/bin:$PATH"
fi
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

mkdir -p "$LOG_DIR"
cd "$PROJECT_DIR"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

# リモートの最新を取得
if ! git fetch origin main --quiet 2>> "$LOG_FILE"; then
    log "ERROR: git fetch 失敗"
    exit 1
fi

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

# 差分なしなら静かに終了（ログで埋めない）
if [ "$LOCAL" = "$REMOTE" ]; then
    exit 0
fi

log "新しいコミットを検知: ${LOCAL:0:7} -> ${REMOTE:0:7}"

# clean-reinstall.sh を呼び出し（内部で git pull + 再インストール + pm2 restart）
bash "${PROJECT_DIR}/scripts/clean-reinstall.sh"

log "自動デプロイ完了: $(git rev-parse HEAD | cut -c1-7)"
