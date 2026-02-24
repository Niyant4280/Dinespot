import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

// ✅ Now 'onRequest' and 'logger' are used correctly
export const helloWorld = onRequest((req, res) => {
  logger.info("Hello from Firebase!"); 
  res.send("Hello, world!");
});
