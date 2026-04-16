// routes/admin.js
// 管理者API - JST統一版

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getCurrentDate } = require('../utils/date-time');

// 日報自動生成用のランダムデータ生成
function generateRandomReportData(isHome, clockInValue, clockOutValue) {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    // 体温: 35.3〜36.4（0.1刻み）
    const temperature = +(35.3 + Math.floor(Math.random() * 12) * 0.1).toFixed(1);

    // 食欲: 良好 or なし
    const appetite = pick(['good', 'none']);

    // PC番号
    const pcNumber = isHome ? pick(['8', '9']) : pick(['8', '9']);

    // 就寝時間: 21:00〜23:45（15分刻み・HH:MM有効範囲内）
    // 24:00 以降は time入力のフォーマット仕様外となり日報フォームに反映されないため生成しない
    const bedMinutes = 21 * 60 + Math.floor(Math.random() * 12) * 15; // 21:00〜23:45
    const bedH = Math.floor(bedMinutes / 60);
    const bedM = bedMinutes % 60;
    const bedtime = `${String(bedH).padStart(2, '0')}:${String(bedM).padStart(2, '0')}`;

    // 起床時間: 05:30〜08:15（15分刻み）
    const wakeMinutes = 5 * 60 + 30 + Math.floor(Math.random() * 12) * 15; // 05:30〜08:15
    const wakeH = Math.floor(wakeMinutes / 60);
    const wakeM = wakeMinutes % 60;
    const wakeupTime = `${String(wakeH).padStart(2, '0')}:${String(wakeM).padStart(2, '0')}`;

    // ���眠状態: 3パターン
    const sleepQuality = pick(['good', 'poor', 'bad']);

    // 振り返り・感想
    const reflections = [
        '今日も一日お疲れ様でした',
        '次回も頑張ります',
        '今日は上手くできませんでした',
        '今日は調子が良かったです',
        'うまくできてよかったです',
        '学習が少し進みました',
        '今日は疲れました',
        '集中できました',
        '難しかったです',
        '前回の復習をしました',
        '前回の続きをやりました',
        '次回も宜しくお願いします',
        'お疲れさまでした',
        '今日はいつもより頑張れました',
        '今日もありがとうございました',
        '無理せずやっていこうと思います',
        'この調子で進めていきたいです',
        '順調にできました',
        'このペースでやっていきたいです',
        '中々進まなかったですが次回頑張ります',
        'わからなかったところが今日わかって良かったです',
        '今日は上手く出来て嬉しかったです',
        '一歩前進できたと思います',
        'わかりやすかった',
        '理解できた',
        'スムーズに作業できました'

    ];
    const reflection = pick(reflections);

    return {
        workContent: 'PC作業',
        workLocation: isHome ? 'home' : 'office',
        pcNumber,
        externalWorkLocation: isHome ? '施設外就労先名（佐藤美幸）' : null,
        temperature,
        appetite,
        bedtime,
        wakeupTime,
        sleepQuality,
        reflection,
        contactTime1: isHome ? clockInValue : null,
        contactTime2: isHome ? clockOutValue : null
    };
}

module.exports = (dbGet, dbAll, dbRun, requireAuth, requireRole) => {
    // ユーザー登録
    router.post('/register', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { username, password, name, role, serviceType, ServiceNo, transportation, skills } = req.body;
            
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

            // 受給者番号・送迎・スキルの処理
            const finalServiceNo = role === 'user' ? ServiceNo : null;
            const finalServiceType = role === 'user' ? serviceType : null;
            const finalTransportation = (role === 'user' && serviceType === 'commute') ? (transportation ? 1 : null) : null;
            const finalSkills = (role === 'user' && Array.isArray(skills) && skills.length > 0) ? skills.join(',') : null;
            
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
                'INSERT INTO users (username, password, name, role, service_type, service_no, transportation, skills) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [username, hashedPassword, name, role, finalServiceType, finalServiceNo, finalTransportation, finalSkills]
            );
            
            // 管理者操作は監査ログに記録しない
            
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
                SELECT id, username, name, role, service_type, created_at, service_no, workweek, transportation, skills
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
        u.name as user_name, u.role as user_role, u.service_type, u.workweek as user_workweek,u.id as user_id,
        dr.id as report_id,
        sc.id as comment_id,
        br.start_time as br_start, br.end_time as br_end, br.duration as br_duration,
        sdr.id as staff_report_id
      FROM users u
      LEFT JOIN attendance a ON u.id = a.user_id AND a.date = ?
      LEFT JOIN daily_reports dr ON u.id = dr.user_id AND dr.date = ?
      LEFT JOIN staff_comments sc ON u.id = sc.user_id AND sc.date = ?
      LEFT JOIN break_records br ON u.id = br.user_id AND br.date = ?
      LEFT JOIN staff_daily_reports sdr ON u.id = sdr.staff_id AND sdr.date = ?
      WHERE u.is_active = 1
    `;

    const params = [date, date, date, date, date];
    
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
        workweek: record.user_workweek,
        date: date,
        clock_in: record.clock_in,
        clock_out: record.clock_out,
        status: record.status || 'normal',
        report_id: record.report_id,
        comment_id: record.comment_id,
        staff_report_id: record.staff_report_id
      };
      
      // スタッフ・管理者の休憩情報
      if (record.user_role === 'staff' || record.user_role === 'admin') {
        processed.break_start = record.break_start;
        processed.break_end = record.break_end;
      }
      // 利用者の休憩情報
      else if (record.user_role === 'user') {
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

            // デバッグログ
            console.log('出勤記録修正リクエスト:', { recordId, userId, date, newClockIn, newClockOut, newBreakStart, newBreakEnd, status, reason });

            // バリデーション
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

                // 空文字列をNULLに変換（欠勤対応）
                const clockInValue = newClockIn && newClockIn.trim() !== '' ? newClockIn : null;
                const clockOutValue = newClockOut && newClockOut.trim() !== '' ? newClockOut : null;

                // 出勤記録を更新
                await dbRun(
                    'UPDATE attendance SET clock_in = ?, clock_out = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [clockInValue, clockOutValue, status, recordId]
                );

                // 休憩記録の処理（利用者とスタッフで分岐）（空文字列をNULLに変換）
                const breakStartValue = newBreakStart && newBreakStart.trim() !== '' ? newBreakStart : null;
                const breakEndValue = newBreakEnd && newBreakEnd.trim() !== '' ? newBreakEnd : null;

                if (user.role === 'user') {
                    // 利用者の場合：break_recordsテーブルを更新
                    if (breakStartValue) {
                        const existingBreak = await dbGet(
                            'SELECT * FROM break_records WHERE user_id = ? AND date = ?',
                            [oldRecord.user_id, oldRecord.date]
                        );

                        if (existingBreak) {
                            // 既存の休憩記録を更新
                            await dbRun(
                                'UPDATE break_records SET start_time = ?, end_time = ?, duration = ? WHERE id = ?',
                                [breakStartValue, breakEndValue, breakEndValue ? 60 : null, existingBreak.id]
                            );
                        } else {
                            // 新しい休憩記録を作成
                            await dbRun(
                                'INSERT INTO break_records (user_id, date, start_time, end_time, duration) VALUES (?, ?, ?, ?, ?)',
                                [oldRecord.user_id, oldRecord.date, breakStartValue, breakEndValue, breakEndValue ? 60 : null]
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
                        [breakStartValue, breakEndValue, recordId]
                    );
                }

                // スタッフの出勤記録訂正は監査ログに記録
                if (user.role === 'staff') {
                    await dbRun(
                        `INSERT INTO audit_log (admin_id, action_type, target_id, target_type, old_value, new_value, ip_address)
                         VALUES (?, 'attendance_correction', ?, 'user', ?, ?, ?)`,
                        [
                            req.session.user.id,
                            oldRecord.user_id,
                            JSON.stringify({
                                clock_in: oldRecord.clock_in,
                                clock_out: oldRecord.clock_out,
                                break_start: oldRecord.break_start,
                                break_end: oldRecord.break_end,
                                status: oldRecord.status
                            }),
                            JSON.stringify({
                                clock_in: clockInValue,
                                clock_out: clockOutValue,
                                break_start: breakStartValue,
                                break_end: breakEndValue,
                                status: status
                            }),
                            req.ip
                        ]
                    );
                }
            }
            // recordIdがない場合は新規記録の作成（欠勤の場合もnewClockInが空でもOK）
            else if (userId && date) {
                // ユーザー情報取得
                const user = await dbGet(
                    'SELECT id, role, service_type FROM users WHERE id = ?',
                    [userId]
                );

                if (!user) {
                    return res.status(404).json({
                        success: false,
                        error: 'ユーザーが見つかりません'
                    });
                }

                // 空文字列をNULLに変換（欠勤対応）
                const clockInValue = newClockIn && newClockIn.trim() !== '' ? newClockIn : null;
                const clockOutValue = newClockOut && newClockOut.trim() !== '' ? newClockOut : null;

                // 新規出勤記録を作成
                const result = await dbRun(
                    `INSERT INTO attendance (user_id, date, clock_in, clock_out, status)
                     VALUES (?, ?, ?, ?, ?)
                     ON CONFLICT(user_id, date) DO UPDATE SET
                        clock_in = excluded.clock_in,
                        clock_out = excluded.clock_out,
                        status = excluded.status,
                        updated_at = CURRENT_TIMESTAMP`,
                    [userId, date, clockInValue, clockOutValue, status || 'normal']
                );

                // 休憩記録の処理（空文字列をNULLに変換）
                const breakStartValue = newBreakStart && newBreakStart.trim() !== '' ? newBreakStart : null;
                const breakEndValue = newBreakEnd && newBreakEnd.trim() !== '' ? newBreakEnd : null;

                if (breakStartValue && user.role === 'user') {
                    await dbRun(
                        `INSERT OR REPLACE INTO break_records (user_id, date, start_time, end_time, duration)
                         VALUES (?, ?, ?, ?, ?)`,
                        [userId, date, breakStartValue, breakEndValue, breakEndValue ? 60 : null]
                    );
                } else if (breakStartValue && user.role !== 'user') {
                    await dbRun(
                        'UPDATE attendance SET break_start = ?, break_end = ? WHERE user_id = ? AND date = ?',
                        [breakStartValue, breakEndValue, userId, date]
                    );
                }

                // 利用者の場合、欠勤でない（出勤・退勤時刻がある）場合は日報を自動生成
                if (user.role === 'user' && clockInValue && clockOutValue && status !== 'absence' && status !== 'paid_leave') {
                    // 既存の日報があるかチェック
                    const existingReport = await dbGet(
                        'SELECT id FROM daily_reports WHERE user_id = ? AND date = ?',
                        [userId, date]
                    );

                    if (!existingReport) {
                        const isHome = user.service_type === 'home';
                        const rd = generateRandomReportData(isHome, clockInValue, clockOutValue);

                        await dbRun(
                            `INSERT OR IGNORE INTO daily_reports (
                                user_id, date, work_content, work_location, pc_number,
                                external_work_location, temperature, appetite, medication_time,
                                bedtime, wakeup_time, sleep_quality, reflection, interview_request,
                                contact_time_1, contact_time_2
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                userId, date,
                                rd.workContent, rd.workLocation, rd.pcNumber,
                                rd.externalWorkLocation, rd.temperature, rd.appetite,
                                null, rd.bedtime, rd.wakeupTime, rd.sleepQuality,
                                rd.reflection, null, rd.contactTime1, rd.contactTime2
                            ]
                        );

                        console.log(`[日報自動生成] ユーザーID: ${userId}, 日付: ${date}, 区分: ${isHome ? '在宅' : '通所'}, 就寝: ${rd.bedtime}, 起床: ${rd.wakeupTime}`);
                    }
                }

                // スタッフの出勤記録新規作成は監査ログに記録
                if (user.role === 'staff') {
                    await dbRun(
                        `INSERT INTO audit_log (admin_id, action_type, target_id, target_type, new_value, ip_address)
                         VALUES (?, 'attendance_correction', ?, 'user', ?, ?)`,
                        [
                            req.session.user.id,
                            userId,
                            JSON.stringify({
                                date: date,
                                clock_in: clockInValue,
                                clock_out: clockOutValue,
                                break_start: breakStartValue,
                                break_end: breakEndValue,
                                status: status || 'normal'
                            }),
                            req.ip
                        ]
                    );
                }
            } else {
                console.log('パラメータ不足エラー:', { recordId, userId, date, newClockIn });
                return res.status(400).json({
                    success: false,
                    error: '必要なパラメータが不足しています（userIdまたはdateが必要）'
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
            
            // ユーザー情報取得（passwordは返さない）
            const user = await dbGet(
                `SELECT id, username, name, role, service_type, service_no, workweek, transportation
                 FROM users WHERE id = ? AND is_active = 1`,
                [userId]
            );

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'ユーザーが見つかりません'
                });
            }

            // 出勤記録取得（休憩データ統合、スタッフ日報追加）
            const records = await dbAll(`
                SELECT
                    a.*,
                    dr.id as report_id,
                    u.service_type,
                    sdr.id as staff_report_id,
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
                        ELSE NULL
                    END as break_duration
                FROM attendance a
                JOIN users u ON a.user_id = u.id
                LEFT JOIN daily_reports dr ON a.user_id = dr.user_id AND a.date = dr.date
                LEFT JOIN staff_daily_reports sdr ON a.user_id = sdr.staff_id AND a.date = sdr.date
                LEFT JOIN staff_comments sc ON a.user_id = sc.user_id AND a.date = sc.date
                LEFT JOIN break_records br ON a.user_id = br.user_id AND a.date = br.date AND u.role = 'user'
                WHERE a.user_id = ? AND a.date BETWEEN ? AND ?
                ORDER BY a.date
            `, [userId, startDate, endDate]);
            
            // 管理者操作は監査ログに記録しない
            
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
            const { userId, username, password, name, role, serviceType, service_no, workweek, transportation, skills } = req.body;

            // バリデーション
            if (!userId || !username || !name || !role) {
                return res.status(400).json({
                    success: false,
                    error: '必須項目が不足しています'
                });
            }

            const finalServiceNo = role === 'user' ? service_no : null;
            const finalTransportation = (role === 'user' && serviceType === 'commute') ? (transportation ? 1 : null) : null;
            const finalSkills = (role === 'user' && Array.isArray(skills) && skills.length > 0) ? skills.join(',') : null;

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
            let updateQuery = 'UPDATE users SET username = ?, name = ?, role = ?, service_type = ?, service_no = ?, transportation = ?, skills = ?, updated_at = CURRENT_TIMESTAMP';
            const params = [username, name, role, serviceType, finalServiceNo, finalTransportation, finalSkills];
            
            // パスワード変更がある場合
            if (password) {
                const hashedPassword = await bcrypt.hash(password, 10);
                updateQuery += ', password = ?';
                params.push(hashedPassword);
            }
            
            if(workweek){
                const updateworkweek = workweek
                updateQuery += ', workweek = ?';
                params.push(updateworkweek);
            }
            
            updateQuery += ' WHERE id = ?';
            params.push(userId);
            
            await dbRun(updateQuery, params);
            
            // 管理者操作は監査ログに記録しない

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
            
            // 管理者操作は監査ログに記録しない
            
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
                    u.name as admin_name,
                    approver.name as approver_name,
                    COALESCE(target_user.name, att_user.name, json_user.name) as target_name,
                    COALESCE(target_user.role, att_user.role, json_user.role) as target_role
                FROM audit_log a
                JOIN users u ON a.admin_id = u.id
                LEFT JOIN users approver ON a.approved_by = approver.id
                LEFT JOIN users target_user ON a.target_id = target_user.id AND a.target_type = 'user'
                LEFT JOIN attendance att ON a.target_id = att.id AND a.target_type = 'attendance'
                LEFT JOIN users att_user ON att.user_id = att_user.id
                LEFT JOIN users json_user ON json_user.id = CAST(COALESCE(
                    json_extract(a.old_value, '$.user_id'),
                    json_extract(a.new_value, '$.user_id')
                ) AS INTEGER)
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

    // 監査ログ承認（スタッフの出勤記録操作）
    router.post('/audit-log/:id/approve', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { id } = req.params;
            const adminId = req.session.user.id;

            const log = await dbGet(
                'SELECT * FROM audit_log WHERE id = ?',
                [id]
            );

            if (!log) {
                return res.status(404).json({
                    success: false,
                    error: '監査ログが見つかりません'
                });
            }

            if (log.approval_status !== 'pending') {
                return res.status(400).json({
                    success: false,
                    error: '承認待ちのログのみ承認できます'
                });
            }

            const newValues = JSON.parse(log.new_value);

            // 訂正の場合：既存レコードを更新
            if (log.action_type === 'staff_attendance_correction' && log.target_id) {
                const record = await dbGet(
                    'SELECT * FROM attendance WHERE id = ?',
                    [log.target_id]
                );

                if (!record) {
                    return res.status(404).json({
                        success: false,
                        error: '対象の出勤記録が見つかりません'
                    });
                }

                const clockInValue = newValues.clock_in && newValues.clock_in.trim() !== '' ? newValues.clock_in : null;
                const clockOutValue = newValues.clock_out && newValues.clock_out.trim() !== '' ? newValues.clock_out : null;

                await dbRun(
                    'UPDATE attendance SET clock_in = ?, clock_out = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [clockInValue, clockOutValue, newValues.status, log.target_id]
                );

                // 休憩記録の処理
                const user = await dbGet('SELECT role FROM users WHERE id = ?', [record.user_id]);
                const breakStartValue = newValues.break_start && newValues.break_start.trim() !== '' ? newValues.break_start : null;
                const breakEndValue = newValues.break_end && newValues.break_end.trim() !== '' ? newValues.break_end : null;

                if (user && user.role === 'user') {
                    if (breakStartValue) {
                        const existingBreak = await dbGet(
                            'SELECT * FROM break_records WHERE user_id = ? AND date = ?',
                            [record.user_id, record.date]
                        );
                        if (existingBreak) {
                            await dbRun(
                                'UPDATE break_records SET start_time = ?, end_time = ?, duration = ? WHERE id = ?',
                                [breakStartValue, breakEndValue, breakEndValue ? 60 : null, existingBreak.id]
                            );
                        } else {
                            await dbRun(
                                'INSERT INTO break_records (user_id, date, start_time, end_time, duration) VALUES (?, ?, ?, ?, ?)',
                                [record.user_id, record.date, breakStartValue, breakEndValue, breakEndValue ? 60 : null]
                            );
                        }
                    } else {
                        await dbRun(
                            'DELETE FROM break_records WHERE user_id = ? AND date = ?',
                            [record.user_id, record.date]
                        );
                    }
                } else {
                    await dbRun(
                        'UPDATE attendance SET break_start = ?, break_end = ? WHERE id = ?',
                        [breakStartValue, breakEndValue, log.target_id]
                    );
                }
            }
            // 新規作成の場合：出勤記録を挿入
            else if (log.action_type === 'staff_attendance_creation') {
                const targetUserId = newValues.user_id;
                const targetDate = newValues.date;

                const user = await dbGet(
                    'SELECT id, role, service_type FROM users WHERE id = ?',
                    [targetUserId]
                );

                if (!user) {
                    return res.status(404).json({
                        success: false,
                        error: '対象ユーザーが見つかりません'
                    });
                }

                const clockInValue = newValues.clock_in && newValues.clock_in.trim() !== '' ? newValues.clock_in : null;
                const clockOutValue = newValues.clock_out && newValues.clock_out.trim() !== '' ? newValues.clock_out : null;

                const result = await dbRun(
                    `INSERT INTO attendance (user_id, date, clock_in, clock_out, status)
                     VALUES (?, ?, ?, ?, ?)
                     ON CONFLICT(user_id, date) DO UPDATE SET
                        clock_in = excluded.clock_in,
                        clock_out = excluded.clock_out,
                        status = excluded.status,
                        updated_at = CURRENT_TIMESTAMP`,
                    [targetUserId, targetDate, clockInValue, clockOutValue, newValues.status || 'normal']
                );

                // 休憩記録
                const breakStartValue = newValues.break_start && newValues.break_start.trim() !== '' ? newValues.break_start : null;
                const breakEndValue = newValues.break_end && newValues.break_end.trim() !== '' ? newValues.break_end : null;

                if (breakStartValue && user.role === 'user') {
                    await dbRun(
                        `INSERT OR REPLACE INTO break_records (user_id, date, start_time, end_time, duration)
                         VALUES (?, ?, ?, ?, ?)`,
                        [targetUserId, targetDate, breakStartValue, breakEndValue, breakEndValue ? 60 : null]
                    );
                }

                // 日報自動生成
                if (user.role === 'user' && clockInValue && clockOutValue && newValues.status !== 'absence' && newValues.status !== 'paid_leave') {
                    const existingReport = await dbGet(
                        'SELECT id FROM daily_reports WHERE user_id = ? AND date = ?',
                        [targetUserId, targetDate]
                    );

                    if (!existingReport) {
                        const isHome = user.service_type === 'home';
                        const rd = generateRandomReportData(isHome, clockInValue, clockOutValue);

                        await dbRun(
                            `INSERT OR IGNORE INTO daily_reports (
                                user_id, date, work_content, work_location, pc_number,
                                external_work_location, temperature, appetite, medication_time,
                                bedtime, wakeup_time, sleep_quality, reflection, interview_request,
                                contact_time_1, contact_time_2
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                targetUserId, targetDate,
                                rd.workContent, rd.workLocation, rd.pcNumber,
                                rd.externalWorkLocation, rd.temperature, rd.appetite,
                                null, rd.bedtime, rd.wakeupTime, rd.sleepQuality,
                                rd.reflection, null, rd.contactTime1, rd.contactTime2
                            ]
                        );
                    }
                }

                // target_idを更新
                await dbRun(
                    'UPDATE audit_log SET target_id = ? WHERE id = ?',
                    [result.lastID || result.id, id]
                );
            }
            // 削除要望の場合：出勤記録・日報・休憩記録・コメントを削除
            else if (log.action_type === 'staff_attendance_deletion' && log.target_id) {
                const record = await dbGet(
                    `SELECT a.*, u.role as user_role
                     FROM attendance a JOIN users u ON a.user_id = u.id
                     WHERE a.id = ?`,
                    [log.target_id]
                );

                if (!record) {
                    return res.status(404).json({
                        success: false,
                        error: '対象の出勤記録が見つかりません（既に削除済みの可能性）'
                    });
                }

                // 休憩記録を削除（利用者の場合）
                if (record.user_role === 'user') {
                    await dbRun(
                        'DELETE FROM break_records WHERE user_id = ? AND date = ?',
                        [record.user_id, record.date]
                    );
                }

                // 日報を削除
                await dbRun(
                    'DELETE FROM daily_reports WHERE user_id = ? AND date = ?',
                    [record.user_id, record.date]
                );

                // スタッフコメントを削除
                await dbRun(
                    'DELETE FROM staff_comments WHERE user_id = ? AND date = ?',
                    [record.user_id, record.date]
                );

                // 出勤記録を削除
                await dbRun(
                    'DELETE FROM attendance WHERE id = ?',
                    [log.target_id]
                );
            }

            await dbRun(
                `UPDATE audit_log SET
                    approval_status = 'approved',
                    approved_by = ?,
                    approved_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [adminId, id]
            );

            res.json({
                success: true,
                message: '承認しました（出勤記録に反映しました）'
            });

        } catch (error) {
            console.error('監査ログ承認エラー:', error);
            res.status(500).json({
                success: false,
                error: '承認処理に失敗しました'
            });
        }
    });

    // 監査ログ非承認（申請を却下）
    router.post('/audit-log/:id/reject', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { id } = req.params;
            const adminId = req.session.user.id;

            const log = await dbGet(
                'SELECT * FROM audit_log WHERE id = ?',
                [id]
            );

            if (!log) {
                return res.status(404).json({
                    success: false,
                    error: '監査ログが見つかりません'
                });
            }

            if (log.approval_status !== 'pending') {
                return res.status(400).json({
                    success: false,
                    error: '承認待ちのログのみ非承認にできます'
                });
            }

            // 承認前なのでDB変更は不要、ステータスを更新するだけ
            await dbRun(
                `UPDATE audit_log SET
                    approval_status = 'rejected',
                    approved_by = ?,
                    approved_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [adminId, id]
            );

            res.json({
                success: true,
                message: '非承認にしました'
            });

        } catch (error) {
            console.error('監査ログ非承認エラー:', error);
            res.status(500).json({
                success: false,
                error: '非承認処理に失敗しました'
            });
        }
    });

    // 出勤記録削除（管理者のみ）
    router.delete('/attendance/:recordId', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { recordId } = req.params;
            const { reason } = req.body;
            
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
                // スタッフの出勤記録操作は監査ログに記録
                if (attendance.user_role === 'staff') {
                    await dbRun(
                        `INSERT INTO audit_log (admin_id, action_type, target_id, target_type, old_value, ip_address)
                         VALUES (?, 'attendance_deletion', ?, 'user', ?, ?)`,
                        [
                            req.session.user.id,
                            attendance.user_id,
                            JSON.stringify({
                                date: attendance.date,
                                clock_in: attendance.clock_in,
                                clock_out: attendance.clock_out,
                                break_start: attendance.break_start,
                                break_end: attendance.break_end,
                                status: attendance.status,
                                user_name: attendance.user_name
                            }),
                            req.ip
                        ]
                    );
                }

                // 関連する休憩記録を削除（利用者の場合）
                if (attendance.user_role === 'user') {
                    await dbRun(
                        'DELETE FROM break_records WHERE user_id = ? AND date = ?',
                        [attendance.user_id, attendance.date]
                    );
                }

                // 関連する日報を削除
                await dbRun(
                    'DELETE FROM daily_reports WHERE user_id = ? AND date = ?',
                    [attendance.user_id, attendance.date]
                );

                // 関連するスタッフコメントを削除
                await dbRun(
                    'DELETE FROM staff_comments WHERE user_id = ? AND date = ?',
                    [attendance.user_id, attendance.date]
                );

                // 出勤記録を削除
                await dbRun('DELETE FROM attendance WHERE id = ?', [recordId]);

                // トランザクションコミット
                await dbRun('COMMIT');

                res.json({
                    success: true,
                    message: `${attendance.user_name}さんの${attendance.date}の出勤記録を削除しました`
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

    // 日報編集（admin用）
    router.put('/report/:userId/:date', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { userId, date } = req.params;
            const {
                workContent,
                workLocation,
                pcNumber,
                externalWorkLocation,
                temperature,
                appetite,
                medicationTime,
                bedtime,
                wakeupTime,
                sleepQuality,
                reflection,
                interviewRequest,
                contactTime1,
                contactTime2
            } = req.body;

            // バリデーション
            if (!workContent || workContent.trim() === '') {
                return res.status(400).json({
                    success: false,
                    error: '作業内容は必須です'
                });
            }

            // 既存の日報確認
            const existingReport = await dbGet(
                'SELECT * FROM daily_reports WHERE user_id = ? AND date = ?',
                [userId, date]
            );

            if (!existingReport) {
                return res.status(404).json({
                    success: false,
                    error: '日報が見つかりません'
                });
            }

            // 日報を更新
            await dbRun(`
                UPDATE daily_reports SET
                    work_content = ?,
                    work_location = ?,
                    pc_number = ?,
                    external_work_location = ?,
                    temperature = ?,
                    appetite = ?,
                    medication_time = ?,
                    bedtime = ?,
                    wakeup_time = ?,
                    sleep_quality = ?,
                    reflection = ?,
                    interview_request = ?,
                    contact_time_1 = ?,
                    contact_time_2 = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND date = ?
            `, [
                workContent,
                workLocation,
                pcNumber,
                externalWorkLocation,
                temperature,
                appetite,
                medicationTime,
                bedtime,
                wakeupTime,
                sleepQuality,
                reflection,
                interviewRequest,
                contactTime1 || null,
                contactTime2 || null,
                userId,
                date
            ]);

            // 管理者操作は監査ログに記録しない

            res.json({
                success: true,
                message: '日報を更新しました'
            });

        } catch (error) {
            console.error('日報編集エラー:', error);
            res.status(500).json({
                success: false,
                error: '日報の編集に失敗しました'
            });
        }
    });

    // ===== 稟議承認システム（管理者用） =====

    // 稟議一覧取得（全て）
    router.get('/approval/list', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { status, staffId } = req.query;

            let query = `
                SELECT
                    ar.*,
                    u.name as staff_name,
                    a.name as admin_name
                FROM approval_requests ar
                LEFT JOIN users u ON ar.staff_id = u.id
                LEFT JOIN users a ON ar.admin_id = a.id
                WHERE 1=1
            `;
            const params = [];

            if (status) {
                query += ' AND ar.status = ?';
                params.push(status);
            }

            if (staffId) {
                query += ' AND ar.staff_id = ?';
                params.push(staffId);
            }

            query += ' ORDER BY ar.urgency DESC, ar.created_at DESC';

            const approvals = await dbAll(query, params);

            res.json({
                success: true,
                approvals
            });
        } catch (error) {
            console.error('稟議一覧取得エラー:', error);
            res.status(500).json({
                success: false,
                error: '稟議一覧の取得に失敗しました'
            });
        }
    });

    // 稟議詳細取得
    router.get('/approval/:id', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { id } = req.params;

            const approval = await dbGet(
                `SELECT
                    ar.*,
                    u.name as staff_name,
                    a.name as admin_name
                FROM approval_requests ar
                LEFT JOIN users u ON ar.staff_id = u.id
                LEFT JOIN users a ON ar.admin_id = a.id
                WHERE ar.id = ?`,
                [id]
            );

            if (!approval) {
                return res.status(404).json({
                    success: false,
                    error: '稟議が見つかりません'
                });
            }

            res.json({
                success: true,
                approval
            });
        } catch (error) {
            console.error('稟議詳細取得エラー:', error);
            res.status(500).json({
                success: false,
                error: '稟議詳細の取得に失敗しました'
            });
        }
    });

    // 稟議承認
    router.post('/approval/approve/:id', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { id } = req.params;
            const adminId = req.session.user.id;

            const approval = await dbGet(
                'SELECT * FROM approval_requests WHERE id = ?',
                [id]
            );

            if (!approval) {
                return res.status(404).json({
                    success: false,
                    error: '稟議が見つかりません'
                });
            }

            if (approval.status !== 'pending') {
                return res.status(400).json({
                    success: false,
                    error: '申請中の稟議のみ承認できます'
                });
            }

            await dbRun(
                `UPDATE approval_requests SET
                    status = 'approved',
                    admin_id = ?,
                    reviewed_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [adminId, id]
            );

            // 管理者操作は監査ログに記録しない

            res.json({
                success: true,
                message: '稟議を承認しました'
            });
        } catch (error) {
            console.error('稟議承認エラー:', error);
            res.status(500).json({
                success: false,
                error: '稟議の承認に失敗しました'
            });
        }
    });

    // 稟議却下
    router.post('/approval/reject/:id', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { id } = req.params;
            const { reason } = req.body;
            const adminId = req.session.user.id;

            if (!reason || reason.trim() === '') {
                return res.status(400).json({
                    success: false,
                    error: '却下理由を入力してください'
                });
            }

            const approval = await dbGet(
                'SELECT * FROM approval_requests WHERE id = ?',
                [id]
            );

            if (!approval) {
                return res.status(404).json({
                    success: false,
                    error: '稟議が見つかりません'
                });
            }

            if (approval.status !== 'pending') {
                return res.status(400).json({
                    success: false,
                    error: '申請中の稟議のみ却下できます'
                });
            }

            await dbRun(
                `UPDATE approval_requests SET
                    status = 'rejected',
                    admin_id = ?,
                    rejection_reason = ?,
                    reviewed_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [adminId, reason.trim(), id]
            );

            // 管理者操作は監査ログに記録しない

            res.json({
                success: true,
                message: '稟議を却下しました'
            });
        } catch (error) {
            console.error('稟議却下エラー:', error);
            res.status(500).json({
                success: false,
                error: '稟議の却下に失敗しました'
            });
        }
    });

    // 稟議完了
    router.post('/approval/complete/:id', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { id } = req.params;

            const approval = await dbGet(
                'SELECT * FROM approval_requests WHERE id = ?',
                [id]
            );

            if (!approval) {
                return res.status(404).json({
                    success: false,
                    error: '稟議が見つかりません'
                });
            }

            if (approval.status !== 'approved') {
                return res.status(400).json({
                    success: false,
                    error: '承認済みの稟議のみ完了できます'
                });
            }

            await dbRun(
                `UPDATE approval_requests SET
                    status = 'completed',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [id]
            );

            // 管理者操作は監査ログに記録しない

            res.json({
                success: true,
                message: '稟議を完了しました'
            });
        } catch (error) {
            console.error('稟議完了エラー:', error);
            res.status(500).json({
                success: false,
                error: '稟議の完了処理に失敗しました'
            });
        }
    });

    return router;
};