// public/userService.js

// *********************************************************************************
// * 1. IMPORTACIONES (Firebase)                                                   *
// *********************************************************************************
import { auth, db } from './firebaseClient.js';
import {
    EmailAuthProvider,
    linkWithCredential,
    updateEmail,
    updatePassword,
    reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js"; // ¡¡¡SDK v10.10.0!!!
import {
    collection,
    doc,
    getDoc,
    updateDoc,
    setDoc,           // ¡¡¡NUEVO: Importado setDoc!!!
    serverTimestamp,  // ¡¡¡Restaurado: serverTimestamp!!!
    Timestamp         // ¡¡¡Restaurado: Timestamp!!!
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js"; // ¡¡¡SDK v10.10.0!!!


// *********************************************************************************
// * 2. FUNCIONES MODULARIZADAS                                                    *
// *********************************************************************************

/**
 * Guarda o actualiza el perfil del usuario en Firestore y maneja la autenticación.
 *
 * @param {string} currentUserUID - El UID actual del usuario.
 * @param {object} profileData - Objeto con los datos del perfil específicos del rol (razonSocial, direccion, etc.).
 * @param {string} emailToSave - El email que el usuario desea establecer/actualizar.
 * @param {string} passwordToSave - La contraseña que el usuario desea establecer/actualizar.
 * @param {'propietario'|'inquilino'} userRole - El rol del usuario ('propietario' o 'inquilino').
 * @returns {Promise<void>} Una promesa que se resuelve cuando el perfil se ha guardado.
 * @throws {Error} Lanza un error si hay problemas de autenticación o Firestore.
 */
export async function saveUserProfileAndGenerateFiscalData(currentUserUID, profileData, emailToSave, passwordToSave, userRole) {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("No hay usuario autenticado.");
    }

    // 1. Manejo de autenticación (Email/Password)
    if (user.isAnonymous) {
        console.log("DEBUG(userService): Intentando convertir usuario anónimo a email/password...");
        const credential = EmailAuthProvider.credential(emailToSave, passwordToSave);
        try {
            await linkWithCredential(user, credential);
            console.log("DEBUG(userService): Usuario anónimo convertido a usuario de email/password con éxito.");
        } catch (authError) {
            console.error("DEBUG(userService): Error(userService) al enlazar credenciales:", authError);
            if (authError.code === 'auth/credential-already-in-use' || authError.code === 'auth/email-already-in-use') {
                throw new Error('El email ya está en uso por otra cuenta. Intente iniciar sesión con ese email o usar otro.');
            } else if (authError.code === 'auth/requires-recent-login') {
                throw new Error('Su sesión anónima ha caducado. Por favor, reinicie el proceso de validación.');
            }
            throw authError; // Re-lanza otros errores de autenticación
        }
    } else {
        console.log("DEBUG(userService): Usuario no anónimo. Intentando actualizar email/password...");

        let hasEmailChanged = (emailToSave && emailToSave !== user.email);
        let hasPasswordChanged = (passwordToSave && passwordToSave.length >= 8);

        if (hasEmailChanged || hasPasswordChanged) {
            try {
                const credentialEmail = user.email || emailToSave;
                const authCredential = EmailAuthProvider.credential(credentialEmail, passwordToSave);
                await reauthenticateWithCredential(user, authCredential);
                console.log("DEBUG(userService): Usuario reautenticado exitosamente.");
            } catch (reauthError) {
                console.error("DEBUG(userService): Error(userService) durante la reautenticación:", reauthError);
                if (reauthError.code === 'auth/wrong-password') {
                    throw new Error('Contraseña incorrecta para reautenticar. Por favor, ingrese su contraseña actual.');
                }
                throw reauthError;
            }
        }

        if (hasEmailChanged) {
            await updateEmail(user, emailToSave);
            console.log("DEBUG(userService): Email de usuario actualizado.");
        }
        if (hasPasswordChanged) {
            await updatePassword(user, passwordToSave);
            console.log("DEBUG(userService): Contraseña de usuario actualizada.");
        }
    }

    // Asegurarse de tener el UID final después de cualquier cambio de autenticación
    await user.reload();
    const updatedUser = auth.currentUser;
    const finalUserUID = updatedUser.uid;

    console.log("DEBUG(userService): finalUserUID después de reload:", finalUserUID);
    
    // --- DEPURACIÓN DEL TOKEN CON UN CATCH MÁS ROBUSTO ---
    let idTokenClaims = null;
    try {
        const idTokenResult = await updatedUser.getIdTokenResult(true); // Forzar refresh del token
        idTokenClaims = idTokenResult.claims;
        console.log("DEBUG(userService): ID Token generado. Claims:", idTokenClaims);
        console.log("DEBUG(userService): ID Token UID:", idTokenClaims.user_id);
    } catch (tokenError) {
        console.error("DEBUG(userService): ERROR CRÍTICO al obtener ID Token. Esto podría causar el error de permisos en Firestore.", tokenError);
        throw new Error("No se pudo obtener el token de identificación de usuario. Por favor, inténtelo de nuevo. " + tokenError.message);
    }
    // --- FIN DEPURACIÓN ID TOKEN ---

    // 2. Preparar los datos del documento del usuario en Firestore
    const userDocRef = doc(db, 'users', finalUserUID);
    const userDocSnap = await getDoc(userDocRef);
    const userData = userDocSnap.exists() ? userDocSnap.data() : {};
    const validationProcess = userData.validationProcess || {};

    const validatedAt = validationProcess.lastUpdated && typeof validationProcess.lastUpdated.toDate === 'function' ? validationProcess.lastUpdated.toDate() : new Date();
    const expirationDateJS = new Date(validatedAt);

    if (userRole === 'propietario') {
        expirationDateJS.setFullYear(expirationDateJS.getFullYear() + 1);
    } else if (userRole === 'inquilino') {
        expirationDateJS.setMonth(expirationDateJS.getMonth() + 6);
    } else {
        expirationDateJS.setFullYear(expirationDateJS.getFullYear() + 1);
    }
    // Convertir el objeto Date de JS a un Timestamp de Firestore para que las reglas lo validen correctamente
    const expirationFirestoreTimestamp = Timestamp.fromDate(expirationDateJS);

    // *** RESTAURACIÓN DE LA LÓGICA DE UPDATES ORIGINAL CON setDoc y merge: true ***
    const updates = {
        email: emailToSave,
        ...profileData,
        'validationProcess.status': 'profile_completed_pending_fiscal_data',
        'validationProcess.expirationDate': expirationFirestoreTimestamp,
        lastUpdated: serverTimestamp() // Asegúrate de importar serverTimestamp
    };
    // *** FIN RESTAURACIÓN ***

    // 3. Realizar la operación de Firestore
    console.log("DEBUG(userService): Intentando actualizar/crear userDocRef:", userDocRef.path);
    console.log("DEBUG(userService): Con los updates para usuario:", updates);
    try {
        // *** CAMBIO CLAVE: Usar setDoc con merge: true para manejar la creación o actualización ***
        await setDoc(userDocRef, updates, { merge: true });
        console.log("DEBUG(userService): Documento de usuario en Firestore actualizado/creado CON EXITO.");
    } catch (firestoreError) {
        console.error("DEBUG(userService): ERROR al actualizar/crear documento de usuario en Firestore:", firestoreError);
        throw firestoreError;
    }
}
