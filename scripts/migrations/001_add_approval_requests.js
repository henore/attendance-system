// scripts/migrations/001_add_approval_requests.js
// 稟議承認システム用テーブル追加マイグレーション

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'database', 'attendance.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log('🔧 稟議承認システム用テーブル作成開始...');

    // 稟議申請テーブル
    db.run(`
        CREATE TABLE IF NOT EXISTS approval_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            amount REAL,
            attachment_path TEXT,
            urgency TEXT NOT NULL DEFAULT 'normal' CHECK(urgency IN ('normal', 'urgent')),
            status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'pending', 'approved', 'rejected', 'completed')),
            staff_id INTEGER NOT NULL,
            admin_id INTEGER,
            rejection_reason TEXT,
            submitted_at DATETIME,
            reviewed_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (staff_id) REFERENCES users(id),
            FOREIGN KEY (admin_id) REFERENCES users(id)
        )
    `, (err) => {
        if (err) {
            console.error('❌ approval_requestsテーブル作成エラー:', err);
        } else {
            console.log('✅ approval_requestsテーブル作成完了');
        }
    });

    // インデックス作成
    db.run(`CREATE INDEX IF NOT EXISTS idx_approval_requests_staff_id ON approval_requests(staff_id)`, (err) => {
        if (err) {
            console.error('❌ インデックス作成エラー (staff_id):', err);
        } else {
            console.log('✅ インデックス作成完了 (staff_id)');
        }
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status)`, (err) => {
        if (err) {
            console.error('❌ インデックス作成エラー (status):', err);
        } else {
            console.log('✅ インデックス作成完了 (status)');
        }
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_approval_requests_created_at ON approval_requests(created_at)`, (err) => {
        if (err) {
            console.error('❌ インデックス作成エラー (created_at):', err);
        } else {
            console.log('✅ インデックス作成完了 (created_at)');
        }
    });

    console.log('✅ 稟議承認システム用テーブル作成完了');
});

db.close((err) => {
    if (err) {
        console.error('データベースクローズエラー:', err);
    } else {
        console.log('✅ データベース接続を閉じました');
    }
});
