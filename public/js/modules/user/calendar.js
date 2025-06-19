// modules/user/calendar.js
// 利用者の出勤履歴カレンダー（修正版 - 休憩時間表示対応・モーダル一意性修正）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { formatDate, getDaysInMonth } from '../../utils/date-time.js';
import { modalManager } from '../shared/modal-manager.js';

export class UserAttendanceCalendar {
  constructor(apiCall, showNotification) {
    this.apiCall = apiCall;
    this.showNotification = showNotification;
    this.currentDate = new Date();
    this.attendanceCache = new Map();
    this.currentModalId = null; // 現在開いているモーダルのID
    this.modalCounter = 0; // モーダル一意性確保用カウンター
  }

  /**
   * カレンダーをレンダリング
   * @param {HTMLElement} container 
   */
  async render(container) {
    if (!container) return;

    container.innerHTML = this.generateCalendarHTML();
    this.setupEventListeners();
    await this.updateCalendar();
  }

  /**
   * カレンダーHTMLを生成
   * @returns {string}
   */
  generateCalendarHTML() {
    return `
      <div class="calendar-container">
        <div class="calendar-header">
          <button class="calendar-nav-btn" id="prevMonthUser">
            <i class="fas fa-chevron-left"></i>
          </button>
          <h6 class="calendar-title" id="calendarTitleUser">${formatDate(this.currentDate, {
            year: 'numeric',
            month: 'long'
          })}</h6>
          <button class="calendar-nav-btn" id="nextMonthUser">
            <i class="fas fa-chevron-right"></i>
          </button>
        </div>
        <div class="calendar-grid" id="calendarGridUser">
          <!-- カレンダーの日付がここに表示される -->
        </div>
      </div>
    `;
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    const prevBtn = document.getElementById('prevMonthUser');
    const nextBtn = document.getElementById('nextMonthUser');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        this.updateCalendar();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        this.updateCalendar();
      });
    }
  }

  /**
   * カレンダーを更新
   */
  async updateCalendar() {
    const titleElement = document.getElementById('calendarTitleUser');
    const gridElement = document.getElementById('calendarGridUser');

    if (!gridElement) return;

    if (titleElement) {
      titleElement.textContent = formatDate(this.currentDate, {
        year: 'numeric',
        month: 'long'
      });
    }

    // 既存のモーダルを全て破棄
    this.destroyAllModals();

    // カレンダーグリッド更新
    gridElement.innerHTML = await this.generateCalendarGrid();
    this.setupDateClickHandlers();
  }

  /**
   * カレンダーグリッドを生成（修正版）
   * @returns {Promise<string>}
   */
  async generateCalendarGrid() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    // 月内のすべての日付のデータを事前に取得
    const monthDataPromises = [];
    const current = new Date(startDate);
    
    for (let i = 0; i < 42; i++) {
      if (current.getMonth() === month) {
        const dateStr = this.formatDateString(current);
        monthDataPromises.push(this.getAttendanceData(dateStr));
      }
      current.setDate(current.getDate() + 1);
    }
    
    await Promise.all(monthDataPromises);

    let html = '';

    // 曜日ヘッダー
    const dayHeaders = ['日', '月', '火', '水', '木', '金', '土'];
    dayHeaders.forEach((day, index) => {
      let headerClass = 'calendar-day-header';
      if (index === 0) headerClass += ' sunday-header';
      if (index === 6) headerClass += ' saturday-header';
      html += `<div class="${headerClass}">${day}</div>`;
    });

    // 日付セル
    current.setTime(startDate.getTime());
    for (let i = 0; i < 42; i++) {
      const isCurrentMonth = current.getMonth() === month;
      const currentDateReset = new Date(current);
      currentDateReset.setHours(0, 0, 0, 0);
      const isToday = currentDateReset.getTime() === today.getTime();
      const dateStr = this.formatDateString(current);
      const dayOfWeek = current.getDay();
      const attendanceData = this.attendanceCache.get(dateStr);
      
      let classes = ['calendar-day'];
      if (!isCurrentMonth) classes.push('other-month');
      if (isToday) classes.push('today');
      
      // 土日の色分け
      if (dayOfWeek === 0) classes.push('sunday');
      if (dayOfWeek === 6) classes.push('saturday');
      
      // 出勤状況による色分け（修正版）
      if (attendanceData && isCurrentMonth) {
        if (attendanceData.hasReport) {
          classes.push('has-report'); // 日報提出済み（緑）
        } else if (attendanceData.hasAttendance) {
          classes.push('has-attendance'); // 出勤記録あり（黄）
        }
        
        // 休憩がある場合の追加スタイル
        if (attendanceData.hasBreak) {
          classes.push('has-break');
        }
      }

      // ツールチップ情報追加
      let tooltipText = '';
      if (attendanceData && attendanceData.hasAttendance) {
        const attendance = attendanceData.attendance;
        tooltipText = `出勤: ${attendance.clock_in || '-'}`;
        if (attendance.clock_out) {
          tooltipText += ` | 退勤: ${attendance.clock_out}`;
        }
        if (attendanceData.hasBreak && attendanceData.breakRecord) {
          tooltipText += ` | 休憩: ${attendanceData.breakRecord.duration || 60}分`;
        }
      }

      html += `
        <div class="${classes.join(' ')}" data-date="${dateStr}" ${tooltipText ? `title="${tooltipText}"` : ''}>
          <div class="calendar-day-number">${current.getDate()}</div>
          ${this.generateWorkIndicators(attendanceData)}
        </div>
      `;

      current.setDate(current.getDate() + 1);
    }

    return html;
  }

  /**
   * 日付を文字列にフォーマット（タイムゾーン対応）
   * @param {Date} date 
   * @returns {string}
   */
  formatDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 作業インジケーターを生成
   * @param {Object} attendanceData 
   * @returns {string}
   */
  generateWorkIndicators(attendanceData) {
    if (!attendanceData || !attendanceData.hasAttendance) return '';

    let html = '<div class="calendar-day-indicators">';
    
    // 出勤マーク
    html += '<span class="calendar-indicator indicator-work" title="出勤記録あり"></span>';
    
    // 日報マーク
    if (attendanceData.hasReport) {
      html += '<span class="calendar-indicator indicator-report" title="日報提出済み"></span>';
    }
    
    // コメントマーク
    if (attendanceData.hasComment) {
      html += '<span class="calendar-indicator indicator-comment" title="スタッフコメントあり"></span>';
    }
    
    // 休憩マーク
    if (attendanceData.hasBreak) {
      html += '<span class="calendar-indicator indicator-break" title="休憩記録あり"></span>';
    }
    
    html += '</div>';

    return html;
  }

  /**
   * 出勤データを取得（修正版 - 休憩記録対応）
   * @param {string} dateStr 
   * @returns {Object|null}
   */
  async getAttendanceData(dateStr) {
    // キャッシュから取得
    if (this.attendanceCache.has(dateStr)) {
      return this.attendanceCache.get(dateStr);
    }

    try {
      const response = await this.apiCall(API_ENDPOINTS.USER.REPORT_BY_DATE(dateStr));
      
      // 休憩記録も取得
      const breakResponse = await this.apiCall(API_ENDPOINTS.USER.BREAK_STATUS(dateStr));
      
      const data = {
        hasAttendance: !!(response.attendance && response.attendance.clock_in),
        hasReport: !!response.report,
        hasComment: !!response.staffComment,
        hasBreak: !!breakResponse.breakRecord,
        attendance: response.attendance,
        report: response.report,
        staffComment: response.staffComment,
        breakRecord: breakResponse.breakRecord
      };
      
      this.attendanceCache.set(dateStr, data);
      return data;
    } catch (error) {
      console.error(`出勤データ取得エラー (${dateStr}):`, error);
      this.attendanceCache.set(dateStr, null);
      return null;
    }
  }

  /**
   * 日付クリックハンドラーを設定
   */
  setupDateClickHandlers() {
    const dayElements = document.querySelectorAll('#calendarGridUser .calendar-day:not(.other-month)');
    dayElements.forEach(dayElement => {
      dayElement.addEventListener('click', () => {
        const dateStr = dayElement.getAttribute('data-date');
        this.onDateClick(dateStr);
      });
    });
  }

  /**
   * 日付クリック時の処理（修正版）
   * @param {string} dateStr 
   */
  async onDateClick(dateStr) {
    try {
      // 既存のモーダルを破棄
      this.destroyCurrentModal();
      
      const cachedData = this.attendanceCache.get(dateStr);
      
      if (cachedData && (cachedData.hasAttendance || cachedData.hasReport)) {
        this.showAttendanceDetail(dateStr, cachedData);
      } else {
        // キャッシュにない場合は再取得
        const response = await this.apiCall(API_ENDPOINTS.USER.REPORT_BY_DATE(dateStr));
        const breakResponse = await this.apiCall(API_ENDPOINTS.USER.BREAK_STATUS(dateStr));
        
        if (response.attendance || response.report) {
          const data = {
            hasAttendance: !!(response.attendance && response.attendance.clock_in),
            hasReport: !!response.report,
            hasComment: !!response.staffComment,
            hasBreak: !!breakResponse.breakRecord,
            attendance: response.attendance,
            report: response.report,
            staffComment: response.staffComment,
            breakRecord: breakResponse.breakRecord
          };
          
          this.attendanceCache.set(dateStr, data);
          this.showAttendanceDetail(dateStr, data);
        } else {
          this.showNotification('この日の記録はありません', 'info');
        }
      }
    } catch (error) {
      console.error('記録取得エラー:', error);
      this.showNotification('記録の取得に失敗しました', 'danger');
    }
  }

  /**
   * 出勤詳細を表示（修正版 - 一意性確保）
   * @param {string} dateStr 
   * @param {Object} data 
   */
  showAttendanceDetail(dateStr, data) {
    // 既存のモーダルを破棄
    this.destroyCurrentModal();
    
    const formattedDate = formatDate(dateStr, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });

    // 一意のモーダルIDを生成（日付 + カウンター）
    this.modalCounter++;
    this.currentModalId = `userAttendanceDetailModal_${dateStr.replace(/-/g, '_')}_${this.modalCounter}`;
    
    // 日付に対応したコンテンツを生成
    const content = this.generateAttendanceDetailContent(data);

    // 新しいモーダルを作成
    const modalId = modalManager.create({
      id: this.currentModalId,
      title: `<i class="fas fa-calendar-check"></i> ${formattedDate}の記録`,
      content: content,
      size: 'modal-lg',
      headerClass: 'bg-primary text-white',
      saveButton: false
    });

    // モーダル閉じた時のクリーンアップ
    const modalElement = document.getElementById(modalId);
    if (modalElement) {
      modalElement.addEventListener('hidden.bs.modal', () => {
        this.destroyCurrentModal();
      }, { once: true });
    }

    modalManager.show(modalId);
  }

  /**
   * 現在のモーダルを破棄
   */
  destroyCurrentModal() {
    if (this.currentModalId) {
      try {
        modalManager.destroy(this.currentModalId);
      } catch (error) {
        // モーダルが既に削除されている場合は無視
        console.warn('モーダル破棄警告:', error);
      }
      this.currentModalId = null;
    }
  }

  /**
   * 全てのモーダルを破棄
   */
  destroyAllModals() {
    this.destroyCurrentModal();
    
    // 残存するモーダル要素を強制削除
    document.querySelectorAll('[id^="userAttendanceDetailModal_"]').forEach(modal => {
      modal.remove();
    });
    
    // backdrop要素も削除
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.remove();
    });
    
    // body要素のクラスをクリア
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('padding-right');
  }

  /**
   * 出勤詳細コンテンツを生成（修正版 - 休憩時間表示対応）
   * @param {Object} data 
   * @returns {string}
   */
  generateAttendanceDetailContent(data) {
    const { attendance, report, staffComment, breakRecord } = data;
    
    if (!attendance && !report) {
      return '<p class="text-muted text-center">この日の記録はありません</p>';
    }

    let html = '';
    
    // 出勤記録
    if (attendance) {
      html += `
        <div class="past-work-times mb-3">
          <div class="row">
            <div class="col-6 text-center">
              <div class="past-work-time-label">出勤時間</div>
              <div class="past-work-time-value">${attendance.clock_in || '-'}</div>
            </div>
            <div class="col-6 text-center">
              <div class="past-work-time-label">退勤時間</div>
              <div class="past-work-time-value">${attendance.clock_out || '-'}</div>
            </div>
          </div>
        </div>
      `;
      
      // 休憩記録を追加（修正版 - エラー対策）
      if (breakRecord && breakRecord.start_time) {
        html += `
          <div class="past-work-times mb-3">
            <div class="row">
              <div class="col-12 text-center">
                <div class="past-work-time-label">
                  <i class="fas fa-coffee text-warning"></i> 休憩時間
                </div>
                <div class="past-work-time-value text-warning">
                  ${breakRecord.start_time}〜${breakRecord.end_time || '進行中'} 
                  ${breakRecord.duration ? `（${breakRecord.duration}分）` : ''}
                </div>
              </div>
            </div>
          </div>
        `;
      }
    }
    
    // 日報内容
    if (report) {
      html += `
        <div class="past-form-section">
          <label class="past-form-label">作業内容</label>
          <div class="past-form-textarea">${report.work_content || ''}</div>
        </div>
        
        <div class="row mb-3">
          <div class="col-4">
            <label class="past-form-label">体温</label>
            <div class="past-form-value">${report.temperature}℃</div>
          </div>
          <div class="col-4">
            <label class="past-form-label">食欲</label>
            <div class="past-form-value">${this.formatAppetite(report.appetite)}</div>
          </div>
          <div class="col-4">
            <label class="past-form-label">頓服服用</label>
            <div class="past-form-value">${report.medication_time ? report.medication_time + '時頃' : 'なし'}</div>
          </div>
        </div>
        
        <div class="row mb-3">
          <div class="col-4">
            <label class="past-form-label">就寝時間</label>
            <div class="past-form-value">${report.bedtime || '-'}</div>
          </div>
          <div class="col-4">
            <label class="past-form-label">起床時間</label>
            <div class="past-form-value">${report.wakeup_time || '-'}</div>
          </div>
          <div class="col-4">
            <label class="past-form-label">睡眠状態</label>
            <div class="past-form-value">${this.formatSleepQuality(report.sleep_quality)}</div>
          </div>
        </div>
        
        <div class="past-form-section">
          <label class="past-form-label">振り返り・感想</label>
          <div class="past-form-textarea">${report.reflection || ''}</div>
        </div>
        
        ${report.interview_request ? `
          <div class="past-form-section">
            <label class="past-form-label">面談希望</label>
            <div class="past-form-value">${this.formatInterviewRequest(report.interview_request)}</div>
          </div>
        ` : ''}
      `;
    }
    
   // スタッフコメント（修正版 - 記入者情報を明確に表示）
   if (staffComment && staffComment.comment) {
    html += `
      <hr>
      <div class="staff-comment-display">
        <div class="staff-comment-title">
          <i class="fas fa-comment"></i> スタッフからのコメント
        </div>
        <div class="comment-box bg-light p-3 rounded">
          <div class="comment-text mb-2">${staffComment.comment}</div>
          <div class="comment-meta border-top pt-2 mt-2">
            <div class="row">
              <div class="col-6">
                <small class="text-muted">
                  <i class="fas fa-user text-primary"></i> 
                  <strong>記入者: ${staffComment.staff_name || 'スタッフ'}</strong>
                </small>
              </div>
              <div class="col-6 text-end">
                <small class="text-muted">
                  <i class="fas fa-clock text-info"></i> 
                  ${new Date(staffComment.created_at).toLocaleString('ja-JP')}
                </small>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  return html;
}

  /**
   * フォーマットヘルパー
   */
  formatAppetite(value) {
    const labels = { 'good': 'あり', 'none': 'なし' };
    return labels[value] || value;
  }

  formatSleepQuality(value) {
    const labels = { 'good': '眠れた', 'poor': 'あまり眠れない', 'bad': '眠れない' };
    return labels[value] || value;
  }

  formatInterviewRequest(value) {
    const labels = { 'consultation': '相談がある', 'interview': '面談希望' };
    return labels[value] || value;
  }

  /**
   * カレンダーをリフレッシュ
   */
  async refresh() {
    // 現在のモーダルを閉じる
    this.destroyAllModals();
    
    // キャッシュをクリア
    this.attendanceCache.clear();
    
    // カレンダー更新
    await this.updateCalendar();
  }

  /**
   * 特定月のサマリーを取得
   * @returns {Object}
   */
  async getMonthSummary() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month + 1);
    
    let workDays = 0;
    let reportDays = 0;
    let breakDays = 0;
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = this.formatDateString(date);
      const data = await this.getAttendanceData(dateStr);
      
      if (data) {
        if (data.hasAttendance) workDays++;
        if (data.hasReport) reportDays++;
        if (data.hasBreak) breakDays++;
      }
    }
    
    return {
      workDays,
      reportDays,
      breakDays,
      totalDays: daysInMonth
    };
  }

  /**
   * クリーンアップ
   */
  destroy() {
    this.destroyAllModals();
    this.attendanceCache.clear();
  }
}