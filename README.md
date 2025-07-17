# 就労支援B型作業所勤怠管理システム 要件定義書

## システム概要
- **目的**: 就労支援B型作業所の勤怠管理・日報管理の効率化・デジタル化
- **技術スタック**: HTML　+　boostrap + Javascript　+ SQLite
- **形態**: WEBアプリケーション
- **利用人数**: 10-15人程度

## データベース構成

### 1. users（ユーザー管理）
```sql
users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    password TEXT NOT NULL,  -- ハッシュ化
    beneficiary_number TEXT,  -- 受給者番号
    role TEXT NOT NULL,  -- "user", "staff", "staff_trainee", "admin"
    is_visible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
```

### 2. attendance（出退勤記録）
```sql
attendance (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    attendance_date DATE,
    clock_in TIME,
    clock_out TIME,
    break_start TIME,
    break_end TIME,
    total_hours DECIMAL(3,2),
    is_early_leave BOOLEAN DEFAULT FALSE,
    early_leave_reason TEXT,
    approved_by INTEGER,
    is_time_adjusted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
)
```

### 3. daily_reports（日報）
```sql
daily_reports (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    report_date DATE,
    content TEXT NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    is_read BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES users(id)
)
```

### 4. staff_comments（スタッフコメント）
```sql
staff_comments (
    id INTEGER PRIMARY KEY,
    daily_report_id INTEGER,
    staff_id INTEGER,
    comment TEXT NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    is_editable BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (daily_report_id) REFERENCES daily_reports(id),
    FOREIGN KEY (staff_id) REFERENCES users(id)
)
```

### 5. handover_notes（申し送り事項）
```sql
handover_notes (
    id INTEGER PRIMARY KEY,
    content TEXT NOT NULL,
    updated_by INTEGER,
    updated_at TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES users(id)
)
```

### 6. time_adjustments（時刻調整履歴）
```sql
time_adjustments (
    id INTEGER PRIMARY KEY,
    attendance_id INTEGER,
    original_clock_in TIME,
    adjusted_clock_in TIME,
    original_clock_out TIME,
    adjusted_clock_out TIME,
    reason TEXT NOT NULL,
    adjusted_by INTEGER,
    adjusted_at TIMESTAMP,
    FOREIGN KEY (attendance_id) REFERENCES attendance(id),
    FOREIGN KEY (adjusted_by) REFERENCES users(id)
)
```

### 7. comment_locks（コメント編集ロック）
```sql
comment_locks (
    daily_report_id INTEGER PRIMARY KEY,
    locked_by INTEGER,
    locked_at TIMESTAMP,
    FOREIGN KEY (daily_report_id) REFERENCES daily_reports(id),
    FOREIGN KEY (locked_by) REFERENCES users(id)
)
```

## 権限別機能

### 利用者（基本機能のみ）
- ログイン・ログアウト
- 出退勤記録（15分刻みでraundup）
- 日報入力（必須項目チェック）
- 過去の日報・スタッフコメント閲覧（読み取り専用）
- ログイン時前回出勤のスタッフコメント強制確認機能

### 社員
- 利用者機能 + 以下
- 休憩時間記録
- 申し送り事項編集（5分間隔制限・空白不可）
- 日報へのスタッフコメント（当日のみ編集可）
- 早退処理承認
- 利用者の1時間未満退勤時の手動対応

### 社員（OJT中・バイト）
- 基本は閲覧のみ
- 申し送り事項・コメント編集権限なし

### 最高権限（管理者）
- 全機能 + 以下
- ユーザー登録・権限付与（利用者は通所と在宅を選択する）
- 利用者・社員の出退勤記録閲覧（月別）
- 時刻調整機能（備考欄付き）
- 利用者、社員、最高権限の名簿一覧
- システム管理機能

## 主要機能詳細

### 1. ログイン・認証
- ID/パスワード認証
- 強制ログアウト機能

### 2. 出退勤管理
- **出勤ボタン**: タイムスタンプで記録
- **退勤ボタン**: 出勤後のみ有効
- **1時間未満制御**: エラー表示、早退処理必要
- **画面アラート**: 出勤中はログアウトボタンは無し、ブラウザ終了時も警告

### 3. 日報システム
- **必須入力チェック**: 全項目記入まで完了不可
- **スタッフコメント連動**: 日報IDで紐付け
- **コメント強制確認**: ログイン時に未読コメント表示、当日中の再ログインでは表示しない
- **編集制限**: 利用者は当日のみ、過去分は閲覧のみ

### 4. 申し送り事項
- **常時表示**: スタッフ画面に常に表示
- **編集制限**: 5分間隔、完全空白上書き不可
- **バッティング回避**: 排他制御実装

### 5. 通知機能
- **利用者日報提出通知**: Windows標準音 + ポップアップ
- **未コメント警告**: スタッフ退勤時チェック
- **リアルタイム更新**: 5秒間隔でダッシュボード更新

### 6. 時刻調整機能（管理者のみ）
- **調整範囲**: 自由
- **備考欄**: 体調不良の早退など
- **履歴保存**: 調整した場合は調整者の氏名を備考に
- **回数制限**: なし

### 7. 出退勤記録閲覧機能（管理者のみ）
- **出勤者一覧**: リアルタイムでの出勤ボタンを押した人物名簿
- **月別カレンダー**: 1年分のカレンダー→人物クリック→該当人物の該当月のデータを出勤退勤関係なく日付と曜日で縦並びで表示
- **エクセルへエクスポート**: 利用者さんの工賃計算用

## エラーハンドリング・制御

### 利用者向け制御
1. **出勤ボタン**: ログイン後、出勤ボタンのみ有効
2. **ブラウザ制御**: 出勤中は基本閉じないように指示、閉じる場合もアラートを出す
3. **退勤制御**: 出勤していない場合は退勤ボタン無効
4. **時間制限**: 1時間未満退勤時のエラー表示（退勤ボタンの誤クリック防止）
5. **出勤時刻例外制御**:09時00分以前の打刻は全て09:00分とする
6. **退勤時刻例外制御**:15時30分以降の退勤ボタンは全て15時45分とする
7. **日報必須**: 未記入項目がある場合は完了不可
8. **ログアウトボタン**: 日報記入完了後にログアウトボタン表示
9. **出勤退勤チェック**:一度退勤を押すと出勤ボタンは押せないように制御

### 社員向け制御
1. **休憩管理**: 休憩出入り記録まで退勤不可
2. **休憩時間管理**: 休憩時間が55分を超えた場合アラート（休憩終了を促す）
3. **コメント義務**: 当日の日報にスタッフコメント必須、未記入がある場合は退勤ボタンで通知
4. **編集権限**: 自分のスタッフコメントのみ当日再編集可
5. **申し送り制御**: 5分間隔・空白全削除不可・リアルタイム排他制御

### システム制御
1. **セッション管理**: ネットワーク切断時の再ログイン
2. **データ整合性**: トランザクション管理
3. **ログ記録**: 全操作のログ保存
4. **バックアップ**: 自動バックアップ機能

## UI/UX設計方針

### 基本方針
- **明確な色分け**: 緑（安全）、赤（注意）、青（情報）
- **視覚的フィードバック**: 操作完了時のアニメーション
- **エラー防止**: 確認ダイアログの多用
- **アクセシビリティ**: 色覚に配慮した配色

## 技術的考慮事項

### パフォーマンス
- SQLite同時接続制限対応
- インデックス最適化
- メモリ使用量制限

### セキュリティ
- パスワードハッシュ化（bcrypt）
- SQLインジェクション対策
- セッション管理

### 保守性
- 設定ファイル分離
- ログ機能充実
- モジュール化設計

## 運用開始後の課題

### 確定事項
- **システム管理者**: 開発者が随時対応
- **利用人数**: 10-15人程度
- **バックアップ**: 自動化実装
- **サポート**: リモート対応

### 検討事項
- ID/パスワード配布方法
- 初期導入時の研修計画
- 障害時の代替手順
- 将来的な機能拡張

## 納期・工程
- **開発期間**: 2-3時間（基本機能）
- **テスト期間**: 実運用でのフィードバック調整
- **導入**: 段階的移行
- **保守**: 継続的改善








