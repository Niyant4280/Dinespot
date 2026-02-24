const admin = require("firebase-admin");

// Use env var for Vercel, fallback to local file for dev
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://dinespot-a6885.firebaseapp.com"
});

const db = admin.firestore();

module.exports = { db };
