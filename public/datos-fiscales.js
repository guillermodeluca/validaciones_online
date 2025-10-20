// public/datos_fiscales.js

// *********************************************************************************
// * 1. IMPORTACIONES                                                              *
// *********************************************************************************
import { db, auth } from './firebaseClient.js';
import {
    collection,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    query, // Añadido
    where, // Añadido
    getDocs // Añadido
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";


// *********************************************************************************
// * 2. REFERENCIAS DOM                                                            *
// *********************************************************************************
const loadingStatusDiv = document.getElementById('loadingStatus');
const messageDisplay = document.getElementById('messageDisplay');
const fiscalDataForm = document.getElementById('fiscalDataForm');
const sectionTitleDetails = document.getElementById('sectionTitleDetails');

const btnConsumidorFinal = document.getElementById('btnConsumidorFinal');
const btnFacturaA = document.getElementById('btnFacturaA');

const commonFiscalFields = document.getElementById('commonFiscalFields');
const facturaAFields = document.getElementById('facturaAFields');

const cf_nombreInput = document.getElementById('cf_nombre');
const cf_dniInput = document.getElementById('cf_dni');
const cf_emailInput = document.getElementById('cf_email');

const fa_posicionIvaSelect = document.getElementById('fa_posicionIva');
const fa_cuitInput = document.getElementById('fa_cuit');

const saveFiscalDataBtn = document.getElementById('saveFiscalDataBtn');
const logoutBtn = document.getElementById('logoutBtn');


// *********************************************************************************
// * 3. VARIABLES DE ESTADO GLOBALES                                               *
// *********************************************************************************
let currentUserUID = null;
let currentFiscalDataType = null; // 'consumidor_final' o 'factura_a'
let currentFiscalDataRequestId = null; // Para guardar el ID de la solicitud fiscal que estamos editando


// *********************************************************************************
// * 4. FUNCIONES DE UTILIDAD                                                      *
// *********************************************************************************

function showMessage(type, message, duration = 5000) {
    messageDisplay.classList.remove('hidden', 'success', 'error', 'info', 'warning'); // Añadido 'warning'
    messageDisplay.classList.add(type);
    messageDisplay.textContent = message;
    if (duration > 0) {
        setTimeout(() => {
            messageDisplay.classList.add('hidden');
        }, duration);
    }
}

function enableUI(enable) {
    if (btnConsumidorFinal) btnConsumidorFinal.disabled = !enable;
    if (btnFacturaA) btnFacturaA.disabled = !enable;
    if (cf_nombreInput) cf_nombreInput.disabled = !enable;
    if (cf_dniInput) cf_dniInput.disabled = !enable;
    if (cf_emailInput) cf_emailInput.disabled = !enable;
    if (fa_posicionIvaSelect) fa_posicionIvaSelect.disabled = !enable;
    if (fa_cuitInput) fa_cuitInput.disabled = !enable;
    if (saveFiscalDataBtn) saveFiscalDataBtn.disabled = !enable;
    if (logoutBtn) logoutBtn.disabled = !enable;
}

function updateSaveButtonState() {
    let isValid = false;
    if (currentFiscalDataType === 'consumidor_final') {
        isValid = cf_nombreInput.value.trim() !== '' && cf_dniInput.value.trim() !== '' && cf_emailInput.value.trim() !== '';
    } else if (currentFiscalDataType === 'factura_a') {
        isValid = cf_nombreInput.value.trim() !== '' &&
                  cf_dniInput.value.trim() !== '' &&
                  cf_emailInput.value.trim() !== '' &&
                  fa_posicionIvaSelect.value !== '' &&
                  fa_cuitInput.value.trim() !== '';
    }
    if (saveFiscalDataBtn) saveFiscalDataBtn.disabled = !isValid;
    if (saveFiscalDataBtn) saveFiscalDataBtn.textContent = isValid ? 'Guardar Datos Fiscales' : 'Complete los campos';
}


function showFiscalFields(type) {
    if (commonFiscalFields) commonFiscalFields.classList.add('hidden');
    if (facturaAFields) facturaAFields.classList.add('hidden');

    if (btnConsumidorFinal) btnConsumidorFinal.classList.remove('active');
    if (btnFacturaA) btnFacturaA.classList.remove('active');

    if (type === 'consumidor_final') {
        if (commonFiscalFields) commonFiscalFields.classList.remove('hidden');
        if (sectionTitleDetails) sectionTitleDetails.textContent = 'Datos para Consumidor Final';
        // Asumiendo que el label está antes del input y tiene un textContent
        if (cf_nombreInput && cf_nombreInput.previousElementSibling) cf_nombreInput.previousElementSibling.textContent = 'Nombre o Razón Social:';
        if (btnConsumidorFinal) btnConsumidorFinal.classList.add('active');
        currentFiscalDataType = 'consumidor_final';
    } else if (type === 'factura_a') {
        if (commonFiscalFields) commonFiscalFields.classList.remove('hidden');
        if (facturaAFields) facturaAFields.classList.remove('hidden');
        if (sectionTitleDetails) sectionTitleDetails.textContent = 'Datos para Factura A';
        if (cf_nombreInput && cf_nombreInput.previousElementSibling) cf_nombreInput.previousElementSibling.textContent = 'Razón Social:';
        if (btnFacturaA) btnFacturaA.classList.add('active');
        currentFiscalDataType = 'factura_a';
    } else {
        if (sectionTitleDetails) sectionTitleDetails.textContent = 'Seleccione un tipo de facturación para continuar';
        currentFiscalDataType = null;
    }
    updateSaveButtonState();
}


async function loadUserData() {
    enableUI(false);
    if (loadingStatusDiv) loadingStatusDiv.classList.remove('hidden');
    showMessage('info', 'Cargando sus datos de validación...', 0);

    try {
        const userDocRef = doc(db, 'users', currentUserUID);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const validationProcess = userData.validationProcess || {};

            // --- INICIO: Lógica para precargar/revisar la solicitud fiscal automática ---
            if (validationProcess.status === 'fiscal_data_requested') {
                showMessage('success', 'Sus datos fiscales ya fueron enviados para esta validación. Redirigiendo a su dashboard.', 3000);
                setTimeout(() => window.location.href = '/dashboard_propietario.html', 1500); // O la página final
                return;
            } else if (validationProcess.status !== 'profile_completed_pending_fiscal_data') {
                showMessage('warning', `Estado de validación incorrecto (${validationProcess.status}). Redirigiendo a perfil.`, 3000);
                setTimeout(() => window.location.href = '/propietario_test.html', 1500); // Redirigir a propietario_test
                return;
            }

            // Si estamos en 'profile_completed_pending_fiscal_data', buscamos la solicitud fiscal automática
            const fiscalRequestsCollection = collection(db, 'fiscalDataRequests');
            const q = query(fiscalRequestsCollection,
                            where("userId", "==", currentUserUID),
                            where("status", "==", "auto_generated_pending_review"));

            const querySnapshot = await getDocs(q);

            let autoGeneratedFiscalData = null;
            if (!querySnapshot.empty) {
                // Tomamos la primera solicitud encontrada (asumiendo que solo habrá una "auto_generated_pending_review" por usuario en este estado)
                autoGeneratedFiscalData = querySnapshot.docs[0].data();
                currentFiscalDataRequestId = querySnapshot.docs[0].id; // Guardar el ID del documento para actualizarlo
                showMessage('info', 'Revisa y confirma tus datos fiscales pre-generados.', 0);
            } else {
                showMessage('warning', 'No se encontró solicitud fiscal automática para revisión. Por favor, ingrese los datos.', 0);
            }

            // Precargar los campos con los datos automáticos o dejarlos vacíos si no hay
            if (cf_nombreInput) cf_nombreInput.value = autoGeneratedFiscalData?.nombreORazonSocial || '';
            if (cf_dniInput) cf_dniInput.value = autoGeneratedFiscalData?.dni || '';
            if (cf_emailInput) cf_emailInput.value = autoGeneratedFiscalData?.emailFactura || '';
            if (fa_posicionIvaSelect) fa_posicionIvaSelect.value = autoGeneratedFiscalData?.posicionIva || '';
            if (fa_cuitInput) fa_cuitInput.value = autoGeneratedFiscalData?.cuit || '';

            // Seleccionar el tipo de facturación precargado o dejar sin seleccionar
            if (autoGeneratedFiscalData?.tipoFacturacion === 'consumidor_final') {
                showFiscalFields('consumidor_final');
            } else if (autoGeneratedFiscalData?.tipoFacturacion === 'factura_a') {
                showFiscalFields('factura_a');
            } else {
                showFiscalFields(null); // No hay selección por defecto
            }
            // --- FIN: Lógica para precargar/revisar la solicitud fiscal automática ---

            showMessage('success', 'Datos cargados. Por favor, confirme su información fiscal.', 0);
        } else {
            showMessage('warning', 'No se encontró su perfil. Redirigiendo para completar perfil.', 0);
            setTimeout(() => window.location.href = '/propietario_test.html', 3000);
        }
    } catch (error) {
        console.error("Error al cargar datos fiscales:", error);
        showMessage('error', 'Error al cargar los datos fiscales. Intente de nuevo.', 0);
    } finally {
        if (loadingStatusDiv) loadingStatusDiv.classList.add('hidden');
        if (fiscalDataForm) fiscalDataForm.classList.remove('hidden');
        enableUI(true);
    }
}


async function saveFiscalData(e) {
    e.preventDefault();
    enableUI(false);
    if (saveFiscalDataBtn) saveFiscalDataBtn.textContent = 'Guardando...';
    showMessage('info', 'Guardando datos fiscales...', 0);

    if (!currentFiscalDataType) {
        showMessage('error', 'Por favor, seleccione un tipo de facturación.', 0);
        enableUI(true);
        if (saveFiscalDataBtn) saveFiscalDataBtn.textContent = 'Guardar Datos Fiscales';
        return;
    }

    let fiscalDataRequest = {
        userId: currentUserUID,
        tipoFacturacion: currentFiscalDataType,
        nombreORazonSocial: cf_nombreInput.value.trim(),
        dni: cf_dniInput.value.trim(),
        emailFactura: cf_emailInput.value.trim(),
        status: 'pending' // Estado inicial para el proceso de facturación
    };

    // Validaciones básicas de campos comunes
    if (!fiscalDataRequest.nombreORazonSocial || !fiscalDataRequest.dni || !fiscalDataRequest.emailFactura) {
        showMessage('error', 'Por favor, complete todos los campos obligatorios para el tipo de facturación seleccionado.', 0);
        enableUI(true);
        if (saveFiscalDataBtn) saveFiscalDataBtn.textContent = 'Guardar Datos Fiscales';
        return;
    }

    if (currentFiscalDataType === 'factura_a') {
        fiscalDataRequest.posicionIva = fa_posicionIvaSelect.value;
        fiscalDataRequest.cuit = fa_cuitInput.value.trim();

        if (!fiscalDataRequest.posicionIva || !fiscalDataRequest.cuit) {
            showMessage('error', 'Por favor, complete todos los campos obligatorios para Factura A.', 0);
            enableUI(true);
            if (saveFiscalDataBtn) saveFiscalDataBtn.textContent = 'Guardar Datos Fiscales';
            return;
        }
    }

    try {
        const userDocRef = doc(db, 'users', currentUserUID);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
            throw new Error("Documento de usuario no encontrado al guardar datos fiscales.");
        }
        const userData = userDocSnap.data();
        const validationProcess = userData.validationProcess || {};
        const paymentDetails = validationProcess.payment || {};

        fiscalDataRequest.importePagado = paymentDetails.amount || 0;
        fiscalDataRequest.moneda = paymentDetails.currency || 'ARS';
        fiscalDataRequest.userRole = validationProcess.role || 'desconocido';
        fiscalDataRequest.requestDate = serverTimestamp(); // Usar serverTimestamp para consistencia


        // --- CAMBIO CLAVE: Actualizar el documento fiscal existente o crear uno nuevo ---
        const fiscalDataRequestsCollection = collection(db, 'fiscalDataRequests');
        if (currentFiscalDataRequestId) { // Si ya tenemos un ID de solicitud que estamos editando
            await updateDoc(doc(fiscalDataRequestsCollection, currentFiscalDataRequestId), fiscalDataRequest);
            console.log("DEBUG: Solicitud fiscal existente actualizada:", currentFiscalDataRequestId);
        } else { // Si por alguna razón no se precargó (raro en este flujo), crea uno nuevo
            // Esto no debería pasar si el flujo viene de propietario_test.js correctamente
            await setDoc(doc(fiscalDataRequestsCollection), fiscalDataRequest);
            console.log("DEBUG: Nueva solicitud fiscal creada (no debería pasar en este flujo).");
        }
        // --- FIN CAMBIO CLAVE ---


        // Actualizar el estado de la validación en el documento del usuario
        await updateDoc(userDocRef, {
            'validationProcess.status': 'fiscal_data_submitted', // Nuevo estado final para datos fiscales
            lastUpdated: serverTimestamp() // Usar serverTimestamp
        });

        showMessage('success', 'Solicitud de datos fiscales enviada. ¡Su factura será emitida pronto!', 3000);
        setTimeout(() => window.location.href = '/dashboard_propietario.html', 1500); // Redirige a dashboard

    } catch (error) {
        console.error("Error al guardar datos fiscales:", error);
        showMessage('error', 'Error al guardar los datos fiscales: ' + error.message, 0);
    } finally {
        updateSaveButtonState(); // Re-habilita y actualiza el texto del botón si no hay redirección por error
    }
}


// --- Event Listeners ---
btnConsumidorFinal.addEventListener('click', () => showFiscalFields('consumidor_final'));
btnFacturaA.addEventListener('click', () => showFiscalFields('factura_a'));
fiscalDataForm.addEventListener('submit', saveFiscalData);

// Listeners para actualizar el botón de guardar en tiempo real
cf_nombreInput.addEventListener('input', updateSaveButtonState);
cf_dniInput.addEventListener('input', updateSaveButtonState);
cf_emailInput.addEventListener('input', updateSaveButtonState);
fa_posicionIvaSelect.addEventListener('change', updateSaveButtonState);
fa_cuitInput.addEventListener('input', updateSaveButtonState);


logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
        showMessage('info', 'Sesión cerrada. Redirigiendo...', 1500);
        setTimeout(() => {
            window.location.href = '/ingresoAValidacion.html';
        }, 1500);
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
        showMessage('error', 'Error al cerrar sesión: ' + error.message, 0);
    }
});

// --- Inicialización ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserUID = user.uid;
        loadUserData();
    } else {
        showMessage('error', 'No autenticado. Redirigiendo a la página de inicio de sesión.', 0);
        setTimeout(() => window.location.href = '/ingresoAValidacion.html', 3000);
    }
});
