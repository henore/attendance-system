// scripts/update-db-schema.js
// データベーススキーマ更新（管理者・スタッフの休憩時間対応）

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, '..', 'database', 'attendance.db'));

db.serialize(() => {
    console.log('🔧 データベーススキーマ更新開始...');

    // attendanceテーブルに休憩時間フィールドを追加（存在しない場合）
    db.run(`
        ALTER TABLE attendance 
        ADD COLUMN break_start TIME
    `, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('break_start追加エラー:', err);
        } else if (!err) {
            console.log('✅ break_startカラムを追加しました');
        }
    });

    db.run(`
        ALTER TABLE attendance 
        ADD COLUMN break_end TIME
    `, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('break_end追加エラー:', err);
        } else if (!err) {
            console.log('✅ break_endカラムを追加しました');
        }
    });

    console.log('✅ データベーススキーマ更新完了');
});

db.close((err) => {
    if (err) {
        console.error('データベースクローズエラー:', err);
    } else {
        console.log('✅ データベース接続を閉じました');
    }
});