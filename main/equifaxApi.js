// main/equifaxApi.js

const axios = require('axios');
const functions = require('firebase-functions');
const { getAccessToken } = require('./equifaxAuth');
const { EQUIFAX_API_BASE_URL, EQUIFAX_PRODUCT_IDENTIFIER } = require('./utils/constants');

/**
 * Realiza una validación simple de identidad con Equifax.
 * @param {object} data - Datos de la persona para la validación (documentNumber, gender, fullName).
 * @returns {Promise<object>} La respuesta de la API de validación simple.
 * @throws {Error} Si falla la solicitud a la API.
 */
async function simpleValidation(data) {
  const token = await getAccessToken();
  try {
    const response = await axios.post(
      `${EQUIFAX_API_BASE_URL}/validation/simple?product=${EQUIFAX_PRODUCT_IDENTIFIER}`,
      data,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    functions.logger.error("Error en simpleValidation:", error.response?.data || error.message);
    throw new Error("Fallo al realizar la validación simple.");
  }
}

/**
 * Inicia una validación completa de identidad con Equifax, obteniendo las preguntas del cuestionario.
 * @param {object} data - Datos de la persona y el ID de configuración del cuestionario.
 * @returns {Promise<object>} La respuesta de la API de validación completa (con el cuestionario).
 * @throws {Error} Si falla la solicitud a la API.
 */
async function fullValidation(data) {
  const token = await getAccessToken();
  try {
    const response = await axios.post(
      `${EQUIFAX_API_BASE_URL}/validation/full?product=${EQUIFAX_PRODUCT_IDENTIFIER}`,
      data,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    functions.logger.error("Error en fullValidation:", error.response?.data || error.message);
    throw new Error("Fallo al iniciar la validación completa.");
  }
}

/**
 * Envía las respuestas a un cuestionario de validación completa a Equifax.
 * @param {object} data - Las respuestas del cuestionario y los IDs de transacción/cuestionario.
 * @returns {Promise<object>} La respuesta final de la validación completa.
 * @throws {Error} Si falla la solicitud a la API.
 */
async function answerQuestionnaire(data) {
  const token = await getAccessToken();
  try {
    const response = await axios.post(
      `${EQUIFAX_API_BASE_URL}/validation/questionnaire/answers?product=${EQUIFAX_PRODUCT_IDENTIFIER}`,
      data,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    functions.logger.error("Error en answerQuestionnaire:", error.response?.data || error.message);
    throw new Error("Fallo al enviar las respuestas del cuestionario.");
  }
}

/**
 * Obtiene una lista de nombres asociados a un documento y género.
 * @param {string} documentNumber - Número de documento.
 * @param {'F'|'M'|'X'} gender - Género.
 * @returns {Promise<object>} Un objeto con la lista de nombres.
 * @throws {Error} Si falla la solicitud a la API.
 */
async function listNames(documentNumber, gender) {
  const token = await getAccessToken();
  try {
    const response = await axios.post(
      `${EQUIFAX_API_BASE_URL}/validation/list/name?product=${EQUIFAX_PRODUCT_IDENTIFIER}`,
      { documentNumber, gender },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    functions.logger.error("Error en listNames:", error.response?.data || error.message);
    throw new Error("Fallo al listar nombres.");
  }
}

// Puedes añadir aquí más funciones para los otros endpoints (check/positive, nextlevelquestions)
// siguiendo el mismo patrón.

module.exports = {
  simpleValidation,
  fullValidation,
  answerQuestionnaire,
  listNames,
};
