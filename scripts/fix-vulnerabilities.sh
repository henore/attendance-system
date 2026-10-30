#!/bin/bash
# =============================================================
# 脆弱性修正スクリプト (Ubuntu/WSL2用)
# 実行方法: bash scripts/fix-vulnerabilities.sh
# =============================================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "============================================="
echo " 脆弱性修正スクリプト"
echo " プロジェクト: $PROJECT_DIR"
echo " 実行日時: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================="
echo ""

# -------------------------------------------------------------
# Step 0: 事前バックアップ
# -------------------------------------------------------------
echo "[Step 0] package.json / package-lock.json のバックアップ..."
cp package.json package.json.bak
cp package-lock.json package-lock.json.bak
echo "  -> package.json.bak, package-lock.json.bak を作成"
echo ""

# -------------------------------------------------------------
# Step 1: 不要パッケージの削除 (extraneous)
# -------------------------------------------------------------
echo "[Step 1] 不要パッケージの削除 (npm prune)..."
echo "  puppeteer, sharp 等のコードで未使用な残存パッケージを除去"
npm prune 2>&1 | tail -5
echo "  -> 完了"
echo ""

# -------------------------------------------------------------
# Step 2: 互換性のある脆弱性修正
# -------------------------------------------------------------
echo "[Step 2] 互換性のある脆弱性修正 (npm audit fix)..."
npm audit fix 2>&1 | tail -10
echo "  -> 完了"
echo ""

# -------------------------------------------------------------
# Step 3: 直接依存パッケージのアップグレード
# -------------------------------------------------------------
echo "[Step 3] 直接依存パッケージのアップグレード..."

echo "  3-1) express 4.x -> 最新4.x (body-parser, qs, path-to-regexp 修正含む)..."
npm install express@latest 2>&1 | tail -3

echo "  3-2) express-session -> 最新版..."
npm install express-session@latest 2>&1 | tail -3

echo "  3-3) multer -> 最新版 (DoS脆弱性修正)..."
npm install multer@latest 2>&1 | tail -3

echo "  3-4) morgan -> 最新版 (ログフォージング修正)..."
npm install morgan@latest 2>&1 | tail -3

echo "  3-5) sqlite3 -> 最新版..."
npm install sqlite3@latest 2>&1 | tail -3

echo "  3-6) helmet -> 最新版..."
npm install helmet@latest 2>&1 | tail -3

echo "  3-7) @line/bot-sdk -> 最新版 (axios脆弱性解消)..."
npm install @line/bot-sdk@latest 2>&1 | tail -3

echo "  3-8) exceljs -> 最新版 (uuid脆弱性解消)..."
npm install exceljs@latest 2>&1 | tail -3

echo "  -> 完了"
echo ""

# -------------------------------------------------------------
# Step 4: レート制限パッケージの追加
# -------------------------------------------------------------
echo "[Step 4] express-rate-limit の追加 (ブルートフォース対策)..."
npm install express-rate-limit 2>&1 | tail -3
echo "  -> 完了"
echo ""

# -------------------------------------------------------------
# Step 5: 修正後の監査結果
# -------------------------------------------------------------
echo "[Step 5] 修正後の脆弱性チェック..."
echo ""
npm audit 2>&1 | tail -15
echo ""

# -------------------------------------------------------------
# Step 6: Node.js バージョン確認
# -------------------------------------------------------------
echo "[Step 6] 環境情報..."
echo "  Node.js: $(node -v)"
echo "  npm:     $(npm -v)"
echo ""

# -------------------------------------------------------------
# Step 7: 動作確認 (依存関係の読み込みテスト)
# -------------------------------------------------------------
echo "[Step 7] 依存関係の読み込みテスト..."
node -e "
  const modules = [
    'express', 'express-session', 'multer', 'morgan',
    'sqlite3', 'helmet', 'cors', 'bcryptjs',
    'exceljs', 'pdfkit', 'dotenv', 'express-rate-limit'
  ];
  let ok = 0, ng = 0;
  for (const m of modules) {
    try { require(m); ok++; }
    catch(e) { console.error('  NG: ' + m + ' - ' + e.message); ng++; }
  }
  console.log('  結果: ' + ok + ' 成功 / ' + ng + ' 失敗');
" 2>&1
echo ""

# -------------------------------------------------------------
# 完了
# -------------------------------------------------------------
echo "============================================="
echo " 修正完了"
echo "============================================="
echo ""
echo "次のステップ (コード修正が必要な項目):"
echo "  1. trust proxy の設定を制限     (server.js:18)"
echo "  2. CORS二重設定の整理           (server.js:20-24, 102-105)"
echo "  3. express-rate-limit の適用     (server.js / routes/auth.js)"
echo "  4. セッションシークレットの確認  (server.js:124)"
echo ""
echo "ロールバック方法:"
echo "  cp package.json.bak package.json"
echo "  cp package-lock.json.bak package-lock.json"
echo "  npm install"
echo ""
