require('dotenv').config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const { db } = require("./firebase");

const app = express();

// Allow all origins for dev; for production lock this down
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// ── VERCEL / API PATH STRIPPING ──
// Vercel rewrites often pass the full path (e.g. /api/login) to the function.
// This middleware ensures our routes (/login, /signup) still match.
app.use((req, res, next) => {
  if (req.url.startsWith('/api')) {
    req.url = req.url.replace('/api', '');
  }
  next();
});

// Only serve static files locally; Vercel handles this in production via vercel.json
if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(path.join(__dirname, "..")));
}


const SECRET_KEY = process.env.SECRET_KEY || "dinespot_secure_production_secret_2024";

// ─────────────────────────────────────────────
// AUTH MIDDLEWARE
// ─────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    req.user = jwt.verify(authHeader.split(" ")[1], SECRET_KEY);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ─────────────────────────────────────────────
// SIGNUP
// ─────────────────────────────────────────────
app.post("/signup", async (req, res) => {
  try {
    const { email, password, username } = req.body;
    if (!email || !password || !username)
      return res.status(400).json({ error: "All fields are required" });

    const usersRef = db.collection("users");
    const existing = await usersRef.where("email", "==", email).get();
    if (!existing.empty)
      return res.status(400).json({ error: "Email already in use" });

    const hashedPassword = await bcrypt.hash(password, 10);
    // Secure Role Assignment: Default to "user", only allow "restaurant_owner" if requested (for demo). 
    // "admin" cannot be set through regular signup.
    let role = "user";
    if (req.body.role === "restaurant_owner") {
      role = "restaurant_owner";
    }
    const managedRestaurant = req.body.managedRestaurant || null;

    const newUser = await usersRef.add({
      email,
      password: hashedPassword,
      username,
      role,
      managedRestaurant,
      createdAt: Date.now()
    });
    res.status(201).json({ message: "User registered successfully", userId: newUser.id });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required" });

    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("email", "==", email).get();
    if (snapshot.empty)
      return res.status(400).json({ error: "Invalid email or password" });

    let userData, userId;
    snapshot.forEach((doc) => { userData = doc.data(); userId = doc.id; });

    const isMatch = await bcrypt.compare(password, userData.password);
    if (!isMatch)
      return res.status(400).json({ error: "Invalid email or password" });

    const token = jwt.sign({ userId, email, role: userData.role }, SECRET_KEY, { expiresIn: "24h" });
    res.json({
      message: "Login successful",
      token,
      user: {
        username: userData.username,
        email: userData.email,
        role: userData.role || "user",
        managedRestaurant: userData.managedRestaurant || null
      }
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─────────────────────────────────────────────
// PROTECTED DASHBOARD
// ─────────────────────────────────────────────
app.get("/dashboard", authMiddleware, async (req, res) => {
  try {
    const userDoc = await db.collection("users").doc(req.user.userId).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
    const data = userDoc.data();
    delete data.password; // Security: don't send back hashed password
    res.json({ message: "Welcome to the Dashboard", user: data });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─────────────────────────────────────────────
// ── USER PROFILE UPDATE ──
app.put("/user/profile", authMiddleware, async (req, res) => {
  try {
    const { username, email } = req.body;
    const userRef = db.collection("users").doc(req.user.userId);

    await userRef.update({
      username: username || req.user.username,
      email: email || req.user.email
    });

    res.json({ message: "Profile updated successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ─────────────────────────────────────────────
// SEED TABLES (Utility to ensure tables have capacity)
app.post("/seed-tables", authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Only admins can seed" });
  try {
    const tables = [
      { id: "M1", capacity: 2, zone: "Main Hall" },
      { id: "M2", capacity: 2, zone: "Main Hall" },
      { id: "M3", capacity: 4, zone: "Main Hall" },
      { id: "M4", capacity: 4, zone: "Main Hall" },
      { id: "P1", capacity: 6, zone: "Private Booth" },
      { id: "P2", capacity: 6, zone: "Private Booth" },
      { id: "P3", capacity: 6, zone: "Private Booth" }
    ];
    const batch = db.batch();
    tables.forEach(t => {
      const ref = db.collection("tables").doc(t.id);
      batch.set(ref, { ...t, status: "available" }, { merge: true });
    });
    await batch.commit();
    res.json({ message: "Tables seeded successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper for time overlap (assumes 1 hour duration per user request)
function isOverlapping(time1, time2) {
  const [h1, m1] = time1.split(':').map(Number);
  const [h2, m2] = time2.split(':').map(Number);
  const start1 = h1 * 60 + m1;
  const end1 = start1 + 60; // 1 hour
  const start2 = h2 * 60 + m2;
  const end2 = start2 + 60;
  return start1 < end2 && start2 < end1;
}

// ─────────────────────────────────────────────
// CHECK AVAILABILITY & SMART ALLOCATION (Time Slot Aware)
// ─────────────────────────────────────────────
app.get("/check-availability", async (req, res) => {
  try {
    const { restaurant, date, time, guests } = req.query;
    const guestCount = parseInt(guests);

    if (!restaurant || !date || !time || !guestCount) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    // 1. Get all tables for the restaurant
    const tablesSnap = await db.collection("tables").get();
    const allTables = [];
    tablesSnap.forEach(doc => allTables.push({ id: doc.id, ...doc.data() }));

    // 2. Get reservations for this date/restaurant (Filter cancelled in-memory to avoid index issues)
    const resSnap = await db.collection("reservations")
      .where("restaurant", "==", restaurant)
      .where("date", "==", date)
      .get();

    const bookedReservations = [];
    resSnap.forEach(doc => {
      const data = doc.data();
      if (data.status !== "cancelled") {
        bookedReservations.push(data);
      }
    });

    // 2.5 Get temporary holds that haven't expired (Filter in-memory)
    const now = Date.now();
    const holdsSnap = await db.collection("holds")
      .where("restaurant", "==", restaurant)
      .where("date", "==", date)
      .get();

    const activeHolds = [];
    holdsSnap.forEach(doc => {
      const data = doc.data();
      if (data.expiresAt > now) {
        activeHolds.push(data);
      }
    });

    // 3. Find tables that are NOT booked or held for the overlapping time slot
    const availableTables = allTables.filter(t => {
      const tableBookings = bookedReservations.filter(r => r.tableId === t.id);
      const tableHolds = activeHolds.filter(h => h.tableId === t.id);

      const hasBookingConflict = tableBookings.some(r => isOverlapping(r.time, time));
      const hasHoldConflict = tableHolds.some(h => isOverlapping(h.time, time));

      return !hasBookingConflict && !hasHoldConflict && (t.capacity || 4) >= guestCount;
    });

    if (availableTables.length === 0) {
      return res.status(404).json({ error: "No tables available for the selected slot and guest count." });
    }

    // 4. Smart Allocation: Smallest optimal table
    availableTables.sort((a, b) => (a.capacity || 4) - (b.capacity || 4));
    const optimalTable = availableTables[0];


    res.json({
      message: "Table available",
      table: optimalTable,
      allAvailableCount: availableTables.length
    });

  } catch (error) {
    console.error("Check Availability Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─────────────────────────────────────────────
// HOLD TABLE (5-minute temporary lock)
app.post("/hold-table", authMiddleware, async (req, res) => {
  try {
    const { tableId, restaurant, date, time, guests } = req.body;
    if (!tableId || !restaurant || !date || !time) {
      return res.status(400).json({ error: "Missing required details for hold" });
    }

    // Atomic check: Ensure not already booked or held (Filter cancelled in-memory)
    const resSnap = await db.collection("reservations")
      .where("restaurant", "==", restaurant)
      .where("date", "==", date)
      .get();

    const booked = [];
    resSnap.forEach(doc => {
      const data = doc.data();
      if (data.status !== "cancelled") {
        booked.push(data);
      }
    });
    if (booked.some(r => r.tableId === tableId && isOverlapping(r.time, time))) {
      return res.status(409).json({ error: "Table already booked" });
    }

    const holdData = {
      tableId,
      restaurant,
      date,
      time,
      guests,
      userId: req.user.userId,
      createdAt: Date.now(),
      expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
    };

    const holdRef = await db.collection("holds").add(holdData);
    res.json({ message: "Table held for 5 minutes", holdId: holdRef.id, expiresAt: holdData.expiresAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// RESERVE TABLE — POST (requires auth)
// ─────────────────────────────────────────────
app.post("/reserve-table", authMiddleware, async (req, res) => {
  console.log(`[RESERVE] Incoming request from ${req.user.email} for ${req.body.restaurant} on ${req.body.date}`);
  try {
    const { tableId, restaurant, date, time, guests, totalCost, holdId } = req.body;
    if (!tableId || !restaurant || !date || !time) {
      return res.status(400).json({ error: "Missing required reservation details" });
    }

    const result = await db.runTransaction(async (transaction) => {
      // 1. Verify hold if provided
      if (holdId) {
        const holdRef = db.collection("holds").doc(holdId);
        const holdDoc = await transaction.get(holdRef);
        if (!holdDoc.exists || holdDoc.data().expiresAt < Date.now()) {
          throw new Error("HOLD_EXPIRED");
        }
      }

      // 2. Final check for overlapping reservations
      const resQuery = db.collection("reservations")
        .where("restaurant", "==", restaurant)
        .where("date", "==", date)
        .where("tableId", "==", tableId);

      const resSnap = await transaction.get(resQuery);
      let conflict = false;
      resSnap.forEach(doc => {
        const data = doc.data();
        if (data.status !== "cancelled" && isOverlapping(data.time, time)) {
          conflict = true;
        }
      });

      if (conflict) {
        throw new Error("TABLE_OCCUPIED");
      }

      // 3. Create Reservation
      const reservationData = {
        status: "booked",
        bookedBy: req.user.userId,
        bookedByEmail: req.user.email,
        restaurant,
        date,
        time,
        guests: guests || 1,
        bookedAt: Date.now(),
        cancelledAt: null,
        largeGroup: (guests >= 6),
        totalCost: totalCost || "₹0",
        tableId
      };

      const resRef = db.collection("reservations").doc();
      transaction.set(resRef, reservationData);

      // 4. Delete hold if it existed
      if (holdId) {
        const holdRef = db.collection("holds").doc(holdId);
        transaction.delete(holdRef);
      }

      return { reservationId: resRef.id };
    });

    console.log(`[RESERVE] Successfully created reservation ${result.reservationId}`);
    res.json({ message: `Table ${tableId} booked successfully at ${restaurant}`, reservationId: result.reservationId });
  } catch (error) {
    if (error.message === "HOLD_EXPIRED") {
      return res.status(410).json({ error: "Session expired. Please select the table again." });
    }
    if (error.message === "TABLE_OCCUPIED") {
      return res.status(409).json({ error: "This table was just booked for an overlapping slot. Please try again." });
    }
    console.error("Reserve Table Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─────────────────────────────────────────────
// GET USER RESERVATIONS
// ─────────────────────────────────────────────
app.get("/my-reservations", authMiddleware, async (req, res) => {
  try {
    const snapshot = await db.collection("reservations")
      .where("bookedBy", "==", req.user.userId)
      .orderBy("bookedAt", "desc")
      .get();

    const reservations = [];
    snapshot.forEach((doc) => reservations.push({ id: doc.id, ...doc.data() }));
    res.json({ reservations });
  } catch (error) {
    // Fallback if index missing
    const snap = await db.collection("reservations").where("bookedBy", "==", req.user.userId).get();
    const list = [];
    snap.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
    res.json({ reservations: list.sort((a, b) => b.bookedAt - a.bookedAt) });
  }
});

// ─────────────────────────────────────────────
// CANCEL RESERVATION (With Refund Logic)
// ─────────────────────────────────────────────
app.post("/cancel-reservation", authMiddleware, async (req, res) => {
  try {
    const { reservationId } = req.body;
    if (!reservationId) return res.status(400).json({ error: "Reservation ID is required" });

    const resRef = db.collection("reservations").doc(reservationId);
    const resDoc = await resRef.get();

    if (!resDoc.exists) return res.status(404).json({ error: "Reservation not found" });

    const data = resDoc.data();
    if (data.bookedBy !== req.user.userId && req.user.role !== "admin") {
      return res.status(403).json({ error: "unauthorized to cancel this reservation" });
    }

    if (data.status === "cancelled") {
      return res.status(400).json({ error: "Reservation is already cancelled" });
    }

    // 1. Call Python Refund Engine
    let refundInfo = { refund_percent: 0, refund_amount: 0 };
    try {
      const refundRes = await fetch(`http://localhost:5001/api/calculate-refund/${reservationId}`);
      if (refundRes.ok) {
        refundInfo = await refundRes.json();
      }
    } catch (err) {
      console.warn("Refund Engine unreachable, defaulting to 0 refund:", err.message);
    }

    // 2. Update Firestore
    await resRef.update({
      status: "cancelled",
      cancelledAt: Date.now(),
      refundPercent: refundInfo.refund_percent || 0,
      refundAmount: refundInfo.refund_amount || 0,
      cancellationReason: req.body.reason || "User requested"
    });

    res.json({
      message: "Reservation cancelled successfully",
      refund: refundInfo.refund_amount,
      percent: refundInfo.refund_percent
    });
  } catch (error) {
    console.error("Cancel Reservation Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─────────────────────────────────────────────
// ADMIN — GET ALL RESERVATIONS
// ─────────────────────────────────────────────
app.get("/admin/reservations", authMiddleware, async (req, res) => {
  console.log(`[ADMIN] Fetching reservations for ${req.user.email} (Role: ${req.user.role})`);
  try {
    if (req.user.role !== "admin" && req.user.role !== "restaurant_owner") {
      return res.status(403).json({ error: "Forbidden" });
    }
    let query = db.collection("reservations");
    if (req.user.role === "restaurant_owner" && req.user.managedRestaurant) {
      query = query.where("restaurant", "==", req.user.managedRestaurant);
    }
    const snap = await query.get();
    const reservations = [];
    snap.forEach(doc => reservations.push({ id: doc.id, ...doc.data() }));
    console.log(`[ADMIN] Returning ${reservations.length} reservations`);
    res.json({ reservations });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─────────────────────────────────────────────
// REVIEWS
// ─────────────────────────────────────────────
app.post("/reviews", authMiddleware, async (req, res) => {
  try {
    const { restaurant, rating, comment } = req.body;
    if (!restaurant || !rating) return res.status(400).json({ error: "Restaurant and rating required" });

    await db.collection("reviews").add({
      restaurant,
      rating: Number(rating),
      comment: comment || "",
      userId: req.user.userId,
      username: req.user.username || "Guest",
      createdAt: Date.now()
    });

    res.json({ message: "Review submitted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/reviews/:restaurant", async (req, res) => {
  try {
    const snap = await db.collection("reviews")
      .where("restaurant", "==", req.params.restaurant)
      .orderBy("createdAt", "desc")
      .get();
    const reviews = [];
    snap.forEach(doc => reviews.push({ id: doc.id, ...doc.data() }));
    res.json({ reviews });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/reviews/:id/respond", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "restaurant_owner") {
      return res.status(403).json({ error: "Unauthorized" });
    }
    const { response } = req.body;
    await db.collection("reviews").doc(req.params.id).update({
      ownerResponse: response,
      respondedAt: Date.now()
    });
    res.json({ message: "Response added" });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─────────────────────────────────────────────
// TABLE STATUS — LIVE (aware of date/time)
// ─────────────────────────────────────────────
app.get("/table-status", async (req, res) => {
  try {
    const { restaurant, date, time } = req.query;
    if (!restaurant || !date || !time) {
      return res.status(400).json({ error: "Missing restaurant, date, or time" });
    }

    // 1. Get reservations for this slot (Filter cancelled in-memory)
    const resSnap = await db.collection("reservations")
      .where("restaurant", "==", restaurant)
      .where("date", "==", date)
      .get();

    const statusMap = {};
    resSnap.forEach(doc => {
      const data = doc.data();
      if (data.status !== "cancelled" && isOverlapping(data.time, time)) {
        statusMap[data.tableId] = "booked";
      }
    });

    // 2. Get active holds for this slot (Filter in-memory)
    const now = Date.now();
    const holdsSnap = await db.collection("holds")
      .where("restaurant", "==", restaurant)
      .where("date", "==", date)
      .get();

    holdsSnap.forEach(doc => {
      const data = doc.data();
      if (data.expiresAt > now && isOverlapping(data.time, time)) {
        statusMap[data.tableId] = statusMap[data.tableId] || "held";
      }
    });

    res.json({ tables: statusMap });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});
// ADMIN/OWNER ACTIONS
// ─────────────────────────────────────────────
app.put("/admin/reservations/:id/status", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "restaurant_owner") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "Status required" });

    const resRef = db.collection("reservations").doc(req.params.id);
    const resDoc = await resRef.get();
    if (!resDoc.exists) return res.status(404).json({ error: "Not found" });

    await resRef.update({ status });
    res.json({ message: `Reservation marked as ${status}` });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─────────────────────────────────────────────
// RESTAURANTS — PUBLIC LIST
// ─────────────────────────────────────────────
app.get("/restaurants", async (req, res) => {
  try {
    const snap = await db.collection("restaurants").where("status", "==", "approved").get();
    const list = [];
    snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
    res.json({ restaurants: list });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─────────────────────────────────────────────
// ADMIN — RESTAURANT MANAGEMENT
// ─────────────────────────────────────────────
app.post("/admin/restaurants", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only" });
    const { name, category, image, layout } = req.body;
    const docRef = await db.collection("restaurants").add({
      name, category, image, layout,
      status: "approved", // auto-approve for now
      createdAt: Date.now()
    });
    res.json({ message: "Restaurant added", id: docRef.id });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.put("/admin/restaurants/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only" });
    const { status } = req.body;
    await db.collection("restaurants").doc(req.params.id).update({ status });
    res.json({ message: "Restaurant updated" });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`✅ DineSpot backend running on http://localhost:${PORT}`);
  });
}

module.exports = app;
