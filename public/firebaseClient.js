// public/firebaseClient.js

// *********************************************************************************
// * 1. IMPORTACIONES (Firebase)                                                   *
// *********************************************************************************

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { 
    getAuth, 
    signInWithCustomToken, 
    connectAuthEmulator, 
    onAuthStateChanged, 
    signInAnonymously,
    signOut 
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    connectFirestoreEmulator, 
    collection,
    updateDoc,      
    setDoc,         
    serverTimestamp as FieldValue      
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";
// ...existing code...
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-functions.js";
// ...existing code...// ...existing code...
// Importa tu configuración de Firebase
import { firebaseConfig } from './firebaseConfig.js'; 

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "southamerica-east1");


// --- Diagnóstico de Entorno y Configuración de Emuladores ---
const isLocalhost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const useCloudServicesFromLocalhost = new URLSearchParams(window.location.search).get('useCloudServices') === 'true';

console.log(`DIAGNOSTICO: isLocalhost=${isLocalhost}, useCloudServicesFromLocalhost=${useCloudServicesFromLocalhost}`);

if (isLocalhost && !useCloudServicesFromLocalhost) {
  console.log("DECISION DE CONEXION: Conectando a los EMULADORES.");
  try {
    // autenticación emulator (match: FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099)
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    console.log("🔥 Conectado al Emulador de Autenticación de Firebase (9099).");
  } catch (e) {
    console.warn("firebaseClient: failed to connect auth emulator:", e.message);
  }

  try {
    // functions emulator (ahora con región southamerica-east1)
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    console.log("⚡️ Conectado al Emulador de Cloud Functions de Firebase (5001) en southamerica-east1.");
  } catch (e) {
    console.warn("firebaseClient: failed to connect functions emulator:", e.message);
  }

  try {
    // firestore emulator (match: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080)
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    console.log("☁️ Conectado al Emulador de Cloud Firestore de Firebase (8080).");
  } catch (e) {
    console.warn("firebaseClient: failed to connect firestore emulator:", e.message);
  }
} else {
  console.log("DECISION DE CONEXION: Conectando a servicios de Firebase en la Nube.");
}

// --- Función para iniciar sesión con el token personalizado ---
export async function iniciarSesionConTokenPersonalizado(customToken) {
  try {
    const userCredential = await signInWithCustomToken(auth, customToken);
    const user = userCredential.user;

    console.log("✅ ¡Usuario autenticado con éxito en Firebase!");
    console.log("UID del usuario:", user.uid);
    console.log("Email del usuario:", user.email || "No disponible");
    console.log("Datos del usuario:", user);

    console.log("\nIntentando leer un documento de Firestore (colección 'users')...");
    const userDocRef = doc(db, "users", user.uid); 
    const userDocSnap = await getDoc(userDocRef); 

    if (userDocSnap.exists()) {
      console.log("Datos del documento de usuario en Firestore:", userDocSnap.data());
    } else {
      console.log("El documento del usuario no existe en Firestore. Creando uno si es necesario en Cloud Function.");
    }

  } catch (error) {
    console.error("❌ Error al iniciar sesión o acceder a Firestore con token personalizado:", error.code, error.message);
    if (error.code === 'auth/invalid-custom-token') {
      alert('Error de autenticación: El token personalizado es inválido o ha expirado. Genera uno nuevo.');
    } else {
      alert('Error de autenticación: ' + error.message);
    }
    throw error;
  }
}

// --- Asegurar autenticación anónima para callables ---
async function ensureAuth() {
  if (auth.currentUser) {
    console.log("firebaseClient: usuario ya autenticado:", auth.currentUser.uid);
    return auth.currentUser;
  }
  try {
    const userCredential = await signInAnonymously(auth);
    console.info("firebaseClient: signed in anonymously", userCredential.user.uid);
    return userCredential.user;
  } catch (err) {
    console.warn("firebaseClient.ensureAuth: signInAnonymously failed:", err.message);
    throw err;
  }
}

// --- Funciones para interactuar con Cloud Functions ---
export async function initiatePaymentClient(payload) {
  await ensureAuth();
  const fn = httpsCallable(functions, "initiatePayment");
  try {
    // Pasar payload directamente (no { data: payload })
    const res = await fn(payload);
    return res.data;
  } catch (error) {
    console.error("Error en initiatePaymentClient:", error.message);
    throw error;
  }
}

export async function processPaymentConfirmationClient(payload) {
  await ensureAuth();
  const fn = httpsCallable(functions, "processPaymentConfirmation");
  try {
    // Pasar payload directamente (no { data: payload })
    const res = await fn(payload);
    return res.data;
  } catch (error) {
    console.error("Error en processPaymentConfirmationClient:", error.message);
    throw error;
  }
}

// --- Exportaciones ---
export {
  app,
  auth,
  db,
  functions,
  httpsCallable,
  collection,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  FieldValue,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCustomToken,
  signOut,

};
