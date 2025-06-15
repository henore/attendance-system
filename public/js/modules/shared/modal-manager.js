// modules/shared/modal-manager.js
// モーダル管理の共通クラス

export class ModalManager {
  constructor() {
    this.modals = new Map();
  }

  /**
   * モーダルを登録
   * @param {string} id モーダルID
   * @param {Object} config 設定
   */
  register(id, config = {}) {
    const modalElement = document.getElementById(id);
    if (!modalElement) {
      console.error(`Modal not found: ${id}`);
      return;
    }

    const modal = new bootstrap.Modal(modalElement, config);
    this.modals.set(id, {
      element: modalElement,
      instance: modal,
      config
    });

    return modal;
  }

  /**
   * モーダルを表示
   * @param {string} id 
   * @param {Object} data モーダルに渡すデータ
   */
  show(id, data = {}) {
    const modalInfo = this.modals.get(id);
    if (!modalInfo) {
      console.error(`Modal not registered: ${id}`);
      return;
    }

    // データがある場合はイベントとして発火
    if (Object.keys(data).length > 0) {
      const event = new CustomEvent('modal-show', { detail: data });
      modalInfo.element.dispatchEvent(event);
    }

    modalInfo.instance.show();
  }

  /**
   * モーダルを非表示
   * @param {string} id 
   */
  hide(id) {
    const modalInfo = this.modals.get(id);
    if (!modalInfo) {
      console.error(`Modal not registered: ${id}`);
      return;
    }

    modalInfo.instance.hide();
  }

  /**
   * モーダルの状態を取得
   * @param {string} id 
   * @returns {boolean}
   */
  isShown(id) {
    const modalInfo = this.modals.get(id);
    if (!modalInfo) return false;

    return modalInfo.element.classList.contains('show');
  }

  /**
   * 動的にモーダルを作成
   * @param {Object} options 
   * @returns {string} モーダルID
   */
  create(options) {
    const {
      id = `modal-${Date.now()}`,
      title = '',
      content = '',
      size = 'modal-lg',
      headerClass = 'bg-primary text-white',
      footer = true,
      closeButton = true,
      saveButton = false,
      saveButtonText = '保存',
      saveButtonClass = 'btn-primary',
      onSave = null
    } = options;

    const modalHTML = `
      <div class="modal fade" id="${id}" tabindex="-1">
        <div class="modal-dialog ${size}">
          <div class="modal-content">
            <div class="modal-header ${headerClass}">
              <h5 class="modal-title">${title}</h5>
              ${closeButton ? '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>' : ''}
            </div>
            <div class="modal-body">
              ${content}
            </div>
            ${footer ? `
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                  <i class="fas fa-times"></i> 閉じる
                </button>
                ${saveButton ? `
                  <button type="button" class="btn ${saveButtonClass}" id="${id}-save-btn">
                    <i class="fas fa-save"></i> ${saveButtonText}
                  </button>
                ` : ''}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    // DOMに追加
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // 登録
    this.register(id);

    // 保存ボタンのイベント設定
    if (saveButton && onSave) {
      const saveBtn = document.getElementById(`${id}-save-btn`);
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          onSave(id);
        });
      }
    }

    return id;
  }

  /**
   * 確認ダイアログを表示
   * @param {Object} options 
   * @returns {Promise<boolean>}
   */
  confirm(options) {
    return new Promise((resolve) => {
      const {
        title = '確認',
        message = '実行してもよろしいですか？',
        confirmText = 'OK',
        cancelText = 'キャンセル',
        confirmClass = 'btn-primary',
        icon = 'fas fa-question-circle'
      } = options;

      const id = this.create({
        title: `<i class="${icon}"></i> ${title}`,
        content: `<p>${message}</p>`,
        size: 'modal-md',
        headerClass: 'bg-warning text-dark',
        footer: false
      });

      // カスタムフッター追加
      const modalContent = document.querySelector(`#${id} .modal-content`);
      const footerHTML = `
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
            <i class="fas fa-times"></i> ${cancelText}
          </button>
          <button type="button" class="btn ${confirmClass}" id="${id}-confirm-btn">
            <i class="fas fa-check"></i> ${confirmText}
          </button>
        </div>
      `;
      modalContent.insertAdjacentHTML('beforeend', footerHTML);

      // イベント設定
      const confirmBtn = document.getElementById(`${id}-confirm-btn`);
      const modalElement = document.getElementById(id);

      confirmBtn.addEventListener('click', () => {
        resolve(true);
        this.hide(id);
      });

      modalElement.addEventListener('hidden.bs.modal', () => {
        resolve(false);
        this.destroy(id);
      });

      this.show(id);
    });
  }

  /**
   * アラートダイアログを表示
   * @param {Object} options 
   */
  alert(options) {
    const {
      title = '通知',
      message = '',
      type = 'info', // success, danger, warning, info
      icon = this.getIconByType(type)
    } = options;

    const headerClass = this.getHeaderClassByType(type);

    const id = this.create({
      title: `<i class="${icon}"></i> ${title}`,
      content: `<p>${message}</p>`,
      size: 'modal-md',
      headerClass,
      footer: true,
      saveButton: false
    });

    const modalElement = document.getElementById(id);
    modalElement.addEventListener('hidden.bs.modal', () => {
      this.destroy(id);
    });

    this.show(id);
  }

  /**
   * タイプに応じたアイコンを取得
   * @private
   */
  getIconByType(type) {
    const icons = {
      success: 'fas fa-check-circle',
      danger: 'fas fa-exclamation-circle',
      warning: 'fas fa-exclamation-triangle',
      info: 'fas fa-info-circle'
    };
    return icons[type] || icons.info;
  }

  /**
   * タイプに応じたヘッダークラスを取得
   * @private
   */
  getHeaderClassByType(type) {
    const classes = {
      success: 'bg-success text-white',
      danger: 'bg-danger text-white',
      warning: 'bg-warning text-dark',
      info: 'bg-info text-white'
    };
    return classes[type] || classes.info;
  }

  /**
   * モーダルを破棄
   * @param {string} id 
   */
  destroy(id) {
    const modalInfo = this.modals.get(id);
    if (!modalInfo) return;

    // インスタンスを破棄
    modalInfo.instance.dispose();

    // DOMから削除
    modalInfo.element.remove();

    // 登録から削除
    this.modals.delete(id);
  }

  /**
   * 全てのモーダルを破棄
   */
  destroyAll() {
    this.modals.forEach((modalInfo, id) => {
      this.destroy(id);
    });
  }
}

// シングルトンインスタンスをエクスポート
export const modalManager = new ModalManager();