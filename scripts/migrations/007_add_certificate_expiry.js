// scripts/migrations/007_add_certificate_expiry.js
// usersテーブルに受給者証有効期限カラム（certificate_expiry）を追加

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, '..', '..', 'database', 'attendance.db'));

db.serialize(() => {
    console.log('🔧 受給者証有効期限カラムマイグレーション開始...');

    db.run(`
        ALTER TABLE users
        ADD COLUMN certificate_expiry DATE DEFAULT NULL
    `, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('certificate_expiry追加エラー:', err);
        } else if (!err) {
            console.log('✅ certificate_expiryカラムを追加しました');
        } else {
            console.log('ℹ️ certificate_expiryカラムは既に存在します');
        }
    });
});

db.close(() => {
    console.log('✅ 受給者証有効期限カラムマイグレーション完了');
});
