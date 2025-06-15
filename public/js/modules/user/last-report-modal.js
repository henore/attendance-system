// modules/user/last-report-modal.js
// 前回出勤記録確認モーダルの管理

import { formatDate } from '../../utils/date-time.js';
import { modalManager } from '../shared/modal-manager.js';

export class LastReportModal {
  constructor(updateClockInButtonState, showNotification) {
    this.updateClockInButtonState = updateClockInButtonState;
    this.showNotification = showNotification;
    this.modalId = 'lastReportConfirmModal';
  }

  /**
   * モーダルを表示
   * @param {Object} lastReportData 
   * @param {Function} onConfirm 
   */
  show(lastReportData, onConfirm) {
    if (!lastReportData) return;

    const { date, attendance, report, staffComment } = lastReportData;
    const formattedDate = formatDate(date, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });

    const content = this.generateModalContent(formattedDate, attendance, report, staffComment);
    
    // モーダルを作成
    this.createModal(content);
    
    // イベントリスナー設定
    this.setupEventListeners(onConfirm);
    
    // モーダル表示
    const modal = new bootstrap.Modal(document.getElementById(this.modalId));
    modal.show();
    
    // 出勤ボタンを無効化
    this.updateClockInButtonState(true);
  }

  /**
   * モーダルコンテンツを生成
   */
  generateModalContent(formattedDate, attendance, report, staffComment) {
    let html = `
      <div class="alert alert-warning mb-3">
        <i class="fas fa-exclamation-triangle"></i> <strong>前回の出勤記録を確認してください。</strong>
        <br>確認後、本日の出勤が可能になります。
      </div>
      
      <h6><i class="fas fa-calendar"></i> ${formattedDate}の記録</h6>
      
      <!-- 出勤時間 -->
      <div class="row mb-3">
        <div class="col-6 text-center">
          <div class="past-work-time-label">出勤時間</div>
          <div class="past-work-time-value">${attendance.clock_in}</div>
        </div>
        <div class="col-6 text-center">
          <div class="past-work-time-label">退勤時間</div>
          <div class="past-work-time-value">${attendance.clock_out}</div>
        </div>
      </div>
      
      <!-- 日報内容 -->
      <div class="past-form-section">
        <label class="past-form-label">作業内容</label>
        <div class="past-form-textarea" style="max-height: 150px; overflow-y: auto;">
          ${report.work_content}
        </div>
      </div>
      
      <div class="past-form-section">
        <label class="past-form-label">振り返り・感想</label>
        <div class="past-form-textarea" style="max-height: 100px; overflow-y: auto;">
          ${report.reflection}
        </div>
      </div>
    `;
    
    // スタッフコメントがある場合
    if (staffComment) {
      html += `
        <div class="staff-comment-display mt-3">
          <div class="staff-comment-title">
            <i class="fas fa-comment"></i> スタッフからのコメント
          </div>
          <div class="comment-box bg-info text-white">
            ${staffComment.comment}
          </div>
        </div>
      `;
    }
    
    return html;
  }

  /**
   * モーダルを作成
   */
  createModal(content) {
    const modalHTML = `
      <div class="modal fade" id="${this.modalId}" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header bg-warning text-dark">
              <h5 class="modal-title">
                <i class="fas fa-exclamation-triangle"></i> 前回出勤時の記録確認
              </h5>
            </div>
            <div class="modal-body">
              <div id="lastReportModalContent">
                ${content}
              </div>
              <div class="form-check mt-3">
                <input class="form-check-input" type="checkbox" id="confirmLastReportCheck">
                <label class="form-check-label" for="confirmLastReportCheck">
                  <strong><i class="fas fa-check-square"></i> 上記の内容とスタッフコメントを確認しました</strong>
                </label>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-primary" id="confirmLastReportBtn" disabled>
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
    const checkbox = document.getElementById('confirmLastReportCheck');
    const confirmBtn = document.getElementById('confirmLastReportBtn');
    
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
    this.updateClockInButtonState(false);
    
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