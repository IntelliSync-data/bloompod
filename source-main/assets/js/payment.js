/**
 * TRANG THANH TOÁN - payment.html / payment-en.html
 *
 * Vào bằng payment.html?order=<order_code>. Trang tự dựng lại trạng thái từ
 * API nên refresh không mất gì; sessionStorage chỉ để vẽ ngay khỏi nháy trắng.
 */

(function () {
    'use strict';

    // ==============================================
    // CONFIGURATION
    // ==============================================

    const isProduction = window.location.hostname === 'bloompod.vn' ||
        window.location.hostname === 'www.bloompod.vn';

    const PAYMENT_API_URL = 'https://app.bloompod.vn/api/profile';
    const PRODUCTS_API_URL = 'https://app.bloompod.vn/api/v1/products';
    const SESSION_KEY = 'bloomPaymentOrder';
    const GIFT_KEY = 'bloomPaymentGift';

    // Backend đặt expired_at = create_date + 1 tiếng
    const PAYMENT_WINDOW_SECONDS = 3600;

    // Giãn dần nhịp hỏi: dồn vào lúc khách đang thao tác, thưa dần về sau
    const POLLING_STEPS = [
        { until: 120, every: 5000 },
        { until: 600, every: 15000 },
        { until: Infinity, every: 30000 }
    ];

    // Bloompod luôn thu đủ 100%. Fishing sẽ bật cờ này khi khách chọn cọc 50%.
    const HALF_PAYMENT = false;

    // ==============================================
    // STATE
    // ==============================================

    let orderCode = '';
    let orderInfo = null;

    // Đơn đi từ trang Planting a Seed: { giftId, childName } hoặc null
    let giftMode = null;
    let paymentMethods = [];
    let gatewayWindow = null;
    let qrFile = null;

    // Chỉ có một phương thức thì hiện thẳng cột phải; nhiều hơn thì mở popup,
    // vì trên điện thoại danh sách cộng chi tiết làm trang rất dài.
    let detailInModal = false;
    let detailHome = null;

    let pollingTimer = null;
    let pollingTimeoutId = null;
    let countdownInterval = null;
    let remainingSeconds = PAYMENT_WINDOW_SECONDS;

    const t = (key, vars) => (window.i18n || (k => k))(key, vars);
    const isEnglish = () => window.i18nLang === 'en';

    // ==============================================
    // HELPERS
    // ==============================================

    function formatCurrency(amount) {
        const suffix = isEnglish() ? ' VND' : ' VNĐ';
        return new Intl.NumberFormat('vi-VN', {
            style: 'decimal',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount || 0) + suffix;
    }

    function formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        const mm = String(minutes).padStart(2, '0');
        const ss = String(secs).padStart(2, '0');
        return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
    }

    /** Odoo trả "YYYY-MM-DD HH:MM:SS" giờ UTC */
    function secondsUntil(expiredAt) {
        if (!expiredAt) return 0;
        const timestamp = Date.parse(String(expiredAt).replace(' ', 'T') + 'Z');
        if (isNaN(timestamp)) return 0;
        return Math.max(0, Math.floor((timestamp - Date.now()) / 1000));
    }

    /**
     * API đã trả theo `lang`, nhưng dữ liệu cũ còn dạng "Tiếng Việt|English"
     * nên vẫn tách nếu gặp. Chỉ nhận dấu "|" - dấu "/" xuất hiện hợp lệ trong
     * chính nội dung (vd "Visa/Mastercard") nên tách theo nó là cắt cụt chữ.
     */
    function methodDescription(method) {
        const raw = String(method.description || '');
        if (!raw.includes('|')) return raw.trim();

        const parts = raw.split('|');
        return ((isEnglish() ? parts[1] : parts[0]) || parts[0] || '').trim();
    }

    /** Ghi chú riêng của phương thức do backend cấu hình, có thể rỗng */
    function methodNotice(method) {
        const notice = (method && method.notice) || {};
        return {
            title: (notice.title || '').trim(),
            description: (notice.description || '').trim()
        };
    }

    function show(id, visible) {
        const el = document.getElementById(id);
        if (el) el.hidden = !visible;
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    // ==============================================
    // API
    // ==============================================

    /** Mã ngôn ngữ Odoo, để API trả tên và mô tả đúng thứ tiếng của trang */
    const apiLang = () => (isEnglish() ? 'en_US' : 'vi_VN');

    async function callApi(path, params) {
        const response = await fetch(`${PAYMENT_API_URL}/${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                params: Object.assign({ lang: apiLang() }, params)
            })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        console.log(`${path} response:`, data);
        return data.result || {};
    }

    const fetchOrderInfo = refresh =>
        callApi('order-info', { order_code: orderCode, refresh: !!refresh });

    const fetchPackageInfo = packageId =>
        callApi('package-info', { package_id: packageId });

    const createPayment = methodId =>
        callApi('create-payment', {
            order_code: orderCode,
            payment_method_id: methodId,
            half_payment: HALF_PAYMENT
        });

    const checkPayment = () =>
        callApi('check-payment', {
            user_profile_id: orderInfo.order.id,
            transaction_code: orderInfo.transaction.transaction_id
        });

    // ==============================================
    // SESSION CACHE
    // ==============================================

    /** Chỉ để vẽ ngay khi refresh. Nguồn thật vẫn là order-info gọi lại mỗi lần. */
    function cacheOrder(info) {
        try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: orderCode, info: info }));
        } catch (error) {
            console.error('Cannot write session cache:', error);
        }
    }

    /**
     * Cổng thanh toán đưa khách rời trang rồi mới trả về, lúc về URL chỉ còn
     * ?order= - mất ?gift= là không ẩn được bé đã tặng nữa. Giữ lại theo đúng
     * mã đơn để quay về vẫn dựng lại được.
     */
    function cacheGift() {
        if (!giftMode) return;
        try {
            sessionStorage.setItem(GIFT_KEY, JSON.stringify({ code: orderCode, gift: giftMode }));
        } catch (error) {
            console.error('Cannot write gift cache:', error);
        }
    }

    function readCachedGift() {
        try {
            const raw = sessionStorage.getItem(GIFT_KEY);
            if (!raw) return null;
            const saved = JSON.parse(raw);
            return saved && saved.code === orderCode ? saved.gift : null;
        } catch (error) {
            return null;
        }
    }

    function readCachedOrder() {
        try {
            const raw = sessionStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            const saved = JSON.parse(raw);
            return saved && saved.code === orderCode ? saved.info : null;
        } catch (error) {
            return null;
        }
    }

    // ==============================================
    // CỘT TRÁI - THÔNG TIN ĐƠN
    // ==============================================

    function renderOrderSummary(info) {
        const order = info.order || {};
        const transaction = info.transaction;

        // order_code để tra đơn; transaction_id là nội dung chuyển khoản.
        // Hai thứ khác nhau, không được hiện lẫn.
        setText('orderCode', orderCode || '-');

        // Giá trị đơn luôn là 100%; số phải trả lấy theo giao dịch đang mở
        const total = Number(order.total_cost) || 0;
        const due = transaction ? Number(transaction.amount) : total;

        setText('orderValue', formatCurrency(total));
        setText('totalAmount', formatCurrency(due));

        const customer = order.customer || {};
        setText('payName', customer.name || '-');
        setText('payPhone', customer.phone || '-');
        setText('payEmail', customer.email || '-');
        setText('payAddress', order.address || '-');

        // Ghi chú gồm địa chỉ cũ và số tháng tuổi của bé. order-info chưa trả
        // trường này nên hàng tự ẩn cho tới khi backend thêm vào.
        const notes = (order.notes || '').trim();
        setText('payNotes', notes || '-');
        show('payNotesRow', !!notes);
    }

    // ==============================================
    // DANH SÁCH PHƯƠNG THỨC
    // ==============================================

    function filterByEnvironment(methods) {
        const wanted = isProduction ? 'live' : 'test';
        const list = methods || [];
        const matched = list.filter(m => !m.environment || m.environment === wanted);

        if (!matched.length && list.length) {
            console.warn(`No payment method for environment "${wanted}", showing all`);
            return list;
        }
        return matched;
    }

    function renderMethodList() {
        const container = document.getElementById('methodList');
        container.innerHTML = '';

        paymentMethods.forEach(function (method) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'method-item';

            const image = document.createElement('img');
            image.src = method.image_url || '';
            image.alt = '';
            image.addEventListener('error', function () {
                image.style.visibility = 'hidden';
            });

            const text = document.createElement('div');
            text.className = 'method-text';

            const name = document.createElement('div');
            name.className = 'method-name';
            name.textContent = method.name || '';
            text.appendChild(name);

            const description = methodDescription(method);
            if (description) {
                const note = document.createElement('div');
                note.className = 'method-desc';
                note.textContent = description;
                text.appendChild(note);
            }

            item.appendChild(image);
            item.appendChild(text);
            item.addEventListener('click', function () {
                chooseMethod(method);
            });
            container.appendChild(item);
        });

        show('methodList', true);
        show('methodDetail', false);
        setText('paymentSectionTitle', t('payment.chooseTitle'));
        setText('paymentDescription', t('payment.chooseDesc'));
    }

    // ==============================================
    // CHI TIẾT MỘT PHƯƠNG THỨC
    // ==============================================

    /** Ẩn hết các khối chi tiết trước khi bật đúng khối cần */
    function resetDetail() {
        ['paymentQr', 'paymentTransfer', 'paymentPaypal', 'paymentCountdown']
            .forEach(id => show(id, false));
    }

    function renderTransfer(transfer, amount, memo) {
        setText('trBank', transfer.bank_name || transfer.bank_code || '-');
        setText('trAccount', transfer.bank_account || '-');
        setText('trAmount', String(Math.round(Number(amount) || 0)));
        setText('trMemo', memo || '-');
        show('paymentTransfer', true);
    }

    /**
     * Dựng màn hình theo giao dịch đang mở.
     * `method` lấy từ transaction.payment_method, trong đó có khối `transfer`
     * cho biết phương thức này cho quét QR, chuyển khoản tay, hay cả hai.
     */
    function renderTransaction(order, transaction, inline) {
        const method = transaction.payment_method || {};
        const transfer = method.transfer || {};
        const types = transfer.types || [];

        resetDetail();
        show('methodList', !!inline ? false : true);
        show('methodDetail', true);
        setText('paymentSectionTitle', method.name || t('payment.chooseTitle'));

        // PayPal và VNPay đưa khách sang trang của họ
        if (transaction.payment_url) {
            setText('paymentDescription', t('payment.paypalDesc'));
            show('paymentPaypal', true);
            document.getElementById('paypalPayBtn').onclick = function () {
                payAtGateway(transaction.payment_url);
            };
        } else {
            setText('paymentDescription', t('payment.transferDesc'));

            if (transaction.qr_url && (!types.length || types.indexOf('qr_pay') !== -1)) {
                const img = document.querySelector('#paymentQr img');
                img.src = transaction.qr_url;
                img.alt = t('order.qrAlt');
                prefetchQrFile(transaction.qr_url);
                show('paymentQr', true);
            }

            if (types.indexOf('bank_transfer') !== -1) {
                renderTransfer(transfer, transaction.amount, transaction.transaction_id);
            }
        }

        show('paymentCountdown', true);

        // Một phương thức thì để luôn trong cột phải, khỏi bắt khách đóng mở
        show('methodBack', !inline);
        if (!inline) openDetailModal();

        startPolling(secondsUntil(transaction.expired_at));
    }

    /** Khối tiền mặt ở cột phải: hiện rõ phương thức rồi mới cho bấm xác nhận */
    function showCashPanel(method) {
        resetDetail();
        show('methodList', false);
        show('methodDetail', true);
        show('methodBack', false);
        show('paymentCash', true);
        setText('paymentSectionTitle', method.name || t('payment.cashTitle'));
        setText('paymentDescription', t('payment.cashPanelDesc'));

        // Một phương thức thì không có popup, chỉ lấy phần mô tả của notice
        const notice = methodNotice(method);
        if (notice.description) setText('cashNote', notice.description);

        document.getElementById('cashConfirmBtn').onclick = function () {
            confirmCash(method);
        };
    }

    /** Chốt đơn tiền mặt: ghi nhận rồi sang trang xác nhận */
    async function confirmCash(method) {
        try {
            const result = await createPayment(method.id);
            if (!result.success && result.error_code !== 'ALREADY_PAID') {
                showToast(result.error || t('order.createFailed'), 'error');
                return;
            }
            goToConfirmation('cash');
        } catch (error) {
            console.error('Error confirming cash payment:', error);
            showToast(t('order.networkError'), 'error');
        }
    }

    /** inline = true khi chỉ có đúng một phương thức, lúc đó không mở popup */
    async function chooseMethod(method, forceInline) {
        const inline = forceInline || isSingleMethod();

        if (method.type === 'cash') {
            if (inline) {
                showCashPanel(method);
                return;
            }
            // Hỏi lại vì tiền mặt không có bước thanh toán nào để khách sửa sai
            // Backend cấu hình được lời nhắc riêng cho tiền mặt; chưa có thì
            // dùng chuỗi mặc định của trang
            const notice = methodNotice(method);
            const agreed = await showConfirmModal(
                notice.title || t('payment.cashConfirmTitle'),
                notice.description || t('payment.cashConfirmDesc'),
                t('payment.cashConfirmOk'),
                t('payment.cashConfirmCancel')
            );
            if (!agreed) return;
            await confirmCash(method);
            return;
        }

        const container = document.getElementById('methodList');
        container.classList.add('is-busy');

        try {
            const result = await createPayment(method.id);

            if (!result.success) {
                closeGatewayWindow();
                if (result.error_code === 'ALREADY_PAID') {
                    goToConfirmation('success');
                    return;
                }
                showToast(result.error || t('order.createFailed'), 'error');
                return;
            }

            // Hỏi lại order-info để có expired_at và khối transfer đầy đủ
            const info = await fetchOrderInfo(false);
            if (info.success && info.transaction) {
                orderInfo = info;
                cacheOrder(info);
                renderOrderSummary(info);
                renderTransaction(info.order, info.transaction, inline);
            } else {
                closeGatewayWindow();
                showToast(t('order.networkError'), 'error');
            }
        } catch (error) {
            console.error('Error choosing payment method:', error);
            closeGatewayWindow();
            showToast(t('order.networkError'), 'error');
        } finally {
            container.classList.remove('is-busy');
        }
    }

    // ==============================================
    // CỔNG THANH TOÁN NGOÀI (PayPal)
    // ==============================================

    /**
     * Mở cửa sổ PayPal. Luôn gọi thẳng trong cú click của khách - mở sau await
     * thì trình duyệt coi là popup tự bung và chặn. Trả null khi bị chặn.
     */
    function openGatewayWindow(url) {
        const width = 500;
        const height = 720;
        const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
        const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);

        gatewayWindow = window.open(
            url,
            'bloompodPaymentWindow',
            `width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)},resizable=yes,scrollbars=yes`
        );
        if (!gatewayWindow) return null;

        gatewayWindow.focus();
        return gatewayWindow;
    }

    /**
     * Bấm nút "Thanh toán qua PayPal": link đã có sẵn trong giao dịch nên mở
     * thẳng vào PayPal, không qua cửa sổ trống nào. Bị chặn popup thì đi bằng
     * chính tab hiện tại, đừng để khách kẹt.
     */
    function payAtGateway(url) {
        if (openGatewayWindow(url)) return;
        stopPolling();
        window.location.href = url;
    }

    function closeGatewayWindow() {
        if (gatewayWindow && !gatewayWindow.closed) gatewayWindow.close();
        gatewayWindow = null;
    }

    // ==============================================
    // LƯU ẢNH QR
    // ==============================================

    function prefetchQrFile(url) {
        qrFile = null;
        if (!url) return;

        // Máy tính không hiện nút lưu ảnh nên khỏi tải cho tốn request
        if (!window.matchMedia('(pointer: coarse)').matches) return;

        const fileName = `bloompod-qr-${orderCode || 'payment'}.png`;
        fetch(url)
            .then(response => response.blob())
            .then(blob => {
                qrFile = new File([blob], fileName, { type: blob.type || 'image/png' });
            })
            .catch(error => console.error('Error prefetching QR:', error));
    }

    function saveQrAsDownload(file, fallbackUrl) {
        if (!file) {
            window.open(fallbackUrl, '_blank');
            return;
        }
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /** iOS: <a download> chỉ bỏ file vào Files, muốn vào thư viện Ảnh phải qua share sheet */
    function downloadQrCode() {
        const img = document.querySelector('#paymentQr img');
        if (!img || !img.src) return;

        if (qrFile && navigator.canShare && navigator.canShare({ files: [qrFile] })) {
            navigator.share({ files: [qrFile] }).catch(function (error) {
                if (error && error.name === 'AbortError') return;
                saveQrAsDownload(qrFile, img.src);
            });
            return;
        }
        saveQrAsDownload(qrFile, img.src);
    }

    // ==============================================
    // COPY
    // ==============================================

    async function copyValue(button) {
        const target = document.getElementById(button.dataset.copy);
        const value = target ? target.textContent.trim() : '';
        if (!value || value === '-') return;

        try {
            await navigator.clipboard.writeText(value);
        } catch (error) {
            const field = document.createElement('textarea');
            field.value = value;
            field.setAttribute('readonly', '');
            field.style.position = 'fixed';
            field.style.opacity = '0';
            document.body.appendChild(field);
            field.select();
            document.execCommand('copy');
            field.remove();
        }

        button.classList.add('is-copied');
        setTimeout(() => button.classList.remove('is-copied'), 1500);
    }

    // ==============================================
    // ĐẾM NGƯỢC + POLLING
    // ==============================================

    function startCountdown(seconds) {
        remainingSeconds = seconds > 0 ? Math.floor(seconds) : PAYMENT_WINDOW_SECONDS;
        const timer = document.getElementById('countdownTimer');
        if (!timer) return;

        timer.textContent = formatTime(remainingSeconds);
        if (countdownInterval) clearInterval(countdownInterval);

        countdownInterval = setInterval(function () {
            remainingSeconds--;
            timer.textContent = formatTime(Math.max(0, remainingSeconds));
            if (remainingSeconds <= 0) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }
        }, 1000);
    }

    function stopPolling() {
        if (pollingTimer) clearTimeout(pollingTimer);
        pollingTimer = null;
        if (pollingTimeoutId) clearTimeout(pollingTimeoutId);
        pollingTimeoutId = null;
        if (countdownInterval) clearInterval(countdownInterval);
        countdownInterval = null;
    }

    function startPolling(seconds) {
        stopPolling();
        startCountdown(seconds);

        const startedAt = Date.now();
        const nextDelay = () => {
            const elapsed = (Date.now() - startedAt) / 1000;
            return POLLING_STEPS.find(step => elapsed < step.until).every;
        };

        async function poll() {
            try {
                const result = await checkPayment();
                if (result.success) {
                    if (result.status === 'confirmed') {
                        stopPolling();
                        goToConfirmation('success');
                        return;
                    }
                    if (result.status === 'expired') {
                        stopPolling();
                        showToast(t('payment.expiredRetry'), 'error');
                        await loadMethods();
                        return;
                    }
                }
            } catch (error) {
                console.error('Error during polling:', error);
            }

            if (pollingTimer !== null) pollingTimer = setTimeout(poll, nextDelay());
        }

        pollingTimer = setTimeout(poll, POLLING_STEPS[0].every);
        pollingTimeoutId = setTimeout(function () {
            stopPolling();
            showToast(t('payment.expiredRetry'), 'error');
            loadMethods();
        }, (seconds > 0 ? seconds : PAYMENT_WINDOW_SECONDS) * 1000);
    }

    // ==============================================
    // ĐIỀU HƯỚNG
    // ==============================================

    /** mode: 'success' cho đã thu tiền, 'cash' cho đơn chờ liên hệ */
    /**
     * Ẩn bé đã được tặng khỏi trang Planting a Seed.
     * Lỗi ở đây không được chặn luồng: khách trả tiền rồi thì vẫn phải sang
     * được trang xác nhận.
     */
    async function hideGiftedChild() {
        if (!giftMode) return;

        try {
            const response = await fetch(`${PRODUCTS_API_URL}/${giftMode.giftId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_visible: false })
            });
            console.log('Hide gifted child:', response.status);
        } catch (error) {
            console.error('Error hiding gifted child:', error);
        }
    }

    async function goToConfirmation(mode) {
        stopPolling();
        closeGatewayWindow();

        // Chỉ ẩn bé khi đã thật sự thu được tiền. Đơn tiền mặt chưa trả đồng nào
        // nên vẫn để bé trong danh sách.
        if (mode === 'success') await hideGiftedChild();

        const page = isEnglish() ? 'order-confirmation-en.html' : 'order-confirmation.html';
        const params = new URLSearchParams({ status: 'success', order: orderCode });
        if (mode === 'cash') params.set('cash', '1');

        // Trang xác nhận dùng cái này để đổi nút về đúng trang Planting a Seed
        if (giftMode) {
            params.set('gift', giftMode.giftId);
            if (giftMode.childName) params.set('child', giftMode.childName);
        }

        window.location.href = `${page}?${params.toString()}`;
    }

    /** Hỏi lại trước khi chốt, tránh khách bấm nhầm. Resolve true nếu đồng ý. */
    function showConfirmModal(title, message, okLabel, cancelLabel) {
        return new Promise(function (resolve) {
            const overlay = document.createElement('div');
            overlay.className = 'pm-overlay';

            const dialog = document.createElement('div');
            dialog.className = 'pm-dialog';
            dialog.innerHTML = '<h3 class="pm-title"></h3><p class="pm-desc"></p>';
            dialog.querySelector('.pm-title').textContent = title;
            dialog.querySelector('.pm-desc').textContent = message;

            const actions = document.createElement('div');
            actions.className = 'pm-actions';

            function close(answer) {
                overlay.remove();
                document.body.style.overflow = '';
                resolve(answer);
            }

            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'pm-cancel';
            cancel.textContent = cancelLabel;
            cancel.addEventListener('click', () => close(false));

            const ok = document.createElement('button');
            ok.type = 'button';
            ok.className = 'pm-ok';
            ok.textContent = okLabel;
            ok.addEventListener('click', () => close(true));

            actions.appendChild(cancel);
            actions.appendChild(ok);
            dialog.appendChild(actions);
            overlay.appendChild(dialog);
            overlay.addEventListener('click', function (event) {
                if (event.target === overlay) close(false);
            });

            document.body.appendChild(overlay);
            document.body.style.overflow = 'hidden';
        });
    }

    // ==============================================
    // CHI TIẾT: TRONG CỘT PHẢI HAY TRONG POPUP
    // ==============================================

    /**
     * Đưa khối chi tiết vào popup bằng cách di chuyển chính node đó, thay vì
     * dựng lại markup lần hai - nhờ vậy mọi id và sự kiện giữ nguyên.
     */
    function openDetailModal() {
        const detail = document.getElementById('methodDetail');
        if (!detailHome) detailHome = detail.parentNode;

        const overlay = document.createElement('div');
        overlay.className = 'pm-overlay';
        overlay.id = 'detailOverlay';

        const dialog = document.createElement('div');
        dialog.className = 'pm-dialog pm-dialog--detail';

        dialog.appendChild(detail);
        overlay.appendChild(dialog);
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) closeDetail();
        });

        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
        detailInModal = true;
    }

    /** Đóng popup chi tiết, trả node về cột phải và quay lại danh sách */
    function closeDetail() {
        const detail = document.getElementById('methodDetail');
        const overlay = document.getElementById('detailOverlay');

        if (detailInModal && detailHome) {
            detailHome.appendChild(detail);
            if (overlay) overlay.remove();
            document.body.style.overflow = '';
            detailInModal = false;
        }

        stopPolling();
        closeGatewayWindow();
        resetDetail();
        show('methodDetail', false);
        show('methodList', true);
        setText('paymentSectionTitle', t('payment.chooseTitle'));
        setText('paymentDescription', t('payment.chooseDesc'));
    }

    function showBlockingModal(title, message, buttonLabel, onClose) {
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
                if (onClose) onClose();
            });
            dialog.appendChild(button);
        }

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
        return overlay;
    }

    // ==============================================
    // KHỞI ĐỘNG
    // ==============================================

    /** Nạp danh sách phương thức theo gói của đơn. Chỉ nạp, không vẽ. */
    /**
     * Nút đổi ngôn ngữ trong header là onclick cứng sang trang kia, không mang
     * theo ?order= nên bấm vào là mất đơn. Gắn lại cho giữ nguyên tham số.
     */
    function keepOrderOnLanguageSwitch() {
        const target = isEnglish() ? './payment.html' : './payment-en.html';
        const url = `${target}${window.location.search}`;

        document.querySelectorAll('[onclick*="payment-en.html"], [onclick*="payment.html"]')
            .forEach(function (el) {
                el.removeAttribute('onclick');
                el.addEventListener('click', function () {
                    window.location.href = url;
                });
            });
    }

    async function ensureMethods() {
        if (paymentMethods.length) return paymentMethods;

        const packageId = orderInfo && orderInfo.order && orderInfo.order.package
            ? orderInfo.order.package.id
            : null;
        if (!packageId) return paymentMethods;

        const data = await fetchPackageInfo(packageId);
        if (data.success) paymentMethods = filterByEnvironment(data.payment_methods);
        return paymentMethods;
    }

    /** Chỉ còn một phương thức thì không có gì để chọn, khỏi mở popup */
    const isSingleMethod = () => paymentMethods.length <= 1;

    async function loadMethods() {
        stopPolling();
        closeGatewayWindow();
        resetDetail();
        await ensureMethods();

        if (!paymentMethods.length) {
            showToast(t('payment.methodFailed'), 'error');
            return;
        }

        renderMethodList();

        // Một phương thức thì chọn luôn và hiện ngay tại cột phải
        if (paymentMethods.length === 1) {
            await chooseMethod(paymentMethods[0], true);
        }
    }

    async function init() {
        if (!document.getElementById('methodList')) return;

        const params = new URLSearchParams(window.location.search);
        orderCode = params.get('order') || '';

        const giftId = params.get('gift');
        if (giftId) {
            giftMode = { giftId: giftId, childName: (params.get('child') || '').trim() };
            // Go back return to the Planting a Seed page with the same gift and child parameters
            const btnBack = document.getElementById('btnBack');
            if (btnBack) {
                btnBack.href = 'order-en.html?' +
                    new URLSearchParams({ gift: giftId, child: giftMode.childName });
            }
        } else {
            giftMode = readCachedGift();
        }
        cacheGift();
        
        if (!orderCode) {
            showBlockingModal(t('order.notFoundTitle'), t('order.notFoundDesc'), t('order.gotIt'),
                () => { window.location.href = isEnglish() ? 'order-en.html' : 'order.html'; });
            return;
        }

        keepOrderOnLanguageSwitch();

        document.getElementById('downloadQrBtn')
            .addEventListener('click', downloadQrCode);
        document.getElementById('methodBack')
            .addEventListener('click', closeDetail);
        document.querySelectorAll('.transfer-copy').forEach(function (button) {
            button.addEventListener('click', function () { copyValue(button); });
        });

        // Vẽ ngay từ cache để khỏi nháy trắng, rồi mới hỏi lại server
        const cached = readCachedOrder();
        if (cached) renderOrderSummary(cached);

        const loading = showBlockingModal(t('order.loadingTitle'), t('order.loadingDesc'), '');

        try {
            const info = await fetchOrderInfo(true);
            loading.remove();
            document.body.style.overflow = '';

            if (!info.success || (info.order && info.order.state === 'cancelled')) {
                showBlockingModal(t('order.notFoundTitle'), t('order.notFoundDesc'), t('order.gotIt'),
                    () => { window.location.href = isEnglish() ? 'order-en.html' : 'order.html'; });
                return;
            }

            orderInfo = info;
            cacheOrder(info);
            renderOrderSummary(info);

            if (info.next_action === 'done') {
                goToConfirmation('success');
                return;
            }

            if (info.next_action === 'wait' && info.transaction) {
                // Phải biết có bao nhiêu phương thức trước khi quyết định
                // hiện popup hay để thẳng cột phải, và để nút "chọn phương
                // thức khác" còn có danh sách mà quay về
                await ensureMethods();
                renderMethodList();
                renderTransaction(info.order, info.transaction, isSingleMethod());
                return;
            }

            await loadMethods();
        } catch (error) {
            console.error('Error loading payment page:', error);
            loading.remove();
            document.body.style.overflow = '';
            showToast(t('order.networkError'), 'error');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
