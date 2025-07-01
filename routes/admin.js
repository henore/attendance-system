// routes/admin.js
// 管理者API - JST統一版

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getCurrentDate } = require('../utils/date-time');

module.exports = (dbGet, dbAll, dbRun, requireAuth, requireRole) => {
    // ユーザー登録
    router.post('/register', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { username, password, name, role, serviceType, ServiceNo } = req.body;
            
            // バリデーション
            if (!username || !password || !name || !role) {
                return res.status(400).json({ 
                    success: false,
                    error: '必須項目が不足しています' 
                });
            }
            
            if (username.length < 3) {
                return res.status(400).json({ 
                    success: false,
                    error: 'ユーザーIDは3文字以上で入力してください' 
                });
            }
            
            if (password.length < 4) {
                return res.status(400).json({ 
                    success: false,
                    error: 'パスワードは4文字以上で入力してください' 
                });
            }
            
            if (role === 'user' && !serviceType) {
                return res.status(400).json({ 
                    success: false,
                    error: '利用者の場合はサービス区分を選択してください' 
                });
            }

            if (role === 'user' && !ServiceNo) {
                return res.status(400).json({ 
                    success: false,
                    error: '利用者の場合は受給者番号を入力して下さい' 
                });
            }

            // 受給者番号の処理
            const finalServiceNo = role === 'user' ? ServiceNo : null;
            const finalServiceType = role === 'user' ? serviceType : null;
            
            // パスワードのハッシュ化
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // 重複チェック
            const existing = await dbGet(
                'SELECT * FROM users WHERE username = ?', 
                [username]
            );
            
            if (existing) {
                return res.status(400).json({ 
                    success: false,
                    error: '同じユーザーIDが既に存在します' 
                });
            }
            
            // ユーザー登録
            const result = await dbRun(
                'INSERT INTO users (username, password, name, role, service_type, service_no) VALUES (?, ?, ?, ?, ?, ?)', 
                [username, hashedPassword, name, role, finalServiceType, finalServiceNo]
            );
            
            // 監査ログ記録
            await dbRun(
                'INSERT INTO audit_log (admin_id, action_type, new_value, ip_address) VALUES (?, ?, ?, ?)',
                [
                    req.session.user.id, 
                    'account_create', 
                    JSON.stringify({ 
                        username, 
                        name, 
                        role, 
                        serviceType: finalServiceType,
                        hasServiceNo: !!finalServiceNo 
                    }), 
                    req.ip
                ]
            );
            
            res.json({ 
                success: true, 
                message: `ユーザー「${name}」を正常に登録しました` 
            });
            
        } catch (error) {
            console.error('ユーザー登録エラー:', error);
            if (error.message && error.message.includes('UNIQUE')) {
                res.status(400).json({ 
                    success: false,
                    error: 'このユーザーIDは既に使用されています' 
                });
            } else {
                res.status(500).json({ 
                    success: false,
                    error: 'ユーザー登録処理でエラーが発生しました' 
                });
            }
        }
    });

    // 全ユーザー取得（退職者除く）
    router.get('/users', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { role } = req.query;
            let query = `
                SELECT id, username, name, role, service_type, created_at ,service_no 
                FROM users 
                WHERE is_active = 1
            `;
            const params = [];
            
            if (role) {
                query += ' AND role = ?';
                params.push(role);
            }
            
            query += ' ORDER BY role, name';
            
            const users = await dbAll(query, params);
            res.json({ 
                success: true,
                users 
            });
            
        } catch (error) {
            console.error('ユーザー一覧取得エラー:', error);
            res.status(500).json({ 
                success: false,
                error: 'ユーザー一覧の取得に失敗しました' 
            });
        }
    });

    // 今日の全体状況取得
    router.get('/status/today', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const today = getCurrentDate();
            
            const users = await dbAll(`
                SELECT 
                    u.*,
                    a.clock_in,
                    a.clock_out,
                    a.status,
                    dr.id as report_id,
                    sc.comment
                FROM users u
                LEFT JOIN attendance a ON u.id = a.user_id AND a.date = ?
                LEFT JOIN daily_reports dr ON u.id = dr.user_id AND dr.date = ?
                LEFT JOIN staff_comments sc ON u.id = sc.user_id AND sc.date = ?
                WHERE u.is_active = 1
                ORDER BY u.role, u.name
            `, [today, today, today]);
            
            res.json({ 
                success: true,
                users, 
                date: today 
            });
            
        } catch (error) {
            console.error('全体状況取得エラー:', error);
            res.status(500).json({ 
                success: false,
                error: '全体状況の取得に失敗しました' 
            });
        }
    });

    router.get('/attendance/search', async (req, res) => {
  try {
    const { date, role, userId } = req.query;
    
    if (!date) {
      return res.status(400).json({ success: false, error: '日付が指定されていません' });
    }
    
    let query = `
      SELECT 
        a.id, a.user_id, a.date, a.clock_in, a.clock_out, a.status,
        a.break_start, a.break_end,
        u.name as user_name, u.role as user_role, u.service_type,
        dr.id as report_id,
        sc.id as comment_id,
        br.start_time as br_start, br.end_time as br_end, br.duration as br_duration
      FROM users u
      LEFT JOIN attendance a ON u.id = a.user_id AND a.date = ?
      LEFT JOIN daily_reports dr ON u.id = dr.user_id AND dr.date = ?
      LEFT JOIN staff_comments sc ON u.id = sc.user_id AND sc.date = ?
      LEFT JOIN break_records br ON u.id = br.user_id AND br.date = ?
      WHERE u.is_active = 1
    `;
    
    const params = [date, date, date, date];
    
    if (role) {
      query += ' AND u.role = ?';
      params.push(role);
    }
    
    if (userId) {
      query += ' AND u.id = ?';
      params.push(userId);
    }
    
    query += ' ORDER BY u.role, u.name';
    
    const records = await dbAll(query, params);
    
    // 休憩記録を統合
    const processedRecords = records.map(record => {
      const processed = {
        id: record.id,
        user_id: record.user_id,
        user_name: record.user_name,
        user_role: record.user_role,
        service_type: record.service_type,
        date: date,
        clock_in: record.clock_in,
        clock_out: record.clock_out,
        status: record.status || 'normal',
        report_id: record.report_id,
        comment_id: record.comment_id
      };
      
      // スタッフ・管理者の休憩情報
      if (record.user_role === 'staff' || record.user_role === 'admin') {
        processed.break_start = record.break_start;
        processed.break_end = record.break_end;
      }
      // 利用者の休憩情報
      else if (record.user_role === 'user' && record.service_type !== 'home') {
        if (record.br_start) {
          processed.breakRecord = {
            start_time: record.br_start,
            end_time: record.br_end,
            duration: record.br_duration
          };
        }
      }
      
      return processed;
    });
    
    res.json({ success: true, records: processedRecords });
  } catch (error) {
    console.error('出勤記録検索エラー:', error);
    res.status(500).json({ success: false, error: '出勤記録の検索に失敗しました' });
  }
});
    // 出勤記録訂正（休憩時間編集対応）- 修正版
    router.post('/attendance/correct', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { recordId, userId, date, newClockIn, newClockOut, newBreakStart, newBreakEnd, status, reason } = req.body;
            
            // バリデーション
            if (!reason || reason.trim() === '') {
                return res.status(400).json({ 
                    success: false,
                    error: '変更理由を入力してください' 
                });
            }
            
            // recordIdがある場合は既存記録の更新
            if (recordId) {
                // 現在の値を取得
                const oldRecord = await dbGet(
                    'SELECT * FROM attendance WHERE id = ?', 
                    [recordId]
                );
                
                if (!oldRecord) {
                    return res.status(404).json({ 
                        success: false,
                        error: '記録が見つかりません' 
                    });
                }

                // ユーザー情報取得
                const user = await dbGet(
                    'SELECT id, role FROM users WHERE id = ?',
                    [oldRecord.user_id]
                );

                // 出勤記録を更新
                await dbRun(
                    'UPDATE attendance SET clock_in = ?, clock_out = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [newClockIn, newClockOut, status, recordId]
                );

                // 休憩記録の処理（利用者とスタッフで分岐）
                if (user.role === 'user') {
                    // 利用者の場合：break_recordsテーブルを更新
                    if (newBreakStart) {
                        const existingBreak = await dbGet(
                            'SELECT * FROM break_records WHERE user_id = ? AND date = ?',
                            [oldRecord.user_id, oldRecord.date]
                        );

                        if (existingBreak) {
                            // 既存の休憩記録を更新
                            await dbRun(
                                'UPDATE break_records SET start_time = ?, end_time = ?, duration = ? WHERE id = ?',
                                [newBreakStart, newBreakEnd, newBreakEnd ? 60 : null, existingBreak.id]
                            );
                        } else {
                            // 新しい休憩記録を作成
                            await dbRun(
                                'INSERT INTO break_records (user_id, date, start_time, end_time, duration) VALUES (?, ?, ?, ?, ?)',
                                [oldRecord.user_id, oldRecord.date, newBreakStart, newBreakEnd, newBreakEnd ? 60 : null]
                            );
                        }
                    } else {
                        // 休憩時間が削除された場合
                        await dbRun(
                            'DELETE FROM break_records WHERE user_id = ? AND date = ?',
                            [oldRecord.user_id, oldRecord.date]
                        );
                    }
                } else {
                    // スタッフ・管理者の場合：attendanceテーブルのbreak_start/break_endを更新
                    await dbRun(
                        'UPDATE attendance SET break_start = ?, break_end = ? WHERE id = ?',
                        [newBreakStart, newBreakEnd, recordId]
                    );
                }
                
                // 監査ログ
                await dbRun(
                    `INSERT INTO audit_log (
                        admin_id, action_type, target_id, target_type,
                        old_value, new_value, reason, ip_address
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        req.session.user.id,
                        'attendance_correction',
                        recordId,
                        'attendance',
                        JSON.stringify({
                            clock_in: oldRecord.clock_in,
                            clock_out: oldRecord.clock_out,
                            status: oldRecord.status,
                            break_start: oldRecord.break_start,
                            break_end: oldRecord.break_end
                        }),
                        JSON.stringify({
                            clock_in: newClockIn,
                            clock_out: newClockOut,
                            status: status,
                            break_start: newBreakStart,
                            break_end: newBreakEnd
                        }),
                        reason,
                        req.ip
                    ]
                );
            }
            // recordIdがない場合は新規記録の作成
            else if (userId && date && newClockIn) {
                // ユーザー情報取得
                const user = await dbGet(
                    'SELECT id, role FROM users WHERE id = ?',
                    [userId]
                );
                
                if (!user) {
                    return res.status(404).json({ 
                        success: false,
                        error: 'ユーザーが見つかりません' 
                    });
                }
                
                // 新規出勤記録を作成
                const result = await dbRun(
                    `INSERT INTO attendance (user_id, date, clock_in, clock_out, status) 
                     VALUES (?, ?, ?, ?, ?)
                     ON CONFLICT(user_id, date) DO UPDATE SET
                        clock_in = excluded.clock_in,
                        clock_out = excluded.clock_out,
                        status = excluded.status,
                        updated_at = CURRENT_TIMESTAMP`,
                    [userId, date, newClockIn, newClockOut, status || 'normal']
                );
                
                // 休憩記録の処理
                if (newBreakStart && user.role === 'user') {
                    await dbRun(
                        `INSERT OR REPLACE INTO break_records (user_id, date, start_time, end_time, duration) 
                         VALUES (?, ?, ?, ?, ?)`,
                        [userId, date, newBreakStart, newBreakEnd, newBreakEnd ? 60 : null]
                    );
                } else if (newBreakStart && user.role !== 'user') {
                    await dbRun(
                        'UPDATE attendance SET break_start = ?, break_end = ? WHERE user_id = ? AND date = ?',
                        [newBreakStart, newBreakEnd, userId, date]
                    );
                }
                
                // 監査ログ
                await dbRun(
                    `INSERT INTO audit_log (
                        admin_id, action_type, target_id, target_type,
                        new_value, reason, ip_address
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        req.session.user.id,
                        'attendance_creation',
                        result.lastID || result.id,
                        'attendance',
                        JSON.stringify({
                            user_id: userId,
                            date: date,
                            clock_in: newClockIn,
                            clock_out: newClockOut,
                            status: status || 'normal',
                            break_start: newBreakStart,
                            break_end: newBreakEnd
                        }),
                        reason,
                        req.ip
                    ]
                );
            } else {
                return res.status(400).json({ 
                    success: false,
                    error: '必要なパラメータが不足しています' 
                });
            }
            
            res.json({ 
                success: true, 
                message: '出勤記録を正常に更新しました' 
            });
            
        } catch (error) {
            console.error('出退勤訂正エラー:', error);
            res.status(500).json({ 
                success: false,
                error: '出勤記録の訂正に失敗しました' 
            });
        }
    });

    // 月次出勤簿取得（修正版 - 休憩データ統合対応）
    router.get('/attendance/:year/:month/:userId', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { year, month, userId } = req.params;
            
            // パラメータ検証
            if (!year || !month || !userId) {
                return res.status(400).json({ 
                    success: false,
                    error: 'パラメータが不正です' 
                });
            }
            
            const startDate = `${year}-${month.padStart(2, '0')}-01`;
            const endDate = `${year}-${month.padStart(2, '0')}-31`;
            
            // ユーザー情報取得
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
            
            // 出勤記録取得（休憩データ統合）
            const records = await dbAll(`
                SELECT 
                    a.*,
                    dr.id as report_id,
                    sc.comment,
                    CASE 
                        WHEN u.role = 'user' THEN br.start_time
                        ELSE a.break_start
                    END as break_start,
                    CASE 
                        WHEN u.role = 'user' THEN br.end_time
                        ELSE a.break_end
                    END as break_end,
                    CASE 
                        WHEN u.role = 'user' THEN br.duration
                        ELSE CASE 
                            WHEN a.break_start IS NOT NULL AND a.break_end IS NOT NULL 
                            THEN 60 
                            ELSE NULL 
                        END
                    END as break_duration
                FROM attendance a
                JOIN users u ON a.user_id = u.id
                LEFT JOIN daily_reports dr ON a.user_id = dr.user_id AND a.date = dr.date
                LEFT JOIN staff_comments sc ON a.user_id = sc.user_id AND a.date = sc.date
                LEFT JOIN break_records br ON a.user_id = br.user_id AND a.date = br.date AND u.role = 'user'
                WHERE a.user_id = ? AND a.date BETWEEN ? AND ?
                ORDER BY a.date
            `, [userId, startDate, endDate]);
            
            // 監査ログ記録
            await dbRun(
                'INSERT INTO audit_log (admin_id, action_type, target_id, target_type, ip_address) VALUES (?, ?, ?, ?, ?)',
                [req.session.user.id, 'monthly_attendance_view', userId, 'user', req.ip]
            );
            
            res.json({ 
                success: true,
                records, 
                user 
            });
            
        } catch (error) {
            console.error('月次出勤簿取得エラー:', error);
            res.status(500).json({ 
                success: false,
                error: '月次出勤簿の取得に失敗しました' 
            });
        }
    });

    // 利用者の休憩ステータス取得（管理者用）
    router.get('/user/:userId/break/status/:date', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { userId, date } = req.params;
            
            // ユーザー情報取得
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
            
            let breakRecord = null;
            
            if (user.role === 'user') {
                // 利用者の場合はbreak_recordsテーブル
                breakRecord = await dbGet(
                    'SELECT * FROM break_records WHERE user_id = ? AND date = ?',
                    [userId, date]
                );
            } else {
                // スタッフ・管理者の場合はattendanceテーブル
                const attendance = await dbGet(
                    'SELECT break_start as start_time, break_end as end_time FROM attendance WHERE user_id = ? AND date = ?',
                    [userId, date]
                );
                
                if (attendance && attendance.start_time) {
                    breakRecord = {
                        start_time: attendance.start_time,
                        end_time: attendance.end_time,
                        duration: 60 // スタッフは固定60分
                    };
                }
            }
            
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

    // ユーザー情報更新
    router.put('/user/update', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { userId, username, password, name, role, serviceType, service_no } = req.body;
            
            // バリデーション
            if (!userId || !username || !name || !role) {
                return res.status(400).json({ 
                    success: false,
                    error: '必須項目が不足しています' 
                });
            }

            const finalServiceNo = role === 'user' ? service_no : null;
            
            // 重複チェック（自分以外）
            const existing = await dbGet(
                'SELECT * FROM users WHERE username = ? AND id != ?', 
                [username, userId]
            );
            
            if (existing) {
                return res.status(400).json({ 
                    success: false,
                    error: '同じユーザーIDが既に存在します' 
                });
            }
            
            // 更新クエリ構築
            let updateQuery = 'UPDATE users SET username = ?, name = ?, role = ?, service_type = ?, service_no = ?, updated_at = CURRENT_TIMESTAMP';
            const params = [username, name, role, finalServiceNo, service_no];
            
            // パスワード変更がある場合
            if (password) {
                const hashedPassword = await bcrypt.hash(password, 10);
                updateQuery += ', password = ?';
                params.push(hashedPassword);
            }
            
            updateQuery += ' WHERE id = ?';
            params.push(userId);
            
            await dbRun(updateQuery, params);
            
            // 監査ログ記録
            await dbRun(
                'INSERT INTO audit_log (admin_id, action_type, target_id, target_type, new_value, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
                [
                    req.session.user.id, 
                    'user_update', 
                    userId, 
                    'user',
                    JSON.stringify({ username, name, role, serviceType, passwordChanged: !!password }),
                    req.ip
                ]
            );
            
            res.json({ 
                success: true, 
                message: 'ユーザー情報を更新しました' 
            });
            
        } catch (error) {
            console.error('ユーザー更新エラー:', error);
            res.status(500).json({ 
                success: false,
                error: 'ユーザー情報の更新に失敗しました' 
            });
        }
    });

    // ユーザー無効化処理
    router.put('/retire/:userId', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { userId } = req.params;
            
            // ユーザー存在確認
            const user = await dbGet(
                'SELECT username, name FROM users WHERE id = ? AND is_active = 1', 
                [userId]
            );
            
            if (!user) {
                return res.status(404).json({ 
                    success: false,
                    error: 'ユーザーが見つかりません' 
                });
            }
            
            // デフォルトユーザーは無効化不可
            const defaultUsers = ['admin', 'staff1', 'user1', 'user2'];
            if (defaultUsers.includes(user.username)) {
                return res.status(400).json({ 
                    success: false,
                    error: 'デフォルトユーザーは無効化できません' 
                });
            }
            
            // 無効化実行
            await dbRun(
                'UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
                [userId]
            );
            
            // 監査ログ記録
            await dbRun(
                'INSERT INTO audit_log (admin_id, action_type, target_id, target_type, new_value, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
                [
                    req.session.user.id, 
                    'user_deactivation', 
                    userId, 
                    'user',
                    JSON.stringify({ username: user.username, name: user.name }),
                    req.ip
                ]
            );
            
            res.json({ 
                success: true, 
                message: `ユーザー「${user.name}」を無効化しました` 
            });
            
        } catch (error) {
            console.error('ユーザー無効化エラー:', error);
            res.status(500).json({ 
                success: false,
                error: 'ユーザー無効化処理でエラーが発生しました' 
            });
        }
    });

    // 監査ログ取得
    router.get('/audit-log', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { 
                limit = 50, 
                offset = 0, 
                actionType, 
                adminId, 
                startDate, 
                endDate 
            } = req.query;
            
            let query = `
                SELECT 
                    a.*,
                    u.name as admin_name
                FROM audit_log a
                JOIN users u ON a.admin_id = u.id
                WHERE 1=1
            `;
            
            const params = [];
            
            // フィルター適用
            if (actionType) {
                query += ' AND a.action_type = ?';
                params.push(actionType);
            }
            
            if (adminId) {
                query += ' AND a.admin_id = ?';
                params.push(adminId);
            }
            
            if (startDate) {
                query += ' AND DATE(a.created_at) >= ?';
                params.push(startDate);
            }
            
            if (endDate) {
                query += ' AND DATE(a.created_at) <= ?';
                params.push(endDate);
            }
            
            // 総件数取得
            const countQuery = query.replace('SELECT a.*, u.name as admin_name', 'SELECT COUNT(*) as total');
            const totalResult = await dbGet(countQuery, params);
            const total = totalResult ? totalResult.total : 0;
            
            // ページネーション適用
            query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
            params.push(parseInt(limit), parseInt(offset));
            
            const logs = await dbAll(query, params);
            
            res.json({ 
                success: true,
                logs, 
                total,
                pagination: {
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            });
            
        } catch (error) {
            console.error('監査ログ取得エラー:', error);
            res.status(500).json({ 
                success: false,
                error: '監査ログの取得に失敗しました' 
            });
        }
    });

    // 出勤記録削除（管理者のみ）
    router.delete('/attendance/:recordId', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { recordId } = req.params;
            const { reason } = req.body;
            
            // バリデーション
            if (!reason || reason.trim() === '') {
                return res.status(400).json({ 
                    success: false,
                    error: '削除理由を入力してください' 
                });
            }
            
            // 既存記録の確認
            const attendance = await dbGet(
                `SELECT a.*, u.name as user_name, u.role as user_role 
                 FROM attendance a 
                 JOIN users u ON a.user_id = u.id 
                 WHERE a.id = ?`,
                [recordId]
            );
            
            if (!attendance) {
                return res.status(404).json({ 
                    success: false,
                    error: '出勤記録が見つかりません' 
                });
            }
            
            // トランザクション開始
            await dbRun('BEGIN TRANSACTION');
            
            try {
                // 監査ログに記録（削除前）
                await dbRun(
                    `INSERT INTO audit_log (
                        admin_id, action_type, target_id, target_type,
                        old_value, reason, ip_address
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        req.session.user.id,
                        'attendance_deletion',
                        recordId,
                        'attendance',
                        JSON.stringify({
                            user_id: attendance.user_id,
                            user_name: attendance.user_name,
                            user_role: attendance.user_role,
                            date: attendance.date,
                            clock_in: attendance.clock_in,
                            clock_out: attendance.clock_out,
                            status: attendance.status,
                            break_start: attendance.break_start,
                            break_end: attendance.break_end
                        }),
                        reason,
                        req.ip
                    ]
                );
                
                // 関連する休憩記録も削除（利用者の場合）
                if (attendance.user_role === 'user') {
                    await dbRun(
                        'DELETE FROM break_records WHERE user_id = ? AND date = ?',
                        [attendance.user_id, attendance.date]
                    );
                }
                
                // 関連する日報がある場合は警告（削除はしない）
                const report = await dbGet(
                    'SELECT id FROM daily_reports WHERE user_id = ? AND date = ?',
                    [attendance.user_id, attendance.date]
                );
                
                const comment = await dbGet(
                    'SELECT id FROM staff_comments WHERE user_id = ? AND date = ?',
                    [attendance.user_id, attendance.date]
                );
                
                // 出勤記録を削除
                await dbRun('DELETE FROM attendance WHERE id = ?', [recordId]);
                
                // トランザクションコミット
                await dbRun('COMMIT');
                
                // レスポンス
                const warnings = [];
                if (report) {
                    warnings.push('関連する日報が存在します。日報は削除されていません。');
                }
                if (comment) {
                    warnings.push('関連するスタッフコメントが存在します。コメントは削除されていません。');
                }
                
                res.json({ 
                    success: true, 
                    message: `${attendance.user_name}さんの${attendance.date}の出勤記録を削除しました`,
                    warnings: warnings.length > 0 ? warnings : undefined
                });
                
            } catch (error) {
                // ロールバック
                await dbRun('ROLLBACK');
                throw error;
            }
            
        } catch (error) {
            console.error('出勤記録削除エラー:', error);
            res.status(500).json({ 
                success: false,
                error: '出勤記録の削除に失敗しました' 
            });
        }
    });

    return router;
};