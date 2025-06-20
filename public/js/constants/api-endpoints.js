// public/js/constants/api-endpoints.js
// APIエンドポイント定義（修正版）

export const API_ENDPOINTS = {
    // 認証
    AUTH: {
        LOGIN: '/api/login',
        LOGOUT: '/api/logout',
        SESSION: '/api/session'
    },
    
    // 利用者用
    USER: {
        ATTENDANCE_TODAY: '/api/user/attendance/today',
        REPORT_SUBMIT: '/api/user/report',
        REPORT_BY_DATE: (date) => `/api/user/report/${date}`,
        BREAK_START: '/api/user/break/start',
        BREAK_END: '/api/user/break/end',
        BREAK_STATUS: (date) => `/api/user/break/status/${date}`,
        LAST_RECORD: '/api/user/last-record',
        STAFF_COMMENT_UNREAD: '/api/user/staff-comment/unread',
        STAFF_COMMENT_MARK_READ: '/api/user/staff-comment/mark-read'
    },
    
    // スタッフ用
    STAFF: {
        CLOCK_OUT: '/api/staff/clock-out',
        BREAK_START: '/api/staff/break/start',
        BREAK_END: '/api/staff/break/end',
        USERS: '/api/staff/users',
        USERS_LIST: '/api/staff/users/list',
        REPORT: (userId, date) => `/api/staff/user/${userId}/report/${date}`,
        COMMENT: '/api/staff/comment',
        ATTENDANCE_BY_DATE: (date) => `/api/staff/attendance/${date}`,
        ATTENDANCE_SEARCH: '/api/staff/attendance/search',
        MONTHLY_ATTENDANCE: (year, month, userId) => `/api/staff/attendance/${year}/${month}/${userId}`,
        BREAK_STATUS: (userId, date) => `/api/staff/user/${userId}/break/status/${date}`
    },
    
    // 管理者用
    ADMIN: {
        REGISTER: '/api/admin/register',
        USERS: '/api/admin/users',
        USER_UPDATE: '/api/admin/user/update',
        RETIRE: (userId) => `/api/admin/retire/${userId}`,
        STATUS_TODAY: '/api/admin/status/today',
        ATTENDANCE_SEARCH: '/api/admin/attendance/search',
        ATTENDANCE_CORRECT: '/api/admin/attendance/correct',
        MONTHLY_ATTENDANCE: (year, month, userId) => `/api/admin/attendance/${year}/${month}/${userId}`,
        AUDIT_LOG: '/api/admin/audit-log',
        HANDOVER: '/api/admin/handover',
        BREAK_STATUS: (userId, date) => `/api/admin/user/${userId}/break/status/${date}`
    },
    
    // 共通
    ATTENDANCE: {
        CLOCK_IN: '/api/attendance/clock-in',
        CLOCK_OUT: '/api/attendance/clock-out'
    },
    
    // 申し送り
    HANDOVER: {
        GET: '/api/handover',
        UPDATE: '/api/handover'
    }
};