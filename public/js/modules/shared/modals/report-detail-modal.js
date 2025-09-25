// public/js/modules/shared/modals/report-detail-modal.js
// 日報詳細表示とコメント編集機能の統合モーダル（LINE送信機能付き）

import { API_ENDPOINTS } from '../../../constants/api-endpoints.js';
import { modalManager } from '../modal-manager.js';
import { formatDate, formatDateTime } from '../../../utils/date-time.js';
import { LineReportSender } from '../line-report-sender.js'; // 新規追加

export class ReportDetailModal {
  constructor(app, parentModule) {
    this.app = app;
    this.parent = parentModule;
    this.modalId = 'unifiedReportDetailModal';
    this.currentData = null;
    
    // ユーザー権限
    this.userRole = app.currentUser.role;
    this.canComment = this.userRole === 'staff' || this.userRole === 'admin';
    
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
                <button type="button" class="btn btn-success" id="${this.modalId}SaveAndSendBtn" style="display: none;">
                  <i class="fas fa-share"></i> 保存して画像にする
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
          this.saveComment(false); // 画像保存なし
        });
      }
      
      // 画像付き保存ボタン（新規追加）
      const saveAndSendBtn = document.getElementById(`${this.modalId}SaveAndSendBtn`);
      if (saveAndSendBtn) {
        saveAndSendBtn.addEventListener('click', () => {
          this.saveComment(true); // 画像DLあり
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
        console.log('🗑️ [モーダルクリーンアップ] currentDataをリセット');
        this.currentData = null;
      });
    }
  }

  /**
   * 日報詳細を表示
   */
  async show(userId, userName, date) {
    try {
      console.log('🔍 [日報詳細] 表示開始 - 受け取ったパラメータ:', { userId, userName, date });
      console.log('🔍 [日報詳細] this.userRole:', this.userRole);
      console.log('🔍 [日報詳細] this.app.currentUser:', this.app.currentUser);
      
      // パラメータ検証
      if (!userId || !date) {
        console.error('[日報詳細] 必須パラメータが不足:', { userId, userName, date });
        this.app.showNotification('表示に必要な情報が不足しています', 'warning');
        return;
      }
      
      // データ取得
      const response = await this.app.apiCall(
        API_ENDPOINTS.STAFF.REPORT(userId, date)
      );
      
      console.log('[日報詳細] APIレスポンス:', response);
      
      if (!response || !response.report) {
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
        breakRecord: response.breakRecord || null
      };
      
      // コメントのタイムスタンプを保存（競合検知用）
      this.originalComment = response.comment ? {
        comment: response.comment.comment,
        updated_at: response.comment.updated_at || response.comment.created_at
      } : null;
      
      console.log('✅ [日報詳細] currentData設定完了:', this.currentData);
      console.log('📊 [日報詳細] 設定されたuserID:', this.currentData.userId);
      console.log('👤 [日報詳細] 設定されたユーザー名:', this.currentData.userName);
      console.log('📅 [日報詳細] 設定された日付:', this.currentData.date);
      
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
    console.log('[排他制御] 編集開始');
    
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
    console.log('[排他制御] 編集終了');
    
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
          API_ENDPOINTS.STAFF.REPORT(this.currentData.userId, this.currentData.date)
        );
        
        if (response && response.comment) {
          const newComment = response.comment;
          
          // コメントが更新されているかチェック
          if (this.hasCommentChanged(newComment)) {
            console.log('[排他制御] 他のユーザーによるコメント更新を検知');
            
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
    contentElement.innerHTML = this.generateDetailContent();
    
    // コメント入力エリアの設定
    if (this.canComment) {
      this.setupCommentArea();
    }
    
  }

  /**
   * 詳細コンテンツ生成（月別レポート表示を維持）
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
          ${this.userRole === 'admin' ? `
            <textarea 
              class="form-control admin-editable" 
              id="editWorkContent" 
              rows="3" 
              maxlength="500">${report.work_content || ''}</textarea>
          ` : `
            <div class="text-content">${report.work_content || ''}</div>
          `}
        </div>

        <!-- 作業場所・PC番号・施設外就労先 -->
        <div class="row mb-3">
          ${this.userRole === 'admin' ? `
            <!-- Admin編集モード -->
            <div class="col-4">
              <label class="form-label">
                <i class="fas fa-building text-info"></i> 施設外就労先
              </label>
              <input 
                type="text" 
                class="form-control admin-editable" 
                id="editExternalWorkLocation" 
                value="${report.external_work_location || ''}"
                maxlength="100">
            </div>
            <div class="col-4">
              <label class="form-label">
                <i class="fas fa-map-marker-alt text-primary"></i> 作業場所
              </label>
              <select class="form-control admin-editable" id="editWorkLocation">
                <option value="">選択してください</option>
                <option value="office" ${report.work_location === 'office' ? 'selected' : ''}>通所</option>
                <option value="home" ${report.work_location === 'home' ? 'selected' : ''}>在宅</option>
              </select>
            </div>
            <div class="col-4">
              <label class="form-label">
                <i class="fas fa-desktop text-success"></i> PC番号
              </label>
              <select class="form-control admin-editable" id="editPcNumber">
                <option value="">選択してください</option>
                ${Array.from({length: 20}, (_, i) => i + 1).map(num => 
                  `<option value="${num}" ${report.pc_number == num ? 'selected' : ''}>${num}</option>`
                ).join('')}
                ${['A', 'B', 'C', 'D'].map(letter => 
                  `<option value="${letter}" ${report.pc_number === letter ? 'selected' : ''}>${letter}</option>`
                ).join('')}
              </select>
            </div>
          ` : `
            <!-- 通常表示モード -->
            ${report.external_work_location ? `
              <div class="col-6">
                <label class="past-form-label">
                  <i class="fas fa-building text-info"></i> 施設外就労先
                </label>
                <div class="past-form-value text-info">${report.external_work_location}</div>
              </div>
            ` : ''}
            ${report.work_location ? `
              <div class="col-3">
                <label class="past-form-label">
                  <i class="fas fa-map-marker-alt text-primary"></i> 作業場所
                </label>
                <div class="past-form-value text-primary">${this.getWorkLocationLabel(report.work_location)}</div>
              </div>
            ` : ''}
            ${report.pc_number ? `
              <div class="col-3">
                <label class="past-form-label">
                  <i class="fas fa-desktop text-success"></i> PC番号
                </label>
                <div class="past-form-value text-success">${report.pc_number}</div>
              </div>
            ` : ''}
          `}
        </div>

        <!-- 健康状態 -->
        <div class="row mb-3">
          <div class="col-3">
            <label class="${this.userRole === 'admin' ? 'form-label' : 'past-form-label'}"><i class="fas fa-thermometer-half"></i> 体温</label>
            ${this.userRole === 'admin' ? `
              <input 
                type="number" 
                class="form-control admin-editable" 
                id="editTemperature" 
                value="${report.temperature || ''}"
                min="35" 
                max="42" 
                step="0.1">
            ` : `
              <div class="past-form-value">${report.temperature}℃</div>
            `}
          </div>
          <div class="col-3">
            <label class="${this.userRole === 'admin' ? 'form-label' : 'past-form-label'}"><i class="fas fa-utensils"></i> 食欲</label>
            ${this.userRole === 'admin' ? `
              <select class="form-control admin-editable" id="editAppetite">
                <option value="good" ${report.appetite === 'good' ? 'selected' : ''}>良好</option>
                <option value="none" ${report.appetite === 'none' ? 'selected' : ''}>なし</option>
              </select>
            ` : `
              <div class="past-form-value">${this.getAppetiteLabel(report.appetite)}</div>
            `}
          </div>
          <div class="col-3">
            <label class="${this.userRole === 'admin' ? 'form-label' : 'past-form-label'}"><i class="fas fa-pills"></i> 頓服服用</label>
            ${this.userRole === 'admin' ? `
              <select class="form-control admin-editable" id="editMedicationTime">
                <option value="">なし</option>
                ${Array.from({length: 24}, (_, i) => i + 1).map(hour => 
                  `<option value="${hour}" ${report.medication_time === hour ? 'selected' : ''}>${hour}時頃</option>`
                ).join('')}
              </select>
            ` : `
              <div class="past-form-value">${report.medication_time ? report.medication_time + '時頃' : 'なし'}</div>
            `}
          </div>
          <div class="col-3">
            <label class="past-form-label"><i class="fas fa-bed"></i> 睡眠時間</label>
            <div class="past-form-value">${this.calculateSleepHours(report.bedtime, report.wakeup_time)}</div>
          </div>
        </div>

        <!-- 睡眠情報（詳細） -->
        <div class="row mb-3">
          <div class="col-4">
            <label class="${this.userRole === 'admin' ? 'form-label' : 'past-form-label'}"><i class="fas fa-moon"></i> 就寝時間</label>
            ${this.userRole === 'admin' ? `
              <input 
                type="time" 
                class="form-control admin-editable" 
                id="editBedtime" 
                value="${report.bedtime || ''}">
            ` : `
              <div class="past-form-value">${report.bedtime || '-'}</div>
            `}
          </div>
          <div class="col-4">
            <label class="${this.userRole === 'admin' ? 'form-label' : 'past-form-label'}"><i class="fas fa-sun"></i> 起床時間</label>
            ${this.userRole === 'admin' ? `
              <input 
                type="time" 
                class="form-control admin-editable" 
                id="editWakeupTime" 
                value="${report.wakeup_time || ''}">
            ` : `
              <div class="past-form-value">${report.wakeup_time || '-'}</div>
            `}
          </div>
          <div class="col-4">
            <label class="${this.userRole === 'admin' ? 'form-label' : 'past-form-label'}"><i class="fas fa-bed"></i> 睡眠状態</label>
            ${this.userRole === 'admin' ? `
              <select class="form-control admin-editable" id="editSleepQuality">
                <option value="good" ${report.sleep_quality === 'good' ? 'selected' : ''}>眠れた</option>
                <option value="poor" ${report.sleep_quality === 'poor' ? 'selected' : ''}>あまり眠れなかった</option>
                <option value="bad" ${report.sleep_quality === 'bad' ? 'selected' : ''}>眠れなかった</option>
              </select>
            ` : `
              <div class="past-form-value">${this.getSleepQualityLabel(report.sleep_quality)}</div>
            `}
          </div>
        </div>

        <!-- 振り返り -->
        <div class="mb-3">
          <label class="${this.userRole === 'admin' ? 'form-label' : 'past-form-label'}"><i class="fas fa-lightbulb"></i> 振り返り・感想</label>
          ${this.userRole === 'admin' ? `
            <textarea 
              class="form-control admin-editable" 
              id="editReflection" 
              rows="3"
              maxlength="500">${report.reflection || ''}</textarea>
          ` : `
            <div class="text-content">${report.reflection || ''}</div>
          `}
        </div>

        <!-- 面談希望 -->
        <div class="mb-3">
          <label class="${this.userRole === 'admin' ? 'form-label' : 'past-form-label'}"><i class="fas fa-comments"></i> 面談希望</label>
          ${this.userRole === 'admin' ? `
            <select class="form-control admin-editable" id="editInterviewRequest">
              <option value="">なし</option>
              <option value="consultation" ${report.interview_request === 'consultation' ? 'selected' : ''}>相談がある</option>
              <option value="interview" ${report.interview_request === 'interview' ? 'selected' : ''}>面談希望</option>
            </select>
          ` : `
            ${report.interview_request ? `
              <div class="past-form-value text-info">${this.getInterviewRequestLabel(report.interview_request)}</div>
            ` : ''}
          `}
        </div>
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
      </div>
    `;
  }

  /**
   * コメントエリアの設定
   */
  setupCommentArea() {
    console.log('[setupCommentArea] 開始 - currentData:', this.currentData);
    
    const textarea = document.getElementById('staffCommentTextarea');
    const saveBtn = document.getElementById(`${this.modalId}SaveCommentBtn`);
    const saveAndSendBtn = document.getElementById(`${this.modalId}SaveAndSendBtn`);
    
    if (!textarea || !saveBtn || !saveAndSendBtn) {
      console.log('[setupCommentArea] 必要な要素が見つかりません');
      return;
    }
    
    // currentDataの存在確認
    if (!this.currentData) {
      console.error('[setupCommentArea] currentDataが存在しません');
      return;
    }
    
    // 編集可否の判定
    const { comment } = this.currentData;
    const isEditable = !comment || this.userRole === 'admin';
    
    console.log('[setupCommentArea] 編集可否:', isEditable);
    
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
      console.log('[イベントリスナー] コメント保存ボタンクリック');
      this.saveComment(false);
    });
    
    newSaveAndSendBtn.addEventListener('click', () => {
      console.log('[イベントリスナー] 保存＆画像DLボタンクリック');
      this.saveComment(true);
    });
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
    console.log('[コメント保存] メソッド開始 - 画像DL:', sendToLine);
    
    try {
      const textarea = document.getElementById('staffCommentTextarea');
      const comment = textarea ? textarea.value.trim() : '';
      
      console.log('[コメント保存] textarea:', textarea);
      console.log('[コメント保存] comment値:', comment);
      
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
          API_ENDPOINTS.STAFF.REPORT(userId, date)
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
      
      console.log('[コメント保存] データ確認:', { userId, userName, date, comment });
      
      // API呼び出し
      const saveResponse = await this.app.apiCall(API_ENDPOINTS.STAFF.COMMENT, {
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
        
        // 画像DL処理
        if (sendToLine) {
          try {
            console.log('[画像DL] 開始');
            await this.lineSender.sendReportCompletion(
              {
                ...this.currentData.report,
                attendance: this.currentData.attendance,
                breakRecord: this.currentData.breakRecord,
                date: this.currentData.date
              },
              this.currentData.user,
              {
                comment: comment,
                staff_name: this.app.currentUser.name,
                created_at: new Date().toISOString()
              }
            );
            console.log('[画像DL] 完了');
          } catch (lineError) {
            console.error('[画像DL] エラー:', lineError);
            this.app.showNotification('画像の保存に失敗しました', 'warning');
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
   * 就寝時間と起床時間から睡眠時間を計算
   * @param {string} bedtime HH:MM形式
   * @param {string} wakeupTime HH:MM形式
   * @returns {string} 睡眠時間の表示文字列
   */
  calculateSleepHours(bedtime, wakeupTime) {
    if (!bedtime || !wakeupTime) return '-';
    
    try {
      const [bedHours, bedMinutes] = bedtime.split(':').map(Number);
      const [wakeHours, wakeMinutes] = wakeupTime.split(':').map(Number);
      
      // 分に変換
      const bedTotalMinutes = bedHours * 60 + bedMinutes;
      const wakeTotalMinutes = wakeHours * 60 + wakeMinutes;
      
      let sleepMinutes;
      
      // 日をまたぐ場合を考慮
      if (wakeTotalMinutes >= bedTotalMinutes) {
        // 同日内（例：22:00就寝 → 06:00起床は不可能なので翌日とみなす）
        if (bedTotalMinutes > 12 * 60 && wakeTotalMinutes < 12 * 60) {
          // 夜遅く就寝して朝早く起床（通常パターン）
          sleepMinutes = (24 * 60 - bedTotalMinutes) + wakeTotalMinutes;
        } else {
          // 同日内（昼寝など）
          sleepMinutes = wakeTotalMinutes - bedTotalMinutes;
        }
      } else {
        // 日をまたぐ場合
        sleepMinutes = (24 * 60 - bedTotalMinutes) + wakeTotalMinutes;
      }
      
      const hours = Math.floor(sleepMinutes / 60);
      const minutes = sleepMinutes % 60;
      
      if (hours === 0) {
        return `${minutes}分`;
      } else if (minutes === 0) {
        return `${hours}時間`;
      } else {
        return `${hours}時間${minutes}分`;
      }
      
    } catch (error) {
      console.error('睡眠時間計算エラー:', error);
      return '-';
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
      'good': '眠れた',
      'normal': '普通',
      'poor': 'あまり眠れなかった',
      'bad': '眠れなかった'
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

  getWorkLocationLabel(value) {
    const labels = {
      'office': '通所',
      'home': '在宅'
    };
    return labels[value] || value;
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
      interviewRequest: interviewRequestEl?.value || null
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
      
      console.log('🔍 [日報編集] currentData確認:', this.currentData);
      console.log('🔍 [日報編集] this.currentData.userId:', this.currentData.userId);
      console.log('🔍 [日報編集] this.currentData.user?.id:', this.currentData.user?.id);
      console.log('🔍 [日報編集] this.currentData.date:', this.currentData.date);
      
      const userId = this.currentData.userId || this.currentData.user?.id;
      console.log('🎯 [日報編集] 使用するuserID:', userId);
      console.log('🎯 [日報編集] APIパス:', `/api/admin/report/${userId}/${this.currentData.date}`);
      console.log('🎯 [日報編集] 送信データ:', formData);
      
      const response = await this.app.apiCall(`/api/admin/report/${userId}/${this.currentData.date}`, {
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