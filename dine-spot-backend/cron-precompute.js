const { db } = require("./firebase");

/**
 * Pre-computes analytics snapshots to avoid heavy Firestore streams.
 * In production, this would run as a scheduled cloud function or cron job.
 */
async function precomputeStats() {
    console.log("📊 Starting Analytics Pre-computation...");
    const startTime = Date.now();

    try {
        const reservationsSnap = await db.collection("reservations").get();
        let totalRevenue = 0;
        let totalBookings = 0;
        let cancelledBookings = 0;
        const restaurantCounts = {};
        const hourlyCounts = {};
        const monthlyRevenue = {};
        const tableCounts = {};

        reservationsSnap.forEach(doc => {
            const data = doc.data();
            const status = data.status || 'confirmed';
            totalBookings++;

            if (status === 'cancelled') {
                cancelledBookings++;
            }

            // Table popularity
            const tId = data.tableId || 'Unknown';
            tableCounts[tId] = (tableCounts[tId] || 0) + 1;

            if (status !== 'cancelled') {
                const cost = parseInt(data.totalCost?.toString().replace('₹', '').replace(',', '')) || 0;
                totalRevenue += cost;

                // Restaurant Popularity
                const resName = data.restaurant || 'Unknown';
                restaurantCounts[resName] = (restaurantCounts[resName] || 0) + 1;

                // Monthly Revenue
                if (data.date) {
                    const monthKey = data.date.substring(0, 7); // YYYY-MM
                    monthlyRevenue[monthKey] = (monthlyRevenue[monthKey] || 0) + cost;
                }
            }

            // Peak Hours
            if (data.time) {
                const hour = data.time.split(':')[0];
                hourlyCounts[hour] = (hourlyCounts[hour] || 0) + 1;
            }
        });

        const cancellationRate = totalBookings > 0 ? (cancelledBookings / totalBookings * 100) : 0;
        const topTables = Object.entries(tableCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5);

        const statsSnapshot = {
            total_revenue: totalRevenue,
            total_bookings: totalBookings,
            cancellation_rate: Math.round(cancellationRate * 100) / 100,
            restaurant_counts: restaurantCounts,
            hourly_counts: hourlyCounts,
            monthly_revenue: monthlyRevenue,
            top_tables: topTables,
            updatedAt: Date.now()
        };

        // Save to cache
        console.log("💾 Writing snapshot to Firestore:", JSON.stringify(statsSnapshot, null, 2));
        await db.collection("stats_cache").doc("latest").set(statsSnapshot);

        console.log(`✅ Success! Pre-computed stats for ${totalBookings} records in ${Date.now() - startTime}ms`);
    } catch (err) {
        console.error("❌ Pre-computation failed:", err);
    }
}

// Export for manual trigger or use with node-cron
module.exports = { precomputeStats };

// If run directly
if (require.main === module) {
    precomputeStats().then(() => process.exit(0)).catch(() => process.exit(1));
}
