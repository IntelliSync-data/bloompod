/**
 * ORDER CONFIRMATION PAGE JAVASCRIPT
 * Display order confirmation based on status and order data from LocalStorage
 */

(function() {
    'use strict';

    // ==============================================
    // CONFIGURATION
    // ==============================================
    const ORDER_DATA_KEY = 'bloomOrderData';

    // ==============================================
    // MAIN LOGIC
    // ==============================================

    /**
     * Get query parameter from URL
     */
    function getQueryParam(param) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(param);
    }

    /**
     * Format amount to Vietnamese currency
     */
    function formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', {
            style: 'decimal',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount) + ' VNĐ';
    }

    /**
     * Display success state with order data
     */
    function displaySuccess(orderData) {
        const successDiv = document.getElementById('confirmationSuccess');
        const failureDiv = document.getElementById('confirmationFailure');

        if (!successDiv || !failureDiv) return;

        // Show success, hide failure
        successDiv.style.display = 'block';
        failureDiv.style.display = 'none';

        // Populate order data
        if (orderData && orderData.step1) {
            const step1 = orderData.step1;

            // Order code - prioritize transaction_id from API
            const orderCodeElement = document.getElementById('displayOrderCode');
            if (orderCodeElement) {
                orderCodeElement.textContent = orderData.transaction_id || orderData.orderCode || '-';
            }

            // Full name
            const fullNameElement = document.getElementById('displayFullName');
            if (fullNameElement && step1.fullName) {
                fullNameElement.textContent = step1.fullName;
            }

            // Phone
            const phoneElement = document.getElementById('displayPhone');
            if (phoneElement && step1.phone) {
                phoneElement.textContent = step1.phone;
            }

            // Email
            const emailElement = document.getElementById('displayEmail');
            if (emailElement && step1.email) {
                emailElement.textContent = step1.email;
            }

            // Address
            const addressElement = document.getElementById('displayAddress');
            if (addressElement && step1.address) {
                const fullAddress = `${step1.address}, ${step1.ward}, ${step1.district}, ${step1.province}`;
                addressElement.textContent = fullAddress;
            }

            // Amount from API
            const amountElements = document.querySelectorAll('.info-row.total .info-value');
            if (amountElements.length > 0 && orderData.amount) {
                amountElements.forEach(el => {
                    el.textContent = formatCurrency(orderData.amount);
                });
            }
        }
    }

    /**
     * Display failure state
     */
    function displayFailure() {
        const successDiv = document.getElementById('confirmationSuccess');
        const failureDiv = document.getElementById('confirmationFailure');

        if (!successDiv || !failureDiv) return;

        // Show failure, hide success
        successDiv.style.display = 'none';
        failureDiv.style.display = 'block';
    }

    /**
     * Đơn đi từ trang Planting a Seed thì hai nút phải về đúng luồng đó:
     * "Về trang chủ" -> danh sách bé, "Thử lại" -> đặt lại quà cho đúng bé.
     */
    function applyGiftLinks() {
        const giftId = getQueryParam('gift');
        if (!giftId) return;

        const t = window.i18n || (k => k);
        const isEnglish = window.location.pathname.includes('-en.html');
        const orderPage = isEnglish ? 'order-en.html' : 'order.html';

        // Chỉ có một bản trang Planting a Seed, không tách VI/EN
        const seedPage = 'planting-a-seed.html';

        document.querySelectorAll(
            '#confirmationSuccess .btn-primary, #confirmationFailure .btn-secondary'
        ).forEach(function (link) {
            link.href = seedPage;
            link.textContent = t('confirm.backToChildren');
        });

        const retry = document.querySelector('#confirmationFailure .btn-primary');
        if (retry) {
            const params = new URLSearchParams({ gift: giftId });
            const childName = getQueryParam('child');
            if (childName) params.set('child', childName);
            retry.href = `${orderPage}?${params.toString()}`;
        }
    }

    /**
     * Mở lại một đơn đã thanh toán từ trước (order.html?order=<code> -> already=1):
     * đổi tiêu đề thành "Đơn hàng XXX đã được thanh toán" thay vì lời cảm ơn
     * như một đơn vừa đặt xong.
     */
    function applyAlreadyPaidText() {
        if (getQueryParam('already') !== '1') return;

        const successDiv = document.getElementById('confirmationSuccess');
        if (!successDiv) return;

        const t = window.i18n || (k => k);
        const code = getQueryParam('order') || '';
        const title = successDiv.querySelector('.confirmation-title');
        const desc = successDiv.querySelector('.confirmation-description');

        if (title) title.textContent = t('confirm.alreadyPaid', { code: code });
        if (desc) desc.textContent = t('confirm.alreadyPaidDesc');
    }

    /**
     * Initialize confirmation page
     */
    function init() {
        // Check if we're on the confirmation page
        if (!document.getElementById('confirmationSuccess')) {
            return;
        }

        // Get status from query parameter
        const status = getQueryParam('status');

        applyGiftLinks();
        applyAlreadyPaidText();

        // Get order data from LocalStorage
        let orderData = null;
        try {
            const orderDataString = localStorage.getItem(ORDER_DATA_KEY);
            if (orderDataString) {
                orderData = JSON.parse(orderDataString);
            }
        } catch (error) {
            console.error('Error loading order data:', error);
        }

        // Display appropriate state
        if (status === 'success' && orderData) {
            displaySuccess(orderData);
        } else if (status === 'expired') {
            displayFailure();
            // Update message for expired
            const t = window.i18n || (k => k);
            const failureDiv = document.getElementById('confirmationFailure');
            if (failureDiv) {
                const title = failureDiv.querySelector('.confirmation-title');
                const desc = failureDiv.querySelector('.confirmation-description');
                if (title) title.textContent = t('confirm.expired.title');
                if (desc) desc.textContent = t('confirm.expired.desc');
            }
        } else {
            displayFailure();
        }

        console.log('Order confirmation page initialized');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
