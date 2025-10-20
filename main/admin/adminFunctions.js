// main/admin/adminFunctions.js

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// >>>>> MODIFICACIÓN CLAVE AQUÍ: Importar FieldValue y Timestamp directamente <<<<<
const { FieldValue, Timestamp } = require("firebase-admin/firestore"); 
// <<<<< FIN MODIFICACIÓN >>>>>

// Inicializar Firebase Admin con verificación (Asegura que se haga una vez)
try {
  if (!admin.apps.length) {
    admin.initializeApp();
    console.log('Firebase Admin inicializado correctamente en adminFunctions.js');
  }
} catch (error) {
  console.error('Error inicializando Firebase Admin en adminFunctions.js:', error);
  throw new Error('No se pudo inicializar Firebase Admin en adminFunctions.js');
}

const db = admin.firestore();

// >>>>> MANTENER ESTA LÍNEA DE LOG TEMPORALMENTE para depuración <<<<<
console.log("DEBUG adminFunctions: FieldValue is:", typeof FieldValue, FieldValue);
console.log("DEBUG adminFunctions: Timestamp is:", typeof Timestamp, Timestamp);
// >>>>> FIN LÍNEA DE LOG <<<<<


const { defineSecret } = require("firebase-functions/params");
const axios = require('axios');
const { v4: uuidv4 } = require("uuid"); 

// Importación de utilidades (SOLO UNA VEZ AL PRINCIPIO DEL ARCHIVO)
const { getAuthenticatedUserRole, IS_DEV_MODE, isValidEmailFormat } = require('../utils/authUtils');
const RECAPTCHA_SECRET_KEY = defineSecret("RECAPTCHA_SECRET_KEY");
const FIREBASE_WEB_API_KEY = defineSecret("FIREBASE_WEB_API_KEY");


/**
 * Cloud Function: Autentica un usuario con email/contraseña y reCAPTCHA,
 * luego emite un token personalizado.
 */
exports.authenticateAndMintToken = onCall(
  {
    secrets: [RECAPTCHA_SECRET_KEY, FIREBASE_WEB_API_KEY],
  },
  async (request) => { // <-- Firma de v2: solo 'request'
   console.log("authenticateAndMintToken received request:", request);
   const { email, password, recaptchaToken } = request.data; // Acceder a request.data
    console.info(`Attempting custom token login for email: ${email}`);

    // 1. Validar inputs básicos
    if (!email || !password || (!recaptchaToken && !IS_DEV_MODE)) {
      throw new HttpsError('invalid-argument', 'Faltan el correo electrónico, la contraseña o el token reCAPTCHA (requerido en producción).');
    }
    if (!isValidEmailFormat(email)) {
      throw new HttpsError('invalid-argument', 'El formato del correo electrónico no es válido.');
    }

    const recaptchaSecret = RECAPTCHA_SECRET_KEY.value(); 
    const firebaseWebApiKey = FIREBASE_WEB_API_KEY.value(); 

    if (!IS_DEV_MODE && !recaptchaSecret) {
      console.error("RECAPTCHA_SECRET_KEY is not configured. reCAPTCHA verification will fail.");
      throw new HttpsError('internal', 'Configuración de seguridad de reCAPTCHA incompleta.');
    } else if (recaptchaToken && recaptchaSecret && !IS_DEV_MODE) {
      try {
        const recaptchaVerifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${recaptchaSecret}&response=${recaptchaToken}`;
        const recaptchaResponse = await axios.post(recaptchaVerifyUrl);
        const { success, score, 'error-codes': errorCodes } = recaptchaResponse.data;

        if (!success || score < 0.5) { 
          console.warn(`reCAPTCHA verification failed for email: ${email}, score: ${score}, errors: ${errorCodes ? errorCodes.join(', ') : 'N/A'}`);
          throw new HttpsError(
            'unauthenticated',
            'Fallo en la verificación de seguridad (reCAPTCHA). Intente de nuevo.'
          );
        }
        console.info(`reCAPTCHA score for ${email}: ${score}`);
      } catch (error) {
        console.error("Error verifying reCAPTCHA:", error);
        throw new HttpsError(
          'internal',
          'Error interno al verificar reCAPTCHA.'
        );
      }
    } else {
      console.info("Skipping reCAPTCHA verification (DEV_MODE or RECAPTCHA_SECRET_KEY not configured/recaptchaToken not provided).");
    }

    if (!firebaseWebApiKey && !IS_DEV_MODE) {
      console.error("FIREBASE_WEB_API_KEY is not configured. Cannot authenticate user.");
      throw new HttpsError('internal', 'Configuración de autenticación incompleta (API Key web de Firebase).');
    }

    let uid;
    try {
      let authApiBaseUrl;
      if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
        console.info(`Redirecting Auth REST API call to emulator at ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);
        authApiBaseUrl = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;
      } else {
        authApiBaseUrl = `https://identitytoolkit.googleapis.com`;
      }

      const authApiUrl = `${authApiBaseUrl}/v1/accounts:signInWithPassword?key=${firebaseWebApiKey}`

      const authApiResponse = await axios.post(authApiUrl, {
        email: email,
        password: password,
        returnSecureToken: true 
      });

      uid = authApiResponse.data.localId; 
      console.info(`User authenticated via REST API. UID: ${uid}`);

    } catch (error) {
      console.error("Error authenticating user via Firebase Auth REST API:", error.response?.data?.error || error);
      const authError = error.response?.data?.error;
      if (authError && authError.message) {
        if (authError.message === 'EMAIL_NOT_FOUND' || authError.message === 'INVALID_PASSWORD') {
          throw new HttpsError('unauthenticated', 'Correo electrónico o contraseña inválidos.');
        } else if (authError.message === 'USER_DISABLED') {
          throw new HttpsError('unauthenticated', 'La cuenta de usuario está deshabilitada.');
        }
      }
      throw new HttpsError('internal', error.message || 'Error al autenticar credenciales.');
    }

    try {
      const userDocRef = db.collection("users").doc(uid);
      const userDoc = await userDocRef.get();
      let userRole = "guest"; 

      if (userDoc.exists) {
        userRole = userDoc.data().role || "guest";
        if (userDoc.data().email !== email) {
          await userDocRef.update({ email: email, lastUpdated: FieldValue.serverTimestamp() });
        }
      } else {
        await userDocRef.set({
          email: email,
          role: "guest", 
          createdAt: FieldValue.serverTimestamp(),
          lastUpdated: FieldValue.serverTimestamp(),
        }, { merge: true });
        console.info(`Created new user document for UID: ${uid} with role: guest.`);
      }

      if (userRole === "propietario") {
        const now = Timestamp.now().toDate();
        const q = db.collection("validaciones")
          .where("ownerUid", "==", uid)
          .where("tipoUsuario", "==", "propietario")
          .where("isValidationActive", "==", true)
          .where("apiValidacionExitosa", "==", true)
          .where("pagoConfirmado", "==", true)
          .orderBy("fechaVencimiento", "desc")
          .limit(1); 

        const snapshot = await q.get();

        let hasActiveProprietaryValidation = false;
        if (!snapshot.empty) {
          const validationData = snapshot.docs[0].data();
          if (validationData.fechaVencimiento && validationData.fechaVencimiento.toDate() > now) {
            hasActiveProprietaryValidation = true;
          }
        }

        if (!hasActiveProprietaryValidation) {
          console.warn(`Login failed for proprietor ${email} (UID: ${uid}): No active and valid proprietor validation found.`);
          throw new HttpsError(
            'failed-precondition',
            'Su cuenta de propietario no tiene una validación activa y válida. Por favor, asegúrese de tener una validación actualizada.'
          );
        }
      } else {
        console.info(`User ${email} (UID: ${uid}) is not a proprietor (${userRole}). Skipping active validation check.`);
      }

      const customToken = await admin.auth().createCustomToken(uid);
      console.info(`Custom token minted for UID: ${uid}`);

      return { customToken }; 

    } catch (error) {
      console.error("Error during user role/validation check or custom token minting:", error);
      if (error instanceof HttpsError) {
        throw error; 
      }
      throw new HttpsError(
        'internal',
        'Error interno al verificar el perfil de usuario o generar el token de autenticación.',
        error.message
      );
    }
  }
);

/**
 * Cloud Function para crear una nueva validación.
 */
exports.crearNuevaValidacion = onCall(
  {
    enforceAppCheck: false,
  },
  async (request) => { // <-- SINTAXIS V2
    const requestData = request.data; // Acceder a request.data

    const userInfo = await getAuthenticatedUserRole(request); // <-- OBTENER userInfo
    if (userInfo.role !== "propietario" && userInfo.role !== "admin") {
      console.warn(`Intento de crear validación por rol no autorizado: UID ${userInfo.uid}, Rol ${userInfo.role}`);
      throw new HttpsError("permission-denied", "Solo propietarios o administradores pueden crear validaciones.");
    }

    const { searchId, tipoUsuario, datosIdentidad, password } = requestData;

    if (!searchId || typeof searchId !== "string" || !searchId.trim()) {
      throw new HttpsError("invalid-argument", "El campo searchId es obligatorio y debe ser una cadena.");
    }
    if (tipoUsuario !== "inquilino" && tipoUsuario !== "propietario") {
      throw new HttpsError("invalid-argument", "tipoUsuario debe ser 'inquilino' o 'propietario'.");
    }
    if (!datosIdentidad || typeof datosIdentidad !== "object") {
      throw new HttpsError("invalid-argument", "datosIdentidad es obligatorio y debe ser un objeto.");
    }

    let finalDocId = searchId.trim();

    if (tipoUsuario === "propietario") {
      if (!datosIdentidad.emailContacto || !isValidEmailFormat(datosIdentidad.emailContacto)) {
        throw new HttpsError("invalid-argument", "El email de contacto es obligatorio y debe ser un email válido.");
      }
      if (!password || typeof password !== "string" || password.length < 6) {
        throw new HttpsError("invalid-argument", "La contraseña es obligatoria y debe tener al menos 6 caracteres.");
      }
    } else if (tipoUsuario === "inquilino") {
      if (!datosIdentidad.identificacionFiscalNumero || typeof datosIdentidad.identificacionFiscalNumero !== "string" || !datosIdentidad.identificacionFiscalNumero.trim()) {
        throw new HttpsError("invalid-argument", "Para inquilinos, el campo 'identificacionFiscalNumero' (DNI) en datosIdentidad es obligatorio y debe ser una cadena.");
      }
      finalDocId = `${searchId.trim()}-${datosIdentidad.identificacionFiscalNumero.trim()}`;
    }

    const validationDocRef = db.collection("validaciones").doc(finalDocId);
    const existingDoc = await validationDocRef.get();
    if (existingDoc.exists) {
      throw new HttpsError("already-exists", `Ya existe una validación con ID '${finalDocId}'.`);
    }

    const internalId = uuidv4();

    const newValidationData = {
      internalId,
      searchIdDocument: finalDocId,
      tipoUsuario,
      ownerUid: userInfo.uid, // userInfo ya está disponible
      datosIdentidad,
      estadoValidacion: "pendiente",
      fechaCreacion: FieldValue.serverTimestamp(),
      pagoConfirmado: false,
      apiValidacionExitosa: false,
      fechaVencimiento: null,
      logAuditoria: [],
      isValidationActive: true,
    };

    let createdAuthUserUid = null;

    try {
      await db.runTransaction(async (transaction) => {
        if (tipoUsuario === "propietario") {
          let authUser;
          try {
            authUser = await admin.auth().getUserByEmail(datosIdentidad.emailContacto);
            console.info(`Usuario Auth ${datosIdentidad.emailContacto} ya existe. UID: ${authUser.uid}`);
          } catch (error) {
            if (error.code === 'auth/user-not-found') {
              authUser = await admin.auth().createUser({
                email: datosIdentidad.emailContacto,
                password: password,
                displayName: datosIdentidad.titular || datosIdentidad.razonSocial || null,
              });
              createdAuthUserUid = authUser.uid;
              console.info(`Usuario Auth ${datosIdentidad.emailContacto} creado. UID: ${authUser.uid}`);
            } else {
              console.error("Error al buscar/crear usuario Auth:", error);
              throw new HttpsError(error.code.substring(5) || 'internal', error.message);
            }
          }

          const ownerProfileRef = db.collection("users").doc(authUser.uid);
          transaction.set(ownerProfileRef, {
            email: authUser.email,
            role: "propietario", 
            lastUpdated: FieldValue.serverTimestamp(),
          }, { merge: true });

          newValidationData.ownerUid = authUser.uid; 
        }

        transaction.set(validationDocRef, newValidationData); 
      });

      console.info(`Nueva validación creada con ID ${finalDocId} y internalId ${internalId} por usuario ${userInfo.uid}`); // userInfo ya está disponible

      return {
        id: finalDocId,
        internalId,
        mensaje: "Validación creada con éxito",
      };

    } catch (error) {
      console.error("Error en la transacción al crear validación o usuario Auth:", { error: error.message, code: error.code, searchId: finalDocId });

      if (createdAuthUserUid) {
        try {
          await admin.auth().deleteUser(createdAuthUserUid);
          console.warn(`Usuario Auth huérfano ${createdAuthUserUid} eliminado debido a fallo en la transacción de Firestore.`);
        } catch (deleteError) {
          console.error(`Error al intentar eliminar usuario Auth huérfano ${createdAuthUserUid}:`, deleteError);
        }
      }

      if (error.code && typeof error.code === 'string' && error.code.startsWith('auth/')) {
        throw new HttpsError(error.code.substring(5), error.message);
      }
      throw new HttpsError("internal", error.message || "Error al crear la validación o el usuario asociado.");
    }
  }
);


exports.consultarEstadoValidacion = onCall(
  {}, 
  async (request) => { // <-- SINTAXIS V2
    const requestData = request.data; // Acceder a request.data
    if (!requestData.searchQuery || typeof requestData.searchQuery !== "string" || !requestData.searchQuery.trim()) {
      throw new HttpsError("invalid-argument", "El campo searchQuery es requerido.");
    }
    const searchQuery = requestData.searchQuery.trim();

    const callerInfo = await getAuthenticatedUserRole(request); // <-- OBTENER callerInfo
    const { uid: callerUid, role: callerRole } = callerInfo;

    console.info(`Request por ${callerRole} (UID: ${callerUid || "N/A"}) para searchId: ${searchQuery}`);

    const validationDocRef = db.collection("validaciones").doc(searchQuery);
    const validationDoc = await validationDocRef.get();
    if (!validationDoc.exists) {
      throw new HttpsError("not-found", `No se encontró una validación con el ID '${searchQuery}'.`);
    }

    const validationData = validationDoc.data();
    const validationTipoUsuario = validationData.tipoUsuario;
    const validationOwnerUid = validationData.ownerUid;

    let accessLevel = "denied"; 
    if (callerRole === "admin") {
      accessLevel = "full"; 
    } else if (
      validationTipoUsuario === "propietario" &&
      callerRole === "propietario" &&
      callerUid &&
      validationOwnerUid === callerUid
    ) {
      accessLevel = "full"; 
    } else if (
      validationTipoUsuario === "inquilino" &&
      callerRole === "propietario" &&
      callerUid &&
      validationOwnerUid === callerUid
    ) {
      accessLevel = "full"; 
    } else if (
      validationTipoUsuario === "inquilino" &&
      callerRole === "inquilino" &&
      callerUid &&
      searchQuery === callerUid 
    ) {
      accessLevel = "public"; 
    } else if (
      validationTipoUsuario === "propietario" &&
      validationData.isPubliclyVisible === true && 
      callerRole !== "unauthenticated" && 
      callerRole !== "guest" 
    ) {
      accessLevel = "public"; 
    }

   
    if (accessLevel === "denied") {
      console.warn(`Permiso denegado para consultar validación '${searchQuery}'. Caller UID: ${callerUid}, Rol: ${callerRole}, OwnerUID: ${validationOwnerUid}, Tipo Validación: ${validationTipoUsuario}`);
      throw new HttpsError("permission-denied", "No tiene permisos para ver esta validación.");
    }

    const now = Timestamp.now().toDate();
    let isValidationActive =
      validationData.apiValidacionExitosa &&
      validationData.pagoConfirmado &&
      validationData.fechaVencimiento &&
      validationData.fechaVencimiento.toDate() > now &&
      validationData.isValidationActive; 

    if (accessLevel === "full" && !isValidationActive) {
      console.warn(`Validacion ${searchQuery} no está activa.`);
    }

    // Asegúrate de tener una función getMaskedIdentityData definida en algún lugar, por ejemplo en authUtils.js o en un utils/dataMasking.js
    // Si no existe, esto causará un error. Considera añadirla o eliminar esta línea si no se usa.
    // const datosIdentidadEnmascarados = getMaskedIdentityData(validationData.datosIdentidad || {}, accessLevel, validationTipoUsuario); 
    const datosIdentidadEnmascarados = validationData.datosIdentidad; // Temporalmente sin enmascarar si la función no existe

    return {
      searchId: searchQuery,
      internalId: validationDoc.id,
      tipoUsuario: validationTipoUsuario,
      estadoValidacion: validationData.estadoValidacion,
      fechaVencimiento: validationData.fechaVencimiento ? validationData.fechaVencimiento.toDate() : null,
      message: `Consulta exitosa para ${validationTipoUsuario}.`,
      datosIdentidad: datosIdentidadEnmascarados,
      accessLevelUsed: accessLevel,
      isValidationActive,
    };
  }
);


exports.deactivateValidation = onCall(
  {},
  async (request) => { // <-- SINTAXIS V2
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "La solicitud debe ser autenticada.");
    }

    const callerUid = request.auth.uid;
    const validationId = request.data.validationId; // Acceder a request.data

    if (!validationId || typeof validationId !== 'string' || validationId.trim() === '') {
      throw new HttpsError("invalid-argument", "Se requiere el 'validationId' para dar de baja la validación.");
    }

    try {
      const callerInfo = await getAuthenticatedUserRole(request); // <-- OBTENER callerInfo
      if (callerInfo.role !== "propietario" && callerInfo.role !== "admin") {
        console.warn(`Intento de desactivar validación por rol no autorizado: UID ${callerUid}, Rol ${callerInfo.role}`);
        throw new HttpsError(
          "permission-denied",
          "Solo los usuarios con rol 'propietario' o 'admin' pueden dar de baja validaciones."
        );
      }

      const validationRef = db.collection("validaciones").doc(validationId);
      const validationSnap = await validationRef.get();

      if (!validationSnap.exists) {
        throw new HttpsError(
          "not-found",
          "La validación especificada no existe."
        );
      }

      const currentValidationData = validationSnap.data();

      if (currentValidationData.ownerUid !== callerUid && callerInfo.role !== "admin") {
        console.warn(`Propietario ${callerUid} intentó dar de baja validación ${validationId} de otro propietario (${currentValidationData.ownerUid}).`);
        throw new HttpsError(
          "permission-denied",
          "No tiene permisos para dar de baja esta validación. Solo puede desactivar validaciones de las que es propietario."
        );
      }

      if (!currentValidationData.isValidationActive) {
        console.info(`Validación ${validationId} ya estaba inactiva. No se requieren cambios.`);
        return { success: true, message: "La validación ya se encontraba inactiva." };
      }
      await validationRef.update({
        isValidationActive: false,
        deactivatedAt: FieldValue.serverTimestamp(),
        estadoValidacion: "inactiva",
        logAuditoria: FieldValue.arrayUnion({
          timestamp: Timestamp.now(),
          action: `Validación desactivada por propietario (UID: ${callerUid})`,
          details: `Validación ID: ${validationId}`
        }),
      });

      console.info(`Validación ${validationId} desactivada por el propietario ${callerUid}.`);

      return { success: true, message: "Validación dada de baja exitosamente." };

    } catch (error) {
      console.error("Error al dar de baja la validación:", error);
      if (error instanceof HttpsError) {
        throw error; 
      }
      throw new HttpsError(
        "internal",
        "Error interno del servidor al procesar la solicitud de baja.",
        error.message
      );
    }
  }
);


exports.searchUserValidations = onCall(
  {
    // enforceAppCheck: true, // Habilitar en producción
  },
  async (request) => { // <-- SINTAXIS V2
    const callerInfo = await getAuthenticatedUserRole(request); // <-- OBTENER callerInfo
    const { uid: callerUid, role: callerRole } = callerInfo;

    if (callerRole !== "admin") {
      console.warn(`Intento de buscar historial de validaciones por rol no autorizado: UID ${callerUid}, Rol ${callerRole}`);
      throw new HttpsError("permission-denied", "Solo administradores pueden buscar historial de validaciones.");
    }

    const { dni, name } = request.data; // Acceder a request.data

    const trimmedDni = dni ? dni.trim() : '';
    const trimmedName = name ? name.trim() : '';

    if (!trimmedDni && !trimmedName) {
      throw new HttpsError('invalid-argument', 'Se requiere al menos un DNI o un Nombre y Apellido para la búsqueda.');
    }

    let validationsSnapshot;
    let queryRef = db.collection('validaciones'); 
    let userFound = false; 

    if (trimmedDni) {
      console.info(`Buscando validaciones por DNI: ${trimmedDni}`);
      validationsSnapshot = await queryRef
        .where('datosIdentidad.identificacionFiscalNumero', '==', trimmedDni)
        .orderBy('fechaCreacion', 'desc')
        .get();
      userFound = !validationsSnapshot.empty;
    }

    if (!userFound && trimmedName) {
      console.info(`Buscando validaciones por Nombre y Apellido: ${trimmedName}`);
      validationsSnapshot = await queryRef
        .where('datosIdentidad.nombreCompleto', '==', trimmedName)
        .orderBy('fechaCreacion', 'desc')
        .get();
      userFound = !validationsSnapshot.empty;
    }

    if (!userFound && trimmedDni && trimmedName) {
      console.info(`Buscando validaciones por DNI y Nombre y Apellido combinados: ${trimmedDni} & ${trimmedName}`);
      validationsSnapshot = await queryRef
        .where('datosIdentidad.identificacionFiscalNumero', '==', trimmedDni)
        .where('datosIdentidad.nombreCompleto', '==', trimmedName)
        .orderBy('fechaCreacion', 'desc')
        .get();
      userFound = !validationsSnapshot.empty;
    }

    const allValidations = [];
    if (validationsSnapshot && !validationsSnapshot.empty) {
      validationsSnapshot.forEach(doc => {
        const data = doc.data();
        allValidations.push({
          id: doc.id,
          userId: data.ownerUid,
          status: data.estadoValidacion,
          startDate: data.fechaCreacion,
          endDate: data.fechaVencimiento,
          equifaxToken: data.apiEquifaxToken || 'N/A', 
          identityData: data.datosIdentidad
        });
      });
    }

    return {
      userFound: userFound,
      validations: allValidations
    };
  }
);
