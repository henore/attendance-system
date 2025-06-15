// /public/js/constants/api-endpoints.js
// APIエンドポイント定義

export const API_ENDPOINTS = {
    // 認証関連
    AUTH: {
        LOGIN: '/api/login',
        LOGOUT: '/api/logout',
        CHECK: '/api/auth-check'
    },
    
    // 出退勤共通
    ATTENDANCE: {
        CLOCK_IN: '/api/attendance/clock-in',
        CLOCK_OUT: '/api/attendance/clock-out'
    },
    
    // 利用者API
    USER: {
        ATTENDANCE_TODAY: '/api/user/attendance/today',
        REPORT: '/api/user/report',
        REPORT_BY_DATE: (date) => `/api/user/report/${date}`,
        BREAK_START: '/api/user/break/start',
        BREAK_END: '/api/user/break/end',
        BREAK_STATUS: (date) => `/api/user/break/status/${date}`,
        STAFF_COMMENT_UNREAD: '/api/user/staff-comment/unread',
        STAFF_COMMENT_MARK_READ: '/api/user/staff-comment/mark-read'
    },
    
    // スタッフAPI
    STAFF: {
        CLOCK_OUT: '/api/staff/clock-out',
        BREAK_START: '/api/staff/break/start',
        BREAK_END: '/api/staff/break/end',
        USERS: '/api/staff/users',
        USERS_LIST: '/api/staff/users/list',
        REPORT: (userId, date) => `/api/staff/user/${userId}/report/${date}`,
        COMMENT: '/api/staff/comment',
        HANDOVER: '/api/handover',
        ATTENDANCE: (date) => `/api/staff/attendance/${date}`,
        MONTHLY_ATTENDANCE: (year, month, userId) => `/api/staff/attendance/${year}/${month}/${userId}`
    },
    
    // 管理者API
    ADMIN: {
        REGISTER: '/api/admin/register',
        USERS: '/api/admin/users',
        RETIRE_USER: (userId) => `/api/admin/retire/${userId}`,
        STATUS_TODAY: '/api/admin/status/today',
        ATTENDANCE_SEARCH: '/api/admin/attendance/search',
        ATTENDANCE_CORRECT: '/api/admin/attendance/correct',
        ATTENDANCE_MONTHLY: (year, month, userId) => `/api/admin/attendance/${year}/${month}/${userId}`,
        AUDIT_LOG: '/api/admin/audit-log'
    }
};