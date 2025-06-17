// routes/user.js
// 利用者API

const express = require('express');
const router = express.Router();

module.exports = (dbGet, dbAll, dbRun, requireAuth) => {
    // 今日の出勤状況取得
    router.get('/attendance/today', requireAuth, async (req, res) => {
        try {
            const userId = req.session.user.id;
            const today = new Date().toISOString().split('T')[0];
            
            const attendance = await dbGet(
                'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
                [userId, today]
            );
            
            const report = await dbGet(
                'SELECT * FROM daily_reports WHERE user_id = ? AND date = ?',
                [userId, today]
            );
            
            res.json({
                success: true,
                attendance: attendance || null,
                report: report || null
            });
            
        } catch (error) {
            console.error('出勤状況取得エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: '出勤状況の取得に失敗しました' 
            });
        }
    });
    
    // 日報提出
    router.post('/report', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const today = new Date().toISOString().split('T')[0];
        
        console.log('[日報API] リクエストボディ:', req.body);
        console.log('[日報API] ユーザーID:', userId);
        console.log('[日報API] 日付:', today);
        
        const {
            workContent,
            temperature,
            appetite,
            medicationTime,
            bedtime,
            wakeupTime,
            sleepQuality,
            reflection,
            interviewRequest
        } = req.body;
        
        // 出勤記録確認
        const attendance = await dbGet(
            'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
            [userId, today]
        );
        
        console.log('[日報API] 出勤記録:', attendance);
        
        if (!attendance || !attendance.clock_out) {
            return res.status(400).json({ 
                success: false, 
                error: '退勤後に日報を提出してください' 
            });
        }
        
        // 日報登録または更新
        await dbRun(`
            INSERT OR REPLACE INTO daily_reports (
                user_id, date, work_content, temperature, appetite,
                medication_time, bedtime, wakeup_time, sleep_quality,
                reflection, interview_request
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            userId, today, workContent, temperature, appetite,
            medicationTime || null, bedtime || null, wakeupTime || null, 
            sleepQuality, reflection || '', interviewRequest || null
        ]);
        
        // 出勤記録の日報フラグ更新
        await dbRun(
            'UPDATE attendance SET has_report = 1 WHERE user_id = ? AND date = ?',
            [userId, today]
        );
        
        res.json({ 
            success: true,
            message: '日報を提出しました'
        });
        
    } catch (error) {
        console.error('日報提出エラー詳細:', error);
        res.status(500).json({ 
            success: false, 
            error: '日報の提出に失敗しました',
            details: error.message
        });
    }
    });
    // 特定日の記録取得
    router.get('/report/:date', requireAuth, async (req, res) => {
        try {
            const userId = req.session.user.id;
            const { date } = req.params;
            
            const attendance = await dbGet(
                'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
                [userId, date]
            );
            
            const report = await dbGet(
                'SELECT * FROM daily_reports WHERE user_id = ? AND date = ?',
                [userId, date]
            );
            
            const staffComment = await dbGet(`
                SELECT c.*, u.name as staff_name 
                FROM staff_comments c
                JOIN users u ON c.staff_id = u.id
                WHERE c.user_id = ? AND c.date = ?
            `, [userId, date]);
            
            res.json({
                success: true,
                attendance,
                report,
                staffComment
            });
            
        } catch (error) {
            console.error('記録取得エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: '記録の取得に失敗しました' 
            });
        }
    });
    
    // 休憩開始
    router.post('/break/start', requireAuth, async (req, res) => {
        try {
            const userId = req.session.user.id;
            const today = new Date().toISOString().split('T')[0];
            const currentTime = new Date().toTimeString().split(' ')[0].substring(0, 5);
            
            // 出勤チェック
            const attendance = await dbGet(
                'SELECT * FROM attendance WHERE user_id = ? AND date = ? AND clock_in IS NOT NULL AND clock_out IS NULL',
                [userId, today]
            );
            
            if (!attendance) {
                return res.status(400).json({ 
                    success: false, 
                    error: '出勤中のみ休憩できます' 
                });
            }
            
            // 既存の休憩記録チェック
            const existingBreak = await dbGet(
                'SELECT * FROM break_records WHERE user_id = ? AND date = ?',
                [userId, today]
            );
            
            if (existingBreak) {
                return res.status(400).json({ 
                    success: false, 
                    error: '本日の休憩は既に取得済みです' 
                });
            }
            
            // サービス区分による処理分岐
            const user = req.session.user;
            let startTime, endTime = null;
            let isCompleted = false;
            
            if (user.service_type === 'commute') {
                // 通所：11:30-12:30固定
                startTime = '11:30';
                endTime = '12:30';
                isCompleted = true;
                
                await dbRun(`
                    INSERT INTO break_records (user_id, date, start_time, end_time, duration)
                    VALUES (?, ?, ?, ?, ?)
                `, [userId, today, startTime, endTime, 60]);
                
            } else {
                // 在宅：現在時刻から開始
                startTime = currentTime;
                
                await dbRun(`
                    INSERT INTO break_records (user_id, date, start_time)
                    VALUES (?, ?, ?)
                `, [userId, today, startTime]);
            }
            
            res.json({ 
                success: true,
                startTime,
                endTime,
                isCompleted,
                message: isCompleted ? 
                    '休憩時間を記録しました（11:30-12:30 60分）' : 
                    `休憩開始（${startTime}）60分で自動終了します`
            });
            
        } catch (error) {
            console.error('休憩開始エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: '休憩開始処理でエラーが発生しました' 
            });
        }
    });
    
    // 休憩終了
    router.post('/break/end', requireAuth, async (req, res) => {
        try {
            const userId = req.session.user.id;
            const today = new Date().toISOString().split('T')[0];
            const currentTime = new Date().toTimeString().split(' ')[0].substring(0, 5);
            
            // 進行中の休憩記録取得
            const breakRecord = await dbGet(
                'SELECT * FROM break_records WHERE user_id = ? AND date = ?',
                [userId, date]
            );
            
            res.json({
                success: true,
                attendance,
                report,
                staffComment,
                breakRecord  // 追加
            });
            
            if (!breakRecord) {
                return res.status(400).json({ 
                    success: false, 
                    error: '休憩中ではありません' 
                });
            }
            
            // 休憩時間計算（分）
            const startTime = new Date(`1970-01-01 ${breakRecord.start_time}`);
            const endTime = new Date(`1970-01-01 ${currentTime}`);
            const duration = Math.round((endTime - startTime) / (1000 * 60));
            
            // 最大60分
            const finalDuration = Math.min(duration, 60);
            
            await dbRun(`
                UPDATE break_records 
                SET end_time = ?, duration = ?
                WHERE id = ?
            `, [currentTime, finalDuration, breakRecord.id]);
            
            res.json({ 
                success: true,
                endTime: currentTime,
                duration: finalDuration,
                message: `休憩終了（${currentTime}）`
            });
            
        } catch (error) {
            console.error('休憩終了エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: '休憩終了処理でエラーが発生しました' 
            });
        }
    });
    
    // 休憩状態取得
    router.get('/break/status/:date', requireAuth, async (req, res) => {
        try {
            const userId = req.session.user.id;
            const { date } = req.params;
            
            const breakRecord = await dbGet(
                'SELECT * FROM break_records WHERE user_id = ? AND date = ?',
                [userId, date]
            );
            
            res.json({
                success: true,
                breakRecord: breakRecord || null
            });
            
        } catch (error) {
            console.error('休憩状態取得エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: '休憩状態の取得に失敗しました' 
            });
        }
    });
    
    // 未読コメント取得
    router.get('/staff-comment/unread', requireAuth, async (req, res) => {
        try {
            const userId = req.session.user.id;
            
            const comment = await dbGet(`
                SELECT c.*, u.name as staff_name 
                FROM staff_comments c
                JOIN users u ON c.staff_id = u.id
                WHERE c.user_id = ? AND c.is_read = 0
                ORDER BY c.created_at DESC
                LIMIT 1
            `, [userId]);
            
            res.json({
                success: true,
                hasUnreadComment: !!comment,
                comment: comment || null
            });
            
        } catch (error) {
            console.error('未読コメント取得エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: '未読コメントの取得に失敗しました' 
            });
        }
    });
    
    // コメント既読処理
    router.post('/staff-comment/mark-read', requireAuth, async (req, res) => {
        try {
            const userId = req.session.user.id;
            const { commentId } = req.body;
            
            await dbRun(
                'UPDATE staff_comments SET is_read = 1 WHERE id = ? AND user_id = ?',
                [commentId, userId]
            );
            
            res.json({ 
                success: true,
                message: 'コメントを既読にしました'
            });
            
        } catch (error) {
            console.error('コメント既読処理エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: 'コメント既読処理でエラーが発生しました' 
            });
        }
    });
    
    return router;
};