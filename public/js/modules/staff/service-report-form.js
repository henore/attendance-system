// modules/staff/service-report-form.js
// スタッフのサービス提供記録フォーム

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { calculateWorkHours, calculateBreakDuration } from '../../utils/date-time.js';

export class ServiceReportForm {
  constructor(app) {
    this.app = app;
    this.clockedInUsers = [];
  }

  async loadReportForm(container, currentAttendance, { isOnNakanuke = false, isOnBreak = false, nakanukeStartTime = null } = {}) {
    try {
      const [reportResponse, usersResponse] = await Promise.all([
        this.app.apiCall(API_ENDPOINTS.REPORTS.DAILY_REPORT_TODAY),
        this.app.apiCall(API_ENDPOINTS.REPORTS.DAILY_REPORT_CLOCKED_IN_USERS)
      ]);
      const existingReport = reportResponse.report;
      this.clockedInUsers = usersResponse.users || [];
      this.currentAttendance = currentAttendance;

      const attendance = currentAttendance || {};
      const canSubmit = !!attendance.clock_in && !isOnNakanuke && !isOnBreak;

      const breakMinutes = (attendance.break_start && attendance.break_end)
        ? calculateBreakDuration(attendance.break_start, attendance.break_end)
        : 0;

      const nakanukeMinutes = attendance.nakanuke_minutes || 0;

      let workHours = '-';
      if (attendance.clock_in && attendance.clock_out) {
        const totalDeduction = breakMinutes + nakanukeMinutes;
        const hours = calculateWorkHours(attendance.clock_in, attendance.clock_out, totalDeduction);
        if (hours && hours > 0) {
          const totalMin = Math.round(hours * 60);
          const h = Math.floor(totalMin / 60);
          const m = totalMin % 60;
          workHours = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }
      }

      container.innerHTML = this.generateReportForm(workHours, existingReport, breakMinutes, canSubmit, nakanukeMinutes, {
        attendance, isOnNakanuke, nakanukeStartTime
      });
      this.setupReportEventListeners();

    } catch (error) {
      console.error('サービス提供記録読み込みエラー:', error);
      container.innerHTML = `
        <div class="alert alert-danger">
          <i class="fas fa-exclamation-triangle"></i> サービス提供記録の読み込みに失敗しました
        </div>
      `;
    }
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

  generateReportForm(workHours, existingReport, breakMinutes = 0, canSubmit = true, nakanukeMinutes = 0, { attendance = {}, isOnNakanuke = false, nakanukeStartTime = null } = {}) {
    const communication = existingReport?.communication || '';
    const { entries: existingEntries } = this.parseExistingReport(existingReport?.work_report);
    const clockInDisplay = attendance.clock_in || '-';
    const clockOutDisplay = attendance.clock_out || '-';

    let breakDisplay = 'なし';
    if (attendance.break_start && attendance.break_end) {
      breakDisplay = `${attendance.break_start}〜${attendance.break_end}（${breakMinutes}分）`;
    } else if (attendance.break_start) {
      breakDisplay = `${attendance.break_start}〜（進行中）`;
    }

    let nakanukeDisplay = 'なし';
    if (isOnNakanuke) {
      nakanukeDisplay = `${nakanukeStartTime}〜（進行中）`;
    } else if (nakanukeMinutes > 0) {
      nakanukeDisplay = `${nakanukeMinutes}分`;
    }

    const isResubmit = !!existingReport;
    const submitBtnLabel = isResubmit ? 'サービス提供記録を再提出' : 'サービス提供記録を提出';
    const submitBtnDisabled = canSubmit ? '' : 'disabled';

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
      <div class="card">
        <div class="card-header bg-primary text-white">
          <h5 class="mb-0"><i class="fas fa-clipboard-list"></i> サービス提供記録</h5>
        </div>
        <div class="card-body">
          <div class="row mb-3">
            <div class="col-md-3">
              <div class="info-box">
                <label class="form-label">出勤時間</label>
                <div class="info-value">${clockInDisplay}</div>
              </div>
            </div>
            <div class="col-md-3">
              <div class="info-box">
                <label class="form-label">退勤時間</label>
                <div class="info-value">${clockOutDisplay}</div>
              </div>
            </div>
            <div class="col-md-2">
              <div class="info-box">
                <label class="form-label">休憩時間</label>
                <div class="info-value">${breakDisplay}</div>
              </div>
            </div>
            <div class="col-md-2">
              <div class="info-box">
                <label class="form-label">中抜け</label>
                <div class="info-value">${nakanukeDisplay}</div>
              </div>
            </div>
            <div class="col-md-2">
              <div class="info-box">
                <label class="form-label text-primary">実働時間</label>
                <div class="info-value text-primary fw-bold">${workHours}</div>
              </div>
            </div>
          </div>

          <hr>

          <form id="staffDailyReportForm">
            <div class="mb-3">
              <label class="form-label required">
                <i class="fas fa-tasks"></i> 本日のサービス提供記録及び業務報告
              </label>
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
              <label for="staffCommunication" class="form-label">
                <i class="fas fa-clipboard"></i> 業務報告
              </label>
              <textarea
                class="form-control"
                id="staffCommunication"
                rows="2"
                placeholder="業務報告や特記事項があれば記入してください"
              >${communication}</textarea>
            </div>

            <div class="d-grid">
              <button type="submit" class="btn btn-primary btn-lg" id="staffSubmitReportBtn" ${submitBtnDisabled}>
                <i class="fas fa-paper-plane"></i> ${submitBtnLabel}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  setupReportEventListeners() {
    const form = document.getElementById('staffDailyReportForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleReportSubmit();
      });
    }

    document.querySelectorAll('.sr-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const userId = parseInt(e.currentTarget.dataset.userId);
        const userName = e.currentTarget.dataset.userName;
        this.handleDeleteEntry(userId, userName);
      });
    });
  }

  async handleDeleteEntry(userId, userName) {
    if (!confirm(`${userName} の支援記録を削除しますか？`)) return;

    try {
      const response = await this.app.apiCall(API_ENDPOINTS.REPORTS.DAILY_REPORT_DELETE_ENTRY, {
        method: 'POST',
        body: JSON.stringify({ date: this.currentAttendance.date, user_id: userId })
      });
      if (response.success) {
        this.app.showNotification(`${userName} の記録を削除しました`, 'success');
        const container = document.getElementById('staffReportSection');
        if (container) await this.loadReportForm(container, this.currentAttendance);
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      console.error('記録削除エラー:', error);
      this.app.showNotification(error.message || '記録の削除に失敗しました', 'danger');
    }
  }

  async handleReportSubmit() {
    try {
      const communication = document.getElementById('staffCommunication').value;

      const userEntries = [];
      const users = this.clockedInUsers || [];
      users.forEach(u => {
        const workContent = document.querySelector(`input[data-user-id="${u.id}"][data-field="work_content"]`)?.value?.trim() || '';
        const supportContent = document.querySelector(`input[data-user-id="${u.id}"][data-field="support_content"]`)?.value?.trim() || '';
        const userCondition = document.querySelector(`input[data-user-id="${u.id}"][data-field="user_condition"]`)?.value?.trim() || '';
        const attendanceInfo = document.querySelector(`input[data-user-id="${u.id}"][data-field="attendance_info"]`)?.value?.trim() || '';
        userEntries.push({
          user_id: u.id,
          user_name: u.name,
          work_content: workContent,
          support_content: supportContent,
          user_condition: userCondition,
          attendance_info: attendanceInfo
        });
      });

      const data = {
        date: this.currentAttendance.date,
        work_report: JSON.stringify({ free_text: '', entries: userEntries }),
        communication: communication
      };

      const response = await this.app.apiCall(API_ENDPOINTS.REPORTS.DAILY_REPORT_SUBMIT, {
        method: 'POST',
        body: JSON.stringify(data)
      });

      if (response.success) {
        this.app.showNotification('サービス提供記録を提出しました', 'success');
        const container = document.getElementById('staffReportSection');
        if (container) await this.loadReportForm(container, this.currentAttendance);
      } else {
        throw new Error(response.error || 'サービス提供記録の提出に失敗しました');
      }

    } catch (error) {
      console.error('サービス提供記録提出エラー:', error);
      this.app.showNotification(error.message, 'danger');
      if (error.message && error.message.includes('既に記録済み')) {
        const container = document.getElementById('staffReportSection');
        if (container) await this.loadReportForm(container, this.currentAttendance);
      }
    }
  }
}
