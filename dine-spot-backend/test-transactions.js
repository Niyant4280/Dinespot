const fetch = require('node-fetch');

const API_BASE_URL = 'http://localhost:5000';
const TEST_USER_TOKEN = 'YOUR_TEST_TOKEN'; // You would need a real token here if running for real

async function testConcurrentBooking() {
    console.log("Starting concurrent booking test...");

    const reservationData = {
        tableId: "M1",
        restaurant: "The Sky High",
        date: "2024-12-25",
        time: "19:00",
        guests: 2
    };

    // Simulate two people trying to book at the exact same time
    const requests = [
        fetch(`${API_BASE_URL}/reserve-table`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_USER_TOKEN}` },
            body: JSON.stringify(reservationData)
        }),
        fetch(`${API_BASE_URL}/reserve-table`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_USER_TOKEN}` },
            body: JSON.stringify(reservationData)
        })
    ];

    const results = await Promise.all(requests);
    const data = await Promise.all(results.map(r => r.json()));

    console.log("Result 1:", data[0]);
    console.log("Result 2:", data[1]);

    if (results[0].ok && results[1].ok) {
        console.error("FAIL: Both bookings succeeded! Race condition exists.");
    } else if ((results[0].ok && !results[1].ok) || (!results[0].ok && results[1].ok)) {
        console.log("SUCCESS: Only one booking succeeded as expected.");
    } else {
        console.log("Both failed, likely due to auth or other issues - please check server logs.");
    }
}

// testConcurrentBooking();
