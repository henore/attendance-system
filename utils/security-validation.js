// utils/security-validation.js
// セキュリティ強化された入力検証ユーティリティ

/**
 * HTMLタグとスクリプトを無害化
 * @param {string} input - 入力文字列
 * @returns {string} - サニタイズされた文字列
 */
const sanitizeHtml = (input) => {
    if (typeof input !== 'string') return '';
    
    return input
        .trim()
        // XSSの可能性があるスクリプトタグを除去
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        // 危険なHTMLタグを除去
        .replace(/<[^>]*>/g, '')
        // SQL注入で使われる可能性のある文字をエスケープ
        .replace(/'/g, '&#39;')
        .replace(/"/g, '&#34;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

/**
 * 基本的な文字列検証
 * @param {string} input - 検証する文字列
 * @param {Object} options - 検証オプション
 * @returns {Object} - 検証結果
 */
const validateString = (input, options = {}) => {
    const {
        minLength = 0,
        maxLength = 255,
        allowEmpty = false,
        pattern = null,
        sanitize = true
    } = options;

    if (!input && !allowEmpty) {
        return { isValid: false, error: '入力値が必要です', value: '' };
    }

    if (!input && allowEmpty) {
        return { isValid: true, error: null, value: '' };
    }

    if (typeof input !== 'string') {
        return { isValid: false, error: '文字列である必要があります', value: '' };
    }

    let processedInput = sanitize ? sanitizeHtml(input) : input.trim();

    if (processedInput.length < minLength) {
        return { 
            isValid: false, 
            error: `${minLength}文字以上で入力してください`, 
            value: processedInput 
        };
    }

    if (processedInput.length > maxLength) {
        return { 
            isValid: false, 
            error: `${maxLength}文字以下で入力してください`, 
            value: processedInput 
        };
    }

    if (pattern && !pattern.test(processedInput)) {
        return { 
            isValid: false, 
            error: '入力形式が正しくありません', 
            value: processedInput 
        };
    }

    return { isValid: true, error: null, value: processedInput };
};

/**
 * 時刻形式の検証（HH:MM）
 * @param {string} time - 時刻文字列
 * @returns {Object} - 検証結果
 */
const validateTime = (time) => {
    const timePattern = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return validateString(time, {
        pattern: timePattern,
        maxLength: 5,
        sanitize: false
    });
};

/**
 * 日付形式の検証（YYYY-MM-DD）
 * @param {string} date - 日付文字列
 * @returns {Object} - 検証結果
 */
const validateDate = (date) => {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const result = validateString(date, {
        pattern: datePattern,
        maxLength: 10,
        sanitize: false
    });

    if (result.isValid) {
        // 実際の日付として有効かチェック
        const dateObj = new Date(date);
        const isValidDate = dateObj instanceof Date && 
                           !isNaN(dateObj) && 
                           dateObj.toISOString().slice(0, 10) === date;
        
        if (!isValidDate) {
            return { 
                isValid: false, 
                error: '有効な日付を入力してください', 
                value: date 
            };
        }
    }

    return result;
};

/**
 * ユーザー名の検証
 * @param {string} username - ユーザー名
 * @returns {Object} - 検証結果
 */
const validateUsername = (username) => {
    const usernamePattern = /^[a-zA-Z0-9_-]+$/;
    return validateString(username, {
        minLength: 3,
        maxLength: 50,
        pattern: usernamePattern,
        sanitize: true
    });
};

/**
 * パスワードの強度検証
 * @param {string} password - パスワード
 * @returns {Object} - 検証結果
 */
const validatePassword = (password) => {
    if (!password || typeof password !== 'string') {
        return { 
            isValid: false, 
            error: 'パスワードを入力してください', 
            value: '' 
        };
    }

    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (password.length < minLength) {
        return { 
            isValid: false, 
            error: `パスワードは${minLength}文字以上である必要があります`, 
            value: '' 
        };
    }

    const strengthChecks = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar];
    const passedChecks = strengthChecks.filter(Boolean).length;

    if (passedChecks < 3) {
        return { 
            isValid: false, 
            error: 'パスワードは大文字、小文字、数字、特殊文字のうち3種類以上を含む必要があります', 
            value: '' 
        };
    }

    return { isValid: true, error: null, value: password };
};

/**
 * 数値の検証
 * @param {any} input - 検証する値
 * @param {Object} options - 検証オプション
 * @returns {Object} - 検証結果
 */
const validateNumber = (input, options = {}) => {
    const { min, max, allowFloat = true, allowEmpty = false } = options;

    if ((input === null || input === undefined || input === '') && allowEmpty) {
        return { isValid: true, error: null, value: null };
    }

    const num = allowFloat ? parseFloat(input) : parseInt(input, 10);

    if (isNaN(num)) {
        return { 
            isValid: false, 
            error: '数値を入力してください', 
            value: input 
        };
    }

    if (min !== undefined && num < min) {
        return { 
            isValid: false, 
            error: `${min}以上の値を入力してください`, 
            value: input 
        };
    }

    if (max !== undefined && num > max) {
        return { 
            isValid: false, 
            error: `${max}以下の値を入力してください`, 
            value: input 
        };
    }

    return { isValid: true, error: null, value: num };
};

/**
 * 体温の検証
 * @param {any} temperature - 体温値
 * @returns {Object} - 検証結果
 */
const validateTemperature = (temperature) => {
    return validateNumber(temperature, {
        min: 35.0,
        max: 42.0,
        allowFloat: true,
        allowEmpty: false
    });
};

/**
 * 複数のフィールドを一括検証
 * @param {Object} data - 検証するデータ
 * @param {Object} rules - 検証ルール
 * @returns {Object} - 検証結果
 */
const validateFields = (data, rules) => {
    const results = {};
    const errors = {};
    let isValid = true;

    for (const [field, rule] of Object.entries(rules)) {
        const value = data[field];
        let result;

        switch (rule.type) {
            case 'string':
                result = validateString(value, rule.options || {});
                break;
            case 'time':
                result = validateTime(value);
                break;
            case 'date':
                result = validateDate(value);
                break;
            case 'username':
                result = validateUsername(value);
                break;
            case 'password':
                result = validatePassword(value);
                break;
            case 'number':
                result = validateNumber(value, rule.options || {});
                break;
            case 'temperature':
                result = validateTemperature(value);
                break;
            default:
                result = { isValid: false, error: '未知の検証タイプです', value: value };
        }

        results[field] = result.value;
        
        if (!result.isValid) {
            isValid = false;
            errors[field] = result.error;
        }
    }

    return {
        isValid,
        data: results,
        errors
    };
};

module.exports = {
    sanitizeHtml,
    validateString,
    validateTime,
    validateDate,
    validateUsername,
    validatePassword,
    validateNumber,
    validateTemperature,
    validateFields
};