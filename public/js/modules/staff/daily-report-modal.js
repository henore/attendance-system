// modules/staff/daily-report-modal.js
// サービス提供記録モーダル

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { getCurrentDate, calculateWorkHours, calculateBreakDuration } from '../../utils/date-time.js';

export class StaffDailyReportModal {
  constructor(apiCall, showNotification) {
    this.apiCall = apiCall;
    this.showNotification = showNotification;
    this.modalId = 'staffDailyReportModal';
    this.clockedInUsers = [];
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  parseExistingReport(workReport) {
    if (!workReport) return { freeText: '', entries: {} };
    try {
      const parsed = JSON.parse(workReport);
      if (parsed && parsed.entries && Array.isArray(parsed.entries)) {
        const map = {};
        parsed.entries.forEach(e => { map[e.user_id] = e; });
        return { freeText: parsed.free_text || '', entries: map };
      }
      if (Array.isArray(parsed)) {
        const map = {};
        parsed.forEach(e => { map[e.user_id] = e; });
        return { freeText: '', entries: map };
      }
    } catch { /* 旧形式 */ }
    return { freeText: '', entries: {} };
  }

  async show(attendance, onSubmit) {
    try {
      const [response, usersResponse] = await Promise.all([
        this.apiCall(API_ENDPOINTS.STAFF.DAILY_REPORT_TODAY),
        this.apiCall(API_ENDPOINTS.STAFF.DAILY_REPORT_CLOCKED_IN_USERS)
      ]);
      const existingReport = response.report;
      this.clockedInUsers = usersResponse.users || [];

      const breakMinutes = (attendance.break_start && attendance.break_end)
        ? calculateBreakDuration(attendance.break_start, attendance.break_end)
        : 0;

      const rawHours = calculateWorkHours(attendance.clock_in, attendance.clock_out, breakMinutes);
      let workHours = '-';
      if (rawHours && rawHours > 0) {
        const totalMin = Math.round(rawHours * 60);
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        workHours = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }

      const modalHTML = this.generateModalHTML(attendance, workHours, existingReport, breakMinutes);
      this.removeExistingModal();
      document.body.insertAdjacentHTML('beforeend', modalHTML);
      this.setupEventListeners(attendance, onSubmit);

      const modalElement = document.getElementById(this.modalId);
      const modal = new bootstrap.Modal(modalElement, {
        backdrop: 'static',
        keyboard: false
      });
      modal.show();

    } catch (error) {
      console.error('サービス提供記録モーダル表示エラー:', error);
      this.showNotification('サービス提供記録モーダルの表示に失敗しました', 'danger');
    }
  }

  generateModalHTML(attendance, workHours, existingReport, breakMinutes = 0) {
    const communication = existingReport?.communication || '';
    const { freeText, entries: existingEntries } = this.parseExistingReport(existingReport?.work_report);

    let breakDisplay = 'なし';
    if (attendance.break_start && attendance.break_end) {
      breakDisplay = `${attendance.break_start}〜${attendance.break_end}（${breakMinutes}分）`;
    } else if (attendance.break_start) {
      breakDisplay = `${attendance.break_start}〜（進行中）`;
    }

    const users = this.clockedInUsers || [];
    const userRows = users.map(u => {
      const entry = existingEntries[u.id] || {};
      return `
        <tr>
          <td class="align-middle fw-bold text-nowrap">${u.name}</td>
          <td><input type="text" class="form-control form-control-sm" data-user-id="${u.id}" data-field="work_content" value="${this.escapeHtml(entry.work_content || '')}" /></td>
          <td><input type="text" class="form-control form-control-sm" data-user-id="${u.id}" data-field="support_content" value="${this.escapeHtml(entry.support_content || '')}" /></td>
          <td><input type="text" class="form-control form-control-sm" data-user-id="${u.id}" data-field="user_condition" value="${this.escapeHtml(entry.user_condition || '')}" /></td>
          <td><input type="text" class="form-control form-control-sm" data-user-id="${u.id}" data-field="attendance_info" value="${this.escapeHtml(entry.attendance_info || '')}" /></td>
          <td class="text-center"><button type="button" class="btn btn-outline-danger btn-sm sr-delete-btn" data-user-id="${u.id}" data-user-name="${this.escapeHtml(u.name)}" title="削除"><i class="fas fa-trash-alt"></i></button></td>
        </tr>`;
    }).join('');

    return `
      <div class="modal fade" id="${this.modalId}" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header bg-primary text-white">
              <h5 class="modal-title">
                <i class="fas fa-file-alt"></i> サービス提供記録入力
              </h5>
            </div>
            <div class="modal-body">
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

              <form id="staffDailyReportForm">
                <div class="mb-3">
                  <label class="form-label required">本日のサービス提供記録及び業務報告</label>
                  ${users.length > 0 ? `
                  <div class="service-record-table-wrapper">
                    <table class="table table-sm table-bordered mb-0 service-record-table">
                      <thead>
                        <tr>
                          <th class="sr-col-name">利用者名</th>
                          <th class="sr-col-work">作業内容</th>
                          <th class="sr-col-support">支援内容</th>
                          <th class="sr-col-condition">利用者の様子</th>
                          <th class="sr-col-attendance">勤怠</th>
                          <th class="sr-col-delete"></th>
                        </tr>
                      </thead>
                      <tbody>
                        ${userRows}
                      </tbody>
                    </table>
                  </div>
                  ` : `
                  <div class="alert alert-info mb-0">
                    <i class="fas fa-info-circle"></i> 本日出勤している利用者はいません
                  </div>
                  `}
                </div>

                <div class="mb-3">
                  <label for="communication" class="form-label">業務報告</label>
                  <textarea
                    class="form-control"
                    id="communication"
                    name="communication"
                    rows="2"
                    placeholder="業務報告や特記事項があれば記入してください"
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
        .service-record-table-wrapper {
          max-height: 234px;
          overflow-y: auto;
          border: 1px solid #dee2e6;
          border-radius: 4px;
        }
        .service-record-table {
          font-size: 0.8rem;
          margin-bottom: 0;
        }
        .service-record-table thead {
          position: sticky;
          top: 0;
          z-index: 1;
          background: #e9ecef;
        }
        .service-record-table thead th {
          font-size: 0.75rem;
          padding: 6px 4px;
          white-space: nowrap;
          border-bottom: 2px solid #dee2e6;
        }
        .service-record-table tbody td {
          padding: 3px 4px;
          vertical-align: middle;
        }
        .sr-col-name { width: 7%; }
        .sr-col-work { width: 20%; }
        .sr-col-support { width: 27%; }
        .sr-col-condition { width: 27%; }
        .sr-col-attendance { width: 15%; }
        .sr-col-delete { width: 4%; }
        .sr-delete-btn {
          padding: 1px 5px;
          font-size: 0.7rem;
          line-height: 1;
        }
        .service-record-table .form-control-sm {
          font-size: 0.78rem;
          padding: 2px 6px;
          height: auto;
        }
      </style>
    `;
  }

  setupEventListeners(attendance, onSubmit) {
    const submitBtn = document.getElementById('submitReportBtn');
    const skipBtn = document.getElementById('skipReportBtn');

    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        this.handleSubmit(attendance, onSubmit);
      });
    }

    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        this.handleSkip();
      });
    }

    document.querySelectorAll(`#${this.modalId} .sr-delete-btn`).forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const userId = parseInt(e.currentTarget.dataset.userId);
        const userName = e.currentTarget.dataset.userName;
        if (!confirm(`${userName} の支援記録を削除しますか？`)) return;
        try {
          const response = await this.apiCall(API_ENDPOINTS.STAFF.DAILY_REPORT_DELETE_ENTRY, {
            method: 'POST',
            body: JSON.stringify({ date: attendance.date, user_id: userId })
          });
          if (response.success) {
            this.showNotification(`${userName} の記録を削除しました`, 'success');
            e.currentTarget.closest('tr').querySelectorAll('input').forEach(input => { input.value = ''; });
          } else {
            throw new Error(response.error);
          }
        } catch (error) {
          this.showNotification(error.message || '記録の削除に失敗しました', 'danger');
        }
      });
    });
  }

  async handleSubmit(attendance, onSubmit) {
    try {
      const communication = document.getElementById('communication')?.value || '';
      const users = this.clockedInUsers || [];
      const userEntries = users.map(u => ({
        user_id: u.id,
        user_name: u.name,
        work_content: document.querySelector(`input[data-user-id="${u.id}"][data-field="work_content"]`)?.value?.trim() || '',
        support_content: document.querySelector(`input[data-user-id="${u.id}"][data-field="support_content"]`)?.value?.trim() || '',
        user_condition: document.querySelector(`input[data-user-id="${u.id}"][data-field="user_condition"]`)?.value?.trim() || '',
        attendance_info: document.querySelector(`input[data-user-id="${u.id}"][data-field="attendance_info"]`)?.value?.trim() || ''
      }));

      const data = {
        date: attendance.date,
        work_report: JSON.stringify({ free_text: '', entries: userEntries }),
        communication: communication
      };

      const response = await this.apiCall(API_ENDPOINTS.STAFF.DAILY_REPORT_SUBMIT, {
        method: 'POST',
        body: JSON.stringify(data)
      });

      if (response.success) {
        this.showNotification('サービス提供記録を提出しました', 'success');
        this.closeModal();
        if (onSubmit) onSubmit();
      } else {
        throw new Error(response.error || 'サービス提供記録の提出に失敗しました');
      }
    } catch (error) {
      console.error('サービス提供記録提出エラー:', error);
      this.showNotification(error.message, 'danger');
    }
  }

  handleSkip() {
    if (confirm('サービス提供記録の入力をスキップしますか？\n※後から出勤簿から入力できます')) {
      this.showNotification('サービス提供記録の入力をスキップしました', 'info');
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
