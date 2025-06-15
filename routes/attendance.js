// routes/attendance.js
// 出退勤共通API

const express = require('express');
const router = express.Router();

module.exports = (dbGet, dbAll, dbRun, requireAuth) => {
    // 出勤処理
    router.post('/clock-in', requireAuth, async (req, res) => {
        try {
            const userId = req.session.user.id;
            const today = new Date().toISOString().split('T')[0];
            const currentTime = new Date().toTimeString().split(' ')[0].substring(0, 5);
            
            // 既存の出勤記録チェック
            const existing = await dbGet(
                'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
                [userId, today]
            );
            
            if (existing && existing.clock_in) {
                return res.status(400).json({ 
                    success: false, 
                    error: '既に出勤しています' 
                });
            }
            
            // 出勤記録作成
            await dbRun(`
                INSERT INTO attendance (user_id, date, clock_in, status)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, date) DO UPDATE SET
                    clock_in = excluded.clock_in,
                    status = excluded.status,
                    updated_at = CURRENT_TIMESTAMP
            `, [userId, today, currentTime, 'normal']);
            
            const attendance = await dbGet(
                'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
                [userId, today]
            );
            
            res.json({ 
                success: true,
                attendance,
                time: currentTime,
                message: `出勤しました（${currentTime}）`
            });
            
        } catch (error) {
            console.error('出勤処理エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: '出勤処理でエラーが発生しました' 
            });
        }
    });
    
    // 退勤処理
    router.post('/clock-out', requireAuth, async (req, res) => {
        try {
            const userId = req.session.user.id;
            const today = new Date().toISOString().split('T')[0];
            const currentTime = new Date().toTimeString().split(' ')[0].substring(0, 5);
            
            // 出勤記録確認
            const attendance = await dbGet(
                'SELECT * FROM attendance WHERE user_id = ? AND date = ? AND clock_in IS NOT NULL',
                [userId, today]
            );
            
            if (!attendance) {
                return res.status(400).json({ 
                    success: false, 
                    error: '出勤記録がありません' 
                });
            }
            
            if (attendance.clock_out) {
                return res.status(400).json({ 
                    success: false, 
                    error: '既に退勤しています' 
                });
            }
            
            // 退勤時間更新
            await dbRun(
                'UPDATE attendance SET clock_out = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [currentTime, attendance.id]
            );
            
            const updatedAttendance = await dbGet(
                'SELECT * FROM attendance WHERE id = ?',
                [attendance.id]
            );
            
            res.json({ 
                success: true,
                attendance: updatedAttendance,
                time: currentTime,
                message: `退勤しました（${currentTime}）`
            });
            
        } catch (error) {
            console.error('退勤処理エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: '退勤処理でエラーが発生しました' 
            });
        }
    });
    
    return router;
};