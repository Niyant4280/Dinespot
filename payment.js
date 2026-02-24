document.addEventListener('DOMContentLoaded', function () {
  // Guard: Must be logged in
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!user || !user.token) {
    window.location.href = 'login.html?redirect=payment.html';
    return;
  }

  const reservationDetails = JSON.parse(localStorage.getItem('reservationDetails') || '{}');
  const summaryDiv = document.getElementById('reservation-summary');

  if (!reservationDetails.date) {
    summaryDiv.innerHTML = '<strong style="color:#e74c3c;">No reservation details found.</strong> Please go back and fill the reservation form.';
    setTimeout(() => window.location.href = 'reservation.html', 3000);
    return;
  }

  // Display reservation summary
  summaryDiv.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;">
      <div style="display:flex;justify-content:space-between;font-size:13px;">
        <span style="color:#888;">Restaurant</span>
        <strong>${reservationDetails.restaurant || '—'}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px;">
        <span style="color:#888;">Table</span>
        <strong>${reservationDetails.table ? `Table ${reservationDetails.table}` : '—'}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px;">
        <span style="color:#888;">Date</span>
        <strong>${reservationDetails.date}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px;">
        <span style="color:#888;">Time</span>
        <strong>${reservationDetails.time}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px;">
        <span style="color:#888;">Guests</span>
        <strong>${reservationDetails.people} people</strong>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:14px;border-top:1px solid rgba(248,180,0,0.2);padding-top:10px;margin-top:4px;">
        <span style="color:#888;">Total</span>
        <strong style="color:#e0a200;font-size:16px;">${reservationDetails.totalCost}</strong>
      </div>
    </div>
  `;

  // ── HOLD TIMER LOGIC ──
  if (reservationDetails.holdExpiresAt) {
    const banner = document.getElementById('hold-countdown-banner');
    const timerDisplay = document.getElementById('payment-countdown');
    banner.style.display = 'block';

    const timer = setInterval(() => {
      const remaining = reservationDetails.holdExpiresAt - Date.now();
      if (remaining <= 0) {
        clearInterval(timer);
        alert('Your session has expired. Please reserve the table again.');
        window.location.href = 'reservation.html';
      } else {
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        timerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
    }, 1000);
  }

  // Handle payment form submission
  document.getElementById('payment-form').addEventListener('submit', async function (e) {
    e.preventDefault();

    const paymentMethodEl = document.querySelector('input[name="payment-method"]:checked');
    if (!paymentMethodEl) {
      alert('Please select a payment method.');
      return;
    }

    const submitBtn = this.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    submitBtn.disabled = true;

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const token = user.token;

    // ── Call backend to mark table as booked ──
    if (token && reservationDetails.table) {
      try {
        const res = await fetch('http://localhost:5000/reserve-table', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            tableId: reservationDetails.table,
            restaurant: reservationDetails.restaurant,
            date: reservationDetails.date,
            time: reservationDetails.time,
            guests: reservationDetails.people,
            largeGroup: reservationDetails.largeGroup || false,
            totalCost: reservationDetails.totalCost,
            holdId: reservationDetails.holdId
          })
        });

        if (!res.ok) {
          const err = await res.json();
          // Table already booked by someone else
          if (res.status === 409) {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
            alert(`⚠️ Sorry! Table ${reservationDetails.table} was just booked by someone else. Please go back and select a different table.`);
            return;
          }
          console.warn('Reserve table warning:', err.error);
        }
      } catch (err) {
        console.warn('Could not reach server to reserve table:', err);
        // Continue anyway — offline fallback
      }
    }

    // Save confirmation data to sessionStorage
    const confirmData = {
      name: user.username || user.email || 'Guest',
      restaurant: reservationDetails.restaurant || '—',
      date: reservationDetails.date,
      time: reservationDetails.time,
      guests: reservationDetails.people,
      payment: paymentMethodEl.value,
      amount: reservationDetails.totalCost,
      table: reservationDetails.table ? `Table ${reservationDetails.table} (${reservationDetails.tableZone})` : '—',
    };
    sessionStorage.setItem('reservationData', JSON.stringify(confirmData));
    localStorage.removeItem('reservationDetails');

    window.location.href = 'confirmation.html';
  });
});
