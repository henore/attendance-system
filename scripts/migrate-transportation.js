// scripts/migrate-transportation.js
// 本番環境用: usersテーブルにtransportationカラムを追加

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database', 'attendance.db');
const db = new sqlite3.Database(dbPath);

const migrations = [
    {
        name: 'transportation',
        sql: 'ALTER TABLE users ADD COLUMN transportation INTEGER'
    },
    {
        name: 'workweek',
        sql: 'ALTER TABLE users ADD COLUMN workweek TEXT'
    }
];

console.log(`対象DB: ${dbPath}`);
console.log('マイグレーション開始...\n');

db.serialize(() => {
    // 現在のカラム一覧を確認
    db.all('PRAGMA table_info(users)', (err, columns) => {
        if (err) {
            console.error('テーブル情報取得エラー:', err);
            return;
        }

        const existingColumns = columns.map(c => c.name);
        console.log('現在のカラム:', existingColumns.join(', '), '\n');

        let added = 0;
        let skipped = 0;

        migrations.forEach(({ name, sql }) => {
            if (existingColumns.includes(name)) {
                console.log(`  [スキップ] ${name} - 既に存在`);
                skipped++;
            } else {
                db.run(sql, (err) => {
                    if (err) {
                        console.error(`  [エラー] ${name}: ${err.message}`);
                    } else {
                        console.log(`  [追加] ${name}`);
                        added++;
                    }
                });
            }
        });

        // 結果確認
        db.all('PRAGMA table_info(users)', (err, updatedColumns) => {
            if (!err) {
                console.log('\n更新後のカラム:', updatedColumns.map(c => c.name).join(', '));
            }
            console.log('\nマイグレーション完了');

            db.close();
        });
    });
});
