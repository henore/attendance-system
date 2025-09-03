// scripts/add-trial-visits-table.js
// 体験入所管理テーブル追加スクリプト

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database', 'attendance.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('データベース接続エラー:', err);
        process.exit(1);
    }
    console.log('✅ SQLiteデータベースに接続しました');
});

console.log('🔧 体験入所管理テーブル追加開始...');

db.serialize(() => {
    // 体験入所予定テーブル
    db.run(`
        CREATE TABLE IF NOT EXISTS trial_visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            visit_date DATE NOT NULL,
            visit_time TIME NOT NULL,
            is_visible INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('テーブル作成エラー:', err);
            process.exit(1);
        }
        console.log('✅ trial_visits テーブルを作成しました');
    });

    // インデックス作成
    db.run(`
        CREATE INDEX IF NOT EXISTS idx_trial_visits_date_time 
        ON trial_visits(visit_date, visit_time)
    `, (err) => {
        if (err) {
            console.error('インデックス作成エラー:', err);
            process.exit(1);
        }
        console.log('✅ インデックスを作成しました');
    });

    db.run(`
        CREATE INDEX IF NOT EXISTS idx_trial_visits_visible 
        ON trial_visits(is_visible, visit_date)
    `, (err) => {
        if (err) {
            console.error('インデックス作成エラー:', err);
            process.exit(1);
        }
        console.log('✅ 表示フラグインデックスを作成しました');
    });

    console.log('✅ 体験入所管理テーブル追加完了');
});

db.close((err) => {
    if (err) {
        console.error('データベースクローズエラー:', err);
    } else {
        console.log('✅ データベース接続を閉じました');
    }
});