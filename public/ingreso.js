// public/ingreso.js

// Importa las instancias de Firebase que necesitas desde firebaseClient.js
import { auth, db, functions, httpsCallable } from './firebaseClient.js';

// Importa las funciones específicas del SDK modular de Firebase Auth directamente de CDN
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    getIdToken,
    signInWithCustomToken 
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';

// Importa las funciones específicas del SDK modular de Firebase Firestore directamente de CDN
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
    collection, // <--- ¡CORREGIDO: Añadida importación de 'collection'!
    query, // Para consultas complejas
    where, // Para condiciones de consulta
    getDocs // Para obtener múltiples documentos
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';


// Referencias a las funciones "callable" de Cloud Functions.
const authenticateAndMintTokenCallable = httpsCallable(functions, "authenticateAndMintToken");
const consultarEstadoValidacionCallable = httpsCallable(functions, "consultarEstadoValidacion");
const deactivateValidationCallable = httpsCallable(functions, "deactivateValidation"); // Función para desactivar validación

// Referencias a elementos HTML para manipular el DOM.
const authStatusDiv = document.getElementById("auth-status");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");

// Elementos de la sección de Gestión de Mi Validación de Propietario
const ownerValidationManagementSection = document.getElementById("owner-validation-management-section");
const ownerValidationStatusDiv = document.getElementById("owner-validation-status");
const deactivateOwnerValidationButton = document.getElementById("deactivateOwnerValidationButton"); // NUEVO: Botón para baja de propietario

// Elementos de la sección de Consulta de Inquilinos
const tenantCodeInput = document.getElementById("tenantCodeInput");
const queryTenantButton = document.getElementById("queryTenantButton");
const tenantResultsDiv = document.getElementById("tenant-results");
const tenantErrorMessage = document.getElementById("tenant-error-message");
const tenantQuerySection = document.getElementById("tenant-query-section");


// Variable global para almacenar el ID del documento de la validación del PROPIETARIO actualmente activa
let ownerActiveValidationDocId = null;

// Función auxiliar para mostrar mensajes de éxito o error en la interfaz.
// NOTA: Esta función se usa para mostrar resultados en la sección de inquilinos.
function displayResult(message, isError = false, targetDiv = tenantResultsDiv) {
    if (targetDiv === tenantErrorMessage) {
        tenantResultsDiv.classList.add("hidden");
        tenantResultsDiv.textContent = "";
    } else if (targetDiv === tenantResultsDiv) {
        tenantErrorMessage.textContent = "";
    }

    targetDiv.innerHTML = message;
    targetDiv.style.backgroundColor = isError ? "#ffe6e6" : "#e6ffe6";
    targetDiv.classList.toggle("hidden", !message);
}

// Función auxiliar para enmascarar números de DNI (o similar).
function maskDNI(dni) {
    if (!dni) return 'N/A';
    const dniStr = String(dni);
    const len = dniStr.length;
    if (len < 4) return dniStr;
    return '*'.repeat(len - 4) + dniStr.slice(-4);
}

/**
 * Función para buscar y mostrar el estado de la validación activa del propietario logueado.
 * Si la encuentra, habilita el botón de baja para su propia validación.
 * Se llama al iniciar sesión como propietario.
 */
async function loadOwnerValidationStatus(userUid) {
    ownerValidationStatusDiv.textContent = "Buscando su validación activa...";
    deactivateOwnerValidationButton.classList.add("hidden"); // Ocultar por defecto

    try {
        // Query para encontrar la validación del propietario
        const q = query(
            collection(db, "validaciones"), // <--- ¡CORREGIDO: Uso de la función 'collection'!
            where("ownerUid", "==", userUid),
            where("tipoUsuario", "==", "propietario"),
            where("isValidationActive", "==", true) // Solo validaciones activas
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            // Se encontró al menos una validación activa del propietario.
            // Tomamos la primera, asumiendo que solo debería haber una activa por UID en este contexto.
            const ownerValidationDoc = querySnapshot.docs[0];
            ownerActiveValidationDocId = ownerValidationDoc.id; // Almacenamos el ID

            const validationData = ownerValidationDoc.data();
            const vencimiento = validationData.fechaVencimiento ? validationData.fechaVencimiento.toDate().toLocaleDateString() : 'N/A';
            
            ownerValidationStatusDiv.innerHTML = `
                <p>Su validación está <strong>ACTIVA</strong>.</p>
                <p>ID: <code>${ownerActiveValidationDocId}</code></p>
                <p>Vence el: ${vencimiento}</p>
                <p>Puede darla de baja para actualizar sus datos.</p>
            `;
            deactivateOwnerValidationButton.classList.remove("hidden"); // Mostrar el botón
        } else {
            // No se encontró una validación activa para este propietario.
            ownerValidationStatusDiv.innerHTML = `
                <p>No se encontró ninguna validación <strong>ACTIVA</strong> para su cuenta.</p>
                <p>Por favor, complete el proceso de creación de su validación.</p>
            `;
            deactivateOwnerValidationButton.classList.add("hidden"); // Asegurar que el botón esté oculto
        }
    } catch (error) {
        console.error("Error al cargar el estado de la validación del propietario:", error);
        ownerValidationStatusDiv.textContent = "Error al cargar el estado de su validación.";
        deactivateOwnerValidationButton.classList.add("hidden");
    }
}


// Manejador del estado de autenticación de Firebase.
// Se dispara cada vez que el estado de autenticación del usuario cambia (login, logout).
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("Usuario autenticado:", user.email, "UID:", user.uid);
        authStatusDiv.textContent = `Autenticado como: ${user.email} (UID: ${user.uid})`;
        loginButton.classList.add("hidden");
        logoutButton.classList.remove("hidden");

        try {
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);

            let userRole = "guest"; // Por defecto, si no se encuentra.
            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                userRole = userData.role || "guest";
                authStatusDiv.textContent += ` - Rol: ${userRole}`;
            } else {
                // Si el usuario no tiene un documento en Firestore, lo crea con rol 'guest'.
                await setDoc(doc(db, "users", user.uid),
                    {
                        email: user.email,
                        role: "guest", // Asignar guest por defecto. Solo la función de registro puede asignar propietario.
                        createdAt: serverTimestamp(),
                    },
                    { merge: true }
                );
                authStatusDiv.textContent += ` - Rol: guest (recién asignado)`;
            }

            // Si es un propietario, muestra las secciones relevantes y carga su estado de validación
            if (userRole === "propietario") {
                tenantQuerySection.classList.remove("hidden"); // Sección de consulta de inquilinos
                ownerValidationManagementSection.classList.remove("hidden"); // NUEVO: Sección de gestión de propietario
                await loadOwnerValidationStatus(user.uid); // <--- ¡Esto hace que aparezca el botón si hay validación activa!
            } else {
                // Si no es propietario (o es admin), ocultar las secciones de propietario e inquilino
                tenantQuerySection.classList.add("hidden");
                ownerValidationManagementSection.classList.add("hidden");
                // Puedes añadir un mensaje específico para no-propietarios si lo deseas
                // displayResult("Solo los propietarios pueden usar esta sección.", true, tenantErrorMessage);
            }

        } catch (error) {
            console.error("Error al leer el rol del usuario de Firestore:", error);
            authStatusDiv.textContent += ` - Error al cargar rol.`;
            tenantQuerySection.classList.add("hidden");
            ownerValidationManagementSection.classList.add("hidden");
        }
    } else {
        // No hay usuario autenticado. Ocultar todas las secciones.
        console.log("No hay usuario autenticado");
        authStatusDiv.textContent = `Estado: No autenticado`;
        loginButton.classList.remove("hidden");
        logoutButton.classList.add("hidden");
        tenantQuerySection.classList.add("hidden");
        ownerValidationManagementSection.classList.add("hidden"); // Ocultar sección de propietario
        tenantResultsDiv.classList.add("hidden");
        tenantErrorMessage.textContent = "";
        ownerActiveValidationDocId = null; // Limpiar ID de validación de propietario
    }
});

// Event listener para el botón de inicio de sesión.
loginButton.addEventListener("click", async () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) {
        displayResult("Por favor, ingresa un correo y contraseña para iniciar sesión.", true, tenantErrorMessage);
        return;
    }

    loginButton.disabled = true;
    loginButton.textContent = "Verificando...";

    try {
        let recaptchaToken = null;
        const IS_LOCAL_DEV = window.location.hostname === "localhost" || window.location.hostname.startsWith("127.0.0.1");

        if (!IS_LOCAL_DEV && typeof grecaptcha !== 'undefined' && typeof grecaptcha.enterprise !== 'undefined') {
            try {
                recaptchaToken = await grecaptcha.enterprise.execute('TU_CLAVE_PUBLICA_RECAPTCHA_SITE_KEY', { action: 'login' });
                console.log("reCAPTCHA Enterprise Token generado:", recaptchaToken);
            } catch (e) {
                console.error("Error al generar el token de reCAPTCHA Enterprise:", e);
                displayResult("Error de seguridad (reCAPTCHA). Intente de nuevo.", true, tenantErrorMessage);
                loginButton.disabled = false;
                loginButton.textContent = "Iniciar Sesión";
                return;
            }
        } else if (IS_LOCAL_DEV) {
            console.log(`Modo de desarrollo: Usando email "${email}" y password (oculto).`);
            console.log("Modo de desarrollo: Omitiendo generación de reCAPTCHA token en el cliente.");
        } else {
            console.warn("reCAPTCHA Enterprise no está disponible o la clave no está configurada para producción.");
        }

        displayResult("Iniciando sesión...", false, tenantErrorMessage);

        const authPayload = { email, password };
        if (recaptchaToken) {
            authPayload.recaptchaToken = recaptchaToken;
        }

        const result = await authenticateAndMintTokenCallable(authPayload);
        const customToken = result.data.customToken;

        if (!customToken) {
            throw new Error("No se recibió un token de autenticación del servidor.");
        }

        await signInWithCustomToken(auth, customToken);
        displayResult(`Inicio de sesión exitoso como: ${email}`, false, tenantErrorMessage);

    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        let errorMessage = "Error al iniciar sesión.";
        if (error.code) {
            errorMessage = `Error: ${error.message}`;
            if (error.code === 'functions/invalid-argument') {
                errorMessage = `Error de validación: ${error.message}`;
            } else if (error.code === 'functions/unauthenticated') {
                errorMessage = 'Credenciales incorrectas o fallo en la verificación de seguridad.';
            } else if (error.code === 'functions/failed-precondition') { // Manejo de error para validación activa
                errorMessage = `${error.message}`;
            }
        }
        displayResult(errorMessage, true, tenantErrorMessage);
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = "Iniciar Sesión";
    }
});

// Event listener para el botón de cierre de sesión.
logoutButton.addEventListener("click", async () => {
    try {
        await signOut(auth);
        displayResult("Sesión cerrada.", false, tenantErrorMessage);
        ownerActiveValidationDocId = null; // Limpiar ID de validación de propietario
    }
    catch (error) {
        console.error("Error al cerrar sesión:", error);
        displayResult(`Error al cerrar sesión: ${error.message}`, true, tenantErrorMessage);
    }
});

// NUEVO: Event listener para el botón "Dar de Baja MI Validación Actual" (del propietario)
deactivateOwnerValidationButton.addEventListener("click", async () => {
    // 1. Cuadro de diálogo de confirmación
    const confirmDeactivation = confirm(
        "¿Está seguro de que desea dar de baja SU PROPIA validación activa?\n" +
        "Esta acción marcará su validación como inactiva y no podrá ser consultada por inquilinos.\n" +
        "Deberá crear una nueva validación para actualizar sus datos."
    );

    if (!confirmDeactivation) {
        console.log("Desactivación de la validación del propietario cancelada por el usuario.");
        return;
    }

    if (!ownerActiveValidationDocId) {
        ownerValidationStatusDiv.textContent = "Error: No se encontró una validación activa para dar de baja.";
        deactivateOwnerValidationButton.classList.add("hidden");
        return;
    }

    if (!auth.currentUser) {
        ownerValidationStatusDiv.textContent = "Debe iniciar sesión para dar de baja validaciones.";
        return;
    }

    // Deshabilita el botón mientras se procesa
    deactivateOwnerValidationButton.disabled = true;
    deactivateOwnerValidationButton.textContent = "Procesando...";

    try {
        // Llama a la Cloud Function para desactivar la validación del propietario
        const result = await deactivateValidationCallable({ validationId: ownerActiveValidationDocId });
        console.log("Respuesta de la función de desactivación (propietario):", result.data);

        if (result.data.success) {
            // Mensaje de éxito en la interfaz y redirección
            ownerValidationStatusDiv.innerHTML = `
                <p class="text-green-700">¡Su validación ha sido dada de baja exitosamente!</p>
                <p>Redirigiendo para que pueda crear una nueva validación...</p>
            `;
            ownerActiveValidationDocId = null; // Limpiar ID de validación de propietario
            deactivateOwnerValidationButton.classList.add("hidden"); // Ocultar el botón

            // Redireccionar al usuario para el nuevo proceso de validación
            window.location.href = "http://localhost:5000/propietario_test.html";

        } else {
            ownerValidationStatusDiv.textContent = `Error al dar de baja su validación: ${result.data.message || "Error desconocido."}`;
            deactivateOwnerValidationButton.classList.remove("hidden"); // Re-mostrar el botón en caso de error
        }
    } catch (error) {
        console.error("Error al llamar a la función de desactivación (propietario):", error);
        let errorMessage =
            error.code && error.message
                ? `Error de Cloud Function: ${error.code} - ${error.message}`
                : `Error inesperado: ${error.toString()}`;
        ownerValidationStatusDiv.textContent = `Error: ${errorMessage}`;
    } finally {
        deactivateOwnerValidationButton.disabled = false;
        deactivateOwnerValidationButton.textContent = "Dar de Baja MI Validación Actual";
    }
});


// Event listener para el botón de consulta de inquilinos.
queryTenantButton.addEventListener("click", async () => {
    tenantErrorMessage.textContent = "";
    tenantResultsDiv.classList.add("hidden");
    tenantResultsDiv.textContent = "";

    const code = tenantCodeInput.value.trim();
    if (!code) {
        displayResult("Por favor, ingresa un código de inquilino.", true, tenantErrorMessage);
        return;
    }

    if (!auth.currentUser) {
        displayResult("Debe iniciar sesión para consultar inquilinos.", true, tenantErrorMessage);
        return;
    }

    queryTenantButton.disabled = true;
    queryTenantButton.textContent = "Consultando...";

    try {
        const token = await getIdToken(auth.currentUser, true);
        console.log("Frontend: Enviando token:", token);

        displayResult(`Consultando estado de validación para ${code}...`, false, tenantResultsDiv);
        tenantResultsDiv.classList.remove("hidden");

        const result = await consultarEstadoValidacionCallable({ searchQuery: code });
        console.log("Respuesta de la función:", result.data);

        const validacionData = result.data;
        if (validacionData && validacionData.isValidationActive) {
            // NOTA IMPORTANTE: currentValidationDocId ya NO se usa para el botón de baja de validación
            // sino para referencia si la necesitamos en el futuro, pero el botón ya no está aquí.
            const resultText = `
                <ul class="list-disc list-inside space-y-2">
                    <li><span class="font-bold">Estado Validación:</span> ${validacionData.estadoValidacion || "N/A"}</li>
                    <li><span class="font-bold">Tipo Usuario:</span> ${validacionData.tipoUsuario || "N/A"}</li>
                    <li><span class="font-bold">Nombre Completo:</span> ${
                                validacionData.datosIdentidad?.nombreCompleto ||
                                validacionData.datosIdentidad?.titular ||
                                validacionData.datosIdentidad?.razonSocial ||
                                "N/A"
                            }</li>
                    <li><span class="font-bold">Identificación Fiscal:</span> ${
                                validacionData.datosIdentidad?.identificacionFiscalTipo || ""
                            } ${
                                maskDNI(validacionData.datosIdentidad?.identificacionFiscalNumero || validacionData.datosIdentidad?.dni)
                            }</li>
                    <li><span class="font-bold">País:</span> ${validacionData.datosIdentidad?.pais || "N/A"}</li>
                    <li><span class="font-bold">Localidad:</span> ${validacionData.datosIdentidad?.localidad || "N/A"}</li>
                </ul>
            `;
            displayResult(resultText, false, tenantResultsDiv);
        } else {
            displayResult(`No se encontró ninguna validación activa con el código: ${code}.`, true, tenantErrorMessage);
            tenantResultsDiv.classList.add("hidden");
        }
    } catch (error) {
        console.error("Error al consultar validación:", error);
        console.log("Detalles del error:", JSON.stringify(error, null, 2));
        let errorMessage =
            error.code && error.message
                ? `Error de Cloud Function: ${error.code} - ${error.message}`
                : `Error inesperado: ${error.toString()}`;
        displayResult(errorMessage, true, tenantErrorMessage);
        tenantResultsDiv.classList.add("hidden");
    } finally {
        queryTenantButton.disabled = false;
        queryTenantButton.textContent = "Consultar Inquilino";
    }
});
