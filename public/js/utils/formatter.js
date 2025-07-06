// utils/formatter.js
// データフォーマット関連のユーティリティ関数

import { 
  ROLE_LABELS, 
  SERVICE_TYPE_LABELS, 
  APPETITE_LABELS, 
  SLEEP_QUALITY_LABELS, 
  INTERVIEW_REQUEST_LABELS,
  STATUS_LABELS 
} from '../constants/labels.js';

/**
 * 権限名を表示用に変換
 * @param {string} role 
 * @returns {string}
 */
export const formatRoleName = (role) => {
  return ROLE_LABELS[role] || role;
};

/**
 * サービス区分を表示用に変換
 * @param {string} serviceType 
 * @returns {string}
 */
export const formatServiceType = (serviceType) => {
  return SERVICE_TYPE_LABELS[serviceType] || serviceType;
};

/**
 * 食欲状態を表示用に変換
 * @param {string} appetite 
 * @returns {string}
 */
export const formatAppetite = (appetite) => {
  return APPETITE_LABELS[appetite] || appetite;
};

/**
 * 睡眠状態を表示用に変換
 * @param {string} sleepQuality 
 * @returns {string}
 */
export const formatSleepQuality = (sleepQuality) => {
  return SLEEP_QUALITY_LABELS[sleepQuality] || sleepQuality;
};

/**
 * 面談希望を表示用に変換
 * @param {string} interviewRequest 
 * @returns {string}
 */
export const formatInterviewRequest = (interviewRequest) => {
  return INTERVIEW_REQUEST_LABELS[interviewRequest] || interviewRequest;
};

/**
 * 出勤ステータスを表示用に変換
 * @param {string} status 
 * @returns {string}
 */
export const formatAttendanceStatus = (status) => {
  return STATUS_LABELS[status] || status;
};

/**
 * 時刻フォーマット（nullチェック付き）
 * @param {string} timeStr 
 * @returns {string}
 */
export const formatTime = (timeStr) => {
  if (!timeStr) return '-';
  return timeStr.slice(0, 5);
};

/**
 * 権限に応じたバッジクラスを取得
 * @param {string} role 
 * @returns {string}
 */
export const getRoleColorClass = (role) => {
  const colors = {
    'user': 'primary',
    'staff': 'success',
    'admin': 'danger'
  };
  return colors[role] || 'secondary';
};

/**
 * ステータスに応じたバッジHTMLを生成
 * @param {string} status 
 * @returns {string}
 */
export const generateStatusBadge = (status) => {
  const statusConfig = {
    'normal': { class: 'bg-success', text: '正常' },
    'late': { class: 'bg-warning text-dark', text: '遅刻' },
    'early': { class: 'bg-info', text: '早退' },
    'absence': { class: 'bg-danger', text: '欠勤' },
    'paid_leave': { class: 'bg-primary', text: '有給欠勤' }
  };
  
  const config = statusConfig[status] || statusConfig['normal'];
  return `<span class="badge ${config.class}">${config.text}</span>`;
};

/**
 * 勤務時間を時間表示にフォーマット
 * @param {number} hours 
 * @returns {string}
 */
export const formatWorkHours = (hours) => {
  if (!hours || hours <= 0) return '-';
  return `${hours.toFixed(1)}時間`;
};

/**
 * 日付を月/日形式でフォーマット
 * @param {string|Date} date 
 * @returns {string}
 */
export const formatShortDate = (date) => {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/**
 * 頓服服用時間のフォーマット
 * @param {number} medicationTime 
 * @returns {string}
 */
export const formatMedicationTime = (medicationTime) => {
  if (!medicationTime && medicationTime !== 0) return 'なし';
  return `${medicationTime}時頃`;
};

/**
 * 温度表示のフォーマット
 * @param {number} temperature 
 * @returns {string}
 */
export const formatTemperature = (temperature) => {
  if (!temperature) return '-';
  return `${temperature}℃`;
};