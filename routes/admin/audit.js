// routes/admin/audit.js
// 管理者API - 監査ログ管理

const express = require('express');
const router = express.Router();
const { getCurrentDate } = require('../../utils/date-time');
const { generateRandomReportData } = require('./attendance');

module.exports = (dbGet, dbAll, dbRun, requireAuth, requireRole) => {
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
            const oldValues = log.old_value ? JSON.parse(log.old_value) : {};
            const normalize = (v) => (v && typeof v === 'string' && v.trim() !== '') ? v.trim() : null;

            // 訂正の場合：スタッフが変更したフィールドのみ更新
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

                // 出勤記録：変更があったフィールドのみ更新
                const attUpdates = [];
                const attParams = [];

                if (normalize(newValues.clock_in) !== normalize(oldValues.clock_in)) {
                    attUpdates.push('clock_in = ?');
                    attParams.push(normalize(newValues.clock_in));
                }
                if (normalize(newValues.clock_out) !== normalize(oldValues.clock_out)) {
                    attUpdates.push('clock_out = ?');
                    attParams.push(normalize(newValues.clock_out));
                }
                if (newValues.status !== oldValues.status) {
                    attUpdates.push('status = ?');
                    attParams.push(newValues.status);
                }

                if (attUpdates.length > 0) {
                    attUpdates.push('updated_at = CURRENT_TIMESTAMP');
                    attParams.push(log.target_id);
                    await dbRun(
                        `UPDATE attendance SET ${attUpdates.join(', ')} WHERE id = ?`,
                        attParams
                    );
                }

                // 休憩記録：変更があった場合のみ処理
                const breakChanged = normalize(newValues.break_start) !== normalize(oldValues.break_start) ||
                                     normalize(newValues.break_end) !== normalize(oldValues.break_end);

                if (breakChanged) {
                    const user = await dbGet('SELECT role FROM users WHERE id = ?', [record.user_id]);
                    const breakStartValue = normalize(newValues.break_start);
                    const breakEndValue = normalize(newValues.break_end);

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
            }
            // 新規作成の場合：出勤記録を挿入
            else if (log.action_type === 'staff_attendance_creation') {
                const targetUserId = newValues.user_id;
                const targetDate = newValues.date;

                const user = await dbGet(
                    'SELECT id, role, service_type, skills FROM users WHERE id = ?',
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
                        const rd = generateRandomReportData(isHome, clockInValue, clockOutValue, user.skills);

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

    return router;
};
