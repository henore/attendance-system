// modules/staff/comment.js
// スタッフのコメント機能ハンドラー

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { MESSAGES } from '../../constants/labels.js';
import { formatDate } from '../../utils/date-time.js';
import { formatAppetite, formatSleepQuality, formatInterviewRequest, formatMedicationTime, formatTemperature } from '../../utils/formatter.js';
import { modalManager } from '../shared/modal-manager.js';

export class StaffCommentHandler {
  constructor(apiCall, showNotification, currentUser) {
    this.apiCall = apiCall;
    this.showNotification = showNotification;
    this.currentUser = currentUser;
    this.commentLocks = new Map();
    this.onSave = null; // 保存後のコールバック
  }

  /**
   * コメントモーダルを開く
   */
  async openModal(userId, userName) {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const response = await this.apiCall(API_ENDPOINTS.STAFF.REPORT(userId, today));
      
      if (!response.report) {
        this.showNotification('この利用者の日報がまだ提出されていません', 'warning');
        return;
      }

      // コメント記入のバッティング回避チェック
      if (this.isCommentLocked(userId)) {
        const lockInfo = this.commentLocks.get(userId);
        this.showNotification(
          `他のスタッフ（${lockInfo.staffName}）がコメントを編集中です`, 
          'warning'
        );
        return;
      }

      // コメントロックを設定
      this.setCommentLock(userId);

      // モーダルの内容を生成
      const modalContent = this.generateModalContent(response);
      
      // モーダルを作成
      const modalId = modalManager.create({
        id: 'staffCommentInputModal',
        title: `<i class="fas fa-comment-plus"></i> ${userName}さんの日報にコメント記入`,
        content: modalContent,
        size: 'modal-lg',
        headerClass: 'bg-info text-white',
        saveButton: true,
        saveButtonText: '保存',
        saveButtonClass: 'btn-primary',
        onSave: () => this.saveComment(userId, userName)
      });

      // モーダル表示
      modalManager.show(modalId);

      // モーダル閉じた時のクリーンアップ
      const modal = document.getElementById(modalId);
      modal.addEventListener('hidden.bs.modal', () => {
        this.removeCommentLock(userId);
      }, { once: true });

      // 文字数カウント設定
      this.setupCharacterCount();

    } catch (error) {
      console.error('コメントモーダル表示エラー:', error);
    }
  }

  /**
   * モーダルコンテンツを生成
   */
  generateModalContent(data) {
    const { user, attendance, report, comment } = data;
    
    // 既存コメントの編集権限チェック
    const canEdit = !comment || comment.staff_id === this.currentUser.id;
    
    const editWarning = !canEdit ? 
      `<div class="alert alert-warning">
        <i class="fas fa-lock"></i> このコメントは他のスタッフが記入したため、編集できません。
      </div>` : '';

    return `
      <!-- 日報内容表示（読み取り専用） -->
      <div class="report-summary mb-4">
        ${this.generateReportSummary(user, attendance, report)}
      </div>

      <hr>

      <!-- スタッフコメント記入欄 -->
      <div class="staff-comment-section">
        <h6><i class="fas fa-comment-plus"></i> スタッフコメント</h6>
        ${editWarning}
        
        <div class="mb-3">
          <textarea class="form-control" id="staffCommentInputText" rows="4" 
                    placeholder="利用者への返信、アドバイス、気づいた点などを記入してください..."
                    ${!canEdit ? 'readonly' : ''}
                    maxlength="500">${comment ? comment.comment : ''}</textarea>
          <div class="comment-char-count">
            <small class="text-muted">
              <span id="commentInputCharCount">${comment ? comment.comment.length : 0}</span>/500文字
            </small>
          </div>
        </div>

        ${comment ? `
          <div class="existing-comment-info">
            <small class="text-muted">
              <i class="fas fa-info-circle"></i> 
              記入日時: ${new Date(comment.created_at).toLocaleString('ja-JP')}
            </small>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * 日報サマリーを生成
   */
  generateReportSummary(user, attendance, report, breakRecord = null) {
    return `
      <h6><i class="fas fa-file-alt"></i> ${user.name}さんの日報内容</h6>
      
      <!-- 勤務時間表示 -->
      <div class="row mb-3">
        <div class="col-4">
          <label class="past-form-label"><i class="fas fa-clock"></i> 出勤時間</label>
          <div class="past-form-value">${attendance ? attendance.clock_in : '-'}</div>
        </div>
        <div class="col-4">
          <label class="past-form-label"><i class="fas fa-coffee"></i> 休憩時間</label>
          <div class="past-form-value">
            ${breakRecord && breakRecord.start_time ? 
              `${breakRecord.start_time}〜${breakRecord.end_time || ''}` : 
              '-'}
          </div>
        </div>
        <div class="col-4">
          <label class="past-form-label"><i class="fas fa-clock"></i> 退勤時間</label>
          <div class="past-form-value">${attendance ? attendance.clock_out : '-'}</div>
        </div>
      </div>

      <!-- 作業内容 -->
      <div class="mb-3">
        <label class="past-form-label"><i class="fas fa-tasks"></i> 作業内容</label>
        <div class="text-content">${report.work_content || ''}</div>
      </div>

      <!-- 健康状態 -->
      <div class="row mb-3">
        <div class="col-4">
          <label class="past-form-label"><i class="fas fa-thermometer-half"></i> 体温</label>
          <div class="past-form-value">${formatTemperature(report.temperature)}</div>
        </div>
        <div class="col-4">
          <label class="past-form-label"><i class="fas fa-utensils"></i> 食欲</label>
          <div class="past-form-value">${formatAppetite(report.appetite)}</div>
        </div>
        <div class="col-4">
          <label class="past-form-label"><i class="fas fa-pills"></i> 頓服服用</label>
          <div class="past-form-value">${formatMedicationTime(report.medication_time)}</div>
        </div>
      </div>

      <!-- 睡眠情報 -->
      <div class="row mb-3">
        <div class="col-4">
          <label class="past-form-label"><i class="fas fa-bed"></i> 就寝時間</label>
          <div class="past-form-value">${report.bedtime || '-'}</div>
        </div>
        <div class="col-4">
          <label class="past-form-label"><i class="fas fa-sun"></i> 起床時間</label>
          <div class="past-form-value">${report.wakeup_time || '-'}</div>
        </div>
        <div class="col-4">
          <label class="past-form-label"><i class="fas fa-moon"></i> 睡眠状態</label>
          <div class="past-form-value">${formatSleepQuality(report.sleep_quality)}</div>
        </div>
      </div>

      <!-- 振り返り -->
      <div class="mb-3">
        <label class="past-form-label"><i class="fas fa-lightbulb"></i> 振り返り・感想</label>
        <div class="text-content">${report.reflection || ''}</div>
      </div>

      <!-- 面談希望 -->
      ${report.interview_request ? `
        <div class="mb-3">
          <label class="past-form-label"><i class="fas fa-comments"></i> 面談希望</label>
          <div class="past-form-value text-info">${formatInterviewRequest(report.interview_request)}</div>
        </div>
      ` : ''}
    `;
  }

 /**
   * コメントを保存
   */
  async saveComment(userId, userName) {
    try {
      const textarea = document.getElementById('staffCommentInputText');
      const comment = textarea ? textarea.value.trim() : '';
      
      if (!comment) {
        this.showNotification(MESSAGES.REPORT.COMMENT_REQUIRED, 'warning');
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      
      await this.apiCall(API_ENDPOINTS.STAFF.COMMENT, {
        method: 'POST',
        body: JSON.stringify({
          userId: userId,
          date: today,
          comment: comment
        })
      });

      this.showNotification(`${userName}さんの日報にコメントを記入しました`, 'success');

      // モーダルを閉じる
      if (this.currentModalId) {
        modalManager.hide(this.currentModalId);
      }
      
      // currentCommentDataをクリア（重要）
      this.currentCommentData = null;
      
      // コールバック実行
      if (this.onSave) {
        await this.onSave();
      }

    } catch (error) {
      console.error('スタッフコメント保存エラー:', error);
      this.showNotification('コメントの保存に失敗しました', 'danger');
    }
  }

  /**
   * 文字数カウントを設定
   */
  setupCharacterCount() {
    const textarea = document.getElementById('staffCommentInputText');
    const charCount = document.getElementById('commentInputCharCount');
    
    if (textarea && charCount) {
      textarea.addEventListener('input', () => {
        charCount.textContent = textarea.value.length;
      });
    }
  }

  /**
   * 日報詳細を表示
   */
  async showReportDetail(userId, userName, date) {
    try {
      const response = await this.apiCall(API_ENDPOINTS.STAFF.REPORT(userId, date));
      
      if (!response.report) {
        this.showNotification('この日の日報はありません', 'info');
        return;
      }

      const formattedDate = formatDate(date, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      });
      
      const content = this.generateReportDetailContent(response);

      modalManager.create({
        id: 'dailyReportDetailModal',
        title: `<i class="fas fa-file-alt"></i> ${userName}さんの日報詳細 - ${formattedDate}`,
        content: content,
        size: 'modal-lg',
        headerClass: 'bg-primary text-white',
        saveButton: false
      });

      modalManager.show('dailyReportDetailModal');

    } catch (error) {
      console.error('日報詳細取得エラー:', error);
      this.showNotification('日報の取得に失敗しました', 'danger');
    }
  }

  /**
   * 日報詳細コンテンツを生成
   */
  generateReportDetailContent(data) {
    const { user, attendance, report, comment } = data;
    
    return `
      <!-- 出勤情報 -->
      <div class="row mb-3">
        <div class="col-6">
          <div class="detail-section">
            <h6><i class="fas fa-clock text-success"></i> 出勤時間</h6>
            <div class="detail-value h4 text-success">${attendance ? attendance.clock_in : '-'}</div>
          </div>
        </div>
        <div class="col-6">
          <div class="detail-section">
            <h6><i class="fas fa-clock text-info"></i> 退勤時間</h6>
            <div class="detail-value h4 ${attendance && attendance.clock_out ? 'text-info' : 'text-muted'}">${attendance ? (attendance.clock_out || '未退勤') : '-'}</div>
          </div>
        </div>
      </div>

      <hr>

      <!-- 日報内容 -->
      <div class="report-summary">
        ${this.generateReportSummary(user, attendance, report)}
      </div>

      <!-- スタッフコメント -->
      ${comment && comment.comment ? `
        <hr>
        <div class="staff-comment-display">
          <h6><i class="fas fa-comment"></i> スタッフコメント</h6>
          <div class="comment-box bg-light p-3">
            ${comment.comment}
          </div>
          <small class="text-muted">
            <i class="fas fa-user"></i> 記入者: スタッフ | 
            <i class="fas fa-clock"></i> 記入日時: ${new Date(comment.created_at).toLocaleString('ja-JP')}
          </small>
        </div>
      ` : `
        <hr>
        <div class="alert alert-warning">
          <i class="fas fa-exclamation-triangle"></i> スタッフコメントはまだ記入されていません
        </div>
      `}
    `;
  }

  /**
   * 未コメントの日報を取得
   */
  async getUncommentedReports() {
    try {
      const response = await this.apiCall(API_ENDPOINTS.STAFF.USERS);
      return response.users.filter(user => 
        user.report_id && !user.comment_id
      );
    } catch (error) {
      console.error('未コメント日報チェックエラー:', error);
      return [];
    }
  }

  /**
   * コメントロック管理
   */
  isCommentLocked(userId) {
    const lock = this.commentLocks.get(userId);
    if (!lock) return false;
    
    // 自分のロックは除外
    if (lock.staffId === this.currentUser.id) return false;
    
    // 5分経過したロックは自動解除
    const fiveMinutes = 5 * 60 * 1000;
    if (Date.now() - lock.timestamp > fiveMinutes) {
      this.commentLocks.delete(userId);
      return false;
    }
    
    return true;
  }

  setCommentLock(userId) {
    this.commentLocks.set(userId, {
      staffId: this.currentUser.id,
      staffName: this.currentUser.name,
      timestamp: Date.now()
    });
  }

  removeCommentLock(userId) {
    const lock = this.commentLocks.get(userId);
    if (lock && lock.staffId === this.currentUser.id) {
      this.commentLocks.delete(userId);
    }
  }

  /**
   * コメントロックをクリア
   */
  clearCommentLocks() {
    this.commentLocks.clear();
  }
}