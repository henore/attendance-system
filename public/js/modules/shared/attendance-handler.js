// modules/shared/attendance-handler.js
// 共通の出退勤処理ハンドラー（最小限の変更版）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { MESSAGES } from '../../constants/labels.js';
import { getCurrentDate, getCurrentTime } from '../../utils/date-time.js';

export class AttendanceHandler {
  constructor(apiCall, showNotification) {
    this.apiCall = apiCall;
    this.showNotification = showNotification;
  }

   /**
   * 出勤処理
   * @param {string} endpoint APIエンドポイント
   * @returns {Promise<Object>}
   */
  async clockIn(endpoint = API_ENDPOINTS.ATTENDANCE.CLOCK_IN) {
    try {
      console.log('[出勤処理] 開始');
      
      const response = await this.apiCall(endpoint, { method: 'POST' });
      
      if (response && (response.success || response.attendance || response.time)) {
        const attendance = response.attendance || {
          clock_in: response.time,
          clock_out: null
        };
        
        const message = response.message || MESSAGES.ATTENDANCE.CLOCK_IN_SUCCESS(response.time || attendance.clock_in);
        this.showNotification(message, 'success');
        
        return {
          success: true,
          attendance,
          isWorking: true
        };
      } else {
        throw new Error('出勤処理のレスポンスが不正です');
      }

    } catch (error) {
      console.error('[出勤処理] エラー:', error);
      this.showNotification(error.message || MESSAGES.ATTENDANCE.CLOCK_IN_ERROR, 'danger');
      throw error;
    }
  }

  /**
   * 退勤処理
   * @param {string} endpoint APIエンドポイント
   * @param {Object} currentAttendance 現在の出勤情報
   * @returns {Promise<Object>}
   */
  async clockOut(endpoint = API_ENDPOINTS.ATTENDANCE.CLOCK_OUT, currentAttendance = null) {
    if (!currentAttendance || !currentAttendance.clock_in) {
      this.showNotification(MESSAGES.ATTENDANCE.NO_CLOCK_IN_RECORD, 'danger');
      return { success: false };
    }

    try {
      console.log('[退勤処理] 開始');
      
      const response = await this.apiCall(endpoint, { method: 'POST' });
      
      if (response && (response.success || response.attendance || response.time)) {
        const attendance = response.attendance || {
          ...currentAttendance,
          clock_out: response.time
        };
        
        const message = response.message || MESSAGES.ATTENDANCE.CLOCK_OUT_SUCCESS(response.time || attendance.clock_out);
        this.showNotification(message, 'success');
        
        return {
          success: true,
          attendance,
          isWorking: false
        };
      } else {
        throw new Error('退勤処理のレスポンスが不正です');
      }
      
    } catch (error) {
      console.error('[退勤処理] エラー:', error);
      this.showNotification(error.message || MESSAGES.ATTENDANCE.CLOCK_OUT_ERROR, 'danger');
      throw error;
    }
  }

   /**
   * 今日の出勤状況を取得（日本時間対応）
   * @param {string} endpoint 
   * @returns {Promise<Object>}
   */
  async getTodayAttendance(endpoint = API_ENDPOINTS.USER.ATTENDANCE_TODAY) {
    try {
      const response = await this.apiCall(endpoint);
      
      return {
        attendance: response.attendance || null,
        report: response.report || null,
        isWorking: response.attendance && response.attendance.clock_in && !response.attendance.clock_out,
        hasReport: response.attendance && response.attendance.has_report
      };
    } catch (error) {
      console.error('今日の出勤状況取得エラー:', error);
      return {
        attendance: null,
        report: null,
        isWorking: false,
        hasReport: false
      };
    }
  }

  /**
   * 出勤状態のUIを更新する共通処理
   * @param {Object} state 状態
   * @param {HTMLElement} statusElement 
   * @param {Object} handlers イベントハンドラー
   */
  updateAttendanceUI(state, statusElement, handlers = {}) {
    if (!statusElement) return;

    const { isWorking, attendance } = state;

    if (isWorking) {
      statusElement.innerHTML = `
        <p class="mb-3 text-success">
          <i class="fas fa-play-circle"></i> 出勤中（${attendance.clock_in}〜）
        </p>
        <button class="btn btn-clock btn-clock-out" id="clockOutBtn">
          <i class="fas fa-clock"></i> 退勤
        </button>
      `;

      if (handlers.onClockOut) {
        const clockOutBtn = document.getElementById('clockOutBtn');
        if (clockOutBtn) {
          clockOutBtn.addEventListener('click', handlers.onClockOut);
        }
      }
    } else if (attendance && attendance.clock_out) {
      statusElement.innerHTML = `
        <p class="mb-3 text-info">
          <i class="fas fa-check-circle"></i> 退勤済み（${attendance.clock_in}〜${attendance.clock_out}）
        </p>
      `;
    } else {
      statusElement.innerHTML = `
        <p class="mb-3">本日はまだ出勤していません</p>
        <button class="btn btn-clock btn-clock-in" id="clockInBtn">
          <i class="fas fa-clock"></i> 出勤
        </button>
      `;

      if (handlers.onClockIn) {
        const clockInBtn = document.getElementById('clockInBtn');
        if (clockInBtn) {
          clockInBtn.addEventListener('click', handlers.onClockIn);
        }
      }
    }
  }

  /**
   * 休憩開始処理
   * @param {string} endpoint 
   * @param {boolean} isWorking 
   * @returns {Promise<Object>}
   */
  async startBreak(endpoint, isWorking) {
    if (!isWorking) {
      this.showNotification('出勤中のみ休憩できます', 'warning');
      return { success: false };
    }

    try {
      const response = await this.apiCall(endpoint, { method: 'POST' });

      if (response && response.success) {
        const message = response.message || MESSAGES.ATTENDANCE.BREAK_START_SUCCESS(response.startTime || getCurrentTime());
        this.showNotification(message, 'info');

        return {
          success: true,
          startTime: response.startTime,
          isCompleted: response.isCompleted || false
        };
      } else {
        throw new Error('休憩開始処理のレスポンスが不正です');
      }
    } catch (error) {
      console.error('[休憩開始処理] エラー:', error);
      this.showNotification(error.message || '休憩開始処理でエラーが発生しました', 'danger');
      return { success: false };
    }
  }

  /**
   * 休憩終了処理
   * @param {string} endpoint 
   * @param {boolean} isOnBreak 
   * @returns {Promise<Object>}
   */
  async endBreak(endpoint, isOnBreak) {
    if (!isOnBreak) {
      this.showNotification('休憩中ではありません', 'warning');
      return { success: false };
    }

    try {
      const response = await this.apiCall(endpoint, { method: 'POST' });

      if (response && response.success) {
        const message = response.message || MESSAGES.ATTENDANCE.BREAK_END_SUCCESS(response.endTime || getCurrentTime());
        this.showNotification(message, 'success');

        return {
          success: true,
          endTime: response.endTime,
          duration: response.duration
        };
      } else {
        // レスポンスが失敗でも処理を続行
        const message = response.error || '休憩を終了しました';
        this.showNotification(message, 'info');
        return { success: true };
      }
    } catch (error) {
      console.error('[休憩終了処理] エラー:', error);
      this.showNotification(error.message || '休憩終了処理でエラーが発生しました', 'danger');
      return { success: false };
    }
  }
}