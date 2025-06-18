// modules/staff/attendance-book.js
// スタッフの出勤簿機能ハンドラー（完全修正版）

import { formatDate, getDaysInMonth } from '../../utils/date-time.js';
import { modalManager } from '../shared/modal-manager.js';

export class StaffAttendanceBook {
  constructor(apiCall, showNotification) {
    this.apiCall = apiCall;
    this.showNotification = showNotification;
    this.currentDate = new Date();
    this.attendanceCache = new Map();
    this.currentModalId = null; // 現在のモーダルIDを追跡
    this.activeModals = new Set(); // アクティブなモーダルを管理
  }

  /**
   * 出勤簿セクションをレンダリング
   */
  render() {
    return `
      <div class="custom-card">
        <div class="custom-card-header">
          <h5><i class="fas fa-calendar-check"></i> 出勤簿</h5>
          <button class="btn btn-outline-light btn-sm" id="refreshAttendanceBookBtn">
            <i class="fas fa-sync"></i> 更新
          </button>
        </div>
        <div class="card-body">
          <div id="attendanceCalendarContainer">
            <!-- 出勤簿カレンダーがここに表示される -->
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 出勤簿を読み込み
   */
  async load() {
    const container = document.getElementById('attendanceCalendarContainer');
    if (!container) return;
    
    // 既存のモーダルをクリーンアップ
    this.cleanupAllModals();
    
    // 出勤データキャッシュを読み込み
    await this.loadAttendanceCache();
    
    // カレンダーHTML挿入
    container.innerHTML = this.generateCalendarHTML();
    
    // イベントリスナー設定
    this.setupEventListeners();
    
    // カレンダー更新
    await this.updateCalendar();
    
    console.log('📅 スタッフ出勤簿カレンダー表示完了');
  }

  /**
   * カレンダーHTMLを生成
   */
  generateCalendarHTML() {
    return `
      <div class="calendar-container">
        <div class="calendar-header">
          <button class="calendar-nav-btn" id="prevMonthStaff">
            <i class="fas fa-chevron-left"></i>
          </button>
          <h6 class="calendar-title" id="calendarTitleStaff">${formatDate(this.currentDate, {
            year: 'numeric',
            month: 'long'
          })}</h6>
          <button class="calendar-nav-btn" id="nextMonthStaff">
            <i class="fas fa-chevron-right"></i>
          </button>
        </div>
        <div class="calendar-grid" id="calendarGridStaff">
          <!-- カレンダーの日付がここに表示される -->
        </div>
        
        <!-- 凡例 -->
        <div class="calendar-legend mt-3">
          <span class="legend-item">
            <span class="legend-color has-work"></span> 正常勤務
          </span>
          <span class="legend-item">
            <span class="legend-color has-attendance"></span> 出勤中/未退勤
          </span>
          <span class="legend-item">
            <span class="legend-color has-late"></span> 遅刻
          </span>
          <span class="legend-item">
            <span class="legend-color has-absence"></span> 欠勤
          </span>
          <span class="legend-item">
            <span class="legend-color has-paid-leave"></span> 有給
          </span>
        </div>
      </div>
      
      <style>
        .calendar-legend {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.85rem;
        }
        .legend-color {
          width: 16px;
          height: 16px;
          border-radius: 3px;
          display: inline-block;
        }
        .legend-color.has-work { background: #e6f7e6; }
        .legend-color.has-attendance { background: #fff8dc; }
        .legend-color.has-late { background: #fff3cd; }
        .legend-color.has-absence { background: #f8d7da; }
        .legend-color.has-paid-leave { background: #cfe2ff; }
        
        /* ステータスによる色分け追加 */
        .calendar-day.has-late { background: #fff3cd !important; }
        .calendar-day.has-absence { background: #f8d7da !important; }
        .calendar-day.has-paid-leave { background: #cfe2ff !important; }
      </style>
    `;
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    const prevBtn = document.getElementById('prevMonthStaff');
    const nextBtn = document.getElementById('nextMonthStaff');
    const refreshBtn = document.getElementById('refreshAttendanceBookBtn');

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

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refresh());
    }
  }

  /**
   * カレンダーを更新
   */
  async updateCalendar() {
    const titleElement = document.getElementById('calendarTitleStaff');
    const gridElement = document.getElementById('calendarGridStaff');

    if (!gridElement) return;

    if (titleElement) {
      titleElement.textContent = formatDate(this.currentDate, {
        year: 'numeric',
        month: 'long'
      });
    }

    // 既存のモーダルをクリーンアップ
    this.cleanupAllModals();
    
    // キャッシュをクリアして再読み込み
    await this.loadAttendanceCache();
    
    // カレンダーグリッド更新
    gridElement.innerHTML = await this.generateCalendarGrid();
    this.setupDateClickHandlers();
  }

  /**
   * カレンダーグリッドを生成（完全修正版）
   */
  async generateCalendarGrid() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

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
    const current = new Date(startDate);
    for (let i = 0; i < 42; i++) {
      const isCurrentMonth = current.getMonth() === month;
      const currentDateReset = new Date(current);
      currentDateReset.setHours(0, 0, 0, 0);
      const isToday = currentDateReset.getTime() === today.getTime();
      const dateStr = this.formatDateString(current);
      const dayOfWeek = current.getDay();
      const attendanceData = this.getAttendanceData(dateStr);
      
      let classes = ['calendar-day'];
      if (!isCurrentMonth) classes.push('other-month');
      if (isToday) classes.push('today');
      
      // 土日の色分け
      if (dayOfWeek === 0) classes.push('sunday');
      if (dayOfWeek === 6) classes.push('saturday');
      
      // 出勤状況とステータスによる色分け
      if (attendanceData && isCurrentMonth) {
        // ステータスによる色分け（優先度高）
        if (attendanceData.status === 'late') {
          classes.push('has-late');
        } else if (attendanceData.status === 'absence') {
          classes.push('has-absence');
        } else if (attendanceData.status === 'paid_leave') {
          classes.push('has-paid-leave');
        } else if (attendanceData.clock_out) {
          classes.push('has-work'); // 正常勤務完了（緑）
        } else if (attendanceData.clock_in) {
          classes.push('has-attendance'); // 出勤中または未退勤（黄）
        }
        
        // 休憩がある場合の追加スタイル
        if (attendanceData.breakRecord && attendanceData.breakRecord.start_time) {
          classes.push('has-break');
        }
      }

      // ツールチップ情報を生成
      let tooltipText = '';
      if (attendanceData && attendanceData.clock_in) {
        tooltipText = `出勤: ${attendanceData.clock_in}`;
        if (attendanceData.clock_out) {
          tooltipText += ` | 退勤: ${attendanceData.clock_out}`;
        }
        if (attendanceData.breakRecord && attendanceData.breakRecord.start_time) {
          const breakDuration = attendanceData.breakRecord.duration || 60;
          tooltipText += ` | 休憩: ${breakDuration}分`;
        }
        if (attendanceData.status && attendanceData.status !== 'normal') {
          tooltipText += ` | ${this.getStatusLabel(attendanceData.status)}`;
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
   * ステータスラベルを取得
   */
  getStatusLabel(status) {
    const labels = {
      'normal': '正常',
      'late': '遅刻',
      'early': '早退',
      'absence': '欠勤',
      'paid_leave': '有給'
    };
    return labels[status] || status;
  }

  /**
   * 日付を文字列にフォーマット（タイムゾーン対応）
   */
  formatDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 作業インジケーターを生成
   */
  generateWorkIndicators(attendanceData) {
    if (!attendanceData || !attendanceData.clock_in) return '';

    let html = '<div class="calendar-day-indicators">';
    
    // 出勤マーク
    html += '<span class="calendar-indicator indicator-work" title="出勤記録あり"></span>';
    
    // 休憩マーク（休憩記録がある場合）
    if (attendanceData.breakRecord && attendanceData.breakRecord.start_time) {
      html += '<span class="calendar-indicator indicator-break" title="休憩記録あり"></span>';
    }
    
    // ステータスマーク
    if (attendanceData.status && attendanceData.status !== 'normal') {
      html += `<span class="calendar-indicator indicator-status" title="${this.getStatusLabel(attendanceData.status)}"></span>`;
    }
    
    html += '</div>';

    return html;
  }

  /**
   * 出勤データを取得
   */
  getAttendanceData(dateStr) {
    return this.attendanceCache.get(dateStr) || null;
  }

  /**
   * 出勤キャッシュを読み込み（完全修正版）
   */
  async loadAttendanceCache() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month + 1);
    
    // キャッシュクリア
    this.attendanceCache.clear();
    
    // 各日付のデータを取得
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = this.formatDateString(date);
      
      try {
        // スタッフ自身の出勤記録を取得
        const response = await this.apiCall(`/api/staff/attendance/${dateStr}`);
        if (response.attendance) {
          // 休憩記録も取得
          try {
            const breakResponse = await this.apiCall(`/api/user/break/status/${dateStr}`);
            const attendanceData = {
              ...response.attendance,
              breakRecord: breakResponse.breakRecord || null
            };
            this.attendanceCache.set(dateStr, attendanceData);
          } catch (breakError) {
            // 休憩データ取得エラーの場合は出勤データのみ保存
            this.attendanceCache.set(dateStr, response.attendance);
          }
        }
      } catch (error) {
        // エラーは無視して次の日付へ
        console.debug(`出勤データ取得スキップ (${dateStr})`);
      }
    }
  }

  /**
   * 日付クリックハンドラーを設定
   */
  setupDateClickHandlers() {
    const dayElements = document.querySelectorAll('#calendarGridStaff .calendar-day:not(.other-month)');
    dayElements.forEach(dayElement => {
      dayElement.addEventListener('click', (e) => {
        e.preventDefault();
        const dateStr = dayElement.getAttribute('data-date');
        this.onDateClick(dateStr);
      });
    });
  }

  /**
   * 日付クリック時の処理
   */
  async onDateClick(dateStr) {
    const attendanceData = this.getAttendanceData(dateStr);
    
    if (attendanceData && attendanceData.clock_in) {
      await this.showAttendanceDetail(dateStr, attendanceData);
    } else {
      this.showNotification('この日の出勤記録はありません', 'info');
    }
  }

  /**
   * 出勤詳細を表示（完全修正版）
   */
  async showAttendanceDetail(dateStr, attendanceData) {
    // 既存のモーダルを確実にクリーンアップ
    this.cleanupAllModals();
    
    const formattedDate = formatDate(dateStr, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });

    const content = this.generateAttendanceDetailContent(attendanceData);
    
    // 日付を含む一意のモーダルIDを生成（タイムスタンプも追加）
    const modalId = `staffAttendanceDetailModal_${dateStr.replace(/-/g, '_')}_${Date.now()}`;
    this.currentModalId = modalId;
    this.activeModals.add(modalId);

    modalManager.create({
      id: modalId,
      title: `<i class="fas fa-calendar-check"></i> ${formattedDate}の出勤記録`,
      content: content,
      size: 'modal-lg',
      headerClass: 'bg-primary text-white',
      saveButton: false
    });

    // モーダルが閉じられた時のクリーンアップ
    const modalElement = document.getElementById(modalId);
    if (modalElement) {
      modalElement.addEventListener('hidden.bs.modal', () => {
        this.cleanupModal(modalId);
      }, { once: true });
    }

    modalManager.show(modalId);
  }

  /**
   * 出勤詳細コンテンツを生成（休憩情報含む完全版）
   */
  generateAttendanceDetailContent(attendanceData) {
    let html = '<div class="staff-attendance-detail">';

    // 基本的な出勤情報
    html += `
      <div class="row mb-3">
        <div class="col-6">
          <div class="detail-section">
            <h6><i class="fas fa-clock text-success"></i> 出勤時間</h6>
            <div class="detail-value h4 text-success">${attendanceData.clock_in}</div>
          </div>
        </div>
        <div class="col-6">
          <div class="detail-section">
            <h6><i class="fas fa-clock text-info"></i> 退勤時間</h6>
            <div class="detail-value h4 ${attendanceData.clock_out ? 'text-info' : 'text-muted'}">${attendanceData.clock_out || '未退勤'}</div>
          </div>
        </div>
      </div>
    `;

    // ステータス表示
    if (attendanceData.status && attendanceData.status !== 'normal') {
      html += `
        <div class="row mb-3">
          <div class="col-12">
            <div class="detail-section">
              <h6><i class="fas fa-exclamation-circle"></i> ステータス</h6>
              <div class="detail-value">
                ${this.getStatusBadge(attendanceData.status)}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // 休憩記録（詳細版）
    if (attendanceData.breakRecord && attendanceData.breakRecord.start_time) {
      const breakRecord = attendanceData.breakRecord;
      const breakDuration = breakRecord.duration || 60;
      
      html += `
        <div class="row mb-3">
          <div class="col-12">
            <div class="detail-section bg-warning bg-opacity-10">
              <h6><i class="fas fa-coffee text-warning"></i> 休憩記録</h6>
              <div class="row">
                <div class="col-4 text-center">
                  <label class="text-muted small">開始時刻</label>
                  <div class="detail-value h5 text-warning">${breakRecord.start_time}</div>
                </div>
                <div class="col-4 text-center">
                  <label class="text-muted small">終了時刻</label>
                  <div class="detail-value h5 text-warning">${breakRecord.end_time || '進行中'}</div>
                </div>
                <div class="col-4 text-center">
                  <label class="text-muted small">休憩時間</label>
                  <div class="detail-value h5 text-warning">${breakDuration}分</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="row mb-3">
          <div class="col-12">
            <div class="detail-section bg-light">
              <h6><i class="fas fa-coffee text-muted"></i> 休憩記録</h6>
              <p class="text-muted text-center mb-0">休憩記録なし</p>
            </div>
          </div>
        </div>
      `;
    }

    // 勤務時間計算（休憩時間を考慮）
    if (attendanceData.clock_out) {
      const breakMinutes = (attendanceData.breakRecord && attendanceData.breakRecord.duration) ? 
        attendanceData.breakRecord.duration : 0;
      const workDuration = this.calculateNetWorkDuration(
        attendanceData.clock_in, 
        attendanceData.clock_out, 
        breakMinutes
      );
      
      html += `
        <div class="row mb-3">
          <div class="col-12">
            <div class="detail-section bg-primary bg-opacity-10">
              <h6><i class="fas fa-stopwatch text-primary"></i> 勤務時間</h6>
              <div class="row">
                <div class="col-4 text-center">
                  <label class="text-muted small">総労働時間</label>
                  <div class="detail-value h5 text-primary">${this.calculateWorkDuration(attendanceData.clock_in, attendanceData.clock_out)}</div>
                </div>
                <div class="col-4 text-center">
                  <label class="text-muted small">休憩時間</label>
                  <div class="detail-value h5 text-warning">-${breakMinutes}分</div>
                </div>
                <div class="col-4 text-center">
                  <label class="text-muted small">実働時間</label>
                  <div class="detail-value h5 text-success">${workDuration}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    html += '</div>';
    return html;
  }

  /**
   * ステータスバッジを取得
   */
  getStatusBadge(status) {
    const statusConfig = {
      'normal': { class: 'bg-success', text: '正常' },
      'late': { class: 'bg-warning text-dark', text: '遅刻' },
      'early': { class: 'bg-info', text: '早退' },
      'absence': { class: 'bg-danger', text: '欠勤' },
      'paid_leave': { class: 'bg-primary', text: '有給' }
    };
    
    const config = statusConfig[status] || statusConfig['normal'];
    return `<span class="badge ${config.class}">${config.text}</span>`;
  }

  /**
   * 勤務時間を計算
   */
  calculateWorkDuration(clockIn, clockOut) {
    try {
      const startTime = new Date(`1970-01-01 ${clockIn}`);
      const endTime = new Date(`1970-01-01 ${clockOut}`);
      const durationMs = endTime - startTime;
      const hours = durationMs / (1000 * 60 * 60);
      
      if (hours > 0) {
        return `${hours.toFixed(1)}時間`;
      }
    } catch (error) {
      console.error('勤務時間計算エラー:', error);
    }
    
    return '計算不可';
  }

  /**
   * 実働時間を計算（休憩時間を差し引いた時間）
   */
  calculateNetWorkDuration(clockIn, clockOut, breakMinutes = 0) {
    try {
      const startTime = new Date(`1970-01-01 ${clockIn}`);
      const endTime = new Date(`1970-01-01 ${clockOut}`);
      const durationMs = endTime - startTime;
      const totalMinutes = durationMs / (1000 * 60);
      const netMinutes = totalMinutes - breakMinutes;
      const netHours = netMinutes / 60;
      
      if (netHours > 0) {
        return `${netHours.toFixed(1)}時間`;
      }
    } catch (error) {
      console.error('実働時間計算エラー:', error);
    }
    
    return '計算不可';
  }

  /**
   * カレンダーをリフレッシュ
   */
  async refresh() {
    this.cleanupAllModals();
    await this.loadAttendanceCache();
    await this.updateCalendar();
    this.showNotification('出勤簿を更新しました', 'info');
  }

  /**
   * 特定のモーダルをクリーンアップ
   */
  cleanupModal(modalId) {
    try {
      modalManager.destroy(modalId);
    } catch (error) {
      // エラーは無視
    }
    this.activeModals.delete(modalId);
    if (this.currentModalId === modalId) {
      this.currentModalId = null;
    }
  }

  /**
   * すべてのモーダルをクリーンアップ
   */
  cleanupAllModals() {
    // 既存のモーダルをすべて破棄
    this.activeModals.forEach(modalId => {
      try {
        modalManager.destroy(modalId);
      } catch (error) {
        // エラーは無視
      }
    });
    this.activeModals.clear();
    this.currentModalId = null;
    
    // 残存するモーダル要素も削除
    document.querySelectorAll('.modal[id^="staffAttendanceDetailModal_"]').forEach(modal => {
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
   * 月間サマリーを取得
   */
  getMonthSummary() {
    let workDays = 0;
    let totalHours = 0;
    let breakMinutes = 0;
    let statusCounts = {
      normal: 0,
      late: 0,
      absence: 0,
      paid_leave: 0
    };
    
    this.attendanceCache.forEach((attendance) => {
      if (attendance.clock_in) {
        workDays++;
        
        // ステータスカウント
        if (attendance.status) {
          statusCounts[attendance.status] = (statusCounts[attendance.status] || 0) + 1;
        }
        
        // 勤務時間計算
        if (attendance.clock_out) {
          const hours = this.calculateWorkHours(attendance.clock_in, attendance.clock_out);
          if (hours) totalHours += hours;
        }
        
        // 休憩時間合計
        if (attendance.breakRecord && attendance.breakRecord.duration) {
          breakMinutes += attendance.breakRecord.duration;
        }
      }
    });
    
    const netHours = totalHours - (breakMinutes / 60);
    
    return {
      workDays,
      totalHours,
      netHours,
      breakHours: breakMinutes / 60,
      averageHours: workDays > 0 ? (netHours / workDays).toFixed(1) : 0,
      statusCounts
    };
  }

  /**
   * 勤務時間を計算（数値）
   */
  calculateWorkHours(clockIn, clockOut) {
    try {
      const startTime = new Date(`1970-01-01 ${clockIn}`);
      const endTime = new Date(`1970-01-01 ${clockOut}`);
      const durationMs = endTime - startTime;
      return durationMs / (1000 * 60 * 60);
    } catch (error) {
      return 0;
    }
  }

  /**
   * クリーンアップ
   */
  destroy() {
    this.cleanupAllModals();
    this.attendanceCache.clear();
  }
}