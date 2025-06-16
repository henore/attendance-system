// /public/js/main.js
// メインアプリケーション

import UserModule from './modules/user/index.js';
import StaffModule from './modules/staff/index.js';
import AdminModule from './modules/admin/index.js';
import { API_ENDPOINTS } from './constants/api-endpoints.js';
import { MESSAGES } from './constants/labels.js';

class AttendanceManagementSystem {
    constructor() {
        this.currentUser = null;
        this.currentModule = null;
        this.notificationTimeout = null;
        this.sessionCheckInterval = null;
    }

    async init() {
        console.log('🚀 勤怠管理システム起動');
        
        // 認証チェック
        const isAuthenticated = await this.checkAuthentication();
        
        if (isAuthenticated) {
            await this.loadDashboard();
            this.startSessionMonitoring();
        } else {
            this.showLoginForm();
        }

        // グローバルイベントリスナー
        this.setupGlobalEventListeners();
    }

    async checkAuthentication() {
        try {
            const response = await this.apiCall(API_ENDPOINTS.AUTH.CHECK);
            if (response.authenticated && response.user) {
                this.currentUser = response.user;
                return true;
            }
        } catch (error) {
            console.error('認証チェックエラー:', error);
        }
        return false;
    }

    showLoginForm() {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="login-container">
                <div class="card login-card">
                    <div class="card-header bg-primary text-white text-center">
                        <h3><i class="fas fa-clock"></i> 勤怠管理システム</h3>
                    </div>
                    <div class="card-body">
                        <!-- 時刻表示（大きめ） -->
                        <div class="login-clock-display text-center mb-4">
                            <div id="loginClock" class="display-4 text-primary">
                                <i class="far fa-clock"></i> --:--:--
                            </div>
                            <div id="loginDate" class="h5 text-muted mt-2">
                                ----年--月--日（-）
                            </div>
                        </div>
                        
                        <hr class="my-4">
                        
                        <form id="loginForm">
                            <div class="mb-3">
                                <label for="username" class="form-label">ユーザーID</label>
                                <input type="text" class="form-control" id="username" required autofocus>
                            </div>
                            <div class="mb-3">
                                <label for="password" class="form-label">パスワード</label>
                                <input type="password" class="form-control" id="password" required>
                            </div>
                            <button type="submit" class="btn btn-primary w-100">
                                <i class="fas fa-sign-in-alt"></i> ログイン
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        `;

        // ログインフォームのイベントリスナー
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }
        
        // ログイン画面の時計を開始
        this.startLoginClock();
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        try {
            const response = await this.apiCall(API_ENDPOINTS.AUTH.LOGIN, {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });

            if (response.success && response.user) {
                this.currentUser = response.user;
                this.showNotification(MESSAGES.AUTH.LOGIN_SUCCESS, 'success');
                await this.loadDashboard();
                this.startSessionMonitoring();
            } else {
                throw new Error(response.message || MESSAGES.AUTH.LOGIN_ERROR);
            }
        } catch (error) {
            this.showNotification(error.message || MESSAGES.AUTH.LOGIN_ERROR, 'danger');
        }
    }

    async loadDashboard() {
        const app = document.getElementById('app');
        app.innerHTML = `
            <nav class="navbar navbar-dark bg-primary">
                <div class="container-fluid">
                    <span class="navbar-brand">
                        <i class="fas fa-clock"></i> 勤怠管理システム
                    </span>
                    <div class="d-flex align-items-center">
                        <span class="text-white me-3">
                            <i class="fas fa-user"></i> ${this.currentUser.name} 
                            <span class="badge bg-light text-primary ms-1">${this.getRoleDisplayName(this.currentUser.role)}</span>
                        </span>
                        <button class="btn btn-outline-light btn-sm" id="logoutBtn">
                            <i class="fas fa-sign-out-alt"></i> ログアウト
                        </button>
                    </div>
                </div>
            </nav>
            
            <div class="container-fluid">
                <div id="app-content">
                    <!-- モジュールコンテンツ -->
                </div>
            </div>
            
            <!-- 通知エリア -->
            <div id="notificationArea" class="notification-area"></div>
        `;

        // ログアウトボタン
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }

        // 権限に応じたモジュールをロード
        await this.loadModule();
    }

    async loadModule() {
        // 既存モジュールをクリーンアップ
        if (this.currentModule) {
            this.currentModule.destroy();
            this.currentModule = null;
        }

        // 権限に応じたモジュールを初期化
        switch (this.currentUser.role) {
            case 'user':
                this.currentModule = new UserModule(this);
                break;
            case 'staff':
                this.currentModule = new StaffModule(this);
                break;
            case 'admin':
                this.currentModule = new AdminModule(this);
                break;
            default:
                this.showNotification('不明な権限です', 'danger');
                return;
        }

        // モジュール初期化
        await this.currentModule.init();
    }

    async handleLogout() {
        try {
            // スタッフの場合は特別な確認
            if (this.currentUser.role === 'staff' && this.currentModule.handleLogout) {
                const canLogout = await this.currentModule.handleLogout();
                if (!canLogout) return;
            }

            await this.apiCall(API_ENDPOINTS.AUTH.LOGOUT, { method: 'POST' });
            
            this.showNotification(MESSAGES.AUTH.LOGOUT_SUCCESS, 'success');
            
            // クリーンアップ
            if (this.currentModule) {
                this.currentModule.destroy();
                this.currentModule = null;
            }
            this.currentUser = null;
            this.stopSessionMonitoring();
            
            // ログイン画面へ
            this.showLoginForm();
            
        } catch (error) {
            console.error('ログアウトエラー:', error);
            this.showNotification('ログアウトに失敗しました', 'danger');
        }
    }

    async loadDashboard() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <nav class="navbar navbar-dark bg-primary">
            <div class="container-fluid">
                <span class="navbar-brand">
                    <i class="fas fa-clock"></i> 勤怠管理システム
                </span>
                <div class="d-flex align-items-center">
                    <span class="navbar-clock" id="navbarClock">
                        <!-- 時刻がここに表示される -->
                    </span>
                    <span class="text-white me-3">
                        <i class="fas fa-user"></i> ${this.currentUser.name} 
                        <span class="badge bg-light text-primary ms-1">${this.getRoleDisplayName(this.currentUser.role)}</span>
                    </span>
                    <button class="btn btn-outline-light btn-sm" id="logoutBtn">
                        <i class="fas fa-sign-out-alt"></i> ログアウト
                    </button>
                </div>
            </div>
        </nav>
        
        <div class="container-fluid">
            <div id="app-content">
                <!-- モジュールコンテンツ -->
            </div>
        </div>
        
        <!-- 通知エリア -->
        <div id="notificationArea" class="notification-area"></div>
    `;

    // 時計を開始
    this.startClock();

    // ログアウトボタン
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => this.handleLogout());
    }

    // 権限に応じたモジュールをロード
    await this.loadModule();
}

// 時計機能を追加
    startClock() {
    const updateClock = () => {
        const clockElement = document.getElementById('navbarClock');
        if (clockElement) {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('ja-JP');
            const dateStr = now.toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                weekday: 'short'
            });
            clockElement.innerHTML = `<i class="far fa-clock"></i> ${dateStr} ${timeStr}`;
        }
    };
    
    updateClock();
    setInterval(updateClock, 1000);
    }   

    // API呼び出しラッパー
    async apiCall(endpoint, options = {}) {
        const defaultOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'same-origin'
        };

        const finalOptions = { ...defaultOptions, ...options };

        try {
            const response = await fetch(endpoint, finalOptions);
            
            if (!response.ok) {
                if (response.status === 401) {
                    // 認証エラー
                    this.handleSessionExpired();
                    throw new Error(MESSAGES.AUTH.SESSION_EXPIRED);
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (!data.success && data.error) {
                throw new Error(data.error);
            }

            return data;
        } catch (error) {
            console.error('API呼び出しエラー:', error);
            throw error;
        }
    }

    // 通知表示
    showNotification(message, type = 'info') {
        const notificationArea = document.getElementById('notificationArea');
        if (!notificationArea) return;

        const alertClass = {
            'success': 'alert-success',
            'danger': 'alert-danger',
            'warning': 'alert-warning',
            'info': 'alert-info'
        }[type] || 'alert-info';

        const notification = document.createElement('div');
        notification.className = `alert ${alertClass} alert-dismissible fade show notification`;
        notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        notificationArea.appendChild(notification);

        // 自動削除
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }
        
        this.notificationTimeout = setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    // セッション監視
    startSessionMonitoring() {
        this.stopSessionMonitoring();
        
        // 30分ごとにセッションチェック
        this.sessionCheckInterval = setInterval(async () => {
            const isValid = await this.checkAuthentication();
            if (!isValid) {
                this.handleSessionExpired();
            }
        }, 30 * 60 * 1000);
    }

    stopSessionMonitoring() {
        if (this.sessionCheckInterval) {
            clearInterval(this.sessionCheckInterval);
            this.sessionCheckInterval = null;
        }
    }

    handleSessionExpired() {
        this.showNotification(MESSAGES.AUTH.SESSION_EXPIRED, 'warning');
        
        if (this.currentModule) {
            this.currentModule.destroy();
            this.currentModule = null;
        }
        
        this.currentUser = null;
        this.stopSessionMonitoring();
        this.showLoginForm();
    }

    // グローバルイベントリスナー
    setupGlobalEventListeners() {
        // エラーハンドリング
        window.addEventListener('error', (event) => {
            console.error('グローバルエラー:', event.error);
            this.showNotification('予期しないエラーが発生しました', 'danger');
        });

        // ネットワークエラー
        window.addEventListener('offline', () => {
            this.showNotification('ネットワークに接続できません', 'warning');
        });

        window.addEventListener('online', () => {
            this.showNotification('ネットワークに接続しました', 'success');
        });
    }

    // ヘルパーメソッド
    getRoleDisplayName(role) {
        const roles = {
            'user': '利用者',
            'staff': 'スタッフ',
            'admin': '管理者'
        };
        return roles[role] || role;
    }
}



// アプリケーション起動
document.addEventListener('DOMContentLoaded', () => {
    const app = new AttendanceManagementSystem();
    app.init();
});