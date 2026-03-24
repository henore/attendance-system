// scripts/migrations/004_add_audit_approval.js
// 監査ログに承認機能のカラムを追加

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, '..', '..', 'database', 'attendance.db'));

db.serialize(() => {
    console.log('🔧 監査ログ承認機能マイグレーション開始...');

    // approval_statusカラム追加
    db.run(`
        ALTER TABLE audit_log
        ADD COLUMN approval_status TEXT DEFAULT NULL
    `, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('approval_status追加エラー:', err);
        } else if (!err) {
            console.log('✅ approval_statusカラムを追加しました');
        }
    });

    // approved_byカラム追加
    db.run(`
        ALTER TABLE audit_log
        ADD COLUMN approved_by INTEGER DEFAULT NULL
    `, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('approved_by追加エラー:', err);
        } else if (!err) {
            console.log('✅ approved_byカラムを追加しました');
        }
    });

    // approved_atカラム追加
    db.run(`
        ALTER TABLE audit_log
        ADD COLUMN approved_at DATETIME DEFAULT NULL
    `, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('approved_at追加エラー:', err);
        } else if (!err) {
            console.log('✅ approved_atカラムを追加しました');
        }
    });
});

db.close(() => {
    console.log('✅ 監査ログ承認機能マイグレーション完了');
});
