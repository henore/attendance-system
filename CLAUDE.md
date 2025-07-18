# プロジェクト開発ガイド

This file provides development guidelines and project documentation for the attendance management system.

## Development Commands

### Database Setup
```bash
# Initialize database and create default users
npm run init-db
```

### Running the Application
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

### Default Users (after database initialization)
⚠️ **セキュリティ重要**: 初期化後、`database/initial-credentials.txt`ファイルに強力なランダムパスワードが生成されます。

初期ユーザー:
- **admin**: 管理者アカウント（20文字ランダムパスワード）
- **staff1**: スタッフアカウント（16文字ランダムパスワード）
- **user1**: 利用者アカウント（通所サービス、16文字ランダムパスワード）
- **user2**: 利用者アカウント（在宅サービス、16文字ランダムパスワード）

🔐 **セキュリティ手順**:
1. `npm run init-db` 実行後、`database/initial-credentials.txt`で初期パスワードを確認
2. 各ユーザーで初回ログイン後、必ずパスワードを変更
3. パスワード変更完了後、`initial-credentials.txt`ファイルを削除

## System Architecture

### Backend Structure
- **Express.js server** with role-based authentication and session management
- **SQLite database** with two main databases: `attendance.db` and `sessions.db`
- **Modular routing** system with separate route handlers for each user role
- **JST timezone standardization** using `utils/date-time.js` for all time operations

### Frontend Structure
- **Single Page Application** using vanilla JavaScript with ES6 modules
- **Role-based module loading** (UserModule, StaffModule, AdminModule)
- **Real-time clock display** on both login and dashboard screens
- **Responsive design** using Bootstrap with custom CSS modules

### Key Database Tables
- `users` - User accounts with roles (user/staff/admin) and service types
- `attendance` - Clock in/out records with break tracking
- `daily_reports` - User daily reports with health metrics
- `staff_comments` - Staff feedback on user reports
- `break_records` - Detailed break time tracking (home service users)
- `handover_notes` - Staff handover information
- `audit_log` - Admin action tracking

### User Roles and Permissions
- **user**: Basic attendance tracking, report submission (no session timeout)
- **staff**: User management, report review, attendance oversight
- **admin**: Full system access, user management, audit logs

### Time Zone Handling
All server-side time operations use JST (Japan Standard Time) via `utils/date-time.js`:
- `getCurrentDate()` - Returns YYYY-MM-DD in JST
- `getCurrentTime()` - Returns HH:MM in JST
- `calculateWorkHours()` - Handles day-crossing calculations
- `timeToMinutes()` / `minutesToTime()` - Time conversion utilities

### API Route Structure
- `/api/auth/*` - Authentication endpoints
- `/api/user/*` - User-specific functionality (requires auth)
- `/api/staff/*` - Staff operations (requires staff/admin role)
- `/api/admin/*` - Admin operations (requires admin role)
- `/api/attendance/*` - Attendance tracking (shared across roles)
- `/api/handover/*` - Staff handover management
- `/api/line/*` - LINE bot integration

### Frontend Module System
Each role has its own module in `public/js/modules/`:
- `user/` - Basic attendance and reporting interface
- `staff/` - User management and report review
- `admin/` - System administration and audit functions

### Session Management
- **Users**: No session timeout (24-hour cookie)
- **Staff/Admin**: 30-minute session monitoring with automatic logout
- Session data stored in SQLite with express-session

### Security Features
- **Helmet.js** for comprehensive security headers (CSP, HSTS, XSS protection, etc.)
- **CORS** configuration for cross-origin requests
- **bcrypt** password hashing with salt rounds
- **Role-based access control** with middleware
- **Input validation** with dedicated security utilities
- **SQL injection protection** through parameterized queries
- **Database file permissions** (600 for files, 700 for directories)
- **XSS protection** through input sanitization
- **Session security** with secure cookie settings
- **Rate limiting** and security headers

### File Upload System
- **Multer** for handling file uploads
- **Puppeteer** for PDF generation and report processing
- Images stored in `public/images/` with proper content-type headers

### Development Notes
- All times are handled in JST timezone
- Database operations use promisified wrapper functions (`dbGet`, `dbAll`, `dbRun`)
- Frontend uses fetch API with automatic authentication handling
- Error handling includes both user-friendly messages and detailed logging
- The system supports both commute and home-based service types with different break tracking rules

### LINE Bot Integration
- LINE messaging API integration for notifications
- Report status updates sent to LINE
- Configured through environment variables

## 開発方針
- 効率的かつベストプラクティスに従った開発
- 大きなファイルは適切に分割して保守性を向上
- 機能追加時は既存コードとの連携を重視
- コードの肥大化を避けたシンプルな設計
- モジュール間の結合度を最小限に抑制
- YAGNI(You Aren't Gonna Need It) :今必要じゃない機能は作らない。
- DRY(Don't Repeat Yourself) : 同じコードを繰り返さない。
- KISS(Keep It Simple Stupid) : シンプルに保つ。

## プロジェクト構造
- 使用している技術スタック: Node.js, JavaScript, SQLite3
- モジュラー設計による保守性の確保
- レスポンシブWebデザインの採用

## 重要な開発規約
- レイアウト変更は要望がある時のみ実行
- 既存のアーキテクチャパターンを尊重
- コメントは日本語で記述
- 統一されたコーディングスタイルの維持

## セキュリティ管理

### 本番環境デプロイ前のチェックリスト
- [ ] 初期認証情報ファイル（`database/initial-credentials.txt`）の削除
- [ ] 環境変数（`SESSION_SECRET`、`NODE_ENV=production`）の設定
- [ ] データベースファイル権限の確認（`chmod 600 database/*.db`）
- [ ] SSL/TLS証明書の設定
- [ ] ファイアウォール設定
- [ ] 定期バックアップの設定

### セキュリティ強化スクリプト
```bash
# データベースセキュリティ設定
bash scripts/secure-database.sh

# 権限確認
ls -la database/
```

### セキュリティユーティリティ
- `utils/security-validation.js` - 入力検証とサニタイゼーション
- 全ての入力値は自動的にXSS対策処理が適用されます
- SQLインジェクション対策はパラメータ化クエリで実装済み

## 開発者向け注意事項
- このファイルは開発チーム向けの技術仕様書です
- プロジェクトの構造や開発方針について記載しています
- 新しい開発者のオンボーディング資料として使用してください