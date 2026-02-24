// sign up.js — kept for backward compatibility
// The main signup logic is now embedded in signup.html
// This file is a fallback in case signup.html still references it

(function () {
    const form = document.querySelector('#signupForm') || document.querySelector('form');
    if (!form) return;

    // Already logged in? Redirect
    if (localStorage.getItem('user')) {
        window.location.href = 'index.html';
        return;
    }

    form.addEventListener('submit', async function (event) {
        event.preventDefault();

        const username = (document.getElementById('fullName') || document.getElementById('username'))?.value.trim();
        const email = document.getElementById('email')?.value.trim();
        const password = document.getElementById('password')?.value;
        const confirm = document.getElementById('confirmPassword')?.value;

        if (!username || !email || !password) {
            alert('All fields are required!');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            alert('Please enter a valid email address.');
            return;
        }
        if (password.length < 8) {
            alert('Password must be at least 8 characters.');
            return;
        }
        if (confirm && password !== confirm) {
            alert('Passwords do not match.');
            return;
        }

        try {
            const response = await fetch(`${window.API_BASE_URL}/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password }),
            });

            const data = await response.json();

            if (response.ok) {
                // Auto-login
                const loginRes = await fetch(`${window.API_BASE_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                });
                const loginData = await loginRes.json();
                if (loginRes.ok) {
                    localStorage.setItem('user', JSON.stringify({
                        username: loginData.user.username,
                        email: loginData.user.email,
                        token: loginData.token
                    }));
                    window.location.href = 'index.html';
                } else {
                    window.location.href = 'login.html';
                }
            } else {
                alert(data.error || 'Signup failed!');
            }
        } catch (error) {
            console.error('Signup Error:', error);
            alert('Cannot connect to server. Please try again.');
        }
    });
})();
