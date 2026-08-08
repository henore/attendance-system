// routes/admin/users.js
// 管理者API - ユーザー管理

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

module.exports = (dbGet, dbAll, dbRun, requireAuth, requireRole) => {
    // ユーザー登録
    router.post('/register', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { username, password, name, role, serviceType, ServiceNo, transportation, skills, hourly_wage, certificate_expiry } = req.body;

            // バリデーション
            if (!username || !password || !name || !role) {
                return res.status(400).json({
                    success: false,
                    error: '必須項目が不足しています'
                });
            }

            if (username.length < 3) {
                return res.status(400).json({
                    success: false,
                    error: 'ユーザーIDは3文字以上で入力してください'
                });
            }

            if (password.length < 4) {
                return res.status(400).json({
                    success: false,
                    error: 'パスワードは4文字以上で入力してください'
                });
            }

            if (role === 'user' && !serviceType) {
                return res.status(400).json({
                    success: false,
                    error: '利用者の場合はサービス区分を選択してください'
                });
            }

            if (role === 'user' && !ServiceNo) {
                return res.status(400).json({
                    success: false,
                    error: '利用者の場合は受給者番号を入力して下さい'
                });
            }

            // 受給者番号・送迎・スキルの処理
            const finalServiceNo = role === 'user' ? ServiceNo : null;
            const finalServiceType = role === 'user' ? serviceType : null;
            const finalTransportation = (role === 'user' && serviceType === 'commute') ? (transportation ? 1 : null) : null;
            const finalSkills = (role === 'user' && Array.isArray(skills) && skills.length > 0) ? skills.join(',') : null;
            const finalHourlyWage = (role === 'user' && hourly_wage != null && hourly_wage !== '') ? parseInt(hourly_wage) : null;
            const finalCertificateExpiry = (role === 'user' && certificate_expiry) ? certificate_expiry : null;

            // パスワードのハッシュ化
            const hashedPassword = await bcrypt.hash(password, 10);

            // 重複チェック
            const existing = await dbGet(
                'SELECT * FROM users WHERE username = ?',
                [username]
            );

            if (existing) {
                return res.status(400).json({
                    success: false,
                    error: '同じユーザーIDが既に存在します'
                });
            }

            // ユーザー登録
            const result = await dbRun(
                'INSERT INTO users (username, password, name, role, service_type, service_no, transportation, skills, hourly_wage, certificate_expiry) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [username, hashedPassword, name, role, finalServiceType, finalServiceNo, finalTransportation, finalSkills, finalHourlyWage, finalCertificateExpiry]
            );

            // 管理者操作は監査ログに記録しない

            res.json({
                success: true,
                message: `ユーザー「${name}」を正常に登録しました`
            });

        } catch (error) {
            console.error('ユーザー登録エラー:', error);
            if (error.message && error.message.includes('UNIQUE')) {
                res.status(400).json({
                    success: false,
                    error: 'このユーザーIDは既に使用されています'
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: 'ユーザー登録処理でエラーが発生しました'
                });
            }
        }
    });

    // 全ユーザー取得（無効化ユーザーを除く、退職者は含む）
    router.get('/users', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { role } = req.query;
            let query = `
                SELECT id, username, name, role, service_type, is_active, created_at, service_no, workweek, transportation, skills, hourly_wage, certificate_expiry
                FROM users
                WHERE is_active >= 1
            `;
            const params = [];

            if (role) {
                query += ' AND role = ?';
                params.push(role);
            }

            query += ' ORDER BY role, name';

            const users = await dbAll(query, params);
            res.json({
                success: true,
                users
            });

        } catch (error) {
            console.error('ユーザー一覧取得エラー:', error);
            res.status(500).json({
                success: false,
                error: 'ユーザー一覧の取得に失敗しました'
            });
        }
    });

    // ユーザー情報更新
    router.put('/user/update', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { userId, username, password, name, role, serviceType, service_no, workweek, transportation, skills, hourly_wage, certificate_expiry } = req.body;

            // バリデーション
            if (!userId || !username || !name || !role) {
                return res.status(400).json({
                    success: false,
                    error: '必須項目が不足しています'
                });
            }

            const finalServiceNo = role === 'user' ? service_no : null;
            const finalTransportation = (role === 'user' && serviceType === 'commute') ? (transportation ? 1 : null) : null;
            const finalSkills = (role === 'user' && Array.isArray(skills) && skills.length > 0) ? skills.join(',') : null;
            const finalHourlyWage = (role === 'user' && hourly_wage != null && hourly_wage !== '') ? parseInt(hourly_wage) : null;
            const finalCertificateExpiry = (role === 'user' && certificate_expiry) ? certificate_expiry : null;

            // 重複チェック（自分以外）
            const existing = await dbGet(
                'SELECT * FROM users WHERE username = ? AND id != ?',
                [username, userId]
            );

            if (existing) {
                return res.status(400).json({
                    success: false,
                    error: '同じユーザーIDが既に存在します'
                });
            }

            // 更新クエリ構築
            let updateQuery = 'UPDATE users SET username = ?, name = ?, role = ?, service_type = ?, service_no = ?, transportation = ?, skills = ?, hourly_wage = ?, certificate_expiry = ?, updated_at = CURRENT_TIMESTAMP';
            const params = [username, name, role, serviceType, finalServiceNo, finalTransportation, finalSkills, finalHourlyWage, finalCertificateExpiry];

            // パスワード変更がある場合
            if (password) {
                const hashedPassword = await bcrypt.hash(password, 10);
                updateQuery += ', password = ?';
                params.push(hashedPassword);
            }

            updateQuery += ', workweek = ?';
            params.push(workweek || '');

            updateQuery += ' WHERE id = ?';
            params.push(userId);

            await dbRun(updateQuery, params);

            // 管理者操作は監査ログに記録しない

            res.json({
                success: true,
                message: 'ユーザー情報を更新しました'
            });

        } catch (error) {
            console.error('ユーザー更新エラー:', error);
            res.status(500).json({
                success: false,
                error: 'ユーザー情報の更新に失敗しました'
            });
        }
    });

    // ユーザー無効化処理
    router.put('/retire/:userId', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { userId } = req.params;

            // ユーザー存在確認
            const user = await dbGet(
                'SELECT username, name, is_active FROM users WHERE id = ? AND is_active >= 1',
                [userId]
            );

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'ユーザーが見つかりません'
                });
            }

            // デフォルトユーザーは無効化不可
            const defaultUsers = ['admin', 'staff1', 'user1', 'user2'];
            if (defaultUsers.includes(user.username)) {
                return res.status(400).json({
                    success: false,
                    error: 'デフォルトユーザーは無効化できません'
                });
            }

            // 無効化実行
            await dbRun(
                'UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [userId]
            );

            // 管理者操作は監査ログに記録しない

            res.json({
                success: true,
                message: `ユーザー「${user.name}」を無効化しました`
            });

        } catch (error) {
            console.error('ユーザー無効化エラー:', error);
            res.status(500).json({
                success: false,
                error: 'ユーザー無効化処理でエラーが発生しました'
            });
        }
    });

    // 退職/復職トグル
    router.put('/users/:userId/toggle-retire', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { userId } = req.params;

            const user = await dbGet(
                'SELECT id, username, name, role, is_active FROM users WHERE id = ? AND is_active >= 1',
                [userId]
            );

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'ユーザーが見つかりません'
                });
            }

            const defaultUsers = ['admin', 'staff1', 'user1', 'user2'];
            const retireLabel = user.role === 'user' ? '退所' : '退職';
            if (defaultUsers.includes(user.username)) {
                return res.status(400).json({
                    success: false,
                    error: `デフォルトユーザーは${retireLabel}処理できません`
                });
            }

            const newStatus = user.is_active === 1 ? 2 : 1;
            const actionLabel = newStatus === 2 ? retireLabel : '復帰';

            await dbRun(
                'UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [newStatus, userId]
            );

            // 監査ログに記録
            await dbRun(
                `INSERT INTO audit_log (admin_id, action_type, target_id, target_type, target_name, old_value, new_value, reason, ip_address)
                 VALUES (?, ?, ?, 'user', ?, ?, ?, ?, ?)`,
                [
                    req.session.user.id,
                    newStatus === 2 ? 'user_retire' : 'user_reinstate',
                    userId,
                    user.name,
                    JSON.stringify({ is_active: user.is_active }),
                    JSON.stringify({ is_active: newStatus }),
                    `${user.name}を${actionLabel}処理`,
                    req.ip
                ]
            );

            res.json({
                success: true,
                message: `${user.name}さんを${actionLabel}しました`,
                is_active: newStatus
            });

        } catch (error) {
            console.error('退職/復職処理エラー:', error);
            res.status(500).json({
                success: false,
                error: '退職/復職処理でエラーが発生しました'
            });
        }
    });

    return router;
};
