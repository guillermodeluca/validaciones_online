// main/test/testAuthFunction.js
const admin = require("firebase-admin");
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https'); // Correcto: v2 import

// Inicializa admin si no ha sido inicializado (aunque el archivo principal lo hace)
if (!admin.apps.length) {
  admin.initializeApp();
}

exports.testAuth = onCall(
  { cors: true },
  async (request) => { // <--- ¡¡¡CORREGIDO: AHORA ES SOLO 'request'!!!
    // ¡NUEVO LOG DE INICIO DE EJECUCIÓN!
    console.log('FUNCTIONS_LOG_START: La función testAuth ha comenzado su ejecución.');

    // La información de autenticación para onCall viene en request.auth en v2
    const authPresent = !!request.auth;
    const uid = request.auth ? request.auth.uid : 'N/A'; // <--- Usamos request.auth
    const message = authPresent ? 'Usuario autenticado a través de Firebase Auth.' : 'No autenticado por Firebase Auth.';

    console.log(`TEST AUTH FUNCTION (onCall) - Auth info IS ${authPresent ? 'PRESENT' : 'NOT PRESENT'}. UID: ${uid}`);

    return { authPresent, uid, message };
  });
