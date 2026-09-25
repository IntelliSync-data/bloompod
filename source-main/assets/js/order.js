/**
 * ORDER PAGE JAVASCRIPT - Bloom Language Readiness System
 * Handles: Form validation, vAPI address dropdown, step navigation, LocalStorage
 */

(function() {
    'use strict';

    // ==============================================
    // CONFIGURATION
    // ==============================================
    const isProduction = window.location.hostname === 'bloompod.vn' || window.location.hostname === 'www.bloompod.vn';

    // payment_method_id giờ lấy từ package-info nên không cần khai báo ở đây nữa
    const ENV_CONFIG = isProduction
        ? { package_id: 4, gift_package_id: 6 }   // production
        : { package_id: 3, gift_package_id: 5 };  // demo

    // v2 = địa giới hành chính mới từ 1/7/2025: 34 tỉnh/thành, bỏ cấp quận/huyện
    const API_BASE_URL = 'https://provinces.open-api.vn/api/v2';
    const INQUIRY_API_URL = 'https://app.bloompod.vn/api/inquiry';
    const PAYMENT_API_URL = 'https://app.bloompod.vn/api/profile';
    const PRODUCTS_API_URL = 'https://app.bloompod.vn/api/v1/products';
    const ORDER_DATA_KEY = 'bloomOrderData';
    // Backend đặt expired_at = create_date + 1 tiếng, frontend bám theo
    const PAYMENT_WINDOW_SECONDS = 3600;

    // Giãn dần nhịp hỏi: dồn vào lúc khách nhiều khả năng đang thao tác,
    // thưa dần về sau. Giữ 5 giây suốt 1 tiếng là 720 request mỗi khách.
    const POLLING_STEPS = [
        { until: 120, every: 5000 },    // 2 phút đầu
        { until: 600, every: 15000 },   // tới phút thứ 10
        { until: Infinity, every: 30000 }
    ];

    // ==============================================
    // GLOBAL STATE
    // ==============================================
    let orderData = {
        step1: {},
        user_profile_id: null,
        transaction_id: null,
        qr_url: null,
        amount: null,
        status: null,
        timestamp: ''
    };

    // Package pricing loaded from API (see fetchPackageInfo)
    let packageInfo = null;

    // Danh sách phương thức thanh toán, cũng lấy từ package-info
    let paymentMethods = [];

    // Cửa sổ thanh toán PayPal
    let paymentWindow = null;

    // Đơn tặng quà từ trang Planting a Seed: { giftId, childName } hoặc null
    let giftMode = null;

    // Đang mở lại đơn có sẵn (order.html?order=<code>)
    let isResumingOrder = false;

    // Gói của đơn đang mở lại. Phương thức thanh toán gắn theo gói nên phải
    // lấy đúng gói của đơn, không phải gói mặc định của môi trường.
    let resumeOrderPackageId = null;

    /** Đơn tặng quà dùng gói riêng, giá khác gói bán lẻ */
    function getPackageId() {
        if (resumeOrderPackageId) return resumeOrderPackageId;
        return giftMode ? ENV_CONFIG.gift_package_id : ENV_CONFIG.package_id;
    }

    /**
     * URL trang xác nhận. Đơn tặng quà mang theo ngữ cảnh để trang đó biết
     * đường "quay lại" và "thử lại" đúng chỗ.
     * Truyền qua URL chứ không qua localStorage vì khi hết hạn thanh toán
     * thì đơn chưa kịp được lưu.
     */
    function confirmationUrl(status) {
        const page = window.i18nLang === 'en'
            ? 'order-confirmation-en.html'
            : 'order-confirmation.html';

        const params = new URLSearchParams({ status: status });
        if (giftMode) {
            params.set('gift', giftMode.giftId);
            if (giftMode.childName) params.set('child', giftMode.childName);
        }
        return `${page}?${params.toString()}`;
    }

    let pollingInterval = null;
    let pollingTimeoutId = null;
    let countdownInterval = null;
    let remainingSeconds = 300; // 5 minutes

    // ==============================================
    // UTILITY FUNCTIONS
    // ==============================================

    /**
     * Generate random order code (16 digits)
     */
    function generateOrderCode() {
        let code = '';
        for (let i = 0; i < 16; i++) {
            code += Math.floor(Math.random() * 10);
        }
        return code;
    }

    /**
     * Format number to Vietnamese currency
     */
    function formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
        }).format(amount);
    }

    /**
     * Show error message for a field
     */
    function showError(input, message) {
        const formGroup = input.closest('.form-group');
        const errorElement = formGroup.querySelector('.error-message');

        input.classList.add('error');
        errorElement.textContent = message;
        errorElement.classList.add('show');
    }

    /**
     * Clear error message for a field
     */
    function clearError(input) {
        const formGroup = input.closest('.form-group');
        const errorElement = formGroup.querySelector('.error-message');

        input.classList.remove('error');
        errorElement.textContent = '';
        errorElement.classList.remove('show');
    }

    /**
     * Scroll to first error field
     */
    function scrollToFirstError() {
        const firstError = document.querySelector('.error');
        if (firstError) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstError.focus();
        }
    }

    // ==============================================
    // API FUNCTIONS - Payment Backend
    // ==============================================

    /**
     * Submit inquiry via backend API
     */
    /** Ghép địa chỉ, bỏ qua phần trống (đơn tặng quà không có địa chỉ) */
    function buildAddress(formData) {
        return [formData.address, formData.ward, formData.province]
            .filter(Boolean)
            .join(', ');
    }

    /** Các mẩu ghi chú, chỉ giữ mẩu nào có dữ liệu */
    function buildNoteParts(formData) {
        const parts = [];
        if (giftMode) {
            parts.push(giftMode.childName
                ? `Quà tặng cho bé: ${giftMode.childName}`
                : 'Đơn tặng quà (Planting a Seed)');
        }
        if (formData.addressNote) parts.push(`Địa chỉ cũ: ${formData.addressNote}`);
        if (formData.babyAge) parts.push(`Bé ${formData.babyAge} tháng tuổi`);
        return parts;
    }

    async function submitInquiry(formData) {
        try {
            const fullAddress = buildAddress(formData);
            const parts = buildNoteParts(formData);
            if (fullAddress) parts.push(fullAddress);
            const message = parts.join(', ');

            const response = await fetch(INQUIRY_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: formData.fullName,
                    email: formData.email,
                    phone: formData.phone,
                    message: message,
                    source_code: 'website'
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Inquiry response:', data);
            return data;
        } catch (error) {
            console.error('Error submitting inquiry:', error);
            throw error;
        }
    }

    /**
     * Create order via backend API
     */
    async function createOrder(formData, paymentMethodId) {
        try {
            // Địa chỉ mới đi vào key `address` riêng, ngăn nhau bằng dấu phẩy.
            // Tên, SĐT và địa chỉ đã có key riêng nên không lặp lại trong notes.
            const fullAddress = buildAddress(formData);
            const notes = buildNoteParts(formData).join(', ');

            const response = await fetch(`${PAYMENT_API_URL}/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    params: {
                        package_id: getPackageId(),
                        name: formData.fullName,
                        phone: formData.phone,
                        email: formData.email,
                        address: fullAddress,
                        notes: notes,
                        payment_method_id: paymentMethodId
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Create order response:', data);
            return data;
        } catch (error) {
            console.error('Error creating order:', error);
            throw error;
        }
    }

    /**
     * Check payment status
     */
    async function checkPaymentStatus(userProfileId, transactionCode) {
        try {
            const response = await fetch(`${PAYMENT_API_URL}/check-payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    params: {
                        user_profile_id: userProfileId,
                        transaction_code: transactionCode
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Check payment response:', data);
            return data;
        } catch (error) {
            console.error('Error checking payment:', error);
            throw error;
        }
    }

    /**
     * Fetch package info (name, prices, services) from backend API
     */
    async function fetchPackageInfo() {
        try {
            const response = await fetch(`${PAYMENT_API_URL}/package-info`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    params: {
                        package_id: getPackageId()
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Package info response:', data);
            return data;
        } catch (error) {
            console.error('Error fetching package info:', error);
            throw error;
        }
    }

    // ==============================================
    // API FUNCTIONS - vAPI Address
    // ==============================================

    /**
     * Fetch provinces (34 tỉnh/thành theo địa giới mới)
     */
    async function fetchProvinces() {
        try {
            const response = await fetch(`${API_BASE_URL}/p/`);
            if (!response.ok) throw new Error('Failed to fetch provinces');
            return (await response.json()) || [];
        } catch (error) {
            console.error('Error fetching provinces:', error);
            return [];
        }
    }

    /**
     * Fetch wards of a province.
     * Từ 1/7/2025 bỏ cấp quận/huyện nên xã/phường gắn thẳng vào tỉnh:
     * v2 trả mảng wards ngay trong province, không còn endpoint /d/.
     */
    async function fetchWards(provinceCode) {
        try {
            const response = await fetch(`${API_BASE_URL}/p/${provinceCode}?depth=2`);
            if (!response.ok) throw new Error('Failed to fetch wards');
            const data = await response.json();
            return data.wards || [];
        } catch (error) {
            console.error('Error fetching wards:', error);
            return [];
        }
    }

    // ==============================================
    // SEARCHABLE DROPDOWN
    // ==============================================

    /** Bỏ dấu để gõ "ben thanh" vẫn ra "Phường Bến Thành" */
    function stripAccents(str) {
        return String(str)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .toLowerCase();
    }

    /**
     * Biến một ô input thành dropdown gõ tìm được.
     * Tên hiển thị nằm ở input, mã vùng nằm ở input hidden đi kèm.
     */
    function createCombobox(fieldId) {
        const input = document.getElementById(fieldId);
        const wrapper = input.closest('.combo');
        const list = wrapper.querySelector('.combo__list');
        const hidden = wrapper.querySelector('input[type="hidden"]');

        let items = [];
        let shown = [];
        let activeIndex = -1;
        const listeners = [];

        function open() {
            if (!shown.length) return;
            list.hidden = false;
            input.setAttribute('aria-expanded', 'true');
        }

        function close() {
            list.hidden = true;
            input.setAttribute('aria-expanded', 'false');
            activeIndex = -1;
        }

        function highlight(index) {
            const options = list.children;
            if (!options.length) return;
            activeIndex = (index + options.length) % options.length;
            Array.from(options).forEach((el, i) => {
                el.classList.toggle('is-active', i === activeIndex);
            });
            options[activeIndex].scrollIntoView({ block: 'nearest' });
        }

        function choose(index) {
            const item = shown[index];
            if (!item) return;
            input.value = item.name;
            hidden.value = item.code;
            close();
            clearError(input);
            listeners.forEach(fn => fn(item));
        }

        function render(query) {
            const q = stripAccents(query.trim());
            shown = q ? items.filter(i => stripAccents(i.name).includes(q)) : items.slice();

            list.innerHTML = '';
            shown.forEach((item, index) => {
                const option = document.createElement('li');
                option.className = 'combo__option';
                option.setAttribute('role', 'option');
                option.textContent = item.name;
                // mousedown chứ không phải click: chặn blur bắn trước khi chọn xong
                option.addEventListener('mousedown', function (event) {
                    event.preventDefault();
                    choose(index);
                });
                list.appendChild(option);
            });

            activeIndex = -1;
            if (shown.length) { open(); } else { close(); }
        }

        input.addEventListener('focus', function () {
            render('');
        });

        input.addEventListener('input', function () {
            hidden.value = '';
            render(this.value);
        });

        input.addEventListener('keydown', function (event) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (list.hidden) render(this.value);
                highlight(activeIndex + (event.key === 'ArrowDown' ? 1 : -1));
            } else if (event.key === 'Enter' && !list.hidden && activeIndex >= 0) {
                event.preventDefault();
                choose(activeIndex);
            } else if (event.key === 'Escape') {
                close();
            }
        });

        // Gõ tay mà không chọn trong danh sách thì không tính là hợp lệ
        input.addEventListener('blur', function () {
            close();
            if (hidden.value || !this.value) return;
            this.value = '';
            listeners.forEach(fn => fn(null));
        });

        return {
            setItems(next) {
                items = next || [];
                input.value = '';
                hidden.value = '';
                close();
            },
            setEnabled(enabled) {
                input.disabled = !enabled;
            },
            onChange(fn) {
                listeners.push(fn);
            }
        };
    }

    // ==============================================
    // FORM VALIDATION
    // ==============================================

    /**
     * Validate email format
     */
    function isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    /**
     * Validate phone number (10-11 digits)
     */
    function isValidPhone(phone) {
        const re = /^[0-9]{10,11}$/;
        return re.test(phone.replace(/\s/g, ''));
    }

    /**
     * Validate form field
     */
    function validateField(input) {
        const value = input.value.trim();
        const fieldName = input.name;

        const t = window.i18n || (k => k);

        // Check required
        if (input.hasAttribute('required') && !value) {
            const label = input.closest('.form-group').querySelector('label').textContent.replace('*', '').trim();
            showError(input, t('error.required', { field: label.toLowerCase() }));
            return false;
        }

        // Ô dạng combobox: phải chọn từ danh sách, gõ tay không tính
        const comboWrapper = input.closest('.combo');
        if (comboWrapper && input.hasAttribute('required')) {
            const hiddenCode = comboWrapper.querySelector('input[type="hidden"]');
            if (!hiddenCode || !hiddenCode.value) {
                const label = input.closest('.form-group').querySelector('label').textContent.replace('*', '').trim();
                showError(input, t('error.required', { field: label.toLowerCase() }));
                return false;
            }
        }

        // Check email format
        if (fieldName === 'email' && value && !isValidEmail(value)) {
            showError(input, t('error.email'));
            return false;
        }

        // Check phone format
        if (fieldName === 'phone' && value && !isValidPhone(value)) {
            showError(input, t('error.phone'));
            return false;
        }

        // Check baby age
        if (fieldName === 'babyAge') {
            const age = parseInt(value);
            if (isNaN(age) || age < 0) {
                showError(input, t('error.babyAge'));
                return false;
            }
        }

        clearError(input);
        return true;
    }

    /**
     * Validate entire form
     */
    function validateForm(form) {
        let isValid = true;
        const inputs = form.querySelectorAll('input[required], select[required]');

        inputs.forEach(input => {
            if (!validateField(input)) {
                isValid = false;
            }
        });

        return isValid;
    }

    // ==============================================
    // STEP NAVIGATION
    // ==============================================

    /**
     * Show step
     */
    function showStep(stepNumber) {
        const steps = document.querySelectorAll('.order-step');
        steps.forEach((step, index) => {
            if (index === stepNumber - 1) {
                step.classList.add('active');
            } else {
                step.classList.remove('active');
            }
        });

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /**
     * Go to Step 2 - Now with API integration
     */
    // ==============================================
    // PAYMENT METHODS
    // ==============================================

    /**
     * Loại phương thức thanh toán.
     * Ưu tiên field `type` của API; API hiện chưa trả về nên tạm suy từ tên.
     * Khi backend thêm `type` thì nhánh dưới tự hết tác dụng.
     */
    function getPaymentType(method) {
        if (method && method.type) return String(method.type).toLowerCase();

        const name = (method && method.name || '').toLowerCase();
        if (name.includes('paypal')) return 'paypal';
        if (name.includes('cash') || name.includes('tiền mặt')) return 'cash';
        return 'sepay';
    }

    /**
     * Chỉ giữ phương thức đúng môi trường: demo dùng `test`, production dùng `live`.
     * Method không khai báo environment thì vẫn giữ, còn hơn là ẩn nhầm.
     */
    function filterByEnvironment(methods) {
        const wanted = isProduction ? 'live' : 'test';
        const list = methods || [];
        const matched = list.filter(m => !m.environment || m.environment === wanted);

        // Cấu hình thiếu mà lọc sạch thì thà hiện hết, còn hơn để khách
        // không có cách nào thanh toán
        if (!matched.length && list.length) {
            console.warn(`No payment method for environment "${wanted}", showing all`);
            return list;
        }
        return matched;
    }

    /** description dạng "Tiếng Việt|English" -> lấy vế đúng theo ngôn ngữ trang */
    function getMethodDescription(method) {
        const parts = String(method && method.description || '').split('|');
        const text = window.i18nLang === 'en' ? (parts[1] || parts[0]) : parts[0];
        return (text || '').trim();
    }

    /** Lấy danh sách phương thức, gọi lại API nếu lúc tải trang chưa có */
    async function ensurePaymentMethods() {
        if (paymentMethods.length) return paymentMethods;

        try {
            const data = await fetchPackageInfo();
            if (data?.result?.success) {
                paymentMethods = filterByEnvironment(data.result.payment_methods);
            }
        } catch (error) {
            console.error('Error loading payment methods:', error);
        }
        return paymentMethods;
    }

    /** Popup chọn phương thức. Resolve method đã chọn, hoặc null nếu khách đóng. */
    function showPaymentMethodModal(methods) {
        const t = window.i18n || (k => k);

        return new Promise(function (resolve) {
            const overlay = document.createElement('div');
            overlay.className = 'pm-overlay';

            const dialog = document.createElement('div');
            dialog.className = 'pm-dialog';

            const title = document.createElement('h3');
            title.className = 'pm-title';
            title.textContent = t('payment.chooseTitle');

            const desc = document.createElement('p');
            desc.className = 'pm-desc';
            desc.textContent = t('payment.chooseDesc');

            const list = document.createElement('div');
            list.className = 'pm-list';

            function cleanup() {
                overlay.remove();
                document.body.style.overflow = '';
                document.removeEventListener('keydown', onKeydown);
            }

            function onKeydown(event) {
                if (event.key === 'Escape') {
                    cleanup();
                    resolve(null);
                }
            }

            methods.forEach(function (method) {
                const option = document.createElement('button');
                option.type = 'button';
                option.className = 'pm-option';

                const image = document.createElement('img');
                image.src = method.image_url || '';
                image.alt = '';
                // Phương thức chưa gắn ảnh thì giấu đi, không để hiện icon vỡ
                image.addEventListener('error', function () {
                    image.style.visibility = 'hidden';
                });

                const text = document.createElement('div');
                text.className = 'pm-option-text';

                const name = document.createElement('div');
                name.className = 'pm-option-name';
                name.textContent = method.name || '';
                text.appendChild(name);

                const description = getMethodDescription(method);
                if (description) {
                    const note = document.createElement('div');
                    note.className = 'pm-option-desc';
                    note.textContent = description;
                    text.appendChild(note);
                }

                option.appendChild(image);
                option.appendChild(text);
                option.addEventListener('click', function () {
                    cleanup();
                    resolve(method);
                });
                list.appendChild(option);
            });

            overlay.addEventListener('click', function (event) {
                if (event.target === overlay) {
                    cleanup();
                    resolve(null);
                }
            });
            document.addEventListener('keydown', onKeydown);

            dialog.appendChild(title);
            dialog.appendChild(desc);
            dialog.appendChild(list);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            document.body.style.overflow = 'hidden';
        });
    }

    // ==============================================
    // PAYPAL WINDOW
    // ==============================================

    function openPaymentWindow(url) {
        const width = 500;
        const height = 720;
        const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
        const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);

        paymentWindow = window.open(
            url,
            'bloompodPaymentWindow',
            `width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)},resizable=yes,scrollbars=yes`
        );
        if (paymentWindow) paymentWindow.focus();
        return paymentWindow;
    }

    /** Cửa sổ do script mở ra thì opener luôn đóng được, kể cả sau khi sang paypal.com */
    function closePaymentWindow() {
        if (paymentWindow && !paymentWindow.closed) {
            paymentWindow.close();
        }
        paymentWindow = null;
    }

    function setTransactionCode(code) {
        const orderCode = document.getElementById('orderCode');
        if (orderCode) orderCode.textContent = code || '-';
    }

    /** Tải ảnh QR về máy để quét bằng app ngân hàng từ thư viện ảnh */
    async function downloadQrCode() {
        const img = document.querySelector('#paymentQr img');
        if (!img || !img.src) return;

        const fileName = `bloompod-qr-${orderData.transaction_id || 'payment'}.png`;

        try {
            const response = await fetch(img.src);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();

            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        } catch (error) {
            // Host ảnh chặn CORS thì mở tab mới cho khách tự lưu
            console.error('Error downloading QR:', error);
            window.open(img.src, '_blank');
        }
    }

    /** Bật đúng khối tương ứng với loại thanh toán ở bước 2 */
    function renderPaymentStep(type) {
        const t = window.i18n || (k => k);
        const title = document.getElementById('paymentSectionTitle');
        const description = document.getElementById('paymentDescription');
        const status = document.querySelector('#paymentStatus .status-text');
        const statusIcon = document.querySelector('#paymentStatus .status-icon');

        // Lần đầu thì nhớ lại nội dung gốc trong HTML (dành cho SePay)
        if (title && !title.dataset.defaultText) {
            title.dataset.defaultText = title.textContent;
            description.dataset.defaultText = description.textContent;
            if (status) status.dataset.defaultText = status.textContent;
            if (statusIcon) statusIcon.dataset.defaultText = statusIcon.textContent;
        }

        document.getElementById('paymentQr').hidden = type !== 'sepay';
        document.getElementById('paymentPaypal').hidden = type !== 'paypal';
        document.getElementById('paymentCash').hidden = type !== 'cash';
        document.getElementById('paymentCountdown').hidden = type === 'cash';

        if (type === 'paypal') {
            title.textContent = t('payment.paypalTitle');
            description.textContent = t('payment.paypalDesc');
        } else if (type === 'cash') {
            title.textContent = t('payment.cashTitle');
            description.textContent = t('payment.cashDesc');
            if (status) status.textContent = t('payment.cashStatus');
            if (statusIcon) statusIcon.textContent = '✓';
        } else {
            title.textContent = title.dataset.defaultText;
            description.textContent = description.dataset.defaultText;
            if (status) status.textContent = status.dataset.defaultText;
            if (statusIcon) statusIcon.textContent = statusIcon.dataset.defaultText;
        }
    }

    async function goToStep2(formData) {
        // Save form data first
        orderData.step1 = formData;
        orderData.timestamp = new Date().toISOString();

        // Show loading state
        const submitBtn = document.querySelector('#orderForm button[type="submit"]');
        const originalText = submitBtn.textContent;
        const t = window.i18n || (k => k);

        function restoreButton() {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = t('order.creating');

        try {
            // Chọn phương thức trước. Chỉ một phương thức thì đi thẳng, nhiều
            // hơn thì hỏi khách. Inquiry và đơn hàng chỉ tạo sau khi đã chọn.
            const methods = await ensurePaymentMethods();
            if (!methods.length) {
                showToast(t('payment.methodFailed'), 'error');
                restoreButton();
                return;
            }

            let method = methods[0];
            if (methods.length > 1) {
                method = await showPaymentMethodModal(methods);
                if (!method) {
                    // Khách đóng popup, chưa tạo gì cả
                    restoreButton();
                    return;
                }
            }

            const paymentType = getPaymentType(method);

            // Submit inquiry first (save user info)
            await submitInquiry(formData);

            // Call API to create order
            const response = await createOrder(formData, method.id);

            // Check if API call was successful
            if (response.result && response.result.success) {
                // Save API response data
                orderData.user_profile_id = response.result.user_profile_id;
                orderData.transaction_id = response.result.transaction_id;
                orderData.qr_url = response.result.qr_url;
                orderData.redirect_url = response.result.redirect_url || null;
                orderData.amount = response.result.amount;
                orderData.payment_method_id = method.id;
                orderData.payment_type = paymentType;
                orderData.status = paymentType === 'cash' ? 'awaiting_contact' : 'processing';

                // Update UI with API data
                setTransactionCode(response.result.transaction_id);

                // Update amount display (keep the struck-through original price
                // when the package is on a promotional price)
                const paidAmount = Number(response.result.amount);
                const originalAmount = packageInfo && packageInfo.use_promotional_price
                    ? getOriginalCost(packageInfo)
                    : null;
                updatePriceDisplay(paidAmount, originalAmount);

                if (paymentType === 'sepay') {
                    const qrImg = document.querySelector('#paymentQr img');
                    if (qrImg && response.result.qr_url) {
                        qrImg.src = response.result.qr_url;
                        qrImg.alt = t('order.qrAlt');
                    }
                }

                if (paymentType === 'paypal') {
                    // Mở cửa sổ ngay trong cú click của khách, nếu mở muộn hơn
                    // trong .then() sẽ bị trình duyệt chặn popup
                    document.getElementById('paypalPayBtn').onclick = function () {
                        if (orderData.redirect_url) {
                            openPaymentWindow(orderData.redirect_url);
                        }
                    };
                }

                renderPaymentStep(paymentType);

                // Save to LocalStorage temporarily
                localStorage.setItem(ORDER_DATA_KEY + '_temp', JSON.stringify(orderData));

                // Show step 2
                showStep(2);

                // Tiền mặt không có gì để chờ, nhân viên sẽ liên hệ thu tiền
                if (paymentType !== 'cash') {
                    startPaymentPolling();
                }

            } else {
                // API returned error
                const errorMsg = response.result?.error || t('order.createFailed');
                showToast(errorMsg, 'error');
                restoreButton();
            }

        } catch (error) {
            // Network or other errors
            console.error('Error in goToStep2:', error);
            showToast(t('order.networkError'), 'error');
            restoreButton();
        }
    }

    /**
     * Format amount to Vietnamese currency
     */
    function formatCurrency(amount) {
        const suffix = window.i18nLang === 'en' ? ' VND' : ' VNĐ';
        return new Intl.NumberFormat('vi-VN', {
            style: 'decimal',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount) + suffix;
    }

    /**
     * Render a price into an element.
     * - Without originalAmount (or when it matches): a single plain price.
     * - With a higher originalAmount: the original struck through in a smaller
     *   size on its own line, then the final price in the element's normal style.
     */
    function renderPrice(el, finalAmount, originalAmount) {
        if (!el) return;

        el.textContent = '';

        const hasDiscount = originalAmount != null &&
            Number(originalAmount) > Number(finalAmount);

        if (hasDiscount) {
            const original = document.createElement('span');
            original.className = 'price-original';
            original.textContent = formatCurrency(originalAmount);
            el.appendChild(original);
        }

        const final = document.createElement('span');
        final.className = 'price-final';
        final.textContent = formatCurrency(finalAmount);
        el.appendChild(final);
    }

    /**
     * Update both price slots (order value + amount to pay)
     */
    function updatePriceDisplay(finalAmount, originalAmount) {
        renderPrice(document.getElementById('orderValue'), finalAmount, originalAmount);
        renderPrice(document.getElementById('totalAmount'), finalAmount, originalAmount);
    }

    /**
     * Pre-discount price of a package: the highest of total_cost / package_cost
     */
    function getOriginalCost(pkg) {
        const candidates = [pkg.total_cost, pkg.package_cost]
            .map(Number)
            .filter(n => !isNaN(n));
        return candidates.length ? Math.max(...candidates) : null;
    }

    /**
     * Load package pricing from API and render it
     */
    async function initPackagePricing() {
        try {
            const data = await fetchPackageInfo();
            if (data?.result?.success) {
                paymentMethods = filterByEnvironment(data.result.payment_methods);
            }
            const pkg = data?.result?.success ? data.result.package : null;
            if (!pkg) return;

            packageInfo = pkg;

            // Mở lại đơn cũ thì số tiền lấy từ giao dịch, không phải giá gói
            if (isResumingOrder) return;

            const totalCost = Number(pkg.total_cost);
            const promoCost = Number(pkg.promotional_cost);

            if (pkg.use_promotional_price && !isNaN(promoCost)) {
                // total_cost is the pre-discount price on some packages and the
                // already-discounted one on others, so strike through whichever
                // figure is genuinely higher than the promotional price.
                updatePriceDisplay(promoCost, getOriginalCost(pkg));
            } else {
                updatePriceDisplay(totalCost, null);
            }
        } catch (error) {
            // Keep the prices already rendered in the HTML as fallback
            console.error('Error initializing package pricing:', error);
        }
    }

    /**
     * Format seconds to MM:SS
     */
    function formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        const mm = String(minutes).padStart(2, '0');
        const ss = String(secs).padStart(2, '0');

        // Dưới 1 tiếng giữ dạng MM:SS như cũ, từ 1 tiếng trở lên thì H:MM:SS
        return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
    }

    /**
     * Start countdown timer
     */
    function startCountdown(seconds) {
        remainingSeconds = seconds > 0 ? Math.floor(seconds) : PAYMENT_WINDOW_SECONDS;
        const timerElement = document.getElementById('countdownTimer');
        const countdownDiv = document.querySelector('.qr-countdown');

        if (!timerElement) return;

        // Update immediately
        timerElement.textContent = formatTime(remainingSeconds);

        // Clear any existing countdown
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }

        // Start countdown
        countdownInterval = setInterval(() => {
            remainingSeconds--;
            timerElement.textContent = formatTime(remainingSeconds);

            // Warning when less than 1 minute
            if (remainingSeconds <= 60 && countdownDiv) {
                countdownDiv.classList.add('warning');
            }

            // Stop when time is up
            if (remainingSeconds <= 0) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }
        }, 1000);
    }

    /**
     * Stop countdown timer
     */
    function stopCountdown() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }

    /**
     * Start polling for payment status
     */
    function startPaymentPolling(seconds) {
        if (!orderData.user_profile_id || !orderData.transaction_id) {
            console.error('Cannot start polling: missing user_profile_id or transaction_id');
            return;
        }

        // Clear any existing polling
        stopPaymentPolling();

        console.log('Starting payment polling...');

        // Start countdown timer
        startCountdown(seconds);

        const startedAt = Date.now();

        function nextDelay() {
            const elapsed = (Date.now() - startedAt) / 1000;
            return POLLING_STEPS.find(step => elapsed < step.until).every;
        }

        // Tự hẹn lại sau mỗi lần hỏi thay vì setInterval cố định: đổi được nhịp,
        // và một lần gọi chậm không làm dồn cuộc gọi kế tiếp
        async function poll() {
            try {
                const response = await checkPaymentStatus(
                    orderData.user_profile_id,
                    orderData.transaction_id
                );

                if (response.result && response.result.success) {
                    const status = response.result.status;

                    if (status === 'confirmed') {
                        // Payment confirmed - stop polling and redirect
                        console.log('Payment confirmed!');
                        stopPaymentPolling();
                        orderData.status = 'confirmed';
                        completeOrder();
                    } else if (status === 'expired') {
                        // Payment expired
                        console.log('Payment expired');
                        stopPaymentPolling();
                        orderData.status = 'expired';
                        window.location.href = confirmationUrl('expired');
                    }
                    // If 'processing', continue polling
                }
            } catch (error) {
                console.error('Error during polling:', error);
                // Continue polling even if there's an error
            }

            // stopPaymentPolling() đặt lại về null, nhờ đó vòng lặp dừng hẳn
            if (pollingInterval !== null) {
                pollingInterval = setTimeout(poll, nextDelay());
            }
        }

        pollingInterval = setTimeout(poll, POLLING_STEPS[0].every);

        // Hết hạn thanh toán thì quay lại bước 1
        pollingTimeoutId = setTimeout(() => {
            console.log('Polling timeout reached - returning to step 1');
            stopPaymentPolling();
            goBackToStep1();
        }, (seconds > 0 ? seconds : PAYMENT_WINDOW_SECONDS) * 1000);
    }

    /**
     * Stop payment polling
     */
    function stopPaymentPolling() {
        closePaymentWindow();

        if (pollingInterval) {
            clearTimeout(pollingInterval);
            pollingInterval = null;
        }
        if (pollingTimeoutId) {
            clearTimeout(pollingTimeoutId);
            pollingTimeoutId = null;
        }
        // Stop countdown when polling stops
        stopCountdown();
    }

    /**
     * Go back to Step 1
     */
    function goBackToStep1() {
        // CRITICAL: Stop all polling and countdown immediately
        stopPaymentPolling();

        // Clear all intervals and timeouts to ensure nothing runs in background
        if (pollingInterval) {
            clearTimeout(pollingInterval);
            pollingInterval = null;
        }
        if (pollingTimeoutId) {
            clearTimeout(pollingTimeoutId);
            pollingTimeoutId = null;
        }
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }

        // Reset countdown display
        const timerElement = document.getElementById('countdownTimer');
        if (timerElement) {
            timerElement.textContent = formatTime(PAYMENT_WINDOW_SECONDS);
        }
        const countdownDiv = document.querySelector('.qr-countdown');
        if (countdownDiv) {
            countdownDiv.classList.remove('warning');
        }

        // Re-enable submit button
        const submitBtn = document.querySelector('#orderForm button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = (window.i18n || (k => k))('order.confirmBtn');
        }

        // Reset order data status
        orderData.status = null;

        showStep(1);
    }

    /**
     * Complete order
     */
    /**
     * Ẩn bé đã được tặng khỏi trang Planting a Seed.
     * Lỗi ở đây không được chặn luồng: khách đã trả tiền rồi, vẫn phải
     * đưa họ sang trang xác nhận.
     */
    async function hideGiftedChild() {
        if (!giftMode) {
            console.log('Not a gift order, skip hiding child');
            return;
        }

        const url = `${PRODUCTS_API_URL}/${giftMode.giftId}`;
        console.log('Hiding gifted child:', url);

        try {
            const response = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_visible: false })
            });
            console.log('Hide child response:', response.status, await response.text());
        } catch (error) {
            console.error('Error hiding gifted child:', error);
        }
    }

    async function completeOrder() {
        // Save final data to LocalStorage
        localStorage.setItem(ORDER_DATA_KEY, JSON.stringify(orderData));

        // Chờ gọi xong rồi mới chuyển trang, không thì request bị huỷ giữa chừng
        await hideGiftedChild();

        // Redirect to confirmation page
        window.location.href = confirmationUrl('success');
    }

    // ==============================================
    // EVENT HANDLERS
    // ==============================================

    /**
     * Initialize address dropdowns
     */
    async function initAddressDropdowns() {
        const provinceCombo = createCombobox('province');
        const wardCombo = createCombobox('ward');

        wardCombo.setEnabled(false);

        // Chọn tỉnh thì nạp lại danh sách xã/phường của tỉnh đó
        provinceCombo.onChange(async function (province) {
            wardCombo.setItems([]);
            wardCombo.setEnabled(false);
            clearError(document.getElementById('ward'));

            if (!province) return;

            const wards = await fetchWards(province.code);
            wardCombo.setItems(wards);
            wardCombo.setEnabled(true);
        });

        provinceCombo.setItems(await fetchProvinces());
    }

    /**
     * Initialize form validation
     */
    function initFormValidation() {
        const form = document.getElementById('orderForm');
        const inputs = form.querySelectorAll('input, select');

        // Add blur validation
        inputs.forEach(input => {
            input.addEventListener('blur', function() {
                if (this.value.trim()) {
                    validateField(this);
                }
            });

            input.addEventListener('input', function() {
                if (this.classList.contains('error')) {
                    clearError(this);
                }
            });
        });

        // Form submit handler
        form.addEventListener('submit', async function(e) {
            e.preventDefault();

            if (!validateForm(this)) {
                scrollToFirstError();
                return;
            }

            // Collect form data
            const formData = {
                fullName: document.getElementById('fullName').value.trim(),
                phone: document.getElementById('phone').value.trim(),
                email: document.getElementById('email').value.trim(),
                province: document.getElementById('province').value.trim(),
                provinceCode: document.getElementById('provinceCode').value,
                ward: document.getElementById('ward').value.trim(),
                wardCode: document.getElementById('wardCode').value,
                address: document.getElementById('address').value.trim(),
                addressNote: (document.getElementById('addressNote')?.value || '').trim(),
                babyAge: document.getElementById('babyAge').value.trim()
            };

            // Go to step 2
            goToStep2(formData);
        });
    }

    /**
     * Initialize step 2 buttons
     */
    function initStep2Buttons() {
        const btnBack = document.getElementById('btnBack');

        if (btnBack) {
            btnBack.addEventListener('click', goBackToStep1);
        }
    }

    // ==============================================
    // INITIALIZATION
    // ==============================================

    /**
     * Initialize the order page
     */
    // ==============================================
    // MỞ LẠI ĐƠN CÓ SẴN  (order.html?order=<code>)
    // ==============================================

    /**
     * refresh = true thì server hỏi thẳng cổng thanh toán xem đã nhận tiền chưa
     * thay vì đọc trạng thái đang lưu. Chậm hơn nhưng chắc, dùng cho lần mở trang.
     */
    async function fetchOrderInfo(orderCode, refresh) {
        const response = await fetch(`${PAYMENT_API_URL}/order-info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: "2.0",
                params: { order_code: orderCode, refresh: !!refresh }
            })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        console.log('Order info response:', data);
        return data.result || {};
    }

    /** Tạo giao dịch mới cho đơn cũ (transaction hết hạn hoặc bị huỷ) */
    async function createPaymentForOrder(orderCode, paymentMethodId) {
        const response = await fetch(`${PAYMENT_API_URL}/create-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: "2.0",
                params: { order_code: orderCode, payment_method_id: paymentMethodId }
            })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        console.log('Create payment response:', data);
        return data.result || {};
    }

    /** Số giây còn lại tới hạn thanh toán, 0 nếu không biết hoặc đã qua */
    function secondsUntil(expiredAt) {
        if (!expiredAt) return 0;

        // Odoo trả "YYYY-MM-DD HH:MM:SS" theo giờ UTC
        const timestamp = Date.parse(expiredAt.replace(' ', 'T') + 'Z');
        if (isNaN(timestamp)) return 0;

        return Math.max(0, Math.floor((timestamp - Date.now()) / 1000));
    }

    /** Hộp thoại đơn giản dùng lại style của popup chọn phương thức */
    function showSimpleModal(title, message, buttonLabel) {
        const overlay = document.createElement('div');
        overlay.className = 'pm-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'pm-dialog';

        const heading = document.createElement('h3');
        heading.className = 'pm-title';
        heading.textContent = title;

        const text = document.createElement('p');
        text.className = 'pm-desc';
        text.textContent = message;

        dialog.appendChild(heading);
        dialog.appendChild(text);

        if (buttonLabel) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'pm-ok';
            button.textContent = buttonLabel;
            button.addEventListener('click', function () {
                overlay.remove();
                document.body.style.overflow = '';
            });
            dialog.appendChild(button);
        }

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
        return overlay;
    }

    /** Dựng bước 2 từ dữ liệu một giao dịch đang chờ */
    function applyTransaction(order, transaction) {
        const t = window.i18n || (k => k);
        const method = transaction.payment_method || {};
        const paymentType = method.type || 'sepay';

        orderData.user_profile_id = order.id;
        orderData.transaction_id = transaction.transaction_id;
        orderData.qr_url = transaction.qr_url || null;
        orderData.redirect_url = transaction.payment_url || null;
        orderData.amount = transaction.amount;
        orderData.payment_type = paymentType;
        orderData.status = paymentType === 'cash' ? 'awaiting_contact' : 'processing';

        setTransactionCode(transaction.transaction_id);
        updatePriceDisplay(Number(transaction.amount), null);

        if (paymentType === 'sepay') {
            const qrImg = document.querySelector('#paymentQr img');
            if (qrImg && transaction.qr_url) {
                qrImg.src = transaction.qr_url;
                qrImg.alt = t('order.qrAlt');
            }
        }

        if (paymentType === 'paypal') {
            document.getElementById('paypalPayBtn').onclick = function () {
                if (orderData.redirect_url) openPaymentWindow(orderData.redirect_url);
            };
        }

        renderPaymentStep(paymentType);
        localStorage.setItem(ORDER_DATA_KEY + '_temp', JSON.stringify(orderData));
        showStep(2);

        if (paymentType !== 'cash') {
            startPaymentPolling(secondsUntil(transaction.expired_at));
        }
    }

    /** Đơn đã thanh toán rồi thì sang thẳng trang xác nhận */
    function goToPaidConfirmation(order, transaction) {
        const customer = order.customer || {};
        const tx = transaction || {};

        orderData = {
            step1: {
                fullName: customer.name || '',
                phone: customer.phone || '',
                email: customer.email || '',
                address: order.address || '',
                province: '', ward: '', addressNote: '', babyAge: ''
            },
            user_profile_id: order.id,
            transaction_id: tx.transaction_id || '',
            amount: tx.amount || order.total_cost,
            status: 'confirmed',
            timestamp: new Date().toISOString()
        };
        localStorage.setItem(ORDER_DATA_KEY, JSON.stringify(orderData));

        const page = window.i18nLang === 'en'
            ? 'order-confirmation-en.html'
            : 'order-confirmation.html';
        const params = new URLSearchParams({
            status: 'success',
            already: '1',
            order: orderData.transaction_id
        });
        window.location.href = `${page}?${params.toString()}`;
    }

    /** Giao dịch cũ hỏng: cho khách chọn lại phương thức rồi tạo giao dịch mới */
    async function restartPayment(orderCode, order) {
        const t = window.i18n || (k => k);
        const methods = await ensurePaymentMethods();

        if (!methods.length) {
            showToast(t('payment.methodFailed'), 'error');
            return;
        }

        let method = methods[0];
        if (methods.length > 1) {
            method = await showPaymentMethodModal(methods);
            if (!method) return;
        }

        const result = await createPaymentForOrder(orderCode, method.id);

        if (!result.success) {
            // Đơn vừa được trả ở nơi khác, hoặc vừa bị huỷ
            if (result.error_code === 'ALREADY_PAID') {
                const paid = await fetchOrderInfo(orderCode, false);
                goToPaidConfirmation(paid.order || order, paid.transaction);
                return;
            }
            if (result.error_code === 'ORDER_CANCELLED') {
                showSimpleModal(t('order.notFoundTitle'), t('order.notFoundDesc'), t('order.gotIt'));
                return;
            }
            showToast(result.error || t('order.createFailed'), 'error');
            return;
        }

        // create-payment không trả expired_at, hỏi lại order-info để lấy hạn
        // thanh toán thật rồi dựng màn hình từ cùng một nguồn dữ liệu
        const info = await fetchOrderInfo(orderCode, false);
        if (info.success && info.transaction) {
            applyTransaction(info.order || order, info.transaction);
            return;
        }

        // order-info trục trặc thì vẫn dựng được từ kết quả vừa tạo
        applyTransaction(order, {
            transaction_id: result.transaction_id,
            amount: result.amount,
            qr_url: result.qr_url || '',
            payment_url: result.redirect_url || '',
            expired_at: '',
            payment_method: { id: method.id, type: getPaymentType(method) }
        });
    }

    /**
     * Vào bằng order.html?order=<code>: dựng lại màn hình đúng trạng thái đơn.
     * Trả về true nếu đã tiếp quản trang, false nếu là luồng đặt mới bình thường.
     */
    async function initResumeOrder() {
        const params = new URLSearchParams(window.location.search);
        const orderCode = params.get('order');
        if (!orderCode) return false;

        // Đặt cờ ngay, trước mọi await, để initPackagePricing chạy song song
        // không ghi đè số tiền thật của giao dịch bằng giá niêm yết của gói
        isResumingOrder = true;

        const t = window.i18n || (k => k);
        const loading = showSimpleModal(t('order.loadingTitle'), t('order.loadingDesc'), '');

        try {
            const info = await fetchOrderInfo(orderCode, true);
            loading.remove();
            document.body.style.overflow = '';

            // Đơn bị xoá, hoặc đã huỷ -> ở lại bước 1 để khách đặt đơn mới
            if (!info.success || (info.order && info.order.state === 'cancelled')) {
                showSimpleModal(t('order.notFoundTitle'), t('order.notFoundDesc'), t('order.gotIt'));
                return true;
            }

            const order = info.order || {};
            const transaction = info.transaction;

            // Danh sách phương thức phải theo gói của chính đơn này
            if (order.package && order.package.id) {
                resumeOrderPackageId = order.package.id;
                paymentMethods = [];
            }

            if (info.next_action === 'done') {
                goToPaidConfirmation(order, transaction);
                return true;
            }

            if (info.next_action === 'wait' && transaction) {
                applyTransaction(order, transaction);
                return true;
            }

            // recheckout / checkout: giao dịch cũ hỏng hoặc chưa có
            await restartPayment(orderCode, order);
            return true;

        } catch (error) {
            console.error('Error resuming order:', error);
            loading.remove();
            document.body.style.overflow = '';
            showToast(t('order.networkError'), 'error');
            return true;
        }
    }

    /**
     * Đơn đi từ trang Planting a Seed (order.html?gift=<id>&child=<tên>):
     * không hỏi địa chỉ và số tháng tuổi.
     */
    function initGiftMode() {
        const params = new URLSearchParams(window.location.search);
        const giftId = params.get('gift');
        if (!giftId) return;

        giftMode = { giftId: giftId, childName: (params.get('child') || '').trim() };

        ['province', 'ward', 'address', 'addressNote', 'babyAge'].forEach(function (id) {
            const field = document.getElementById(id);
            if (!field) return;

            field.removeAttribute('required');
            const group = field.closest('.form-group');
            if (group) group.hidden = true;
        });

        // Hàng chứa tỉnh + phường giờ rỗng, giấu luôn cả hàng
        const addressRow = document.querySelector('#province')?.closest('.form-row');
        if (addressRow) addressRow.hidden = true;
    }

    function init() {
        // Check if we're on the order page
        if (!document.getElementById('step1')) {
            return;
        }

        initGiftMode();
        initResumeOrder();

        const downloadBtn = document.getElementById('downloadQrBtn');
        if (downloadBtn) downloadBtn.addEventListener('click', downloadQrCode);


        // Initialize components
        initPackagePricing();
        initAddressDropdowns();
        initFormValidation();
        initStep2Buttons();

        // Check if there's temporary data (user went back)
        const tempData = localStorage.getItem(ORDER_DATA_KEY + '_temp');
        if (tempData) {
            try {
                orderData = JSON.parse(tempData);
                // We could restore form data here if needed
            } catch (error) {
                console.error('Error loading temp data:', error);
            }
        }

        console.log('Order page initialized');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
