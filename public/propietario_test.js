// public/propietario_test.js

// Importa las instancias de Firebase que necesitas desde firebaseClient.js
import { functions, httpsCallable } from './firebaseClient.js';

// --- CLAVE PÚBLICA DE RECAPTCHA ENTERPRISE/v3 ---
// DEBES reemplazar 'TU_CLAVE_PUBLICA_RECAPTCHA_ENTERPRISE' con la clave de sitio (pública) real
// que obtuviste de la consola de Google reCAPTCHA. Esta clave se usa si llamas a grecaptcha.enterprise.execute()
// directamente en esta página. Asegúrate de que esta clave coincide con la que usas
// en el script de reCAPTCHA en el HTML y la misma que pasas a App Check en firebaseClient.js
const RECAPTCHA_SITE_KEY = "TU_CLAVE_PUBLICA_RECAPTCHA_ENTERPRISE"; // Puedes cambiar el nombre de la variable si lo deseas


// Definición de la Cloud Function Callable
const crearNuevaValidacionCallable = httpsCallable(functions, 'crearNuevaValidacion');

// Referencias a elementos del DOM
const resultsDiv = document.getElementById('results');
const validationForm = document.getElementById('validationForm');
const createButton = document.getElementById('createButton');

const emailContactoPropietarioInput = document.getElementById('emailContactoPropietario');
// NUEVO: Referencia al campo de confirmación de email
const confirmEmailContactoPropietarioInput = document.getElementById('confirmEmailContactoPropietario');
const passwordPropietarioInput = document.getElementById('passwordPropietario');
const confirmPasswordPropietarioInput = document.getElementById('confirmPasswordPropietario');



// Función auxiliar para mostrar resultados
function displayResult(message, isError = false, targetDiv = resultsDiv) {
    targetDiv.textContent = message;
    targetDiv.style.backgroundColor = isError ? '#ffe6e6' : '#e6ffe6';
    targetDiv.className = isError ? 'results error-message' : 'results';
}

// --- FUNCIÓN DE VALIDACIÓN DE COMPLEJIDAD DE CONTRASEÑA ---
function validatePasswordComplexity(password) {
    const minLength = 8;
    if (password.length < minLength) {
        return `La contraseña debe tener al menos ${minLength} caracteres.`;
    }

    let strength = 0;
    // Al menos una minúscula
    if (/[a-z]/.test(password)) strength++;
    // Al menos una mayúscula
    if (/[A-Z]/.test(password)) strength++;
    // Al menos un número
    if (/[0-9]/.test(password)) strength++;
    // Al menos un caracter especial
    if (/[^A-Za-z0-9]/.test(password)) strength++; // Cualquier cosa que no sea letra o número

    if (strength < 3) {
        return "La contraseña debe contener caracteres de al menos 3 de las 4 categorías: minúsculas, mayúsculas, números, símbolos.";
    }

    return null; // Si no hay errores, retorna null
}
// --- FIN FUNCIÓN ---

// Event listener para el envío del formulario
validationForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    resultsDiv.textContent = 'Procesando solicitud...';
    resultsDiv.style.backgroundColor = '#e9e9e9';
    resultsDiv.className = 'results';

    // Obtener valores de los campos
    const email = emailContactoPropietarioInput.value;
    // NUEVO: Obtener el valor del campo de confirmación de email
    const emailConfirmation = confirmEmailContactoPropietarioInput.value; 
    const password = passwordPropietarioInput.value;
    const confirmPassword = confirmPasswordPropietarioInput.value;

    let currentSearchId = document.getElementById('searchIdPropietario').value.trim();
    const tipoUsuario = 'propietario';

    // --- Validación de email y contraseñas en el cliente ---
    if (!email) {
        displayResult('Error: El email de contacto es obligatorio.', true);
        return;
    }
    // NUEVO: Validación del campo de confirmación de email
    if (!emailConfirmation) {
        displayResult('Error: Debe confirmar el email de contacto.', true);
        return;
    }
    if (email !== emailConfirmation) {
        displayResult('Error: Los emails de contacto no coinciden.', true);
        return;
    }

    if (password !== confirmPassword) {
        displayResult('Error: Las contraseñas no coinciden.', true);
        return;
    }

    // APLICAR VALIDACIÓN DE COMPLEJIDAD
    const passwordError = validatePasswordComplexity(password);
    if (passwordError) {
        displayResult(`Error de contraseña: ${passwordError}`, true);
        return;
    }
    // --- Fin Validación ---

    createButton.disabled = true;
    createButton.textContent = 'Creando...';

    try {
        // Determinar si estamos en un entorno de desarrollo local (para App Check debug token)
        const IS_LOCAL_DEV = window.location.hostname === "localhost" || window.location.hostname.startsWith("127.0.0.1");

        let recaptchaToken = null;
        // Si usas reCAPTCHA Enterprise directamente para esta acción
        // y no estás en desarrollo local.
        if (!IS_LOCAL_DEV && typeof grecaptcha !== 'undefined' && typeof grecaptcha.enterprise !== 'undefined') {
            try {
                // Ejecuta reCAPTCHA Enterprise para obtener un token de verificación.
                recaptchaToken = await grecaptcha.enterprise.execute(RECAPTCHA_SITE_KEY, { action: 'crear_validacion' });
                console.log("reCAPTCHA Enterprise Token generado:", recaptchaToken);
            } catch (e) {
                console.error("Error al generar el token de reCAPTCHA Enterprise:", e);
                displayResult("Error de seguridad (reCAPTCHA). Intente de nuevo.", true);
                createButton.disabled = false;
                createButton.textContent = 'Crear Nueva Validación';
                return;
            }
        } else if (IS_LOCAL_DEV) {
            console.log("Modo de desarrollo: Omitiendo generación de reCAPTCHA token en el cliente.");
        } else {
            console.warn("reCAPTCHA Enterprise no está disponible o la clave no está configurada para producción.");
        }

        const dataToSend = {
            searchId: currentSearchId,
            tipoUsuario: tipoUsuario,
            password: password,
            datosIdentidad: {
                pais: document.getElementById('paisPropietario').value,
                localidad: document.getElementById('localidadPropietario').value,
                direccion: document.getElementById('direccionPropietario').value,
                titular: document.getElementById('titularPropietario').value,
                razonSocial: document.getElementById('razonSocialPropietario').value,
                identificacionFiscalTipo: document.getElementById('identificacionFiscalTipoPropietario').value,
                identificacionFiscalNumero: document.getElementById('identificacionFiscalNumeroPropietario').value,
                emailContacto: email,
                telefonoContacto: document.getElementById('telefonoContactoPropietario').value,
                paginaWeb: document.getElementById('paginaWebPropietario').value || '',
                alias: document.getElementById('aliasBancarioPropietario').value || '',
                habilitacionMunicipal: document.getElementById('habilitacionMunicipalPropietario').value || '',
            }
        };

        // Si se generó un token reCAPTCHA, añádelo al payload
        if (recaptchaToken) {
            dataToSend.recaptchaToken = recaptchaToken;
        }

        console.log("--- Depuración Frontend ---");
        console.log("Objeto dataToSend que se enviará a Cloud Function:", dataToSend);
        console.log("--- Fin Depuración Frontend ---");

        const result = await crearNuevaValidacionCallable(dataToSend);

        console.log("Respuesta completa de la Cloud Function:", result);

        const responseData = result.data;
        const successMessage = `¡Éxito! ${responseData.mensaje}\nID de Validación: ${responseData.id}\nID Interno: ${responseData.internalId}`;
        displayResult(successMessage);

        passwordPropietarioInput.value = "";
        confirmPasswordPropietarioInput.value = "";

    } catch (error) {
        console.error("Error completo al procesar la validación:", error);
        let errorMessage = 'Ocurrió un error desconocido.';

        if (error.code) {
            errorMessage = `Error: ${error.code} - ${error.message}`;
            if (error.code === 'already-exists') {
                errorMessage = 'Error: Este ID de validación ya existe. Por favor, utiliza otro.';
            } else if (error.code === 'email-already-in-use') {
                errorMessage = 'Error: Este email ya está registrado. Por favor, intente con otro o inicie sesión.';
            } else if (error.code === 'invalid-email') {
                errorMessage = 'Error: El formato del email es inválido.';
            } else if (error.code === 'weak-password') {
                errorMessage = 'Error: La contraseña es demasiado débil (mínimo 6 caracteres).'; // Este error viene de Firebase Auth
            } else if (error.code === 'invalid-argument') {
                errorMessage = `Error de argumento: ${error.message}`;
            } else if (error.code === 'permission-denied') {
                errorMessage = `Error de permisos: ${error.message}`;
            }
        } else {
            errorMessage = `Error inesperado: ${error.toString()}`;
        }
        displayResult('Error en Creación de Propietario:\n' + errorMessage, true);
    } finally {
        createButton.disabled = false;
        createButton.textContent = 'Crear Nueva Validación';
    }
});
