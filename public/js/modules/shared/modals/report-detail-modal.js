// public/js/modules/shared/modals/report-detail-modal.js
// 日報詳細表示とコメント編集機能の統合モーダル（LINE送信機能付き）

import { API_ENDPOINTS } from '../../../constants/api-endpoints.js';
import { modalManager } from '../modal-manager.js';
import { formatDate, formatDateTime } from '../../../utils/date-time.js';
import { LineReportSender } from '../line-report-sender.js';
import { generateDetailContent, generateCertificateExpiryWarning, escapeAttr } from './report-detail-content.js';

export class ReportDetailModal {
  constructor(app, parentModule, options = {}) {
    this.app = app;
    this.parent = parentModule;
    this.modalId = options.modalId || 'unifiedReportDetailModal';
    this.currentData = null;

    // ユーザー権限
    this.userRole = app.currentUser.role;
    const isStaffOrAdmin = this.userRole === 'staff' || this.userRole === 'admin';
    this.canComment = options.canComment !== undefined ? options.canComment : isStaffOrAdmin;
    this.canExportPdf = isStaffOrAdmin;

    // 排他制御用
    this.originalComment = null;
    this.isEditing = false;
    this.lastCheckTime = null;
    this.checkInterval = null;

    // LINE送信機能を追加
    this.lineSender = new LineReportSender(app);
  }

  /**
   * モーダルHTMLを生成して親要素に追加
   */
  init(containerElement) {
    const modalHTML = this.generateModalHTML();
    
    // 既存のモーダルがあれば削除
    const existing = document.getElementById(this.modalId);
    if (existing) existing.remove();
    
    // モーダルを追加
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    containerElement.appendChild(modalContainer.firstElementChild);
    
    // モーダルを登録
    modalManager.register(this.modalId);
    
    // イベントリスナー設定
    this.setupEventListeners();
  }

  /**
   * モーダルHTML生成
   */
  generateModalHTML() {
    return `
      <div class="modal fade" id="${this.modalId}" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header bg-primary text-white">
              <h5 class="modal-title" id="${this.modalId}Title">
                <i class="fas fa-file-alt"></i> 詳細
              </h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" id="${this.modalId}Content">
              <!-- コンテンツは動的に生成 -->
            </div>
            <div class="modal-footer">
              ${this.canComment ? `
                <button type="button" class="btn btn-primary" id="${this.modalId}SaveCommentBtn" style="display: none;">
                  <i class="fas fa-save"></i> コメントを保存
                </button>
                <button type="button" class="btn btn-success" id="${this.modalId}SaveAndSendBtn" style="display: none;">
                  <i class="fas fa-file-pdf"></i> 保存してPDF出力
                </button>
              ` : ''}
              ${!this.canComment && this.canExportPdf ? `
                <button type="button" class="btn btn-success" id="${this.modalId}PdfOnlyBtn">
                  <i class="fas fa-file-pdf"></i> PDF出力
                </button>
              ` : ''}
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                <i class="fas fa-times"></i> 閉じる
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * イベントリスナー設定
   */
  setupEventListeners() {
    // コメント保存ボタン
    if (this.canComment) {
      const saveBtn = document.getElementById(`${this.modalId}SaveCommentBtn`);
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          this.saveComment(false);
        });
      }
      
      // PDF付き保存ボタン
      const saveAndSendBtn = document.getElementById(`${this.modalId}SaveAndSendBtn`);
      if (saveAndSendBtn) {
        saveAndSendBtn.addEventListener('click', () => {
          this.saveComment(true);
        });
      }
    }

    // PDF出力のみボタン（コメント無効時）
    if (!this.canComment && this.canExportPdf) {
      const pdfOnlyBtn = document.getElementById(`${this.modalId}PdfOnlyBtn`);
      if (pdfOnlyBtn) {
        pdfOnlyBtn.addEventListener('click', () => {
          this.exportPdfOnly();
        });
      }
    }
    
    // 管理者の場合は編集ボタンを削除（直接編集可能）
    
    // モーダル内のイベント委譲
    const modalContent = document.getElementById(`${this.modalId}Content`);
    if (modalContent) {
      modalContent.addEventListener('input', (e) => {
        if (e.target.id === 'staffCommentTextarea') {
          this.handleCommentInput(e.target);
        }
      });
      
      // 編集開始の検知
      modalContent.addEventListener('focus', (e) => {
        if (e.target.id === 'staffCommentTextarea') {
          this.startEditing();
        }
      }, true);
      
      // 編集終了の検知
      modalContent.addEventListener('blur', (e) => {
        if (e.target.id === 'staffCommentTextarea') {
          this.endEditing();
        }
      }, true);
    }
    
    // モーダルが閉じられる直前の処理
    const modal = document.getElementById(this.modalId);
    if (modal) {
      
      modal.addEventListener('hidden.bs.modal', () => {
        this.stopCommentCheck();
        this.isEditing = false;
        // モーダルが閉じられたらcurrentDataをリセット
        this.currentData = null;
      });
    }
  }

  /**
   * 日報詳細を表示
   */
  async show(userId, userName, date) {
    try {

      // パラメータ検証
      if (!userId || !date) {
        console.error('[日報詳細] 必須パラメータが不足:', { userId, userName, date });
        this.app.showNotification('表示に必要な情報が不足しています', 'warning');
        return;
      }

      // データ一括取得
      const response = await this.app.apiCall(
        API_ENDPOINTS.REPORTS.REPORT(userId, date)
      );

      // user日報とstaff日報のどちらもない場合
      if (!response.report && !response.staffReport) {
        this.app.showNotification('この日の日報はありません', 'info');
        return;
      }

      // 現在のデータを保存
      this.currentData = {
        userId: userId,
        userName: userName || 'ユーザー',
        date: date,
        user: response.user || {},
        attendance: response.attendance || null,
        report: response.report || {},
        comment: response.comment || null,
        breakRecord: response.breakRecord || null,
        staffReport: response.staffReport || null,
        serviceEntry: response.serviceEntry || null,
        serviceEntryTaken: response.serviceEntryTaken || null,
        serviceEntryTakenEntry: response.serviceEntryTakenEntry || null,
        serviceEntryLimitReached: response.serviceEntryLimitReached || false
      };

      // コメントのタイムスタンプを保存（競合検知用）
      this.originalComment = response.comment ? {
        comment: response.comment.comment,
        updated_at: response.comment.updated_at || response.comment.created_at
      } : null;


      // モーダルコンテンツを更新
      this.updateModalContent();

      // モーダル表示
      modalManager.show(this.modalId);

      // コメントの定期チェック開始
      if (this.canComment && this.userRole === 'staff') {
        this.startCommentCheck();
      }

    } catch (error) {
      console.error('日報詳細取得エラー:', error);
      this.app.showNotification('日報の取得に失敗しました', 'danger');

      // エラー時はcurrentDataをリセット
      this.currentData = null;
    }
  }

  /**
   * 編集開始
   */
  startEditing() {
    this.isEditing = true;
    
    // 編集中の表示を追加
    const editingIndicator = document.getElementById('editingIndicator');
    if (!editingIndicator) {
      const textarea = document.getElementById('staffCommentTextarea');
      if (textarea) {
        const indicator = document.createElement('div');
        indicator.id = 'editingIndicator';
        indicator.className = 'text-info small mt-1';
        indicator.innerHTML = '<i class="fas fa-edit"></i> 編集中...';
        textarea.parentElement.appendChild(indicator);
      }
    }
  }

  /**
   * 編集終了
   */
  endEditing() {
    this.isEditing = false;
    
    // 編集中の表示を削除
    const editingIndicator = document.getElementById('editingIndicator');
    if (editingIndicator) {
      editingIndicator.remove();
    }
  }

  /**
   * コメントの定期チェック開始
   */
  startCommentCheck() {
    this.stopCommentCheck();
    
    // 10秒ごとに最新のコメント状態をチェック
    this.checkInterval = setInterval(async () => {
      if (!this.currentData || this.isEditing) return;
      
      try {
        // 最新の日報データを取得
        const response = await this.app.apiCall(
          API_ENDPOINTS.REPORTS.REPORT(this.currentData.userId, this.currentData.date)
        );
        
        if (response && response.comment) {
          const newComment = response.comment;
          
          // コメントが更新されているかチェック
          if (this.hasCommentChanged(newComment)) {
            
            // 警告を表示
            this.showCommentUpdateWarning(newComment);
            
            // データを更新
            this.currentData.comment = newComment;
            this.originalComment = {
              comment: newComment.comment,
              updated_at: newComment.updated_at || newComment.created_at
            };
            
            // UIを更新
            this.updateCommentDisplay(newComment);
          }
        }
        
      } catch (error) {
        console.error('コメントチェックエラー:', error);
      }
    }, 10000); // 10秒ごと
  }

  /**
   * コメントチェックを停止
   */
  stopCommentCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * コメントが変更されたかチェック
   */
  hasCommentChanged(newComment) {
    if (!this.originalComment && newComment) {
      return true;
    }
    
    if (this.originalComment && newComment) {
      return this.originalComment.updated_at !== (newComment.updated_at || newComment.created_at);
    }
    
    return false;
  }

  /**
   * コメント更新の警告表示
   */
  showCommentUpdateWarning(newComment) {
    const warningId = 'commentUpdateWarning';
    let warningDiv = document.getElementById(warningId);
    
    if (!warningDiv) {
      warningDiv = document.createElement('div');
      warningDiv.id = warningId;
      warningDiv.className = 'alert alert-warning alert-dismissible fade show mt-3';
      
      const commentSection = document.querySelector('.staff-comment-section');
      if (commentSection) {
        commentSection.insertBefore(warningDiv, commentSection.firstChild);
      }
    }
    
    warningDiv.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i> 
      <strong>${newComment.staff_name || '他のスタッフ'}さんがコメントを更新しました</strong>
      <br>
      <small>更新時刻: ${formatDateTime(newComment.updated_at || newComment.created_at)}</small>
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
  }

  /**
   * コメント表示を更新
   */
  updateCommentDisplay(comment) {
    // 既存のコメント情報を更新
    const existingCommentInfo = document.querySelector('.existing-comment-info');
    if (existingCommentInfo) {
      existingCommentInfo.innerHTML = `
        <small class="text-muted">
          <i class="fas fa-info-circle"></i> 
          記入者: ${comment.staff_name || 'スタッフ'} | 
          記入日時: ${formatDateTime(comment.created_at)}
          ${comment.updated_at ? ` | 更新: ${formatDateTime(comment.updated_at)}` : ''}
          <span class="text-danger ms-2">
            <i class="fas fa-sync"></i> 更新されました
          </span>
        </small>
      `;
    }
    
    // テキストエリアが編集中でなければ内容も更新
    const textarea = document.getElementById('staffCommentTextarea');
    if (textarea && !this.isEditing) {
      // 未保存の変更がある場合は確認
      if (textarea.value.trim() && textarea.value.trim() !== (this.originalComment?.comment || '')) {
        const confirmUpdate = confirm(
          '他のスタッフがコメントを更新しました。\n' +
          'あなたの未保存の変更は失われます。\n' +
          '最新のコメントを読み込みますか？'
        );
        
        if (confirmUpdate) {
          textarea.value = comment.comment || '';
          this.updateCharCount(textarea.value.length);
        }
      } else {
        // 変更がなければそのまま更新
        textarea.value = comment.comment || '';
        this.updateCharCount(textarea.value.length);
      }
    }
  }

  /**
   * モーダルコンテンツを更新
   */
  updateModalContent() {
    if (!this.currentData) {
      console.error('[updateModalContent] currentDataが未設定');
      return;
    }
    
    const { userName, date, user, attendance, report, comment, breakRecord } = this.currentData;
    
    // タイトル更新
    const titleElement = document.getElementById(`${this.modalId}Title`);
    const formattedDate = formatDate(date, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });
    
    titleElement.innerHTML = `
      <i class="fas fa-file-alt"></i> ${userName}さんの日報詳細 - ${formattedDate}
    `;
    
    // コンテンツ更新
    const contentElement = document.getElementById(`${this.modalId}Content`);
    contentElement.innerHTML = generateDetailContent(this.currentData, this.userRole)
      + (user.role === 'user' ? this.generateCommentSection(comment) : '');
    
    // コメント入力エリアの設定
    if (this.canComment) {
      this.setupCommentArea();
    }
    
  }


  /**
   * 受給者証有効期限ポップアップ通知
   */
  showCertificateExpiryPopup() {
    const { user, userName } = this.currentData;
    if (!user || !user.certificate_expiry) return;

    const expiry = new Date(user.certificate_expiry);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expiry.setHours(0, 0, 0, 0);

    const oneMonthLater = new Date(today);
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

    if (expiry <= oneMonthLater && expiry >= today) {
      setTimeout(() => {
        alert(`${userName}さんの受給者証の有効期限が近づいています、更新をお願いして下さい。`);
      }, 500);
    }
  }

  /**
   * コメントセクション生成
   */
  generateCommentSection(comment) {
    // 閲覧のみ（利用者）
    if (!this.canComment) {
      if (comment && comment.comment) {
        const staffName = comment.staff_name || 'スタッフ';
        return `
          <div class="staff-comment-display">
            <h6><i class="fas fa-comment"></i> スタッフコメント</h6>
            <div class="comment-box bg-light p-3">
              ${comment.comment}
            </div>
            <small class="text-muted">
              <i class="fas fa-user"></i> 記入者: ${staffName} | 
              <i class="fas fa-clock"></i> 記入日時: ${formatDateTime(comment.created_at)}
            </small>
          </div>
        `;
      } else {
        return `
          <div class="alert alert-info">
            <i class="fas fa-info-circle"></i> スタッフコメントはまだ記入されていません
          </div>
        `;
      }
    }
    
    // 編集可能（スタッフ・管理者）
    const existingComment = comment ? comment.comment : '';
    const isEditable = !comment || this.userRole === 'admin' || (comment && comment.staff_id === this.app.currentUser.id);

    // サービス提供記録
    const { serviceEntry, serviceEntryTaken, serviceEntryTakenEntry, serviceEntryLimitReached } = this.currentData;
    const hasServiceEntry = serviceEntry && (
      (serviceEntry.work_content && serviceEntry.work_content.trim()) ||
      (serviceEntry.support_content && serviceEntry.support_content.trim()) ||
      (serviceEntry.user_condition && serviceEntry.user_condition.trim()) ||
      (serviceEntry.attendance_info && serviceEntry.attendance_info.trim())
    );
    const serviceEditable = !serviceEntryTaken && !serviceEntryLimitReached || hasServiceEntry || this.userRole === 'admin';

    return `
      <div class="staff-comment-section">
        <h6><i class="fas fa-comment-plus"></i> スタッフコメント</h6>

        ${comment && !isEditable ? `
          <div class="alert alert-warning mb-3">
            <i class="fas fa-lock"></i> 既にコメントが記入されています
          </div>
        ` : ''}

        <div class="mb-3">
          <textarea
            class="form-control"
            id="staffCommentTextarea"
            rows="4"
            placeholder="利用者への返信、アドバイス、気づいた点などを記入してください..."
            maxlength="500"
            ${!isEditable ? 'readonly' : ''}
          >${existingComment}</textarea>
          <div class="comment-char-count">
            <small class="text-muted">
              <span id="commentCharCount">${existingComment.length}</span>/500文字
            </small>
          </div>
        </div>

        ${comment ? `
          <div class="existing-comment-info">
            <small class="text-muted">
              <i class="fas fa-info-circle"></i>
              記入者: ${comment.staff_name || 'スタッフ'} |
              記入日時: ${formatDateTime(comment.created_at)}
              ${comment.updated_at ? ` | 更新: ${formatDateTime(comment.updated_at)}` : ''}
            </small>
          </div>
        ` : ''}

        ${generateCertificateExpiryWarning(this.currentData.user)}

        <hr class="my-3">

        <h6><i class="fas fa-clipboard-list"></i> 本日のサービス提供記録及び業務報告</h6>

        ${serviceEntryTaken && serviceEntryTakenEntry ? `
          <div class="alert alert-info mb-3 py-2">
            <i class="fas fa-user-check"></i> <strong>${serviceEntryTaken}さん</strong>が記録済み
          </div>
          <div class="border rounded p-2 mb-3 bg-light small">
            <div class="row g-2">
              ${serviceEntryTakenEntry.work_content ? `<div class="col-6"><span class="text-muted">作業内容:</span> ${escapeAttr(serviceEntryTakenEntry.work_content)}</div>` : ''}
              ${serviceEntryTakenEntry.support_content ? `<div class="col-6"><span class="text-muted">支援内容:</span> ${escapeAttr(serviceEntryTakenEntry.support_content)}</div>` : ''}
              ${serviceEntryTakenEntry.user_condition ? `<div class="col-6"><span class="text-muted">利用者の様子:</span> ${escapeAttr(serviceEntryTakenEntry.user_condition)}</div>` : ''}
              ${serviceEntryTakenEntry.attendance_info ? `<div class="col-6"><span class="text-muted">勤怠:</span> ${escapeAttr(serviceEntryTakenEntry.attendance_info)}</div>` : ''}
            </div>
          </div>
        ` : serviceEntryTaken ? `
          <div class="alert alert-secondary mb-3 py-2">
            <i class="fas fa-lock"></i> ${serviceEntryTaken}さんが記録済みです
          </div>
        ` : ''}

        ${serviceEntryLimitReached && !hasServiceEntry ? `
          <div class="alert alert-warning mb-3 py-2">
            <i class="fas fa-exclamation-triangle"></i> 記録上限（6名）に達しています
          </div>
        ` : ''}

        <div class="service-entry-fields ${!serviceEditable ? 'opacity-50' : ''}">
          <div class="row g-2 mb-2">
            <div class="col-6">
              <label class="form-label small mb-1">作業内容</label>
              <input type="text" class="form-control form-control-sm" id="seWorkContent"
                value="${escapeAttr(serviceEntry?.work_content || '')}"
                ${!serviceEditable ? 'readonly' : ''}>
            </div>
            <div class="col-6">
              <label class="form-label small mb-1">支援内容</label>
              <input type="text" class="form-control form-control-sm" id="seSupportContent"
                value="${escapeAttr(serviceEntry?.support_content || '')}"
                ${!serviceEditable ? 'readonly' : ''}>
            </div>
          </div>
          <div class="row g-2 mb-2">
            <div class="col-6">
              <label class="form-label small mb-1">利用者の様子</label>
              <input type="text" class="form-control form-control-sm" id="seUserCondition"
                value="${escapeAttr(serviceEntry?.user_condition || '')}"
                ${!serviceEditable ? 'readonly' : ''}>
            </div>
            <div class="col-6">
              <label class="form-label small mb-1">勤怠</label>
              <input type="text" class="form-control form-control-sm" id="seAttendanceInfo"
                value="${escapeAttr(serviceEntry?.attendance_info || '')}"
                ${!serviceEditable ? 'readonly' : ''}>
            </div>
          </div>
          ${hasServiceEntry ? `
            <div class="text-end">
              <button type="button" class="btn btn-outline-danger btn-sm" id="seDeleteBtn">
                <i class="fas fa-trash-alt"></i> 支援記録削除
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  /**
   * コメントエリアの設定
   */
  setupCommentArea() {
    
    const textarea = document.getElementById('staffCommentTextarea');
    const saveBtn = document.getElementById(`${this.modalId}SaveCommentBtn`);
    const saveAndSendBtn = document.getElementById(`${this.modalId}SaveAndSendBtn`);
    
    if (!textarea || !saveBtn || !saveAndSendBtn) {
      return;
    }
    
    // currentDataの存在確認
    if (!this.currentData) {
      console.error('[setupCommentArea] currentDataが存在しません');
      return;
    }
    
    // 編集可否の判定
    const { comment } = this.currentData;
    const isEditable = !comment || this.userRole === 'admin' || (comment && comment.staff_id === this.app.currentUser.id);


    // ボタンの表示制御
    saveBtn.style.display = isEditable ? 'inline-block' : 'none';
    saveAndSendBtn.style.display = isEditable ? 'inline-block' : 'none';
    
    // 初期文字数カウント
    this.updateCharCount(textarea.value.length);
    
    // 既存のイベントリスナーを削除して新しく設定
    const newSaveBtn = saveBtn.cloneNode(true);
    const newSaveAndSendBtn = saveAndSendBtn.cloneNode(true);
    
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    saveAndSendBtn.parentNode.replaceChild(newSaveAndSendBtn, saveAndSendBtn);
    
    newSaveBtn.addEventListener('click', () => {
      this.saveComment(false);
    });

    newSaveAndSendBtn.addEventListener('click', () => {
      this.saveComment(true);
    });

    // 支援記録削除ボタン
    const deleteBtn = document.getElementById('seDeleteBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (!confirm(`${this.currentData.userName} の支援記録を削除しますか？`)) return;
        try {
          const response = await this.app.apiCall(API_ENDPOINTS.REPORTS.DAILY_REPORT_DELETE_ENTRY, {
            method: 'POST',
            body: JSON.stringify({ date: this.currentData.date, user_id: parseInt(this.currentData.userId) })
          });
          if (response.success) {
            this.app.showNotification('支援記録を削除しました', 'success');
            await this.show(this.currentData.userId, this.currentData.userName, this.currentData.date);
          }
        } catch (error) {
          this.app.showNotification(error.message || '削除に失敗しました', 'danger');
        }
      });
    }
  }

  /**
   * コメント入力ハンドラ
   */
  handleCommentInput(textarea) {
    this.updateCharCount(textarea.value.length);
  }

  /**
   * 文字数カウント更新
   */
  updateCharCount(length) {
    const countElement = document.getElementById('commentCharCount');
    if (countElement) {
      countElement.textContent = length;
    }
  }

  /**
   * コメント保存（画像DL機能付き）
   * @param {boolean} sendToLine - 画像DLするかどうか
   */
  async saveComment(sendToLine = false) {
    
    try {
      const textarea = document.getElementById('staffCommentTextarea');
      const comment = textarea ? textarea.value.trim() : '';
      
      
      if (!comment) {
        this.app.showNotification('コメントを入力してください', 'warning');
        return;
      }
      
      // adminの場合は日報変更も同時に保存
      if (this.userRole === 'admin') {
        await this.saveReportChanges();
      }
      
      // currentDataの存在チェック
      if (!this.currentData) {
        console.error('[コメント保存] currentDataが存在しません');
        this.app.showNotification('データが正しく読み込まれていません。モーダルを閉じて再度開いてください。', 'danger');
        return;
      }
      
      const { userId, userName, date } = this.currentData;
      
      // 必須データの存在チェック
      if (!userId || !date) {
        console.error('[コメント保存] 必須データが不足しています:', { userId, userName, date });
        this.app.showNotification('必要なデータが不足しています', 'danger');
        return;
      }
      
      // 保存前に最新のコメント状態をチェック（競合検知）
      try {
        const latestResponse = await this.app.apiCall(
          API_ENDPOINTS.REPORTS.REPORT(userId, date)
        );
        
        if (latestResponse && latestResponse.comment) {
          const latestComment = latestResponse.comment;
          
          // コメントが他のユーザーによって更新されているかチェック
          if (this.hasCommentChanged(latestComment)) {
            const confirmSave = confirm(
              `警告: ${latestComment.staff_name || '他のスタッフ'}さんが既にコメントを記入しています。\n\n` +
              `記入時刻: ${formatDateTime(latestComment.created_at)}\n` +
              `内容: ${latestComment.comment.substring(0, 50)}${latestComment.comment.length > 50 ? '...' : ''}\n\n` +
              `あなたのコメントで上書きしますか？`
            );
            
            if (!confirmSave) {
              // 最新のコメントを表示
              this.currentData.comment = latestComment;
              this.originalComment = {
                comment: latestComment.comment,
                updated_at: latestComment.updated_at || latestComment.created_at
              };
              this.updateModalContent();
              return;
            }
          }
        }
      } catch (error) {
        console.error('最新状態チェックエラー:', error);
        // エラーがあっても保存は続行
      }
      
      
      // サービス提供記録の保存
      const seWorkContent = document.getElementById('seWorkContent')?.value?.trim() || '';
      const seSupportContent = document.getElementById('seSupportContent')?.value?.trim() || '';
      const seUserCondition = document.getElementById('seUserCondition')?.value?.trim() || '';
      const seAttendanceInfo = document.getElementById('seAttendanceInfo')?.value?.trim() || '';
      const hasServiceData = seWorkContent || seSupportContent || seUserCondition || seAttendanceInfo;

      if (hasServiceData) {
        try {
          const seResponse = await this.app.apiCall(API_ENDPOINTS.REPORTS.DAILY_REPORT_SAVE_ENTRY, {
            method: 'POST',
            body: JSON.stringify({
              date: date, user_id: parseInt(userId), user_name: userName,
              work_content: seWorkContent, support_content: seSupportContent,
              user_condition: seUserCondition, attendance_info: seAttendanceInfo
            })
          });
          if (!seResponse.success) {
            this.app.showNotification(seResponse.error || '支援記録の保存に失敗しました', 'warning');
          }
        } catch (seError) {
          console.error('支援記録保存エラー:', seError);
          this.app.showNotification(seError.message || '支援記録の保存に失敗しました', 'warning');
        }
      }

      // コメントAPI呼び出し
      const saveResponse = await this.app.apiCall(API_ENDPOINTS.REPORTS.COMMENT, {
        method: 'POST',
        body: JSON.stringify({
          userId: userId,
          date: date,
          comment: comment
        })
      });

      // 保存成功後の処理
      if (saveResponse.success !== false) {
        this.app.showNotification(`${userName || 'ユーザー'}さんの日報にコメントを記入しました`, 'success');

        // 受給者証有効期限の通知
        this.showCertificateExpiryPopup();

        // PDF出力処理
        if (sendToLine) {
          try {
            // サービス提供記録（保存時に取得済みの値を再利用、DOMが消えている可能性があるため）
            let serviceEntryForImage = null;
            if (this.currentData.serviceEntryTakenEntry) {
              serviceEntryForImage = {
                ...this.currentData.serviceEntryTakenEntry,
                staff_name: this.currentData.serviceEntryTaken
              };
            }
            if (hasServiceData) {
              serviceEntryForImage = {
                work_content: seWorkContent, support_content: seSupportContent,
                user_condition: seUserCondition, attendance_info: seAttendanceInfo,
                staff_name: this.app.currentUser.name
              };
            }

            await this.lineSender.sendReportCompletion(
              {
                ...this.currentData.report,
                attendance: this.currentData.attendance,
                breakRecord: this.currentData.breakRecord,
                date: this.currentData.date,
                serviceEntry: serviceEntryForImage
              },
              this.currentData.user,
              {
                comment: comment,
                staff_name: this.app.currentUser.name,
                created_at: new Date().toISOString()
              }
            );
          } catch (lineError) {
            console.error('[画像DL] エラー:', lineError);
            this.app.showNotification('PDFの保存に失敗しました', 'warning');
          }
        }
        
        // モーダルを閉じる
        modalManager.hide(this.modalId);
        
        // 親モジュールに通知（画面更新など）
        if (this.parent && this.parent.onCommentSaved) {
          this.parent.onCommentSaved();
        }
      } else {
        // エラー処理
        if (saveResponse.message) {
          this.app.showNotification(saveResponse.message, 'danger');
        }
        
        // 競合が発生した場合は最新データを再取得
        if (saveResponse.conflict) {
          await this.show(userId, userName, date);
        }
      }
      
    } catch (error) {
      console.error('コメント保存エラー:', error);
      
      // エラーメッセージの詳細化
      let errorMessage = 'コメントの保存に失敗しました';
      
      if (error.message && error.message.includes('already exists')) {
        errorMessage = '他のスタッフが既にコメントを記入しています。画面を更新して最新の状態を確認してください。';
      } else if (error.message) {
        errorMessage += ': ' + error.message;
      }
      
      this.app.showNotification(errorMessage, 'danger');
    }
  }

  /**
   * PDF出力のみ（コメント保存なし、月別出勤簿用）
   */
  async exportPdfOnly() {
    try {
      if (!this.currentData) {
        this.app.showNotification('データが読み込まれていません', 'warning');
        return;
      }

      let serviceEntryForImage = null;
      if (this.currentData.serviceEntryTakenEntry) {
        serviceEntryForImage = {
          ...this.currentData.serviceEntryTakenEntry,
          staff_name: this.currentData.serviceEntryTaken
        };
      }

      const commentData = this.currentData.comment ? {
        comment: this.currentData.comment.comment,
        staff_name: this.currentData.comment.staff_name,
        created_at: this.currentData.comment.created_at
      } : null;

      await this.lineSender.sendReportCompletion(
        {
          ...this.currentData.report,
          attendance: this.currentData.attendance,
          breakRecord: this.currentData.breakRecord,
          date: this.currentData.date,
          serviceEntry: serviceEntryForImage
        },
        this.currentData.user,
        commentData
      );
    } catch (error) {
      console.error('PDF出力エラー:', error);
      this.app.showNotification('PDFの出力に失敗しました', 'warning');
    }
  }

  /**
   * フォームデータを収集（admin用）
   */
  getReportFormData() {
    const workContentEl = document.getElementById('editWorkContent');
    const workLocationEl = document.getElementById('editWorkLocation');
    const pcNumberEl = document.getElementById('editPcNumber');
    const externalWorkLocationEl = document.getElementById('editExternalWorkLocation');
    const temperatureEl = document.getElementById('editTemperature');
    const appetiteEl = document.getElementById('editAppetite');
    const medicationTimeEl = document.getElementById('editMedicationTime');
    const bedtimeEl = document.getElementById('editBedtime');
    const wakeupTimeEl = document.getElementById('editWakeupTime');
    const sleepQualityEl = document.getElementById('editSleepQuality');
    const reflectionEl = document.getElementById('editReflection');
    const interviewRequestEl = document.getElementById('editInterviewRequest');
    const contactTime1El = document.getElementById('editContactTime1');
    const contactTime2El = document.getElementById('editContactTime2');

    return {
      workContent: workContentEl?.value.trim() || '',
      workLocation: workLocationEl?.value || '',
      pcNumber: pcNumberEl?.value || null,
      externalWorkLocation: externalWorkLocationEl?.value.trim() || '',
      temperature: temperatureEl?.value ? parseFloat(temperatureEl.value) : null,
      appetite: appetiteEl?.value || 'good',
      medicationTime: medicationTimeEl?.value ? parseInt(medicationTimeEl.value) : null,
      bedtime: bedtimeEl?.value || null,
      wakeupTime: wakeupTimeEl?.value || null,
      sleepQuality: sleepQualityEl?.value || 'good',
      reflection: reflectionEl?.value.trim() || '',
      interviewRequest: interviewRequestEl?.value || null,
      contactTime1: contactTime1El?.value || null,
      contactTime2: contactTime2El?.value || null
    };
  }

  /**
   * 日報変更の保存（admin用）
   */
  async saveReportChanges() {
    try {
      const formData = this.getReportFormData();
      
      if (!formData.workContent) {
        this.app.showNotification('作業内容は必須です', 'warning');
        return;
      }
      
      if (!this.currentData) {
        console.error('[日報編集] currentDataが未設定');
        this.app.showNotification('データが見つかりません', 'danger');
        return;
      }
      
      
      const userId = this.currentData.userId || this.currentData.user?.id;
      
      const response = await this.app.apiCall(API_ENDPOINTS.REPORTS.REPORT_UPDATE(userId, this.currentData.date), {
        method: 'PUT',
        body: JSON.stringify(formData)
      });
      
      if (response.success !== false) {
        this.app.showNotification('日報を更新しました', 'success');
        
        // currentDataを更新
        this.currentData.report = { ...this.currentData.report, ...formData };
        
        // currentDataを更新
        Object.assign(this.currentData.report, formData);
        
        // 親モジュールに通知
        if (this.parent && this.parent.onReportUpdated) {
          this.parent.onReportUpdated();
        }
      } else {
        this.app.showNotification(response.message || '日報の更新に失敗しました', 'danger');
      }
      
    } catch (error) {
      console.error('日報編集保存エラー:', error);
      this.app.showNotification('日報の保存に失敗しました', 'danger');
    }
  }

  /**
   * クリーンアップ
   */
  destroy() {
    this.stopCommentCheck();
    
    const modal = document.getElementById(this.modalId);
    if (modal) {
      modal.remove();
    }
    this.currentData = null;
  }
}