// modules/user/confirmation-modal.js
// 出退勤・休憩打刻の確認ダイアログ

/**
 * 確認モーダルクラス
 */
export class ConfirmationModal {
  constructor() {
    this.modalId = 'confirmationModal';
    this.currentResolve = null;
  }

  /**
   * 確認モーダルを表示
   * @param {Object} options - モーダルオプション
   * @param {string} options.title - モーダルタイトル
   * @param {string} options.message - メッセージ本文
   * @param {string} options.time - 打刻時刻
   * @param {string} options.confirmText - 確認ボタンのテキスト（デフォルト: "はい"）
   * @param {string} options.cancelText - キャンセルボタンのテキスト（デフォルト: "いいえ"）
   * @param {string} options.icon - アイコンクラス（デフォルト: "fa-clock"）
   * @returns {Promise<boolean>} - はいを選択した場合true、いいえの場合false
   */
  show(options) {
    return new Promise((resolve) => {
      this.currentResolve = resolve;

      const {
        title = '確認',
        message = '',
        time = '',
        confirmText = 'はい',
        cancelText = 'いいえ',
        icon = 'fa-clock'
      } = options;

      // モーダルHTML生成
      const modalHTML = this.generateModalHTML(title, message, time, confirmText, cancelText, icon);

      // 既存のモーダルを削除
      this.removeExistingModal();

      // モーダルをDOMに追加
      document.body.insertAdjacentHTML('beforeend', modalHTML);

      // イベントリスナー設定
      this.setupEventListeners();

      // モーダル表示
      const modalElement = document.getElementById(this.modalId);
      const modal = new bootstrap.Modal(modalElement, {
        backdrop: 'static',
        keyboard: false
      });
      modal.show();

      // モーダルが閉じられたら要素を削除
      modalElement.addEventListener('hidden.bs.modal', () => {
        modalElement.remove();
      });
    });
  }

  /**
   * モーダルHTMLを生成
   */
  generateModalHTML(title, message, time, confirmText, cancelText, icon) {
    return `
      <div class="modal fade" id="${this.modalId}" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header bg-primary text-white">
              <h5 class="modal-title">
                <i class="fas ${icon}"></i> ${title}
              </h5>
            </div>
            <div class="modal-body text-center">
              ${message ? `<p class="mb-3">${message}</p>` : ''}
              <div class="alert alert-info mb-0">
                <h4 class="mb-0">
                  <i class="fas fa-clock"></i> ${time}
                </h4>
              </div>
            </div>
            <div class="modal-footer justify-content-center">
              <button type="button" class="btn btn-lg btn-success px-5" id="confirmModalYesBtn">
                <i class="fas fa-check"></i> ${confirmText}
              </button>
              <button type="button" class="btn btn-lg btn-secondary px-5" id="confirmModalNoBtn">
                <i class="fas fa-times"></i> ${cancelText}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    const yesBtn = document.getElementById('confirmModalYesBtn');
    const noBtn = document.getElementById('confirmModalNoBtn');

    if (yesBtn) {
      yesBtn.addEventListener('click', () => this.handleConfirm(true));
    }

    if (noBtn) {
      noBtn.addEventListener('click', () => this.handleConfirm(false));
    }
  }

  /**
   * 確認/キャンセル処理
   */
  handleConfirm(result) {
    const modalElement = document.getElementById(this.modalId);
    const modal = bootstrap.Modal.getInstance(modalElement);

    if (modal) {
      modal.hide();
    }

    if (this.currentResolve) {
      this.currentResolve(result);
      this.currentResolve = null;
    }
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
