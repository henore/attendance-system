// routes/monthly-attendance.js
// 月別出勤簿（staff/admin共通）

const express = require('express');

function _hasStaffReportContent(record) {
  if (!record.staff_report_id) return false;
  if (record.sdr_communication && record.sdr_communication.trim()) return true;
  if (record.sdr_work_report) {
    try {
      const parsed = JSON.parse(record.sdr_work_report);
      const entries = (parsed && parsed.entries && Array.isArray(parsed.entries)) ? parsed.entries : [];
      return entries.some(e =>
        (e.work_content && e.work_content.trim()) ||
        (e.support_content && e.support_content.trim()) ||
        (e.user_condition && e.user_condition.trim()) ||
        (e.attendance_info && e.attendance_info.trim())
      );
    } catch { /* 旧形式 */ }
  }
  return false;
}

module.exports = (dbGet, dbAll, dbRun, requireAuth, requireRole) => {
  const router = express.Router();

  router.get('/', requireAuth, requireRole(['staff', 'admin']), async (req, res) => {
    try {
      const { year, month, userId } = req.query;
      const currentUserRole = req.session.user.role;

      if (!year || !month || !userId) {
        return res.status(400).json({
          success: false,
          error: 'パラメータが不足しています'
        });
      }

      // ユーザー情報取得
      const targetUser = await dbGet(
        `SELECT id, username, name, role, service_type, service_no, workweek, transportation, hourly_wage
         FROM users WHERE id = ? AND is_active >= 1`,
        [userId]
      );

      if (!targetUser) {
        return res.status(404).json({
          success: false,
          error: 'ユーザーが見つかりません'
        });
      }

      // staffは利用者のみ閲覧可能
      if (currentUserRole === 'staff' && targetUser.role !== 'user') {
        return res.status(403).json({
          success: false,
          error: '利用者のみ閲覧可能です'
        });
      }

      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

      // 出勤記録取得（休憩データ統合、スタッフ日報追加、中抜け含む）
      const records = await dbAll(`
        SELECT
          a.*,
          a.nakanuke_start, a.nakanuke_minutes, a.nakanuke_reason,
          dr.id as report_id,
          u.service_type,
          sdr.id as staff_report_id,
          sdr.work_report as sdr_work_report,
          sdr.communication as sdr_communication,
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

      // 承認待ちの申請を取得してレコードに付与
      const pendingLogs = await dbAll(
        `SELECT target_id, new_value FROM audit_log
         WHERE approval_status = 'pending'
           AND action_type IN ('staff_attendance_correction', 'staff_attendance_creation')`,
        []
      );

      const pendingByRecordId = new Set(pendingLogs.filter(l => l.target_id).map(l => l.target_id));
      const pendingByUserDate = new Set();
      pendingLogs.forEach(l => {
        try {
          const nv = JSON.parse(l.new_value);
          if (nv.user_id && nv.date) {
            pendingByUserDate.add(`${nv.user_id}_${nv.date}`);
          }
        } catch (e) { /* ignore */ }
      });

      // 利用者の場合：サービス提供記録の有無を日付ごとにチェック
      const serviceEntryDates = new Set();
      if (targetUser.role === 'user') {
        const allStaffReports = await dbAll(
          'SELECT date, work_report FROM staff_daily_reports WHERE date BETWEEN ? AND ?',
          [startDate, endDate]
        );
        for (const sr of allStaffReports) {
          if (!sr.work_report) continue;
          try {
            const parsed = JSON.parse(sr.work_report);
            const entries = (parsed && parsed.entries && Array.isArray(parsed.entries)) ? parsed.entries : [];
            if (entries.some(e => String(e.user_id) === String(userId) && (
              (e.work_content && e.work_content.trim()) ||
              (e.support_content && e.support_content.trim()) ||
              (e.user_condition && e.user_condition.trim()) ||
              (e.attendance_info && e.attendance_info.trim())
            ))) {
              serviceEntryDates.add(sr.date);
            }
          } catch { /* 旧形式は無視 */ }
        }
      }

      records.forEach(r => {
        r.has_pending_correction = pendingByRecordId.has(r.id) || pendingByUserDate.has(`${r.user_id}_${r.date}`);
        if (!_hasStaffReportContent(r)) r.staff_report_id = null;
        r.has_service_entry = serviceEntryDates.has(r.date);
        delete r.sdr_work_report;
        delete r.sdr_communication;
      });

      res.json({
        success: true,
        records,
        user: targetUser,
        serviceEntryDates: Array.from(serviceEntryDates)
      });

    } catch (error) {
      console.error('月別出勤簿取得エラー:', error);
      res.status(500).json({
        success: false,
        error: '月別出勤簿の取得に失敗しました'
      });
    }
  });

  return router;
};
