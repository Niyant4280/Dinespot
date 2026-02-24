const { db } = require("./firebase");

async function seedData() {
    console.log("🌱 Seeding Realistic Reservation Data...");
    const reservations = [
        {
            restaurant: "The Messy Door",
            date: "2026-02-22",
            time: "19:00",
            guests: 4,
            status: "booked",
            totalCost: "₹2000",
            tableId: "C3",
            bookedByEmail: "nina@example.com",
            bookedAt: Date.now() - 86400000
        },
        {
            restaurant: "Veranda Rooftop",
            date: "2026-02-22",
            time: "20:30",
            guests: 2,
            status: "booked",
            totalCost: "₹1000",
            tableId: "R1",
            bookedByEmail: "alex@example.com",
            bookedAt: Date.now() - 43200000
        },
        {
            restaurant: "Blueberry Bar",
            date: "2026-02-23",
            time: "22:00",
            guests: 6,
            status: "booked",
            totalCost: "₹3000",
            tableId: "P1",
            bookedByEmail: "john@example.com",
            bookedAt: Date.now() - 172800000
        },
        {
            restaurant: "Hyatt Grand Hall",
            date: "2026-02-21",
            time: "13:00",
            guests: 8,
            status: "confirmed",
            totalCost: "₹4000",
            tableId: "H3",
            bookedByEmail: "vip@example.com",
            bookedAt: Date.now() - 10000000
        }
    ];

    const batch = db.batch();
    reservations.forEach(res => {
        const ref = db.collection("reservations").doc();
        batch.set(ref, res);
    });

    await batch.commit();
    console.log("✅ Seeded 4 realistic reservations!");
}

seedData().then(() => process.exit(0)).catch(err => {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
});
