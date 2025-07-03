// routes/staff.js
// スタッフAPI - 役割整理・JST統一版

const express = require('express');
const router = express.Router();
const { getCurrentDate, getCurrentTime, timeToMinutes, minutesToTime } = require('../utils/date-time');

module.exports = (dbGet, dbAll, dbRun, requireAuth, requireRole) => {
  
  // スタッフの退勤処理（未コメント日報チェック付き）
  router.post('/clock-out', async (req, res) => {
    try {
      const staffId = req.session.user.id;
      const today = getCurrentDate();
      const currentTime = getCurrentTime();
      
      // 未コメントの日報をチェック
      const uncommentedReports = await dbAll(`
        SELECT DISTINCT u.id as user_id, u.name as user_name
        FROM users u
        JOIN daily_reports dr ON u.id = dr.user_id
        LEFT JOIN staff_comments sc ON dr.user_id = sc.user_id AND dr.date = sc.date
        WHERE u.role = 'user'
          AND dr.date = ?
          AND sc.id IS NULL
      `, [today]);
      
      if (uncommentedReports.length > 0) {
        return res.status(400).json({
          success: false,
          error: '未コメントの日報があります',
          uncommentedReports: uncommentedReports
        });
      }
      
      // 退勤処理
      await dbRun(
        'UPDATE attendance SET clock_out = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND date = ?',
        [currentTime, staffId, today]
      );
      
      res.json({
        success: true,
        message: '退勤しました',
        time: currentTime
      });
      
    } catch (error) {
      console.error('退勤処理エラー:', error);
      res.status(500).json({ success: false, error: '退勤処理に失敗しました' });
    }
  });

  router.get('/attendance/search', requireAuth, requireRole(['staff', 'admin']), async (req, res) => {
  try {
    const { date, role, userId } = req.query;
    
    if (!date) {
      return res.status(400).json({ 
        success: false, 
        error: '日付が指定されていません' 
      });
    }
    
    let query = `
      SELECT 
        a.id, a.user_id, a.date, a.clock_in, a.clock_out, a.status,
        a.break_start, a.break_end,
        u.name as user_name, u.role as user_role, u.service_type,u.workweek as user_workweek,u.id as user_id,
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
    
    const rawRecords = await dbAll(query, params);
    
    // データ処理
    const processedRecords = rawRecords.map(record => {
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
        comment_id: record.comment_id
      };
      
      // 休憩データの統合
      if (record.user_role === 'staff' || record.user_role === 'admin') {
        processed.break_start = record.break_start;
        processed.break_end = record.break_end;
      } else if (record.user_role === 'user' && record.br_start) {
        processed.br_start = record.br_start;
        processed.br_end = record.br_end;
        processed.br_duration = record.br_duration;
        processed.break_start_time = record.br_start;
        processed.break_end_time = record.br_end;
        processed.break_duration = record.br_duration;
      }
      
      return processed;
    });
    
    res.json({ 
      success: true, 
      records: processedRecords 
    });
    
  } catch (error) {
    console.error('出勤記録検索エラー:', error);
    res.status(500).json({ 
      success: false, 
      error: '出勤記録の検索に失敗しました: ' + error.message 
    });
  }
});

  router.get('/users', requireAuth, requireRole(['staff', 'admin']), async (req, res) => {
  try {
    const { role } = req.query;
    
    console.log('[STAFF API] ユーザー取得パラメータ:', { role });
    
    let query = `
      SELECT 
        u.id, 
        u.name, 
        u.role, 
        u.service_type,
        u.created_at
      FROM users u
      WHERE u.is_active = 1
    `;
    const params = [];
    
    // roleフィルター
    if (role) {
      query += ' AND u.role = ?';
      params.push(role);
    }
    
    query += ' ORDER BY u.role, u.name';
    
    const users = await dbAll(query, params);
    
    console.log('[STAFF API] ユーザー取得結果:', users.length, '件');
    
    res.json({ 
      success: true, 
      users 
    });
  } catch (error) {
    console.error('[STAFF API] ユーザー一覧取得エラー:', error);
    res.status(500).json({ 
      success: false, 
      error: 'ユーザー一覧の取得に失敗しました: ' + error.message 
    });
  }
});

// 既存の利用者一覧取得（シンプル版）は /users/list として維持
router.get('/users/list', async (req, res) => {
  try {
    const users = await dbAll(`
      SELECT 
        u.id, 
        u.name, 
        u.role, 
        u.service_type
      FROM users u
      WHERE u.role = 'user' 
        AND u.is_active = 1
      ORDER BY u.name
    `);
    
    res.json({ 
      success: true, 
      users 
    });
  } catch (error) {
    console.error('利用者一覧取得エラー:', error);
    res.status(500).json({ 
      success: false, 
      error: '利用者一覧の取得に失敗しました' 
    });
  }
});


  // 日報詳細取得
  router.get('/reports/:userId/:date', async (req, res) => {
    try {
      const { userId, date } = req.params;
      
      const user = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
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
      
      res.json({
        success: true,
        user,
        attendance,
        report,
        comment,
        breakRecord
      });
    } catch (error) {
      console.error('日報詳細取得エラー:', error);
      res.status(500).json({ success: false, error: '日報詳細の取得に失敗しました' });
    }
  });

  // コメント保存
  router.post('/comment', async (req, res) => {
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

  // 休憩開始（スタッフ専用）
  router.post('/break/start', async (req, res) => {
    try {
      const userId = req.session.user.id;
      const today = getCurrentDate();
      const currentTime = getCurrentTime();
      
      // 既存の出勤記録を確認
      const attendance = await dbGet(
        'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
        [userId, today]
      );
      
      if (!attendance || !attendance.clock_in) {
        return res.status(400).json({ 
          success: false, 
          error: '出勤していません' 
        });
      }
      
      if (attendance.break_start) {
        return res.status(400).json({ 
          success: false, 
          error: '既に休憩を取得しています' 
        });
      }
      
      // 休憩開始時間を記録
      await dbRun(
        'UPDATE attendance SET break_start = ? WHERE id = ?',
        [currentTime, attendance.id]
      );
      
      res.json({
        success: true,
        message: '休憩を開始しました',
        startTime: currentTime
      });
    } catch (error) {
      console.error('休憩開始エラー:', error);
      res.status(500).json({ 
        success: false, 
        error: '休憩開始に失敗しました' 
      });
    }
  });

  // 休憩終了（スタッフ専用） - 常に60分後の時刻を記録
router.post('/break/end', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const today = getCurrentDate();
    const { autoEnd } = req.body;
    
    // 既存の出勤記録を確認
    const attendance = await dbGet(
      'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
      [userId, today]
    );
    
    if (!attendance || !attendance.break_start) {
      return res.status(400).json({ 
        success: false, 
        error: '休憩を開始していません' 
      });
    }
    
    if (attendance.break_end) {
      return res.status(400).json({ 
        success: false, 
        error: '既に休憩を終了しています' 
      });
    }
    
    // 常に開始時刻+60分で終了時刻を設定
    const startMinutes = timeToMinutes(attendance.break_start);
    const endMinutes = startMinutes + 60;
    const finalEndTime = minutesToTime(endMinutes);
    
    // 休憩終了時間を記録
    await dbRun(
      'UPDATE attendance SET break_end = ? WHERE id = ?',
      [finalEndTime, attendance.id]
    );
    
    res.json({
      success: true,
      message: autoEnd ? '休憩を自動終了しました（60分）' : '休憩を終了しました',
      endTime: finalEndTime,
      breakStart: attendance.break_start, // フロントエンドで表示用
      duration: 60 // 固定60分
    });
  } catch (error) {
    console.error('休憩終了エラー:', error);
    res.status(500).json({ 
      success: false, 
      error: '休憩終了に失敗しました' 
    });
  }
});

  // 月別出勤簿データ取得（スタッフ権限用）
  router.get('/monthly-attendance', async (req, res) => {
    try {
      const { year, month, userId } = req.query;
      
      if (!year || !month || !userId) {
        return res.status(400).json({ 
          success: false, 
          error: 'パラメータが不足しています' 
        });
      }
      
      // 指定されたユーザーが利用者かチェック
      const targetUser = await dbGet(
        'SELECT id, name, role, service_type ,service_no FROM users WHERE id = ? AND is_active = 1',
        [userId]
      );
      
      if (!targetUser || targetUser.role !== 'user') {
        return res.status(403).json({ 
          success: false, 
          error: '利用者のみ閲覧可能です' 
        });
      }
      
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      
      // 月次データを取得
      const records = await dbAll(`
        SELECT 
          a.*, 
          dr.id as report_id,
          sc.comment as staff_comment,
          sc.id as comment_id,
          sc.staff_id,
          u.name as staff_name,
          br.start_time as break_start_time,
          br.end_time as break_end_time,
          br.duration as break_duration
        FROM attendance a
        LEFT JOIN daily_reports dr ON a.user_id = dr.user_id AND a.date = dr.date
        LEFT JOIN staff_comments sc ON a.user_id = sc.user_id AND a.date = sc.date
        LEFT JOIN users u ON sc.staff_id = u.id
        LEFT JOIN break_records br ON a.user_id = br.user_id AND a.date = br.date
        WHERE a.user_id = ? 
          AND a.date >= ? 
          AND a.date <= ?
        ORDER BY a.date
      `, [userId, startDate, endDate]);
      
      // 休憩情報の統合（利用者用）
      const processedRecords = records.map(record => {
        // 利用者の休憩情報（break_records）
        if (record.break_start_time) {
          record.break_start = record.break_start_time;
          record.break_end = record.break_end_time;
          record.break_duration = record.break_duration;
        }
        return record;
      });
      
      res.json({ 
        success: true, 
        records: processedRecords,
        user: targetUser 
      });
    } catch (error) {
      console.error('月別出勤簿取得エラー:', error);
      res.status(500).json({ 
        success: false, 
        error: '月別出勤簿の取得に失敗しました' 
      });
    }
  });

  // スタッフ自身の出勤記録取得
  router.get('/attendance/:date', async (req, res) => {
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
      res.status(500).json({ success: false, error: '出勤記録の取得に失敗しました' });
    }
  });

  return router;
};