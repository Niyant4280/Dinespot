/**
 * DineSpot Reservation Logic
 * Handles:
 * 1. Restaurant-specific floor plan visuals
 * 2. Real-time availability polling (1-hour slots)
 * 3. Temporary 5-minute booking holds
 * 4. Smart Allocation & Form Validation
 */

let selectedTable = null;
let currentHoldId = null;
let currentHoldExpiresAt = null;
let holdTimer = null;
let availabilityPolling = null;

const LAYOUT_TEMPLATES = {
    'layout-cafe': `
        <div class="floor-zone">
            <div class="zone-label">☕ Cafe Seating</div>
            <div class="table-row">
                ${renderTable('C1', 2, 'Cozy Corner', 'rect')}
                ${renderTable('C2', 2, 'Cozy Corner', 'rect')}
                ${renderTable('C3', 4, 'Main Window', 'circle')}
            </div>
            <div class="table-row">
                ${renderTable('C4', 2, 'Wall Side', 'rect')}
                ${renderTable('C5', 4, 'Center', 'circle')}
            </div>
        </div>
    `,
    'layout-rooftop': `
        <div class="floor-zone">
            <div class="zone-label">🌇 Skydeck View</div>
            <div class="table-row">
                ${renderTable('R1', 2, 'Edge View', 'rect')}
                ${renderTable('R2', 2, 'Edge View', 'rect')}
                ${renderTable('R3', 6, 'Group Table', 'rect')}
            </div>
            <div class="table-row">
                ${renderTable('R4', 4, 'Center Lounge', 'circle')}
                ${renderTable('R5', 4, 'Center Lounge', 'circle')}
            </div>
        </div>
    `,
    'layout-bar': `
        <div class="floor-zone">
            <div class="zone-label">🍹 Bar & Lounge</div>
            <div class="table-row">
                ${renderTable('B1', 2, 'High Top', 'circle')}
                ${renderTable('B2', 2, 'High Top', 'circle')}
                ${renderTable('B3', 2, 'High Top', 'circle')}
            </div>
            <div class="table-row">
                ${renderTable('P1', 6, 'VIP Booth', 'rect')}
                ${renderTable('P2', 6, 'VIP Booth', 'rect')}
            </div>
        </div>
    `,
    'layout-hotel': `
        <div class="floor-zone">
            <div class="zone-label">⭐ Fine Dining</div>
            <div class="table-row">
                ${renderTable('H1', 4, 'Grand Hall', 'circle')}
                ${renderTable('H2', 4, 'Grand Hall', 'circle')}
                ${renderTable('H3', 8, 'Banquet', 'rect')}
            </div>
        </div>
    `
};

function renderTable(id, seats, zone, type) {
    const isCircle = type === 'circle';
    const shape = isCircle
        ? `<circle cx="32" cy="32" r="20" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" />`
        : `<rect x="12" y="12" width="40" height="40" rx="4" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" />`;

    return `
        <div class="table-item" data-id="${id}" data-seats="${seats}" data-zone="${zone}">
            <svg class="table-svg" width="64" height="64" viewBox="0 0 64 64">
                ${shape}
                <text x="32" y="37" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-size="10" font-family="Poppins">${id}</text>
            </svg>
            <div class="tooltip">${id} · ${seats} seats · ${zone}</div>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    initReservationFlow();
});

function initReservationFlow() {
    const restaurantSelect = document.getElementById('restaurantSelect');
    const dateInput = document.getElementById('date');
    const timeInput = document.getElementById('time');
    const guestInput = document.getElementById('people');
    const form = document.getElementById('reservation-form');

    // Pre-fill from URL params
    const params = new URLSearchParams(window.location.search);
    const restaurantParam = params.get('restaurant');
    if (restaurantParam && restaurantSelect) {
        for (let i = 0; i < restaurantSelect.options.length; i++) {
            if (restaurantSelect.options[i].value.toLowerCase().includes(restaurantParam.toLowerCase())) {
                restaurantSelect.selectedIndex = i;
                break;
            }
        }
    }

    // Sync floor plan when restaurant/date/time changes
    [restaurantSelect, dateInput, timeInput].forEach(el => {
        el.addEventListener('change', updateFloorPlanAvailability);
    });

    // Price calculation
    if (guestInput) {
        guestInput.addEventListener('input', () => {
            const pricePerPerson = 500;
            const people = parseInt(guestInput.value) || 0;
            document.getElementById('total-cost').textContent = `₹${people * pricePerPerson}`;
        });
    }

    form.addEventListener('submit', handleReservationSubmit);

    // Initial sync
    updateFloorPlanAvailability();

    // Start polling every 5s for better real-time feel
    availabilityPolling = setInterval(updateFloorPlanAvailability, 5000);
}

async function updateFloorPlanAvailability() {
    const restaurant = document.getElementById('restaurantSelect').value;
    const date = document.getElementById('date').value;
    const time = document.getElementById('time').value;

    if (!restaurant || !date || !time) return;

    // Apply specific layout visual based on category
    updateLayoutVisual(restaurant);

    try {
        const response = await fetch(`${window.API_BASE_URL}/table-status?restaurant=${encodeURIComponent(restaurant)}&date=${date}&time=${time}`);
        if (!response.ok) return;

        const data = await response.json();
        const statuses = data.tables || {};

        // Update UI
        document.querySelectorAll('.table-item').forEach(el => {
            const tableId = el.dataset.id;
            const status = statuses[tableId];

            if (status === 'booked') {
                el.classList.add('occupied');
                el.classList.remove('held', 'selected');
                el.onclick = null;
            } else if (status === 'held') {
                el.classList.add('held');
                el.classList.remove('occupied', 'selected');
                el.onclick = null;
            } else {
                el.classList.remove('occupied', 'held');
                el.onclick = () => selectTable(el);
            }
        });
    } catch (err) {
        console.error("Failed to fetch table status:", err);
    }
}

function updateLayoutVisual(restaurantName) {
    const floorPlan = document.getElementById('floorPlan');
    const dynamicContainer = document.getElementById('dynamic-tables');

    let layoutKey = 'layout-cafe';
    if (restaurantName.includes('Rooftop') || restaurantName.includes('Skydeck') || restaurantName.includes('Flying Saucer')) {
        layoutKey = 'layout-rooftop';
    } else if (restaurantName.includes('Bar') || restaurantName.includes('Lounge') || restaurantName.includes('Neon') || restaurantName.includes('Blueberry')) {
        layoutKey = 'layout-bar';
    } else if (restaurantName.includes('Hyatt') || restaurantName.includes('Marriott') || restaurantName.includes('Vivanta') || restaurantName.includes('Hotel')) {
        layoutKey = 'layout-hotel';
    }

    floorPlan.className = 'floor-plan ' + layoutKey;
    dynamicContainer.innerHTML = LAYOUT_TEMPLATES[layoutKey] || LAYOUT_TEMPLATES['layout-cafe'];

    // Re-attach listeners
    document.querySelectorAll('.table-item').forEach(el => {
        el.onclick = () => selectTable(el);
        if (selectedTable && selectedTable.dataset.id === el.dataset.id) {
            el.classList.add('selected');
            selectedTable = el;
        }
    });
}

function selectTable(el) {
    if (selectedTable) {
        selectedTable.classList.remove('selected');
        resetHold();
    }

    selectedTable = el;
    el.classList.add('selected');

    const id = el.dataset.id;
    const seats = el.dataset.seats;
    const zone = el.dataset.zone;
    document.getElementById('selectedTableText').textContent = `Table ${id} · ${seats} seats · ${zone}`;
    document.getElementById('selectedTableInfo').classList.add('show');
    document.getElementById('selectedTableInput').value = `Table ${id} (${zone})`;
    document.getElementById('tableFormGroup').style.display = 'block';

    createHold(id);
}

// ===== SMART ALLOCATION LOGIC =====
async function findOptimalTable() {
    const restaurant = document.getElementById('restaurantSelect').value;
    const date = document.getElementById('date').value;
    const time = document.getElementById('time').value;
    const guests = document.getElementById('people').value;

    if (!restaurant || !date || !time || !guests) {
        alert('Please fill in restaurant, date, time and guest count first.');
        return;
    }

    const btn = document.getElementById('findTableBtn');
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Finding...';
        btn.disabled = true;
    }

    try {
        const url = `${window.API_BASE_URL}/check-availability?restaurant=${encodeURIComponent(restaurant)}&date=${date}&time=${time}&guests=${guests}`;
        const res = await fetch(url);
        const data = await res.json();

        if (res.ok && data.table) {
            const tableEl = document.querySelector(`.table-item[data-id="${data.table.id}"]`);
            if (tableEl) {
                selectTable(tableEl);
                tableEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Brief pulse effect
                tableEl.style.animation = 'pulse 1s infinite';
                setTimeout(() => tableEl.style.animation = '', 3000);

                if (window.showToast) {
                    window.showToast(`Found optimal Table ${data.table.id} for you!`, 'success');
                }
            }
        } else {
            alert(data.error || 'No optimal table found for this slot.');
        }
    } catch (e) {
        alert('Cannot connect to server. Ensure it is running on port 5000.');
    } finally {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-magic"></i> Find Best Table';
            btn.disabled = false;
        }
    }
}

async function createHold(tableId) {
    const restaurant = document.getElementById('restaurantSelect').value;
    const date = document.getElementById('date').value;
    const time = document.getElementById('time').value;
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !user.token) return;

    try {
        const res = await fetch(`${window.API_BASE_URL}/hold-table`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({ tableId, restaurant, date, time, guests: document.getElementById('people').value })
        });

        if (res.ok) {
            const data = await res.json();
            currentHoldId = data.holdId;
            currentHoldExpiresAt = data.expiresAt;
            startHoldTimer(data.expiresAt);
        } else if (res.status === 409) {
            alert("Sorry, this table was just selected by someone else.");
            updateFloorPlanAvailability();
        }
    } catch (err) {
        console.warn("Hold failed:", err);
    }
}

function startHoldTimer(expiresAt) {
    if (holdTimer) clearInterval(holdTimer);
    const timerBar = document.getElementById('hold-timer-bar');
    const countdownEl = document.getElementById('countdown');

    if (timerBar) timerBar.style.display = 'block';

    holdTimer = setInterval(() => {
        const remaining = expiresAt - Date.now();
        if (remaining <= 0) {
            clearInterval(holdTimer);
            alert("Your table hold has expired. Please select again.");
            window.location.reload();
        } else if (countdownEl) {
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            countdownEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
    }, 1000);
}

function resetHold() {
    if (holdTimer) clearInterval(holdTimer);
    const timerBar = document.getElementById('hold-timer-bar');
    if (timerBar) timerBar.style.display = 'none';
    currentHoldId = null;
    currentHoldExpiresAt = null;
}

function handleReservationSubmit(e) {
    e.preventDefault();

    if (!selectedTable) {
        alert('Please select a table from the floor plan before proceeding.');
        return;
    }

    const selectedDate = document.getElementById('date').value;
    const selectedTime = document.getElementById('time').value;
    const guests = parseInt(document.getElementById('people').value);
    const restaurantSelect = document.getElementById('restaurantSelect');

    if (!selectedDate || !selectedTime || !guests || !restaurantSelect.value) {
        alert("Please complete the form first.");
        return;
    }

    const tableSeats = parseInt(selectedTable.dataset.seats);
    if (guests > tableSeats) {
        alert(`Table ${selectedTable.dataset.id} only fits ${tableSeats} guests. Please select a larger table or reduce guest count.`);
        return;
    }

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const details = {
        name: user.username || user.email || 'Guest',
        date: selectedDate,
        time: selectedTime,
        people: guests,
        totalCost: document.getElementById('total-cost').textContent,
        restaurant: restaurantSelect.value,
        table: selectedTable.dataset.id,
        tableZone: selectedTable.dataset.zone,
        tableSeats: tableSeats,
        holdId: currentHoldId,
        holdExpiresAt: currentHoldExpiresAt
    };

    localStorage.setItem('reservationDetails', JSON.stringify(details));
    window.location.href = 'payment.html';
}

// ── TOAST NOTIFICATION SYSTEM ──
window.showToast = function (message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 30px;
        background: ${type === 'success' ? '#2ecc71' : '#e74c3c'};
        color: white;
        padding: 12px 24px;
        border-radius: 30px;
        font-weight: 600;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideUp 0.3s ease;
    `;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-triangle'}"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// Add slideUp animation
const style = document.createElement('style');
style.innerHTML = `
@keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}
`;
document.head.appendChild(style);
