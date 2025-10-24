// main/validation/equifaxFunctions.js

// === Imports necesarios para tus funciones de Equifax ===
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");

// Importa las utilidades desde authUtils.js (IS_DEV_MODE se define ahí)
const { getAuthenticatedUserRole, IS_DEV_MODE, isValidEmailFormat } = require('../utils/authUtils');
// Importa defineSecret para usar secrets
const { defineSecret } = require('firebase-functions/params');

// Inicializa Firebase Admin SDK si no está ya inicializado
try {
  if (!admin.apps.length) {
    admin.initializeApp();
    console.log('Firebase Admin inicializado correctamente en equifaxFunctions.js');
  }
} catch (error) {
  console.error('Error inicializando Firebase Admin en equifaxFunctions.js:', error);
  throw new Error('No se pudo inicializar Firebase Admin');
}

const db = admin.firestore();

// >>>>> DEFINICIÓN DE SECRETOS (Nombres exactos de la Consola de Firebase) <<<<<
// Estos secretos deben existir en tu proyecto de Firebase Secret Manager.
const equifaxClientId = defineSecret('EQUIFAX_CLIENT_ID');
const equifaxClientSecret = defineSecret('EQUIFAX_CLIENT_SECRET');
const equifaxQuestionnaireConfigId = defineSecret('EQUIFAX_QUESTIONNAIRE_CONFIG_ID');


/**
 * Cloud Function: Inicia una validación simple con Equifax.
 * Ejecuta una llamada real a la API de Equifax (UAT).
 */
exports.initiateEquifaxSimpleValidation = onCall(
  { 
    enforceAppCheck: false, // Considera activar a 'true' en producción final
    secrets: [equifaxClientId, equifaxClientSecret] 
  },
  async (request) => {
    console.log("initiateEquifaxSimpleValidation received request:", request);
    const { documentNumber, fullName, gender } = request.data;
    
    // Obtener información del usuario autenticado
    const userInfo = await getAuthenticatedUserRole(request); 

    // Validaciones de autenticación y argumentos
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Se requiere autenticación para iniciar la validación.");
    }
    if (!documentNumber || typeof documentNumber !== "string" || !documentNumber.trim()) {
      throw new HttpsError("invalid-argument", "El número de documento es obligatorio y debe ser una cadena.");
    }
    if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
      throw new HttpsError("invalid-argument", "El nombre completo es obligatorio y debe ser una cadena.");
    }
    if (!gender || !["M", "F", "O"].includes(gender)) {
      throw new HttpsError("invalid-argument", "El género debe ser 'M', 'F' o 'O'.");
    }

    const transactionId = `eqfx_simple_${uuidv4()}`;
    try {
      // 1. Obtener Access Token de Equifax
      const tokenResponse = await axios.post(
        `https://api.latam.equifax.com/v2/oauth/token`, // <<-- ¡QUITAR EL ".uat"!
        `grant_type=client_credentials&scope=https://api.latam.equifax.com/ifctribe-idv`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${equifaxClientId.value()}:${equifaxClientSecret.value()}`).toString('base64')}`
          }
        }
      );
      const accessToken = tokenResponse.data.access_token;

      // 2. Realizar la llamada a la Validación Simple de Equifax (UAT)
      const equifaxResponse = await axios.post(
        `https://api.latam.equifax.com/ifctribe-idv/validation/simple?product=IDCLFULL`, 
        { documentNumber, fullName, gender },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      // 3. Guardar el resultado en Firestore
      const validationData = {
        transactionId,
        userUid: request.auth.uid,
        documentNumber,
        fullName,
        gender: gender || null,
        status: equifaxResponse.data.success ? "completed" : "failed",
        createdAt: FieldValue.serverTimestamp(),
        equifaxData: equifaxResponse.data, // Guarda toda la respuesta de Equifax
      };

      await db.collection("equifaxValidations").doc(transactionId).set(validationData);
      console.info(`Validación simple creada con transactionId: ${transactionId} para UID: ${request.auth.uid}`);

      // 4. Actualizar el documento del usuario con el estado de la validación
      const userDocRef = db.collection('users').doc(request.auth.uid);
      await userDocRef.update({
        'validationProcess.status': validationData.status,
        'validationProcess.lastUpdated': FieldValue.serverTimestamp(),
        'validationProcess.equifax.lastSimpleTransactionId': transactionId,
        'validationProcess.equifax.lastSimpleResultSummary': {
            success: equifaxResponse.data.success,
            status: validationData.status,
            message: equifaxResponse.data.details // Ajusta según la estructura real de tu API de Equifax
        }
      });

      // 5. Devolver la respuesta al frontend
      return {
        success: equifaxResponse.data.success,
        transactionId,
        message: equifaxResponse.data.success
          ? "Validación simple iniciada con éxito."
          : "Error en la validación simple de Equifax.",
      };
    } catch (error) {
      console.error("Error en initiateEquifaxSimpleValidation:", error);
      const errorMessage = error.response?.data?.message || error.message || 'Error desconocido';
      throw new HttpsError("internal", `Error al procesar la validación simple de Equifax: ${errorMessage}`);
    }
  }
);


/**
 * Cloud Function: Inicia una validación completa con Equifax, incluyendo cuestionario.
 * Ejecuta una llamada real a la API de Equifax (UAT).
 */
exports.initiateEquifaxFullValidation = onCall(
  { 
    enforceAppCheck: false, // Considera activar a 'true' en producción final
    secrets: [equifaxClientId, equifaxClientSecret, equifaxQuestionnaireConfigId] 
  },
  async (request) => {
    console.log("initiateEquifaxFullValidation received request:", request);
    // Ya no esperamos questionnaireConfigurationId del frontend, lo obtenemos del secreto
    const { documentNumber, fullName, gender } = request.data;
    const userInfo = await getAuthenticatedUserRole(request); 

    // Validaciones de autenticación y argumentos
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Se requiere autenticación para iniciar la validación.");
    }
    if (!documentNumber || typeof documentNumber !== "string" || !documentNumber.trim()) {
      throw new HttpsError("invalid-argument", "El número de documento es obligatorio y debe ser una cadena.");
    }
    if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
      throw new HttpsError("invalid-argument", "El nombre completo es obligatorio y debe ser una cadena.");
    }
    if (!gender || !["M", "F", "O"].includes(gender)) {
      throw new HttpsError("invalid-argument", "El género debe ser 'M', 'F' o 'O'.");
    }

    const transactionId = `eqfx_full_${uuidv4()}`;
    try {
      // 1. Obtener Access Token de Equifax
      const tokenResponse = await axios.post(
        `https://api.latam.equifax.com/v2/oauth/token`, 
        `grant_type=client_credentials&scope=https://api.latam.equifax.com/ifctribe-idv`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${equifaxClientId.value()}:${equifaxClientSecret.value()}`).toString('base64')}`
          }
        }
      );
      const accessToken = tokenResponse.data.access_token;
      
      // 2. Realizar la llamada a la Validación Completa de Equifax (UAT)
      const equifaxResponse = await axios.post(
        `https://api.latam.equifax.com/ifctribe-idv/validation/full?product=IDCLFULL`, 
        { 
          documentNumber: documentNumber,
          fullName: fullName,
          gender: gender,
          questionnaireConfigurationId: equifaxQuestionnaireConfigId.value(), // Obtenido del secreto
        },
        { 
          headers: { Authorization: `Bearer ${accessToken}` } 
        } 
      );

      // --- CAPTURA DE DATOS DE LA RESPUESTA DE EQUIFAX ---
      // Asegurarse de que equifaxResponse.data.payload existe
      const payload = equifaxResponse.data.payload;
      if (!payload) {
          throw new HttpsError("internal", "Respuesta inesperada de Equifax: payload ausente.");
      }

      const equifaxGeneratedId = payload.questionnaire?.id || null; // ID del cuestionario de Equifax
      const questionsForFrontend = payload.questionnaire?.questionsOfGeneratedQuestionnaire || [];
      const equifaxTransactionId = payload.idTransaccion || null; // ID de transacción de Equifax
      const personData = payload.person || {}; // Datos personales validados

      // 3. Guardar el resultado inicial en Firestore
      const validationData = {
        transactionId, // Nuestro ID interno
        userUid: request.auth.uid,
        documentNumber, // Del request
        fullName,     // Del request
        gender,       // Del request
        status: "questionnaire_pending", // El estado inicial es "pendiente de cuestionario"
        createdAt: FieldValue.serverTimestamp(),
        // Guarda el cuestionario con la estructura tal como lo necesitamos
        questionnaire: { questionsOfGeneratedQuestionnaire: questionsForFrontend },
        // Guarda los IDs y datos específicos de Equifax
        equifaxResult: {
            idTransaccion: equifaxTransactionId, // ID de transacción de Equifax
            idQuestionnaireGenerated: equifaxGeneratedId, // ID del cuestionario de Equifax
            person: personData, // Guarda los datos de la persona validados por Equifax
        },
      };

      await db.collection("equifaxValidations").doc(transactionId).set(validationData);
      console.info(`Validación completa creada con transactionId: ${transactionId} para UID: ${request.auth.uid}`);

      // 4. Actualizar el documento del usuario con el estado de la validación
      const userDocRef = db.collection('users').doc(request.auth.uid);
      await userDocRef.update({
        'validationProcess.status': 'questionnaire_pending',
        'validationProcess.lastUpdated': FieldValue.serverTimestamp(),
        'validationProcess.equifax.lastTransactionId': transactionId, // Guarda nuestro ID interno
        'validationProcess.equifax.idTransaccionEquifax': equifaxTransactionId, // Guarda el ID de Equifax
        'validationProcess.equifax.idQuestionnaireGenerated': equifaxGeneratedId, // Guarda el ID del cuestionario de Equifax
        'validationProcess.equifax.person': personData, // Guarda los datos personales validados por Equifax
      });

      // 5. Devolver la respuesta al frontend
      return {
        success: true,
        transactionId, // Nuestro ID interno
        questionnaire: questionsForFrontend, // Devuelve el array de preguntas al frontend
        idQuestionnaireGenerated: equifaxGeneratedId, // Devuelve el ID del cuestionario de Equifax al frontend
        message: "Validación completa iniciada con éxito. Responda el cuestionario.",
        // Puedes devolver también personData si el frontend lo necesita para pre-rellenar campos.
        person: personData
      };
    } catch (error) {
      console.error("Error en initiateEquifaxFullValidation:", error);
      const errorMessage = error.response?.data?.message || error.message || 'Error desconocido';
      throw new HttpsError("internal", `Error al procesar la validación completa de Equifax: ${errorMessage}`);
    }
  }
);

/**
 * Cloud Function: Procesa las respuestas del cuestionario de Equifax.
 * Ejecuta una llamada real a la API de Equifax (UAT).
 */
exports.submitEquifaxQuestionnaireAnswers = onCall(
  { 
    enforceAppCheck: false, // Considera activar a 'true' en producción final
    secrets: [equifaxClientId, equifaxClientSecret] 
  },
  async (request) => {
    console.log("submitEquifaxQuestionnaireAnswers received request:", request);
    const { transactionId, questionnaireResponses, userRole, userUid } = request.data;
    const userInfo = await getAuthenticatedUserRole(request); 

    // Validaciones de autenticación y argumentos
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Se requiere autenticación para enviar respuestas.");
    }
    if (!transactionId || typeof transactionId !== "string" || !transactionId.trim()) {
      throw new HttpsError("invalid-argument", "El transactionId es obligatorio y debe ser una cadena.");
    }
    if (!questionnaireResponses || !Array.isArray(questionnaireResponses) || questionnaireResponses.length === 0) {
      throw new HttpsError("invalid-argument", "Las respuestas del cuestionario son obligatorias y deben ser un arreglo no vacío.");
    }
    if (!userRole || !["propietario", "inquilino"].includes(userRole)) {
      throw new HttpsError("invalid-argument", "El rol de usuario debe ser 'propietario' o 'inquilino'.");
    }
    if (userInfo.uid !== userUid) { // Asegurarse de que el userUid enviado coincida con el autenticado
      throw new HttpsError("permission-denied", "UID del usuario no coincide con el autenticado.");
    }

    const validationDocRef = db.collection("equifaxValidations").doc(transactionId);
    const validationDoc = await validationDocRef.get();

    // Validaciones del documento de Firestore
    if (!validationDoc.exists) {
      throw new HttpsError("not-found", `No se encontró una validación con transactionId: ${transactionId}`);
    }
    const validationData = validationDoc.data();
    if (validationData.userUid !== request.auth.uid) { 
      throw new HttpsError("permission-denied", "No tiene permisos para enviar respuestas para esta validación.");
    }
    if (validationData.status !== "questionnaire_pending") {
      throw new HttpsError("failed-precondition", "El cuestionario ya fue procesado o no está pendiente.");
    }

    try {
      // 1. Obtener Access Token de Equifax
      const tokenResponse = await axios.post(
        `https://api.latam.equifax.com/v2/oauth/token`, 
        `grant_type=client_credentials&scope=https://api.latam.equifax.com/ifctribe-idv`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${equifaxClientId.value()}:${equifaxClientSecret.value()}`).toString('base64')}`
          }
        }
      );
      const accessToken = tokenResponse.data.access_token;

      // 2. Necesitas el idQuestionnaireGenerated y idTransaccion de la validación inicial para enviar las respuestas.
      // Lo obtenemos del documento de Firestore `validationData`.
      const idQuestionnaireGenerated = validationData.equifaxResult?.idQuestionnaireGenerated;
      const equifaxTransactionId = validationData.equifaxResult?.idTransaccion; // El idTransaccion de Equifax
      if (!idQuestionnaireGenerated || !equifaxTransactionId) {
          throw new HttpsError("failed-precondition", "No se encontró el ID del cuestionario generado o el ID de transacción de Equifax para enviar las respuestas.");
      }

      // 3. Realizar la llamada para Enviar Respuestas a Equifax (UAT)
      const equifaxResponse = await axios.post(
        `https://api.latam.equifax.com/ifctribe-idv/validation/questionnaire/answers?product=IDCLFULL`, 
        { 
          idQuestionnaireGenerated: idQuestionnaireGenerated,
          idTransaction: equifaxTransactionId, // ¡Usar el idTransaccion de Equifax!
          questionnaireResponse: questionnaireResponses
        },
        { 
          headers: { Authorization: `Bearer ${accessToken}` } 
        } 
      );

      // 4. Determinar el estado final de la validación (ajusta según la respuesta real de Equifax)
      const finalValidationStatus = equifaxResponse.data.payload?.transactionStateDescription === "APROBADO" ? "completed_validated" : "failed"; // Ajusta esto
      // O si el resultado final está en equifaxResponse.data.success directamente:
      // const finalValidationStatus = equifaxResponse.data.success ? "completed_validated" : "failed";

      // 5. Actualizar el documento en la colección 'equifaxValidations'
      await validationDocRef.update({
        status: finalValidationStatus,
        questionnaireResponses, // Guarda las respuestas que el usuario envió
        updatedAt: FieldValue.serverTimestamp(),
        // Actualiza el equifaxResult con la respuesta del envío de respuestas, manteniendo lo anterior
        'equifaxResult.answerResponse': equifaxResponse.data, // Guarda toda la respuesta de la segunda llamada
        'equifaxResult.finalValidationStatus': finalValidationStatus, // Guarda el estado final determinado
      });

      // 6. Actualizar el documento del usuario en la colección 'users'
      const userDocRef = db.collection('users').doc(request.auth.uid);
      await userDocRef.update({
        'validationProcess.status': finalValidationStatus,
        'validationProcess.lastUpdated': FieldValue.serverTimestamp(),
        'validationProcess.equifax.lastResultSummary': {
            success: equifaxResponse.data.code === 0, // Si code 0 es éxito
            validationStatus: finalValidationStatus,
            message: equifaxResponse.data.message // Mensaje general de Equifax
        }
      });

      // 7. Devolver la respuesta al frontend
      console.info(`Respuestas procesadas para transactionId: ${transactionId}, status: ${finalValidationStatus}`);
      return {
        success: equifaxResponse.data.code === 0, // Si code 0 es éxito
        validationStatus: finalValidationStatus,
        // Si Equifax devuelve un nuevo cuestionario para segundo nivel, devuélvelo aquí
        questionnaire: equifaxResponse.data.payload?.questionnaire?.questionsOfGeneratedQuestionnaire || null,
        message: equifaxResponse.data.message || `Validación ${finalValidationStatus === "completed_validated" ? "completada con éxito" : "fallida"}.`,
      };
    } catch (error) {
      console.error("Error en submitEquifaxQuestionnaireAnswers:", error);
      const errorMessage = error.response?.data?.message || error.message || 'Error desconocido';
      throw new HttpsError("internal", `Error al procesar las respuestas del cuestionario de Equifax: ${errorMessage}`);
    }
  }
);