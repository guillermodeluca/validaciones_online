// public/admin.js

// =================================================================================================
// IMPORTS: Aquí solo se importan las instancias de Firebase y las funciones específicas de SDK.
// NO DEBEN HABER DECLARACIONES DUPLICADAS.
// =================================================================================================

// Importa las instancias de Firebase que necesitas desde firebaseClient.js
import { auth, db, functions, httpsCallable } from './firebaseClient.js';

// Importa las funciones específicas del SDK modular de Firebase directamente de CDN
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged // Se importa desde aquí
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import {
    doc,
    getDoc, // Se importa desde aquí
    // collection, query, where, getDocs // Estas se usan en Cloud Functions, no en este frontend directamente
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';


// =================================================================================================
// REFERENCIAS A ELEMENTOS HTML: Todas las referencias a IDs del DOM van aquí, una sola vez.
// =================================================================================================

// Elementos de la sección de autenticación
const authStatusDiv = document.getElementById("auth-status");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");
const adminDashboard = document.getElementById("admin-dashboard"); // El contenedor principal de acciones admin

// Elementos de la sección de búsqueda de historial
const searchDniInput = document.getElementById("searchDniInput");
const searchNameInput = document.getElementById("searchNameInput");
const searchHistoryButton = document.getElementById("searchHistoryButton");
const searchStatusMessage = document.getElementById("searchStatusMessage");
const historyResultsSection = document.getElementById("historyResultsSection");
const validationHistoryList = document.getElementById("validationHistoryList");

// Elementos de la sección de acciones de validación (placeholders)
const adminSearchIdInput = document.getElementById("adminSearchId");
const certifyButton = document.getElementById("certifyButton");
const payButton = document.getElementById("payButton");
const actionResultMessage = document.getElementById("actionResultMessage");

// Referencias a elementos HTML para métricas generales (NUEVOS)
const totalUsersCountSpan = document.getElementById("totalUsersCount");
const totalPropietariosCountSpan = document.getElementById("totalPropietariosCount");
const totalInquilinosCountSpan = document.getElementById("totalInquilinosCount");
const totalValidacionesCountSpan = document.getElementById("totalValidacionesCount");


// =================================================================================================
// FUNCIONES CALLABLE DE CLOUD FUNCTIONS: Se declaran aquí una sola vez.
// =================================================================================================

const updateValidationStatusCallable = httpsCallable(functions, "updateValidationStatus");
const confirmPaymentCallable = httpsCallable(functions, "confirmPayment");
const searchUserValidationsCallable = httpsCallable(functions, "searchUserValidations");


// =================================================================================================
// FUNCIONES AUXILIARES PARA UI: Funciones para manipular el DOM y mensajes.
// =================================================================================================

function displayMessage(element, message, isError = false) {
    element.textContent = message;
    element.className = "text-sm mt-4 text-center " + (isError ? "text-red-500" : "text-green-500");
    element.classList.remove("hidden");
}

function clearMessage(element) {
    element.classList.add("hidden");
    element.textContent = "";
}

function displayActionResult(message, isError = false) {
    actionResultMessage.textContent = message;
    actionResultMessage.className = "text-sm mt-4 text-center " + (isError ? "text-red-500" : "text-green-500");
    actionResultMessage.classList.remove("hidden");
}

// Función para obtener la clase CSS de la tarjeta de validación según el estado
function getValidationCardClass(status) {
    switch (status) {
        case 'active': return 'active';
        case 'expired': return 'expired';
        case 'pending': return 'pending';
        case 'validado': return 'active'; // El estado 'validado' se considera activo para el estilo
        default: return ''; 
    }
}


// =================================================================================================
// LÓGICA DE MÉTRICAS GENERALES: Carga y muestra los contadores de usuarios y validaciones.
// =================================================================================================

async function loadGeneralMetrics() {
    try {
        const statsDocRef = doc(db, "stats", "dashboard_metrics");
        const statsDocSnap = await getDoc(statsDocRef);

        if (statsDocSnap.exists()) {
            const data = statsDocSnap.data();
            totalUsersCountSpan.textContent = data.totalUsers || 0;
            totalPropietariosCountSpan.textContent = data.totalPropietarios || 0;
            totalInquilinosCountSpan.textContent = data.totalInquilinos || 0;
            totalValidacionesCountSpan.textContent = data.totalValidaciones || 0;
        } else {
            // Si el documento de métricas no existe, inicializarlos a 0
            totalUsersCountSpan.textContent = '0';
            totalPropietariosCountSpan.textContent = '0';
            totalInquilinosCountSpan.textContent = '0';
            totalValidacionesCountSpan.textContent = '0';
            console.warn("El documento 'stats/dashboard_metrics' no existe aún. Se mostrarán 0s.");
        }
    } catch (error) {
        console.error("Error al cargar las métricas generales:", error);
        totalUsersCountSpan.textContent = 'Error';
        totalPropietariosCountSpan.textContent = 'Error';
        totalInquilinosCountSpan.textContent = 'Error';
        totalValidacionesCountSpan.textContent = 'Error';
    }
}


// =================================================================================================
// MANEJO DEL ESTADO DE AUTENTICACIÓN: Lógica principal al cambiar el estado del usuario.
// =================================================================================================

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Usuario autenticado
        authStatusDiv.textContent = `Autenticado como: ${user.email} (UID: ${user.uid})`;
        loginButton.classList.add("hidden");
        logoutButton.classList.remove("hidden");
        clearMessage(searchStatusMessage); // Limpiar mensajes al cambiar de estado

        try {
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);

            let userRole = "guest"; // Rol por defecto
            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                userRole = userData.role || "guest";
                authStatusDiv.textContent += ` - Rol: ${userRole}`;
            } else {
                // Si el usuario existe en Auth pero no en Firestore, se le asigna guest.
                authStatusDiv.textContent += ` - Rol: guest (sin perfil Firestore)`;
            }

            if (userRole === "admin") {
                adminDashboard.classList.remove("hidden");
                historyResultsSection.classList.add("hidden"); // Ocultar resultados de búsqueda al inicio
                clearMessage(actionResultMessage);
                
                // Cargar métricas al iniciar sesión como admin
                await loadGeneralMetrics(); 

            } else {
                adminDashboard.classList.add("hidden");
                displayMessage(searchStatusMessage, "Acceso denegado. Solo los administradores pueden acceder a este panel.", true);
                authStatusDiv.textContent = `Autenticado como: ${user.email} (UID: ${user.uid}) - Acceso denegado.`;
            }
        } catch (error) {
            console.error("Error al leer el rol del usuario de Firestore:", error);
            authStatusDiv.textContent += ` - Error al cargar rol.`;
            adminDashboard.classList.add("hidden");
            displayMessage(searchStatusMessage, "Error al cargar perfil de usuario. Verifique la consola.", true);
        }
    } else {
        // No hay usuario autenticado
        console.log("No hay usuario autenticado");
        authStatusDiv.textContent = `Estado: No autenticado`;
        // Restaura valores por defecto para conveniencia de test
        emailInput.value = "admin@sistema.com"; 
        passwordInput.value = "AdminSecure2024!";
        loginButton.classList.remove("hidden");
        logoutButton.classList.add("hidden");
        adminDashboard.classList.add("hidden");
        clearMessage(searchStatusMessage);
        clearMessage(actionResultMessage);
        historyResultsSection.classList.add("hidden"); // Ocultar resultados al cerrar sesión

        // Limpiar métricas al cerrar sesión
        totalUsersCountSpan.textContent = '0';
        totalPropietariosCountSpan.textContent = '0';
        totalInquilinosCountSpan.textContent = '0';
        totalValidacionesCountSpan.textContent = '0';
    }
});


// =================================================================================================
// EVENT LISTENERS DE AUTENTICACIÓN
// =================================================================================================

loginButton.addEventListener("click", async () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) {
        displayMessage(searchStatusMessage, "Por favor, ingresa un correo y contraseña para iniciar sesión.", true);
        return;
    }
    try {
        await signInWithEmailAndPassword(auth, email, password);
        displayMessage(searchStatusMessage, `Intentando iniciar sesión como: ${email}...`);
    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        displayMessage(searchStatusMessage, `Error al iniciar sesión: ${error.message}`, true);
    }
});

logoutButton.addEventListener("click", async () => {
    try {
        await signOut(auth);
        displayMessage(searchStatusMessage, "Sesión cerrada.");
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
        displayMessage(searchStatusMessage, `Error al cerrar sesión: ${error.message}`, true);
    }
});


// =================================================================================================
// EVENT LISTENER PARA BÚSQUEDA DE HISTORIAL DE VALIDACIONES
// =================================================================================================

searchHistoryButton.addEventListener("click", async () => {
    if (!auth.currentUser) {
        displayMessage(searchStatusMessage, "Debe iniciar sesión para buscar el historial.", true);
        return;
    }

    const dni = searchDniInput.value.trim();
    const name = searchNameInput.value.trim();

    if (!dni && !name) {
        displayMessage(searchStatusMessage, "Por favor, ingresa un DNI o un Nombre y Apellido para buscar.", true);
        return;
    }

    clearMessage(searchStatusMessage);
    historyResultsSection.classList.add("hidden");
    validationHistoryList.innerHTML = ''; // Limpiar resultados anteriores
    displayMessage(searchStatusMessage, "Buscando historial...", false);

    try {
        // Llamar a la Cloud Function para buscar el historial
        const result = await searchUserValidationsCallable({ dni, name });
        const { userFound, validations } = result.data;

        clearMessage(searchStatusMessage); // Limpiar mensaje de "Buscando..."

        if (!userFound) {
            displayMessage(searchStatusMessage, "Usuario no encontrado con los criterios proporcionados.", true);
            return;
        }

        if (validations.length === 0) {
            displayMessage(searchStatusMessage, `Usuario encontrado, pero sin validaciones registradas.`, false);
            return;
        }

        // Mostrar los resultados
        historyResultsSection.classList.remove("hidden");
        validations.forEach(val => {
            const card = document.createElement("div");
            card.classList.add("validation-card", getValidationCardClass(val.status));
            
            // Formatear fechas si existen
            const startDate = val.startDate ? new Date(val.startDate._seconds * 1000).toLocaleDateString() : 'N/A';
            const endDate = val.endDate ? new Date(val.endDate._seconds * 1000).toLocaleDateString() : 'N/A';
            
            card.innerHTML = `
                <p><strong>UID Usuario:</strong> ${val.userId}</p>
                <p><strong>Validación ID:</strong> ${val.id}</p>
                <p><strong>Estado:</strong> ${val.status || 'N/A'}</p>
                <p><strong>Inicio:</strong> ${startDate}</p>
                <p><strong>Fin:</strong> ${endDate}</p>
                <p><strong>DNI Validado:</strong> ${val.identityData?.identificacionFiscalNumero || 'N/A'}</p>
                <p><strong>Nombre Validado:</strong> ${val.identityData?.nombreCompleto || val.identityData?.razonSocial || 'N/A'}</p>
                <p><strong>Token Equifax:</strong> ${val.apiEquifaxToken || 'N/A'}</p>
                <p class="mt-2 text-xs text-gray-500">
                    <button class="text-blue-500 hover:underline copy-to-clipboard" data-content="${val.id}">Copiar ID</button> |
                    <button class="text-blue-500 hover:underline copy-to-clipboard" data-content="${val.userId}">Copiar UID</button>
                </p>
            `;
            validationHistoryList.appendChild(card);
        });

        // Añadir funcionalidad de copiar al portapapeles
        document.querySelectorAll('.copy-to-clipboard').forEach(button => {
            button.addEventListener('click', (event) => {
                const content = event.target.dataset.content;
                navigator.clipboard.writeText(content).then(() => {
                    alert('Copiado: ' + content);
                }).catch(err => {
                    console.error('Error al copiar: ', err);
                });
            });
        });

    } catch (error) {
        console.error("Error al buscar historial de validaciones:", error);
        displayMessage(searchStatusMessage, `Error al buscar historial: ${error.message}`, true);
        historyResultsSection.classList.add("hidden");
    }
});


// =================================================================================================
// EVENT LISTENERS PARA ACCIONES DE VALIDACIÓN (PLACEHOLDERS)
// =================================================================================================

certifyButton.addEventListener("click", async () => {
    if (!auth.currentUser) { displayActionResult("Debe iniciar sesión.", true); return; }
    const currentSearchId = adminSearchIdInput.value;
    if (!currentSearchId) { displayActionResult("Ingresa un ID de Validación.", true); return; }
    displayActionResult(`Enviando solicitud de certificación para ${currentSearchId}...`);
    try {
        const result = await updateValidationStatusCallable({ searchId: currentSearchId, status: true });
        displayActionResult("¡Éxito! Certificación de Identidad:\n" + JSON.stringify(result.data, null, 2));
    } catch (error) {
        console.error("Error al llamar a la función updateValidationStatus:", error);
        displayActionResult(`Error en Certificación: ${error.message}`, true);
    }
});

payButton.addEventListener("click", async () => {
    if (!auth.currentUser) { displayActionResult("Debe iniciar sesión.", true); return; }
    const currentSearchId = adminSearchIdInput.value;
    if (!currentSearchId) { displayActionResult("Ingresa un ID de Validación.", true); return; }
    displayActionResult(`Enviando solicitud de confirmación de pago para ${currentSearchId}...`);
    try {
        const result = await confirmPaymentCallable({ searchId: currentSearchId, status: true });
        displayActionResult("¡Éxito! Confirmación de Pago:\n" + JSON.stringify(result.data, null, 2));
    } catch (error) {
        console.error("Error al llamar a la función confirmPayment:", error);
        displayActionResult(`Error en Pago: ${error.message}`, true);
    }
});
