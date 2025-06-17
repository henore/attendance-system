// routes/attendance.js
// 出退勤共通API（タイムゾーン対応版）

const express = require('express');
const router = express.Router();

// 日本時間を取得する関数
const getJapanTime = () => {
    const now = new Date();
    // UTC時間に9時間を加算して日本時間に変換
    const japanTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    return japanTime.toISOString().slice(11, 16); // HH:MM形式
};

// 日本の日付を取得する関数
const getJapanDate = () => {
    const now = new Date();
    const japanTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    return japanTime.toISOString().split('T')[0];
};

// 時間丸め関数（修正版）
const roundClockInTime = (timeStr, isUser) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;
    
    if (isUser) {
        // 11:30-12:29の出勤は12:30固定
        if (totalMinutes >= 690 && totalMinutes < 750) { // 11:30-12:29
            return '12:30';
        }
    }
    
    // 9:00以前は9:00固定
    if (totalMinutes <= 540) { // 9:00
        return '09:00';
    }
    
    // 9:01以降は15分切り上げ
    const rounded = Math.ceil(totalMinutes / 15) * 15;
    const roundedHours = Math.floor(rounded / 60);
    const roundedMinutes = rounded % 60;
    
    return `${String(roundedHours).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`;
};

const roundClockOutTime = (timeStr, isUser) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;
    
    if (isUser) {
        // 11:30-12:30の退勤は11:30固定
        if (totalMinutes >= 690 && totalMinutes <= 750) { // 11:30-12:30
            return '11:30';
        }
    }
    
    // 15:30以前は15分切り下げ
    if (totalMinutes <= 930) { // 15:30
        const rounded = Math.floor(totalMinutes / 15) * 15;
        const roundedHours = Math.floor(rounded / 60);
        const roundedMinutes = rounded % 60;
        return `${String(roundedHours).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`;
    }
    
    // 15:30より後は15:45固定
    return '15:45';
};

module.exports = (dbGet, dbAll, dbRun, requireAuth) => {
    // 出勤処理
    router.post('/clock-in', requireAuth, async (req, res) => {
        try {
            const userId = req.session.user.id;
            const userRole = req.session.user.role;
            const today = getJapanDate();
            const currentTime = getJapanTime();
            
            console.log(`[出勤] 日本時間: ${today} ${currentTime}`);
            
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
            
            // 利用者の場合は時間を丸める
            const clockInTime = userRole === 'user' ? roundClockInTime(currentTime, true) : currentTime;
            
            console.log(`[出勤] 元の時刻: ${currentTime}, 丸め後: ${clockInTime}`);
            
            // 出勤記録作成
            await dbRun(`
                INSERT INTO attendance (user_id, date, clock_in, status)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, date) DO UPDATE SET
                    clock_in = excluded.clock_in,
                    status = excluded.status,
                    updated_at = CURRENT_TIMESTAMP
            `, [userId, today, clockInTime, 'normal']);
            
            const attendance = await dbGet(
                'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
                [userId, today]
            );
            
            res.json({ 
                success: true,
                attendance,
                time: clockInTime,
                message: `出勤しました（${clockInTime}）`
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
            const userRole = req.session.user.role;
            const today = getJapanDate();
            const currentTime = getJapanTime();
            
            console.log(`[退勤] 日本時間: ${today} ${currentTime}`);
            
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
            
            // 利用者の場合は時間を丸める
            const clockOutTime = userRole === 'user' ? roundClockOutTime(currentTime, true) : currentTime;
            
            console.log(`[退勤] 元の時刻: ${currentTime}, 丸め後: ${clockOutTime}`);
            
            // 退勤時間更新
            await dbRun(
                'UPDATE attendance SET clock_out = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [clockOutTime, attendance.id]
            );
            
            const updatedAttendance = await dbGet(
                'SELECT * FROM attendance WHERE id = ?',
                [attendance.id]
            );
            
            res.json({ 
                success: true,
                attendance: updatedAttendance,
                time: clockOutTime,
                message: `退勤しました（${clockOutTime}）`
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