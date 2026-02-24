/**
 * auth-guard.js
 * Shared utility for auth checks across DineSpot pages.
 * Include this script on any page that needs auth logic.
 */

// ── API Configuration ──
window.__dsLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

window.API_BASE_URL = window.__dsLocal ? 'http://localhost:5000' : '/api';
window.STATS_API_URL = window.__dsLocal ? 'http://localhost:5001' : '/api/stats'; // Points directly to function

// ── Get current user ──
window.getUser = function () {
    return JSON.parse(localStorage.getItem('user') || 'null');
};

// ── Helper: is this user an admin or owner? ──
window.isAdminOrOwner = function (user) {
    return user && (user.role === 'admin' || user.role === 'restaurant_owner');
};

// ── GUARD: redirect to login if not logged in ──
window.requireLogin = function (redirectBack) {
    const user = window.getUser();
    if (!user) {
        const redirect = redirectBack || window.location.pathname.split('/').pop();
        window.location.href = `login.html?redirect=${encodeURIComponent(redirect)}`;
        return false;
    }
    return true;
};

// ── GUARD: redirect if NOT admin/owner ──
window.requireAdmin = function () {
    const user = window.getUser();
    if (!user) {
        window.location.href = 'login.html?redirect=admin-dashboard.html';
        return false;
    }
    if (!window.isAdminOrOwner(user)) {
        window.location.href = 'index.html';
        return false;
    }
    return true;
};

// ── GUARD: redirect to login if not logged in; redirect owners to admin ──
window.requireGuest = function () {
    const user = window.getUser();
    if (user) {
        // Admins/owners should always go to their dashboard
        if (window.isAdminOrOwner(user)) {
            window.location.href = 'admin-dashboard.html';
        } else {
            window.location.href = 'index.html';
        }
        return false;
    }
    return true;
};

// ── GUARD: redirect owners away from customer-facing pages ──
window.guardCustomerPage = function () {
    const user = window.getUser();
    if (user && window.isAdminOrOwner(user)) {
        window.location.replace('admin-dashboard.html');
        return false;
    }
    return true;
};

// ── Logout ──
window.logout = function () {
    localStorage.removeItem('user');
    window.location.href = 'login.html';
};

// ── Guard "Reserve Now" / "Book Now" buttons on restaurant pages ──
window.guardReserveButtons = function () {
    document.querySelectorAll('a[href*="reservation.html"], .reserve-btn, .book-btn, [data-action="reserve"]')
        .forEach(btn => {
            btn.addEventListener('click', function (e) {
                const user = window.getUser();
                if (!user) {
                    e.preventDefault();
                    e.stopPropagation();
                    showAuthToast();
                }
            });
        });
};

// ── Global toast ──
window.showToast = function (message, type = 'info', duration = 3500) {
    const existing = document.getElementById('ds-toast');
    if (existing) existing.remove();

    const colors = {
        success: { bg: '#1a3a1a', border: 'rgba(72,199,116,0.5)', text: '#48c774', icon: '✅' },
        error: { bg: '#3a1a1a', border: 'rgba(231,76,60,0.5)', text: '#e74c3c', icon: '❌' },
        info: { bg: '#1a1d23', border: 'rgba(248,180,0,0.4)', text: '#f8b400', icon: 'ℹ️' },
        warn: { bg: '#2a1a00', border: 'rgba(243,156,18,0.5)', text: '#f39c12', icon: '⚠️' }
    };
    const c = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.id = 'ds-toast';
    toast.style.cssText = `
        position: fixed; bottom: 32px; right: 32px;
        background: ${c.bg}; border: 1px solid ${c.border};
        color: #fff; padding: 16px 20px; border-radius: 14px;
        font-size: 14px; font-weight: 500; z-index: 99999;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        display: flex; align-items: center; gap: 12px;
        animation: dsToastIn 0.3s ease; max-width: 340px;
        font-family: 'Poppins', 'Inter', sans-serif;
    `;
    toast.innerHTML = `
        <span style="font-size:20px;">${c.icon}</span>
        <div style="flex:1;">
            <div style="font-weight:700;margin-bottom:3px;color:${c.text};">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.75);">${message}</div>
        </div>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;font-size:18px;line-height:1;">×</button>
    `;

    if (!document.getElementById('ds-toast-style')) {
        const style = document.createElement('style');
        style.id = 'ds-toast-style';
        style.textContent = `
            @keyframes dsToastIn { from { opacity:0; transform:translateX(40px); } to { opacity:1; transform:translateX(0); } }
            @keyframes dsToastOut { from { opacity:1; } to { opacity:0; transform:translateX(40px); } }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'dsToastOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, duration);
};

function showAuthToast() {
    const existing = document.getElementById('auth-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'auth-toast';
    toast.style.cssText = `
        position: fixed; bottom: 32px; right: 32px;
        background: #1a1d23; border: 1px solid rgba(248,180,0,0.4);
        color: #fff; padding: 16px 20px; border-radius: 14px;
        font-size: 14px; font-weight: 500; z-index: 9999;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        display: flex; align-items: center; gap: 12px;
        animation: slideInRight 0.3s ease; max-width: 320px;
        font-family: 'Poppins', 'Inter', sans-serif;
    `;
    toast.innerHTML = `
        <span style="font-size:22px;">🔒</span>
        <div>
            <div style="font-weight:700;margin-bottom:4px;">Login Required</div>
            <div style="font-size:12px;color:#aaa;">Please sign in to reserve a table.</div>
        </div>
        <a href="login.html?redirect=${encodeURIComponent(window.location.pathname.split('/').pop())}"
           style="margin-left:auto;background:linear-gradient(135deg,#f8b400,#e0a200);color:#1a1d23;
                  font-weight:700;font-size:12px;padding:8px 14px;border-radius:20px;
                  text-decoration:none;white-space:nowrap;">Sign In</a>
    `;

    if (!document.getElementById('auth-toast-style')) {
        const style = document.createElement('style');
        style.id = 'auth-toast-style';
        style.textContent = `@keyframes slideInRight { from { opacity:0; transform:translateX(40px); } to { opacity:1; transform:translateX(0); } }`;
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
