// public/js/modules/shared/modals/report-detail-modal.js
// 日報詳細表示とコメント編集機能の統合モーダル

import { API_ENDPOINTS } from '../../../constants/api-endpoints.js';
import { modalManager } from '../modal-manager.js';
import { formatDate, formatDateTime } from '../../../utils/date-time.js';

export class ReportDetailModal {
  constructor(app, parentModule) {
    this.app = app;
    this.parent = parentModule;
    this.modalId = 'unifiedReportDetailModal';
    this.currentData = null;
    
    // ユーザー権限
    this.userRole = app.currentUser.role;
    this.canComment = this.userRole === 'staff' || this.userRole === 'admin';
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
                <i class="fas fa-file-alt"></i> 日報詳細
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
        saveBtn.addEventListener('click', () => this.saveComment());
      }
    }
    
    // モーダル内のイベント委譲
    const modalContent = document.getElementById(`${this.modalId}Content`);
    if (modalContent) {
      modalContent.addEventListener('input', (e) => {
        if (e.target.id === 'staffCommentTextarea') {
          this.handleCommentInput(e.target);
        }
      });
    }
  }

  /**
   * 日報詳細を表示
   */
  async show(userId, userName, date) {
    try {
      // データ取得
      const response = await this.app.apiCall(
        API_ENDPOINTS.STAFF.REPORT(userId, date)
      );
      
      if (!response.report) {
        this.app.showNotification('この日の日報はありません', 'info');
        return;
      }
      
      // 現在のデータを保存
      this.currentData = {
        userId,
        userName,
        date,
        ...response
      };
      
      // モーダルコンテンツを更新
      this.updateModalContent();
      
      // モーダル表示
      modalManager.show(this.modalId);
      
    } catch (error) {
      console.error('日報詳細取得エラー:', error);
      this.app.showNotification('日報の取得に失敗しました', 'danger');
    }
  }

  /**
   * モーダルコンテンツを更新
   */
  updateModalContent() {
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
    contentElement.innerHTML = this.generateDetailContent();
    
    // コメント入力エリアの設定
    if (this.canComment) {
      this.setupCommentArea();
    }
  }

  /**
   * 詳細コンテンツ生成（monthly-report.jsの表示を維持）
   */
  generateDetailContent() {
    const { user, attendance, report, comment, breakRecord } = this.currentData;
    
    // 休憩時間の表示
    let breakTimeDisplay = '-';
    if (user.role === 'user' && user.service_type !== 'home') {
      if (breakRecord && breakRecord.start_time) {
        breakTimeDisplay = breakRecord.end_time ? 
          `${breakRecord.start_time}〜${breakRecord.end_time} (${breakRecord.duration || 60}分)` : 
          `${breakRecord.start_time}〜 (進行中)`;
      }
    } else if (user.role !== 'user' && attendance) {
      if (attendance.break_start) {
        breakTimeDisplay = attendance.break_end ? 
          `${attendance.break_start}〜${attendance.break_end} (60分)` : 
          `${attendance.break_start}〜 (進行中)`;
      }
    }
    
    return `
      <!-- 出勤情報 -->
      <div class="row mb-3">
        <div class="col-4">
          <div class="detail-section">
            <h6><i class="fas fa-clock text-success"></i> 出勤時間</h6>
            <div class="detail-value h4 text-success">${attendance ? attendance.clock_in : '-'}</div>
          </div>
        </div>
        <div class="col-4">
          <div class="detail-section">
            <h6><i class="fas fa-coffee text-warning"></i> 休憩時間</h6>
            <div class="detail-value">${breakTimeDisplay}</div>
          </div>
        </div>
        <div class="col-4">
          <div class="detail-section">
            <h6><i class="fas fa-clock text-info"></i> 退勤時間</h6>
            <div class="detail-value h4 ${attendance && attendance.clock_out ? 'text-info' : 'text-muted'}">
              ${attendance ? (attendance.clock_out || '未退勤') : '-'}
            </div>
          </div>
        </div>
      </div>

      <hr>

      <!-- 日報内容 -->
      <div class="report-summary">
        <h6><i class="fas fa-file-alt"></i> 日報内容</h6>
        
        <!-- 作業内容 -->
        <div class="mb-3">
          <label class="past-form-label"><i class="fas fa-tasks"></i> 作業内容</label>
          <div class="text-content">${report.work_content || ''}</div>
        </div>

        <!-- 健康状態 -->
        <div class="row mb-3">
          <div class="col-3">
            <label class="past-form-label"><i class="fas fa-thermometer-half"></i> 体温</label>
            <div class="past-form-value">${report.temperature}℃</div>
          </div>
          <div class="col-3">
            <label class="past-form-label"><i class="fas fa-utensils"></i> 食欲</label>
            <div class="past-form-value">${this.getAppetiteLabel(report.appetite)}</div>
          </div>
          <div class="col-3">
            <label class="past-form-label"><i class="fas fa-pills"></i> 頓服服用</label>
            <div class="past-form-value">${report.medication_time ? report.medication_time + '時頃' : 'なし'}</div>
          </div>
          <div class="col-3">
            <label class="past-form-label"><i class="fas fa-bed"></i> 睡眠時間</label>
            <div class="past-form-value">${report.sleep_hours ? report.sleep_hours + '時間' : '-'}</div>
          </div>
        </div>

        <!-- 睡眠情報（詳細） -->
        ${report.bedtime || report.wakeup_time ? `
          <div class="row mb-3">
            <div class="col-4">
              <label class="past-form-label"><i class="fas fa-moon"></i> 就寝時間</label>
              <div class="past-form-value">${report.bedtime || '-'}</div>
            </div>
            <div class="col-4">
              <label class="past-form-label"><i class="fas fa-sun"></i> 起床時間</label>
              <div class="past-form-value">${report.wakeup_time || '-'}</div>
            </div>
            <div class="col-4">
              <label class="past-form-label"><i class="fas fa-bed"></i> 睡眠状態</label>
              <div class="past-form-value">${this.getSleepQualityLabel(report.sleep_quality)}</div>
            </div>
          </div>
        ` : ''}

        <!-- 振り返り -->
        <div class="mb-3">
          <label class="past-form-label"><i class="fas fa-lightbulb"></i> 振り返り・感想</label>
          <div class="text-content">${report.reflection || ''}</div>
        </div>

        <!-- 面談希望 -->
        ${report.interview_request ? `
          <div class="mb-3">
            <label class="past-form-label"><i class="fas fa-comments"></i> 面談希望</label>
            <div class="past-form-value text-info">${this.getInterviewRequestLabel(report.interview_request)}</div>
          </div>
        ` : ''}
      </div>

      <hr>

      <!-- スタッフコメントエリア -->
      ${this.generateCommentSection(comment)}
    `;
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
    const isEditable = !comment || this.userRole === 'admin';
    
    return `
      <div class="staff-comment-section">
        <h6><i class="fas fa-comment-plus"></i> スタッフコメント</h6>
        
        ${comment && !isEditable ? `
          <div class="alert alert-warning mb-3">
            <i class="fas fa-lock"></i> 既にコメントが記入されています（編集は管理者のみ可能）
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
            </small>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * コメントエリアの設定
   */
  setupCommentArea() {
    const textarea = document.getElementById('staffCommentTextarea');
    const saveBtn = document.getElementById(`${this.modalId}SaveCommentBtn`);
    
    if (!textarea || !saveBtn) return;
    
    // 編集可否の判定
    const { comment } = this.currentData;
    const isEditable = !comment || this.userRole === 'admin';
    
    // 保存ボタンの表示制御
    saveBtn.style.display = isEditable ? 'inline-block' : 'none';
    
    // 初期文字数カウント
    this.updateCharCount(textarea.value.length);
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
   * コメント保存
   */
  async saveComment() {
    try {
      const textarea = document.getElementById('staffCommentTextarea');
      const comment = textarea ? textarea.value.trim() : '';
      
      if (!comment) {
        this.app.showNotification('コメントを入力してください', 'warning');
        return;
      }
      
      const { userId, userName, date } = this.currentData;
      
      // API呼び出し
      await this.app.apiCall(API_ENDPOINTS.STAFF.COMMENT, {
        method: 'POST',
        body: JSON.stringify({
          userId: userId,
          date: date,
          comment: comment
        })
      });
      
      this.app.showNotification(`${userName}さんの日報にコメントを記入しました`, 'success');
      
      // モーダルを閉じる
      modalManager.hide(this.modalId);
      
      // 親モジュールに通知（画面更新など）
      if (this.parent.onCommentSaved) {
        this.parent.onCommentSaved();
      }
      
    } catch (error) {
      console.error('コメント保存エラー:', error);
      this.app.showNotification(error.message || 'コメントの保存に失敗しました', 'danger');
    }
  }

  // ヘルパーメソッド
  getAppetiteLabel(value) {
    const labels = {
      'good': '良好',
      'normal': '普通',
      'poor': '不振',
      'none': 'なし'
    };
    return labels[value] || value;
  }

  getSleepQualityLabel(value) {
    const labels = {
      'good': '良好',
      'normal': '普通',
      'poor': '不良'
    };
    return labels[value] || value;
  }

  getInterviewRequestLabel(value) {
    const labels = {
      'required': '必要',
      'not_required': '不要',
      'consultation': '相談がある',
      'interview': '面談希望'
    };
    return labels[value] || value;
  }

  /**
   * クリーンアップ
   */
  destroy() {
    const modal = document.getElementById(this.modalId);
    if (modal) {
      modal.remove();
    }
  }
}