// routes/attendance.js
// 共通の出勤管理ルート - JST統一版

const express = require('express');
const router = express.Router();
const { getCurrentDate, getCurrentTime, timeToMinutes, minutesToTime } = require('../utils/date-time');

module.exports = (dbGet, dbAll, dbRun, requireAuth) => {
  
  // 今日の出勤状況取得
  router.get('/today', async (req, res) => {
    try {
      const userId = req.session.user.id;
      const today = getCurrentDate();
      
      const attendance = await dbGet(
        'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
        [userId, today]
      );
      
      res.json({ 
        success: true, 
        attendance: attendance || null 
      });
    } catch (error) {
      console.error('出勤状況取得エラー:', error);
      res.status(500).json({ 
        success: false, 
        error: '出勤状況の取得に失敗しました' 
      });
    }
  });
  
  // 出勤処理（全ロール共通）
  router.post('/clock-in', async (req, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const today = getCurrentDate();
      const currentTime = req.body.time || getCurrentTime(); // フロントエンドから時刻を受け取る
      
      // 既存の出勤記録確認
      const existing = await dbGet(
        'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
        [userId, today]
      );
      
      if (existing) {
        return res.status(400).json({ 
          success: false, 
          error: '既に出勤しています' 
        });
      }
      
      // 出勤記録作成
      const result = await dbRun(
        'INSERT INTO attendance (user_id, date, clock_in) VALUES (?, ?, ?)',
        [userId, today, currentTime]
      );
      
      const attendance = await dbGet(
        'SELECT * FROM attendance WHERE id = ?',
        [result.id]
      );
      
      res.json({
        success: true,
        message: '出勤しました',
        attendance: attendance,
        time: currentTime
      });
      
    } catch (error) {
      console.error('出勤処理エラー:', error);
      res.status(500).json({ 
        success: false, 
        error: '出勤処理に失敗しました' 
      });
    }
  });
  
  // 退勤処理（利用者用 - スタッフは別ルート）
  router.post('/clock-out', async (req, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userServiceType = req.session.user.service_type;
      
      // スタッフは専用の退勤処理を使用
      if (userRole === 'staff' || userRole === 'admin') {
        return res.status(400).json({ 
          success: false, 
          error: 'スタッフは /api/staff/clock-out を使用してください' 
        });
      }
      
      const today = getCurrentDate();
      const currentTime = req.body.time || getCurrentTime(); // フロントエンドから時刻を受け取る
      
      // 既存の出勤記録確認
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
      
      if (attendance.clock_out) {
        return res.status(400).json({ 
          success: false, 
          error: '既に退勤しています' 
        });
      }
      
      // 休憩中チェック（在宅者のみ）
      if (userServiceType === 'home') {
        const breakRecord = await dbGet(
          'SELECT * FROM break_records WHERE user_id = ? AND date = ? AND end_time IS NULL',
          [userId, today]
        );
        
        if (breakRecord) {
          // 休憩中の場合は自動的に休憩を終了
          const breakEndTime = currentTime;
          const startMinutes = timeToMinutes(breakRecord.start_time);
          const endMinutes = timeToMinutes(breakEndTime);
          let duration = endMinutes - startMinutes;
          
          // 日をまたぐ場合の処理
          if (duration < 0) {
            duration += 24 * 60;
          }
          
          // 最大60分
          const finalDuration = Math.min(duration, 60);
          
          await dbRun(
            'UPDATE break_records SET end_time = ?, duration = ? WHERE id = ?',
            [breakEndTime, finalDuration, breakRecord.id]
          );
          
          console.log(`休憩を自動終了しました: ${breakRecord.start_time} - ${breakEndTime} (${finalDuration}分)`);
        }
      }
      
      // 退勤時間更新
      await dbRun(
        'UPDATE attendance SET clock_out = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [currentTime, attendance.id]
      );
      
      // 更新された出勤記録を取得
      const updatedAttendance = await dbGet(
        'SELECT * FROM attendance WHERE id = ?',
        [attendance.id]
      );
      
      res.json({
        success: true,
        message: '退勤しました',
        attendance: updatedAttendance,
        time: currentTime
      });
      
    } catch (error) {
      console.error('退勤処理エラー:', error);
      res.status(500).json({ 
        success: false, 
        error: '退勤処理に失敗しました' 
      });
    }
  });
  
  // 特定日の出勤記録取得
  router.get('/:date', async (req, res) => {
    try {
      const userId = req.session.user.id;
      const { date } = req.params;
      
      const attendance = await dbGet(
        'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
        [userId, date]
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
  
  return router;
};