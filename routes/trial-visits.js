// routes/trial-visits.js
// 体験入所管理ルート

const express = require('express');
const router = express.Router();
const { getCurrentDate, getCurrentTime } = require('../utils/date-time');

module.exports = (dbGet, dbAll, dbRun, requireAuth, requireRole) => {
    
    // 体験入所予定一覧取得（指定日付）
    router.get('/by-date/:date', async (req, res) => {
        try {
            const { date } = req.params;
            
            const visits = await dbAll(`
                SELECT * FROM trial_visits 
                WHERE visit_date = ? AND is_visible = 1
                ORDER BY visit_time ASC
            `, [date]);

            res.json({ success: true, visits });
        } catch (error) {
            console.error('体験入所予定取得エラー:', error);
            res.status(500).json({ success: false, error: 'データ取得に失敗しました' });
        }
    });

    // 当日の体験入所予定一覧取得
    router.get('/today', async (req, res) => {
        try {
            const today = getCurrentDate();
            
            const visits = await dbAll(`
                SELECT * FROM trial_visits 
                WHERE visit_date = ? AND is_visible = 1
                ORDER BY visit_time ASC
            `, [today]);

            res.json({ success: true, visits, date: today });
        } catch (error) {
            console.error('当日体験入所予定取得エラー:', error);
            res.status(500).json({ success: false, error: 'データ取得に失敗しました' });
        }
    });

    // 体験入所予定新規登録
    router.post('/create', async (req, res) => {
        try {
            const { name, visitDate, visitTime } = req.body;
            
            if (!name || !visitDate || !visitTime) {
                return res.status(400).json({ 
                    success: false, 
                    error: '氏名、日付、時刻は必須です' 
                });
            }

            const result = await dbRun(`
                INSERT INTO trial_visits (name, visit_date, visit_time) 
                VALUES (?, ?, ?)
            `, [name, visitDate, visitTime]);

            res.json({ 
                success: true, 
                message: '体験入所予定を登録しました',
                id: result.id 
            });
        } catch (error) {
            console.error('体験入所予定登録エラー:', error);
            res.status(500).json({ success: false, error: '登録に失敗しました' });
        }
    });

    // 体験入所予定削除（非表示フラグ）
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            
            const result = await dbRun(`
                UPDATE trial_visits 
                SET is_visible = 0, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `, [id]);

            if (result.changes === 0) {
                return res.status(404).json({ 
                    success: false, 
                    error: '指定された予定が見つかりません' 
                });
            }

            res.json({ 
                success: true, 
                message: '体験入所予定を削除しました' 
            });
        } catch (error) {
            console.error('体験入所予定削除エラー:', error);
            res.status(500).json({ success: false, error: '削除に失敗しました' });
        }
    });

    // 月別体験入所予定取得（カレンダー用）
    router.get('/monthly/:year/:month', async (req, res) => {
        try {
            const { year, month } = req.params;
            const startDate = `${year}-${month.padStart(2, '0')}-01`;
            const endDate = `${year}-${(parseInt(month) + 1).toString().padStart(2, '0')}-01`;
            
            const visits = await dbAll(`
                SELECT visit_date, COUNT(*) as count
                FROM trial_visits 
                WHERE visit_date >= ? AND visit_date < ? AND is_visible = 1
                GROUP BY visit_date
            `, [startDate, endDate]);

            res.json({ success: true, visits });
        } catch (error) {
            console.error('月別体験入所予定取得エラー:', error);
            res.status(500).json({ success: false, error: 'データ取得に失敗しました' });
        }
    });

    // 体験入所通知チェック（内部API）
    router.get('/notification-check', async (req, res) => {
        try {
            const now = new Date();
            const currentDate = getCurrentDate();
            const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
            const targetTime = oneHourLater.toLocaleTimeString('en-GB', { 
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit' 
            });

            const upcomingVisits = await dbAll(`
                SELECT * FROM trial_visits 
                WHERE visit_date = ? AND visit_time = ? AND is_visible = 1
            `, [currentDate, targetTime]);

            res.json({ 
                success: true, 
                upcomingVisits,
                checkTime: now.toISOString()
            });
        } catch (error) {
            console.error('体験入所通知チェックエラー:', error);
            res.status(500).json({ success: false, error: 'チェックに失敗しました' });
        }
    });

    return router;
};