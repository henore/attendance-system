// routes/handover.js
// 申し送り事項API

const express = require('express');
const router = express.Router();

// 申し送り更新の制御用
const handoverUpdateControl = new Map();
const HANDOVER_UPDATE_COOLDOWN = 5 * 60 * 1000; // 5分

module.exports = (dbGet, dbAll, dbRun, requireAuth, requireRole) => {
    // 申し送り事項取得
    router.get('/handover', requireAuth, requireRole(['staff', 'admin']), async (req, res) => {
        try {
            const handover = await dbGet(
                'SELECT * FROM handover_notes ORDER BY created_at DESC LIMIT 1'
            );
            
            res.json({
                success: true,
                handover: handover || null
            });
            
        } catch (error) {
            console.error('申し送り事項取得エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: '申し送り事項の取得に失敗しました' 
            });
        }
    });
    
    // 申し送り事項更新（排他制御と5分間隔制限付き）
    router.post('/handover', requireAuth, requireRole(['staff', 'admin']), async (req, res) => {
        try {
            const { content } = req.body;
            const updatedBy = req.session.user.name;
            const userId = req.session.user.id;
            
            if (!content || content.trim() === '') {
                return res.status(400).json({ 
                    success: false, 
                    error: '申し送り事項を入力してください' 
                });
            }
            
            // 5分以内の更新制限チェック
            const lastUpdate = handoverUpdateControl.get(userId);
            if (lastUpdate) {
                const timeDiff = Date.now() - lastUpdate;
                if (timeDiff < HANDOVER_UPDATE_COOLDOWN) {
                    const remainingMinutes = Math.ceil((HANDOVER_UPDATE_COOLDOWN - timeDiff) / 60000);
                    return res.status(429).json({ 
                        success: false, 
                        error: `申し送り事項の更新は5分間隔で行ってください。あと${remainingMinutes}分お待ちください。` 
                    });
                }
            }
            
            // 最新の申し送りを取得（楽観的ロック）
            const latestHandover = await dbGet(
                'SELECT id, created_at FROM handover_notes ORDER BY created_at DESC LIMIT 1'
            );
            
            // 他のユーザーが同時に更新していないかチェック（1秒以内）
            if (latestHandover) {
                const lastUpdateTime = new Date(latestHandover.created_at).getTime();
                const now = Date.now();
                if (now - lastUpdateTime < 1000) {
                    return res.status(409).json({ 
                        success: false, 
                        error: '他のユーザーが申し送りを更新中です。しばらくしてから再度お試しください。' 
                    });
                }
            }
            
            // 申し送り更新
            await dbRun(`
                INSERT INTO handover_notes (content, updated_by)
                VALUES (?, ?)
            `, [content.trim(), updatedBy]);
            
            // 更新時刻を記録
            handoverUpdateControl.set(userId, Date.now());
            
            res.json({ 
                success: true,
                message: '申し送り事項を更新しました'
            });
            
        } catch (error) {
            console.error('申し送り事項更新エラー:', error);
            res.status(500).json({ 
                success: false, 
                error: '申し送り事項の更新に失敗しました' 
            });
        }
    });
    
    return router;
};