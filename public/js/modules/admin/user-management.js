// modules/admin/user-management.js
// 管理者ユーザー管理機能

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { modalManager } from '../shared/modal-manager.js';  // インポート追加

export default class AdminUserManagement {
    constructor(app, parentModule) {
        this.app = app;
        this.parent = parentModule;
        this.container = null;
    }

    async init(containerElement) {
        this.container = document.createElement('div');
        this.container.id = 'userManagementSection';
        this.container.className = 'admin-section';
        this.container.style.display = 'none';
        
        containerElement.appendChild(this.container);
        this.render();
        this.setupEventListeners();
    }

    render() {
        this.container.innerHTML = `
            <div class="row">
                <!-- ユーザー登録 -->
                <div class="col-lg-6">
                    <div class="custom-card">
                        <div class="custom-card-header">
                            <h5><i class="fas fa-user-plus"></i> 新規ユーザー登録</h5>
                        </div>
                        <div class="card-body">
                            <form id="userRegistrationForm" class="user-registration-form">
                                <div class="mb-3">
                                    <label for="newUsername" class="form-label">ユーザーID</label>
                                    <input type="text" class="form-control" id="newUsername" required>
                                    <div class="form-text">ログイン時に使用するIDです</div>
                                </div>
                                <div class="mb-3">
                                    <label for="newPassword" class="form-label">パスワード</label>
                                    <input type="password" class="form-control" id="newPassword" required>
                                    <div class="form-text">8文字以上推奨</div>
                                </div>
                                <div class="mb-3">
                                    <label for="newName" class="form-label">名前</label>
                                    <input type="text" class="form-control" id="newName" required>
                                    <div class="form-text">表示名として使用されます</div>
                                </div>
                                <div class="mb-3">
                                    <label for="newRole" class="form-label">権限</label>
                                    <select class="form-control" id="newRole" required>
                                        <option value="">選択してください</option>
                                        <option value="user">利用者</option>
                                        <option value="staff">スタッフ</option>
                                        <option value="admin">管理者</option>
                                    </select>
                                </div>
                                <div class="mb-3" id="serviceTypeGroup" style="display: none;">
                                    <label for="newServiceType" class="form-label">サービス区分</label>
                                    <select class="form-control" id="newServiceType">
                                        <option value="">選択してください</option>
                                        <option value="commute">通所</option>
                                        <option value="home">在宅</option>
                                    </select>
                                    <div class="form-text">利用者の場合は必須です</div>
                                </div>
                                <div class="mb-3" id="ServiceNoGroup" style="display: none;">
                                    <label for="newServiceNo" class="form-label">受給者番号</label>
                                    <input type="text" class="form-control" id="newServiceNo" required>
                                    <div class="form-text">受給者番号入力（印刷で使用）</div>
                                </div>
                                <button type="submit" class="btn btn-primary w-100" id="registerUserBtn">
                                    <i class="fas fa-user-plus"></i> ユーザー登録
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
                
                <!-- 既存ユーザー一覧 -->
                <div class="col-lg-6">
                    <div class="custom-card">
                        <div class="custom-card-header">
                            <h5><i class="fas fa-users"></i> 既存ユーザー一覧</h5>
                            <button class="btn btn-outline-light btn-sm" id="refreshUsersBtn">
                                <i class="fas fa-sync"></i> 更新
                            </button>
                        </div>
                        <div class="card-body">
                            <!-- 検索・フィルター -->
                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <input type="text" class="form-control form-control-sm" 
                                           id="userSearchInput" placeholder="名前・ユーザーIDで検索...">
                                </div>
                                <div class="col-md-6">
                                    <select class="form-control form-control-sm" id="roleFilterSelect">
                                        <option value="">全ての権限</option>
                                        <option value="user">利用者</option>
                                        <option value="staff">スタッフ</option>
                                        <option value="admin">管理者</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="existing-users-table">
                                <div id="existingUsersList">
                                    <div class="text-center p-4">
                                        <div class="spinner-border" role="status">
                                            <span class="visually-hidden">読み込み中...</span>
                                        </div>
                                        <p class="mt-2 text-muted">ユーザー一覧を読み込み中...</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- ユーザー編集モーダル -->
            <div class="modal fade" id="userEditModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-warning text-dark">
                            <h5 class="modal-title">
                                <i class="fas fa-user-edit"></i> ユーザー情報編集
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="userEditForm">
                                <input type="hidden" id="editUserId">
                                
                                <div class="row mb-3">
                                    <div class="col-md-6">
                                        <label for="editUsername" class="form-label">ユーザーID</label>
                                        <input type="text" class="form-control" id="editUsername" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label for="editPassword" class="form-label">パスワード</label>
                                        <div class="input-group">
                                            <input type="text" class="form-control" id="editPassword" 
                                                   placeholder="変更する場合のみ入力">
                                            <button class="btn btn-outline-secondary" type="button" 
                                                    id="generatePasswordBtn">
                                                <i class="fas fa-key"></i> 生成
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="row mb-3">
                                    <div class="col-md-6">
                                        <label for="editName" class="form-label">名前</label>
                                        <input type="text" class="form-control" id="editName" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label for="editRole" class="form-label">権限</label>
                                        <select class="form-control" id="editRole" required>
                                            <option value="user">利用者</option>
                                            <option value="staff">スタッフ</option>
                                            <option value="admin">管理者</option>
                                        </select>
                                    </div>
                                </div>
                                
                                <div class="mb-3" id="editServiceTypeGroup" style="display: none;">
                                    <label for="editServiceType" class="form-label">サービス区分</label>
                                    <select class="form-control" id="editServiceType">
                                        <option value="">選択してください</option>
                                        <option value="commute">通所</option>
                                        <option value="home">在宅</option>
                                    </select>
                                </div>
                                <div class="mb-3" id="editServiceNoGroup" style="display: none;>
                                        <label for="editServiceNo" class="form-label">受給者番号</label>
                                        <input type="text" class="form-control" id="editServiceNo" required>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times"></i> キャンセル
                            </button>
                            <button type="button" class="btn btn-warning" id="saveUserEditBtn">
                                <i class="fas fa-save"></i> 変更を保存
                            </button>
                        </div>
                    </div>
                </div>
            </div>
    `;
}
    setupEventListeners() {
        // ユーザー登録フォーム
        const form = this.container.querySelector('#userRegistrationForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleUserRegistration(e));
        }

        // 権限変更時のサービス区分表示切り替え
        const roleSelect = this.container.querySelector('#newRole');
        if (roleSelect) {
            roleSelect.addEventListener('change', () => this.toggleServiceTypeField());
        }

        // 更新ボタン
        const refreshBtn = this.container.querySelector('#refreshUsersBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refresh());
        }

        // 検索・フィルター
        const searchInput = this.container.querySelector('#userSearchInput');
        const roleFilter = this.container.querySelector('#roleFilterSelect');
        
        if (searchInput) {
            searchInput.addEventListener('input', () => this.filterUsers());
        }
        
        if (roleFilter) {
            roleFilter.addEventListener('change', () => this.filterUsers());
        }

        // モーダルを事前に登録
        try {
            modalManager.register('userDetailModal');
        } catch (error) {
            console.warn('モーダル登録エラー:', error);
        }

        // イベント委譲で動的ボタンを処理（修正）
        this.container.addEventListener('click', (e) => {
            // 無効化ボタン
            if (e.target.closest('.btn-deactivate-user')) {
                e.preventDefault();  // 追加
                const btn = e.target.closest('.btn-deactivate-user');
                const userId = btn.getAttribute('data-user-id');
                const userName = btn.getAttribute('data-user-name');
                this.deactivateUser(userId, userName);
            }
            
        // 詳細ボタン
        if (e.target.closest('.btn-user-detail')) {
            e.preventDefault();  // 追加
            const btn = e.target.closest('.btn-user-detail');
            const userId = btn.getAttribute('data-user-id');
            this.showUserEditModal(userId);
        }

        });
    }

    /**
     * ユーザー編集モーダルを表示
     */
    async showUserEditModal(userId) {
        try {
            const user = this.allUsers.find(u => u.id == userId);
            if (!user) {
                this.parent.showNotification('ユーザー情報が見つかりません', 'warning');
                return;
            }

            // フォームに値を設定
            document.getElementById('editUserId').value = user.id;
            document.getElementById('editUsername').value = user.username;
            document.getElementById('editName').value = user.name;
            document.getElementById('editRole').value = user.role;
            document.getElementById('editPassword').value = '';
            

            // サービス区分の表示制御
            const serviceTypeGroup = document.getElementById('editServiceTypeGroup');
            const serviceTypeSelect = document.getElementById('editServiceType');
             
            if (user.role === 'user') {
                serviceTypeGroup.style.display = 'block';
                serviceTypeSelect.value = user.service_type || '';
                serviceTypeSelect.required = true;

                document.getElementById('editServiceNo').value = user.service_no;
                editServiceNoGroup.style.display = 'block';
                editServiceNoGroup.required = true;


            } else {
                serviceTypeGroup.style.display = 'none';
                serviceTypeSelect.value = '';
                serviceTypeSelect.required = false;

                editServiceNoGroup.style.display = 'none';
                editServiceNoGroup.required = false;
            }

            // パスワード生成ボタン
            const generateBtn = document.getElementById('generatePasswordBtn');
            if (generateBtn) {
                generateBtn.replaceWith(generateBtn.cloneNode(true));
                document.getElementById('generatePasswordBtn').addEventListener('click', () => {
                    const password = this.generateRandomPassword();
                    document.getElementById('editPassword').value = password;
                });
            }

            // 権限変更時のイベント
            const roleSelect = document.getElementById('editRole');
            if (roleSelect) {
                roleSelect.replaceWith(roleSelect.cloneNode(true));
                document.getElementById('editRole').addEventListener('change', (e) => {
                    const editServiceTypeGroup = document.getElementById('editServiceTypeGroup');
                    const editServiceType = document.getElementById('editServiceType');
                    
                    if (e.target.value === 'user') {
                        editServiceTypeGroup.style.display = 'block';
                        editServiceType.required = true;

                        document.getElementById('editServiceNo').value = user.service_no;
                        editServiceNoGroup.style.display = 'block';
                        editServiceNoGroup.required = true;
                    } else {
                        editServiceTypeGroup.style.display = 'none';
                        editServiceType.required = false;
                        editServiceType.value = '';

                        editServiceNoGroup.style.display = 'none';
                        editServiceNoGroup.required = false;
                    }
                });
            }

            // 保存ボタン
            const saveBtn = document.getElementById('saveUserEditBtn');
            if (saveBtn) {
                saveBtn.replaceWith(saveBtn.cloneNode(true));
                document.getElementById('saveUserEditBtn').addEventListener('click', () => {
                    this.saveUserEdit();
                });
            }

            // モーダル表示
            const modal = new bootstrap.Modal(document.getElementById('userEditModal'));
            modal.show();

        } catch (error) {
            console.error('ユーザー編集モーダル表示エラー:', error);
            this.parent.showNotification('エラーが発生しました', 'danger');
        }
    }

    /**
     * ランダムパスワード生成
     */
    generateRandomPassword() {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let password = '';
        for (let i = 0; i < 8; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }

    /**
     * ユーザー編集保存
     */
    async saveUserEdit() {
        const userId = document.getElementById('editUserId').value;
        const username = document.getElementById('editUsername').value.trim();
        const password = document.getElementById('editPassword').value;
        const name = document.getElementById('editName').value.trim();
        const role = document.getElementById('editRole').value;
        const serviceType = document.getElementById('editServiceType').value;
        const service_no = document.getElementById('editServiceNo').value;

        // バリデーション
        if (!username || !name || !role) {
            this.parent.showNotification('必須項目を入力してください', 'warning');
            return;
        }

        if (role === 'user' && !serviceType) {
            this.parent.showNotification('利用者の場合はサービス区分を選択してください', 'warning');
            return;
        }

        if (role === 'user' && !service_no) {
            this.parent.showNotification('利用者の場合は受給者番号を入力して下さい', 'warning');
            return;
        }

        // 確認ダイアログ
        const confirmed = await this.parent.showConfirm({
            title: 'ユーザー情報変更',
            message: `${name}さんの情報を変更しますか？`,
            confirmText: '変更する',
            confirmClass: 'btn-warning',
            icon: 'fas fa-edit'
        });

        if (!confirmed) return;

        try {
            const requestData = {
                userId,
                username,
                name,
                role,
                serviceType: role === 'user' ? serviceType : null,
                service_no
            };

            if (password) {
                requestData.password = password;
            }

            await this.parent.callApi('/api/admin/user/update', {
                method: 'PUT',
                body: JSON.stringify(requestData)
            });

            this.parent.showNotification('ユーザー情報を更新しました', 'success');
            
            // モーダルを閉じる
            bootstrap.Modal.getInstance(document.getElementById('userEditModal')).hide();
            
            // ユーザー一覧を更新
            await this.loadExistingUsers();

        } catch (error) {
            console.error('ユーザー編集エラー:', error);
            this.parent.showNotification(error.message || 'ユーザー情報の更新に失敗しました', 'danger');
        }
    }

    /**
     * ランダムパスワード生成
     */
    generateRandomPassword() {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let password = '';
        for (let i = 0; i < 8; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }

    /**
     * ユーザー編集保存
     */
    async saveUserEdit() {
        const userId = document.getElementById('editUserId').value;
        const username = document.getElementById('editUsername').value.trim();
        const password = document.getElementById('editPassword').value;
        const name = document.getElementById('editName').value.trim();
        const role = document.getElementById('editRole').value;
        const serviceType = document.getElementById('editServiceType').value;
        const service_no = document.getElementById('editServiceNo').value;

        // バリデーション
        if (!username || !name || !role) {
            this.parent.showNotification('必須項目を入力してください', 'warning');
            return;
        }

        if (role === 'user' && !serviceType) {
            this.parent.showNotification('利用者の場合はサービス区分を選択してください', 'warning');
            return;
        }
        if (role === 'user' && !service_no) {
            this.parent.showNotification('利用者の場合は受給者番号を入力して下さい', 'warning');
            return;
        }

        // 確認ダイアログ
        const confirmed = await this.parent.showConfirm({
            title: 'ユーザー情報変更',
            message: `${name}さんの情報を変更しますか？`,
            confirmText: '変更する',
            confirmClass: 'btn-warning',
            icon: 'fas fa-edit'
        });

        if (!confirmed) return;

        try {
            const requestData = {
                userId,
                username,
                name,
                role,
                serviceType: role === 'user' ? serviceType : null,
                service_no
            };

            if (password) {
                requestData.password = password;
            }

            await this.parent.callApi('/api/admin/user/update', {
                method: 'PUT',
                body: JSON.stringify(requestData)
            });

            this.parent.showNotification('ユーザー情報を更新しました', 'success');
            
            // モーダルを閉じる
            bootstrap.Modal.getInstance(document.getElementById('userEditModal')).hide();
            
            // ユーザー一覧を更新
            await this.loadExistingUsers();

        } catch (error) {
            console.error('ユーザー編集エラー:', error);
            this.parent.showNotification(error.message || 'ユーザー情報の更新に失敗しました', 'danger');
        }
    }

    async show() {
        this.container.style.display = 'block';
        await this.loadData();
    }

    hide() {
        this.container.style.display = 'none';
    }

    async refresh() {
        await this.loadData();
        this.parent.showNotification('ユーザー一覧を更新しました', 'info');
    }

    async loadData() {
        await this.loadExistingUsers();
    }

    toggleServiceTypeField() {
        const roleSelect = this.container.querySelector('#newRole');
        const serviceTypeGroup = this.container.querySelector('#serviceTypeGroup');
        const serviceTypeSelect = this.container.querySelector('#newServiceType');
        const ServiesNoGroup = this.container.querySelector('#ServiceNoGroup');
        
        if (roleSelect.value === 'user') {
            serviceTypeGroup.style.display = 'block';
            serviceTypeSelect.required = true;

            ServiesNoGroup.style.display = 'block';
            ServiesNoGroup.required = true;

        } else {
            serviceTypeGroup.style.display = 'none';
            serviceTypeSelect.required = false;
            serviceTypeSelect.value = '';
            
            ServiesNoGroup.style.display = 'none';
            ServiesNoGroup.required = false;
        }
    }

    async handleUserRegistration(e) {
        e.preventDefault();

        const formData = {
            username: this.container.querySelector('#newUsername').value.trim(),
            password: this.container.querySelector('#newPassword').value,
            name: this.container.querySelector('#newName').value.trim(),
            role: this.container.querySelector('#newRole').value,
            serviceType: this.container.querySelector('#newServiceType').value,
            ServiceNo: this.container.querySelector('#newServiceNo').value
         };

        // バリデーション
        if (!this.validateUserRegistration(formData)) {
            return;
        }

        const registerBtn = this.container.querySelector('#registerUserBtn');
        const originalText = registerBtn.innerHTML;
        
        try {
            // ボタンを無効化
            registerBtn.disabled = true;
            registerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 登録中...';

            await this.parent.callApi(API_ENDPOINTS.ADMIN.REGISTER, {
                method: 'POST',
                body: JSON.stringify(formData)
            });

            this.parent.showNotification('ユーザーが正常に登録されました', 'success');
            
            // フォームをリセット
            this.container.querySelector('#userRegistrationForm').reset();
            this.toggleServiceTypeField();
            
            // ユーザー一覧を更新
            await this.loadExistingUsers();
            
        } catch (error) {
            console.error('ユーザー登録エラー:', error);
            this.parent.showNotification(error.message || 'ユーザー登録に失敗しました', 'danger');
        } finally {
            // ボタンを有効化
            registerBtn.disabled = false;
            registerBtn.innerHTML = originalText;
        }
    }

    validateUserRegistration(formData) {
        // ユーザーID検証
        if (!formData.username) {
            this.parent.showNotification('ユーザーIDを入力してください', 'warning');
            return false;
        }
        
        if (formData.username.length < 3) {
            this.parent.showNotification('ユーザーIDは3文字以上で入力してください', 'warning');
            return false;
        }

        // パスワード検証
        if (!formData.password) {
            this.parent.showNotification('パスワードを入力してください', 'warning');
            return false;
        }
        
        if (formData.password.length < 4) {
            this.parent.showNotification('パスワードは4文字以上で入力してください', 'warning');
            return false;
        }

        // 名前検証
        if (!formData.name) {
            this.parent.showNotification('名前を入力してください', 'warning');
            return false;
        }

        // 権限検証
        if (!formData.role) {
            this.parent.showNotification('権限を選択してください', 'warning');
            return false;
        }

        // 利用者の場合はサービス区分必須
        if (formData.role === 'user' && !formData.serviceType) {
            this.parent.showNotification('利用者の場合はサービス区分を選択してください', 'warning');
            return false;
        }
        // 受給者番号
        if (formData.role === 'user' && !formData.ServiceNo) {
            this.parent.showNotification('利用者の場合は受給者番号を入力して下さい', 'warning');
            return false;
        }
        return true;
    }

    async loadExistingUsers() {
        try {
            const response = await this.parent.callApi(API_ENDPOINTS.ADMIN.USERS);
            this.allUsers = response.users || [];
            this.updateUsersList(this.allUsers);
        } catch (error) {
            console.error('既存ユーザー読み込みエラー:', error);
            this.showUsersError('ユーザー一覧の読み込みに失敗しました');
        }
    }

    filterUsers() {
        if (!this.allUsers) return;

        const searchTerm = this.container.querySelector('#userSearchInput').value.toLowerCase();
        const roleFilter = this.container.querySelector('#roleFilterSelect').value;

        let filteredUsers = this.allUsers.filter(user => {
            const matchesSearch = !searchTerm || 
                user.name.toLowerCase().includes(searchTerm) ||
                user.username.toLowerCase().includes(searchTerm);
            
            const matchesRole = !roleFilter || user.role === roleFilter;

            return matchesSearch && matchesRole;
        });

        this.updateUsersList(filteredUsers);
    }

    updateUsersList(users) {
        const usersList = this.container.querySelector('#existingUsersList');
        
        if (!users || users.length === 0) {
            usersList.innerHTML = '<p class="text-muted text-center">該当するユーザーがありません</p>';
            return;
        }

        usersList.innerHTML = this.generateExistingUsersList(users);
    }

    generateExistingUsersList(users) {
        let html = `
            <div class="table-responsive">
                <table class="table table-hover table-sm">
                    <thead class="table-light">
                        <tr>
                            <th>ユーザーID</th>
                            <th>名前</th>
                            <th>権限</th>
                            <th>サービス区分</th>
                            <th>登録日</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        users.forEach(user => {
            const roleClass = this.parent.getRoleColor(user.role);
            const serviceType = user.service_type ? 
                this.parent.getServiceTypeDisplayName(user.service_type) : '-';
            const registrationDate = new Date(user.created_at).toLocaleDateString('ja-JP');
            
            // デフォルトユーザーかチェック
            const defaultUsers = ['admin', 'staff1', 'user1', 'user2'];
            const isDefaultUser = defaultUsers.includes(user.username);

            html += `
                <tr>
                    <td>
                        <code>${user.username}</code>
                        ${isDefaultUser ? '<span class="badge bg-secondary ms-1">デフォルト</span>' : ''}
                    </td>
                    <td><strong>${user.name}</strong></td>
                    <td><span class="badge bg-${roleClass}">${this.parent.getRoleDisplayName(user.role)}</span></td>
                    <td>${serviceType}</td>
                    <td><small>${registrationDate}</small></td>
                    <td>
                        <div class="btn-group" role="group">
                            <button class="btn btn-sm btn-outline-info btn-user-detail" 
                                    data-user-id="${user.id}"
                                    title="詳細表示">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger btn-deactivate-user" 
                                    data-user-id="${user.id}"
                                    data-user-name="${user.name}"
                                    ${isDefaultUser ? 'disabled title="デフォルトユーザーは無効化できません"' : 'title="無効化"'}>
                                <i class="fas fa-ban"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        return html;
    }

    async showUserDetail(userId) {
        try {
            const user = this.allUsers.find(u => u.id == userId);
            if (!user) {
                this.parent.showNotification('ユーザー情報が見つかりません', 'warning');
                return;
            }

            const content = this.container.querySelector('#userDetailContent');
            if (content) {
                content.innerHTML = this.generateUserDetailContent(user);

                // Bootstrap モーダルを直接使用
                const modalElement = document.getElementById('userDetailModal');
                const modal = new bootstrap.Modal(modalElement, {
                    backdrop: true,
                    keyboard: true
                });
                
                // モーダルが閉じられた時の処理
                modalElement.addEventListener('hidden.bs.modal', () => {
                    // 背景のグレーアウトを確実に削除
                    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
                        backdrop.remove();
                    });
                    document.body.classList.remove('modal-open');
                    document.body.style.removeProperty('padding-right');
                }, { once: true });
                
                modal.show();
            }

        } catch (error) {
            console.error('ユーザー詳細表示エラー:', error);
            this.parent.showNotification('ユーザー詳細の取得に失敗しました', 'danger');
        }
    }
    
    generateUserDetailContent(user) {
        const defaultUsers = ['admin', 'staff1', 'user1', 'user2'];
        const isDefaultUser = defaultUsers.includes(user.username);
        const roleClass = this.parent.getRoleColor(user.role);
        const serviceType = user.service_type ? 
            this.parent.getServiceTypeDisplayName(user.service_type) : '未設定';

        return `
            <div class="row">
                <div class="col-md-6">
                    <h6><i class="fas fa-id-card"></i> 基本情報</h6>
                    <table class="table table-borderless table-sm">
                        <tr>
                            <th width="100">ユーザーID:</th>
                            <td>
                                <code>${user.username}</code>
                                ${isDefaultUser ? '<span class="badge bg-secondary ms-1">デフォルト</span>' : ''}
                            </td>
                        </tr>
                        <tr>
                            <th>名前:</th>
                            <td><strong>${user.name}</strong></td>
                        </tr>
                        <tr>
                            <th>権限:</th>
                            <td><span class="badge bg-${roleClass}">${this.parent.getRoleDisplayName(user.role)}</span></td>
                        </tr>
                        <tr>
                            <th>サービス区分:</th>
                            <td>${serviceType}</td>
                        </tr>
                        <tr>
                            <th>登録日:</th>
                            <td>${new Date(user.created_at).toLocaleDateString('ja-JP')}</td>
                        </tr>
                        <tr>
                            <th>状態:</th>
                            <td><span class="badge bg-success">有効</span></td>
                        </tr>
                    </table>
                </div>
                <div class="col-md-6">
                    <h6><i class="fas fa-chart-line"></i> 利用統計</h6>
                    <div class="alert alert-info">
                        <i class="fas fa-info-circle"></i> 利用統計は今後の機能として実装予定です
                    </div>
                </div>
            </div>

            ${user.role === 'user' ? `
                <hr>
                <div class="row">
                    <div class="col-12">
                        <h6><i class="fas fa-notes-medical"></i> 追加情報</h6>
                        <p class="text-muted">利用者固有の設定や情報がここに表示されます。</p>
                    </div>
                </div>
            ` : ''}
        `;
    }

    async deactivateUser(userId, userName) {
        const confirmed = await this.parent.showConfirm({
            title: 'ユーザー無効化',
            message: `${userName}さんを無効化しますか？<br><strong>この操作は取り消せません。</strong>`,
            confirmText: '無効化',
            confirmClass: 'btn-danger',
            icon: 'fas fa-ban'
        });

        if (!confirmed) return;

        try {
            await this.parent.callApi(API_ENDPOINTS.ADMIN.RETIRE_USER(userId), { 
                method: 'PUT' 
            });
            
            this.parent.showNotification(`${userName}さんを無効化しました`, 'info');
            await this.loadExistingUsers();
            
        } catch (error) {
            console.error('ユーザー無効化エラー:', error);
            this.parent.showNotification(error.message || 'ユーザー無効化に失敗しました', 'danger');
        }
    }

    showUsersError(message) {
        const usersList = this.container.querySelector('#existingUsersList');
        usersList.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i> ${message}
            </div>
        `;
    }

    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}