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
    TODAY: '/api/attendance/today',
    CLOCK_IN: '/api/attendance/clock-in',
    CLOCK_OUT: '/api/attendance/clock-out',
    BY_DATE: (date) => `/api/attendance/${date}`
  },
  
    // 申し送り（追加）
  HANDOVER: {
    GET: '/api/handover',
    UPDATE: '/api/handover'
  },

  // LINE連携
  LINE: {
    GENERATE_IMAGE: '/api/line/generate-report-image',
  },
  
  // 利用者用
  USER: {
    STATUS: '/api/user/status',
    ATTENDANCE: (date) => `/api/user/attendance/${date}`,
    REPORT_SUBMIT: '/api/user/report', // 修正：/submitを削除
    REPORTS: '/api/user/reports',
    COMMENT: (date) => `/api/user/comment/${date}`,
    ATTENDANCE_TODAY: '/api/user/attendance/today',
    REPORT: '/api/user/report',
    REPORT_BY_DATE: (date) => `/api/user/report/${date}`,
    BREAK_START: '/api/user/break/start',
    BREAK_END: '/api/user/break/end',
    BREAK_STATUS: (date) => `/api/user/break/status/${date}`,
    STAFF_COMMENT_UNREAD: '/api/user/staff-comment/unread',
    STAFF_COMMENT_MARK_READ: '/api/user/staff-comment/mark-read',
    LAST_RECORD: '/api/user/last-record',
    CERTIFICATE_EXPIRY: '/api/user/certificate-expiry'
  },
  
  // スタッフ用
  STAFF: {
    CLOCK_OUT: '/api/staff/clock-out',
    BREAK_START: '/api/staff/break/start',
    BREAK_END: '/api/staff/break/end',
    NAKANUKE_START: '/api/staff/nakanuke/start',
    NAKANUKE_END: '/api/staff/nakanuke/end',
    USERS: '/api/staff/users',
    USERS_LIST: '/api/staff/users/list',
    ATTENDANCE_BOOK: '/api/staff/attendance-book',
    ATTENDANCE_SEARCH: '/api/staff/attendance/search',
    ATTENDANCE: (date) => `/api/staff/attendance/${date}`,
    USER_STATUS: (userId) => `/api/staff/users/${userId}/status`,
    ATTENDANCE_CORRECT: '/api/staff/attendance/correct',
    ATTENDANCE_DELETE_REQUEST: '/api/staff/attendance/delete-request',
    // 体験入所管理
    TRIAL_VISITS_TODAY: '/api/trial-visits/today',
    TRIAL_VISITS_BY_DATE: (date) => `/api/trial-visits/by-date/${date}`,
    TRIAL_VISITS_CREATE: '/api/trial-visits/create',
    TRIAL_VISITS_UPDATE: (id) => `/api/trial-visits/${id}`,
    TRIAL_VISITS_DELETE: (id) => `/api/trial-visits/${id}`,
    TRIAL_VISITS_MONTHLY: (year, month) => `/api/trial-visits/monthly/${year}/${month}`,
    TRIAL_VISITS_NOTIFICATION_CHECK: '/api/trial-visits/notification-check'
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
    RETIRE_USER: (userId) => `/api/admin/retire/${userId}`,
    TOGGLE_RETIRE: (userId) => `/api/admin/users/${userId}/toggle-retire`,
    MONTHLY_REPORT: '/api/admin/monthly-report',
    EXPORT_CSV: '/api/admin/export/csv',
    AUDIT_LOG: '/api/admin/audit-log',
    AUDIT_APPROVE: (id) => `/api/admin/audit-log/${id}/approve`,
    AUDIT_REJECT: (id) => `/api/admin/audit-log/${id}/reject`,
    REGISTER: '/api/admin/register', // 追加
    ATTENDANCE_DELETE: (recordId) => `/api/admin/attendance/${recordId}`,//出勤記録削除用
    BREAK_STATUS: (userId, date) => 
        `/api/admin/user/${userId}/break/status/${date}`, // 追加
    // 体験入所管理
    TRIAL_VISITS_TODAY: '/api/trial-visits/today',
    TRIAL_VISITS_BY_DATE: (date) => `/api/trial-visits/by-date/${date}`,
    TRIAL_VISITS_CREATE: '/api/trial-visits/create',
    TRIAL_VISITS_UPDATE: (id) => `/api/trial-visits/${id}`,
    TRIAL_VISITS_DELETE: (id) => `/api/trial-visits/${id}`,
    TRIAL_VISITS_MONTHLY: (year, month) => `/api/trial-visits/monthly/${year}/${month}`,
    TRIAL_VISITS_NOTIFICATION_CHECK: '/api/trial-visits/notification-check',
    ATTENDANCE_STATS: '/api/admin/attendance-stats'
  },

  // 月別出勤簿（共通）
  MONTHLY_ATTENDANCE: {
    GET: (year, month, userId) =>
        `/api/monthly-attendance?year=${year}&month=${month}&userId=${userId}`,
  },

  // 日報・サービス提供記録（共通）
  REPORTS: {
    REPORT: (userId, date) => `/api/reports/reports/${userId}/${date}`,
    REPORT_UPDATE: (userId, date) => `/api/reports/report/${userId}/${date}`,
    COMMENT: '/api/reports/comment',
    DAILY_REPORT_SUBMIT: '/api/reports/daily-report',
    DAILY_REPORT_TODAY: '/api/reports/daily-report-today',
    DAILY_REPORT: (date) => `/api/reports/daily-report/${date}`,
    DAILY_REPORT_CLOCKED_IN_USERS: '/api/reports/daily-report-clocked-in-users',
    DAILY_REPORT_DELETE_ENTRY: '/api/reports/daily-report-delete-entry',
    DAILY_REPORT_ENTRY: (date, userId) => `/api/reports/daily-report-entry/${date}/${userId}`,
    DAILY_REPORT_SAVE_ENTRY: '/api/reports/daily-report-save-entry',
  },

  // 稟議（共通）
  APPROVAL: {
    SAVE: '/api/approval/save',
    SUBMIT: (id) => `/api/approval/submit/${id}`,
    LIST: '/api/approval/list',
    GET: (id) => `/api/approval/${id}`,
    DELETE: (id) => `/api/approval/${id}`,
    APPROVE: (id) => `/api/approval/approve/${id}`,
    REJECT: (id) => `/api/approval/reject/${id}`,
    COMPLETE: (id) => `/api/approval/complete/${id}`,
  },

  // Excel出力
  EXCEL: {
    MONTHLY_ATTENDANCE: (year, month, userId) =>
        `/api/excel/monthly-attendance/${year}/${month}/${userId}`,
    MONTHLY_ATTENDANCE_YEARLY: (year, userId) =>
        `/api/excel/monthly-attendance-yearly/${year}/${userId}`,
    DAILY_REPORTS: (year, month, userId) =>
        `/api/excel/daily-reports/${year}/${month}/${userId}`
  }
};