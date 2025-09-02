// main/equifaxAuth.js

const functions = require('firebase-functions');
const axios = require('axios');
const { EQUIFAX_AUTH_URL } = require('./utils/constants');

// Caché en memoria para el token
let cachedToken = null;
let tokenExpiryTime = 0; // Timestamp en milisegundos cuando el token expira

/**
 * Obtiene un token de acceso válido para la API de Equifax.
 * Reutiliza el token si aún no ha expirado, de lo contrario, solicita uno nuevo.
 * @returns {Promise<string>} El token de acceso.
 * @throws {Error} Si falla la obtención del token.
 */
async function getAccessToken() {
  const currentTime = Date.now();

  // Si tenemos un token en caché y no ha expirado (damos un margen de 5 segundos)
  if (cachedToken && tokenExpiryTime > currentTime + 5000) {
    functions.logger.info("Usando token de Equifax en caché.");
    return cachedToken;
  }

  // Las credenciales deben ser configuradas como variables de entorno de Cloud Functions
  // Usar funciones.config() para acceder a las variables configuradas con firebase functions:config:set
  const clientId = functions.config().equifax?.client_id;
  const clientSecret = functions.config().equifax?.client_secret;

  if (!clientId || !clientSecret) {
    throw new Error("Credenciales de la API de Equifax no configuradas. Por favor, corre 'firebase functions:config:set equifax.client_id=\"TU_CLIENT_ID\" equifax.client_secret=\"TU_CLIENT_SECRET\"'");
  }

  const authData = new URLSearchParams();
  authData.append('scope', 'https://api.latam.equifax.com/ifctribe-idv'); // Asegúrate que el scope sea el correcto
  authData.append('grant_type', 'client_credentials');

  try {
    const response = await axios.post(EQUIFAX_AUTH_URL, authData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const { access_token, expires_in } = response.data;
    cachedToken = access_token;
    tokenExpiryTime = currentTime + (expires_in * 1000); // Convertir segundos a milisegundos

    functions.logger.info("Token de acceso de Equifax obtenido exitosamente.");
    return access_token;

  } catch (error) {
    functions.logger.error("Error al obtener el token de acceso de Equifax:", error.response?.data || error.message);
    // Considerar un manejo de errores más sofisticado, como reintentos.
    throw new Error("Fallo al obtener el token de acceso de Equifax.");
  }
}

module.exports = {
  getAccessToken,
};
