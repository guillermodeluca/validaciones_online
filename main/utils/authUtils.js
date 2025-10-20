// main/utils/authUtils.js (Verifica que sea ESTE CONTENIDO)

const admin = require("firebase-admin");
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

const IS_DEV_MODE = process.env.NODE_ENV !== 'production' && process.env.FUNCTIONS_EMULATOR === 'true';

function isValidEmailFormat(email) {
  const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(String(email).toLowerCase());
}

async function getAuthenticatedUserRole(request) {
    console.log("AuthUtils: getAuthenticatedUserRole - Iniciando.");
    let uid = null;
    let email = null;
    let role = 'unauthenticated'; 

    if (request.auth) {
        console.log("AuthUtils: request.auth (initial):", JSON.stringify(request.auth, null, 2));
        uid = request.auth.uid;
        email = request.auth.token?.email || null;

        if (uid) {
            console.log(`AuthUtils: Autenticado REAL. UID: ${uid}, Email (from token): ${email}`);
            const userDocRef = db.collection('users').doc(uid);
            const userDocSnap = await userDocRef.get();

            if (userDocSnap.exists) {
                const userData = userDocSnap.data();
                role = userData.role || 'guest';
                console.log(`AuthUtils: User doc ${uid} existe. Rol en Firestore: ${role}.`);
            } else {
                console.warn(`AuthUtils: User doc ${uid} NO existe. Asignando rol 'guest'.`);
                role = 'guest';
            }
        } else {
            console.warn("AuthUtils: request.auth existe, pero UID es null. Asignando rol 'unauthenticated'.");
            role = 'unauthenticated';
        }
    } else {
        console.warn("AuthUtils: No autenticado. Asignando rol 'unauthenticated'.");
    }

    console.log(`AuthUtils: Final - UID: ${uid}, Email: ${email}, Rol: ${role}`);
    return { uid, email, role };
}

module.exports = {
  getAuthenticatedUserRole,
  IS_DEV_MODE,
  isValidEmailFormat,
};
