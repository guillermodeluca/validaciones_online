// public/inquilino_test.js

// *********************************************************************************
// * 1. IMPORTACIONES                                                              *
// *********************************************************************************
import { db, auth } from './firebaseClient.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { saveUserProfileAndGenerateFiscalData } from './userService.js'; // Importa la función modular


// *********************************************************************************
// * 2. REFERENCIAS A ELEMENTOS DEL DOM                                            *
// *********************************************************************************
const loadingStatusDiv = document.getElementById('loadingStatus');
const messageDisplay = document.getElementById('messageDisplay');
const profileForm = document.getElementById('profileForm');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const logoutBtn = document.getElementById('logoutBtn');

// Campos de datos validados (Equifax) - Solo lectura
const fullNameUsuarioInput = document.getElementById('fullNameUsuario');
const documentNumberUsuarioInput = document.getElementById('documentNumberUsuario');
const genderUsuarioInput = document.getElementById('genderUsuario');
const birthdateUsuarioInput = document.getElementById('birthdateUsuario');
const validationStatusUsuarioInput = document.getElementById('validationStatusUsuario');
const validationExpiresAtUsuarioInput = document.getElementById('validationExpiresAtUsuario');

// REFERENCIAS PARA EMAIL Y CONTRASEÑA
const emailUsuarioInput = document.getElementById('emailUsuario');
const emailUsuarioConfirmacionInput = document.getElementById('emailUsuarioConfirmacion');
const emailMatchStatusSpan = document.getElementById('emailMatchStatus');

const passwordUsuarioInput = document.getElementById('passwordUsuario');
const passwordUsuarioConfirmacionInput = document.getElementById('passwordUsuarioConfirmacion');
const passwordMatchStatusSpan = document.getElementById('passwordMatchStatus');

// Campos de datos adicionales específicos del inquilino (Editables)
const direccionInquilinoInput = document.getElementById('direccionInquilino');
const telefonoContactoInquilinoInput = document.getElementById('telefonoContactoInquilino');


// *********************************************************************************
// * 3. VARIABLES DE ESTADO GLOBALES                                               *
// *********************************************************************************
let currentUserUID = null;


// *********************************************************************************
// * 4. FUNCIONES DE UTILIDAD (Mantienen la lógica de UI)                          *
// *********************************************************************************

function showStatusMessage(message, type) {
    if (loadingStatusDiv) {
        loadingStatusDiv.textContent = message;
        loadingStatusDiv.className = `status-message status-${type}`;
        loadingStatusDiv.classList.remove('hidden');
    } else {
        console.log(`STATUS [${type.toUpperCase()}]: ${message}`);
    }
}

function displayMessage(type, message, duration = 5000) {
    if (messageDisplay) {
        messageDisplay.classList.remove('hidden', 'success', 'error', 'info', 'warning');
        messageDisplay.classList.add(type);
        messageDisplay.textContent = message;
        if (duration > 0) {
            setTimeout(() => {
                messageDisplay.classList.add('hidden');
            }, duration);
        }
    } else {
        console.log(`MESSAGE [${type.toUpperCase()}]: ${message}`);
    }
}

function checkEmailMatch() {
    if (!emailUsuarioInput || !emailUsuarioConfirmacionInput || !emailMatchStatusSpan) return false;

    const emailPrincipal = emailUsuarioInput.value.trim();
    const emailConfirmacion = emailUsuarioConfirmacionInput.value.trim();

    emailMatchStatusSpan.className = 'match-status';

    if (emailPrincipal === '' && emailConfirmacion === '') {
        emailMatchStatusSpan.textContent = '';
        return false;
    } else if (emailPrincipal === emailConfirmacion && emailPrincipal !== '') {
        emailMatchStatusSpan.textContent = 'Emails coinciden';
        emailMatchStatusSpan.className += ' success';
        return true;
    } else {
        emailMatchStatusSpan.textContent = 'Emails NO coinciden';
        emailMatchStatusSpan.className += ' error';
        return false;
    }
}

function checkPasswordMatch() {
    if (!passwordUsuarioInput || !passwordUsuarioConfirmacionInput || !passwordMatchStatusSpan) return false;

    const passwordPrincipal = passwordUsuarioInput.value.trim();
    const passwordConfirmacion = passwordUsuarioConfirmacionInput.value.trim();

    passwordMatchStatusSpan.className = 'match-status';

    if (passwordPrincipal === '' && passwordConfirmacion === '') {
        passwordMatchStatusSpan.textContent = '';
        return false;
    }

    if (passwordPrincipal.length < 8) {
        passwordMatchStatusSpan.textContent = 'Contraseña: mínimo 8 caracteres.';
        passwordMatchStatusSpan.className += ' error';
        return false;
    }

    const hasUpperCase = /[A-Z]/.test(passwordPrincipal);
    const hasLowerCase = /[a-z]/.test(passwordPrincipal);
    const hasNumbers = /[0-9]/.test(passwordPrincipal);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(passwordPrincipal);

    let strengthCriteriaMet = 0;
    if (hasUpperCase) strengthCriteriaMet++;
    if (hasLowerCase) strengthCriteriaMet++;
    if (hasNumbers) strengthCriteriaMet++;
    if (hasSpecial) strengthCriteriaMet++;

    if (strengthCriteriaMet < 3) {
        passwordMatchStatusSpan.textContent = 'Contraseña débil: requiere al menos 3 de 4 tipos (Mayúscula, minúscula, número, símbolo).';
        passwordMatchStatusSpan.className += ' error';
        return false;
    }

    if (passwordPrincipal === passwordConfirmacion) {
        passwordMatchStatusSpan.textContent = 'Contraseñas coinciden';
        passwordMatchStatusSpan.className += ' success';
        return true;
    } else {
        passwordMatchStatusSpan.textContent = 'Contraseñas NO coinciden';
        passwordMatchStatusSpan.className += ' error';
        return false;
    }
}

function updateSaveButtonState() {
    const emailsOk = checkEmailMatch();
    const passwordsOk = checkPasswordMatch();
    if (saveProfileBtn) {
        const profileFieldsFilled = direccionInquilinoInput.value.trim() !== '' &&
                                    telefonoContactoInquilinoInput.value.trim() !== '';

        saveProfileBtn.disabled = !(emailsOk && passwordsOk && profileFieldsFilled);
        if (!saveProfileBtn.disabled) {
            saveProfileBtn.textContent = 'Guardar Perfil';
        } else {
            saveProfileBtn.textContent = 'Complete todos los campos';
        }
    }
}

function disableSaveButton() {
    if (saveProfileBtn) {
        saveProfileBtn.disabled = true;
        saveProfileBtn.textContent = 'Guardando...';
    }
}

async function loadUserProfile(user) {
    showStatusMessage('Cargando datos del perfil del inquilino...', 'info');
    if (!user) {
        console.log("No hay usuario autenticado.");
        displayMessage('error', 'Error: Usuario no autenticado para cargar perfil.', 0);
        if (profileForm) profileForm.classList.add('hidden');
        return;
    }
    currentUserUID = user.uid;

    try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            console.log("DEBUG: Datos del usuario inquilino cargados (completo):", JSON.stringify(userData, null, 2));

            const validationProcess = userData.validationProcess || {};
            const equifaxData = validationProcess.equifax || {};
            const personData = equifaxData.person || {};

            // Rellenar campos de datos validados por Equifax (solo lectura)
            if (fullNameUsuarioInput) fullNameUsuarioInput.value = personData.fullName || 'N/A';
            if (documentNumberUsuarioInput) documentNumberUsuarioInput.value = personData.documentNumber || 'N/A';
            if (genderUsuarioInput) genderUsuarioInput.value = personData.gender || 'N/A';
            if (birthdateUsuarioInput) birthdateUsuarioInput.value = personData.birthdate || 'N/A';

            if (validationStatusUsuarioInput) validationStatusUsuarioInput.value = validationProcess.status || 'Pendiente';

            if (validationExpiresAtUsuarioInput) {
                const validatedAt = validationProcess.lastUpdated && typeof validationProcess.lastUpdated.toDate === 'function' ? validationProcess.lastUpdated.toDate() : null;
                if (validatedAt) {
                    const expiresDate = new Date(validatedAt);
                    expiresDate.setMonth(expiresDate.getMonth() + 6); // Validación de 6 meses para inquilinos
                    validationExpiresAtUsuarioInput.value = expiresDate.toLocaleDateString();
                } else {
                    validationExpiresAtUsuarioInput.value = 'N/A';
                }
            }

            // --- Rellenar campos de EMAIL (dejar vacío para que el usuario ingrese si es la primera vez) ---
            if (emailUsuarioInput) emailUsuarioInput.value = userData.email || '';
            if (emailUsuarioConfirmacionInput) emailUsuarioConfirmacionInput.value = userData.email || '';

            // Contraseña NUNCA se pre-rellena
            if (passwordUsuarioInput) passwordUsuarioInput.value = '';
            if (passwordUsuarioConfirmacionInput) passwordUsuarioConfirmacionInput.value = '';

            // Rellenar campos de datos adicionales específicos del inquilino (editables)
            if (direccionInquilinoInput) direccionInquilinoInput.value = userData.direccion || '';
            if (telefonoContactoInquilinoInput) telefonoContactoInquilinoInput.value = userData.telefonoContacto || '';

            if (profileForm) profileForm.classList.remove('hidden');
            if (loadingStatusDiv) loadingStatusDiv.classList.add('hidden');
            displayMessage('success', 'Perfil del inquilino cargado exitosamente.', 3000);

            updateSaveButtonState();

        } else {
            displayMessage('error', 'Error: Documento de perfil de inquilino no encontrado. Por favor, completa tu validación de identidad.', 0);
            if (profileForm) profileForm.classList.add('hidden');
        }
    } catch (error) {
        console.error("Error al cargar datos del usuario inquilino desde Firestore:", error);
        displayMessage('error', 'Error al cargar perfil del inquilino: ' + error.message, 0);
        if (profileForm) profileForm.classList.add('hidden');
    } finally {
        // El botón de guardar se habilitará/deshabilitará en updateSaveButtonState()
    }
}


async function saveProfile(e) {
    e.preventDefault();
    disableSaveButton();
    showStatusMessage('Guardando cambios del perfil del inquilino...', 'info');

    try {
        const user = auth.currentUser;
        if (!user) {
            throw new Error('Usuario no autenticado para guardar perfil.');
        }

        // --- VALIDACIONES FINALES DE CAMPOS ---
        if (!checkEmailMatch()) {
            throw new Error('Los emails no coinciden. Por favor, verifique.');
        }
        if (!checkPasswordMatch()) {
            throw new Error('Las contraseñas no coinciden o son inválidas (mínimo 8 caracteres, y 3 de 4 tipos). Por favor, verifique.');
        }

        const emailToSave = emailUsuarioInput.value.trim();
        const passwordToSave = passwordUsuarioInput.value.trim();

        // Recolectar datos específicos del perfil del inquilino
        const tenantProfileData = {
            direccion: direccionInquilinoInput.value.trim(),
            telefonoContacto: telefonoContactoInquilinoInput.value.trim(),
            // Incluir fullName del Equifax si es necesario para fiscalDataAutoGenerated en userService
            fullName: fullNameUsuarioInput.value.trim() // Asumiendo que Equifax lo tiene
        };

        // Llama a la función modularizada para manejar autenticación y Firestore
        await saveUserProfileAndGenerateFiscalData(
            user.uid,
            tenantProfileData,
            emailToSave,
            passwordToSave,
            'inquilino' // Rol específico
        );

        // --- REDIRECCIÓN ---
        displayMessage('success', '¡Perfil de inquilino guardado y registro fiscal inicial generado! Redirigiendo para revisión fiscal...', 3000);
        setTimeout(() => {
            window.location.href = '/datos_fiscales.html';
        }, 1500);

    } catch (error) {
        console.error("DEBUG: Error DETALLADO al guardar perfil de inquilino:", error);
        let errorMessage = 'Error al guardar perfil de inquilino.';
        // Mejorar la lectura de errores específicos de Auth
        if (error.code === 'auth/credential-already-in-use' || error.code === 'auth/email-already-in-use') {
            errorMessage = 'El email ya está en uso por otra cuenta. Intente iniciar sesión con ese email o usar otro.';
        } else if (error.code === 'auth/requires-recent-login') {
            errorMessage = 'Su sesión ha caducado. Por favor, reinicie el proceso de validación.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'La contraseña es demasiado débil.';
        } else if (error.message.includes('El email ya está en uso por otra cuenta.')) { // Error personalizado lanzado por userService
            errorMessage = error.message;
        } else {
            errorMessage = `Error inesperado: ${error.message || error.code || 'Código de error desconocido'}.`;
        }
        displayMessage('error', 'Error al guardar perfil de inquilino: ' + errorMessage, 0);
    } finally {
        updateSaveButtonState();
    }
}


// *********************************************************************************
// * 5. LISTENERS DE EVENTOS                                                       *
// *********************************************************************************

document.addEventListener('DOMContentLoaded', () => {
    // Escuchar cambios en los inputs para habilitar/deshabilitar el botón de guardar
    if (emailUsuarioInput) emailUsuarioInput.addEventListener('input', updateSaveButtonState);
    if (emailUsuarioConfirmacionInput) emailUsuarioConfirmacionInput.addEventListener('input', updateSaveButtonState);
    if (passwordUsuarioInput) passwordUsuarioInput.addEventListener('input', updateSaveButtonState);
    if (passwordUsuarioConfirmacionInput) passwordUsuarioConfirmacionInput.addEventListener('input', updateSaveButtonState);

    // Campos adicionales de inquilino
    if (direccionInquilinoInput) direccionInquilinoInput.addEventListener('input', updateSaveButtonState);
    if (telefonoContactoInquilinoInput) telefonoContactoInquilinoInput.addEventListener('input', updateSaveButtonState);

    // Listener para el formulario
    if (profileForm) profileForm.addEventListener('submit', saveProfile);

    // Listener para el botón de cerrar sesión
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
                displayMessage('info', 'Sesión cerrada. Redirigiendo...', 1500);
                setTimeout(() => {
                    window.location.href = '/ingresoAValidacion.html';
                }, 1500);
            } catch (error) {
                console.error("Error al cerrar sesión:", error);
                displayMessage('error', 'Error al cerrar sesión: ' + error.message, 0);
            }
        });
    }
});


// *********************************************************************************
// * 6. INICIALIZACIÓN DE AUTENTICACIÓN                                            *
// *********************************************************************************
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("Usuario autenticado en inquilino_test:", user.uid);
        loadUserProfile(user);
    } else {
        displayMessage('error', 'No autenticado. Redirigiendo a la página de inicio.', 0);
        setTimeout(() => {
            window.location.href = '/ingresoAValidacion.html';
        }, 2000);
    }
});
