// scripts/migrations/005_add_user_skills.js
// usersテーブルにスキル情報カラム（skills）を追加
// 形式: カンマ区切り文字列（例: "program,excel,typing,design"）

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, '..', '..', 'database', 'attendance.db'));

db.serialize(() => {
    console.log('🔧 ユーザースキル機能マイグレーション開始...');

    db.run(`
        ALTER TABLE users
        ADD COLUMN skills TEXT DEFAULT NULL
    `, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('skills追加エラー:', err);
        } else if (!err) {
            console.log('✅ skillsカラムを追加しました');
        } else {
            console.log('ℹ️ skillsカラムは既に存在します');
        }
    });
});

db.close(() => {
    console.log('✅ ユーザースキル機能マイグレーション完了');
});
