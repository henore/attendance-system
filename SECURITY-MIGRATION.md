# 🔐 セキュリティ移行ガイド

## 緊急対応が必要な項目

### 1. 環境変数ファイルの機密情報漏洩対策

**現在の状況**: `.env`ファイルがGitリポジトリにコミットされており、機密情報が公開されています。

**即座に実行してください**:

1. **LINE APIトークンのローテーション**
   ```bash
   # LINE Developersコンソールで新しいアクセストークンを生成
   # 古いトークンを無効化
   ```

2. **新しい環境変数ファイルの作成**
   ```bash
   cp .env.example .env
   # .envファイルを編集し、新しい機密情報を設定
   ```

3. **セッションシークレットの変更**
   ```bash
   # .envファイルに強力なランダム文字列を設定
   SESSION_SECRET=$(openssl rand -base64 32)
   ```

### 2. 現在のリポジトリから.envを削除

```bash
# 現在のリポジトリから.envファイルを削除
git rm --cached .env
git add .gitignore
git commit -m "🔒 セキュリティ: .envファイルを除外し機密情報を保護"
git push origin main
```

## セキュリティ強化項目

### 実装済み ✅
- Helmet.jsによるセキュリティヘッダー設定
- bcryptによるパスワードハッシュ化
- SQLインジェクション対策（プリペアードステートメント）
- XSS対策の基本実装

### 今回追加予定 🚧
- [ ] セッションストレージのSQLite移行
- [ ] CSRF保護の実装
- [ ] 入力バリデーション強化
- [ ] bcryptコスト設定可能化
- [ ] CSP自動生成

### 本番環境推奨設定 📋

#### 環境変数
```bash
NODE_ENV=production
SESSION_SECURE=true
SESSION_SAME_SITE=strict
BCRYPT_SALT_ROUNDS=14
```

#### HTTPSの設定
```bash
# リバースプロキシ（Nginx/Apache）でHTTPS終端
# Let's Encryptでの証明書自動更新
```

#### ファイアウォール
```bash
# 必要なポートのみ開放
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

## 監視とログ

### アクセスログ
```javascript
// Morgan設定の強化
app.use(morgan('combined', {
  stream: fs.createWriteStream('./logs/access.log', { flags: 'a' })
}));
```

### セキュリティログ
```javascript
// 異常なアクセスパターンの検知
// 失敗ログイン試行の監視
// CSRFトークン不正使用の記録
```

## 定期的なセキュリティチェック

1. **依存関係の脆弱性チェック**
   ```bash
   npm audit
   npm audit fix
   ```

2. **アクセスログの確認**
   ```bash
   # 異常なアクセスパターンの監視
   tail -f logs/access.log
   ```

3. **データベースバックアップ**
   ```bash
   # 定期的なSQLiteファイルのバックアップ
   cp database/attendance.db backups/attendance_$(date +%Y%m%d).db
   ```

## 緊急時の対応手順

### 1. 不正アクセス検知時
```bash
# 該当IPのブロック
iptables -A INPUT -s <不正IP> -j DROP

# セッションの無効化
rm database/sessions.db
```

### 2. データ漏洩疑いの場合
```bash
# 全ユーザーのパスワードリセット強制
# LINE APIトークンの即座ローテーション
# アクセスログの詳細分析
```

---

**注意**: この移行は段階的に実行し、各ステップで動作確認を行ってください。