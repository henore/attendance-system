#!/bin/bash
# scripts/secure-database.sh
# データベースファイルのセキュリティ設定スクリプト

echo "🔒 データベースセキュリティ設定を開始..."

# データベースディレクトリの作成（存在しない場合）
if [ ! -d "database" ]; then
    mkdir -p database
    echo "✅ データベースディレクトリを作成しました"
fi

# ディレクトリ権限の設定（オーナーのみアクセス可能）
chmod 700 database/
echo "✅ データベースディレクトリの権限を700に設定しました"

# データベースファイルの権限設定（オーナーのみ読み書き可能）
if [ -f "database/attendance.db" ]; then
    chmod 600 database/attendance.db
    echo "✅ attendance.dbの権限を600に設定しました"
fi

if [ -f "database/sessions.db" ]; then
    chmod 600 database/sessions.db
    echo "✅ sessions.dbの権限を600に設定しました"
fi

# 認証情報ファイルの権限設定（存在する場合）
if [ -f "database/initial-credentials.txt" ]; then
    chmod 600 database/initial-credentials.txt
    echo "✅ initial-credentials.txtの権限を600に設定しました"
fi

# 現在の権限を確認
echo ""
echo "📋 現在のファイル権限:"
ls -la database/

echo ""
echo "🔐 セキュリティ設定完了!"
echo "⚠️  本番環境では以下の追加セキュリティ対策を推奨:"
echo "   - ファイアウォールの設定"
echo "   - 定期的なバックアップ"
echo "   - ログ監視の設定"
echo "   - SSL/TLS証明書の設定"