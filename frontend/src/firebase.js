import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// TODO: Replace this config with your actual Firebase Project config!
// 1. Go to https://console.firebase.google.com/
// 2. Create a Project and enable Google Authentication
// 3. Add a Web App and paste the config here:
const firebaseConfig = {
  apiKey: "AIzaSyBJohtE007DoxgN2w9-efdw-IQMJ8tsPNY",
  authDomain: "rate-limiter-fa039.firebaseapp.com",
  projectId: "rate-limiter-fa039",
  storageBucket: "rate-limiter-fa039.firebasestorage.app",
  messagingSenderId: "188822056944",
  appId: "1:188822056944:web:ae944e268f7841dc0b3735",
  measurementId: "G-BV2155TEPL"
};

let app, auth, provider;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  provider = new GoogleAuthProvider();
} catch (e) {
  console.error("Firebase is not configured correctly yet. Please update frontend/src/firebase.js");
}

const isFirebaseConfigured = firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY" && firebaseConfig.apiKey !== "";

export { auth, provider, isFirebaseConfigured };
