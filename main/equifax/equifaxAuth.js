// main/equifax/equifaxAuth.js
const axios = require('axios');
const { defineSecret } = require('firebase-functions/params');

// Define los secretos que usarás para Equifax.
const EQUIFAX_CLIENT_ID_SECRET = defineSecret("EQUIFAX_CLIENT_ID");
const EQUIFAX_CLIENT_SECRET_SECRET = defineSecret("EQUIFAX_CLIENT_SECRET");

const { EQUIFAX_AUTH_URL } = require('../utils/constants');

let cachedAccessToken = null;
let tokenExpiryTime = 0;

async function getAccessToken() {
  const currentTime = Date.now();

  // Cambiado: Usa 5 minutos (300,000 ms) como umbral para refrescar el token
  // Si el token expira en menos de 5 minutos, lo refrescamos
  if (cachedAccessToken && (tokenExpiryTime - currentTime > 5 * 60 * 1000)) {
    console.log("DEBUG: Usando token de acceso de Equifax cacheado.");
    return cachedAccessToken;
  }

  // Acceder a los valores de los secretos desde Secret Manager
  const clientId = EQUIFAX_CLIENT_ID_SECRET.value();
  const clientSecret = EQUIFAX_CLIENT_SECRET_SECRET.value();

  if (!clientId || !clientSecret) {
    console.error("Credenciales de la API de Equifax (Client ID/Secret) no disponibles. Asegúrese de que estén configuradas en Secret Manager (producción) o en .env.secret (emulador).");
    throw new Error("Credenciales de Equifax no configuradas o no disponibles.");
  }

  const authData = new URLSearchParams();
  authData.append('scope', 'https://api.latam.equifax.com/ifctribe-idv');
  authData.append('grant_type', 'client_credentials');

  // --- NUEVOS LOGS DE DEPURACIÓN CRÍTICOS AQUI ---
  console.log(`DEBUG: EQUIFAX_AUTH_URL: ${EQUIFAX_AUTH_URL}`);
  console.log(`DEBUG: Token Request Body (raw): ${authData.toString()}`);
  
  const authString = `${clientId}:${clientSecret}`;
  // NOTA: truncated para evitar loggear el secret completo en texto plano.
  // Solo se loguean los primeros 5 caracteres de client_id.
  console.log(`DEBUG: Basic Auth String (truncated client_id:client_secret): ${authString.substring(0, 5)}...`); 
  
  const encodedAuth = Buffer.from(authString).toString('base64');
  console.log(`DEBUG: Basic Auth Encoded: ${encodedAuth}`);
  // --- FIN NUEVOS LOGS ---

  try {
    const response = await axios.post(EQUIFAX_AUTH_URL, authData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${encodedAuth}`, // Asegúrate de que no haya un espacio extra aquí
      },
    });

    const { access_token, expires_in } = response.data;
    cachedAccessToken = access_token;
    // Calcula el tiempo de expiración real para el caché
    tokenExpiryTime = currentTime + (expires_in * 1000);

    console.log("Token de acceso de Equifax obtenido exitosamente.");
    console.log("DEBUG: Access Token:", cachedAccessToken ? "Obtenido" : "No Obtenido"); // Evitar loggear el token real
    console.log("DEBUG: Expires In:", expires_in);
    return access_token;

  } catch (error) {
    console.error("Error al obtener el token de acceso de Equifax (detallado):");
    if (error.response) {
        console.error("Status de respuesta de Equifax:", error.response.status);
        console.error("Datos de respuesta de Equifax:", JSON.stringify(error.response.data, null, 2)); // Stringify para mejor visualización
        console.error("Cabeceras de respuesta de Equifax:", error.response.headers);
    } else if (error.request) {
        console.error("No hubo respuesta de Equifax (no hay 'response.data'):", error.request);
    } else {
        console.error("Error al configurar la solicitud a Equifax (sin 'response' ni 'request'):", error.message);
    }

    if (error.response?.data?.error === 'invalid_request' && error.response?.data?.error_description === 'Missing Mandatory Parameters') {
        console.error("Posible error de autenticación Basic. Verifica client_id/client_secret o su formato.");
    } else if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error('Credenciales de Equifax inválidas o acceso denegado.');
    } else if (error.response?.status) {
      throw new Error(`Error de red con Equifax (HTTP ${error.response.status}).`);
    }
    throw new Error("Fallo general al obtener el token de acceso de Equifax.");
  }
}

module.exports = {
  getAccessToken,
  EQUIFAX_CLIENT_ID_SECRET,
  EQUIFAX_CLIENT_SECRET_SECRET
};
