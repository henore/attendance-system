// /public/js/main.js
// メインアプリケーション（修正版）

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
        this.loginClockInterval = null; // ログイン画面時計用
        this.navbarClockInterval = null; // ナビバー時計用
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
                            <div class="input-group">
                                <input type="password" class="form-control" id="password" required>
                                <button class="btn btn-outline-secondary" type="button" id="togglePassword">
                                    <i class="fas fa-eye" id="togglePasswordIcon"></i>
                                </button>
                            </div>
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
    
    // パスワード表示/非表示トグル
    const togglePasswordBtn = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    const toggleIcon = document.getElementById('togglePasswordIcon');
    
    if (togglePasswordBtn && passwordInput && toggleIcon) {
        togglePasswordBtn.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            
            // アイコンを切り替え
            if (type === 'text') {
                toggleIcon.classList.remove('fa-eye');
                toggleIcon.classList.add('fa-eye-slash');
            } else {
                toggleIcon.classList.remove('fa-eye-slash');
                toggleIcon.classList.add('fa-eye');
            }
        });
    }
    
    // ログイン画面の時計を開始
    this.startLoginClock();
    }

        // ログイン画面の時計機能（修正版）
        startLoginClock() {
            // 既存の時計があれば停止
            if (this.loginClockInterval) {
                clearInterval(this.loginClockInterval);
            }

            const updateLoginClock = () => {
                const clockElement = document.getElementById('loginClock');
                const dateElement = document.getElementById('loginDate');
                
                if (clockElement && dateElement) {
                    const now = new Date();
                    const timeStr = now.toLocaleTimeString('ja-JP');
                    const dateStr = now.toLocaleDateString('ja-JP', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        weekday: 'short'
                    });
                    
                    clockElement.innerHTML = `<i class="far fa-clock"></i> ${timeStr}`;
                    dateElement.textContent = dateStr;
                }
            };
            
            // 即座に実行
            updateLoginClock();
            
            // 1秒ごとに更新
            this.loginClockInterval = setInterval(updateLoginClock, 1000);
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
                
                // ログイン画面の時計を停止
                if (this.loginClockInterval) {
                    clearInterval(this.loginClockInterval);
                    this.loginClockInterval = null;
                }
                
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
                        <span class="navbar-clock" id="navbarClock">
                            <!-- 時刻がここに表示される -->
                        </span>
                        <span class="text-white me-3">
                            <i class="fas fa-user"></i> ${this.currentUser.name} 
                            <span class="badge bg-light text-primary ms-1">${this.getRoleDisplayName(this.currentUser.role)}</span>
                        </span>
                        <button class="btn btn-outline-light btn-sm" id="logoutBtn" ${this.currentUser.role === 'user' ? 'style="display: none;"' : ''}>
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
        this.startNavbarClock();

        // ログアウトボタン（利用者以外のみ表示）
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }

        // 権限に応じたモジュールをロード
        await this.loadModule();
    }

    // ナビバーの時計機能
    startNavbarClock() {
        // 既存の時計があれば停止
        if (this.navbarClockInterval) {
            clearInterval(this.navbarClockInterval);
        }

        const updateNavbarClock = () => {
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
        
        updateNavbarClock();
        this.navbarClockInterval = setInterval(updateNavbarClock, 1000);
    }

            // 利用者用ログアウトボタン表示制御（出勤後に呼び出される）
        showLogoutButtonForUser() {
            const logoutBtn = document.getElementById('logoutBtn');
            if (logoutBtn && this.currentUser.role === 'user') {
                logoutBtn.style.display = 'inline-block';
            }
        }

        // 利用者用ログアウトボタン非表示制御（出勤前）
        hideLogoutButtonForUser() {
            const logoutBtn = document.getElementById('logoutBtn');
            if (logoutBtn && this.currentUser.role === 'user') {
                logoutBtn.style.display = 'none';
            }
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

            // ログアウトAPI呼び出し
            const response = await this.apiCall(API_ENDPOINTS.AUTH.LOGOUT, { method: 'POST' });
            
            // レスポンスが成功でなくてもログアウト処理を続行（セッション強制破棄）
            console.log('ログアウトレスポンス:', response);
            
            this.showNotification(MESSAGES.AUTH.LOGOUT_SUCCESS, 'success');
            
            // 必ずクリーンアップとログイン画面表示を実行
            this.performLogoutCleanup();
            
        } catch (error) {
            console.error('ログアウトエラー:', error);
            // エラーが発生してもクリーンアップは実行
            this.showNotification('ログアウト処理でエラーが発生しましたが、セッションをクリアします', 'warning');
            this.performLogoutCleanup();
        }
    }

        // ログアウト時のクリーンアップ処理（確実に実行）
        performLogoutCleanup() {
            // 時計を停止
            if (this.navbarClockInterval) {
                clearInterval(this.navbarClockInterval);
                this.navbarClockInterval = null;
            }
            
            // クリーンアップ
            if (this.currentModule) {
                this.currentModule.destroy();
                this.currentModule = null;
            }
            this.currentUser = null;
            this.stopSessionMonitoring();
            
            // 強制的にログイン画面へ
            setTimeout(() => {
                this.showLoginForm();
            }, 100);
        }
    // API呼び出しラッパー（修正版）
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
                    // 認証エラーの場合は必ずログイン画面へ
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
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }

    // セッション監視（修正版）
    startSessionMonitoring() {
        this.stopSessionMonitoring();
        
        // 利用者の場合はセッション監視を行わない（要件：セッションタイムアウトなし）
        if (this.currentUser.role === 'user') {
            console.log('利用者のため、セッション監視を無効化');
            return;
        }
        
        // 30分ごとにセッションチェック（スタッフ・管理者のみ）
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
        this.performLogoutCleanup();
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

    // 利用者用ログアウトボタン表示制御（出勤後に呼び出される）
    showLogoutButtonForUser() {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn && this.currentUser.role === 'user') {
            logoutBtn.style.display = 'inline-block';
        }
    }

    // 利用者用ログアウトボタン非表示制御（出勤前）
    hideLogoutButtonForUser() {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn && this.currentUser.role === 'user') {
            logoutBtn.style.display = 'none';
        }
    }
}

// アプリケーション起動
document.addEventListener('DOMContentLoaded', () => {
    const app = new AttendanceManagementSystem();
    app.init();
});