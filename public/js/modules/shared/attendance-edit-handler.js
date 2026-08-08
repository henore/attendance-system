// modules/shared/attendance-edit-handler.js
// 出勤記録編集モーダルの共通ハンドラ（attendance-management / monthly-report 共用）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { modalManager } from './modal-manager.js';
import { formatDate } from '../../utils/date-time.js';

export class AttendanceEditHandler {
  constructor(config) {
    this.userRole = config.userRole;
    this.isAdmin = config.userRole === 'admin';
    this.isStaff = config.userRole === 'staff';
    this.prefix = config.idPrefix;
    this.modalId = config.modalId;
    this.notify = config.notify;
    this.confirmDialog = config.confirm;
    this.callApi = config.callApi;
    this.onSaved = config.onSaved;
    this.context = config.context;
  }

  el(suffix) {
    return document.getElementById(this.prefix + suffix);
  }

  registerModal() {
    modalManager.register(this.modalId);
  }

  renderModalHTML() {
    const p = this.prefix;
    const isAttendance = this.context === 'attendance';

    return `
      <div class="modal fade" id="${this.modalId}" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header bg-warning text-dark">
              <h5 class="modal-title">
                <i class="fas fa-edit"></i> 出勤記録編集
                ${this.isStaff ? '<small class="ms-2">（承認後に反映）</small>' : ''}
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form id="${p}Form">
                <input type="hidden" id="${p}RecordId">
                <input type="hidden" id="${p}UserId">
                <input type="hidden" id="${p}UserRole">

                ${isAttendance ? `
                <div class="row mb-3">
                  <div class="col-6">
                    <label for="${p}UserName" class="form-label">ユーザー</label>
                    <input type="text" class="form-control" id="${p}UserName" readonly>
                  </div>
                  <div class="col-6">
                    <label for="${p}Date" class="form-label">日付</label>
                    <input type="date" class="form-control" id="${p}Date" readonly>
                  </div>
                </div>
                ` : `
                <input type="hidden" id="${p}Date">
                <div class="mb-3">
                  <label class="form-label">対象日</label>
                  <input type="text" class="form-control" id="${p}DateDisplay" readonly>
                </div>
                `}

                <div class="row mb-3">
                  <div class="col-6">
                    <label for="${p}ClockIn" class="form-label">出勤時間</label>
                    <input type="time" class="form-control" id="${p}ClockIn">
                  </div>
                  <div class="col-6">
                    <label for="${p}ClockOut" class="form-label">退勤時間</label>
                    <input type="time" class="form-control" id="${p}ClockOut">
                  </div>
                </div>

                <div class="row mb-3">
                  <div class="col-6">
                    <label for="${p}BreakStart" class="form-label">休憩開始${isAttendance ? '時間' : ''}</label>
                    <input type="time" class="form-control" id="${p}BreakStart">
                  </div>
                  <div class="col-6">
                    <label for="${p}BreakEnd" class="form-label">休憩終了${isAttendance ? '時間' : ''}</label>
                    <input type="time" class="form-control" id="${p}BreakEnd">
                  </div>
                </div>

                <div class="row mb-3" id="${p}NakanukeGroup" style="display: none;">
                  <div class="col-6">
                    <label for="${p}NakanukeMinutes" class="form-label">中抜け経過分数</label>
                    <input type="number" class="form-control" id="${p}NakanukeMinutes" min="0" placeholder="0">
                  </div>
                </div>

                <div class="row mb-3">
                  <div class="col-6">
                    <label for="${p}Status" class="form-label">${isAttendance ? 'ステータス' : '状態'}</label>
                    <select class="form-control" id="${p}Status">
                      <option value="normal">正常</option>
                      <option value="late">遅刻</option>
                      <option value="early">早退</option>
                      <option value="absence">欠勤</option>
                      <option value="paid_leave">${isAttendance ? '有給欠勤' : '有給'}</option>
                    </select>
                  </div>
                  ${isAttendance ? `
                  <div class="col-6" id="${p}AbsenceTypeGroup" style="display: none;">
                    <label class="form-label">欠勤種別（スタッフのみ）</label>
                    <div class="btn-group w-100" role="group">
                      <input type="radio" class="btn-check" name="${p}AbsenceType" id="${p}NormalAbsence" value="absence">
                      <label class="btn btn-outline-secondary" for="${p}NormalAbsence">通常欠勤</label>
                      <input type="radio" class="btn-check" name="${p}AbsenceType" id="${p}PaidLeave" value="paid_leave">
                      <label class="btn btn-outline-primary" for="${p}PaidLeave">有給欠勤</label>
                    </div>
                  </div>
                  ` : ''}
                </div>

                <div class="mb-3">
                  <label for="${p}Reason" class="form-label">変更理由${this.isStaff ? ' <span class="text-danger">*</span>' : '（任意）'}</label>
                  <textarea class="form-control" id="${p}Reason" rows="3"
                    placeholder="変更理由を入力してください..."${this.isStaff ? ' required' : ''}></textarea>
                </div>

                ${this.isAdmin ? `
                <div class="border-top pt-3 mt-3" id="${p}DeleteSection" style="display: none;">
                  <div class="alert alert-danger">
                    <h6 class="alert-heading"><i class="fas fa-exclamation-triangle"></i> 危険な操作</h6>
                    <p class="mb-2">この出勤記録を完全に削除します。この操作は取り消せません。</p>
                    <button type="button" class="btn btn-danger btn-sm" id="${p}DeleteBtn">
                      <i class="fas fa-trash"></i> この出勤記録を削除する
                    </button>
                  </div>
                </div>
                ` : ''}

                ${this.isStaff ? `
                <div class="border-top pt-3 mt-3" id="${p}DeleteRequestSection" style="display: none;">
                  <div class="alert alert-warning">
                    <h6 class="alert-heading"><i class="fas fa-trash-alt"></i> 記録削除要望</h6>
                    <p class="mb-2">この出勤記録の削除を管理者に要望します。承認後に削除されます。</p>
                    <div class="mb-2">
                      <textarea class="form-control" id="${p}DeleteRequestReason" rows="2"
                        placeholder="削除理由を入力してください..." required></textarea>
                    </div>
                    <button type="button" class="btn btn-danger btn-sm" id="${p}DeleteRequestBtn">
                      <i class="fas fa-paper-plane"></i> 削除要望を送信
                    </button>
                  </div>
                </div>
                ` : ''}
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                <i class="fas fa-times"></i> キャンセル
              </button>
              <button type="button" class="btn btn-warning" id="${p}SaveBtn">
                <i class="fas fa-save"></i> 変更保存
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  setupEventListeners() {
    if (this.context === 'attendance') {
      this.el('Status')?.addEventListener('change', () => this.toggleAbsenceTypeField());
    }

    this.el('SaveBtn')?.addEventListener('click', () => this.saveAttendanceEdit());

    if (this.isAdmin) {
      this.el('DeleteBtn')?.addEventListener('click', () => this.deleteAttendance());
    }

    if (this.isStaff) {
      this.el('DeleteRequestBtn')?.addEventListener('click', () => this.requestDeleteAttendance());
    }
  }

  toggleAbsenceTypeField() {
    if (this.context !== 'attendance') return;

    const statusSelect = this.el('Status');
    const absenceTypeGroup = this.el('AbsenceTypeGroup');
    const userRole = this.el('UserRole').value;

    if (userRole === 'staff' && (statusSelect.value === 'absence' || statusSelect.value === 'paid_leave')) {
      absenceTypeGroup.style.display = 'block';
      if (statusSelect.value === 'absence') {
        this.el('NormalAbsence').checked = true;
      } else if (statusSelect.value === 'paid_leave') {
        this.el('PaidLeave').checked = true;
      }
    } else {
      absenceTypeGroup.style.display = 'none';
    }
  }

  editAttendance(data) {
    this.el('RecordId').value = data.recordId || '';
    this.el('UserId').value = data.userId;
    this.el('UserRole').value = data.userRole || '';

    if (this.context === 'attendance') {
      this.el('UserName').value = data.userName;
      this.el('Date').value = data.date;
    } else {
      this.el('Date').value = data.date;
      const dateDisplay = this.el('DateDisplay');
      if (dateDisplay) {
        dateDisplay.value = formatDate(data.date, {
          year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
        });
      }
    }

    this.el('ClockIn').value = data.clockIn || '';
    this.el('ClockOut').value = data.clockOut || '';
    this.el('BreakStart').value = data.breakStart || '';
    this.el('BreakEnd').value = data.breakEnd || '';
    this.el('Status').value = data.status || 'normal';
    this.el('Reason').value = '';

    // 中抜けフィールド
    const nakanukeGroup = this.el('NakanukeGroup');
    const nakanukeInput = this.el('NakanukeMinutes');
    if (nakanukeGroup && nakanukeInput) {
      if (data.userRole === 'staff') {
        nakanukeGroup.style.display = 'flex';
        nakanukeInput.value = data.nakanukeMinutes || 0;
      } else {
        nakanukeGroup.style.display = 'none';
        nakanukeInput.value = 0;
      }
    }

    // 削除セクション（管理者のみ）
    const deleteSection = this.el('DeleteSection');
    if (deleteSection) {
      deleteSection.style.display = (this.isAdmin && data.recordId) ? 'block' : 'none';
    }

    // 削除要望セクション（スタッフのみ）
    const deleteRequestSection = this.el('DeleteRequestSection');
    if (deleteRequestSection) {
      deleteRequestSection.style.display = (this.isStaff && data.recordId) ? 'block' : 'none';
      const reasonField = this.el('DeleteRequestReason');
      if (reasonField) reasonField.value = '';
    }

    // 欠勤種別（出勤記録管理コンテキストのみ）
    if (this.context === 'attendance') {
      const absenceTypeGroup = this.el('AbsenceTypeGroup');
      if (data.userRole === 'staff') {
        absenceTypeGroup.style.display = 'block';
        this.toggleAbsenceTypeField();
      } else {
        absenceTypeGroup.style.display = 'none';
      }
    }

    modalManager.show(this.modalId);
  }

  async saveAttendanceEdit() {
    try {
      const recordId = this.el('RecordId').value;
      const clockIn = this.el('ClockIn').value;
      const clockOut = this.el('ClockOut').value;
      const breakStart = this.el('BreakStart').value;
      const breakEnd = this.el('BreakEnd').value;
      const status = this.el('Status').value;
      const reason = this.el('Reason').value;

      // 欠勤種別の確認（attendance コンテキスト + 対象がスタッフの場合）
      let finalStatus = status;
      if (this.context === 'attendance') {
        const userRole = this.el('UserRole').value;
        if (userRole === 'staff') {
          const normalAbsence = this.el('NormalAbsence');
          const paidLeave = this.el('PaidLeave');
          if (normalAbsence?.checked) finalStatus = 'absence';
          else if (paidLeave?.checked) finalStatus = 'paid_leave';
        }
      }

      if (this.isStaff && !reason.trim()) {
        this.notify('変更理由を入力してください', 'warning');
        return;
      }

      const nakanukeInput = this.el('NakanukeMinutes');
      const nakanukeMinutes = nakanukeInput ? parseInt(nakanukeInput.value) || 0 : undefined;

      const requestData = {
        recordId: recordId || null,
        userId: this.el('UserId').value,
        date: this.el('Date').value,
        newClockIn: clockIn,
        newClockOut: clockOut,
        newBreakStart: breakStart,
        newBreakEnd: breakEnd,
        nakanukeMinutes: nakanukeMinutes,
        status: finalStatus,
        reason: reason
      };

      const endpoint = this.isAdmin
        ? API_ENDPOINTS.ADMIN.ATTENDANCE_CORRECT
        : API_ENDPOINTS.STAFF.ATTENDANCE_CORRECT;

      await this.callApi(endpoint, {
        method: 'POST',
        body: JSON.stringify(requestData)
      });

      const message = this.isStaff
        ? '訂正申請を送信しました（管理者の承認後に反映されます）'
        : '出勤記録を更新しました';
      this.notify(message, 'success');
      modalManager.hide(this.modalId);
      await this.onSaved();

    } catch (error) {
      console.error('出勤記録更新エラー:', error);
      this.notify(error.message || '出勤記録の更新に失敗しました', 'danger');
    }
  }

  async deleteAttendance() {
    if (!this.isAdmin) return;

    try {
      const recordId = this.el('RecordId').value;

      if (!recordId) {
        this.notify('削除する記録が選択されていません', 'warning');
        return;
      }

      let displayName;
      if (this.context === 'attendance') {
        const userName = this.el('UserName').value;
        const date = this.el('Date').value;
        displayName = `${userName}さんの${date}`;
      } else {
        displayName = this.el('DateDisplay').value;
      }

      const confirmed = await this.confirmDialog({
        title: '出勤記録の削除確認',
        message: `${displayName}の出勤記録を完全に削除します。\n\nこの操作は取り消せません。本当に削除しますか？`,
        confirmText: '削除する',
        confirmClass: 'btn-danger',
        cancelText: 'キャンセル'
      });

      if (!confirmed) return;

      const response = await this.callApi(
        `/api/admin/attendance/${recordId}`,
        { method: 'DELETE', body: JSON.stringify({}) }
      );

      this.notify(response.message, 'success');
      modalManager.hide(this.modalId);
      await this.onSaved();

    } catch (error) {
      console.error('出勤記録削除エラー:', error);
      this.notify(error.message || '出勤記録の削除に失敗しました', 'danger');
    }
  }

  async requestDeleteAttendance() {
    if (!this.isStaff) return;

    try {
      const recordId = this.el('RecordId').value;
      const reason = this.el('DeleteRequestReason').value;

      if (!recordId) {
        this.notify('削除する記録が選択されていません', 'warning');
        return;
      }

      if (!reason || !reason.trim()) {
        this.notify('削除理由を入力してください', 'warning');
        return;
      }

      await this.callApi('/api/staff/attendance/delete-request', {
        method: 'POST',
        body: JSON.stringify({ recordId, reason: reason.trim() })
      });

      this.notify('削除要望を送信しました（管理者の承認待ち）', 'success');
      modalManager.hide(this.modalId);
      await this.onSaved();

    } catch (error) {
      console.error('削除要望エラー:', error);
      this.notify(error.message || '削除要望の送信に失敗しました', 'danger');
    }
  }
}
