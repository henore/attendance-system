// modules/shared/attendance-handler.js
// 共通の出退勤処理ハンドラー

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { MESSAGES } from '../../constants/labels.js';
import { getCurrentDate, getCurrentTime } from '../../utils/date-time.js';

export class AttendanceHandler {
  constructor(apiCall, showNotification) {
    this.apiCall = apiCall;
    this.showNotification = showNotification;
  }
   /**
   * 出勤処理の共通実装
   * @param {string} endpoint 
   * @returns {Promise}
   */
  async clockIn(endpoint) {
    try {
      const response = await this.apiCall(endpoint, {
        method: 'POST'
      });

      if (response.success) {
        this.showNotification('出勤しました', 'success');
        return {
          success: true,
          attendance: response.attendance
        };
      }

      throw new Error(response.error || '出勤処理に失敗しました');
    } catch (error) {
      this.showNotification(error.message, 'danger');
      return { success: false, error: error.message };
    }
  }

    /**
   * 退勤処理の共通実装
   * @param {string} endpoint 
   * @param {Object} currentAttendance 
   * @returns {Promise}
   */
  async clockOut(endpoint, currentAttendance) {
    try {
      if (!currentAttendance || !currentAttendance.clock_in) {
        throw new Error('出勤していません');
      }

      const response = await this.apiCall(endpoint, {
        method: 'POST'
      });

      if (response.success) {
        this.showNotification('退勤しました', 'success');
        return {
          success: true,
          attendance: response.attendance
        };
      }

      throw new Error(response.error || '退勤処理に失敗しました');
    } catch (error) {
      this.showNotification(error.message, 'danger');
      return { success: false, error: error.message };
    }
  }


  /**
   * 出勤状態の確認
   * @param {Object} attendance 
   * @returns {boolean}
   */
  isWorking(attendance) {
    return attendance && attendance.clock_in && !attendance.clock_out;
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

   /**
   * 勤務時間の計算
   * @param {string} clockIn 
   * @param {string} clockOut 
   * @returns {number} 時間単位
   */
  calculateWorkHours(clockIn, clockOut) {
    if (!clockIn || !clockOut) return 0;

    const start = new Date(`2000-01-01 ${clockIn}`);
    const end = new Date(`2000-01-01 ${clockOut}`);
    
    const diff = end - start;
    return diff / (1000 * 60 * 60); // ミリ秒を時間に変換
  }
}