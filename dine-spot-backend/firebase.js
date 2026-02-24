const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json"); // Make sure this file exists!

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://dinespot-a6885.firebaseapp.com" // Replace with your Firebase database URL
});

const db = admin.firestore();

module.exports = { db };
