// /public/js/base-module.jsMore actions
// 基底モジュールクラス

export default class BaseModule {
    constructor(app) {
        this.app = app;
        this.eventListeners = new Map();
        this.currentUser = app.currentUser;
    }

    // APIコールのラッパー
    async apiCall(endpoint, options = {}) {
        return await this.app.apiCall(endpoint, options);
    }

    // イベントリスナー管理
    addEventListener(element, event, handler) {
        if (!element) return;

        element.addEventListener(event, handler);

        // クリーンアップのために記録
        if (!this.eventListeners.has(element)) {
            this.eventListeners.set(element, []);
        }
        this.eventListeners.get(element).push({ event, handler });
    }

     // IDでイベントリスナー追加Add commentMore actions
    addEventListenerById(elementId, event, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            this.addEventListener(element, event, handler);
        }
    }

    // クリーンアップ
    destroy() {
        // 登録されたイベントリスナーを全て削除More actions
        this.eventListeners.forEach((listeners, element) => {
            listeners.forEach(({ event, handler }) => {
                element.removeEventListener(event, handler);
            });
        });
        this.eventListeners.clear();

        console.log(`${this.constructor.name} destroyed`);
    }

    // 共通のエラーハンドリング
    handleError(error, defaultMessage = 'エラーが発生しました') {
        console.error(error);
        const message = error.message || defaultMessage;
        this.app.showNotification(message, 'danger');
    }

    // ローディング表示
    showLoading(container, message = '読み込み中...') {
        if (!container) return;

        container.innerHTML = `
            <div class="text-center p-4">
                <div class="spinner-border" role="status">
                    <span class="visually-hidden">${message}</span>
                </div>
                <p class="mt-2 text-muted">${message}</p>
            </div>
        `;
    }

    // 空の状態表示
    showEmptyState(container, message = 'データがありません', icon = 'fa-inbox') {
        if (!container) return;

        container.innerHTML = `
            <div class="text-center p-5">
                <i class="fas ${icon} fa-3x text-muted mb-3"></i>
                <p class="text-muted">${message}</p>
            </div>
        `;
    }

    // エラー状態表示
    showErrorState(container, message = 'エラーが発生しました') {
        if (!container) return;

        container.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i> ${message}
            </div>
        `;
    }

    // 日付フォーマット
    formatDate(date, format = 'YYYY-MM-DD') {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');

        return format
            .replace('YYYY', year)
            .replace('MM', month)
            .replace('DD', day);
    }

    // 時刻フォーマット
    formatTime(date) {
        const d = new Date(date);
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    // デバウンス処理
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // スロットル処理
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    }