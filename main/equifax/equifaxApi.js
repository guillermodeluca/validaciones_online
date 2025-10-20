// main/equifax/equifaxApi.js

// === LÍNEA DE DEPURACIÓN AL PRINCIPIO DEL ARCHIVO ===
console.log(`DEBUG: equifaxApi.js LOADED. process.env.FUNCTIONS_EMULATOR at load time: ${process.env.FUNCTIONS_EMULATOR}`);
// ===============================================

const axios = require('axios');
// IMPORTACIÓN CORRECTA: Debe ser 'getAccessToken' para coincidir con equifaxAuth.js
const { getAccessToken } = require('./equifaxAuth'); 

// IMPORTACIÓN CORRECTA DE CONSTANTES
const { EQUIFAX_API_BASE_URL, EQUIFAX_PRODUCT_IDENTIFIER } = require('../utils/constants');

/**
 * Realiza una validación simple de identidad con Equifax.
 * @param {object} data - Datos de la persona para la validación (documentNumber, gender, fullName).
 * @returns {Promise<object>} La respuesta de la API de validación simple.
 * @throws {Error} Si falla la solicitud a la API.
 */
async function simpleValidation(data) {
  // Simular respuesta en el emulador
  if (process.env.FUNCTIONS_EMULATOR) {
    console.log("SIMULACIÓN EMULADOR: Equifax simpleValidation");
    return {
      code: 0, 
      message: "OK",
      errors: [],
      payload: { 
        idTransaccion: 'test-simple-id-simulated',
        transactionStateDescription: "TRANSACCION APROBADA",
        transactionStateCode: 1,
        validationTypeDescription: "SIMPLE",
        validationTypeCode: "SV",
        person: {
          iup: 12345,
          fullName: "TEST, SIMPLIFICADO",
          gender: data.gender,
          documentNumber: data.documentNumber
        },
        questionnaire: null,
        variables: null,
        notes: null
      }
    };
  }

  const token = await getAccessToken(); // Usamos getAccessToken
  try {
    const url = `${EQUIFAX_API_BASE_URL}/validation/simple?product=${EQUIFAX_PRODUCT_IDENTIFIER}`;
    console.log("DEBUG EQUIFAX API: URL para simpleValidation:", url);
    console.log("DEBUG EQUIFAX API: Data sent to simpleValidation:", JSON.stringify(data, null, 2));

    const response = await axios.post(url, data, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error("DETALLE COMPLETO DE ERROR DE AXIOS EN simpleValidation:");
    if (error.response) {
        console.error("Status de respuesta de Equifax (simpleValidation):", error.response.status);
        console.error("Datos de respuesta de Equifax (simpleValidation):", JSON.stringify(error.response.data, null, 2));
        console.error("Cabeceras de respuesta de Equifax (simpleValidation):", error.response.headers);
    } else if (error.request) {
        console.error("No hubo respuesta de Equifax (simpleValidation):", error.request);
    } else {
        console.error("Error al configurar la solicitud a Equifax (simpleValidation):", error.message);
    }
    throw new Error(`Fallo al realizar la validación simple: ${error.response?.data?.message || error.message || 'Error desconocido'}`);
  }
}

/**
 * Inicia una validación completa de identidad con Equifax, obteniendo las preguntas del cuestionario.
 * @param {object} data - Datos de la persona y el ID de configuración del cuestionario.
 * @returns {Promise<object>} La respuesta de la API de validación completa (con el cuestionario).
 * @throws {Error} Si falla la solicitud a la API.
 */
async function fullValidation(data) {
  console.log(`DEBUG: fullValidation - FUNCTIONS_EMULATOR is: ${process.env.FUNCTIONS_EMULATOR}`);
  // Simular respuesta en el emulador
  if (process.env.FUNCTIONS_EMULATOR) {
    console.log("SIMULACIÓN EMULADOR: Equifax fullValidation");
    return {
      code: 0, 
      message: "OK", 
      errors: [], 
      payload: {
        idTransaccion: 'test-transaction-id-simulated-123', 
        transactionStateDescription: "EN PROCESO", 
        transactionStateCode: 2, 
        validationTypeDescription: "COMPLETA",
        validationTypeCode: "FV",
        person: { 
          iup: 19984137,
          fullName: "FLORIDO, OSCAR ISIDRO",
          gender: "M",
          birthdate: "09/01/1968",
          documentType: "DNI",
          documentNumber: "20007481"
        },
        questionnaire: { 
          id: 8069933, 
          name: "Cuestionario de Prueba", 
          questionsOfGeneratedQuestionnaire: [ 
            {
              id: 1, 
              description: "(P) Has trabajado o vivido en",
              options: [ 
                { id: 1, description: "CORDOBA 150" },
                { id: 2, description: "BELGRANO 300" },
                { id: 3, description: "Ninguna de las anteriores" }
              ],
              selectedOptionId: null 
            },
            {
              id: 2,
              description: "(P) Indique el año de su último domicilio en",
              options: [
                { id: 1, description: "1990" },
                { id: 2, description: "2005" },
                { id: 3, description: "2018" },
                { id: 4, description: "Ninguna de las anteriores" }
              ],
              selectedOptionId: null
            }
          ],
          completed: false, 
          level: 1,
          state: 0
        },
        variables: null, 
        notes: null 
      }
    };
  }

  const token = await getAccessToken(); // Usamos getAccessToken
  try {
    const url = `${EQUIFAX_API_BASE_URL}/validation/full?product=${EQUIFAX_PRODUCT_IDENTIFIER}`;
    console.log("DEBUG EQUIFAX API: URL para fullValidation:", url);
    console.log("DEBUG EQUIFAX API: Data sent to fullValidation:", JSON.stringify(data, null, 2));

    const response = await axios.post(url, data, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error("DETALLE COMPLETO DE ERROR DE AXIOS EN fullValidation:");
    if (error.response) {
        console.error("Status de respuesta de Equifax (fullValidation):", error.response.status);
        console.error("Datos de respuesta de Equifax (fullValidation):", JSON.stringify(error.response.data, null, 2));
        console.error("Cabeceras de respuesta de Equifax (fullValidation):", error.response.headers);
    } else if (error.request) {
        console.error("No hubo respuesta de Equifax (fullValidation):", error.request);
    } else {
        console.error("Error al configurar la solicitud a Equifax (fullValidation):", error.message);
    }
    throw new Error(`Fallo al iniciar la validación completa: ${error.response?.data?.message || error.message || 'Error desconocido'}`);
  }
}

/**
 * Envía las respuestas a un cuestionario de validación completa a Equifax.
 * @param {object} data - Las respuestas del cuestionario y los IDs de transacción/cuestionario.
 * @returns {Promise<object>} La respuesta final de la validación completa.
 * @throws {Error} Si falla la solicitud a la API.
 */
async function answerQuestionnaire(data) {
  // Simular respuesta en el emulador (esto es para desarrollo local, no afecta la nube)
  if (process.env.FUNCTIONS_EMULATOR) {
    console.log("SIMULACIÓN EMULADOR: Equifax answerQuestionnaire");
    return {
      code: 0,
      message: "OK",
      errors: [],
      payload: {
        idTransaccion: data.idTransaction, // data.idTransaction viene del frontend
        transactionStateDescription: "TRANSACCION DESAPROBADA", // Simular que requiere 2do nivel
        transactionStateCode: 3, // O 2 (PENDING) si Equifax lo usa para este caso
        validationTypeDescription: "COMPLETA",
        validationTypeCode: "FV",
        person: { /* ... datos de persona simulados ... */ },
        score: 70, // Un puntaje que activaría el 2do nivel
        secondLevelQuestioning: true, // ¡Clave para la simulación!
        variables: null,
        notes: null,
        viewAlert: [{ textAlert: "Simulación: Requiere segundo nivel de cuestionario." }]
      }
    };
  }

  const token = await getAccessToken(); // Usamos getAccessToken

  try {
    const url = `${EQUIFAX_API_BASE_URL}/validation/questionnaire/answers?product=${EQUIFAX_PRODUCT_IDENTIFIER}`;
    
    // === ESTA ES LA CONSTRUCCIÓN DEL BODY QUE DEBE SER IGUAL A TU PRUEBA DE POSTMAN ===
    const equifaxBody = {
        idTransaction: data.idTransaction,          // ¡NOMBRE EXACTO Y EN EL LUGAR CORRECTO!
        idQuestionnaireGenerated: data.idQuestionnaireGenerated, // ¡NOMBRE EXACTO Y EN EL LUGAR CORRECTO!
        questionnaireResponse: data.questionnaireResponse 
    };
    // ==============================================================================================

    console.log("DEBUG EQUIFAX API: URL para answerQuestionnaire:", url);
    console.log("DEBUG EQUIFAX API: Payload FINAL enviado a Equifax:", JSON.stringify(equifaxBody, null, 2));


    const response = await axios.post(
      url,         // URL con el parámetro 'product'
      equifaxBody, // ¡Ahora el payload incluye los IDs de transacción y cuestionario con el nombre correcto!
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("DETALLE COMPLETO DE ERROR DE AXIOS EN answerQuestionnaire:");
    if (error.response) {
        console.error("Status de respuesta de Equifax (answerQuestionnaire):", error.response.status);
        console.error("Datos de respuesta de Equifax (answerQuestionnaire):", JSON.stringify(error.response.data, null, 2));
        console.error("Cabeceras de respuesta de Equifax (answerQuestionnaire):", error.response.headers);
    } else if (error.request) {
        console.error("No hubo respuesta de Equifax (answerQuestionnaire):", error.request);
    } else {
        console.error("Error al configurar la solicitud a Equifax (answerQuestionnaire):", error.message);
    }
    const equifaxErrorMessage = error.response?.data?.message || error.message || 'Error desconocido';
    throw new Error(`Fallo al enviar las respuestas del cuestionario: ${equifaxErrorMessage}`);
  }
}

/**
 * Obtiene las preguntas del cuestionario de segundo nivel de Equifax.
 * Este endpoint se utiliza cuando la validación inicial del cuestionario indica
 * que se requiere un segundo nivel (secondLevelQuestioning: true).
 * @param {object} params - Parámetros para la solicitud.
 * @param {string} params.questionnaireConfigurationId - ID de configuración del cuestionario (el mismo del primer nivel).
 * @param {string} params.transactionId - ID de la transacción de Equifax obtenida en la validación inicial.
 * @returns {Promise<object>} La respuesta de la API de Equifax con el nuevo cuestionario de segundo nivel.
 * @throws {Error} Si falla la solicitud a la API.
 */
async function getNextLevelQuestions({ questionnaireConfigurationId, transactionId }) {
    console.log(`DEBUG: getNextLevelQuestions - FUNCTIONS_EMULATOR is: ${process.env.FUNCTIONS_EMULATOR}`);
    // Simular respuesta en el emulador
    if (process.env.FUNCTIONS_EMULATOR) {
        console.log("SIMULACIÓN EMULADOR: Equifax getNextLevelQuestions");
        return {
            code: 0,
            message: "OK",
            errors: [],
            payload: {
                idTransaccion: transactionId,
                transactionStateDescription: "EN PROCESO - SEGUNDO NIVEL",
                transactionStateCode: 2,
                validationTypeDescription: "COMPLETA",
                validationTypeCode: "FV",
                person: { /* ... datos de persona simulados ... */ },
                questionnaire: {
                    id: 8069934, // ID diferente para el segundo cuestionario simulado
                    name: "Cuestionario de Prueba - Segundo Nivel",
                    questionsOfGeneratedQuestionnaire: [
                        {
                            id: 3,
                            description: "(2do NIVEL) Cuál fue tu último empleo?",
                            options: [
                                { id: 5, description: "Desarrollador" },
                                { id: 6, description: "Gerente" },
                                { id: 7, description: "Analista" }
                            ],
                            selectedOptionId: null
                        },
                        {
                            id: 4,
                            description: "(2do NIVEL) En qué año adquiriste tu primer vehículo?",
                            options: [
                                { id: 8, description: "2010" },
                                { id: 9, description: "2015" },
                                { id: 10, description: "Nunca tuve" }
                            ],
                            selectedOptionId: null
                        }
                    ],
                    completed: false,
                    state: 0,
                    level: 2 // Indica que es de segundo nivel
                },
                variables: null,
                notes: null
            }
        };
    }

    const token = await getAccessToken(); // Usamos getAccessToken
    try {
        const url = `${EQUIFAX_API_BASE_URL}/validation/nextlevelquestions?product=${EQUIFAX_PRODUCT_IDENTIFIER}`;
        const payload = {
            questionnaireConfigurationId,
            transactionId
        };

        console.log("DEBUG EQUIFAX API: URL para getNextLevelQuestions:", url);
        console.log("DEBUG EQUIFAX API: Payload FINAL enviado a getNextLevelQuestions:", JSON.stringify(payload, null, 2));

        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
        });
        return response.data;
    } catch (error) {
        console.error("DETALLE COMPLETO DE ERROR DE AXIOS EN getNextLevelQuestions:");
        if (error.response) {
            console.error("Status de respuesta de Equifax (getNextLevelQuestions):", error.response.status);
            console.error("Datos de respuesta de Equifax (getNextLevelQuestions):", JSON.stringify(error.response.data, null, 2));
            console.error("Cabeceras de respuesta de Equifax (getNextLevelQuestions):", error.response.headers);
        } else if (error.request) {
            console.error("No hubo respuesta de Equifax (getNextLevelQuestions):", error.request);
        } else {
            console.error("Error al configurar la solicitud a Equifax (getNextLevelQuestions):", error.message);
        }
        throw new Error(`Fallo al obtener el cuestionario de segundo nivel: ${error.response?.data?.message || error.message || 'Error desconocido'}`);
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
  // Simular respuesta en el emulador
  if (process.env.FUNCTIONS_EMULATOR) {
    console.log("SIMULACIÓN EMULADOR: Equifax listNames");
    return {
      code: 0,
      message: "OK",
      payload: ['Nombre Ejemplo 1', 'Nombre Ejemplo 2', 'Nombre Ejemplo 3']
    };
  }

  const token = await getAccessToken(); // Usamos getAccessToken
  try {
    const url = `${EQUIFAX_API_BASE_URL}/validation/list/name?product=${EQUIFAX_PRODUCT_IDENTIFIER}`;
    console.log("DEBUG EQUIFAX API: URL para listNames:", url);
    console.log("DEBUG EQUIFAX API: Data sent to listNames:", JSON.stringify({ documentNumber, gender }, null, 2));

    const response = await axios.post(url, { documentNumber, gender }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error("DETALLE COMPLETO DE ERROR DE AXIOS EN listNames:");
    if (error.response) {
        console.error("Status de respuesta de Equifax (listNames):", error.response.status);
        console.error("Datos de respuesta de Equifax (listNames):", JSON.stringify(error.response.data, null, 2));
        console.error("Cabeceras de respuesta de Equifax (listNames):", error.response.headers);
    } else if (error.request) {
        console.error("No hubo respuesta de Equifax (listNames):", error.request);
    } else {
        console.error("Error al configurar la solicitud a Equifax (listNames):", error.message);
    }
    throw new Error(`Fallo al listar nombres: ${error.response?.data?.message || error.message || 'Error desconocido'}`);
  }
}

/**
 * Permite verificar y validar el flujo de cada transacción. Es decir, si está validada o no.
 * @param {object} data - Datos para la verificación (documentNumber, gender, etc.).
 * @returns {Promise<object>} La respuesta de la API de verificación positiva.
 * @throws {Error} Si falla la solicitud a la API.
 */
async function checkPositiveValidation(data) {
  // Simular respuesta en el emulador
  if (process.env.FUNCTIONS_EMULATOR) {
    console.log("SIMULACIÓN EMULADOR: Equifax checkPositiveValidation");
    return {
      code: 0,
      message: "OK",
      payload: {
        code: 1,
        description: "Existe validacion POSITIVA para la persona indicada en el periodo (Simulado)"
      }
    };
  }

  const token = await getAccessToken(); // Usamos getAccessToken
  try {
    // CORRECCIÓN: La URL de checkPositiveValidation en tu Postman era '/validation/check/positive'
    const url = `${EQUIFAX_API_BASE_URL}/validation/check/positive?product=${EQUIFAX_PRODUCT_IDENTIFIER}`;
    console.log("DEBUG EQUIFAX API: URL para checkPositiveValidation:", url);
    console.log("DEBUG EQUIFAX API: Data sent to checkPositiveValidation:", JSON.stringify(data, null, 2));

    const response = await axios.post(url, data, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error("DETALLE COMPLETO DE ERROR DE AXIOS EN checkPositiveValidation:");
    if (error.response) {
        console.error("Status de respuesta de Equifax (checkPositiveValidation):", error.response.status);
        console.error("Datos de respuesta de Equifax (checkPositiveValidation):", JSON.stringify(error.response.data, null, 2));
        console.error("Cabeceras de respuesta de Equifax (checkPositiveValidation):", error.response.headers);
    } else if (error.request) {
        console.error("No hubo respuesta de Equifax (checkPositiveValidation):", error.request);
    } else {
        console.error("Error al configurar la solicitud a Equifax (checkPositiveValidation):", error.message);
    }
    throw new Error(`Fallo al verificar validación positiva: ${error.response?.data?.message || error.message || 'Error desconocido'}`);
  }
}

// EXPORTACIÓN FINAL DE TODAS LAS FUNCIONES
module.exports = {
  simpleValidation,
  fullValidation,
  answerQuestionnaire,
  getNextLevelQuestions, // ¡Añadido!
  listNames,
  checkPositiveValidation,
};
