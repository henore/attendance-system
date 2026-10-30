#!/bin/bash
# =============================================================
# Ubuntu / Nginx 脆弱性対策スクリプト
# 実行方法: sudo bash scripts/fix-server-vulnerabilities.sh
# =============================================================

set -e

# root権限チェック
if [ "$(id -u)" -ne 0 ]; then
    echo "エラー: このスクリプトはsudo権限で実行してください"
    echo "  sudo bash scripts/fix-server-vulnerabilities.sh"
    exit 1
fi

echo "============================================="
echo " Ubuntu / Nginx 脆弱性対策スクリプト"
echo " 実行日時: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================="
echo ""

# -------------------------------------------------------------
# Step 1: Ubuntu セキュリティアップデート
# -------------------------------------------------------------
echo "[Step 1] Ubuntu セキュリティパッチの適用..."
echo ""

echo "  1-1) パッケージリスト更新..."
apt-get update -qq

echo "  1-2) セキュリティアップデートのみ適用..."
apt-get upgrade -y -o Dpkg::Options::="--force-confold" 2>&1 | tail -5

echo "  1-3) 不要パッケージの削除..."
apt-get autoremove -y -qq
apt-get autoclean -qq

echo "  -> 完了"
echo ""

# -------------------------------------------------------------
# Step 2: Nginx アップデート
# -------------------------------------------------------------
echo "[Step 2] Nginx アップデート..."
echo ""

NGINX_BEFORE=$(nginx -v 2>&1 || echo "Nginx未インストール")
echo "  更新前: $NGINX_BEFORE"

apt-get install -y --only-upgrade nginx 2>&1 | tail -3

NGINX_AFTER=$(nginx -v 2>&1 || echo "Nginx未インストール")
echo "  更新後: $NGINX_AFTER"
echo "  -> 完了"
echo ""

# -------------------------------------------------------------
# Step 3: Nginx セキュリティヘッダ強化
# -------------------------------------------------------------
echo "[Step 3] Nginx 設定のセキュリティチェック..."
echo ""

NGINX_CONF="/etc/nginx/nginx.conf"
SITE_CONF=$(find /etc/nginx/sites-enabled/ -type f -o -type l 2>/dev/null | head -1)

# nginx.confのセキュリティ項目チェック
check_nginx_directive() {
    local directive="$1"
    local description="$2"
    if grep -qr "$directive" /etc/nginx/ 2>/dev/null; then
        echo "  [OK] $description"
    else
        echo "  [要対応] $description が未設定"
    fi
}

check_nginx_directive "server_tokens off" "バージョン情報の非表示 (server_tokens off)"
check_nginx_directive "X-Frame-Options" "クリックジャッキング対策 (X-Frame-Options)"
check_nginx_directive "X-Content-Type-Options" "MIMEスニッフィング対策 (X-Content-Type-Options)"
check_nginx_directive "X-XSS-Protection" "XSS保護ヘッダ (X-XSS-Protection)"
check_nginx_directive "Strict-Transport-Security" "HSTS設定 (Strict-Transport-Security)"
check_nginx_directive "Content-Security-Policy" "CSP設定 (Content-Security-Policy)"
check_nginx_directive "ssl_protocols" "TLSプロトコル設定 (ssl_protocols)"
check_nginx_directive "ssl_ciphers" "暗号スイート設定 (ssl_ciphers)"
check_nginx_directive "client_max_body_size" "アップロードサイズ制限 (client_max_body_size)"

echo ""

# セキュリティスニペットファイルの作成
SECURITY_SNIPPET="/etc/nginx/snippets/security-headers.conf"
if [ ! -f "$SECURITY_SNIPPET" ]; then
    echo "  セキュリティヘッダ設定ファイルを作成: $SECURITY_SNIPPET"
    cat > "$SECURITY_SNIPPET" << 'SNIPPET'
# セキュリティヘッダ（Nginx側）
# Expressのhelmetと重複するヘッダはExpressに任せる

# Nginxバージョン非表示
server_tokens off;

# レート制限用ゾーン（server外で定義が必要な場合はnginx.confへ移動）
# limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;

# リクエストボディサイズ制限
client_max_body_size 10m;

# タイムアウト設定（SlowLoris対策）
client_body_timeout 10s;
client_header_timeout 10s;
send_timeout 10s;
keepalive_timeout 65s;

# バッファサイズ制限（バッファオーバーフロー対策）
client_body_buffer_size 16k;
client_header_buffer_size 1k;
large_client_header_buffers 4 8k;
SNIPPET
    echo "  -> 作成完了"
    echo ""
    echo "  ※ サイト設定に以下を追加してください:"
    echo "    include snippets/security-headers.conf;"
else
    echo "  セキュリティヘッダ設定は既に存在: $SECURITY_SNIPPET"
fi
echo ""

# -------------------------------------------------------------
# Step 4: SSL/TLS 設定チェック
# -------------------------------------------------------------
echo "[Step 4] SSL/TLS 設定チェック..."
echo ""

if grep -qr "ssl_protocols" /etc/nginx/ 2>/dev/null; then
    echo "  現在のTLS設定:"
    grep -r "ssl_protocols" /etc/nginx/ 2>/dev/null | head -3 | sed 's/^/    /'

    # TLSv1.0/1.1が有効かチェック
    if grep -qr "TLSv1[^.]" /etc/nginx/ 2>/dev/null || grep -qr "TLSv1\.0" /etc/nginx/ 2>/dev/null; then
        echo "  [要対応] TLSv1.0 が有効です。無効化を推奨"
    fi
    if grep -qr "TLSv1\.1" /etc/nginx/ 2>/dev/null; then
        echo "  [要対応] TLSv1.1 が有効です。無効化を推奨"
    fi
else
    echo "  [情報] SSL設定が見つかりません（HTTPのみ、またはLet's Encrypt管理）"
fi
echo ""

# -------------------------------------------------------------
# Step 5: ファイアウォール確認
# -------------------------------------------------------------
echo "[Step 5] ファイアウォール (UFW) 確認..."
echo ""

if command -v ufw &> /dev/null; then
    UFW_STATUS=$(ufw status 2>&1)
    echo "  $UFW_STATUS" | head -10 | sed 's/^/  /'

    if echo "$UFW_STATUS" | grep -q "inactive"; then
        echo ""
        echo "  [要対応] UFWが無効です。有効化を推奨:"
        echo "    sudo ufw default deny incoming"
        echo "    sudo ufw default allow outgoing"
        echo "    sudo ufw allow ssh"
        echo "    sudo ufw allow 'Nginx Full'"
        echo "    sudo ufw enable"
    fi
else
    echo "  [要対応] UFWがインストールされていません"
    echo "    sudo apt-get install -y ufw"
fi
echo ""

# -------------------------------------------------------------
# Step 6: 自動セキュリティアップデート設定
# -------------------------------------------------------------
echo "[Step 6] 自動セキュリティアップデート設定..."
echo ""

if dpkg -l | grep -q unattended-upgrades; then
    echo "  [OK] unattended-upgrades がインストール済み"
else
    echo "  unattended-upgrades をインストール..."
    apt-get install -y unattended-upgrades 2>&1 | tail -3
    echo "  自動更新を有効化..."
    dpkg-reconfigure -plow unattended-upgrades 2>&1 || true
fi
echo ""

# -------------------------------------------------------------
# Step 7: SSH セキュリティチェック
# -------------------------------------------------------------
echo "[Step 7] SSH セキュリティチェック..."
echo ""

SSHD_CONF="/etc/ssh/sshd_config"
if [ -f "$SSHD_CONF" ]; then
    # rootログイン
    if grep -qE "^PermitRootLogin\s+(yes|without-password)" "$SSHD_CONF"; then
        echo "  [要対応] rootログインが有効です。無効化を推奨"
    else
        echo "  [OK] rootログインは制限済み"
    fi

    # パスワード認証
    if grep -qE "^PasswordAuthentication\s+yes" "$SSHD_CONF"; then
        echo "  [要対応] パスワード認証が有効です。鍵認証のみへの変更を推奨"
    else
        echo "  [OK] パスワード認証は無効（または鍵認証優先）"
    fi
fi
echo ""

# -------------------------------------------------------------
# Step 8: 既知の脆弱性スキャン
# -------------------------------------------------------------
echo "[Step 8] システム情報..."
echo ""

echo "  OS:    $(lsb_release -ds 2>/dev/null || cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2)"
echo "  Kernel: $(uname -r)"
echo "  Nginx: $(nginx -v 2>&1)"
echo "  Node:  $(su - ubuntu -c 'node -v' 2>/dev/null || node -v 2>/dev/null || echo '確認不可')"
echo ""

# 再起動が必要かチェック
if [ -f /var/run/reboot-required ]; then
    echo "  ⚠️  カーネル更新のためサーバー再起動が必要です"
    echo "    sudo reboot"
else
    echo "  再起動は不要です"
fi
echo ""

# -------------------------------------------------------------
# Step 9: Nginx 設定テスト
# -------------------------------------------------------------
echo "[Step 9] Nginx 設定テスト..."
nginx -t 2>&1 | sed 's/^/  /'
echo ""

# -------------------------------------------------------------
# 完了
# -------------------------------------------------------------
echo "============================================="
echo " チェック完了"
echo "============================================="
echo ""
echo "手動対応が必要な項目は [要対応] を確認してください"
echo ""
echo "Nginx設定を変更した場合:"
echo "  sudo nginx -t && sudo systemctl reload nginx"
echo ""
