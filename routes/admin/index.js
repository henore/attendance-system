// routes/admin/index.js
// 管理者API - メインエントリポイント

const express = require('express');
const router = express.Router();

module.exports = (dbGet, dbAll, dbRun, requireAuth, requireRole) => {
  const usersRouter = require('./users')(dbGet, dbAll, dbRun, requireAuth, requireRole);
  const attendanceRouter = require('./attendance')(dbGet, dbAll, dbRun, requireAuth, requireRole);
  const auditRouter = require('./audit')(dbGet, dbAll, dbRun, requireAuth, requireRole);

  router.use('/', usersRouter);
  router.use('/', attendanceRouter);
  router.use('/', auditRouter);

  return router;
};
