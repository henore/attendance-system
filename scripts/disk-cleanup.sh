#!/bin/bash

# ディスククリーンアップスクリプト
# 使用法: sudo bash disk-cleanup.sh
# cron例: 0 3 * * * /usr/local/bin/disk-cleanup.sh

# 設定
PROJECT_DIR="/home/ubuntu/attendance-system"
LOG_FILE="/var/log/disk-cleanup.log"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

log "=== クリーンアップ開始 ==="

# temp/ 内の生成画像（1時間以上前）
find "${PROJECT_DIR}/temp" -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.webp" \) -mmin +60 -delete 2>/dev/null
log "temp画像クリーンアップ完了"

# npm キャッシュ
npm cache clean --force 2>/dev/null
log "npmキャッシュ削除完了"

# apt キャッシュ
apt-get clean -y 2>/dev/null
log "aptキャッシュ削除完了"

# journal ログ 50MBに制限
journalctl --vacuum-size=50M 2>/dev/null
log "journalログ削減完了"

# snap 古いリビジョン
snap list --all 2>/dev/null | awk '/disabled/{print $1, $3}' | while read name rev; do
    snap remove "$name" --revision="$rev" 2>/dev/null
done
log "snap古いリビジョン削除完了"

# /tmp の古いファイル（1日以上前）
find /tmp -type f -mtime +1 -delete 2>/dev/null
log "/tmpクリーンアップ完了"

# 古いローテーション済みログ（7日以上前の.gz/.1等）
find /var/log -type f \( -name "*.gz" -o -name "*.1" -o -name "*.old" \) -mtime +7 -delete 2>/dev/null
log "古いローテーションログ削除完了"

AVAIL=$(df / --output=avail -h | tail -1 | tr -d ' ')
log "=== クリーンアップ完了: 空き容量 ${AVAIL} ==="
