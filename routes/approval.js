// routes/approval.js
// 稟議管理API - staff.jsとadmin.jsから統合

const express = require('express');
const router = express.Router();
const { getCurrentDate } = require('../utils/date-time');

module.exports = (dbGet, dbAll, dbRun, requireAuth, requireRole) => {

  // 稟議保存（下書き保存・更新）
  router.post('/save', requireAuth, requireRole(['staff', 'admin']), async (req, res) => {
    try {
      const { id, title, content, amount, urgency } = req.body;
      const staffId = req.session.user.id;

      // バリデーション
      if (!title || !content) {
        return res.status(400).json({
          success: false,
          error: 'タイトルと内容は必須です'
        });
      }

      if (urgency && !['normal', 'urgent'].includes(urgency)) {
        return res.status(400).json({
          success: false,
          error: '緊急度が不正です'
        });
      }

      const currentTime = getCurrentDate();

      if (id) {
        // 更新（下書きのみ）
        const existing = await dbGet(
          'SELECT * FROM approval_requests WHERE id = ? AND staff_id = ?',
          [id, staffId]
        );

        if (!existing) {
          return res.status(404).json({
            success: false,
            error: '稟議が見つかりません'
          });
        }

        if (existing.status !== 'draft') {
          return res.status(400).json({
            success: false,
            error: '下書き状態の稟議のみ編集できます'
          });
        }

        await dbRun(
          `UPDATE approval_requests SET
            title = ?, content = ?, amount = ?, urgency = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
          [title, content, amount || null, urgency || 'normal', id]
        );

        res.json({
          success: true,
          message: '稟議を保存しました',
          id: id
        });
      } else {
        // 新規作成
        const result = await dbRun(
          `INSERT INTO approval_requests (title, content, amount, urgency, status, staff_id)
          VALUES (?, ?, ?, ?, 'draft', ?)`,
          [title, content, amount || null, urgency || 'normal', staffId]
        );

        res.json({
          success: true,
          message: '稟議を下書き保存しました',
          id: result.id
        });
      }
    } catch (error) {
      console.error('稟議保存エラー:', error);
      res.status(500).json({
        success: false,
        error: '稟議の保存に失敗しました'
      });
    }
  });

  // 稟議申請
  router.post('/submit/:id', requireAuth, requireRole(['staff', 'admin']), async (req, res) => {
    try {
      const { id } = req.params;
      const staffId = req.session.user.id;

      const approval = await dbGet(
        'SELECT * FROM approval_requests WHERE id = ? AND staff_id = ?',
        [id, staffId]
      );

      if (!approval) {
        return res.status(404).json({
          success: false,
          error: '稟議が見つかりません'
        });
      }

      if (approval.status !== 'draft') {
        return res.status(400).json({
          success: false,
          error: '下書き状態の稟議のみ申請できます'
        });
      }

      await dbRun(
        `UPDATE approval_requests SET
          status = 'pending', submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [id]
      );

      res.json({
        success: true,
        message: '稟議を申請しました'
      });
    } catch (error) {
      console.error('稟議申請エラー:', error);
      res.status(500).json({
        success: false,
        error: '稟議の申請に失敗しました'
      });
    }
  });

  // 稟議一覧取得（staffは自身のもの、adminは全て）
  router.get('/list', requireAuth, requireRole(['staff', 'admin']), async (req, res) => {
    try {
      const staffId = req.session.user.id;
      const userRole = req.session.user.role;
      const { status } = req.query;

      let query = `
        SELECT
          ar.*,
          u.name as staff_name,
          a.name as admin_name
        FROM approval_requests ar
        LEFT JOIN users u ON ar.staff_id = u.id
        LEFT JOIN users a ON ar.admin_id = a.id
      `;
      const params = [];

      // adminは全ての稟議、staffは自分の稟議のみ
      if (userRole !== 'admin') {
        query += ' WHERE ar.staff_id = ?';
        params.push(staffId);
      } else {
        query += ' WHERE 1=1'; // adminは全件取得
      }

      if (status) {
        query += ' AND ar.status = ?';
        params.push(status);
      }

      query += ' ORDER BY ar.created_at DESC';

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
  router.get('/:id', requireAuth, requireRole(['staff', 'admin']), async (req, res) => {
    try {
      const { id } = req.params;
      const staffId = req.session.user.id;
      const userRole = req.session.user.role;

      // adminは全ての稟議、staffは自分の稟議のみ
      let query, params;
      if (userRole === 'admin') {
        query = `SELECT
          ar.*,
          u.name as staff_name,
          a.name as admin_name
        FROM approval_requests ar
        LEFT JOIN users u ON ar.staff_id = u.id
        LEFT JOIN users a ON ar.admin_id = a.id
        WHERE ar.id = ?`;
        params = [id];
      } else {
        query = `SELECT
          ar.*,
          u.name as staff_name,
          a.name as admin_name
        FROM approval_requests ar
        LEFT JOIN users u ON ar.staff_id = u.id
        LEFT JOIN users a ON ar.admin_id = a.id
        WHERE ar.id = ? AND ar.staff_id = ?`;
        params = [id, staffId];
      }

      const approval = await dbGet(query, params);

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

  // 稟議削除（staffは下書きのみ、adminは全て）
  router.delete('/:id', requireAuth, requireRole(['staff', 'admin']), async (req, res) => {
    try {
      const { id } = req.params;
      const staffId = req.session.user.id;
      const userRole = req.session.user.role;

      // adminは全ての稟議、staffは自分の稟議のみ
      let query, params;
      if (userRole === 'admin') {
        query = 'SELECT * FROM approval_requests WHERE id = ?';
        params = [id];
      } else {
        query = 'SELECT * FROM approval_requests WHERE id = ? AND staff_id = ?';
        params = [id, staffId];
      }

      const approval = await dbGet(query, params);

      if (!approval) {
        return res.status(404).json({
          success: false,
          error: '稟議が見つかりません'
        });
      }

      // staffは下書きのみ削除可能、adminは全て削除可能
      if (userRole !== 'admin' && approval.status !== 'draft') {
        return res.status(400).json({
          success: false,
          error: '下書き状態の稟議のみ削除できます'
        });
      }

      await dbRun('DELETE FROM approval_requests WHERE id = ?', [id]);

      res.json({
        success: true,
        message: '稟議を削除しました'
      });
    } catch (error) {
      console.error('稟議削除エラー:', error);
      res.status(500).json({
        success: false,
        error: '稟議の削除に失敗しました'
      });
    }
  });

  // 稟議承認（admin専用）
  router.post('/approve/:id', requireAuth, requireRole(['admin']), async (req, res) => {
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

  // 稟議却下（admin専用）
  router.post('/reject/:id', requireAuth, requireRole(['admin']), async (req, res) => {
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

  // 稟議完了（admin専用）
  router.post('/complete/:id', requireAuth, requireRole(['admin']), async (req, res) => {
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
