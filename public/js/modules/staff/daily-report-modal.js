// modules/staff/daily-report-modal.js
// スタッフ日報モーダル

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { getCurrentDate, calculateWorkHours } from '../../utils/date-time.js';

export class StaffDailyReportModal {
  constructor(apiCall, showNotification) {
    this.apiCall = apiCall;
    this.showNotification = showNotification;
    this.modalId = 'staffDailyReportModal';
  }

  /**
   * 日報モーダルを表示
   * @param {Object} attendance - 出勤記録
   * @param {Function} onSubmit - 提出完了時のコールバック
   */
  async show(attendance, onSubmit) {
    try {
      console.log('[StaffDailyReportModal] show()呼び出し', {
        attendance,
        clock_in: attendance?.clock_in,
        clock_out: attendance?.clock_out,
        break_start: attendance?.break_start,
        break_end: attendance?.break_end,
        date: attendance?.date
      });

      // 既存の日報があるか確認
      const response = await this.apiCall(API_ENDPOINTS.STAFF.DAILY_REPORT_TODAY);
      const existingReport = response.report;
      console.log('[StaffDailyReportModal] 既存日報:', existingReport);

      // 休憩時間を判定（break_startがある場合は60分、ない場合は0分）
      const breakMinutes = attendance.break_start ? 60 : 0;
      console.log('[StaffDailyReportModal] 休憩時間:', breakMinutes);

      // 実働時間を計算
      const workHours = calculateWorkHours(
        attendance.clock_in,
        attendance.clock_out,
        breakMinutes
      );
      console.log('[StaffDailyReportModal] 実働時間:', workHours);

      // モーダルHTMLを生成
      const modalHTML = this.generateModalHTML(attendance, workHours, existingReport, breakMinutes);

      // 既存のモーダルを削除
      this.removeExistingModal();

      // モーダルをDOMに追加
      document.body.insertAdjacentHTML('beforeend', modalHTML);

      // イベントリスナー設定
      this.setupEventListeners(attendance, onSubmit);

      // モーダル表示
      const modalElement = document.getElementById(this.modalId);
      const modal = new bootstrap.Modal(modalElement, {
        backdrop: 'static',
        keyboard: false
      });
      modal.show();

    } catch (error) {
      console.error('日報モーダル表示エラー:', error);
      this.showNotification('日報モーダルの表示に失敗しました', 'danger');
    }
  }

  /**
   * モーダルHTMLを生成
   * @param {Object} attendance - 出勤記録
   * @param {string} workHours - 実働時間
   * @param {Object} existingReport - 既存の日報
   * @param {number} breakMinutes - 休憩時間（分）
   */
  generateModalHTML(attendance, workHours, existingReport, breakMinutes = 60) {
    const workReport = existingReport?.work_report || '';
    const communication = existingReport?.communication || '';

    // 休憩時間の表示（0分の場合は「なし」）
    const breakDisplay = breakMinutes > 0 ? `${breakMinutes}分` : 'なし';

    return `
      <div class="modal fade" id="${this.modalId}" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header bg-primary text-white">
              <h5 class="modal-title">
                <i class="fas fa-file-alt"></i> スタッフ日報入力
              </h5>
            </div>
            <div class="modal-body">
              <!-- 出勤情報 -->
              <div class="row mb-3">
                <div class="col-md-3">
                  <div class="info-box">
                    <label class="form-label">出勤時間</label>
                    <div class="info-value">${attendance.clock_in}</div>
                  </div>
                </div>
                <div class="col-md-3">
                  <div class="info-box">
                    <label class="form-label">退勤時間</label>
                    <div class="info-value">${attendance.clock_out}</div>
                  </div>
                </div>
                <div class="col-md-3">
                  <div class="info-box">
                    <label class="form-label">休憩時間</label>
                    <div class="info-value">${breakDisplay}</div>
                  </div>
                </div>
                <div class="col-md-3">
                  <div class="info-box">
                    <label class="form-label text-primary">実働時間</label>
                    <div class="info-value text-primary fw-bold">${workHours}</div>
                  </div>
                </div>
              </div>

              <hr>

              <!-- 日報フォーム -->
              <form id="staffDailyReportForm">
                <div class="mb-3">
                  <label for="workReport" class="form-label required">本日の業務報告</label>
                  <textarea
                    class="form-control"
                    id="workReport"
                    name="work_report"
                    rows="8"
                    required
                    placeholder="本日の業務内容、対応した利用者の状況、特記事項などを記入してください"
                  >${workReport}</textarea>
                </div>

                <div class="mb-3">
                  <label for="communication" class="form-label">連絡事項</label>
                  <textarea
                    class="form-control"
                    id="communication"
                    name="communication"
                    rows="5"
                    placeholder="次のシフトのスタッフへの申し送りや、重要な連絡事項があれば記入してください"
                  >${communication}</textarea>
                </div>
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="skipReportBtn">
                <i class="fas fa-times"></i> スキップ
              </button>
              <button type="button" class="btn btn-primary btn-lg px-5" id="submitReportBtn">
                <i class="fas fa-paper-plane"></i> 提出
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>
        .info-box {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 10px;
          text-align: center;
        }
        .info-box .form-label {
          font-size: 0.875rem;
          color: #6c757d;
          margin-bottom: 5px;
        }
        .info-box .info-value {
          font-size: 1.25rem;
          font-weight: bold;
          color: #333;
        }
        .required::after {
          content: " *";
          color: #dc3545;
        }
      </style>
    `;
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners(attendance, onSubmit) {
    const submitBtn = document.getElementById('submitReportBtn');
    const skipBtn = document.getElementById('skipReportBtn');
    const form = document.getElementById('staffDailyReportForm');

    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        if (form.checkValidity()) {
          this.handleSubmit(attendance, onSubmit);
        } else {
          form.reportValidity();
        }
      });
    }

    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        this.handleSkip();
      });
    }
  }

  /**
   * 日報提出処理
   */
  async handleSubmit(attendance, onSubmit) {
    try {
      const form = document.getElementById('staffDailyReportForm');
      const formData = new FormData(form);

      const data = {
        date: attendance.date,
        work_report: formData.get('work_report'),
        communication: formData.get('communication')
      };

      const response = await this.apiCall(API_ENDPOINTS.STAFF.DAILY_REPORT_SUBMIT, {
        method: 'POST',
        body: JSON.stringify(data)
      });

      if (response.success) {
        this.showNotification('日報を提出しました', 'success');
        this.closeModal();

        if (onSubmit) {
          onSubmit();
        }
      } else {
        throw new Error(response.error || '日報の提出に失敗しました');
      }

    } catch (error) {
      console.error('日報提出エラー:', error);
      this.showNotification(error.message, 'danger');
    }
  }

  /**
   * スキップ処理
   */
  handleSkip() {
    if (confirm('日報の入力をスキップしますか？\n※後から出勤簿から入力できます')) {
      this.showNotification('日報の入力をスキップしました', 'info');
      this.closeModal();
    }
  }

  /**
   * モーダルを閉じる
   */
  closeModal() {
    const modalElement = document.getElementById(this.modalId);
    const modal = bootstrap.Modal.getInstance(modalElement);

    if (modal) {
      modal.hide();
    }

    // モーダル削除
    setTimeout(() => {
      if (modalElement) {
        modalElement.remove();
      }
    }, 300);
  }

  /**
   * 既存のモーダルを削除
   */
  removeExistingModal() {
    const existingModal = document.getElementById(this.modalId);
    if (existingModal) {
      existingModal.remove();
    }
  }
}
