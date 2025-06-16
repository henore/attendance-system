// modules/user/report.js
// 利用者の日報機能ハンドラー（完全修正版）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { MESSAGES } from '../../constants/labels.js';
import { formatAppetite, formatSleepQuality, formatInterviewRequest, formatMedicationTime } from '../../utils/formatter.js';

export class UserReportHandler {
  constructor(apiCall, showNotification) {
    this.apiCall = apiCall;
    this.showNotification = showNotification;
    this.hasTodayReport = false;
    this.currentAttendance = null;
  }

  /**
   * 日報フォームを読み込み
   * @param {HTMLElement} container 
   * @param {Object} attendance - 現在の出勤情報
   */
  async loadForm(container, attendance) {
    if (!container) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await this.apiCall(`${API_ENDPOINTS.USER.REPORT_BY_DATE(today)}`);
      
      console.log('[日報フォーム] APIレスポンス:', response);
      console.log('[日報フォーム] 引数attendance:', attendance);
      
      // 再ログイン時などはAPIレスポンスの出勤情報を優先
      if (response.attendance) {
        this.currentAttendance = response.attendance;
      } else if (attendance) {
        this.currentAttendance = attendance;
      } else {
        this.currentAttendance = null;
      }
      
      console.log('[日報フォーム] 使用するattendance:', this.currentAttendance);
      
      // 出勤記録がない場合
      if (!this.currentAttendance) {
        container.innerHTML = this.generateNotYetMessage();
        return;
      }
      
      // 退勤後のみ日報入力可能
      if (this.currentAttendance.clock_out) {
        this.hasTodayReport = response.report !== null;
        container.innerHTML = this.generateReportForm(response.report);
        
        // フォームにイベントリスナーを追加（index.jsの委譲と重複しないように）
        const form = document.getElementById('reportForm');
        if (form) {
          form.dataset.attendance = JSON.stringify(this.currentAttendance);
        }
      } else {
        container.innerHTML = this.generateWaitingMessage();
      }
    } catch (error) {
      console.error('日報フォーム読み込みエラー:', error);
      container.innerHTML = this.generateErrorMessage();
    }
  }

   /**
   * 日報フォームを生成
   * @param {Object} existingReport 
   * @returns {string}
   */
  generateReportForm(existingReport = null) {
    const report = existingReport || {};
    
    return `
      <form id="reportForm">
        <div class="row">
          <div class="col-md-12 mb-3">
            <label for="workContent" class="form-label">
              <i class="fas fa-tasks"></i> 作業内容
            </label>
            <textarea class="form-control" id="workContent" rows="1" 
                      placeholder="今日行った作業内容を記入してください..." required>${report.work_content || ''}</textarea>
          </div>
        </div>
        
        <div class="row">
          <div class="col-md-4 mb-3">
            <label for="temperature" class="form-label">
              <i class="fas fa-thermometer-half"></i> 体温
            </label>
            <input type="number" class="form-control" id="temperature" 
                   step="0.1" min="35" max="42" value="${report.temperature || ''}" required>
          </div>
          <div class="col-md-4 mb-3">
            <label for="appetite" class="form-label">
              <i class="fas fa-utensils"></i> 食欲
            </label>
            <select class="form-control" id="appetite" required>
              <option value="">選択してください</option>
              <option value="good" ${report.appetite === 'good' ? 'selected' : ''}>あり</option>
              <option value="none" ${report.appetite === 'none' ? 'selected' : ''}>なし</option>
            </select>
          </div>
          <div class="col-md-4 mb-3">
            <label for="medicationTime" class="form-label">
              <i class="fas fa-pills"></i> 頓服服用時間
            </label>
            <input type="number" class="form-control" id="medicationTime" 
                   min="0" max="23" value="${report.medication_time || ''}" placeholder="時間（なしの場合は空欄）">
          </div>
        </div>
        
        <div class="row">
          <div class="col-md-4 mb-3">
            <label for="bedtime" class="form-label">
              <i class="fas fa-bed"></i> 就寝時間
            </label>
            <input type="time" class="form-control" id="bedtime" value="${report.bedtime || ''}">
          </div>
          <div class="col-md-4 mb-3">
            <label for="wakeupTime" class="form-label">
              <i class="fas fa-sun"></i> 起床時間
            </label>
            <input type="time" class="form-control" id="wakeupTime" value="${report.wakeup_time || ''}">
          </div>
          <div class="col-md-4 mb-3">
            <label for="sleepQuality" class="form-label">
              <i class="fas fa-moon"></i> 睡眠状態
            </label>
            <select class="form-control" id="sleepQuality" required>
              <option value="">選択してください</option>
              <option value="good" ${report.sleep_quality === 'good' ? 'selected' : ''}>眠れた</option>
              <option value="poor" ${report.sleep_quality === 'poor' ? 'selected' : ''}>あまり眠れない</option>
              <option value="bad" ${report.sleep_quality === 'bad' ? 'selected' : ''}>眠れない</option>
            </select>
          </div>
        </div>
        
        <div class="row">
          <div class="col-md-12 mb-3">
            <label for="reflection" class="form-label">
              <i class="fas fa-lightbulb"></i> 振り返り・感想
            </label>
            <textarea class="form-control" id="reflection" rows="2" 
                      placeholder="今日の振り返りや感想を記入してください..." required>${report.reflection || ''}</textarea>
          </div>
        </div>
        
        <div class="row">
          <div class="col-md-6 mb-3">
            <label for="interviewRequest" class="form-label">
              <i class="fas fa-comments"></i> 面談希望
            </label>
            <select class="form-control" id="interviewRequest">
              <option value="">なし</option>
              <option value="consultation" ${report.interview_request === 'consultation' ? 'selected' : ''}>相談がある</option>
              <option value="interview" ${report.interview_request === 'interview' ? 'selected' : ''}>面談希望</option>
            </select>
          </div>
          <div class="col-md-6 mb-3 d-flex align-items-end">
            <button type="submit" class="btn btn-primary w-100" id="submitReportBtn">
              <i class="fas fa-save"></i> 日報提出
            </button>
          </div>
        </div>
      </form>
    `;
  }

  /**
   * 待機メッセージを生成
   * @returns {string}
   */
  generateWaitingMessage() {
    return `
      <div class="text-center text-muted">
        <i class="fas fa-info-circle fa-2x mb-3"></i>
        <p>退勤後に日報を入力できます</p>
      </div>
    `;
  }

  /**
   * エラーメッセージを生成
   * @returns {string}
   */
  generateErrorMessage() {
    return `
      <div class="text-center text-danger">
        <i class="fas fa-exclamation-circle fa-2x mb-3"></i>
        <p>日報フォームの読み込みに失敗しました</p>
      </div>
    `;
  }

  /**
   * 日報を提出（修正版）
   * @param {Event} event 
   */
  async submitReport(event) {
    event.preventDefault();
    
    console.log('[日報提出] currentAttendance:', this.currentAttendance);
    
    // 出勤情報の再確認
    if (!this.currentAttendance) {
      // フォームのdata属性から復元を試みる
      const form = event.target;
      if (form.dataset.attendance) {
        try {
          this.currentAttendance = JSON.parse(form.dataset.attendance);
        } catch (e) {
          console.error('出勤情報の復元エラー:', e);
        }
      }
    }
    
    if (!this.currentAttendance || !this.currentAttendance.clock_out) {
      console.error('[日報提出] 出勤情報エラー:', this.currentAttendance);
      this.showNotification(MESSAGES.REPORT.REQUIRED_CLOCK_OUT, 'warning');
      return;
    }

    const formData = this.collectFormData();
    
    try {
      await this.apiCall(API_ENDPOINTS.USER.REPORT, {
        method: 'POST',
        body: JSON.stringify(formData)
      });

      this.hasTodayReport = true;
      this.showNotification(MESSAGES.REPORT.SUBMIT_SUCCESS, 'success');
      
      // フォームを再読み込み
      const container = document.getElementById('reportFormContainer');
      if (container) {
        await this.loadForm(container, this.currentAttendance);
      }
    } catch (error) {
      console.error('日報提出エラー:', error);
      this.showNotification(MESSAGES.REPORT.SUBMIT_ERROR, 'danger');
    }
  }

  /**
   * フォームデータを収集
   * @returns {Object}
   */
  collectFormData() {
    return {
      workContent: document.getElementById('workContent').value,
      temperature: parseFloat(document.getElementById('temperature').value),
      appetite: document.getElementById('appetite').value,
      medicationTime: document.getElementById('medicationTime').value ? parseInt(document.getElementById('medicationTime').value) : null,
      bedtime: document.getElementById('bedtime').value,
      wakeupTime: document.getElementById('wakeupTime').value,
      sleepQuality: document.getElementById('sleepQuality').value,
      reflection: document.getElementById('reflection').value,
      interviewRequest: document.getElementById('interviewRequest').value
    };
  }

  /**
   * 過去の記録を表示用に生成
   * @param {Object} data 
   * @returns {string}
   */
  generatePastRecordDisplay(data) {
    const { attendance, report, staffComment } = data;
    
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
    }
    
    // 日報内容
    if (report) {
      html += this.generateReportDisplay(report);
    }
    
    // スタッフコメント
    if (staffComment) {
      html += this.generateCommentDisplay(staffComment);
    }
    
    return html;
  }

  /**
   * 日報内容の表示を生成
   * @param {Object} report 
   * @returns {string}
   */
  generateReportDisplay(report) {
    return `
      <div class="past-form-section">
        <label class="past-form-label">作業内容</label>
        <div class="past-form-textarea">${report.work_content || ''}</div>
      </div>
      
      <div class="past-health-grid">
        <div class="past-form-section">
          <label class="past-form-label">体温</label>
          <div class="past-form-value">${report.temperature}℃</div>
        </div>
        <div class="past-form-section">
          <label class="past-form-label">食欲</label>
          <div class="past-form-value">${formatAppetite(report.appetite)}</div>
        </div>
        <div class="past-form-section">
          <label class="past-form-label">頓服服用</label>
          <div class="past-form-value">${formatMedicationTime(report.medication_time)}</div>
        </div>
      </div>
      
      <div class="past-sleep-grid">
        <div class="past-form-section">
          <label class="past-form-label">就寝時間</label>
          <div class="past-form-value">${report.bedtime || '-'}</div>
        </div>
        <div class="past-form-section">
          <label class="past-form-label">起床時間</label>
          <div class="past-form-value">${report.wakeup_time || '-'}</div>
        </div>
        <div class="past-form-section">
          <label class="past-form-label">睡眠状態</label>
          <div class="past-form-value">${formatSleepQuality(report.sleep_quality)}</div>
        </div>
      </div>
      
      <div class="past-form-section">
        <label class="past-form-label">振り返り・感想</label>
        <div class="past-form-textarea">${report.reflection || ''}</div>
      </div>
      
      ${report.interview_request ? `
        <div class="past-form-section">
          <label class="past-form-label">面談希望</label>
          <div class="past-form-value">${formatInterviewRequest(report.interview_request)}</div>
        </div>
      ` : ''}
    `;
  }

  /**
   * スタッフコメントの表示を生成
   * @param {Object} comment 
   * @returns {string}
   */
  generateCommentDisplay(comment) {
    return `
      <div class="staff-comment-display">
        <div class="staff-comment-title">
          <i class="fas fa-comment"></i> スタッフからのコメント
        </div>
        <div class="comment-box">${comment.comment}</div>
        <small class="text-muted">
          記入日時: ${new Date(comment.created_at).toLocaleString('ja-JP')}
        </small>
      </div>
    `;
  }
}