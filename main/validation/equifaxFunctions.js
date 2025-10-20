// main/validation/equifaxFunctions.js

// === Imports necesarios para tus funciones de Equifax ===
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore"); // Correcto: Acceder a FieldValue
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");

// Importa las utilidades desde authUtils.js (¡SOLO UNA VEZ AL PRINCIPIO DEL ARCHIVO!)
const { getAuthenticatedUserRole, IS_DEV_MODE, isValidEmailFormat } = require('../utils/authUtils');

// Inicializa Firebase Admin SDK si no está ya inicializado
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();


/**
 * Cloud Function: Inicia una validación simple con Equifax.
 */
exports.initiateEquifaxSimpleValidation = onCall(
  { enforceAppCheck: false },
  async (request) => {
    console.log("initiateEquifaxSimpleValidation received request:", request);
    const { documentNumber, fullName } = request.data;
    
    // <<<<<<<<<<<<<<< ELIMINA ESTA LÍNEA DUPLICADA Y INCORRECTA >>>>>>>>>>>>>>>
    // const { getAuthenticatedUserRole, IS_DEV_MODE, isValidEmailFormat } = require('../utils/authUtils');

    // Ahora sí, LLAMA A LA FUNCIÓN que ya está importada y asigna su resultado
    const userInfo = await getAuthenticatedUserRole(request);

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Se requiere autenticación para iniciar la validación.");
    }

    if (!documentNumber || typeof documentNumber !== "string" || !documentNumber.trim()) {
      throw new HttpsError("invalid-argument", "El número de documento es obligatorio y debe ser una cadena.");
    }
    if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
      throw new HttpsError("invalid-argument", "El nombre completo es obligatorio y debe ser una cadena.");
    }

    const transactionId = `eqfx_simple_${uuidv4()}`;
    try {
      // Simulación de llamada a la API de Equifax (reemplaza con tu endpoint real)
      const equifaxResponse = await axios.post(
        "https://api.equifax.mock/validate/simple", // Sustituye por el endpoint real
        { documentNumber, fullName },
        { headers: { Authorization: "Bearer mock-equifax-token" } }
      );

      const validationData = {
        transactionId,
        userUid: request.auth.uid,
        documentNumber,
        fullName,
        status: equifaxResponse.data.success ? "completed" : "failed",
        createdAt: FieldValue.serverTimestamp(),
        equifaxData: equifaxResponse.data,
      };

      await db.collection("equifaxValidations").doc(transactionId).set(validationData);
      console.info(`Validación simple creada con transactionId: ${transactionId} para UID: ${request.auth.uid}`);

      return {
        success: equifaxResponse.data.success,
        transactionId,
        message: equifaxResponse.data.success
          ? "Validación simple iniciada con éxito."
          : "Error en la validación simple de Equifax.",
      };
    } catch (error) {
      console.error("Error en initiateEquifaxSimpleValidation:", error);
      throw new HttpsError("internal", "Error al procesar la validación simple de Equifax.");
    }
  }
);

/**
 * Cloud Function: Inicia una validación completa con Equifax, incluyendo cuestionario.
 */
exports.initiateEquifaxFullValidation = onCall(
  { enforceAppCheck: false },
  async (request) => {
    console.log("initiateEquifaxFullValidation received request:", request);
    const { documentNumber, fullName, gender } = request.data;
    const userInfo = await getAuthenticatedUserRole(request); // <-- getAuthenticatedUserRole ya está importada

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
      // Simulación de llamada a la API de Equifax para obtener cuestionario
      const equifaxResponse = await axios.post(
        "https://api.equifax.mock/validate/full", // Sustituye por el endpoint real
        { documentNumber, fullName, gender },
        { headers: { Authorization: "Bearer mock-equifax-token" } }
      );

      const questionnaire = equifaxResponse.data.questionnaire || {
        questionsOfGeneratedQuestionnaire: [
          {
            id: 1,
            description: "¿En qué año abrió su primera cuenta bancaria?",
            options: [
              { id: 1, description: "2010" },
              { id: 2, description: "2015" },
              { id: 3, description: "2020" },
              { id: 4, description: "Ninguna de las anteriores" },
            ],
          },
          // Más preguntas simuladas
        ],
      };

      const validationData = {
        transactionId,
        userUid: request.auth.uid,
        documentNumber,
        fullName,
        gender,
        status: "questionnaire_pending",
        createdAt: FieldValue.serverTimestamp(),
        questionnaire,
      };

      await db.collection("equifaxValidations").doc(transactionId).set(validationData);
      console.info(`Validación completa creada con transactionId: ${transactionId} para UID: ${request.auth.uid}`);

      return {
        success: true,
        transactionId,
        questionnaire: questionnaire.questionsOfGeneratedQuestionnaire,
        message: "Validación completa iniciada con éxito. Responda el cuestionario.",
      };
    } catch (error) {
      console.error("Error en initiateEquifaxFullValidation:", error);
      throw new HttpsError("internal", "Error al procesar la validación completa de Equifax.");
    }
  }
);

/**
 * Cloud Function: Procesa las respuestas del cuestionario de Equifax.
 */
exports.submitEquifaxQuestionnaireAnswers = onCall(
  { enforceAppCheck: false },
  async (request) => {
    console.log("submitEquifaxQuestionnaireAnswers received request:", request);
    const { transactionId, questionnaireResponses, userRole } = request.data;
    const userInfo = await getAuthenticatedUserRole(request); // <-- getAuthenticatedUserRole ya está importada

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

    const validationDocRef = db.collection("equifaxValidations").doc(transactionId);
    const validationDoc = await validationDocRef.get();

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
      // Simulación de validación de respuestas con Equifax
      const equifaxResponse = await axios.post(
        "https://api.equifax.mock/validate/answers", // Sustituye por el endpoint real
        { transactionId, responses: questionnaireResponses },
        { headers: { Authorization: "Bearer mock-equifax-token" } }
      );

      const validationStatus = equifaxResponse.data.success ? "completed_validated" : "failed";
      await validationDocRef.update({
        status: validationStatus,
        questionnaireResponses,
        updatedAt: FieldValue.serverTimestamp(),
        equifaxResult: equifaxResponse.data,
      });

      console.info(`Respuestas procesadas para transactionId: ${transactionId}, status: ${validationStatus}`);
      return {
        success: equifaxResponse.data.success,
        validationStatus,
        message: `Validación ${validationStatus === "completed_validated" ? "completada con éxito" : "fallida"}.`,
      };
    } catch (error) {
      console.error("Error en submitEquifaxQuestionnaireAnswers:", error);
      throw new HttpsError("internal", "Error al procesar las respuestas del cuestionario de Equifax.");
    }
  }
);
