/**
 * i18n - Internationalization for Bloom Language Readiness
 *
 * Usage in other JS files:
 *   const t = window.i18n;
 *   t('error.required')        => "Vui lòng nhập..." or "Please enter..."
 *   t('error.email')           => ...
 *
 * Lang is detected from URL:
 *   - URL contains '-en.html'  => 'en'
 *   - Otherwise                => 'vi'
 */

(function () {
    const lang = window.location.pathname.includes('-en.html') ? 'en' : 'vi';

    const translations = {
        vi: {
            // Form validation errors
            'error.required':       'Vui lòng nhập {field}',
            'error.email':          'Vui lòng nhập email hợp lệ',
            'error.phone':          'Số điện thoại phải có 10-11 chữ số',
            'error.babyAge':        'Vui lòng nhập số tháng tuổi hợp lệ',

            // Address dropdown defaults
            'address.selectProvince':   'Chọn Tỉnh/ Thành Phố',
            'address.selectDistrict':   'Chọn Quận/ Huyện',
            'address.selectWard':       'Chọn Xã/ Phường',

            // Order flow
            'order.creating':           'Đang tạo đơn hàng...',
            'order.confirmBtn':         'Xác nhận & tiếp tục',
            'order.createFailed':       'Không thể tạo đơn hàng. Vui lòng thử lại.',
            'order.networkError':       'Lỗi kết nối. Vui lòng kiểm tra internet và thử lại.',
            'order.qrAlt':              'QR Code Thanh Toán',

            // Confirmation page
            'confirm.expired.title':    'Đơn hàng đã hết hạn',
            'confirm.expired.desc':     'Giao dịch đã quá thời gian thanh toán. Vui lòng tạo đơn hàng mới.',

            // Email modal
            'email.errorRequired':      'Vui lòng nhập địa chỉ email',
            'email.errorInvalid':       'Email không hợp lệ. Vui lòng kiểm tra lại',
            'email.errorServer':        'Có lỗi xảy ra. Vui lòng thử lại sau',
        },

        en: {
            // Form validation errors
            'error.required':       'Please enter {field}',
            'error.email':          'Please enter a valid email address',
            'error.phone':          'Phone number must be 10-11 digits',
            'error.babyAge':        'Please enter a valid age in months',

            // Address dropdown defaults
            'address.selectProvince':   'Select Province/City',
            'address.selectDistrict':   'Select District',
            'address.selectWard':       'Select Ward',

            // Order flow
            'order.creating':           'Creating order...',
            'order.confirmBtn':         'Confirm & Continue',
            'order.createFailed':       'Unable to create order. Please try again.',
            'order.networkError':       'Connection error. Please check your internet and try again.',
            'order.qrAlt':              'Payment QR Code',

            // Confirmation page
            'confirm.expired.title':    'Order Expired',
            'confirm.expired.desc':     'The payment time has expired. Please create a new order.',

            // Email modal
            'email.errorRequired':      'Please enter your email address',
            'email.errorInvalid':       'Invalid email. Please check again',
            'email.errorServer':        'An error occurred. Please try again later',
        }
    };

    /**
     * Translate a key, with optional variable replacement.
     * e.g. t('error.required', { field: 'họ & tên' })
     */
    function t(key, vars) {
        let str = translations[lang][key] || translations['vi'][key] || key;
        if (vars) {
            Object.keys(vars).forEach(k => {
                str = str.replace(`{${k}}`, vars[k]);
            });
        }
        return str;
    }

    // Expose globally
    window.i18n = t;
    window.i18nLang = lang;
})();
