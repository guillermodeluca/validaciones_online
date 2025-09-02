// public/firebaseClient.js

// --- Importa los módulos de Firebase que vas a usar desde CDN ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-analytics.js";
import { getAuth, signInWithCustomToken, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
// Asegúrate de importar 'connectFirestoreEmulator' aquí
import { getFirestore, doc, getDoc, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-functions.js";

// --- CAMBIO CLAVE AQUÍ PARA APP CHECK ---
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-check.js';


// Importa tu configuración de Firebase desde el archivo separado
import { firebaseConfig } from './firebaseConfig.js';


// --- 1. Inicializa la aplicación Firebase ---
const app = initializeApp(firebaseConfig);


// --- 2. Obtén las instancias de los servicios que vas a usar ---
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);
const functions = getFunctions(app, 'southamerica-east1');


// --- MUY IMPORTANTE: Conecta los SDKs a los emuladores ---
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
  console.log("🔥 Conectado al Emulador de Autenticación de Firebase.");

  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  console.log("⚡️ Conectado al Emulador de Cloud Functions de Firebase.");

  // ¡¡¡ LÍNEA AÑADIDA/VERIFICADA PARA CONECTAR FIRESTORE AL EMULADOR !!!
  connectFirestoreEmulator(db, "127.0.0.1", 8080); // El puerto 8080 es el predeterminado para el emulador de Firestore
  console.log("☁️ Conectado al Emulador de Cloud Firestore de Firebase.");

  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  console.warn("🛡️ App Check Debug Token enabled. Remember to disable this in production!");
}


// --- 3. Inicializa Firebase App Check (¡CRÍTICO para seguridad en producción!) ---
try {
    const appCheck = initializeAppCheck(app, {
        // --- CLAVE RECAPTCHA ACTUALIZADA AQUÍ ---
        provider: new ReCaptchaV3Provider('6Lc9jbQrAAAAAJfwI8xkNn37rhK6yIAp0pYqqGYb'), 
        isTokenAutoRefreshEnabled: true
    });
    console.log("🛡️ Firebase App Check inicializado con reCAPTCHA v3.");
} catch (error) {
    console.error("❌ Error al inicializar Firebase App Check:", error);
}


// --- 4. Función para iniciar sesión con el token personalizado ---
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
  }
}

// --- 5. Exporta las instancias de los servicios para que puedan ser usadas en otros archivos ---
export { app, auth, db, analytics, functions, httpsCallable };
