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

    const ENV_CONFIG = isProduction
        ? { package_id: 4, payment_method_id: 3 }   // production
        : { package_id: 3, payment_method_id: 1 };   // demo

    // v2 = địa giới hành chính mới từ 1/7/2025: 34 tỉnh/thành, bỏ cấp quận/huyện
    const API_BASE_URL = 'https://provinces.open-api.vn/api/v2';
    const INQUIRY_API_URL = 'https://app.bloompod.vn/api/inquiry';
    const PAYMENT_API_URL = 'https://app.bloompod.vn/api/profile';
    const ORDER_DATA_KEY = 'bloomOrderData';
    const POLLING_INTERVAL = 5000; // 5 seconds
    const POLLING_TIMEOUT = 300000; // 5 minutes

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
    async function submitInquiry(formData) {
        try {
            const fullAddress = `${formData.address}, ${formData.ward}, ${formData.province}`;
            const addressNoteStr = formData.addressNote ? `, Địa chỉ cũ: ${formData.addressNote}` : '';
            const message = `Bé ${formData.babyAge} tháng tuổi, ${fullAddress}${addressNoteStr}`;

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
    async function createOrder(formData) {
        try {
            // Địa chỉ mới đi vào key `address` riêng, ngăn nhau bằng dấu phẩy.
            // Ghi chú địa chỉ cũ vẫn nằm trong `notes` như trước.
            const fullAddress = `${formData.address}, ${formData.ward}, ${formData.province}`;
            // Tên, SĐT và địa chỉ đã có key riêng nên không lặp lại trong notes
            const addressNoteStr = formData.addressNote ? `Địa chỉ cũ: ${formData.addressNote}, ` : '';
            const notes = `${addressNoteStr}Bé ${formData.babyAge} tháng tuổi`;

            const response = await fetch(`${PAYMENT_API_URL}/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    params: {
                        package_id: ENV_CONFIG.package_id,
                        name: formData.fullName,
                        phone: formData.phone,
                        email: formData.email,
                        address: fullAddress,
                        notes: notes,
                        payment_method_id: ENV_CONFIG.payment_method_id
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
                        package_id: ENV_CONFIG.package_id
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
    async function goToStep2(formData) {
        // Save form data first
        orderData.step1 = formData;
        orderData.timestamp = new Date().toISOString();

        // Show loading state
        const submitBtn = document.querySelector('#orderForm button[type="submit"]');
        const originalText = submitBtn.textContent;
        const t = window.i18n || (k => k);
        submitBtn.disabled = true;
        submitBtn.textContent = t('order.creating');

        try {
            // Submit inquiry first (save user info)
            await submitInquiry(formData);

            // Call API to create order
            const response = await createOrder(formData);

            // Check if API call was successful
            if (response.result && response.result.success) {
                // Save API response data
                orderData.user_profile_id = response.result.user_profile_id;
                orderData.transaction_id = response.result.transaction_id;
                orderData.qr_url = response.result.qr_url;
                orderData.amount = response.result.amount;
                orderData.status = 'processing';

                // Update UI with API data
                document.getElementById('orderCode').textContent = response.result.transaction_id;

                // Update amount display (keep the struck-through original price
                // when the package is on a promotional price)
                const paidAmount = Number(response.result.amount);
                const originalAmount = packageInfo && packageInfo.use_promotional_price
                    ? getOriginalCost(packageInfo)
                    : null;
                updatePriceDisplay(paidAmount, originalAmount);

                // Update QR Code
                const qrImg = document.querySelector('.qr-code img');
                if (qrImg && response.result.qr_url) {
                    qrImg.src = response.result.qr_url;
                    qrImg.alt = t('order.qrAlt');
                }

                // Save to LocalStorage temporarily
                localStorage.setItem(ORDER_DATA_KEY + '_temp', JSON.stringify(orderData));

                // Show step 2
                showStep(2);

                // Start polling for payment status
                startPaymentPolling();

            } else {
                // API returned error
                const errorMsg = response.result?.error || t('order.createFailed');
                showToast(errorMsg, 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }

        } catch (error) {
            // Network or other errors
            console.error('Error in goToStep2:', error);
            showToast(t('order.networkError'), 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
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
            const pkg = data?.result?.success ? data.result.package : null;
            if (!pkg) return;

            packageInfo = pkg;

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
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    /**
     * Start countdown timer
     */
    function startCountdown() {
        remainingSeconds = 300; // Reset to 5 minutes
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
    function startPaymentPolling() {
        if (!orderData.user_profile_id || !orderData.transaction_id) {
            console.error('Cannot start polling: missing user_profile_id or transaction_id');
            return;
        }

        // Clear any existing polling
        stopPaymentPolling();

        console.log('Starting payment polling...');

        // Start countdown timer
        startCountdown();

        // Start polling every 5 seconds
        pollingInterval = setInterval(async () => {
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
                        const confirmPageExp = window.i18nLang === 'en' ? 'order-confirmation-en.html' : 'order-confirmation.html';
                        window.location.href = `${confirmPageExp}?status=expired`;
                    }
                    // If 'processing', continue polling
                }
            } catch (error) {
                console.error('Error during polling:', error);
                // Continue polling even if there's an error
            }
        }, POLLING_INTERVAL);

        // Set timeout for 5 minutes - auto go back to step 1
        pollingTimeoutId = setTimeout(() => {
            console.log('Polling timeout reached - returning to step 1');
            stopPaymentPolling();
            goBackToStep1();
        }, POLLING_TIMEOUT);
    }

    /**
     * Stop payment polling
     */
    function stopPaymentPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
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
            clearInterval(pollingInterval);
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
            timerElement.textContent = '05:00';
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
    function completeOrder() {
        // Save final data to LocalStorage
        localStorage.setItem(ORDER_DATA_KEY, JSON.stringify(orderData));

        // Redirect to confirmation page
        const confirmPage = window.i18nLang === 'en' ? 'order-confirmation-en.html' : 'order-confirmation.html';
        window.location.href = `${confirmPage}?status=success`;
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
    function init() {
        // Check if we're on the order page
        if (!document.getElementById('step1')) {
            return;
        }

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
