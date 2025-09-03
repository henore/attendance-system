// public/js/modules/shared/trial-visits.js
// 体験入所管理共通モジュール

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { modalManager } from './modal-manager.js';
import { getCurrentDate, getCurrentTime } from '../../utils/date-time.js';
import { isJapaneseHoliday } from '../../utils/holidays.js';

export default class TrialVisitsManager {
    constructor(app) {
        this.app = app;
        this.currentMonth = new Date().getMonth() + 1;
        this.currentYear = new Date().getFullYear();
        this.notificationInterval = null;
        this.trialVisitsData = new Map(); // カレンダー用データキャッシュ
        this.userRole = app.currentUser.role; // ロールを保存
        this.currentModalId = null;
    }

    // メイン画面描画
    render() {
        return `
            <div class="container-fluid">
                <div class="row">
                    <div class="col-12">
                        <div class="custom-card">
                            <div class="custom-card-header">
                                <h5><i class="fas fa-user-friends"></i> 体験入所管理</h5>
                            </div>
                            <div class="card-body">
                                <!-- 新規登録セクション -->
                                <div class="row mb-4">
                                    <div class="col-12">
                                        <h6><i class="fas fa-plus-circle"></i> 体験入所予定登録</h6>
                                        <form id="trialVisitForm" class="row g-3">
                                            <div class="col-md-4">
                                                <label for="visitorName" class="form-label">氏名</label>
                                                <input type="text" class="form-control" id="visitorName" required>
                                            </div>
                                            <div class="col-md-3">
                                                <label for="visitDate" class="form-label">日付</label>
                                                <input type="date" class="form-control" id="visitDate" required>
                                            </div>
                                            <div class="col-md-3">
                                                <label for="visitTime" class="form-label">時刻</label>
                                                <input type="time" class="form-control" id="visitTime" required>
                                            </div>
                                            <div class="col-md-2">
                                                <label class="form-label">&nbsp;</label>
                                                <button type="submit" class="btn btn-primary w-100">
                                                    <i class="fas fa-check"></i> 確定
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                </div>

                                <hr>

                                <!-- 当日の予定一覧 -->
                                <div class="row mb-4">
                                    <div class="col-12">
                                        <h6><i class="fas fa-calendar-day"></i> 本日の体験入所予定</h6>
                                        <div id="todayTrialVisits" class="border rounded p-3">
                                            <!-- 当日の予定がここに表示される -->
                                        </div>
                                    </div>
                                </div>

                                <hr>

                                <!-- カレンダー -->
                                <div class="row">
                                    <div class="col-12">
                                        <div class="calendar-container">
                                            <div class="calendar-header">
                                                <button class="calendar-nav-btn" id="prevMonth">
                                                    <i class="fas fa-chevron-left"></i>
                                                </button>
                                                <h6 class="calendar-title" id="calendarTitle">体験入所予定カレンダー</h6>
                                                <button class="calendar-nav-btn" id="nextMonth">
                                                    <i class="fas fa-chevron-right"></i>
                                                </button>
                                            </div>
                                            <div class="calendar-grid" id="trialVisitsCalendar">
                                                <!-- カレンダーがここに表示される -->
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 体験入所予定詳細モーダル -->
            <div class="modal fade" id="trialVisitsModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header bg-info text-white">
                            <h5 class="modal-title" id="trialVisitsModalLabel">
                                <i class="fas fa-calendar-day"></i> 体験入所予定
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" id="trialVisitsModalBody">
                            <!-- 予定一覧がここに表示される -->
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">閉じる</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // 初期化
    async init() {
        // 通知システム開始
        this.startNotificationSystem();
        
        // イベントリスナー設定
        this.setupEventListeners();
        
        // 初期データ読み込み
        await this.loadTodayTrialVisits();
        await this.loadCalendar();
        
        // 現在日付を初期値として設定
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('visitDate').value = today;
        
        // モーダル初期化
        modalManager.register('trialVisitsModal');
    }

    // イベントリスナー設定
    setupEventListeners() {
        // 新規登録フォーム
        document.getElementById('trialVisitForm').addEventListener('submit', (e) => {
            this.handleSubmit(e);
        });

        // カレンダーナビゲーション
        document.getElementById('prevMonth').addEventListener('click', () => {
            this.navigateMonth(-1);
        });

        document.getElementById('nextMonth').addEventListener('click', () => {
            this.navigateMonth(1);
        });

        // カレンダー日付クリック
        document.addEventListener('click', (e) => {
            if (e.target.closest('.calendar-day')) {
                const dateCell = e.target.closest('.calendar-day');
                const date = dateCell.dataset.date;
                console.log('[体験入所] カレンダークリック - 要素:', dateCell, '日付:', date);
                this.onDateClick(date);
            }
        });

        // 削除ボタンクリック
        document.addEventListener('click', (e) => {
            if (e.target.closest('.delete-visit-btn')) {
                const btn = e.target.closest('.delete-visit-btn');
                const visitId = btn.dataset.visitId;
                const visitName = btn.dataset.visitName;
                this.deleteTrialVisit(visitId, visitName);
            }
        });

        // 日付変更
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('update-visit-date')) {
                const visitId = e.target.dataset.visitId;
                this.updateVisitDate(visitId, e.target.value);
            }
        });

        // 時刻変更
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('update-visit-time')) {
                const visitId = e.target.dataset.visitId;
                this.updateVisitTime(visitId, e.target.value);
            }
        });
    }

    // 新規登録処理
    async handleSubmit(e) {
        e.preventDefault();
        
        const name = document.getElementById('visitorName').value.trim();
        const visitDate = document.getElementById('visitDate').value;
        const visitTime = document.getElementById('visitTime').value;

        if (!name || !visitDate || !visitTime) {
            this.app.showNotification('すべての項目を入力してください', 'warning');
            return;
        }

        try {
            const endpoints = this.userRole === 'admin' ? API_ENDPOINTS.ADMIN : API_ENDPOINTS.STAFF;
            const response = await this.app.apiCall(endpoints.TRIAL_VISITS_CREATE, {
                method: 'POST',
                body: JSON.stringify({
                    name: name,
                    visitDate: visitDate,
                    visitTime: visitTime
                })
            });

            this.app.showNotification(response.message || '体験入所予定を登録しました', 'success');
            
            // フォームリセット
            document.getElementById('trialVisitForm').reset();
            
            // 当日の予定を更新（今日の日付の場合）
            const today = new Date().toISOString().split('T')[0];
            if (visitDate === today) {
                await this.loadTodayTrialVisits();
            }
            
            // カレンダー更新
            await this.loadCalendar();

        } catch (error) {
            this.app.showNotification(error.message || '登録に失敗しました', 'danger');
        }
    }

    // 当日の体験入所予定読み込み
    async loadTodayTrialVisits() {
        try {
            const endpoints = this.userRole === 'admin' ? API_ENDPOINTS.ADMIN : API_ENDPOINTS.STAFF;
            const response = await this.app.apiCall(endpoints.TRIAL_VISITS_TODAY);
            const container = document.getElementById('todayTrialVisits');
            
            if (response.visits && response.visits.length > 0) {
                container.innerHTML = this.renderTrialVisitsList(response.visits, true);
            } else {
                container.innerHTML = `
                    <div class="text-center text-muted p-3">
                        <i class="fas fa-calendar-times fa-2x mb-2"></i>
                        <p>本日の体験入所予定はありません</p>
                    </div>
                `;
            }
        } catch (error) {
            document.getElementById('todayTrialVisits').innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i> データの読み込みに失敗しました
                </div>
            `;
        }
    }

    // 体験入所予定一覧の描画
    renderTrialVisitsList(visits, showDelete = true) {
        if (!visits || visits.length === 0) {
            return `
                <div class="text-center text-muted p-3">
                    <i class="fas fa-calendar-times fa-2x mb-2"></i>
                    <p>体験入所予定はありません</p>
                </div>
            `;
        }

        return visits.map(visit => `
            <div class="d-flex justify-content-between align-items-center border-bottom py-3" id="today-visit-${visit.id}">
                <div class="d-flex align-items-center flex-grow-1">
                    <i class="fas fa-user-friends text-info me-3"></i>
                    <div>
                        <span class="fw-bold fs-5 me-4">${visit.name}</span>
                        <span class="text-muted fs-5">${visit.visit_time}</span>
                    </div>
                </div>
                ${showDelete && this.userRole === 'admin' ? `
                    <button class="btn btn-outline-danger btn-sm delete-visit-btn" data-visit-id="${visit.id}" data-visit-name="${visit.name}">
                        <i class="fas fa-trash"></i> 削除
                    </button>
                ` : ''}
            </div>
        `).join('');
    }

    // 体験入所予定一覧の描画（編集機能付き）
    renderTrialVisitsListWithEdit(visits) {
        if (!visits || visits.length === 0) {
            return `
                <div class="text-center text-muted p-3">
                    <i class="fas fa-calendar-times fa-2x mb-2"></i>
                    <p>この日の体験入所予定はありません</p>
                </div>
            `;
        }

        return visits.map(visit => `
            <div class="d-flex justify-content-between align-items-center border-bottom py-3" id="visit-${visit.id}">
                <div class="flex-grow-1">
                    <div class="d-flex align-items-center mb-2">
                        <i class="fas fa-user-friends text-info me-2"></i>
                        <span class="fw-bold">${visit.name}</span>
                    </div>
                    <div class="d-flex gap-3">
                        <div>
                            <label class="form-label form-label-sm">日付</label>
                            <input type="date" class="form-control form-control-sm update-visit-date" value="${visit.visit_date}" 
                                   data-visit-id="${visit.id}">
                        </div>
                        <div>
                            <label class="form-label form-label-sm">時刻</label>
                            <input type="time" class="form-control form-control-sm update-visit-time" value="${visit.visit_time}" 
                                   data-visit-id="${visit.id}">
                        </div>
                    </div>
                </div>
                <div class="d-flex flex-column gap-1">
                    <button class="btn btn-outline-danger btn-sm delete-visit-btn" data-visit-id="${visit.id}" data-visit-name="${visit.name}">
                        <i class="fas fa-trash"></i> 削除
                    </button>
                </div>
            </div>
        `).join('');
    }

    // モーダル用コンテンツ生成
    generateTrialVisitsModalContent(visits) {
        if (!visits || visits.length === 0) {
            return `
                <div class="text-center text-muted p-4">
                    <i class="fas fa-calendar-times fa-3x mb-3"></i>
                    <h5>この日の体験入所予定はありません</h5>
                </div>
            `;
        }

        let html = '<div class="trial-visits-modal-content">';
        
        visits.forEach((visit, index) => {
            html += `
                <div class="d-flex justify-content-between align-items-center py-3 ${index < visits.length - 1 ? 'border-bottom' : ''}">
                    <div class="flex-grow-1">
                        <div class="d-flex align-items-center mb-2">
                            <i class="fas fa-user-friends text-info me-2"></i>
                            <span class="fw-bold h5 mb-0">${visit.name}</span>
                        </div>
                        <div class="d-flex gap-3">
                            <div>
                                <label class="form-label form-label-sm">日付</label>
                                <input type="date" class="form-control form-control-sm update-visit-date" value="${visit.visit_date}" 
                                       data-visit-id="${visit.id}">
                            </div>
                            <div>
                                <label class="form-label form-label-sm">時刻</label>
                                <input type="time" class="form-control form-control-sm update-visit-time" value="${visit.visit_time}" 
                                       data-visit-id="${visit.id}">
                            </div>
                        </div>
                    </div>
                    ${this.userRole === 'admin' ? `
                        <div>
                            <button class="btn btn-outline-danger btn-sm delete-visit-btn" data-visit-id="${visit.id}" data-visit-name="${visit.name}">
                                <i class="fas fa-trash"></i> 削除
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        });
        
        html += '</div>';
        return html;
    }

    // 日付更新処理
    async updateVisitDate(id, newDate) {
        try {
            const endpoints = this.userRole === 'admin' ? API_ENDPOINTS.ADMIN : API_ENDPOINTS.STAFF;
            const response = await this.app.apiCall(endpoints.TRIAL_VISITS_UPDATE(id), {
                method: 'PUT',
                body: JSON.stringify({ visitDate: newDate })
            });
            
            this.app.showNotification('日付を更新しました', 'success');
            
            // データ更新
            await this.loadTodayTrialVisits();
            await this.loadCalendar();
            
        } catch (error) {
            this.app.showNotification('日付の更新に失敗しました', 'danger');
        }
    }

    // 時刻更新処理
    async updateVisitTime(id, newTime) {
        try {
            const endpoints = this.userRole === 'admin' ? API_ENDPOINTS.ADMIN : API_ENDPOINTS.STAFF;
            const response = await this.app.apiCall(endpoints.TRIAL_VISITS_UPDATE(id), {
                method: 'PUT',
                body: JSON.stringify({ visitTime: newTime })
            });
            
            this.app.showNotification('時刻を更新しました', 'success');
            
            // データ更新
            await this.loadTodayTrialVisits();
            await this.loadCalendar();
            
        } catch (error) {
            this.app.showNotification('時刻の更新に失敗しました', 'danger');
        }
    }

    // 体験入所予定削除
    async deleteTrialVisit(id, name) {
        const confirmed = confirm(`${name}さんの体験入所予定を削除しますか？\n\nこの操作は取り消せません。`);
        if (!confirmed) return;

        try {
            const endpoints = this.userRole === 'admin' ? API_ENDPOINTS.ADMIN : API_ENDPOINTS.STAFF;
            const response = await this.app.apiCall(endpoints.TRIAL_VISITS_DELETE(id), {
                method: 'DELETE'
            });

            this.app.showNotification(response.message || '体験入所予定を削除しました', 'success');
            
            // データ更新
            await this.loadTodayTrialVisits();
            await this.loadCalendar();
            
            // モーダルが開いている場合は更新
            const modal = document.getElementById('trialVisitsModal');
            if (modal && modal.classList.contains('show')) {
                const modalDate = modal.querySelector('#modalDateTitle').dataset.date;
                if (modalDate) {
                    await this.showTrialVisitsModal(modalDate);
                }
            }

        } catch (error) {
            this.app.showNotification(error.message || '削除に失敗しました', 'danger');
        }
    }

    // カレンダー読み込み
    async loadCalendar() {
        try {
            // 月別体験入所予定データ取得
            const endpoints = this.userRole === 'admin' ? API_ENDPOINTS.ADMIN : API_ENDPOINTS.STAFF;
            const response = await this.app.apiCall(
                endpoints.TRIAL_VISITS_MONTHLY(this.currentYear, this.currentMonth)
            );
            
            // データをMapに保存
            this.trialVisitsData.clear();
            if (response.visits) {
                response.visits.forEach(visit => {
                    this.trialVisitsData.set(visit.visit_date, visit.count);
                });
            }
            
            // カレンダー描画
            this.renderCalendar();
            
        } catch (error) {
            console.error('カレンダーデータ読み込みエラー:', error);
        }
    }

    // カレンダー描画（userやstaffカレンダーと完全統一）
    renderCalendar() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const firstDay = new Date(this.currentYear, this.currentMonth - 1, 1);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay());

        // カレンダータイトル更新
        const titleDate = new Date(this.currentYear, this.currentMonth - 1, 1);
        document.getElementById('calendarTitle').textContent = titleDate.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'long'
        });

        let html = '';

        // 曜日ヘッダー
        const dayHeaders = ['日', '月', '火', '水', '木', '金', '土'];
        dayHeaders.forEach((day, index) => {
            let headerClass = 'calendar-day-header';
            if (index === 0) headerClass += ' sunday-header';
            if (index === 6) headerClass += ' saturday-header';
            html += `<div class="${headerClass}">${day}</div>`;
        });

        // 日付セル
        const current = new Date(startDate);
        for (let i = 0; i < 42; i++) {
            const isCurrentMonth = current.getMonth() === (this.currentMonth - 1);
            const currentDateReset = new Date(current);
            currentDateReset.setHours(0, 0, 0, 0);
            const isToday = currentDateReset.getTime() === today.getTime();
            const dateStr = this.formatDateString(current);
            const dayOfWeek = current.getDay();
            const trialVisitCount = this.trialVisitsData.get(dateStr) || 0;
            
            let classes = ['calendar-day'];
            if (!isCurrentMonth) classes.push('other-month');
            if (isToday) classes.push('today');
            
            // 土日・祝日の色分け
            if (dayOfWeek === 0 || isJapaneseHoliday(current)) classes.push('sunday');
            if (dayOfWeek === 6) classes.push('saturday');
            
            // 体験入所予定がある場合
            if (trialVisitCount > 0 && isCurrentMonth) {
                classes.push('has-trials');
            }

            html += `
                <div class="${classes.join(' ')}" data-date="${dateStr}" data-action="onDateClick('${dateStr}')">
                    <div class="calendar-day-number">${current.getDate()}</div>
                    ${trialVisitCount > 0 ? `
                        <div class="calendar-day-indicators">
                            <span class="calendar-indicator indicator-trial" title="体験入所予定: ${trialVisitCount}件">${trialVisitCount}</span>
                        </div>
                    ` : ''}
                </div>
            `;

            current.setDate(current.getDate() + 1);
        }

        document.getElementById('trialVisitsCalendar').innerHTML = html;
    }

    /**
     * 日付を文字列にフォーマット（タイムゾーン対応）
     * @param {Date} date 
     * @returns {string}
     */
    formatDateString(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // 月ナビゲーション（1年制限付き）
    navigateMonth(direction) {
        const newMonth = this.currentMonth + direction;
        let newYear = this.currentYear;
        let targetMonth = newMonth;
        
        if (newMonth > 12) {
            targetMonth = 1;
            newYear++;
        } else if (newMonth < 1) {
            targetMonth = 12;
            newYear--;
        }
        
        // 1年間制限チェック
        const newDate = new Date(newYear, targetMonth - 1, 1);
        if (this.isWithinOneYear(newDate)) {
            this.currentMonth = targetMonth;
            this.currentYear = newYear;
            this.loadCalendar();
        }
    }

    /**
     * 1年間の範囲内かチェック
     * @param {Date} date 
     * @returns {boolean}
     */
    isWithinOneYear(date) {
        const now = new Date();
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(now.getFullYear() - 1);
        
        return date >= oneYearAgo && date <= now;
    }

    // 日付クリック処理
    async onDateClick(date) {
        console.log('[体験入所] 日付クリック:', date);
        await this.showTrialVisitsModal(date);
    }

    // 体験入所予定詳細モーダル表示（既存modalManagerを使用）
    async showTrialVisitsModal(date) {
        try {
            // 既存モーダルがあれば破棄
            if (this.currentModalId) {
                modalManager.destroy(this.currentModalId);
            }
            
            const endpoints = this.userRole === 'admin' ? API_ENDPOINTS.ADMIN : API_ENDPOINTS.STAFF;
            const response = await this.app.apiCall(endpoints.TRIAL_VISITS_BY_DATE(date));
            
            // 日付フォーマット
            const dateObj = new Date(date + 'T00:00:00');
            const dateStr = dateObj.toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long'
            });
            
            // モーダルコンテンツ生成
            const content = this.generateTrialVisitsModalContent(response.visits || []);
            
            // モーダルID生成
            const modalId = `trialVisitsModal_${date.replace(/-/g, '_')}`;
            this.currentModalId = modalId;
            
            // 専用モーダルにコンテンツを設定して表示
            const modalElement = document.getElementById('trialVisitsModal');
            const modalTitle = document.getElementById('trialVisitsModalLabel');
            const modalBody = document.getElementById('trialVisitsModalBody');
            
            console.log('[モーダル確認]', {
                modalElement: !!modalElement,
                modalTitle: !!modalTitle,
                modalBody: !!modalBody,
                modalManagerHasModal: modalManager.modals.has('trialVisitsModal')
            });
            
            if (modalElement && modalTitle && modalBody) {
                modalTitle.innerHTML = `<i class="fas fa-users"></i> ${dateStr}の体験入所予定`;
                modalBody.innerHTML = content;
                
                modalManager.show('trialVisitsModal');
            } else {
                console.error('体験入所モーダル要素が見つかりません:', {
                    modalElement: !!modalElement,
                    modalTitle: !!modalTitle,
                    modalBody: !!modalBody
                });
                this.app.showNotification('モーダルの表示に失敗しました', 'danger');
            }
            
        } catch (error) {
            console.error('モーダル表示エラー:', error);
            this.app.showNotification('データの読み込みに失敗しました', 'danger');
        }
    }

    // 通知システム開始
    startNotificationSystem() {
        // 既存のインターバルをクリア
        if (this.notificationInterval) {
            clearInterval(this.notificationInterval);
        }
        
        // 1時間ごとに通知チェック
        this.notificationInterval = setInterval(() => {
            this.checkTrialVisitNotifications();
        }, 60 * 60 * 1000); // 1時間 = 3600000ms
        
        // 初回実行
        this.checkTrialVisitNotifications();
    }

    // 体験入所通知チェック
    async checkTrialVisitNotifications() {
        try {
            const endpoints = this.userRole === 'admin' ? API_ENDPOINTS.ADMIN : API_ENDPOINTS.STAFF;
            const response = await this.app.apiCall(endpoints.TRIAL_VISITS_NOTIFICATION_CHECK);
            
            if (response.upcomingVisits && response.upcomingVisits.length > 0) {
                response.upcomingVisits.forEach(visit => {
                    this.showTrialVisitNotification(visit);
                });
            }
        } catch (error) {
            console.error('体験入所通知チェックエラー:', error);
        }
    }

    // 体験入所通知表示
    showTrialVisitNotification(visit) {
        const message = `【${visit.name}】さんが【${visit.visit_time}】に体験入所に来られます。`;
        
        // Web通知（ブラウザ通知）
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('体験入所予定通知', {
                body: message,
                icon: '/images/favicon.ico',
                tag: `trial-visit-${visit.id}`
            });
        }
        
        // アプリ内通知
        this.app.showNotification(message, 'info');
    }

    // 通知許可要求
    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    // 非表示処理
    hide() {
        // 空の実装（セクション管理は親モジュールで行う）
    }

    // 破棄処理
    destroy() {
        // 既存モーダルがあれば破棄
        if (this.currentModalId) {
            modalManager.destroy(this.currentModalId);
            this.currentModalId = null;
        }
        
        if (this.notificationInterval) {
            clearInterval(this.notificationInterval);
            this.notificationInterval = null;
        }
        this.trialVisitsData.clear();
    }
}

// グローバルインスタンス（削除処理等で使用）
window.trialVisitsManager = null;