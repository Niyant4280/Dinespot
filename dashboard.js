// ===== DASHBOARD LOGIC =====
(function () {
    // Auth guard — redirect to login if not logged in
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user) {
        window.location.href = 'login.html?redirect=dashboard.html';
        return;
    }

    // Redirect owners to the admin panel
    if (user.role === 'restaurant_owner' || user.role === 'admin') {
        window.location.href = 'admin-dashboard.html';
        return;
    }

    // Time-based greeting
    const hour = new Date().getHours();
    let greeting = 'Good morning';
    if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
    else if (hour >= 17) greeting = 'Good evening';

    // Populate user info
    const usernameEl = document.getElementById('username');
    const greetingEl = document.querySelector('.greeting');
    const fullNameEl = document.getElementById('userFullName');
    const emailEl = document.getElementById('userEmail');

    if (usernameEl) usernameEl.textContent = user.username || 'User';
    if (greetingEl) greetingEl.textContent = greeting + ',';
    if (fullNameEl) fullNameEl.textContent = user.username || 'User';
    if (emailEl) emailEl.textContent = user.email || '—';

    // Load reservation count from backend
    const token = user.token;
    if (token) {
        fetch('http://localhost:5000/my-reservations', {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(data => {
                const countEl = document.querySelector('.stat-card:first-child h3');
                if (countEl && data.reservations) {
                    countEl.textContent = data.reservations.length;
                }
            })
            .catch(() => { }); // Silently fail — stats just stay at 0
    }

    // Logout function (global so onclick works)
    window.logoutUser = function () {
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    };
})();
