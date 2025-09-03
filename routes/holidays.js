// routes/holidays.js
// 祝日データ取得API（内閣府API代理）

const express = require('express');
const router = express.Router();
const https = require('https');

module.exports = (requireAuth) => {
    console.log('🔧 holidays router loaded');
    
    // 祝日データキャッシュ（1日間有効）
    let holidaysCache = null;
    let cacheExpiry = null;
    
    /**
     * 祝日データ取得エンドポイント
     */
    router.get('/', requireAuth, async (req, res) => {
        try {
            const now = Date.now();
            
            // キャッシュが有効な場合は返す
            if (holidaysCache && cacheExpiry && now < cacheExpiry) {
                console.log('📋 祝日データをキャッシュから返却');
                return res.json({
                    success: true,
                    holidays: holidaysCache,
                    cached: true
                });
            }
            
            console.log('🔄 内閣府祝日APIを呼び出し中...');
            
            // 内閣府APIから祝日データを取得
            const holidayData = await fetchHolidaysFromApi();
            
            // キャッシュを更新（1日間有効）
            holidaysCache = holidayData;
            cacheExpiry = now + (24 * 60 * 60 * 1000);
            
            console.log('✅ 祝日データを取得・キャッシュしました');
            
            res.json({
                success: true,
                holidays: holidayData,
                cached: false
            });
            
        } catch (error) {
            console.error('祝日データ取得エラー:', error);
            res.status(500).json({
                success: false,
                error: '祝日データの取得に失敗しました',
                details: error.message
            });
        }
    });
    
    /**
     * 内閣府APIから祝日データを取得
     * @returns {Promise<Object>}
     */
    function fetchHolidaysFromApi() {
        return new Promise((resolve, reject) => {
            const url = 'https://holidays-jp.github.io/api/v1/date.json';
            
            https.get(url, (response) => {
                let data = '';
                
                response.on('data', (chunk) => {
                    data += chunk;
                });
                
                response.on('end', () => {
                    try {
                        const jsonData = JSON.parse(data);
                        console.log('📅 取得した祝日データ件数:', Object.keys(jsonData).length);
                        resolve(jsonData);
                    } catch (parseError) {
                        reject(new Error('祝日データのパースに失敗しました'));
                    }
                });
                
            }).on('error', (error) => {
                reject(new Error(`祝日API通信エラー: ${error.message}`));
            });
        });
    }
    
    return router;
};