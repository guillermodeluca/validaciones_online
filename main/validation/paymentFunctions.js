// main/validation/paymentFunctions.js

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const axios = require('axios');

// >>>>> MODIFICACIÓN CLAVE AQUÍ: Importar FieldValue y Timestamp directamente <<<<<
// Esta es la forma CORRECTA y recomendada para Firebase Admin SDK v10+ y Functions v2
const { FieldValue, Timestamp } = require("firebase-admin/firestore"); 
// <<<<< FIN MODIFICACIÓN >>>>>

// Inicializar Firebase Admin con verificación para asegurar que se haga una vez
try {
  if (!admin.apps.length) {
    admin.initializeApp();
    console.log('Firebase Admin inicializado correctamente en paymentFunctions.js');
  }
} catch (error) {
  console.error('Error inicializando Firebase Admin en paymentFunctions.js:', error);
  throw new Error('No se pudo inicializar Firebase Admin');
}

const db = admin.firestore();

// >>>>> MANTENER ESTAS LÍNEAS DE LOG TEMPORALMENTE para depuración final <<<<<
console.log("DEBUG paymentFunctions: FieldValue is:", typeof FieldValue, FieldValue);
console.log("DEBUG paymentFunctions: Timestamp is:", typeof Timestamp, Timestamp);
// <<<<< FIN LÍNEAS DE LOG >>>>>

// Importa las utilidades desde authUtils.js (solo una vez al principio del archivo)
const { getAuthenticatedUserRole } = require('../utils/authUtils');


// Handler para iniciar pago
async function initiatePaymentHandler(request) {
  console.log('initiatePaymentHandler - start');
  const data = request.data || {};
  console.log('initiatePaymentHandler - data:', JSON.stringify(data, null, 2));

  // Obtener información del usuario autenticado de forma segura
  const userInfo = await getAuthenticatedUserRole(request).catch((e) => {
    console.warn('getAuthenticatedUserRole error:', e?.message);
    return null;
  });
  if (!userInfo || !userInfo.uid) {
    console.warn('initiatePaymentHandler - unauthenticated');
    throw new HttpsError('unauthenticated', 'Se requiere autenticación para iniciar el pago.');
  }
  const uid = userInfo.uid;

  // Validar inputs
  const { role, amount, returnUrl } = data;
  if (!role || (role !== 'propietario' && role !== 'inquilino')) {
    throw new HttpsError('invalid-argument', 'El rol de validación es inválido.');
  }
  if (typeof amount !== 'number' || amount <= 0) {
    throw new HttpsError('invalid-argument', 'El monto a pagar debe ser un número positivo.');
  }
  if (!returnUrl || typeof returnUrl !== 'string') {
    throw new HttpsError('invalid-argument', 'La URL de retorno es obligatoria.');
  }

  const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const paymentRef = db.collection('payments').doc(transactionId);

  try {
    // Usar transacción para escribir en Firestore (atomicidad)
    await db.runTransaction(async (tx) => {
      tx.set(paymentRef, {
        transactionId,
        userUid: uid,
        role,
        amount,
        status: 'pending', // Estado inicial del pago
        createdAt: FieldValue.serverTimestamp(),
        meta: { origin: 'frontend' }
      });
    });

    // Generar URL de pago simulada
    const paymentUrl = `${returnUrl.replace('{TRANSACTION_ID_PLACEHOLDER}', transactionId)}&amount=${amount}&role=${role}`;
    console.info(`initiatePaymentHandler - pago inicializado uid=${uid} tx=${transactionId}`);
    return { success: true, transactionId, paymentUrl, message: 'Proceso de pago iniciado (SIMULADO).' };
  } catch (err) {
    console.error('initiatePaymentHandler - error:', err);
    throw new HttpsError('internal', `Error iniciando pago: ${err.message}`);
  }
}

// Handler para confirmación de pago (Implementación mejorada con "lecturas primero")
async function processPaymentConfirmationHandler(request) {
  console.log('processPaymentConfirmationHandler - start');
  const data = request.data || {};
  console.log('processPaymentConfirmationHandler - data:', JSON.stringify(data, null, 2));

  // Obtener información del usuario autenticado de forma segura
  const userInfo = await getAuthenticatedUserRole(request).catch((e) => {
    console.warn('getAuthenticatedUserRole error:', e?.message);
    return null;
  });
  if (!userInfo || !userInfo.uid) {
    console.warn('processPaymentConfirmationHandler - unauthenticated');
    throw new HttpsError('unauthenticated', 'Se requiere autenticación para procesar la confirmación del pago.');
  }
  const userId = userInfo.uid;

  // Extraer detalles del payload
  const {
    paymentDetails = {},
    validationRole = null,
    transactionId = null, // Puede venir o no del cliente
    status = 'success',   // Asumimos 'success' por defecto si no se especifica
    gatewayPayload = null // Información adicional del gateway de pago
  } = data;

  // Determinar el ID de transacción a usar
  const effectiveTransactionId = transactionId || paymentDetails.transactionId || `txn_${Date.now()}`;
  
  // Referencias a documentos
  const paymentRef = db.collection('payments').doc(effectiveTransactionId);
  const userRef = db.collection('users').doc(userId);

  try {
    // ---------- Usar una transacción para garantizar la atomicidad y consistencia ----------
    await db.runTransaction(async (tx) => {
      // 1. Realizar todas las lecturas necesarias al inicio de la transacción
      const pSnap = await tx.get(paymentRef);
      const uSnap = await tx.get(userRef);

      // 2. Lógica para determinar el rol del usuario (priorizando el que viene con el pago)
      const roleToSet = validationRole || (uSnap.exists ? (uSnap.data().role || null) : null);

      // 3. Ahora aplicar escrituras basadas en las lecturas ya realizadas
      // Actualizar/crear documento de pago
      if (!pSnap.exists) {
        tx.set(paymentRef, {
          transactionId: effectiveTransactionId,
          userUid: userId,
          amount: paymentDetails.amount || 0,
          currency: paymentDetails.currency || 'USD', // Asegurarse de que el valor sea coherente
          status,
          gatewayPayload: gatewayPayload || null,
          createdAt: FieldValue.serverTimestamp() // Usar FieldValue
        });
      } else {
        tx.update(paymentRef, {
          status,
          gatewayPayload: gatewayPayload || null,
          confirmedAt: FieldValue.serverTimestamp() // Usar FieldValue
        });
      }

      // Actualizar/crear documento de usuario
      if (!uSnap.exists) {
        tx.set(userRef, {
          email: userInfo.email || null, // Usar email del token si está disponible
          role: roleToSet || null,
          createdAt: FieldValue.serverTimestamp(),
          validationProcess: { // Inicializar la estructura de validación
            status: 'payment_confirmed',
            payment: {
              transactionId: effectiveTransactionId,
              amount: paymentDetails.amount || 0,
              currency: paymentDetails.currency || 'N/A',
              date: FieldValue.serverTimestamp() // Usar FieldValue
            },
            role: roleToSet || null,
            lastUpdated: FieldValue.serverTimestamp() // Usar FieldValue
          },
          lastUpdated: FieldValue.serverTimestamp() // Usar FieldValue
        });
      } else {
        tx.update(userRef, {
          'validationProcess.status': 'payment_confirmed',
          'validationProcess.lastUpdated': FieldValue.serverTimestamp(), // Usar FieldValue
          'validationProcess.payment': {
            transactionId: effectiveTransactionId,
            amount: paymentDetails.amount || 0,
            currency: paymentDetails.currency || 'N/A',
            date: FieldValue.serverTimestamp() // Usar FieldValue
          },
          'validationProcess.role': roleToSet,
          role: roleToSet,
          lastUpdated: FieldValue.serverTimestamp() // Usar FieldValue
        });
      }
    });

    console.info(`Payment processed uid=${userId} tx=${effectiveTransactionId}`);
    return { success: true, transactionId: effectiveTransactionId, message: 'Pago procesado y validación marcada.' };
  } catch (err) {
    console.error('processPaymentConfirmationHandler - error:', err);
    throw new HttpsError('internal', `Error al procesar la confirmación de pago: ${err.message}`);
  }
}

// Exports de las funciones callable
exports._processPaymentConfirmationHandler = processPaymentConfirmationHandler; // Para posibles usos internos o pruebas
exports._initiatePaymentHandler = initiatePaymentHandler; // Para posibles usos internos o pruebas
exports.processPaymentConfirmation = onCall({ enforceAppCheck: false }, processPaymentConfirmationHandler);
exports.initiatePayment = onCall({ enforceAppCheck: false }, initiatePaymentHandler);
