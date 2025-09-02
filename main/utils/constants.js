// main/utils/constants.js

const EQUIFAX_AUTH_URL = "https://api.qa.latam.equifax.com/v2/oauth/token";
// [PRODUCCIÓN: ¡ATENCIÓN!] Asegúrate de que esta URL sea la correcta para tu entorno (sandbox/uat/prod)
const EQUIFAX_API_BASE_URL = "https://api.qa.latam.equifax.com/ifctribe-idv"; 
// El valor que identificamos para el parámetro 'product'
const EQUIFAX_PRODUCT_IDENTIFIER = "IDCLFULL"; 

// [PRODUCCIÓN: ¡ATENCIÓN!] Si tienes IDs de cuestionario predefinidos, definelos aquí.
// Esto es un placeholder, debes obtener el ID real de Equifax para tu configuración de cuestionario.
const DEFAULT_PROPIETARIO_QUESTIONNAIRE_ID = "tu_id_de_cuestionario_propietario";

module.exports = {
  EQUIFAX_AUTH_URL,
  EQUIFAX_API_BASE_URL,
  EQUIFAX_PRODUCT_IDENTIFIER,
  DEFAULT_PROPIETARIO_QUESTIONNAIRE_ID,
};
