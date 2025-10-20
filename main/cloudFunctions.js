// main/cloudFunctions.js

// --- Importaciones de Firebase Functions (2ª Generación) ---
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
// Se incluye onCall aquí para la nueva función de prueba, asegurando que esté disponible.
const { onCall, HttpsError } = require("firebase-functions/v2/https");

// --- Inicialización de Firebase Admin SDK ---
// Esto asegura que el SDK de Admin esté inicializado una sola vez en tu aplicación de Cloud Functions.
if (!admin.apps.length) {
  admin.initializeApp();
}

// ====================================================================================================
// =================================== OPCIONES GLOBALES DE CLOUD FUNCTIONS =========================
setGlobalOptions({
  region: "southamerica-east1", // Tu región actual. Es crucial para el rendimiento y la latencia.
  // Puedes añadir aquí opciones por defecto como cpu, memory, concurrency, timeoutSeconds
  // Estas opciones aplican a todas las funciones exportadas desde este archivo por defecto.
  // cpu: 1, // Cantidad de CPU asignada a la función.
  // memory: "256MiB", // Cantidad de memoria asignada a la función.
  // concurrency: 80, // Número de solicitudes simultáneas que una instancia de función puede manejar.
  // timeoutSeconds: 60, // Tiempo máximo de ejecución antes de que la función se detenga (en segundos).
});
// ====================================================================================================

// --- Importar todas tus funciones modulares y re-exportarlas ---
// Esto le dice a Firebase qué funciones desplegar cuando ejecutas `firebase deploy --only functions`.
// Asegúrate de que todas tus funciones estén correctamente importadas y exportadas aquí.

// Funciones relacionadas con la validación de usuarios y pagos
exports.initiatePayment = require('./validation/paymentFunctions').initiatePayment;
exports.processPaymentConfirmation = require('./validation/paymentFunctions').processPaymentConfirmation;

// *** CAMBIO CLAVE AQUÍ: Importa las funciones de Equifax desde el archivo correcto ***
const equifaxValidationFunctions = require('./validation/equifaxFunctions');

// Asumo que initiateEquifaxSimpleValidation también está en el mismo archivo 'equifaxFunctions.js' dentro de 'validation'
// Si no es así, ajusta esta línea para que apunte al lugar correcto de esa función.
// ...
exports.initiateEquifaxSimpleValidation = equifaxValidationFunctions.initiateEquifaxSimpleValidation; // TEMP CHANGE
// ...

exports.initiateEquifaxFullValidation = equifaxValidationFunctions.initiateEquifaxFullValidation; // Función para validación completa de Equifax.
exports.submitEquifaxQuestionnaireAnswers = equifaxValidationFunctions.submitEquifaxQuestionnaireAnswers; // Función para enviar respuestas del cuestionario de Equifax.
// exports.completeAdditionalValidationData = require('./validation/dataEntryFunctions').completeAdditionalValidationData;

// Funciones de administración
exports.crearNuevaValidacion = require('./admin/adminFunctions').crearNuevaValidacion;
exports.deactivateValidation = require('./admin/adminFunctions').deactivateValidation;
exports.consultarEstadoValidacion = require('./admin/adminFunctions').consultarEstadoValidacion;
exports.authenticateAndMintToken = require('./admin/adminFunctions').authenticateAndMintToken;
exports.searchUserValidations = require('./admin/adminFunctions').searchUserValidations;
exports.testAuth = require('./test/testAuthFunction').testAuth;

// Funciones de métricas (triggers de Firestore)
exports.updateUserCount = require('./metrics/userMetrics').updateUserCount;
exports.updateValidationCount = require('./metrics/validationMetrics').updateValidationCount;

// ====================================================================================================
// ============================== INICIO: Código para probar el CORS ================================
exports.testCORSFunction = onCall(async (request) => {
  console.log("DEBUG: testCORSFunction de prueba llamada.");
  return { message: "¡CORS test exitoso desde una función simple!" };
});
// ================================ FIN: Código para probar el CORS =================================
// ====================================================================================================
