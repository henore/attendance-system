// modules/user/report.js
// 利用者の日報機能ハンドラー（施設外就労先対応完全版）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { MESSAGES, EXTERNAL_WORK_LOCATION } from '../../constants/labels.js';
import { formatAppetite, formatSleepQuality, formatInterviewRequest, formatMedicationTime } from '../../utils/formatter.js';
import { getCurrentDate } from '../../utils/date-time.js';

export class UserReportHandler {
  constructor(apiCall, showNotification) {
    this.apiCall = apiCall;
    this.showNotification = showNotification;
    this.hasTodayReport = false;
    this.currentAttendance = null;
    this.onReportSubmit = null;
  }

  /**
   * 今日の日付を取得（日本時間）
   * @returns {string} YYYY-MM-DD形式
   */
  getTodayDate() {
    return getCurrentDate();
  }

  /**
   * 未出勤時のメッセージを生成
   * @returns {string}
   */
  generateNotYetMessage() {
    return `
      <div class="text-center text-muted p-5">
        <i class="fas fa-info-circle fa-3x mb-3"></i>
        <p>退勤後に日報を入力できます</p>
      </div>
    `;
  }

  /**
   * 日報フォームを読み込み（修正版）
   * @param {HTMLElement} container 
   * @param {Object} attendance - 現在の出勤情報
   */
  async loadForm(container, attendance) {
    if (!container) return;

    try {
      const today = this.getTodayDate();
      
      console.log('[日報フォーム] 今日の日付:', today);
      console.log('[日報フォーム] 引数attendance:', attendance);
      
      // 今日の記録を取得
      const response = await this.apiCall(`${API_ENDPOINTS.USER.REPORT_BY_DATE(today)}`);
      console.log('[日報フォーム] APIレスポンス:', response);
      
      // 今日の出勤記録を確定
      this.currentAttendance = this.determineTodayAttendance(response, attendance, today);
      
      console.log('[日報フォーム] 確定した出勤記録:', this.currentAttendance);
      
      // 出勤記録がない場合
      if (!this.currentAttendance) {
        container.innerHTML = this.generateNotYetMessage();
        this.hasTodayReport = false;
        return;
      }
      
      // 退勤していない場合は待機メッセージ
      if (!this.currentAttendance.clock_out) {
        container.innerHTML = this.generateWaitingMessage();
        this.hasTodayReport = false;
        return;
      }
      
      // 退勤済みの場合は日報フォーム表示
      this.hasTodayReport = response.report !== null;
      container.innerHTML = this.generateReportForm(response.report);
      
      // フォームにデータを保存
      const form = document.getElementById('reportForm');
      if (form) {
        form.dataset.attendance = JSON.stringify(this.currentAttendance);
      }
      
    } catch (error) {
      console.error('日報フォーム読み込みエラー:', error);
      container.innerHTML = this.generateErrorMessage();
      this.hasTodayReport = false;
    }
  }

  /**
   * 今日の出勤記録を確定する
   * @param {Object} response - API応答
   * @param {Object} attendance - 引数の出勤記録
   * @param {string} today - 今日の日付
   * @returns {Object|null}
   */
  determineTodayAttendance(response, attendance, today) {
    // 1. APIレスポンスの出勤記録をチェック（日付確認必須）
    if (response.attendance && this.isValidTodayRecord(response.attendance, today)) {
      console.log('[日報フォーム] APIから今日の出勤記録を使用');
      return response.attendance;
    }
    
    // 2. 引数の出勤記録をチェック（日付確認必須）
    if (attendance && this.isValidTodayRecord(attendance, today)) {
      console.log('[日報フォーム] 引数から今日の出勤記録を使用');
      return attendance;
    }
    
    // 3. どちらも今日の記録でない場合はnull
    console.log('[日報フォーム] 今日の出勤記録が見つかりません');
    return null;
  }

  /**
   * 出勤記録が今日の有効な記録かチェック
   * @param {Object} record - 出勤記録
   * @param {string} today - 今日の日付
   * @returns {boolean}
   */
  isValidTodayRecord(record, today) {
    if (!record) return false;
    if (!record.date) return false;
    if (record.date !== today) {
      console.log(`[日報フォーム] 日付不一致: ${record.date} !== ${today}`);
      return false;
    }
    if (!record.clock_in) {
      console.log('[日報フォーム] 出勤時間がありません');
      return false;
    }
    return true;
  }

  /**
   * 日報フォームを生成（施設外就労先対応完全版）
   * @param {Object} existingReport 
   * @returns {string}
   */
  generateReportForm(existingReport = null) {
    const report = existingReport || {};
    
    console.log('[日報フォーム生成] existingReport:', existingReport);
    console.log('[日報フォーム生成] external_work_location値:', report.external_work_location);
    
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
          <div class="col-md-12 mb-3">
            <div class="form-check">
              <input class="form-check-input" type="checkbox" id="externalWorkLocation" 
                     ${report.external_work_location ? 'checked' : ''}>
              <label class="form-check-label" for="externalWorkLocation">
                <i class="fas fa-building"></i> ${EXTERNAL_WORK_LOCATION}
              </label>
            </div>
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
   * 日報を提出（施設外就労先対応版）
   * @param {Event} event 
   */
  async submitReport(event) {
    event.preventDefault();
    
    console.log('[日報提出] 開始');
    console.log('[日報提出] currentAttendance:', this.currentAttendance);
    
    // 出勤情報の再確認・復元
    if (!this.currentAttendance) {
      const form = event.target;
      if (form.dataset.attendance) {
        try {
          this.currentAttendance = JSON.parse(form.dataset.attendance);
          console.log('[日報提出] フォームから出勤情報を復元:', this.currentAttendance);
        } catch (e) {
          console.error('[日報提出] 出勤情報の復元エラー:', e);
        }
      }
    }
    
    // 出勤情報の検証
    if (!this.validateAttendanceForReport()) {
      return;
    }

    const formData = this.collectFormData();
    console.log('[日報提出] フォームデータ:', formData);
    console.log('[日報提出] externalWorkLocationの値:', formData.externalWorkLocation);
    
    try {
      const response = await this.apiCall(API_ENDPOINTS.USER.REPORT_SUBMIT, {
        method: 'POST',
        body: JSON.stringify(formData)
      });

      console.log('[日報提出] 成功レスポンス:', response);
      
      this.hasTodayReport = true;
      this.showNotification(MESSAGES.REPORT.SUBMIT_SUCCESS, 'success');

      // コールバックを実行
      if (this.onReportSubmit) {
        this.onReportSubmit();
      }
      
      // フォームを再読み込み
      const container = document.getElementById('reportFormContainer');
      if (container) {
        await this.loadForm(container, this.currentAttendance);
      }
      
    } catch (error) {
      console.error('[日報提出] エラー:', error);
      this.showNotification(
        error.message || MESSAGES.REPORT.SUBMIT_ERROR, 
        'danger'
      );
    }
  }

  /**
   * 日報提出時の出勤情報検証
   * @returns {boolean}
   */
  validateAttendanceForReport() {
    if (!this.currentAttendance) {
      console.error('[日報提出] 出勤情報なし');
      this.showNotification(MESSAGES.REPORT.REQUIRED_CLOCK_OUT, 'warning');
      return false;
    }
    
    if (!this.currentAttendance.clock_out) {
      console.error('[日報提出] 退勤未完了');
      this.showNotification(MESSAGES.REPORT.REQUIRED_CLOCK_OUT, 'warning');
      return false;
    }
    
    // 日付チェック
    const today = this.getTodayDate();
    if (this.currentAttendance.date !== today) {
      console.error('[日報提出] 日付不一致:', this.currentAttendance.date, '!==', today);
      this.showNotification('出勤記録の日付が正しくありません', 'warning');
      return false;
    }
    
    return true;
  }

  /**
   * フォームデータを収集（施設外就労先対応版）
   * @returns {Object}
   */
  collectFormData() {
    const checkbox = document.getElementById('externalWorkLocation');
    const isChecked = checkbox ? checkbox.checked : false;
    
    console.log('[日報フロント] チェックボックス要素:', checkbox);
    console.log('[日報フロント] チェック状態:', isChecked);
    
    const formData = {
      workContent: document.getElementById('workContent').value,
      externalWorkLocation: isChecked ? EXTERNAL_WORK_LOCATION : null,
      temperature: parseFloat(document.getElementById('temperature').value),
      appetite: document.getElementById('appetite').value,
      medicationTime: document.getElementById('medicationTime').value ? parseInt(document.getElementById('medicationTime').value) : null,
      bedtime: document.getElementById('bedtime').value,
      wakeupTime: document.getElementById('wakeupTime').value,
      sleepQuality: document.getElementById('sleepQuality').value,
      reflection: document.getElementById('reflection').value,
      interviewRequest: document.getElementById('interviewRequest').value
    };
    
    console.log('[日報フロント] 送信データ:', formData);
    return formData;
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
      html += `
        <hr class="my-4">
        ${this.generateCommentDisplay(staffComment)}
      `;
    }
    
    return html;
  }

  /**
   * 就寝時間と起床時間から睡眠時間を計算
   * @param {string} bedtime HH:MM形式
   * @param {string} wakeupTime HH:MM形式
   * @returns {string} 睡眠時間の表示文字列
   */
  calculateSleepHours(bedtime, wakeupTime) {
    if (!bedtime || !wakeupTime) return '-';
    
    try {
      const [bedHours, bedMinutes] = bedtime.split(':').map(Number);
      const [wakeHours, wakeMinutes] = wakeupTime.split(':').map(Number);
      
      // 分に変換
      const bedTotalMinutes = bedHours * 60 + bedMinutes;
      const wakeTotalMinutes = wakeHours * 60 + wakeMinutes;
      
      let sleepMinutes;
      
      // 日をまたぐ場合を考慮
      if (wakeTotalMinutes >= bedTotalMinutes) {
        // 同日内（例：22:00就寝 → 06:00起床は不可能なので翌日とみなす）
        if (bedTotalMinutes > 12 * 60 && wakeTotalMinutes < 12 * 60) {
          // 夜遅く就寝して朝早く起床（通常パターン）
          sleepMinutes = (24 * 60 - bedTotalMinutes) + wakeTotalMinutes;
        } else {
          // 同日内（昼寝など）
          sleepMinutes = wakeTotalMinutes - bedTotalMinutes;
        }
      } else {
        // 日をまたぐ場合
        sleepMinutes = (24 * 60 - bedTotalMinutes) + wakeTotalMinutes;
      }
      
      const hours = Math.floor(sleepMinutes / 60);
      const minutes = sleepMinutes % 60;
      
      if (hours === 0) {
        return `${minutes}分`;
      } else if (minutes === 0) {
        return `${hours}時間`;
      } else {
        return `${hours}時間${minutes}分`;
      }
      
    } catch (error) {
      console.error('睡眠時間計算エラー:', error);
      return '-';
    }
  }

  /**
   * 日報内容の表示を生成（施設外就労先対応版）
   * @param {Object} report 
   * @returns {string}
   */
  generateReportDisplay(report) {
    return `
      <div class="past-form-section">
        <label class="past-form-label">作業内容</label>
        <div class="past-form-textarea">${report.work_content || ''}</div>
      </div>
      
      ${report.external_work_location ? `
        <div class="past-form-section">
          <label class="past-form-label">
            <i class="fas fa-building"></i> 施設外就労先
          </label>
          <div class="past-form-value text-info">${report.external_work_location}</div>
        </div>
      ` : ''}
      
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
          <label class="past-form-label">睡眠時間</label>
          <div class="past-form-value">${this.calculateSleepHours(report.bedtime, report.wakeup_time)}</div>
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
        <div class="staff-comment-title mb-3">
          <i class="fas fa-comment"></i> スタッフからのコメント
        </div>
        <div class="comment-box bg-primary bg-opacity-10 border border-primary rounded p-3">
          <div class="comment-content mb-3">
            <p class="mb-0 text-dark">${comment.comment}</p>
          </div>
          <div class="comment-author-info border-top border-primary border-opacity-25 pt-2">
            <div class="row">
              <div class="col-md-6">
                <small class="text-muted">
                  <i class="fas fa-user text-primary"></i> 
                  <strong>記入者: ${comment.staff_name || 'スタッフ'}</strong>
                </small>
              </div>
              <div class="col-md-6 text-md-end">
                <small class="text-muted">
                  <i class="fas fa-clock text-info"></i> 
                  記入日時: ${new Date(comment.created_at).toLocaleString('ja-JP')}
                </small>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}