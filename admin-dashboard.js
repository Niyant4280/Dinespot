/* ==================================================
   Admin Dashboard — JavaScript
   ================================================== */
'use strict';

// Global chart instances (destroyed before re-render)
let revenueChartInstance = null;
let popularityChartInstance = null;
let peakHoursChartInstance = null;
let dropdownPopulated = false;
let lastLargeGroupAlerts = new Set(); // To track alerts for large groups

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initial Data Load
    fetchStats();
    fetchReservations();
    fetchReviews();

    // 2. Real-time Polling every 10 s
    setInterval(() => {
        fetchStats();
        fetchReservations();
        fetchReviews();
    }, 10000);

    // 3. Multi-Tenancy: Check role and lock filter if restaurant owner
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.role === 'restaurant_owner' && user.managedRestaurant) {
        const filter = document.getElementById('restaurantFilter');
        filter.value = user.managedRestaurant;
        // Hide the "All Restaurants" and other options
        filter.innerHTML = `<option value="${user.managedRestaurant}">${user.managedRestaurant}</option>`;
        filter.disabled = true;
        dropdownPopulated = true;
    }

    // 4. Filter Change
    document.getElementById('restaurantFilter').addEventListener('change', () => {
        dropdownPopulated = true; // keep existing items, just re-fetch data
        fetchStats();
    });

    // 4. Add Restaurant Form Submit
    document.getElementById('addRestaurantForm').addEventListener('submit', handleAddRestaurant);
});

/* ─── Fetch Stats from Node.js API ─────────────── */
async function fetchStats() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    try {
        const res = await fetch(`${window.API_BASE_URL}/admin/reservations`, {
            headers: { 'Authorization': `Bearer ${user.token}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const reservations = data.reservations || [];

        // Build stats from reservations
        const counts = {};
        const monthly = {};
        const hourly = {};
        let totalRevenue = 0;
        const restaurantNames = new Set();

        reservations.forEach(r => {
            const rest = r.restaurant || 'Unknown';
            restaurantNames.add(rest);
            counts[rest] = (counts[rest] || 0) + 1;

            // Revenue
            const cost = parseFloat((r.totalCost || '0').replace(/[^0-9.]/g, '')) || 0;
            totalRevenue += cost;

            // Monthly
            if (r.date) {
                const month = r.date.substring(0, 7); // YYYY-MM
                monthly[month] = (monthly[month] || 0) + cost;
            }

            // Hourly
            if (r.time) {
                const hr = r.time.substring(0, 2);
                hourly[hr] = (hourly[hr] || 0) + 1;
            }
        });

        updateKPIs({ total_revenue: totalRevenue, restaurant_counts: counts });
        renderCharts({ monthly_revenue: monthly, restaurant_counts: counts, hourly_counts: hourly });

        if (!dropdownPopulated) {
            populateDropdown([...restaurantNames]);
        }
    } catch (err) {
        console.error('Failed to fetch stats:', err);
        setErrorState();
    }
}

function setErrorState() {
    document.getElementById('totalRevenue').textContent = '₹0';
    document.getElementById('totalBookings').textContent = '0';
    document.getElementById('topRestaurant').textContent = '-';
}

/* ─── KPI Cards ────────────────────────────────── */
function updateKPIs(data) {
    const revenue = data.total_revenue || 0;
    const counts = data.restaurant_counts || {};
    const totalBookings = Object.values(counts).reduce((a, b) => a + b, 0);

    let topRest = '-', maxCount = 0;
    for (const [name, count] of Object.entries(counts)) {
        if (count > maxCount) { maxCount = count; topRest = name; }
    }

    document.getElementById('totalRevenue').textContent = `₹${revenue.toLocaleString()}`;
    document.getElementById('totalBookings').textContent = totalBookings;
    document.getElementById('topRestaurant').textContent = topRest;
}

/* ─── Charts ───────────────────────────────────── */
function renderCharts(data) {
    if (!data) return;
    renderRevenueChart(data.monthly_revenue || {});
    renderPopularityChart(data.restaurant_counts || {});
    renderPeakHoursChart(data.hourly_counts || {});
}

function renderRevenueChart(monthly) {
    const canvas = document.getElementById('revenueChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Sort keys (YYYY-MM)
    const labels = Object.keys(monthly).sort();
    const values = labels.map(k => monthly[k]);

    if (revenueChartInstance) revenueChartInstance.destroy();
    revenueChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(l => {
                const [y, m] = l.split('-');
                const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                return `${monthNames[parseInt(m) - 1]} ${y}`;
            }),
            datasets: [{
                label: 'Revenue (₹)',
                data: values,
                borderColor: '#2ecc71',
                backgroundColor: 'rgba(46,204,113,0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#2ecc71',
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            ...chartOptions('Revenue (₹)'),
            interaction: { intersect: false, mode: 'index' }
        }
    });
}

function renderPopularityChart(counts) {
    const canvas = document.getElementById('popularityChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const items = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const labels = items.map(i => i[0]);
    const values = items.map(i => i[1]);

    if (popularityChartInstance) popularityChartInstance.destroy();
    popularityChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: [
                    '#f8b400', '#3498db', '#e74c3c',
                    '#9b59b6', '#1abc9c', '#e67e22'
                ],
                borderWidth: 0,
                hoverOffset: 12
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#aaa', padding: 20, font: { size: 11 } } }
            },
            cutout: '70%'
        }
    });
}

function renderPeakHoursChart(hourly) {
    const canvas = document.getElementById('peakHoursChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    const values = labels.map((_, i) => hourly[String(i).padStart(2, '0')] || 0);

    if (peakHoursChartInstance) peakHoursChartInstance.destroy();
    peakHoursChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Bookings',
                data: values,
                backgroundColor: '#f39c12',
                borderRadius: 4,
                hoverBackgroundColor: '#f8b400'
            }]
        },
        options: {
            ...chartOptions('Bookings'),
            plugins: { legend: { display: false } }
        }
    });
}

function chartOptions(yLabel) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#aaa' } } },
        scales: {
            y: { beginAtZero: true, ticks: { color: '#aaa' }, grid: { color: '#2e3138' } },
            x: { ticks: { color: '#aaa', maxTicksLimit: 8 }, grid: { color: '#2e3138' } }
        }
    };
}

/* ─── Dropdown Populate ────────────────────────── */
function populateDropdown(restaurants) {
    const select = document.getElementById('restaurantFilter');

    // Remove "Loading..." placeholder if present
    for (let i = select.options.length - 1; i >= 0; i--) {
        if (select.options[i].disabled) select.remove(i);
    }

    restaurants.forEach(name => {
        // Avoid duplicates
        if (![...select.options].some(o => o.value === name)) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        }
    });

    dropdownPopulated = true;
}

/* ─── Modal: Add Restaurant ────────────────────── */
function openAddRestaurantModal() {
    document.getElementById('addRestaurantModal').style.display = 'block';
}
window.openAddRestaurantModal = openAddRestaurantModal;

function closeAddRestaurantModal() {
    document.getElementById('addRestaurantModal').style.display = 'none';
}
window.closeAddRestaurantModal = closeAddRestaurantModal;

// Close on backdrop click
window.addEventListener('click', (e) => {
    const modal = document.getElementById('addRestaurantModal');
    if (e.target === modal) modal.style.display = 'none';
});

async function handleAddRestaurant(e) {
    e.preventDefault();

    const name = document.getElementById('restName').value.trim();
    const category = document.getElementById('restCategory').value;
    const image = document.getElementById('restImage').value.trim();
    const layout = document.getElementById('restLayout').value.trim();

    if (!name) {
        window.showToast && window.showToast('Restaurant name is required.', 'warn');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
    btn.disabled = true;

    try {
        const res = await fetch(`${window.API_BASE_URL}/admin/restaurants`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${JSON.parse(localStorage.getItem('user')).token}`
            },
            body: JSON.stringify({ name, category, image, layout })
        });

        if (res.ok) {
            closeAddRestaurantModal();
            e.target.reset();
            dropdownPopulated = false;
            fetchStats();
            window.showToast && window.showToast(`"${name}" added successfully!`, 'success');
        } else {
            const err = await res.json();
            window.showToast && window.showToast(err.error || 'Failed to add restaurant.', 'error');
        }
    } catch (err) {
        window.showToast && window.showToast('Cannot connect to server. Is it running?', 'error');
        console.error(err);
    } finally {
        btn.innerHTML = 'Add Restaurant';
        btn.disabled = false;
    }
}

/* ─── Fetch Reservations ────────────────────────── */
async function fetchReservations() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const filter = document.getElementById('restaurantFilter').value;

    try {
        const res = await fetch(`${window.API_BASE_URL}/admin/reservations`, {
            headers: { 'Authorization': `Bearer ${user.token}` }
        });
        const data = await res.json();
        let reservations = data.reservations || [];

        // Filter client-side if a restaurant is selected
        if (filter && filter !== 'All Restaurants') {
            reservations = reservations.filter(r => r.restaurant === filter);
        }

        updateReservationsTable(reservations);
    } catch (err) {
        console.error('Failed to fetch reservations:', err);
    }
}

function updateReservationsTable(reservations) {
    const tbody = document.getElementById('reservationsBody');
    const alertSpan = document.getElementById('largeGroupCount');
    let largeGroups = 0;

    if (reservations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="padding: 20px; text-align: center; color: #888;">No reservations found.</td></tr>';
        alertSpan.style.display = 'none';
        return;
    }

    tbody.innerHTML = reservations.map(r => {
        if (r.largeGroup) largeGroups++;
        const rowStyle = r.largeGroup ? 'background: rgba(231, 76, 60, 0.1); border-left: 4px solid #e74c3c;' : '';
        const badge = r.largeGroup ? '<span style="background:#e74c3c; color:white; padding:2px 6px; border-radius:4px; font-size:10px; margin-left:8px;">LARGE GROUP</span>' : '';
        const isCancelled = r.status === 'cancelled';
        const statusColor = isCancelled ? '#e74c3c' : '#2ecc71';
        const cancelBtn = !isCancelled && r.id
            ? `<button onclick="cancelAdminReservation('${r.id}', '${r.tableId || r.table || r.id}', this)" style="background:transparent;border:1px solid rgba(231,76,60,0.4);color:#e74c3c;padding:4px 10px;border-radius:12px;font-size:11px;cursor:pointer;font-family:Poppins,sans-serif;">Cancel</button>`
            : '<span style="color:#888;font-size:11px;">—</span>';

        return `
            <tr style="${rowStyle} border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 12px;">${r.bookedByEmail || 'Guest'}</td>
                <td style="padding: 12px;">${r.restaurant || '—'}</td>
                <td style="padding: 12px;">${r.date || '—'} ${r.time || ''}</td>
                <td style="padding: 12px;">${r.guests || '—'} ${badge}</td>
                <td style="padding: 12px;"><span style="color:${statusColor}">${r.status || 'confirmed'}</span></td>
                <td style="padding: 12px;">${r.totalCost || '—'}</td>
                <td style="padding: 12px;">${cancelBtn}</td>
            </tr>
        `;
    }).join('');

    if (largeGroups > 0) {
        alertSpan.textContent = `${largeGroups} Large Group Alert${largeGroups > 1 ? 's' : ''}`;
        alertSpan.style.display = 'inline-block';
    } else {
        alertSpan.style.display = 'none';
    }
}

/* ─── Cancel Reservation (Admin) ──────────────── */
window.cancelAdminReservation = async function (reservationId, tableId, btn) {
    if (!confirm('Cancel this reservation?')) return;
    btn.disabled = true;
    btn.textContent = '...';
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    try {
        const res = await fetch(`${window.API_BASE_URL}/cancel-reservation`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ reservationId, tableId })
        });
        if (res.ok) {
            window.showToast && window.showToast('Reservation cancelled.', 'success');
            fetchReservations();
        } else {
            const err = await res.json();
            window.showToast && window.showToast(err.error || 'Failed.', 'error');
            btn.disabled = false; btn.textContent = 'Cancel';
        }
    } catch {
        window.showToast && window.showToast('Cannot reach server.', 'error');
        btn.disabled = false; btn.textContent = 'Cancel';
    }
};

/* ─── Export CSV ────────────────────────────────── */
window.exportCSV = function () {
    const rows = document.querySelectorAll('#reservationsBody tr');
    if (!rows.length) { window.showToast && window.showToast('No data to export.', 'warn'); return; }

    let csv = 'Guest Email,Restaurant,Date & Time,Guests,Status,Amount\n';
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 6) return;
        csv += [...cells].slice(0, 6).map(c => `"${c.innerText.replace(/"/g, '""')}"`).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dinespot-reservations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    window.showToast && window.showToast('CSV exported!', 'success');
};

/* ─── Fetch Reviews ────────────────────────── */
async function fetchReviews() {
    const filter = document.getElementById('restaurantFilter').value;
    if (!filter || filter === 'All Restaurants') {
        document.getElementById('reviewsContainer').innerHTML = '<p style="padding: 20px; text-align: center; color: #888;">Select a specific restaurant to manage reviews.</p>';
        return;
    }

    try {
        const res = await fetch(`${window.API_BASE_URL}/reviews/${encodeURIComponent(filter)}`);
        const data = await res.json();
        if (data.reviews) {
            updateReviewsUI(data.reviews);
        }
    } catch (err) {
        console.error('Failed to fetch reviews:', err);
    }
}

function updateReviewsUI(reviews) {
    const container = document.getElementById('reviewsContainer');
    if (reviews.length === 0) {
        container.innerHTML = '<p style="padding: 20px; text-align: center; color: #888;">No reviews found for this restaurant.</p>';
        return;
    }

    container.innerHTML = reviews.map(r => {
        const stars = '⭐'.repeat(r.rating);
        const date = new RegExp(/^\d+$/).test(r.createdAt) ? new Date(r.createdAt).toLocaleDateString() : 'Recent';

        let responseHtml = '';
        if (r.ownerResponse) {
            responseHtml = `
                <div class="review-response">
                    <span class="owner-badge">OWNER RESPONSE</span>
                    <p class="response-text">${r.ownerResponse}</p>
                </div>
            `;
        } else {
            responseHtml = `
                <div class="review-response">
                    <input type="text" class="response-input" placeholder="Type your response..." id="resp-${r.id}">
                    <button class="btn-respond" onclick="submitReviewResponse('${r.id}')">Respond</button>
                </div>
            `;
        }

        return `
            <div class="review-card">
                <div class="review-header">
                    <span class="review-user">${r.username || 'Guest'}</span>
                    <span class="review-stars">${stars}</span>
                </div>
                <div style="font-size:11px; color:var(--text-muted);">${date}</div>
                <p class="review-comment">"${r.comment || 'No comment provided.'}"</p>
                ${responseHtml}
            </div>
        `;
    }).join('');
}

window.submitReviewResponse = async function (reviewId) {
    const input = document.getElementById(`resp-${reviewId}`);
    const response = input.value.trim();
    if (!response) return;

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    try {
        const res = await fetch(`${window.API_BASE_URL}/reviews/${reviewId}/respond`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ response })
        });

        if (res.ok) {
            window.showToast && window.showToast('Response submitted!', 'success');
            fetchReviews();
        } else {
            alert('Failed to submit response.');
        }
    } catch (err) {
        console.error(err);
    }
};

/* ─── Admin Logout ─────────────────────────────── */
window.logoutAdmin = function () {
    localStorage.removeItem('user');
    window.location.href = 'login.html';
};
