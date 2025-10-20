// public/propietario_test.js

// *********************************************************************************
// * 1. IMPORTACIONES (TODO DESDE firebaseClient.js)                               *
// *********************************************************************************
// Importa las instancias de Firebase (db, auth) y las funciones que necesitas
// directamente desde firebaseClient.js
import { db, auth, onAuthStateChanged, signOut, doc, getDoc } from './firebaseClient.js';
import { saveUserProfileAndGenerateFiscalData } from './userService.js'; // Importa la función modular



// *********************************************************************************
// * 2. REFERENCIAS A ELEMENTOS DEL DOM                                            *
// *********************************************************************************
const loadingStatusDiv = document.getElementById('loadingStatus');
const messageDisplay = document.getElementById('messageDisplay');
const profileForm = document.getElementById('profileForm');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const logoutBtn = document.getElementById('logoutBtn');

// Campos de datos validados (Equifax)
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

// Campos de datos adicionales (para completar por el usuario)
const razonSocialPropietarioInput = document.getElementById('razonSocialPropietario');
const direccionPropietarioInput = document.getElementById('direccionPropietario');
const telefonoContactoPropietarioInput = document.getElementById('telefonoContactoPropietario');
const paginaWebPropietarioInput = document.getElementById('paginaWebPropietario');
const aliasBancarioPropietarioInput = document.getElementById('aliasBancarioPropietario');
const habilitacionMunicipalPropietarioInput = document.getElementById('habilitacionMunicipalPropietario');


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
        const profileFieldsFilled = razonSocialPropietarioInput.value.trim() !== '' &&
                                    direccionPropietarioInput.value.trim() !== '' &&
                                    telefonoContactoPropietarioInput.value.trim() !== '' &&
                                    paginaWebPropietarioInput.value.trim() !== '' &&
                                    aliasBancarioPropietarioInput.value.trim() !== '' &&
                                    habilitacionMunicipalPropietarioInput.value.trim() !== '';

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
    showStatusMessage('Cargando datos del perfil...', 'info');
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
            console.log("DEBUG: Datos del usuario cargados (completo):", JSON.stringify(userData, null, 2));

            const validationProcess = userData.validationProcess || {};
            const equifaxData = validationProcess.equifax || {};
            const personData = equifaxData.person || {};

            // Rellenar campos de datos validados por Equifax (datos de persona)
            if (fullNameUsuarioInput) {
                fullNameUsuarioInput.value = personData.fullName || 'N/A';
            }
            if (documentNumberUsuarioInput) {
                documentNumberUsuarioInput.value = personData.documentNumber || 'N/A';
            }
            if (genderUsuarioInput) {
                genderUsuarioInput.value = personData.gender || 'N/A';
            }
            if (birthdateUsuarioInput) {
                birthdateUsuarioInput.value = personData.birthdate || 'N/A';
            }

            if (validationStatusUsuarioInput) {
                validationStatusUsuarioInput.value = validationProcess.status || 'Pendiente';
            }

            if (validationExpiresAtUsuarioInput) {
                const validatedAt = validationProcess.lastUpdated && typeof validationProcess.lastUpdated.toDate === 'function' ? validationProcess.lastUpdated.toDate() : null;
                if (validatedAt) {
                    const expiresDate = new Date(validatedAt);
                    expiresDate.setFullYear(expiresDate.getFullYear() + 1); // 1 año para propietarios
                    validationExpiresAtUsuarioInput.value = expiresDate.toLocaleDateString();
                } else {
                    validationExpiresAtUsuarioInput.value = 'N/A';
                }
            }

            // --- Rellenar campos de EMAIL (dejar vacío para que el usuario ingrese si es la primera vez) ---
            if (emailUsuarioInput) emailUsuarioInput.value = userData.email || '';
            if (emailUsuarioConfirmacionInput) emailUsuarioConfirmacionInput.value = userData.email || '';

            // Contraseña NUNCA se pre-rellena por seguridad
            if (passwordUsuarioInput) passwordUsuarioInput.value = '';
            if (passwordUsuarioConfirmacionInput) passwordUsuarioConfirmacionInput.value = '';

            // Rellenar campos de datos adicionales si ya existen
            if (razonSocialPropietarioInput) razonSocialPropietarioInput.value = userData.razonSocial || '';
            if (direccionPropietarioInput) direccionPropietarioInput.value = userData.direccion || '';
            if (telefonoContactoPropietarioInput) telefonoContactoPropietarioInput.value = userData.telefonoContacto || '';
            if (paginaWebPropietarioInput) paginaWebPropietarioInput.value = userData.paginaWeb || '';
            if (aliasBancarioPropietarioInput) aliasBancarioPropietarioInput.value = userData.aliasBancario || '';
            if (habilitacionMunicipalPropietarioInput) habilitacionMunicipalPropietarioInput.value = userData.habilitacionMunicipal || '';

            if (profileForm) profileForm.classList.remove('hidden');
            if (loadingStatusDiv) loadingStatusDiv.classList.add('hidden');
            displayMessage('success', 'Perfil cargado exitosamente.', 3000);

            updateSaveButtonState();

        } else {
            displayMessage('error', 'Error: Documento de perfil no encontrado. Por favor, completa tu validación de identidad.', 0);
            if (profileForm) profileForm.classList.add('hidden');
        }
    } catch (error) {
        console.error("Error al cargar datos del usuario desde Firestore:", error);
        displayMessage('error', 'Error al cargar perfil: ' + error.message, 0);
        if (profileForm) profileForm.classList.add('hidden');
    } finally {
        // El botón de guardar se habilitará/deshabilitará en updateSaveButtonState()
    }
}


async function saveProfile(e) {
    e.preventDefault();
    disableSaveButton(); // Deshabilita el botón mientras se guarda
    showStatusMessage('Guardando cambios...', 'info');

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

        // Recolectar datos específicos del perfil de propietario
        const ownerProfileData = {
            razonSocial: razonSocialPropietarioInput.value.trim(),
            direccion: direccionPropietarioInput.value.trim(),
            telefonoContacto: telefonoContactoPropietarioInput.value.trim(),
            paginaWeb: paginaWebPropietarioInput.value.trim(),
            aliasBancario: aliasBancarioPropietarioInput.value.trim(),
            habilitacionMunicipal: habilitacionMunicipalPropietarioInput.value.trim(),
            fullName: fullNameUsuarioInput.value.trim() // Asumiendo que Equifax lo tiene
        };

        // LLAMADA ÚNICA Y CORRECTA a la función modularizada para manejar autenticación y Firestore
        await saveUserProfileAndGenerateFiscalData(
            user.uid,
            ownerProfileData,
            emailToSave,
            passwordToSave,
            'propietario' // Rol específico
        );

        // Si el await anterior NO lanzó un error, entonces el updateDoc del usuario fue exitoso.
        displayMessage('success', 'Perfil de usuario guardado exitosamente.', 3000);
        
        // Redirige al usuario a la siguiente página en el flujo (donde se pedirán los datos fiscales)
        // Opcional: Puedes añadir un setTimeout si quieres que el mensaje de éxito se vea un momento
        setTimeout(() => {
            window.location.href = '/datos_fiscales.html'; 
        }, 1500); // Redirige después de 1.5 segundos para que el usuario vea el mensaje

    } catch (error) {
        console.error("DEBUG: Error DETALLADO al guardar perfil:", error);
        let errorMessage = 'Error al guardar perfil.';
        // Mejorar la lectura de errores específicos de Auth y los errores personalizados de userService
        switch (error.code) {
            case 'auth/credential-already-in-use':
            case 'auth/email-already-in-use':
                errorMessage = 'El email ya está en uso por otra cuenta. Intente iniciar sesión con ese email o usar otro.';
                break;
            case 'auth/requires-recent-login':
                errorMessage = 'Su sesión ha caducado. Por favor, inicie sesión nuevamente para actualizar su información.';
                break;
            case 'auth/weak-password':
                errorMessage = 'La contraseña es demasiado débil.';
                break;
            case 'auth/wrong-password': // Error de reautenticación si la contraseña no coincide
                errorMessage = 'Contraseña incorrecta. Verifique sus credenciales.';
                break;
            case 'auth/invalid-email':
                errorMessage = 'El formato del email no es válido.';
                break;
            default:
                if (error instanceof Error && error.message) {
                    errorMessage = error.message;
                } else {
                    errorMessage = `Error inesperado: ${error.code || 'Código de error desconocido'}.`;
                }
                break;
        }
        displayMessage('error', 'Error al guardar perfil: ' + errorMessage, 0);
    } finally {
        updateSaveButtonState(); // Re-habilita el botón si no se redirigió y restaura el texto
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

    if (razonSocialPropietarioInput) razonSocialPropietarioInput.addEventListener('input', updateSaveButtonState);
    if (direccionPropietarioInput) direccionPropietarioInput.addEventListener('input', updateSaveButtonState);
    if (telefonoContactoPropietarioInput) telefonoContactoPropietarioInput.addEventListener('input', updateSaveButtonState);
    if (paginaWebPropietarioInput) paginaWebPropietarioInput.addEventListener('input', updateSaveButtonState);
    if (aliasBancarioPropietarioInput) aliasBancarioPropietarioInput.addEventListener('input', updateSaveButtonState);
    if (habilitacionMunicipalPropietarioInput) habilitacionMunicipalPropietarioInput.addEventListener('input', updateSaveButtonState);

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
        console.log("Usuario autenticado en propietario_test:", user.uid);
        loadUserProfile(user);
    } else {
        displayMessage('error', 'No autenticado. Redirigiendo a la página de inicio.', 0);
        setTimeout(() => {
            window.location.href = '/ingresoAValidacion.html';
        }, 2000);
    }
});
