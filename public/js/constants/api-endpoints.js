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
  
    // 申し送り（追加）
  HANDOVER: {
    GET: '/api/handover',
    UPDATE: '/api/handover'
  },
  
  // 利用者用
  USER: {
    STATUS: '/api/user/status',
    ATTENDANCE_TODAY: '/api/user/attendance/today',
    ATTENDANCE: (date) => `/api/user/attendance/${date}`,
    BREAK_START: '/api/user/break/start',
    BREAK_END: '/api/user/break/end',
    BREAK_STATUS: (date) => `/api/user/break/status/${date}`,
    REPORT_SUBMIT: '/api/user/report', // 修正：/submitを削除
    REPORT: (date) => `/api/user/report/${date}`,
    REPORT_BY_DATE: (date) => `/api/user/report/${date}`, // 追加
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
    ATTENDANCE_BOOK: '/api/staff/attendance-book',
    MONTHLY_ATTENDANCE: (year, month, userId) => 
        `/api/staff/monthly-attendance?year=${year}&month=${month}&userId=${userId}`
  },
  
  // 管理者用
  ADMIN: {
    STATUS_TODAY: '/api/admin/status/today',
    ATTENDANCE_SEARCH: '/api/admin/attendance/search',
    ATTENDANCE_CORRECT: '/api/admin/attendance/correct',
    ATTENDANCE_MONTHLY: (year, month, userId) => 
        `/api/admin/attendance/${year}/${month}/${userId}`, // 追加
    USERS: '/api/admin/users',
    USER_CREATE: '/api/admin/users/create',
    USER_UPDATE: (userId) => `/api/admin/users/${userId}`,
    USER_DELETE: (userId) => `/api/admin/users/${userId}`,
    USER_TOGGLE: (userId) => `/api/admin/users/${userId}/toggle`,
    USER_RETIRE: (userId) => `/api/admin/retire/${userId}`, // 追加
    MONTHLY_REPORT: '/api/admin/monthly-report',
    EXPORT_CSV: '/api/admin/export/csv',
    AUDIT_LOG: '/api/admin/audit-log',
    REGISTER: '/api/admin/register', // 追加
    BREAK_STATUS: (userId, date) => 
        `/api/admin/user/${userId}/break/status/${date}` // 追加
  }
};