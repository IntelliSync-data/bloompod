/**
 * ORDER PAGE JAVASCRIPT - Bloompod Language Readiness System
 * Handles: Form validation, vAPI address dropdown, step navigation, LocalStorage
 */

(function () {
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
    // Chỉ có một bản trang Planting a Seed, không tách VI/EN (giống order-confirmation.js)
    const SEED_PAGE = 'https://website-demo.xn--hthng-171byc.vn/pas_bloom/#gg-children';
    // Giữ tạm thông tin khách khi bé bị người khác bảo trợ và phải chọn lại
    const FORM_DRAFT_KEY = 'bloomOrderDraft';

    // Đơn tặng quà từ trang Planting a Seed: { giftId, childName } hoặc null
    let giftMode = null;

    // Email đã gửi inquiry. Giữ kèm trong draft để khi khách phải quay lại chọn
    // bé khác (trang tải lại) vẫn không gửi thêm một lead trùng cho sale.
    let sentInquiryEmail = '';

    /** Đơn tặng quà dùng gói riêng, giá khác gói bán lẻ */
    function getPackageId() {
        return giftMode ? ENV_CONFIG.gift_package_id : ENV_CONFIG.package_id;
    }

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
        if (sentInquiryEmail && sentInquiryEmail === formData.email) return null;
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
            sentInquiryEmail = formData.email;
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
            // Tên, SĐT và địa chỉ đã có key riêng nên không lặp lại trong notes.
            const fullAddress = buildAddress(formData);
            const notes = buildNoteParts(formData).join(', ');

            const params = {
                package_id: getPackageId(),
                name: formData.fullName,
                phone: formData.phone,
                email: formData.email,
                address: fullAddress,
                notes: notes
            };

            // Đơn tặng quà: BE dựa vào metadata.gift.product_id để giữ chỗ bé ngay
            // lúc tạo đơn, và trả lại nguyên khối này trong order-info
            if (giftMode) {
                params.metadata = {
                    gift: {
                        product_id: Number(giftMode.giftId) || giftMode.giftId,
                        child_name: giftMode.childName
                    }
                };
            }

            const response = await fetch(`${PAYMENT_API_URL}/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ jsonrpc: "2.0", params: params })
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
     * Go to Step 2 - Now with API integration
     */
    // ==============================================
    // PAYMENT METHODS
    // ==============================================

    // ==============================================
    // PAYPAL WINDOW
    // ==============================================

    /**
     * Tạo đơn rồi chuyển sang trang thanh toán.
     * Phương thức thanh toán chọn ở trang đó chứ không phải ở đây, nên đơn
     * sinh ra chưa gắn phương thức và giá hiển thị là 100%.
     */
    async function submitOrder(formData) {
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
            await submitInquiry(formData);
            const response = await createOrder(formData);

            if (!response.result || !response.result.success) {
                // Bé vừa bị người khác bảo trợ: đơn CHƯA được tạo, mời chọn bé khác.
                // Bắt theo error_code, chuỗi error có thể đổi.
                if (response.result?.error_code === 'child_unavailable') {
                    saveFormDraft(formData);
                    showChildTakenModal();
                    restoreButton();
                    return;
                }
                showToast(response.result?.error || t('order.createFailed'), 'error');
                restoreButton();
                return;
            }

            const orderCode = response.result.order_code || response.result.transaction_id;
            if (!orderCode) {
                console.error('Create order did not return an order code:', response.result);
                showToast(t('order.createFailed'), 'error');
                restoreButton();
                return;
            }

            const page = window.i18nLang === 'en' ? 'payment-en.html' : 'payment.html';
            const params = new URLSearchParams({ order: orderCode });

            // Đơn tặng quà phải mang ngữ cảnh đi tiếp: trang thanh toán cần nó
            // để ẩn bé sau khi trả tiền, trang xác nhận cần để quay lại đúng chỗ
            if (giftMode) {
                params.set('gift', giftMode.giftId);
                if (giftMode.childName) params.set('child', giftMode.childName);
            }

            window.location.href = `${page}?${params.toString()}`;

        } catch (error) {
            console.error('Error submitting order:', error);
            showToast(t('order.networkError'), 'error');
            restoreButton();
        }
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
            input.addEventListener('blur', function () {
                if (this.value.trim()) {
                    validateField(this);
                }
            });

            input.addEventListener('input', function () {
                if (this.classList.contains('error')) {
                    clearError(this);
                }
            });
        });

        // Form submit handler
        form.addEventListener('submit', async function (e) {
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
            submitOrder(formData);
        });
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

        restoreFormDraft();
    }

    // ==============================================
    // BÉ ĐÃ CÓ NGƯỜI BẢO TRỢ
    // ==============================================

    /** Giữ tạm thông tin khách, chọn bé khác xong khỏi gõ lại */
    function saveFormDraft(formData) {
        try {
            sessionStorage.setItem(FORM_DRAFT_KEY, JSON.stringify({
                fullName: formData.fullName,
                phone: formData.phone,
                email: formData.email,
                sentInquiryEmail: sentInquiryEmail
            }));
        } catch (error) {
            console.error('Cannot save form draft:', error);
        }
    }

    function restoreFormDraft() {
        let draft = null;
        try {
            const raw = sessionStorage.getItem(FORM_DRAFT_KEY);
            if (raw) draft = JSON.parse(raw);
        } catch (error) {
            return;
        }
        if (!draft) return;

        sentInquiryEmail = draft.sentInquiryEmail || '';

        ['fullName', 'phone', 'email'].forEach(function (id) {
            const field = document.getElementById(id);
            if (field && !field.value && draft[id]) field.value = draft[id];
        });
    }

    /** Popup báo bé đã có người bảo trợ. Đóng được, để khách còn xem lại form. */
    function showChildTakenModal() {
        const t = window.i18n || (k => k);

        const overlay = document.createElement('div');
        overlay.className = 'pm-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'pm-dialog';
        dialog.innerHTML = '<h3 class="pm-title"></h3><p class="pm-desc"></p>';
        dialog.querySelector('.pm-title').textContent = t('order.childTaken.title');
        dialog.querySelector('.pm-desc').textContent = t('order.childTaken.desc');

        const actions = document.createElement('div');
        actions.className = 'pm-actions';

        function close() {
            overlay.remove();
            document.body.style.overflow = '';
        }

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'pm-cancel';
        cancel.textContent = t('order.childTaken.close');
        cancel.addEventListener('click', close);

        const ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'pm-ok';
        ok.textContent = t('order.childTaken.ok');
        ok.addEventListener('click', function () { window.location.href = SEED_PAGE; });

        actions.appendChild(cancel);
        actions.appendChild(ok);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) close();
        });

        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
    }

    function init() {
        // Check if we're on the order page
        if (!document.getElementById('step1')) {
            return;
        }

        initGiftMode();
        initAddressDropdowns();
        initFormValidation();

        console.log('Order page initialized');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
