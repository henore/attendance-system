// routes/reports.js
// 日報・サービス提供記録・コメント関連APIの統合ルート

const express = require('express');
const router = express.Router();
const { getCurrentDate } = require('../utils/date-time');

module.exports = (dbGet, dbAll, dbRun, requireAuth, requireRole) => {

  // 日報詳細取得
  router.get('/reports/:userId/:date', requireAuth, requireRole(['staff', 'admin']), async (req, res) => {
    try {
      const { userId, date } = req.params;
      const currentStaffId = req.session.user.id;

      const user = await dbGet(
        `SELECT id, username, name, role, service_type, service_no, workweek, transportation, certificate_expiry
         FROM users WHERE id = ?`,
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

      // スタッフコメントを取得（スタッフ名も含める）
      const comment = await dbGet(`
        SELECT sc.*, u.name as staff_name
        FROM staff_comments sc
        LEFT JOIN users u ON sc.staff_id = u.id
        WHERE sc.user_id = ? AND sc.date = ?
      `, [userId, date]);

      // 休憩記録も取得（利用者の場合）
      const breakRecord = await dbGet(
        'SELECT * FROM break_records WHERE user_id = ? AND date = ?',
        [userId, date]
      );

      // スタッフ/管理者の日報（対象がスタッフ/管理者の場合）
      let staffReport = null;
      if (user && (user.role === 'staff' || user.role === 'admin')) {
        staffReport = await dbGet(
          `SELECT sdr.*, u.name as staff_name, u.role as staff_role
           FROM staff_daily_reports sdr
           LEFT JOIN users u ON sdr.staff_id = u.id
           WHERE sdr.staff_id = ? AND sdr.date = ?`,
          [userId, date]
        );
      }

      // サービス提供記録（対象が利用者の場合）
      let serviceEntry = null;
      let serviceEntryTaken = null;
      let serviceEntryTakenEntry = null;
      let serviceEntryLimitReached = false;
      if (user && user.role === 'user') {
        const MAX_USERS_PER_STAFF = 6;
        const myReport = await dbGet(
          'SELECT work_report FROM staff_daily_reports WHERE staff_id = ? AND date = ?',
          [currentStaffId, date]
        );
        let myEntryCount = 0;
        if (myReport && myReport.work_report) {
          try {
            const parsed = JSON.parse(myReport.work_report);
            const entries = (parsed && parsed.entries && Array.isArray(parsed.entries))
              ? parsed.entries : (Array.isArray(parsed) ? parsed : []);
            serviceEntry = entries.find(e => e.user_id === parseInt(userId)) || null;
            myEntryCount = entries.filter(e =>
              (e.work_content && e.work_content.trim()) ||
              (e.support_content && e.support_content.trim()) ||
              (e.user_condition && e.user_condition.trim()) ||
              (e.attendance_info && e.attendance_info.trim())
            ).length;
          } catch { /* 旧形式 */ }
        }

        const otherReports = await dbAll(
          'SELECT staff_id, work_report FROM staff_daily_reports WHERE date = ? AND staff_id != ?',
          [date, currentStaffId]
        );
        for (const r of otherReports) {
          if (!r.work_report) continue;
          try {
            const parsed = JSON.parse(r.work_report);
            const entries = (parsed && parsed.entries && Array.isArray(parsed.entries))
              ? parsed.entries : (Array.isArray(parsed) ? parsed : []);
            const found = entries.find(e => e.user_id === parseInt(userId) && (
              (e.work_content && e.work_content.trim()) ||
              (e.support_content && e.support_content.trim()) ||
              (e.user_condition && e.user_condition.trim()) ||
              (e.attendance_info && e.attendance_info.trim())
            ));
            if (found) {
              const staffUser = await dbGet('SELECT name FROM users WHERE id = ?', [r.staff_id]);
              serviceEntryTaken = staffUser ? staffUser.name : '他のスタッフ';
              serviceEntryTakenEntry = {
                work_content: found.work_content || '',
                support_content: found.support_content || '',
                user_condition: found.user_condition || '',
                attendance_info: found.attendance_info || ''
              };
              break;
            }
          } catch { /* 旧形式は無視 */ }
        }

        const hasContent = serviceEntry && (
          (serviceEntry.work_content && serviceEntry.work_content.trim()) ||
          (serviceEntry.support_content && serviceEntry.support_content.trim()) ||
          (serviceEntry.user_condition && serviceEntry.user_condition.trim()) ||
          (serviceEntry.attendance_info && serviceEntry.attendance_info.trim())
        );
        serviceEntryLimitReached = !hasContent && myEntryCount >= MAX_USERS_PER_STAFF;
      }

      res.json({
        success: true,
        user,
        attendance,
        report,
        comment,
        breakRecord,
        staffReport,
        serviceEntry,
        serviceEntryTaken,
        serviceEntryTakenEntry,
        serviceEntryLimitReached
      });
    } catch (error) {
      console.error('日報詳細取得エラー:', error);
      res.status(500).json({ success: false, error: '日報詳細の取得に失敗しました' });
    }
  });

  // コメント保存
  router.post('/comment', requireAuth, requireRole(['staff', 'admin']), async (req, res) => {
    try {
      const { userId, date, comment } = req.body;
      const staffId = req.session.user.id;

      if (!comment || !comment.trim()) {
        return res.status(400).json({ success: false, error: 'コメントを入力してください' });
      }

      // 既存のコメントを確認
      const existing = await dbGet(
        'SELECT id FROM staff_comments WHERE user_id = ? AND date = ?',
        [userId, date]
      );

      if (existing) {
        // 更新
        await dbRun(
          'UPDATE staff_comments SET comment = ?, staff_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [comment.trim(), staffId, existing.id]
        );
      } else {
        // 新規作成
        await dbRun(
          'INSERT INTO staff_comments (user_id, staff_id, date, comment) VALUES (?, ?, ?, ?)',
          [userId, staffId, date, comment.trim()]
        );
      }

      res.json({ success: true, message: 'コメントを保存しました' });
    } catch (error) {
      console.error('コメント保存エラー:', error);
      res.status(500).json({ success: false, error: 'コメントの保存に失敗しました' });
    }
  });

  // 出勤中の利用者一覧取得（サービス提供記録用）
  router.get('/daily-report-clocked-in-users', requireAuth, requireRole(['staff', 'admin']), async (req, res) => {
    try {
      const today = getCurrentDate();
      const currentStaffId = req.session.user.id;
      const MAX_USERS_PER_STAFF = 6;

      const allUsers = await dbAll(`
        SELECT u.id, u.name, u.service_type
        FROM users u
        JOIN attendance a ON u.id = a.user_id AND a.date = ?
        WHERE u.role = 'user' AND u.is_active = 1 AND a.clock_in IS NOT NULL
        ORDER BY u.name
      `, [today]);

      // 他スタッフが記入済みのユーザーを除外
      const otherReports = await dbAll(
        'SELECT work_report FROM staff_daily_reports WHERE date = ? AND staff_id != ?',
        [today, currentStaffId]
      );

      const reportedUserIds = new Set();
      for (const report of otherReports) {
        if (!report.work_report) continue;
        try {
          const parsed = JSON.parse(report.work_report);
          const entries = (parsed && parsed.entries && Array.isArray(parsed.entries))
            ? parsed.entries
            : (Array.isArray(parsed) ? parsed : []);
          entries.forEach(e => {
            if (e.user_id && (
              (e.work_content && e.work_content.trim()) ||
              (e.support_content && e.support_content.trim()) ||
              (e.user_condition && e.user_condition.trim()) ||
              (e.attendance_info && e.attendance_info.trim())
            )) {
              reportedUserIds.add(e.user_id);
            }
          });
        } catch { /* 旧形式は無視 */ }
      }

      const availableUsers = (allUsers || [])
        .filter(u => !reportedUserIds.has(u.id))
        .slice(0, MAX_USERS_PER_STAFF);

      res.json({ success: true, users: availableUsers });
    } catch (error) {
      console.error('出勤ユーザー取得エラー:', error);
      res.status(500).json({ success: false, error: '出勤ユーザーの取得に失敗しました' });
    }
  });

  // 支援記録エントリ削除
  router.post('/daily-report-delete-entry', requireAuth, requireRole(['staff', 'admin']), async (req, res) => {
    try {
      const staffId = req.session.user.id;
      const { date } = req.body;
      const user_id = parseInt(req.body.user_id);

      if (!date || !user_id) {
        return res.status(400).json({ success: false, error: '日付とユーザーIDは必須です' });
      }

      const report = await dbGet(
        'SELECT * FROM staff_daily_reports WHERE staff_id = ? AND date = ?',
        [staffId, date]
      );
      if (!report || !report.work_report) {
        return res.status(404).json({ success: false, error: '該当の記録が見つかりません' });
      }

      const parsed = JSON.parse(report.work_report);
      const entries = (parsed && parsed.entries && Array.isArray(parsed.entries))
        ? parsed.entries : (Array.isArray(parsed) ? parsed : []);

      const filtered = entries.filter(e => e.user_id !== user_id);
      const freeText = parsed.free_text || '';

      // エントリもフリーテキストも空なら staff_daily_reports 自体を削除
      const hasRemainingContent = filtered.some(e =>
        (e.work_content && e.work_content.trim()) ||
        (e.support_content && e.support_content.trim()) ||
        (e.user_condition && e.user_condition.trim()) ||
        (e.attendance_info && e.attendance_info.trim())
      );
      if (!hasRemainingContent && !freeText.trim()) {
        await dbRun(
          'DELETE FROM staff_daily_reports WHERE staff_id = ? AND date = ?',
          [staffId, date]
        );
      } else {
        const updated = JSON.stringify({ free_text: freeText, entries: filtered });
        await dbRun(
          'UPDATE staff_daily_reports SET work_report = ?, updated_at = CURRENT_TIMESTAMP WHERE staff_id = ? AND date = ?',
          [updated, staffId, date]
        );
      }

      // 出勤記録が無い利用者の自動生成日報をクリーンアップ
      const attendance = await dbGet(
        'SELECT id, clock_in FROM attendance WHERE user_id = ? AND date = ?',
        [user_id, date]
      );
      if (!attendance || !attendance.clock_in) {
        // 他スタッフにも支援記録が残っていないか確認
        const allReports = await dbAll(
          'SELECT work_report FROM staff_daily_reports WHERE date = ?',
          [date]
        );
        let hasOtherEntry = false;
        for (const r of allReports) {
          if (!r.work_report) continue;
          try {
            const p = JSON.parse(r.work_report);
            const ents = (p && p.entries && Array.isArray(p.entries)) ? p.entries : [];
            if (ents.some(e => e.user_id === user_id && (
              (e.work_content && e.work_content.trim()) ||
              (e.support_content && e.support_content.trim()) ||
              (e.user_condition && e.user_condition.trim()) ||
              (e.attendance_info && e.attendance_info.trim())
            ))) {
              hasOtherEntry = true;
              break;
            }
          } catch { /* 旧形式は無視 */ }
        }
        if (!hasOtherEntry) {
          await dbRun('DELETE FROM daily_reports WHERE user_id = ? AND date = ?', [user_id, date]);
          await dbRun('DELETE FROM staff_comments WHERE user_id = ? AND date = ?', [user_id, date]);
        }
      }

      res.json({ success: true, message: '支援記録を削除しました' });
    } catch (error) {
      console.error('支援記録削除エラー:', error);
      res.status(500).json({ success: false, error: '支援記録の削除に失敗しました' });
    }
  });

  // 支援記録エントリ取得（特定ユーザー・日付）
  router.get('/daily-report-entry/:date/:userId', requireAuth, requireRole(['staff', 'admin']), async (req, res) => {
    try {
      const currentStaffId = req.session.user.id;
      const { date, userId } = req.params;
      const targetUserId = parseInt(userId);
      const MAX_USERS_PER_STAFF = 6;

      // 自分の記録から該当ユーザーのエントリを取得
      const myReport = await dbGet(
        'SELECT work_report FROM staff_daily_reports WHERE staff_id = ? AND date = ?',
        [currentStaffId, date]
      );
      let myEntry = null;
      let myEntryCount = 0;
      if (myReport && myReport.work_report) {
        try {
          const parsed = JSON.parse(myReport.work_report);
          const entries = (parsed && parsed.entries && Array.isArray(parsed.entries))
            ? parsed.entries : (Array.isArray(parsed) ? parsed : []);
          myEntry = entries.find(e => e.user_id === targetUserId) || null;
          myEntryCount = entries.filter(e =>
            (e.work_content && e.work_content.trim()) ||
            (e.support_content && e.support_content.trim()) ||
            (e.user_condition && e.user_condition.trim()) ||
            (e.attendance_info && e.attendance_info.trim())
          ).length;
        } catch { /* 旧形式 */ }
      }

      // 他スタッフが記入済みか確認
      const otherReports = await dbAll(
        'SELECT staff_id, work_report FROM staff_daily_reports WHERE date = ? AND staff_id != ?',
        [date, currentStaffId]
      );
      let takenByStaff = null;
      let takenEntry = null;
      for (const r of otherReports) {
        if (!r.work_report) continue;
        try {
          const parsed = JSON.parse(r.work_report);
          const entries = (parsed && parsed.entries && Array.isArray(parsed.entries))
            ? parsed.entries : (Array.isArray(parsed) ? parsed : []);
          const found = entries.find(e => e.user_id === targetUserId && (
            (e.work_content && e.work_content.trim()) ||
            (e.support_content && e.support_content.trim()) ||
            (e.user_condition && e.user_condition.trim()) ||
            (e.attendance_info && e.attendance_info.trim())
          ));
          if (found) {
            const staffUser = await dbGet('SELECT name FROM users WHERE id = ?', [r.staff_id]);
            takenByStaff = staffUser ? staffUser.name : '他のスタッフ';
            takenEntry = {
              work_content: found.work_content || '',
              support_content: found.support_content || '',
              user_condition: found.user_condition || '',
              attendance_info: found.attendance_info || ''
            };
            break;
          }
        } catch { /* 旧形式は無視 */ }
      }

      const hasContent = myEntry && (
        (myEntry.work_content && myEntry.work_content.trim()) ||
        (myEntry.support_content && myEntry.support_content.trim()) ||
        (myEntry.user_condition && myEntry.user_condition.trim()) ||
        (myEntry.attendance_info && myEntry.attendance_info.trim())
      );
      const limitReached = !hasContent && myEntryCount >= MAX_USERS_PER_STAFF;

      res.json({
        success: true,
        entry: myEntry,
        takenByStaff: takenByStaff,
        takenEntry: takenEntry,
        limitReached: limitReached,
        currentCount: myEntryCount
      });
    } catch (error) {
      console.error('支援記録エントリ取得エラー:', error);
      res.status(500).json({ success: false, error: '支援記録の取得に失敗しました' });
    }
  });

  // 支援記録エントリ保存
  router.post('/daily-report-save-entry', requireAuth, requireRole(['staff', 'admin']), async (req, res) => {
    try {
      const staffId = req.session.user.id;
      const { date, user_name, work_content, support_content, user_condition, attendance_info } = req.body;
      const user_id = parseInt(req.body.user_id);
      const MAX_USERS_PER_STAFF = 6;

      if (!date || !user_id) {
        return res.status(400).json({ success: false, error: '日付とユーザーIDは必須です' });
      }

      // 他スタッフが記入済みか確認
      const otherReports = await dbAll(
        'SELECT work_report FROM staff_daily_reports WHERE date = ? AND staff_id != ?',
        [date, staffId]
      );
      for (const r of otherReports) {
        if (!r.work_report) continue;
        try {
          const parsed = JSON.parse(r.work_report);
          const entries = (parsed && parsed.entries && Array.isArray(parsed.entries))
            ? parsed.entries : (Array.isArray(parsed) ? parsed : []);
          const taken = entries.find(e => e.user_id === user_id && (
            (e.work_content && e.work_content.trim()) ||
            (e.support_content && e.support_content.trim()) ||
            (e.user_condition && e.user_condition.trim()) ||
            (e.attendance_info && e.attendance_info.trim())
          ));
          if (taken) {
            return res.status(409).json({ success: false, error: 'この利用者は他のスタッフが既に記録済みです' });
          }
        } catch { /* 旧形式は無視 */ }
      }

      // 既存のレポートを取得
      let report = await dbGet(
        'SELECT * FROM staff_daily_reports WHERE staff_id = ? AND date = ?',
        [staffId, date]
      );

      let entries = [];
      let freeText = '';
      if (report && report.work_report) {
        try {
          const parsed = JSON.parse(report.work_report);
          entries = (parsed && parsed.entries && Array.isArray(parsed.entries))
            ? parsed.entries : (Array.isArray(parsed) ? parsed : []);
          freeText = (parsed && parsed.free_text) || '';
        } catch { /* 旧形式はリセット */ }
      }

      // 6名制限チェック
      const existingIdx = entries.findIndex(e => e.user_id === user_id);
      if (existingIdx === -1) {
        const filledCount = entries.filter(e =>
          (e.work_content && e.work_content.trim()) ||
          (e.support_content && e.support_content.trim()) ||
          (e.user_condition && e.user_condition.trim()) ||
          (e.attendance_info && e.attendance_info.trim())
        ).length;
        if (filledCount >= MAX_USERS_PER_STAFF) {
          return res.status(400).json({ success: false, error: '1スタッフあたりの記録上限（6名）に達しています' });
        }
      }

      const newEntry = {
        user_id, user_name: user_name || '',
        work_content: work_content || '', support_content: support_content || '',
        user_condition: user_condition || '', attendance_info: attendance_info || ''
      };

      if (existingIdx >= 0) {
        entries[existingIdx] = newEntry;
      } else {
        entries.push(newEntry);
      }

      const updatedJson = JSON.stringify({ free_text: freeText, entries });

      if (report) {
        await dbRun(
          'UPDATE staff_daily_reports SET work_report = ?, updated_at = CURRENT_TIMESTAMP WHERE staff_id = ? AND date = ?',
          [updatedJson, staffId, date]
        );
      } else {
        // 新規作成
        const attendance = await dbGet(
          'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
          [staffId, date]
        );
        const nakanukeMinutes = attendance ? (attendance.nakanuke_minutes || 0) : 0;
        await dbRun(
          'INSERT INTO staff_daily_reports (staff_id, date, work_report, communication, nakanuke_minutes) VALUES (?, ?, ?, ?, ?)',
          [staffId, date, updatedJson, null, nakanukeMinutes]
        );
        if (attendance) {
          await dbRun('UPDATE attendance SET has_report = 1 WHERE user_id = ? AND date = ?', [staffId, date]);
        }
      }

      res.json({ success: true, message: '支援記録を保存しました' });
    } catch (error) {
      console.error('支援記録保存エラー:', error);
      res.status(500).json({ success: false, error: '支援記録の保存に失敗しました' });
    }
  });

  /**
   * スタッフ日報提出
   */
  router.post('/daily-report', requireAuth, requireRole(['staff', 'admin']), async (req, res) => {
    try {
      const staffId = req.session.user.id;
      const { date, work_report, communication } = req.body;

      // 必須項目チェック
      if (!date || !work_report) {
        return res.status(400).json({
          success: false,
          error: '日付とサービス提供記録は必須です'
        });
      }

      // 出勤記録が存在するかチェック
      const attendance = await dbGet(
        'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
        [staffId, date]
      );

      if (!attendance || !attendance.clock_in) {
        return res.status(400).json({
          success: false,
          error: '出勤記録がありません。先に出勤処理を完了してください'
        });
      }

      // 他スタッフが記入済みのユーザーとの重複チェック
      try {
        const submitted = JSON.parse(work_report);
        const submittedEntries = (submitted && submitted.entries && Array.isArray(submitted.entries))
          ? submitted.entries : (Array.isArray(submitted) ? submitted : []);
        const submittedUserIds = submittedEntries
          .filter(e => e.user_id && (
            (e.work_content && e.work_content.trim()) ||
            (e.support_content && e.support_content.trim()) ||
            (e.user_condition && e.user_condition.trim()) ||
            (e.attendance_info && e.attendance_info.trim())
          ))
          .map(e => e.user_id);

        if (submittedUserIds.length > 0) {
          const otherReports = await dbAll(
            'SELECT work_report FROM staff_daily_reports WHERE date = ? AND staff_id != ?',
            [date, staffId]
          );
          const takenUserIds = new Set();
          for (const r of otherReports) {
            if (!r.work_report) continue;
            try {
              const p = JSON.parse(r.work_report);
              const entries = (p && p.entries && Array.isArray(p.entries)) ? p.entries : (Array.isArray(p) ? p : []);
              entries.forEach(e => {
                if (e.user_id && (
                  (e.work_content && e.work_content.trim()) ||
                  (e.support_content && e.support_content.trim()) ||
                  (e.user_condition && e.user_condition.trim()) ||
                  (e.attendance_info && e.attendance_info.trim())
                )) {
                  takenUserIds.add(e.user_id);
                }
              });
            } catch { /* 旧形式は無視 */ }
          }
          const conflicts = submittedEntries.filter(e => takenUserIds.has(e.user_id) && (
            (e.work_content && e.work_content.trim()) ||
            (e.support_content && e.support_content.trim()) ||
            (e.user_condition && e.user_condition.trim()) ||
            (e.attendance_info && e.attendance_info.trim())
          ));
          if (conflicts.length > 0) {
            const names = conflicts.map(e => e.user_name || '不明').join('、');
            return res.status(409).json({
              success: false,
              error: `以下の利用者は他のスタッフが既に記録済みです：${names}`,
              conflictUsers: conflicts.map(e => e.user_id)
            });
          }
        }
      } catch { /* JSON解析失敗時はチェックスキップ */ }

      // 既存の日報があるかチェック
      const existingReport = await dbGet(
        'SELECT * FROM staff_daily_reports WHERE staff_id = ? AND date = ?',
        [staffId, date]
      );

      // 中抜け経過分数を出勤記録から取得
      const nakanukeMinutes = attendance.nakanuke_minutes || 0;

      if (existingReport) {
        // 更新
        await dbRun(
          `UPDATE staff_daily_reports
           SET work_report = ?, communication = ?, nakanuke_minutes = ?, updated_at = CURRENT_TIMESTAMP
           WHERE staff_id = ? AND date = ?`,
          [work_report, communication || null, nakanukeMinutes, staffId, date]
        );
      } else {
        // 新規作成
        await dbRun(
          `INSERT INTO staff_daily_reports (staff_id, date, work_report, communication, nakanuke_minutes)
           VALUES (?, ?, ?, ?, ?)`,
          [staffId, date, work_report, communication || null, nakanukeMinutes]
        );
      }

      // 出勤記録のhas_reportフラグを更新
      await dbRun(
        'UPDATE attendance SET has_report = 1 WHERE user_id = ? AND date = ?',
        [staffId, date]
      );

      res.json({
        success: true,
        message: 'サービス提供記録を提出しました'
      });

    } catch (error) {
      console.error('サービス提供記録提出エラー:', error);
      res.status(500).json({
        success: false,
        error: 'サービス提供記録の提出に失敗しました'
      });
    }
  });

  /**
   * スタッフ日報取得（日付指定）
   */
  router.get('/daily-report/:date', requireAuth, requireRole(['staff', 'admin']), async (req, res) => {
    try {
      const { date } = req.params;
      const requestUserId = req.session.user.id;
      const requestUserRole = req.session.user.role;

      // staffIdパラメータがある場合はそれを使用（admin用）
      const staffId = req.query.staffId ? parseInt(req.query.staffId) : requestUserId;

      // staff権限の場合は自分の日報のみ取得可能
      if (requestUserRole === 'staff' && staffId !== requestUserId) {
        return res.status(403).json({
          success: false,
          error: '他のスタッフの日報は閲覧できません'
        });
      }

      // 日報取得
      const report = await dbGet(
        `SELECT
          sdr.*,
          u.name as staff_name,
          u.role as staff_role
         FROM staff_daily_reports sdr
         LEFT JOIN users u ON sdr.staff_id = u.id
         WHERE sdr.staff_id = ? AND sdr.date = ?`,
        [staffId, date]
      );

      // 出勤記録も取得
      const attendance = await dbGet(
        'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
        [staffId, date]
      );

      res.json({
        success: true,
        report: report || null,
        attendance: attendance || null
      });

    } catch (error) {
      console.error('スタッフ日報取得エラー:', error);
      res.status(500).json({
        success: false,
        error: '日報の取得に失敗しました'
      });
    }
  });

  /**
   * 今日のスタッフ日報取得
   */
  router.get('/daily-report-today', requireAuth, requireRole(['staff', 'admin']), async (req, res) => {
    try {
      const staffId = req.session.user.id;
      const today = getCurrentDate();

      const report = await dbGet(
        `SELECT * FROM staff_daily_reports WHERE staff_id = ? AND date = ?`,
        [staffId, today]
      );

      const attendance = await dbGet(
        'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
        [staffId, today]
      );

      res.json({
        success: true,
        report: report || null,
        attendance: attendance || null,
        hasReport: !!report
      });

    } catch (error) {
      console.error('今日のスタッフ日報取得エラー:', error);
      res.status(500).json({
        success: false,
        error: '日報の取得に失敗しました'
      });
    }
  });

  // 管理者による日報編集
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

  return router;
};
