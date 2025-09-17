#!/bin/bash

# データベースバックアップスクリプト
# 使用法: ./backup-db.sh

# 設定
PROJECT_DIR="/home/ubuntu/attendance-system"
DB_DIR="${PROJECT_DIR}/database"
BACKUP_DIR="${PROJECT_DIR}/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_SUBDIR="${BACKUP_DIR}/${DATE}"

# ログ設定
LOG_FILE="${PROJECT_DIR}/logs/backup.log"
mkdir -p "$(dirname "$LOG_FILE")"

# ログ関数
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1" | tee -a "$LOG_FILE"
}

# バックアップディレクトリ作成
mkdir -p "$BACKUP_SUBDIR"

log "データベースバックアップ開始"

# SQLiteデータベースファイルをバックアップ
for db_file in attendance.db sessions.db; do
    if [ -f "${DB_DIR}/${db_file}" ]; then
        log "バックアップ中: ${db_file}"

        # SQLiteの.backupコマンドを使用（安全なバックアップ）
        sqlite3 "${DB_DIR}/${db_file}" ".backup '${BACKUP_SUBDIR}/${db_file}'"

        if [ $? -eq 0 ]; then
            # 圧縮してサイズを削減
            gzip "${BACKUP_SUBDIR}/${db_file}"
            log "バックアップ完了: ${db_file}.gz"
        else
            log "ERROR: ${db_file} のバックアップに失敗"
        fi
    else
        log "WARNING: ${db_file} が見つかりません"
    fi
done

# 古いバックアップを削除（30日より古いもの）
log "古いバックアップの削除中..."
find "$BACKUP_DIR" -type d -name "20*" -mtime +30 -exec rm -rf {} \; 2>/dev/null

# バックアップサイズの確認
BACKUP_SIZE=$(du -sh "$BACKUP_SUBDIR" | cut -f1)
log "バックアップ完了: ${BACKUP_SUBDIR} (${BACKUP_SIZE})"

log "データベースバックアップ終了"