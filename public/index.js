// public/index.js

// Importa las instancias de Firebase que necesitas desde firebaseClient.js
// firebaseClient.js ya maneja la inicialización de app, emuladores y App Check.
import { auth, db } from './firebaseClient.js';

// Importa las funciones específicas del SDK modular de Firebase Auth
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from 'firebase/auth';

// Importa las funciones específicas del SDK modular de Firebase Firestore
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp // Para usar FieldValue.serverTimestamp()
}
from 'firebase/firestore';


// Elementos del DOM
const loginSection = document.getElementById('login-section');
const loggedInSection = document.getElementById('logged-in-section');
const authDisplayEmail = document.getElementById('auth-display-email');
const authDisplayRole = document.getElementById('auth-display-role');
const adminLink = document.getElementById('admin-link'); // Enlace al panel admin
const statusMessageDiv = document.getElementById('status-message');

const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
// const registerButton = document.getElementById('register-button'); // Descomentar si se habilita el registro en el HTML


// Función para mostrar mensajes de estado
function showStatusMessage(message, isError = false) {
    statusMessageDiv.textContent = message;
    statusMessageDiv.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700');
    statusMessageDiv.classList.add(isError ? 'bg-red-100' : 'bg-green-100', isError ? 'text-red-700' : 'text-green-700');
    // Si quieres que el mensaje permanezca hasta que se haga otra acción, puedes quitar el setTimeout
    setTimeout(() => { statusMessageDiv.classList.add('hidden'); }, 5000); // Ocultar después de 5 segundos
}

// Manejar estado de autenticación
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Usuario logueado
        loginSection.classList.add('hidden');
        loggedInSection.classList.remove('hidden');
        authDisplayEmail.textContent = user.email;

        // Obtener rol del usuario desde Firestore
        try {
            // Usa la sintaxis modular de Firestore (doc, getDoc)
            const userDocRef = doc(db, 'users', user.uid);
            const userDocSnap = await getDoc(userDocRef);

            let role = 'Invitado'; // Rol por defecto si no se encuentra
            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                role = userData.role || 'propietario'; // 'propietario' si no hay rol específico
            } else {
                // Si el usuario no tiene un documento en Firestore, créalo con un rol por defecto
                // Usa la sintaxis modular de Firestore (doc, setDoc) y serverTimestamp
                await setDoc(doc(db, 'users', user.uid), {
                    email: user.email,
                    role: 'propietario', // Asignar 'propietario' por defecto
                    createdAt: serverTimestamp()
                }, { merge: true });
                role = 'propietario';
            }
            authDisplayRole.textContent = role.charAt(0).toUpperCase() + role.slice(1); // Capitalizar primera letra

            // Mostrar/ocultar enlace de admin basado en el rol
            if (role === 'admin') {
                adminLink.classList.remove('hidden');
            } else {
                adminLink.classList.add('hidden');
            }

        } catch (error) {
            console.error("Error al obtener el rol del usuario:", error);
            authDisplayRole.textContent = 'Error al cargar rol';
        }
    } else {
        // Usuario no logueado
        loginSection.classList.remove('hidden');
        loggedInSection.classList.add('hidden');
        adminLink.classList.add('hidden'); // Ocultar el enlace admin si no hay sesión
        authDisplayEmail.textContent = '';
        authDisplayRole.textContent = '';
        statusMessageDiv.classList.add('hidden'); // Ocultar mensaje de estado si no hay usuario
    }
});

// Event Listeners para autenticación
loginButton.addEventListener('click', async () => {
    const email = loginEmailInput.value;
    const password = loginPasswordInput.value;
    try {
        // Usa la sintaxis modular (auth, email, password)
        await signInWithEmailAndPassword(auth, email, password);
        showStatusMessage('Inicio de sesión exitoso.', false);
    } catch (error) {
        console.error("Error de login:", error);
        showStatusMessage(`Error al iniciar sesión: ${error.message}`, true);
    }
});

logoutButton.addEventListener('click', async () => {
    try {
        // Usa la sintaxis modular (auth)
        await signOut(auth);
        showStatusMessage('Sesión cerrada.', false);
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
        showStatusMessage(`Error al cerrar sesión: ${error.message}`, true);
    }
});

// Si deseas habilitar el registro directamente desde esta página, descomenta este bloque en el HTML y aquí.
/*
registerButton.addEventListener('click', async () => {
    const email = loginEmailInput.value;
    const password = loginPasswordInput.value;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Asigna un rol por defecto, ej. 'propietario' o 'guest'
        await setDoc(doc(db, 'users', userCredential.user.uid), {
            email: userCredential.user.email,
            role: 'propietario',
            createdAt: serverTimestamp()
        });
        showStatusMessage('Usuario registrado exitosamente. Por favor, inicia sesión.', false);
    } catch (error) {
        console.error("Error de registro:", error);
        showStatusMessage(`Error al registrar: ${error.message}`, true);
    }
});
*/
