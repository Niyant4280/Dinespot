document.addEventListener("DOMContentLoaded", function () {
    fetch('navbar.html')
        .then(response => response.text())
        .then(data => {
            document.body.insertAdjacentHTML('afterbegin', data);

            // Hamburger toggle
            const hamburger = document.querySelector('.hamburger');
            const navList = document.getElementById('nav-list');
            if (hamburger && navList) {
                hamburger.addEventListener('click', function () {
                    navList.classList.toggle('active');
                });
            }

            // ── AUTH-AWARE NAV ──
            const user = JSON.parse(localStorage.getItem('user') || 'null');
            const loginLink = document.querySelector('#nav-list a[href="login.html"]');
            const loginLi = loginLink ? loginLink.closest('li') : null;

            if (user && loginLi) {
                // Replace login link with username display
                loginLi.innerHTML = `
          <a href="userpanel.html" style="color:var(--gold);font-weight:600;">
            <i class="fas fa-user-circle"></i> ${user.username || 'Account'}
          </a>`;

                // Add "Admin Panel" link for owners/admins
                if (user.role === 'admin' || user.role === 'restaurant_owner') {
                    const adminLi = document.createElement('li');
                    adminLi.innerHTML = `<a href="admin-dashboard.html" style="color:var(--gold); border: 1px solid var(--gold); padding: 5px 12px; border-radius: 20px; font-weight: 700;"><i class="fas fa-user-shield"></i> Admin Panel</a>`;
                    loginLi.parentNode.insertBefore(adminLi, loginLi);
                }

                // Add History link
                const historyLi = document.createElement('li');
                historyLi.innerHTML = `<a href="reservation-history.html" style="color:var(--gold); display:flex; align-items:center; gap:8px;"><i class="fas fa-history"></i> History</a>`;
                loginLi.parentNode.insertBefore(historyLi, loginLi.nextSibling);

                // Add Logout
                const logoutLi = document.createElement('li');
                logoutLi.innerHTML = `<a href="#" id="nav-logout" style="color:#ff6b6b;">
          <i class="fas fa-sign-out-alt"></i> Logout</a>`;
                loginLi.parentNode.insertBefore(logoutLi, loginLi.nextSibling);

                document.getElementById('nav-logout').addEventListener('click', (e) => {
                    e.preventDefault();
                    localStorage.removeItem('user');
                    window.location.href = 'index.html';
                });
            }

            // ── ACTIVE LINK HIGHLIGHT ──
            const currentPage = window.location.pathname.split('/').pop() || 'index.html';
            document.querySelectorAll('#nav-list a').forEach(link => {
                const href = link.getAttribute('href');
                if (href && href === currentPage) {
                    link.style.color = 'var(--gold)';
                    link.style.fontWeight = '600';
                }
            });

            // ── CLOSE MENU ON LINK CLICK (mobile) ──
            document.querySelectorAll('#nav-list a').forEach(link => {
                link.addEventListener('click', () => {
                    if (navList) navList.classList.remove('active');
                });
            });
        })
        .catch(error => console.error('Error loading navbar:', error));
});
