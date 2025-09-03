const { body, param, query, validationResult } = require('express-validator');

class ValidationRules {
    // エラーハンドリングミドルウェア
    static handleValidationErrors(req, res, next) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const errorMessages = errors.array().map(error => `${error.path}: ${error.msg}`);
            return res.status(400).json({
                success: false,
                error: 'バリデーションエラー',
                details: errorMessages
            });
        }
        next();
    }

    // 認証関連
    static loginValidation() {
        return [
            body('username')
                .isLength({ min: 1, max: 50 })
                .withMessage('ユーザー名は1文字以上50文字以下で入力してください')
                .matches(/^[a-zA-Z0-9_]+$/)
                .withMessage('ユーザー名は英数字とアンダースコアのみ使用可能です'),
            
            body('password')
                .isLength({ min: 1 })
                .withMessage('パスワードを入力してください'),
            
            this.handleValidationErrors
        ];
    }

    // ユーザー管理
    static userCreationValidation() {
        return [
            body('username')
                .isLength({ min: 1, max: 50 })
                .withMessage('ユーザー名は1文字以上50文字以下で入力してください')
                .matches(/^[a-zA-Z0-9_]+$/)
                .withMessage('ユーザー名は英数字とアンダースコアのみ使用可能です'),
            
            body('name')
                .isLength({ min: 1, max: 100 })
                .withMessage('名前は1文字以上100文字以下で入力してください')
                .matches(/^[^\<\>\&\"\']*$/)
                .withMessage('名前に無効な文字が含まれています'),
            
            body('password')
                .isLength({ min: 8, max: 128 })
                .withMessage('パスワードは8文字以上128文字以下で入力してください')
                .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/)
                .withMessage('パスワードは大文字、小文字、数字を含む必要があります'),
            
            body('role')
                .isIn(['user', 'staff', 'admin'])
                .withMessage('無効な役割が指定されています'),
            
            body('serviceType')
                .isIn(['commute', 'home'])
                .withMessage('無効なサービス種別が指定されています'),
            
            this.handleValidationErrors
        ];
    }

    // 出勤記録
    static attendanceValidation() {
        return [
            body('date')
                .optional()
                .isISO8601()
                .withMessage('無効な日付形式です'),
            
            body('clockInTime')
                .optional()
                .matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
                .withMessage('無効な時刻形式です（HH:MM）'),
            
            body('clockOutTime')
                .optional()
                .matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
                .withMessage('無効な時刻形式です（HH:MM）'),
            
            this.handleValidationErrors
        ];
    }

    // 日報
    static reportValidation() {
        return [
            body('bodyTemperature')
                .optional()
                .isFloat({ min: 30.0, max: 45.0 })
                .withMessage('体温は30.0〜45.0の範囲で入力してください'),
            
            body('notes')
                .optional()
                .isLength({ max: 1000 })
                .withMessage('特記事項は1000文字以下で入力してください')
                .matches(/^[^\<\>\&]*$/)
                .withMessage('特記事項に無効な文字が含まれています'),
            
            this.handleValidationErrors
        ];
    }

    // コメント
    static commentValidation() {
        return [
            body('comment')
                .isLength({ min: 1, max: 500 })
                .withMessage('コメントは1文字以上500文字以下で入力してください')
                .matches(/^[^\<\>\&]*$/)
                .withMessage('コメントに無効な文字が含まれています'),
            
            this.handleValidationErrors
        ];
    }

    // 申し送り
    static handoverValidation() {
        return [
            body('content')
                .isLength({ min: 1, max: 2000 })
                .withMessage('申し送り内容は1文字以上2000文字以下で入力してください')
                .matches(/^[^\<\>\&]*$/)
                .withMessage('申し送り内容に無効な文字が含まれています'),
            
            this.handleValidationErrors
        ];
    }

    // パラメータバリデーション
    static userIdValidation() {
        return [
            param('userId')
                .isInt({ min: 1 })
                .withMessage('無効なユーザーIDです'),
            
            this.handleValidationErrors
        ];
    }

    static dateValidation() {
        return [
            param('date')
                .matches(/^\d{4}-\d{2}-\d{2}$/)
                .withMessage('無効な日付形式です（YYYY-MM-DD）'),
            
            this.handleValidationErrors
        ];
    }

    // クエリパラメータバリデーション
    static paginationValidation() {
        return [
            query('page')
                .optional()
                .isInt({ min: 1 })
                .withMessage('ページ番号は1以上の整数である必要があります'),
            
            query('limit')
                .optional()
                .isInt({ min: 1, max: 100 })
                .withMessage('取得件数は1〜100の範囲で指定してください'),
            
            this.handleValidationErrors
        ];
    }

    // 月次検索
    static monthlySearchValidation() {
        return [
            query('year')
                .isInt({ min: 2020, max: 2030 })
                .withMessage('年は2020〜2030の範囲で指定してください'),
            
            query('month')
                .isInt({ min: 1, max: 12 })
                .withMessage('月は1〜12の範囲で指定してください'),
            
            query('userId')
                .optional()
                .isInt({ min: 1 })
                .withMessage('無効なユーザーIDです'),
            
            this.handleValidationErrors
        ];
    }
}

module.exports = ValidationRules;