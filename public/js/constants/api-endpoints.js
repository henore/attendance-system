// constants/api-endpoints.js
// APIエンドポイント定数（修正版）

export const API_ENDPOINTS = {
  // 認証
  AUTH: {
    LOGIN: '/api/auth/login',
    LOGOUT: '/api/auth/logout',
    CHECK: '/api/auth/check-auth' // 修正
  },
  
  // 出勤管理（共通）
  ATTENDANCE: {
    CLOCK_IN: '/api/attendance/clock-in',
    CLOCK_OUT: '/api/attendance/clock-out'
  },
  
  // 利用者用
  USER: {
    STATUS: '/api/user/status',
    ATTENDANCE_TODAY: '/api/user/attendance/today',
    ATTENDANCE: (date) => `/api/user/attendance/${date}`,
    BREAK_START: '/api/user/break/start',
    BREAK_END: '/api/user/break/end',
    BREAK_STATUS: (date) => `/api/user/break/status/${date}`,
    REPORT_SUBMIT: '/api/user/report/submit',
    REPORT: (date) => `/api/user/report/${date}`,
    REPORTS: '/api/user/reports',
    COMMENT: (date) => `/api/user/comment/${date}`,
    LAST_RECORD: '/api/user/last-record'
  },
  
  // スタッフ用
  STAFF: {
    CLOCK_OUT: '/api/staff/clock-out',
    ATTENDANCE: (date) => `/api/staff/attendance/${date}`,
    ATTENDANCE_SEARCH: '/api/staff/attendance/search',
    BREAK_START: '/api/staff/break/start',
    BREAK_END: '/api/staff/break/end',
    USERS: '/api/staff/users',
    USERS_LIST: '/api/staff/users/list',
    USER_STATUS: (userId) => `/api/staff/users/${userId}/status`,
    REPORT: (userId, date) => `/api/staff/reports/${userId}/${date}`,
    COMMENT: '/api/staff/comment',
    HANDOVER: '/api/handover', // 修正
    ATTENDANCE_BOOK: '/api/staff/attendance-book',
    MONTHLY_ATTENDANCE: '/api/staff/monthly-attendance'
  },
  
  // 管理者用
  ADMIN: {
    STATUS_TODAY: '/api/admin/status/today',
    ATTENDANCE_SEARCH: '/api/admin/attendance/search',
    ATTENDANCE_CORRECT: '/api/admin/attendance/correct',
    USERS: '/api/admin/users',
    USER_CREATE: '/api/admin/users/create',
    USER_UPDATE: (userId) => `/api/admin/users/${userId}`,
    USER_DELETE: (userId) => `/api/admin/users/${userId}`,
    USER_TOGGLE: (userId) => `/api/admin/users/${userId}/toggle`,
    MONTHLY_REPORT: '/api/admin/monthly-report',
    EXPORT_CSV: '/api/admin/export/csv',
    AUDIT_LOG: '/api/admin/audit-log'
  }
};