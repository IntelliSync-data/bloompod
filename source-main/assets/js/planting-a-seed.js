const children = [
    { id: 1, name: "Minh Khang", age: 2, group: "2-3", img: "assets/images/child-1.jpg", quote: "A bright smile and a curious mind." },
    { id: 2, name: "Gia Hưng", age: 1, group: "1-2", img: "assets/images/child-2.jpg", quote: "Exploring the world one sound at a time." },
    { id: 3, name: "Bảo Ngọc", age: 2, group: "2-3", img: "assets/images/child-3.jpg", quote: "A little girl with big dreams." },
    { id: 4, name: "Tuệ An", age: 1, group: "1-2", img: "assets/images/child-4.jpg", quote: "Small steps towards a bright future." },
    { id: 5, name: "Hoàng Nam", age: 1, group: "1-2", img: "assets/images/child-5.jpg", quote: "Every child has a story to grow." },
    { id: 6, name: "Đức Phát", age: 0, group: "0-1", img: "assets/images/child-6.jpg", quote: "A world of possibilities awaits." },
    { id: 7, name: "Sơn Tùng", age: 2, group: "2-3", img: "assets/images/child-7.jpg", quote: "Brave, kind and full of potential." },
    { id: 8, name: "Thảo My", age: 2, group: "2-3", img: "assets/images/child-8.jpg", quote: "A smile that lights up the day." },
    { id: 9, name: "Khánh Linh", age: 2, group: "2-3", img: "assets/images/child-9.jpg", quote: "Curious today, confident tomorrow." },
    { id: 10, name: "Hồng Anh", age: 2, group: "2-3", img: "assets/images/child-10.jpg", quote: "A little one with a bright tomorrow." }];
let age = "all"; 
const grid = document.querySelector("#grid"), 
money = n => new Intl.NumberFormat("vi-VN").format(n) + " VND";
function render() 
{ let list = children.filter(c => age === "all" || c.group === age), 
    s = document.querySelector("#sort").value; 
    if (s === "youngest") list.sort((a, b) => a.age - b.age); 
    if (s === "oldest") list.sort((a, b) => b.age - a.age); 
    if (s === "name") list.sort((a, b) => a.name.localeCompare(b.name, "vi")); 
    grid.innerHTML = list.map(c => `<article class="card"><img src="${c.img}" alt="${c.name}"><div class="card-info">
        <span class="age">${c.age === 0 ? "0 – 1 year" : c.age + " years"}</span><h3>${c.name}
        </h3><p>“${c.quote}”</p><button class="gift" data-id="${c.id}">
        🎁 Gift BloomPod</button></div></article>`).join("") }
const backdrop = document.querySelector("#backdrop"), modal = document.querySelector("#modal");
function openGift(c) { c = c || { name: "a child in need", img: "assets/images/child-1.jpg", quote: "Let BloomPod choose a child for you." }; modal.innerHTML = `<h2>Gift a BloomPod</h2><p>Plant a seed of language and opportunity.</p><div class="modal-child"><img src="${c.img}" alt="${c.name}"><div><strong>${c.name}</strong><br><small>${c.quote}</small></div></div><div class="price"><div><small>Regular price</small><div class="old">1,950,000 VND</div><small>30% gifting discount</small></div><div class="new">${money(1350000)}</div></div><h4>Recipient / Sponsor information</h4><form id="form"><div class="form-row"><input required placeholder="Your full name"><input required type="email" placeholder="Email address"></div><div class="form-row"><input required placeholder="Phone number"><input required placeholder="City / Province"></div><h4>Payment method</h4><select required><option value="">Choose payment method</option><option>Bank transfer</option><option>QR payment</option><option>Cash / Direct support</option></select><button class="primary">Continue to Payment · ${money(1350000)}</button></form><p style="font-size:11px;color:#78847d">Demo only: this prototype does not process real payments.</p>`; backdrop.classList.add("open"); document.querySelector("#form").onsubmit = e => { e.preventDefault(); modal.innerHTML = `<div class="success"><div class="heart">🌱❤️</div><h2>Thank you for planting a seed.</h2><p>Your support will help a child take a small step toward a brighter tomorrow.</p><button class="primary" id="done">Back to children</button></div>`; document.querySelector("#done").onclick = closeGift } }
function closeGift() { backdrop.classList.remove("open") }
document.querySelectorAll(".filter").forEach(b => b.onclick = () => { document.querySelectorAll(".filter").forEach(x => x.classList.remove("active")); b.classList.add("active"); age = b.dataset.age; render() });
document.querySelector("#sort").onchange = render; grid.onclick = e => { let b = e.target.closest("[data-id]"); if (b) window.location.href = "order-en.html" }; document.querySelector("#choose").onclick = () => openGift(); document.querySelector("#close").onclick = closeGift; backdrop.onclick = e => { if (e.target === backdrop) closeGift() }; render();