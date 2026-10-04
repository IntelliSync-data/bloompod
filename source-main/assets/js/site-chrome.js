/**
 * SITE CHROME — menu và footer dùng chung cho mọi trang.
 *
 * Mỗi trang chỉ để hai chỗ trống, phần riêng khai báo bằng data-*:
 *     <div data-site-header data-active="home" data-cta="index.html#package"></div>
 *     <div data-site-footer></div>
 *     <script src="./assets/js/site-chrome.js"></script>
 *
 * Markup thật nằm ở partials/header-{vi,en}.html và partials/footer-{vi,en}.html.
 * Sửa menu/footer thì sửa trong partials, không sửa trong từng file .html nữa.
 *
 * Lưu ý: dùng fetch nên mở trang bằng file:// sẽ trắng menu. Xem local phải qua
 * http, ví dụ: python3 -m http.server 8080
 *
 * Script nào cần đụng vào menu phải chờ:
 *     document.addEventListener('site-chrome:ready', ...)   hoặc
 *     await window.siteChromeReady
 * vì lúc DOMContentLoaded thì menu chưa fetch về.
 *
 * Riêng link đổi ngôn ngữ thì không cần chờ: đích được đọc lại ngay lúc bấm, nên
 * chỉ cần gán window.siteChrome.langSwitch bất cứ lúc nào (payment.js làm vậy để
 * giữ ?order= khi đổi ngôn ngữ).
 *
 * Lưu ý quan trọng: partial được thay VÀO ĐÚNG CHỖ của thẻ đánh dấu, không bọc
 * thêm thẻ nào. CSS của site có selector cha-con trực tiếp, chen một thẻ bọc vào
 * giữa là .menu-bar .container mất display:flex và logo tụt còn 0 chiều cao.
 *
 * data-hide-if-param="gift": trên URL có param đó thì bỏ hẳn menu/footer, không
 * nạp gì cả. Dùng cho luồng tặng quà đi từ site Planting a Seed sang: khách
 * đang đặt cho một bé cụ thể, không được có đường rẽ về trang chủ Bloompod.
 */

(function () {
    'use strict';

    const query = new URLSearchParams(window.location.search);

    /** Bỏ hẳn menu/footer khi URL mang param được khai báo ở data-hide-if-param */
    function dropIfHidden(slot) {
        if (!slot) return null;
        const param = slot.dataset.hideIfParam;
        if (param && (query.get(param) || '').trim()) {
            slot.remove();
            return null;
        }
        return slot;
    }

    const headerSlot = dropIfHidden(document.querySelector('[data-site-header]'));
    const footerSlot = dropIfHidden(document.querySelector('[data-site-footer]'));
    if (!headerSlot && !footerSlot) {
        document.dispatchEvent(new CustomEvent('site-chrome:ready'));
        return;
    }

    // Thẻ đánh dấu sẽ bị thay mất, nên giữ lại cấu hình trước
    const config = Object.assign({}, headerSlot ? headerSlot.dataset : {});

    window.siteChrome = window.siteChrome || {};

    const file = window.location.pathname.split('/').pop() || 'index.html';
    const lang = config.lang ||
        (footerSlot && footerSlot.dataset.lang) ||
        (file.indexOf('-en.html') >= 0 ? 'en' : 'vi');

    const isEnglish = lang === 'en';

    /** Trang song ngữ tương ứng: order.html <-> order-en.html */
    function twinPage() {
        if (!file || file.indexOf('.html') < 0) return isEnglish ? 'index.html' : 'index-en.html';
        return file.indexOf('-en.html') >= 0
            ? file.replace('-en.html', '.html')
            : file.replace(/\.html$/, '-en.html');
    }

    /** Thay thẻ đánh dấu bằng chính nội dung partial, không để lại thẻ bọc nào */
    async function inject(slot, name) {
        if (!slot) return;

        const response = await fetch('partials/' + name);
        if (!response.ok) throw new Error('HTTP ' + response.status + ' khi lấy partials/' + name);

        const holder = document.createElement('div');
        holder.innerHTML = await response.text();

        const nodes = Array.prototype.slice.call(holder.childNodes);
        slot.replaceWith.apply(slot, nodes);
    }

    // ==============================================
    // GẮN PHẦN RIÊNG CỦA TRANG VÀO MENU
    // ==============================================

    function goTo(url) {
        if (url && url !== 'none') window.location.href = url;
    }

    function configureHeader() {
        const data = config;

        const home = data.home || (isEnglish ? 'index-en.html' : 'index.html');
        document.querySelectorAll('[data-site-home]').forEach(function (el) {
            el.style.cursor = 'pointer';
            el.addEventListener('click', function () { goTo(home); });
        });

        const cta = data.cta || (isEnglish ? 'index-en.html#package' : 'index.html#package');
        document.querySelectorAll('[data-site-cta]').forEach(function (el) {
            el.addEventListener('click', function () { goTo(cta); });
        });

        // Đích đọc lại lúc bấm, để trang khác sửa window.siteChrome.langSwitch lúc nào cũng được
        if (data.langSwitch && window.siteChrome.langSwitch === undefined) {
            window.siteChrome.langSwitch = data.langSwitch;
        }
        document.querySelectorAll('[data-site-lang-switch]').forEach(function (el) {
            if (window.siteChrome.langSwitch === 'none') {
                el.remove();
                return;
            }
            const jump = function () { goTo(window.siteChrome.langSwitch || twinPage()); };
            el.addEventListener('click', jump);
            el.addEventListener('keydown', function (event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    jump();
                }
            });
        });

        (data.hideNav || '').split(',').forEach(function (name) {
            name = name.trim();
            if (!name) return;
            document.querySelectorAll('[data-nav="' + name + '"]').forEach(function (el) {
                el.remove();
            });
        });

        if (data.active && data.active !== 'auto') {
            document.querySelectorAll('[data-nav="' + data.active + '"]').forEach(function (el) {
                el.classList.add('active');
            });
        }
    }

    // ==============================================
    // MENU MOBILE
    // ==============================================

    function wireMobileMenu() {
        const menu = document.getElementById('mobile-menu');
        if (!menu) return;

        function setOpen(open) {
            menu.classList.toggle('active', open);
            document.body.style.overflow = open ? 'hidden' : '';
        }

        const hamburger = document.getElementById('hamburger-btn');
        const close = document.getElementById('mobile-menu-close');
        if (hamburger) hamburger.addEventListener('click', function () { setOpen(true); });
        if (close) close.addEventListener('click', function () { setOpen(false); });

        // Bấm vào mục nào thì đóng menu, kể cả khi chỉ cuộn trong trang
        menu.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', function () { setOpen(false); });
        });
    }

    /** Link trỏ tới chính trang này thì cuộn mượt thay vì tải lại */
    function wireSmoothScroll(root) {
        if (!root) return;
        root.querySelectorAll('a[href*="#"]').forEach(function (link) {
            link.addEventListener('click', function (event) {
                const url = new URL(link.href, window.location.href);
                if (url.pathname !== window.location.pathname || !url.hash) return;

                const target = document.querySelector(url.hash);
                if (!target) return;

                event.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    }

    /** data-active="auto": tô tab theo khối đang xem (trang chủ dùng cái này) */
    function wireScrollSpy() {
        const links = Array.prototype.slice.call(document.querySelectorAll('[data-nav]'));
        const sections = Array.prototype.slice.call(document.querySelectorAll('section[id]'));
        if (!links.length || !sections.length) return;

        function highlight() {
            let current = '';
            sections.forEach(function (section) {
                if (window.pageYOffset >= section.offsetTop - 200) current = section.id;
            });
            links.forEach(function (link) {
                const hash = (link.getAttribute('href') || '').split('#')[1];
                link.classList.toggle('active', !!hash && hash === current);
            });
        }

        window.addEventListener('scroll', highlight, { passive: true });
        highlight();
    }

    // ==============================================
    // CHẠY
    // ==============================================

    window.siteChromeReady = (async function () {
        try {
            await Promise.all([
                inject(headerSlot, 'header-' + lang + '.html'),
                inject(footerSlot, 'footer-' + lang + '.html')
            ]);
        } catch (error) {
            console.error('Không nạp được menu/footer dùng chung:', error);
            return;
        }

        if (headerSlot) {
            configureHeader();
            wireMobileMenu();
            wireSmoothScroll(document.querySelector('.menu-bar'));
            wireSmoothScroll(document.getElementById('mobile-menu'));
            if (config.active === 'auto') wireScrollSpy();
        }

        document.dispatchEvent(new CustomEvent('site-chrome:ready'));
    })();
})();
