/**
 * Planting a Seed — danh sách bé và popup tặng quà.
 *
 * Dữ liệu lấy từ API sản phẩm: mỗi "product" là một bé,
 * `description` là câu trích, `categories[0]` là nhóm tuổi.
 */

const API_BASE = 'https://app.bloompod.vn';

// Gói dành cho đơn tặng quà. Giá lấy từ API, phần còn lại cố định.
// Phải khớp với gift_package_id trong order.js.
const IS_PRODUCTION = window.location.hostname === 'bloompod.vn' ||
    window.location.hostname === 'www.bloompod.vn';
const GIFT_PACKAGE_ID = IS_PRODUCTION ? 6 : 5;

const GIFT = {
    name: 'Bloompod Audio Learning Kit',
    forAge: 'For children aged 0 – 3',
    quantity: '01 Bloompod set',
    price: null,
    image: 'assets/images/bloompod_sp.png'
};

/** Lấy giá gói tặng quà (total_cost) từ package-info */
async function loadGiftPrice() {
    try {
        const response = await fetch(API_BASE + '/api/profile/package-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', params: { package_id: GIFT_PACKAGE_ID } })
        });
        const body = await response.json();
        const pkg = body?.result?.success ? body.result.package : null;
        if (pkg) GIFT.price = Number(pkg.total_cost);
    } catch (error) {
        console.error('Error loading gift price:', error);
    }
}

const money = n => new Intl.NumberFormat('vi-VN').format(n) + ' VND';

/** URL ảnh từ API là đường dẫn tương đối, phải ghép thêm host */
const resolveUrl = path => {
    if (!path) return '';
    return /^https?:\/\//i.test(path) ? path : API_BASE + path;
};

const escapeHtml = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

let children = [];
let activeCategoryId = null;   // null = All Children

const grid = document.querySelector('#grid');
const pills = document.querySelector('.pills');
const sortSelect = document.querySelector('#sort');
const backdrop = document.querySelector('#backdrop');
const modal = document.querySelector('#modal');

async function api(path) {
    const response = await fetch(API_BASE + path);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const body = await response.json();
    return body.data || [];
}

/** Bé đã được tặng thì API trả is_visible = false */
const isGifted = child => child.is_visible === false;

const firstCategory = child => (child.categories || [])[0] || null;
const ageLabel = child => (firstCategory(child) || {}).name || '';
const ageOrder = child => (firstCategory(child) || {}).id || 0;

// ==============================================
// DANH SÁCH
// ==============================================

async function loadCategories() {
    let categories = [];
    try {
        categories = await api('/api/v1/products/categories');
    } catch (error) {
        console.error('Error loading categories:', error);
    }

    // "All Children" cố định, các nhóm tuổi phía sau lấy từ API
    pills.innerHTML = '';
    pills.appendChild(makePill('All Children', '', true));
    categories.forEach(category => {
        pills.appendChild(makePill(category.name, category.id, false));
    });
}

function makePill(label, categoryId, isActive) {
    const button = document.createElement('button');
    button.className = isActive ? 'filter active' : 'filter';
    button.textContent = label;
    button.dataset.categoryId = categoryId;
    return button;
}

async function loadChildren() {
    grid.innerHTML = '';
    try {
        // include_hidden để bé đã được tặng vẫn trả về (kèm is_visible: false),
        // nhờ vậy mới hiện mờ ở cuối danh sách thay vì biến mất
        const params = new URLSearchParams({ include_hidden: '1' });
        if (activeCategoryId) params.set('categoryId', activeCategoryId);
        children = await api('/api/v1/products?' + params.toString());
    } catch (error) {
        console.error('Error loading children:', error);
        children = [];
    }
    render();
}

function render() {
    const list = children.slice();
    const sort = sortSelect.value;

    // API không trả tuổi dạng số, dùng id nhóm tuổi làm thứ tự
    if (sort === 'youngest') list.sort((a, b) => ageOrder(a) - ageOrder(b));
    else if (sort === 'oldest') list.sort((a, b) => ageOrder(b) - ageOrder(a));
    else if (sort === 'name') list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));

    // Bé đã được tặng luôn nằm cuối, bất kể đang sắp xếp kiểu nào
    list.sort((a, b) => Number(isGifted(a)) - Number(isGifted(b)));

    grid.innerHTML = list.map(child => {
        const gifted = isGifted(child);
        return `
        <article class="card${gifted ? ' is-gifted' : ''}">
            <img src="${escapeHtml(resolveUrl(child.url))}" alt="${escapeHtml(child.name)}">
            <div class="card-info">
                <span class="age">${escapeHtml(ageLabel(child))}</span>
                <h3>${escapeHtml(child.name)}</h3>
                <p>“${escapeHtml(child.description)}”</p>
                ${gifted
                    ? '<button class="gift" disabled>🌱 Already gifted</button>'
                    : `<button class="gift" data-id="${escapeHtml(child.id)}">🎁 Gift BloomPod</button>`}
            </div>
        </article>`;
    }).join('');
}

// ==============================================
// POPUP TẶNG QUÀ
// ==============================================

function openGift(child) {
    if (!child) return;

    modal.innerHTML = `
        <div class="gift-child">
            <img src="${escapeHtml(resolveUrl(child.url))}" alt="${escapeHtml(child.name)}">
            <div class="gift-child-text">
                <h3>${escapeHtml(child.name)}</h3>
                <p class="gift-age">${escapeHtml(ageLabel(child))}</p>
                <div class="gift-sprout">🌱</div>
                <p class="gift-quote">“${escapeHtml(child.description)}”</p>
            </div>
        </div>

        <div class="gift-product">
            <h4>The gift</h4>
            <div class="gift-product-row">
                <img src="${GIFT.image}" alt="${escapeHtml(GIFT.name)}">
                <div>
                    <strong>${escapeHtml(GIFT.name)}</strong>
                    <p>${escapeHtml(GIFT.forAge)}</p>
                    <p>${escapeHtml(GIFT.quantity)}</p>
                    <p class="gift-price">${GIFT.price ? 'Gift price: ' + money(GIFT.price) : ''}</p>
                </div>
            </div>
        </div>

        <button class="primary gift-cta" id="giftNow">Gift this</button>`;

    backdrop.classList.add('open');

    document.querySelector('#giftNow').onclick = () => {
        // Sang trang đặt hàng ở chế độ tặng quà: không hỏi địa chỉ và tuổi bé
        const params = new URLSearchParams({ gift: child.id, child: child.name });
        window.location.href = 'order-en.html?' + params.toString();
    };
}

function closeGift() {
    backdrop.classList.remove('open');
}

// ==============================================
// SỰ KIỆN
// ==============================================

pills.addEventListener('click', event => {
    const button = event.target.closest('.filter');
    if (!button) return;

    pills.querySelectorAll('.filter').forEach(x => x.classList.remove('active'));
    button.classList.add('active');
    activeCategoryId = button.dataset.categoryId || null;
    loadChildren();
});

sortSelect.onchange = render;

grid.onclick = event => {
    const button = event.target.closest('[data-id]');
    if (button) openGift(children.find(c => String(c.id) === button.dataset.id));
};

// "Sponsor a Child" — để BloomPod chọn giúp một bé bất kỳ
document.querySelector('#choose').onclick = () => {
    const available = children.filter(c => !isGifted(c));
    if (!available.length) return;
    openGift(available[Math.floor(Math.random() * available.length)]);
};

document.querySelector('#close').onclick = closeGift;
backdrop.onclick = event => {
    if (event.target === backdrop) closeGift();
};

(async function init() {
    await Promise.all([loadCategories(), loadGiftPrice()]);
    await loadChildren();
})();
