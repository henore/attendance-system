class CSRFHandler {
    constructor() {
        this.token = null;
        this.tokenExpiry = null;
    }

    async getToken() {
        if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.token;
        }

        try {
            const response = await fetch('/api/csrf-token', {
                method: 'GET',
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('CSRFトークンの取得に失敗しました');
            }

            const data = await response.json();
            if (data.success && data.csrf_token) {
                this.token = data.csrf_token;
                this.tokenExpiry = Date.now() + (50 * 60 * 1000); // 50分で期限切れとして扱う
                return this.token;
            } else {
                throw new Error('無効なCSRFトークンレスポンス');
            }
        } catch (error) {
            console.error('CSRF token fetch error:', error);
            throw error;
        }
    }

    async secureRequest(url, options = {}) {
        const csrfToken = await this.getToken();
        
        const headers = {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            ...options.headers
        };

        const requestOptions = {
            ...options,
            headers,
            credentials: 'include'
        };

        if (options.body && typeof options.body === 'object') {
            requestOptions.body = JSON.stringify({
                ...options.body,
                _csrf: csrfToken
            });
        }

        try {
            const response = await fetch(url, requestOptions);
            
            if (response.status === 403) {
                const errorData = await response.json().catch(() => ({}));
                if (errorData.error && errorData.error.includes('CSRF')) {
                    console.warn('CSRF token expired, refreshing...');
                    this.token = null;
                    this.tokenExpiry = null;
                    return this.secureRequest(url, options);
                }
            }
            
            return response;
        } catch (error) {
            console.error('Secure request failed:', error);
            throw error;
        }
    }

    async attachToForm(form) {
        const csrfToken = await this.getToken();
        
        let csrfInput = form.querySelector('input[name="_csrf"]');
        if (!csrfInput) {
            csrfInput = document.createElement('input');
            csrfInput.type = 'hidden';
            csrfInput.name = '_csrf';
            form.appendChild(csrfInput);
        }
        csrfInput.value = csrfToken;
    }

    invalidateToken() {
        this.token = null;
        this.tokenExpiry = null;
    }
}

const csrfHandler = new CSRFHandler();

export default csrfHandler;