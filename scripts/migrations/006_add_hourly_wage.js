// scripts/migrations/006_add_hourly_wage.js
// usersテーブルに工賃カラム（hourly_wage）を追加

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, '..', '..', 'database', 'attendance.db'));

db.serialize(() => {
    console.log('🔧 工賃カラムマイグレーション開始...');

    db.run(`
        ALTER TABLE users
        ADD COLUMN hourly_wage INTEGER DEFAULT NULL
    `, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('hourly_wage追加エラー:', err);
        } else if (!err) {
            console.log('✅ hourly_wageカラムを追加しました');
        } else {
            console.log('ℹ️ hourly_wageカラムは既に存在します');
        }
    });
});

db.close(() => {
    console.log('✅ 工賃カラムマイグレーション完了');
});
