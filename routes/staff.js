// routes/staff.js
// スタッフAPI

const express = require('express');
const router = express.Router();

module.exports = (dbGet, dbAll, dbRun, requireAuth, requireRole) => {
    // スタッフ退勤（未コメント日報チェック付き）
    router.post('/clock-out', requireAuth, async (req, res) => {
        try {
            const staffId = req.session.user.id;
            const today = new Date().toISOString().split('T')[0];
            const currentTime = new Date().toTimeString().split(' ')[0].substring(0, 5);
            
            // 未コメントの日報をチェック
            const uncommentedReports = await dbAll(`
                SELECT dr.*, u.name as user_name
                FROM daily_reports dr
                JOIN users u ON dr.user_id = u.id
                LEFT JOIN staff_comments sc ON dr.user_id = sc.user_id AND dr.date = sc.date
                WHERE dr.date = ? AND sc.id IS NULL
            `, [today]);
            
            if (uncommentedReports.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: '未コメントの日報があります',
                    uncommentedReports: uncommentedReports.map(r => ({
                        userId: r.user_id,
                        userName: r.user_name
                    }))
                });
            }
            
            // 通常の退勤処理
            await dbRun(
                'UPDATE attendance SET clock_out = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND date = ? AND clock_out IS NULL',
                [currentTime, staffId, today]
            );
            
            res.json({ 
                success: true,
                time: currentTime,
                message: `退勤しました（${currentTime}）`
            });
            
        } catch (error) {
            console.error('スタッフ退勤エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: '退勤処理でエラーが発生しました' 
            });
        }
    });
    
    // 休憩開始（スタッフ用）を修正（45行目あたり）
    router.post('/break/start', requireAuth, async (req, res) => {
        try {
            const staffId = req.session.user.id;
            const today = new Date().toISOString().split('T')[0];
            const currentTime = new Date().toTimeString().split(' ')[0].substring(0, 5);
            
            // 出勤チェック
            const attendance = await dbGet(
                'SELECT * FROM attendance WHERE user_id = ? AND date = ? AND clock_in IS NOT NULL AND clock_out IS NULL',
                [staffId, today]
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
                [staffId, today]
            );
            
            if (existingBreak) {
                return res.status(400).json({ 
                    success: false, 
                    error: '本日の休憩は既に取得済みです' 
                });
            }
            
            // 1時間後の終了時間を計算
            const [hours, minutes] = currentTime.split(':').map(Number);
            let endHours = hours + 1;
            let endMinutes = minutes;
            
            if (endHours >= 24) {
                endHours = 23;
                endMinutes = 59;
            }
            
            const endTime = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
            
            // 休憩記録を即座に完了状態で作成
            await dbRun(`
                INSERT INTO break_records (user_id, date, start_time, end_time, duration)
                VALUES (?, ?, ?, ?, ?)
            `, [staffId, today, currentTime, endTime, 60]);
            
            res.json({ 
                success: true,
                startTime: currentTime,
                endTime: endTime,
                duration: 60,
                message: `休憩時間を記録しました（${currentTime}〜${endTime} 60分）`
            });
            
        } catch (error) {
            console.error('休憩開始エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: '休憩開始処理でエラーが発生しました' 
            });
        }
    });
    
    // 休憩終了（スタッフ用）
    router.post('/break/end', requireAuth, async (req, res) => {
        try {
            const staffId = req.session.user.id;
            const today = new Date().toISOString().split('T')[0];
            const currentTime = new Date().toTimeString().split(' ')[0].substring(0, 5);
            
            const breakRecord = await dbGet(
                'SELECT * FROM break_records WHERE user_id = ? AND date = ?',
                [userId, date]
            );
            
            res.json({
                success: true,
                user,
                attendance,
                report,
                comment,
                breakRecord  // 追加
            });
            
            if (!breakRecord) {
                return res.status(400).json({ 
                    success: false, 
                    error: '休憩中ではありません' 
                });
            }
            
            // 休憩時間計算
            const startTime = new Date(`1970-01-01 ${breakRecord.start_time}`);
            const endTime = new Date(`1970-01-01 ${currentTime}`);
            const duration = Math.round((endTime - startTime) / (1000 * 60));
            
            await dbRun(`
                UPDATE break_records 
                SET end_time = ?, duration = ?
                WHERE id = ?
            `, [currentTime, duration, breakRecord.id]);
            
            res.json({ 
                success: true,
                endTime: currentTime,
                duration,
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
    
    // 利用者一覧取得（今日の状況）
    router.get('/users', requireAuth, async (req, res) => {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            const users = await dbAll(`
                SELECT 
                    u.id,
                    u.name,
                    u.role,
                    u.service_type,
                    a.clock_in,
                    a.clock_out,
                    a.status,
                    dr.id as report_id,
                    sc.id as comment_id
                FROM users u
                LEFT JOIN attendance a ON u.id = a.user_id AND a.date = ?
                LEFT JOIN daily_reports dr ON u.id = dr.user_id AND dr.date = ?
                LEFT JOIN staff_comments sc ON u.id = sc.user_id AND sc.date = ?
                WHERE u.role = 'user' AND u.is_active = 1
                ORDER BY u.name
            `, [today, today, today]);
            
            res.json({
                success: true,
                users,
                date: today
            });
            
        } catch (error) {
            console.error('利用者一覧取得エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: '利用者一覧の取得に失敗しました' 
            });
        }
    });
    
    // 利用者リスト取得（選択用）
    router.get('/users/list', requireAuth, async (req, res) => {
        try {
            const users = await dbAll(`
                SELECT id, name, service_type
                FROM users
                WHERE role = 'user' AND is_active = 1
                ORDER BY name
            `);
            
            res.json({
                success: true,
                users
            });
            
        } catch (error) {
            console.error('利用者リスト取得エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: '利用者リストの取得に失敗しました' 
            });
        }
    });
    
    // 特定利用者の日報取得
    router.get('/user/:userId/report/:date', requireAuth, async (req, res) => {
        try {
            const { userId, date } = req.params;
            
            const user = await dbGet(
                'SELECT id, name, service_type FROM users WHERE id = ?',
                [userId]
            );
            
            const attendance = await dbGet(
                'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
                [userId, date]
            );
            
            const report = await dbGet(
                'SELECT * FROM daily_reports WHERE user_id = ? AND date = ?',
                [userId, date]
            );
            
            const comment = await dbGet(
                'SELECT * FROM staff_comments WHERE user_id = ? AND date = ?',
                [userId, date]
            );
            
            const breakRecord = await dbGet(
                'SELECT * FROM break_records WHERE user_id = ? AND date = ?',
                [userId, date]
            );
            
            res.json({
                success: true,
                user,
                attendance,
                report,
                comment,
                breakRecord
            });
            
        } catch (error) {
            console.error('日報取得エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: '日報の取得に失敗しました' 
            });
        }
    });
    
    // スタッフコメント記入
    router.post('/comment', requireAuth, async (req, res) => {
        try {
            const staffId = req.session.user.id;
            const { userId, date, comment } = req.body;
            
            if (!comment || comment.trim() === '') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'コメントを入力してください' 
                });
            }
            
            // 日報の存在確認
            const report = await dbGet(
                'SELECT * FROM daily_reports WHERE user_id = ? AND date = ?',
                [userId, date]
            );
            
            if (!report) {
                return res.status(400).json({ 
                    success: false, 
                    error: '日報が提出されていません' 
                });
            }
            
            await dbRun(`
                INSERT OR REPLACE INTO staff_comments (user_id, staff_id, date, comment)
                VALUES (?, ?, ?, ?)
            `, [userId, staffId, date, comment]);
            
            res.json({ 
                success: true,
                message: 'コメントを記入しました'
            });
            
        } catch (error) {
            console.error('コメント記入エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: 'コメントの記入に失敗しました' 
            });
        }
    });
    
    // 月別出勤簿取得
    router.get('/attendance/:year/:month/:userId', requireAuth, async (req, res) => {
        try {
            const { year, month, userId } = req.params;
            
            const startDate = `${year}-${month.padStart(2, '0')}-01`;
            const endDate = `${year}-${month.padStart(2, '0')}-31`;
            
            const user = await dbGet(
                'SELECT * FROM users WHERE id = ? AND is_active = 1',
                [userId]
            );
            
            if (!user) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'ユーザーが見つかりません' 
                });
            }
            
            const records = await dbAll(`
                SELECT 
                    a.*,
                    dr.id as report_id,
                    sc.comment,
                    br.start_time as break_start,
                    br.end_time as break_end,
                    br.duration as break_duration
                FROM attendance a
                LEFT JOIN daily_reports dr ON a.user_id = dr.user_id AND a.date = dr.date
                LEFT JOIN staff_comments sc ON a.user_id = sc.user_id AND a.date = sc.date
                LEFT JOIN break_records br ON a.user_id = br.user_id AND a.date = br.date
                WHERE a.user_id = ? AND a.date BETWEEN ? AND ?
                ORDER BY a.date
            `, [userId, startDate, endDate]);
            
            res.json({
                success: true,
                user,
                records
            });
            
        } catch (error) {
            console.error('月別出勤簿取得エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: '月別出勤簿の取得に失敗しました' 
            });
        }
    });
    
    // 特定日のスタッフ出勤記録
    router.get('/attendance/:date', requireAuth, async (req, res) => {
        try {
            const staffId = req.session.user.id;
            const { date } = req.params;
            
            const attendance = await dbGet(
                'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
                [staffId, date]
            );
            
            res.json({
                success: true,
                attendance: attendance || null
            });
            
        } catch (error) {
            console.error('出勤記録取得エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: '出勤記録の取得に失敗しました' 
            });
        }
    });

    // routes/staff.js に追加
// スタッフ用の出勤記録検索エンドポイント

    // 出勤記録検索（スタッフ用）
    router.get('/attendance/search', requireAuth, requireRole(['staff', 'admin']), async (req, res) => {
        try {
            const { date, userId } = req.query;
            
            if (!date) {
                return res.status(400).json({ 
                    success: false,
                    error: '検索日付を指定してください' 
                });
            }
        
        // スタッフは利用者のみ検索可能
        let query = `
            SELECT 
                a.*,
                u.name as user_name,
                u.role as user_role,
                dr.id as report_id,
                sc.id as comment_id
            FROM attendance a
            JOIN users u ON a.user_id = u.id
            LEFT JOIN daily_reports dr ON a.user_id = dr.user_id AND a.date = dr.date
            LEFT JOIN staff_comments sc ON a.user_id = sc.user_id AND a.date = sc.date
            WHERE u.is_active = 1 AND a.date = ? AND u.role = 'user'
        `;
        
        const params = [date];
        
        if (userId) {
            query += ' AND a.user_id = ?';
            params.push(userId);
        }
        
        query += ' ORDER BY u.name';
        
        const records = await dbAll(query, params);
        res.json({ 
            success: true,
            records, 
            searchDate: date 
        });
        
    } catch (error) {
        console.error('出退勤記録検索エラー:', error);
        res.status(500).json({ 
            success: false,
            error: '出退勤記録の検索に失敗しました' 
        });
    }
});

    // 利用者の休憩ステータス取得（スタッフ用）
    router.get('/user/:userId/break/status/:date', requireAuth, requireRole(['staff', 'admin']), async (req, res) => {
        try {
            const { userId, date } = req.params;
            
            // ユーザーが利用者かチェック
            const user = await dbGet(
                'SELECT * FROM users WHERE id = ? AND role = "user" AND is_active = 1',
                [userId]
            );
            
            if (!user) {
                return res.status(404).json({ 
                    success: false,
                    error: '利用者が見つかりません' 
                });
            }
            
            const breakRecord = await dbGet(
                'SELECT * FROM break_records WHERE user_id = ? AND date = ?',
                [userId, date]
            );
            
            res.json({
                success: true,
                breakRecord: breakRecord || null
            });
            
        } catch (error) {
            console.error('休憩ステータス取得エラー:', error);
            res.status(500).json({ 
                success: false,
                error: '休憩ステータスの取得に失敗しました' 
            });
        }
    });
    
    return router;
};