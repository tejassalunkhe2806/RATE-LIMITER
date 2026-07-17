const admin = require('firebase-admin');

// Note: To make this work in production, you must initialize firebase-admin!
// 1. Go to Firebase Console -> Project Settings -> Service Accounts
// 2. Generate new private key and save as serviceAccountKey.json
// 3. Uncomment and configure below:
/*
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
*/

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  // If Firebase admin is not initialized, we will mock auth for development testing
  if (!admin.apps || admin.apps.length === 0) {
    console.warn("⚠️ Firebase Admin not initialized. Skipping token validation for dev mode.");
    req.user = { uid: "mock_user_123", email: "test@example.com" };
    return next();
  }

  admin.auth().verifyIdToken(token)
    .then((decodedToken) => {
      req.user = decodedToken;
      next();
    })
    .catch((error) => {
      res.status(403).json({ error: 'Invalid or expired Firebase token.' });
    });
}

module.exports = { authenticateToken };
