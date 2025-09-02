// public/inquilino_test.js

// Importa las instancias de Firebase que necesitas desde firebaseClient.js
import { functions, httpsCallable } from './firebaseClient.js';

// No hay funciones específicas de Auth o Firestore necesarias aquí
// más allá de las que ya vienen con 'functions' y 'httpsCallable'.


// >>>>> MODIFICACIÓN CLAVE AQUÍ: httpsCallable está en 'functions' <<<<<
const crearNuevaValidacionCallable = httpsCallable(functions, 'crearNuevaValidacion');
// >>>>> FIN MODIFICACIÓN CLAVE <<<<<

const resultsDiv = document.getElementById('results');

function displayResult(message, isError = false, targetDiv = resultsDiv) {
    targetDiv.textContent = message;
    targetDiv.style.backgroundColor = isError ? '#ffe6e6' : '#e6ffe6';
}

document.getElementById('validationForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    resultsDiv.textContent = 'Enviando solicitud de creación...';
    resultsDiv.style.backgroundColor = '#e9e9e9';

    let currentSearchId = document.getElementById('searchIdInquilino').value;
    const tipoUsuario = 'inquilino';

    const dataToSend = {
        searchId: currentSearchId, // Este será el ID base, la Cloud Function le agregará el DNI
        tipoUsuario: tipoUsuario,
        datosIdentidad: {
            pais: document.getElementById('paisInquilino').value,
            localidad: document.getElementById('localidadInquilino').value,
            direccion: document.getElementById('domicilioInquilino').value,
            titular: document.getElementById('nombreInquilino').value,
            identificacionFiscalTipo: 'DNI',
            // El DNI es crucial para construir el searchId final en el backend
            identificacionFiscalNumero: document.getElementById('dniInquilino').value,
            emailContacto: document.getElementById('emailInquilino').value,
            telefonoContacto: document.getElementById('telefonoInquilino').value,
        }
    };

    try {
        const result = await crearNuevaValidacionCallable(dataToSend);

        if (result.data) {
            // Si la función backend devuelve un objeto con id, mensaje u otros datos
            if (result.data.id) {
                // El ID devuelto ahora será el completo (ID_BASE-DNI)
                displayResult(`¡Éxito! Validación creada con ID: ${result.data.id}\nMensaje: ${result.data.mensaje || 'Operación exitosa'}`);
            } else {
                // Si no viene ID pero hay otros datos
                displayResult(`¡Éxito! Validación creada:\n${JSON.stringify(result.data, null, 2)}`);
            }
        } else {
            displayResult('¡Éxito! La solicitud fue procesada, pero no se recibió información adicional.');
        }

        // Limpiar campo ID visible al usuario
        document.getElementById('searchIdInquilino').value = "";
    } catch (error) {
        console.error("Error al llamar a la función crearNuevaValidacion (Inquilino):", error);
        let errorMessage = 'Ocurrió un error desconocido.';
        if (error.code && error.message) {
            errorMessage = `Error de Firebase Functions: ${error.code} - ${error.message}`;
        } else {
            errorMessage = `Error inesperado: ${error.toString()}`;
        }
        displayResult('Error en Creación de Inquilino:\n' + errorMessage, true);
    }
});
