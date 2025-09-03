const crypto = require('crypto');

class CSRFProtection {
    constructor() {
        this.tokenSecret = process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production';
    }

    generateToken(sessionId) {
        const timestamp = Date.now().toString();
        const randomBytes = crypto.randomBytes(16).toString('hex');
        const payload = `${sessionId}:${timestamp}:${randomBytes}`;
        
        const hmac = crypto.createHmac('sha256', this.tokenSecret);
        hmac.update(payload);
        const signature = hmac.digest('hex');
        
        const token = Buffer.from(`${payload}:${signature}`).toString('base64');
        return token;
    }

    verifyToken(token, sessionId) {
        try {
            const decoded = Buffer.from(token, 'base64').toString('utf8');
            const parts = decoded.split(':');
            
            if (parts.length !== 4) {
                return false;
            }
            
            const [tokenSessionId, timestamp, randomBytes, signature] = parts;
            
            if (tokenSessionId !== sessionId) {
                return false;
            }
            
            const now = Date.now();
            const tokenTime = parseInt(timestamp, 10);
            const maxAge = 60 * 60 * 1000; // 1時間
            
            if (now - tokenTime > maxAge) {
                return false;
            }
            
            const payload = `${tokenSessionId}:${timestamp}:${randomBytes}`;
            const hmac = crypto.createHmac('sha256', this.tokenSecret);
            hmac.update(payload);
            const expectedSignature = hmac.digest('hex');
            
            return crypto.timingSafeEqual(
                Buffer.from(signature, 'hex'),
                Buffer.from(expectedSignature, 'hex')
            );
        } catch (error) {
            console.error('CSRF token verification error:', error);
            return false;
        }
    }

    middleware() {
        return (req, res, next) => {
            if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
                return next();
            }
            
            if (!req.session || !req.session.id) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'セッションが無効です' 
                });
            }
            
            const token = req.body._csrf || 
                         req.query._csrf || 
                         req.headers['x-csrf-token'] ||
                         req.headers['csrf-token'];
            
            if (!token) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'CSRFトークンが必要です' 
                });
            }
            
            if (!this.verifyToken(token, req.session.id)) {
                return res.status(403).json({ 
                    success: false, 
                    error: '無効なCSRFトークンです' 
                });
            }
            
            next();
        };
    }

    tokenEndpoint() {
        return (req, res) => {
            if (!req.session || !req.session.id) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'セッションが無効です' 
                });
            }
            
            const token = this.generateToken(req.session.id);
            res.json({ 
                success: true, 
                csrf_token: token 
            });
        };
    }
}

module.exports = new CSRFProtection();