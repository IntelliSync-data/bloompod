/**
 * Toast Notification
 * Lightweight toast notification for BloomPod
 */
function showToast(message, type) {
    var existing = document.getElementById('bloom-toast');
    if (existing) existing.remove();

    var isError = type === 'error';
    var toast = document.createElement('div');
    toast.id = 'bloom-toast';
    toast.textContent = message;
    toast.style.cssText =
        'position:fixed;top:24px;right:24px;z-index:99999;' +
        'padding:14px 24px;border-radius:10px;' +
        'font-family:Montserrat,sans-serif;font-size:14px;font-weight:500;' +
        'color:#fff;box-shadow:0 4px 16px rgba(0,0,0,0.2);' +
        'transform:translateX(120%);transition:transform .3s ease;' +
        'background:' + (isError ? '#e74c3c' : '#27ae60') + ';';

    document.body.appendChild(toast);

    // Slide in
    requestAnimationFrame(function() {
        toast.style.transform = 'translateX(0)';
    });

    // Slide out after 3s
    setTimeout(function() {
        toast.style.transform = 'translateX(120%)';
        setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
}
