// public/consulta.js

// Importa las instancias de Firebase y las funciones que necesitas desde firebaseClient.js
import { functions, httpsCallable, auth } from './firebaseClient.js'; // Importa 'auth' también

// Importa las funciones específicas del SDK modular de Firebase directamente de CDN
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';


// --- CLAVE PÚBLICA DE RECAPTCHA V3 ---
// DEBES reemplazar 'TU_CLAVE_PUBLICA_RECAPTCHA_SITE_KEY' con la clave de sitio (pública) real
// que obtuviste de la consola de Google reCAPTCHA para tu dominio.
// Esta clave es la misma que usas en el script de reCAPTCHA en el HTML y la misma que pasas a App Check.
const RECAPTCHA_SITE_KEY = 'TU_CLAVE_PUBLICA_RECAPTCHA_SITE_KEY';


// Elementos del DOM
const loadingScreen = document.getElementById('loadingScreen');
const consultButton = document.getElementById('consultButton');
const searchQueryInput = document.getElementById('searchQuery');
const resultDiv = document.getElementById('result');

// Función Callable para consultar el estado de validación
const consultarEstadoValidacionCallable = httpsCallable(functions, 'consultarEstadoValidacion');


// --- Funciones de Utilidad ---
function displayError(message) {
  resultDiv.innerHTML = `<div class="error-message-display">${message}</div>`;
  resultDiv.style.display = 'block';
}

function createDetailItem(label, value) {
    if (value && value !== 'N/A' && value !== '') {
        return `<div class="detail-item"><strong>${label}:</strong> <span>${value}</span></div>`;
    }
    return '';
}

// --- Lógica principal de consulta ---
async function consultarEstadoValidacion(searchQuery) {
  try {
    loadingScreen.style.display = 'flex';
    resultDiv.innerHTML = '';
    resultDiv.style.display = 'none';

    // Determinar si estamos en desarrollo local (para App Check debug token)
    const IS_LOCAL_DEV = window.location.hostname === "localhost" || window.location.hostname.startsWith("127.0.0.1");

    let recaptchaToken = null;
    if (!IS_LOCAL_DEV) {
         // Generamos reCAPTCHA si NO estamos en modo de desarrollo,
         // ya que App Check en desarrollo usa el token de depuración.
         // Asegúrate de que grecaptcha esté cargado por el script en el HTML.
         await new Promise(resolve => grecaptcha.ready(resolve));
         recaptchaToken = await grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: 'consulta' });
         console.log('Token reCAPTCHA v3 generado:', recaptchaToken);
    } else {
        console.log("Modo de desarrollo: Omitiendo generación de reCAPTCHA token en el cliente. Se confía en el token de depuración de App Check.");
    }

    console.log('Enviando solicitud para searchQuery:', searchQuery);

    const payload = { searchQuery };
    if (recaptchaToken) {
        payload.recaptchaToken = recaptchaToken;
    }

    const result = await consultarEstadoValidacionCallable(payload);
    const data = result.data;

    console.log('Datos recibidos:', data);
    loadingScreen.style.display = 'none';

    if (data.tipoUsuario !== 'propietario') {
        displayError('Esta página está diseñada solo para consultas de validaciones de **Propietarios**. El ID ingresado corresponde a un Inquilino o un tipo de usuario no soportado aquí.');
        return;
    }

    let specificDetailsHtml = '';
    specificDetailsHtml += createDetailItem('Email de Contacto', data.datosIdentidad.emailContacto);
    specificDetailsHtml += createDetailItem('Teléfono de Contacto', data.datosIdentidad.telefonoContacto);
    specificDetailsHtml += createDetailItem('Domicilio', data.datosIdentidad.direccion);
    specificDetailsHtml += createDetailItem('Localidad', data.datosIdentidad.localidad);
    specificDetailsHtml += createDetailItem('País', data.datosIdentidad.pais);
    specificDetailsHtml += createDetailItem('Razón Social', data.datosIdentidad.razonSocial);
    specificDetailsHtml += createDetailItem('Titular o Responsable', data.datosIdentidad.titular);
    specificDetailsHtml += createDetailItem('Tipo ID Fiscal', data.datosIdentidad.identificacionFiscalTipo);
    specificDetailsHtml += createDetailItem('Número ID Fiscal', data.datosIdentidad.identificacionFiscalNumero);
    specificDetailsHtml += createDetailItem('Página Web', data.datosIdentidad.paginaWeb);
    specificDetailsHtml += createDetailItem('Alias Bancario', data.datosIdentidad.alias);
    specificDetailsHtml += createDetailItem('Habilitación Municipal', data.datosIdentidad.habilitacionMunicipal);

    const activeClass = data.isValidationActive ? 'status-active' : 'status-inactive';
    const activeText = data.isValidationActive ? 'Activa' : 'Inactiva';

    resultDiv.innerHTML = `
          <div class="result-card">
            <div class="header-section">
              <h2>Resultado de Validación</h2>
              <span class="status-badge ${activeClass}">${activeText}</span>
            </div>
            <div class="info-section">
              <h3>Información General</h3>
              ${createDetailItem('ID de Validación', data.searchId)}
              ${createDetailItem('Mensaje', data.message)}
            </div>
            <div class="info-section">
              <h3>Detalles de la Entidad</h3>
              ${specificDetailsHtml}
            </div>
            ${!data.isValidationActive && data.fechaVencimiento ? `
              <div class="info-section status-inactive-details">
                <h3>Estado de la Validación</h3>
                <p>Esta validación ha vencido el ${data.fechaVencimiento.toDate().toLocaleDateString()}.</p>
                ${createDetailItem('Estado interno', data.estadoValidacion)}
                ${createDetailItem('Tipo de entidad', data.tipoUsuario)}
              </div>
            ` : ''}
          </div>
        `;
    resultDiv.style.display = 'block';
  } catch (error) {
    loadingScreen.style.display = 'none';
    let errorMessage = 'Ocurrió un error desconocido.';
    if (error.code) {
      if (error.code === 'not-found') {
        errorMessage = 'No se encontró una validación con el ID proporcionado.';
      } else if (error.code === 'invalid-argument') {
        errorMessage = 'El ID de validación es inválido. ' + (error.message || '');
      } else if (error.code === 'permission-denied') {
        errorMessage = 'No tiene permisos para ver esta validación.';
      } else if (error.code === 'internal') {
        errorMessage = `Error interno del servidor: ${error.message}.`;
      } else if (error.code === 'unauthenticated' && error.message === 'Token reCAPTCHA no proporcionado.') {
        errorMessage = 'Error de seguridad: Falta la verificación CAPTCHA. Recargue la página e inténtelo de nuevo.';
      } else if (error.code === 'resource-exhausted' || error.code === 'too-many-requests') {
        errorMessage = error.message;
      } else {
         errorMessage = `Error: ${error.code} - ${error.message}`;
      }
    } else {
      errorMessage = `Error inesperado: ${error.toString()}`;
    }
    displayError(errorMessage);
    console.error('Error completo:', error);
  }
}

// --- Event Listener ---
consultButton.addEventListener('click', async () => {
  const searchQuery = searchQueryInput.value.trim();
  if (searchQuery) {
    await consultarEstadoValidacion(searchQuery);
  } else {
    displayError('Por favor, ingrese un ID de validación.');
  }
});

// Opcional: Manejar el estado de autenticación (si la página requiere que el usuario esté logueado)
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("Usuario autenticado en consulta.html:", user.email);
    // Aquí puedes añadir lógica si solo usuarios logueados pueden consultar
  } else {
    console.log("Ningún usuario autenticado en consulta.html.");
    // Aquí puedes añadir lógica si la consulta es solo para usuarios anónimos o logueados.
  }
});
