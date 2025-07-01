// routes/user.js
// 利用者API - JST統一版（施設外就労先対応）

const express = require('express');
const router = express.Router();
const { getCurrentDate, getCurrentTime, timeToMinutes } = require('../utils/date-time');

module.exports = (dbGet, dbAll, dbRun, requireAuth) => {
    // 今日の出勤状況取得
    router.get('/attendance/today', requireAuth, async (req, res) => {
        try {
            const userId = req.session.user.id;
            const today = getCurrentDate();
            
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
    
    // 日報提出（施設外就労先対応版）
    router.post('/report', requireAuth, async (req, res) => {
        try {
            const userId = req.session.user.id;
            const today = getCurrentDate();
            
            console.log('[日報API] リクエストボディ:', req.body);
            console.log('[日報API] ユーザーID:', userId);
            console.log('[日報API] 日付:', today);
            
            const {
                workContent,
                externalWorkLocation,  // 追加
                temperature,
                appetite,
                medicationTime,
                bedtime,
                wakeupTime,
                sleepQuality,
                reflection,
                interviewRequest
            } = req.body;
            
            console.log('[日報API] 分割代入後 - workContent:', workContent);
            console.log('[日報API] 分割代入後 - externalWorkLocation:', externalWorkLocation);
            console.log('[日報API] 分割代入後 - temperature:', temperature);
            
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
            
            // 日報登録または更新（施設外就労先対応版）
            const sqlParams = [
                userId, today, workContent, externalWorkLocation || null, temperature, appetite,
                medicationTime || null, bedtime || null, wakeupTime || null, 
                sleepQuality, reflection || '', interviewRequest || null
            ];
            
            console.log('[日報API] SQL実行パラメータ:', sqlParams);
            console.log('[日報API] externalWorkLocation値:', externalWorkLocation || null);
            
            await dbRun(`
                INSERT OR REPLACE INTO daily_reports (
                    user_id, date, work_content, external_work_location, temperature, appetite,
                    medication_time, bedtime, wakeup_time, sleep_quality,
                    reflection, interview_request
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, sqlParams);
            
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

            // 休憩記録も取得
            const breakRecord = await dbGet(
                'SELECT * FROM break_records WHERE user_id = ? AND date = ?',
                [userId, date]
            );
            
            res.json({
                success: true,
                attendance,
                report,
                staffComment,
                breakRecord
            });
            
        } catch (error) {
            console.error('記録取得エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: '記録の取得に失敗しました' 
            });
        }
    });
    
    // 休憩開始（修正版：在宅者は休憩中状態を維持）
    router.post('/break/start', requireAuth, async (req, res) => {
        try {
            const userId = req.session.user.id;
            const user = req.session.user;
            const today = getCurrentDate();
            const currentTime = getCurrentTime();
            
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

            // 通所者の場合の制御：11:30-12:30退勤は休憩なし
            if (user.service_type === 'commute') {
                const clockInMinutes = timeToMinutes(attendance.clock_in);
                
                // 11:30以降の出勤（午後出勤）は休憩なし
                if (clockInMinutes >= 690) { // 11:30 = 690分
                    return res.status(400).json({ 
                        success: false, 
                        error: '午後出勤のため休憩はありません' 
                    });
                }

                // 午前出勤の通所者：11:30-12:30固定で即座に完了
                await dbRun(`
                    INSERT INTO break_records (user_id, date, start_time, end_time, duration)
                    VALUES (?, ?, ?, ?, ?)
                `, [userId, today, '11:30', '12:30', 60]);
                
                return res.json({ 
                    success: true,
                    startTime: '11:30',
                    endTime: '12:30',
                    isCompleted: true,
                    message: '休憩時間を記録しました（11:30-12:30 60分）'
                });
            }

            // 在宅者の場合：15分単位で切り捨て、休憩中状態で開始
            const [hours, minutes] = currentTime.split(':').map(Number);
            const totalMinutes = hours * 60 + minutes;
            const roundedMinutes = Math.floor(totalMinutes / 15) * 15;
            const roundedHours = Math.floor(roundedMinutes / 60);
            const roundedMins = roundedMinutes % 60;
            
            const startTime = `${String(roundedHours).padStart(2, '0')}:${String(roundedMins).padStart(2, '0')}`;
            
            // 在宅者は終了時刻を設定せず、休憩中状態で記録
            await dbRun(`
                INSERT INTO break_records (user_id, date, start_time, end_time, duration)
                VALUES (?, ?, ?, NULL, NULL)
            `, [userId, today, startTime]);
            
            res.json({ 
                success: true,
                startTime,
                isCompleted: false,  // 在宅者は休憩中状態
                message: `休憩開始（${startTime}）- 60分で自動終了します`
            });
            
        } catch (error) {
            console.error('休憩開始エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: '休憩開始処理でエラーが発生しました' 
            });
        }
    });
    
    // 休憩終了（修正版）
    router.post('/break/end', requireAuth, async (req, res) => {
        try {
            const userId = req.session.user.id;
            const today = getCurrentDate();
            const currentTime = getCurrentTime();
            
            // 進行中の休憩記録取得
            const breakRecord = await dbGet(
                'SELECT * FROM break_records WHERE user_id = ? AND date = ? AND end_time IS NULL',
                [userId, today]
            );
            
            if (!breakRecord) {
                return res.status(400).json({ 
                    success: false, 
                    error: '休憩中ではありません' 
                });
            }
            
            // 休憩時間計算（分）
            const startMinutes = timeToMinutes(breakRecord.start_time);
            const currentMinutes = timeToMinutes(currentTime);
            let duration = currentMinutes - startMinutes;
            
            // 日をまたぐ場合の処理
            if (duration < 0) {
                duration += 24 * 60;
            }
            
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
                message: `休憩終了（${currentTime}）- ${finalDuration}分`
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

    // 前回の日報記録取得
    router.get('/last-record', requireAuth, async (req, res) => {
        try {
            const userId = req.session.user.id;
            const today = getCurrentDate();
            
            // 最新の日報記録を取得（今日を除く、退勤済みで日報なし）
            const lastRecord = await dbGet(`
                SELECT a.* 
                FROM attendance a
                LEFT JOIN daily_reports dr ON a.user_id = dr.user_id AND a.date = dr.date
                WHERE a.user_id = ? 
                  AND a.date < ?
                  AND a.clock_out IS NOT NULL
                  AND (dr.id IS NULL OR a.has_report = 0)
                ORDER BY a.date DESC
                LIMIT 1
            `, [userId, today]);
            
            console.log(`[前回記録確認] ユーザーID: ${userId}, 今日: ${today}, 前回記録:`, lastRecord);
            
            res.json({
                success: true,
                lastRecord: lastRecord || null
            });
            
        } catch (error) {
            console.error('前回記録取得エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: '前回記録の取得に失敗しました' 
            });
        }
    });
    
    return router;
};