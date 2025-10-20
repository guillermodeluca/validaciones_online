// public/index.js

// Importa solo lo esencial si es que se necesita alguna funcionalidad de Firebase,
// aunque para una redirección directa no sería estrictamente necesario importar 'auth'.
// Sin embargo, lo mantendremos por si 'firebaseClient.js' tiene algún efecto secundario necesario.
import { auth } from './firebaseClient.js';
// No necesitamos 'onAuthStateChanged' para una redirección directa.

// *********************************************************************************
// * LÓGICA DE REDIRECCIÓN DIRECTA (PROVISIONAL - SIN LOGUEO)                      *
// *********************************************************************************

// Esta función se ejecutará tan pronto como el script se cargue.
function redirectToValidationPage() {
    // Verifica si ya estamos en la página de validación para evitar bucles.
    if (window.location.pathname !== '/ingresoAValidacion.html' && window.location.pathname !== '/ingresar-datos-equifax.html') {
        console.log("Redirigiendo a /ingresoAValidacion.html para prueba sin logueo...");
        window.location.href = '/ingresoAValidacion.html';
    } else {
        console.log("Ya estamos en una página de validación.");
    }
}

// Llama a la función de redirección cuando el DOM esté completamente cargado.
document.addEventListener('DOMContentLoaded', redirectToValidationPage);

// NOTA IMPORTANTE:
// Esta versión de index.js OMITE por completo la lógica de login, registro,
// y la gestión de la sesión de usuario. Su único propósito es redirigir
// para facilitar la prueba de tu flujo de validación con Equifax.
// Deberás restaurar tu index.js original una vez que hayas terminado con las pruebas.
