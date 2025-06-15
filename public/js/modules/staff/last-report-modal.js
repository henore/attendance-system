// modules/staff/last-report-modal.js
// スタッフ用の前回記録確認モーダル管理

import { formatDate } from '../../utils/date-time.js';
import { modalManager } from '../shared/modal-manager.js';

export class StaffLastReportModal {
  constructor(updateClockInButtonState, showNotification) {
    this.updateClockInButtonState = updateClockInButtonState;
    this.showNotification = showNotification;
    this.modalId = 'staffLastReportConfirmModal';
  }

  /**
   * モーダルを表示
   */
  show(lastReportData, onConfirm) {
    if (!lastReportData) return;

    const { date, attendance } = lastReportData;
    const formattedDate = formatDate(date, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });

    const content = this.generateModalContent(formattedDate, attendance);
    
    // モーダルを作成
    this.createModal(content);
    
    // イベントリスナー設定
    this.setupEventListeners(onConfirm);
    
    // モーダル表示
    const modal = new bootstrap.Modal(document.getElementById(this.modalId));
    modal.show();
    
    // 出勤ボタンを無効化
    if (this.updateClockInButtonState) {
      this.updateClockInButtonState(true);
    }
  }

  /**
   * モーダルコンテンツを生成
   */
  generateModalContent(formattedDate, attendance) {
    return `
      <div class="alert alert-info mb-3">
        <i class="fas fa-info-circle"></i> <strong>前回の出勤記録を確認してください。</strong>
        <br>確認後、本日の出勤が可能になります。
      </div>
      
      <h6><i class="fas fa-calendar"></i> ${formattedDate}の記録</h6>
      
      <!-- 出勤時間 -->
      <div class="row mb-3">
        <div class="col-6 text-center">
          <div class="past-work-time-label">出勤時間</div>
          <div class="past-work-time-value">${attendance.clock_in || '-'}</div>
        </div>
        <div class="col-6 text-center">
          <div class="past-work-time-label">退勤時間</div>
          <div class="past-work-time-value">${attendance.clock_out || '-'}</div>
        </div>
      </div>
      
      <!-- スタッフ向けの追加情報 -->
      <div class="alert alert-light">
        <i class="fas fa-user-tie"></i> スタッフとして前回の勤務状況を確認してください。
      </div>
    `;
  }

  /**
   * モーダルを作成
   */
  createModal(content) {
    const modalHTML = `
      <div class="modal fade" id="${this.modalId}" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header bg-info text-white">
              <h5 class="modal-title">
                <i class="fas fa-user-tie"></i> 前回出勤時の記録確認（スタッフ）
              </h5>
            </div>
            <div class="modal-body">
              <div id="staffLastReportModalContent">
                ${content}
              </div>
              <div class="form-check mt-3">
                <input class="form-check-input" type="checkbox" id="confirmStaffLastReportCheck">
                <label class="form-check-label" for="confirmStaffLastReportCheck">
                  <strong><i class="fas fa-check-square"></i> 上記の内容を確認しました</strong>
                </label>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-primary" id="confirmStaffLastReportBtn" disabled>
                <i class="fas fa-check"></i> 確認して閉じる
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // 既存のモーダルがあれば削除
    const existingModal = document.getElementById(this.modalId);
    if (existingModal) {
      existingModal.remove();
    }
    
    // モーダルをDOMに追加
    document.body.insertAdjacentHTML('beforeend', modalHTML);
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners(onConfirm) {
    const checkbox = document.getElementById('confirmStaffLastReportCheck');
    const confirmBtn = document.getElementById('confirmStaffLastReportBtn');
    
    if (checkbox) {
      checkbox.addEventListener('change', (e) => {
        if (confirmBtn) {
          confirmBtn.disabled = !e.target.checked;
        }
      });
    }
    
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        this.handleConfirm(onConfirm);
      });
    }
  }

  /**
   * 確認ボタンクリック時の処理
   */
  handleConfirm(onConfirm) {
    // コールバック実行
    if (onConfirm) {
      onConfirm();
    }
    
    // 出勤ボタンを有効化
    if (this.updateClockInButtonState) {
      this.updateClockInButtonState(false);
    }
    
    // モーダルを閉じる
    const modal = bootstrap.Modal.getInstance(document.getElementById(this.modalId));
    if (modal) {
      modal.hide();
    }
    
    // モーダル削除
    setTimeout(() => {
      const modalElement = document.getElementById(this.modalId);
      if (modalElement) {
        modalElement.remove();
      }
    }, 300);
    
    this.showNotification('前回の記録を確認しました', 'success');
  }
}