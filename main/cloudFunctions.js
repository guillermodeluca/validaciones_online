// ====================================================================================================
// =================================== ARCHIVO DE CLOUD FUNCTIONS =====================================
// =
// = Antes de desplegar a producción, revisa cuidadosamente todos los comentarios
// = marcados con "[PRODUCCIÓN: ¡ATENCIÓN!]" y asegúrate de entender y aplicar
// = las medidas de seguridad y optimización necesarias.
// =
// ====================================================================================================

// NUEVO: Importaciones para Cloud Functions de 2ª Generación
const { onCall } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params"); // Para el manejo seguro de secretos

const admin = require("firebase-admin");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const jwt = require("jsonwebtoken"); // Usado para decodificar tokens en el emulador, no para verificación de firma en producción.
const { v4: uuidv4 } = require("uuid"); // Generador de UUIDs
const axios = require('axios'); // Asegúrate de haberlo instalado con 'npm install axios'

// Inicializa el Admin SDK si no ha sido inicializado ya.
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// --- Función auxiliar para validar formato de email ---
function isValidEmailFormat(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
// ----------------------------------------------------

// ====================================================================================================
// =================================== CONFIGURACIÓN DE MODO DE DESARROLLO ==========================
// Esta variable será 'true' si la función se ejecuta en el Firebase Emulator Suite,
// o si la variable de entorno NODE_ENV está configurada como 'development'.
//
// [PRODUCCIÓN: ¡ATENCIÓN!] Asegúrate de que en tu entorno de producción NODE_ENV no sea 'development'
// y que el emulador no esté activo. La lógica de bypass de seguridad para desarrollo DEBE
// ser deshabilitada o eliminada en producción.
const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
const IS_DEV_MODE = isEmulator || process.env.NODE_ENV === "development";

// ====================================================================================================
// =================================== CLAVES SECRETAS (PARA PRODUCCIÓN) ==============================
// NUEVO: Define tus secretos usando defineSecret.
// Estos nombres deben coincidir con los que configuraste con `firebase functions:secrets:set`.
const RECAPTCHA_SECRET_KEY = defineSecret("RECAPTCHA_SECRET_KEY");
const FIREBASE_WEB_API_KEY = defineSecret("FIREBASE_WEB_API_KEY");

// ====================================================================================================
// NUEVO: Opciones globales para todas las funciones.
// Aquí puedes establecer la región y otras configuraciones comunes.
setGlobalOptions({
  region: "southamerica-east1",
  // Puedes añadir aquí opciones por defecto como cpu, memory, concurrency
  // cpu: 1, // Por ejemplo, 1 CPU por defecto
  // memory: "256MiB", // Por ejemplo, 256MB de memoria por defecto
  // concurrency: 80, // Límite de concurrencia para funciones HTTP/Callable
});
// ====================================================================================================


/**
 * Función auxiliar para obtener la información del rol del usuario autenticado.
 * Incluye lógica para simular usuarios en modo de desarrollo.
 */
async function getAuthenticatedUserRole(context) {
  // functions.logger.debug("getAuthenticatedUserRole: Estado de context.auth al inicio", {
  //   contextAuth: context.auth,
  //   contextAuthUid: context.auth?.uid,
  //   contextAuthToken: context.auth?.token,
  // });

  let uid = null;
  let emailFromToken = "N/A";

  // PRIORIDAD 1: context.auth.uid proporcionado directamente por Firebase (el método más seguro y en producción)
  if (context.auth && context.auth.uid) {
    uid = context.auth.uid;
    emailFromToken = context.auth.token?.email || "N/A";
    // functions.logger.debug(`Auth: context.auth.uid detectado: ${uid}`);
  }
  // PRIORIDAD 2: Intento de extraer UID y Email del token si context.auth no se popula (SOLO EN EMULADOR)
  // Esto es un workaround para el emulador, donde context.auth a veces no se popula completamente.
  else if (isEmulator && context.rawRequest?.headers?.authorization) {
    // functions.logger.debug("Auth: context.auth.uid NO detectado, intentando leer Authorization header en emulador.");
    const authHeader = context.rawRequest.headers.authorization;
    const tokenMatch = authHeader.match(/^Bearer\s(.+)/i);
    const token = tokenMatch ? tokenMatch[1] : null;

    if (token) {
      try {
        const decodedToken = jwt.decode(token); // Decodificar SIN VERIFICAR FIRMA para el emulador.
        // functions.logger.debug("Auth: Token decodificado manualmente en emulador.", decodedToken);

        const uidFromToken = decodedToken?.user_id || decodedToken?.sub;
        const emailFromDecodedToken = decodedToken?.email || "N/A";

        if (uidFromToken) {
          uid = uidFromToken;
          emailFromToken = emailFromDecodedToken;
          // functions.logger.debug(`Auth: UID y email decodificados del token en emulador: ${uid}, ${emailFromToken}`);
        }
      } catch (e) {
        console.error("Auth: Error al decodificar token manualmente desde Authorization header en emulador", e); // Usar console.error directamente
      }
    }
  }

  // Si tenemos un UID (autenticado real o manualmente en emulador), buscamos/creamos su perfil en Firestore
  if (uid) {
    const userDocRef = db.collection("users").doc(uid);
    const userDoc = await userDocRef.get();

    if (userDoc.exists) {
      console.info(`Auth: Usuario encontrado en Firestore. UID: ${uid}, Rol: ${userDoc.data().role}`); // Usar console.info
      return {
        uid,
        role: userDoc.data().role || "guest", // Rol por defecto si no está definido en Firestore
        email: userDoc.data().email || emailFromToken,
      };
    } else {
      // Usuario autenticado, pero no tiene documento en Firestore. Crear uno con rol 'guest'.
      console.info(`Auth: Usuario autenticado sin documento en Firestore. Creando para UID: ${uid}`); // Usar console.info
      await userDocRef.set(
        {
          email: emailFromToken,
          role: "guest", // Rol por defecto para nuevos usuarios autenticados
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return { uid, role: "guest", email: emailFromToken };
    }
  }

  // PRIORIDAD 3: Usuario simulado para desarrollo (SOLO si no se detecta autenticación real)
  // [PRODUCCIÓN: ¡ATENCIÓN!] Esta sección DEBE ser eliminada o deshabilitada en producción.
  // Permite simular un usuario sin necesidad de autenticación real, útil para pruebas de funciones.
  if (IS_DEV_MODE) {
    console.info("Auth: Modo desarrollo activo. Usando usuario simulado (ninguna autenticación real detectada)."); // Usar console.info
    const simulatedUser = {
      uid: "usuario_simulado_dev", // Un UID fijo para pruebas de desarrollo
      role: "propietario",         // <--- MODIFICACIÓN AQUÍ: Ahora simula un 'propietario'
      email: "dev@simulado.local",
    };
    return simulatedUser;
  }

  // ÚLTIMA INSTANCIA: No hay autenticación válida (ni real ni simulada), y NO es modo de desarrollo
  console.warn("Auth: No se detectó autenticación válida. Continuando como 'guest'."); // Usar console.warn
  return { uid: null, role: "guest", email: "N/A" };
}

/**
 * Función auxiliar para enmascarar datos de identidad según el nivel de acceso.
 * Se corrigió la prioridad en la asignación de 'razonSocial' para que tome el campo 'razonSocial' si existe.
 */
function getMaskedIdentityData(originalData, accessLevel, type) {
  if (accessLevel === "full") {
    // Acceso completo: devuelve todos los datos originales
    return {
      ...originalData,
      // Prioriza originalData.razonSocial. Si no existe, usa titular o nombreEstablecimiento como respaldo.
      razonSocial: originalData.razonSocial || originalData.titular || originalData.nombreEstablecimiento || "",
    };
  }

  if (accessLevel === "public") {
    // Acceso público: devuelve solo los datos designados como públicos
    const maskedData = {
      // Prioriza originalData.razonSocial. Si no existe, usa titular o nombreEstablecimiento como respaldo.
      razonSocial: originalData.razonSocial || originalData.titular || originalData.nombreEstablecimiento || "",
      localidad: originalData.localidad || "",
      pais: originalData.pais || "",
    };

    if (type === "propietario") {
      // Datos públicos específicos para propietario.
      // 'razonSocial' ya está asignada correctamente arriba, no necesita redefinirse aquí.
      maskedData.paginaWeb = originalData.paginaWeb || "";
      maskedData.nombreEstablecimiento = originalData.nombreEstablecimiento || "";
      maskedData.emailContacto = originalData.emailContacto || ""; // Considera si este debe ser público
      maskedData.telefonoContacto = originalData.telefonoContacto || ""; // Considera si este debe ser público
      maskedData.identificacionFiscalNumero = originalData.identificacionFiscalNumero || ""; // Considera si este debe ser público (DNI/CUIT)
      maskedData.alias = originalData.alias || "";
      // La dirección se omite aquí.
      maskedData.habilitacionMunicipal = originalData.habilitacionMunicipal || "";
    } else if (type === "inquilino") {
      // Datos públicos específicos para inquilino.
      // 'razonSocial' ya está asignada correctamente arriba.
      // Para inquilinos, si razonSocial no viene, tomará 'titular' que suele ser el nombre de la persona,
      // lo cual es el comportamiento esperado.
      maskedData.nombreCompleto = originalData.titular || "Inquilino Validado"; // Nombre completo o un placeholder genérico
      maskedData.dni = originalData.dni || ""; // Considera si el DNI debe ser público
      maskedData.emailContacto = originalData.emailContacto || ""; // Considera si este debe ser público
      maskedData.telefonoContacto = originalData.telefonoContacto || ""; // Considera si este debe ser público
      // La dirección se omite aquí.
    }
    return maskedData;
  }

  // Acceso denegado o nivel no reconocido: devuelve solo información básica (razon social, localidad, pais)
  return {
    // Prioriza originalData.razonSocial. Si no existe, usa titular o nombreEstablecimiento como respaldo.
    razonSocial: originalData.razonSocial || originalData.titular || originalData.nombreEstablecimiento || "",
    localidad: originalData.localidad || "",
    pais: originalData.pais || "",
  };
}

/**
 * Cloud Function para crear una nueva validación.
 */
exports.crearNuevaValidacion = onCall(
  {
    // Las opciones como region y runWith (enforceAppCheck) se pasan aquí
    enforceAppCheck: false, // [PRODUCCIÓN: ¡ATENCIÓN!] Elimina o ajusta el 'enforceAppCheck: false' en producción.
  },
  async (data, context) => {
    const requestData = data.data || data;

    const userInfo = await getAuthenticatedUserRole(context);

    if (userInfo.role !== "propietario" && userInfo.role !== "admin") {
      console.warn(`Intento de crear validación por rol no autorizado: UID ${userInfo.uid}, Rol ${userInfo.role}`);
      throw new onCall.HttpsError("permission-denied", "Solo propietarios o administradores pueden crear validaciones.");
    }

    const { searchId, tipoUsuario, datosIdentidad, password } = requestData;

    if (!searchId || typeof searchId !== "string" || !searchId.trim()) {
      throw new onCall.HttpsError("invalid-argument", "El campo searchId es obligatorio y debe ser una cadena.");
    }
    if (tipoUsuario !== "inquilino" && tipoUsuario !== "propietario") {
      throw new onCall.HttpsError("invalid-argument", "tipoUsuario debe ser 'inquilino' o 'propietario'.");
    }
    if (!datosIdentidad || typeof datosIdentidad !== "object") {
      throw new onCall.HttpsError("invalid-argument", "datosIdentidad es obligatorio y debe ser un objeto.");
    }

    let finalDocId = searchId.trim();

    if (tipoUsuario === "propietario") {
      if (!datosIdentidad.emailContacto || !isValidEmailFormat(datosIdentidad.emailContacto)) {
        throw new onCall.HttpsError("invalid-argument", "El email de contacto es obligatorio y debe ser un email válido.");
      }
      if (!password || typeof password !== "string" || password.length < 6) {
        throw new onCall.HttpsError("invalid-argument", "La contraseña es obligatoria y debe tener al menos 6 caracteres.");
      }
    } else if (tipoUsuario === "inquilino") {
      if (!datosIdentidad.identificacionFiscalNumero || typeof datosIdentidad.identificacionFiscalNumero !== "string" || !datosIdentidad.identificacionFiscalNumero.trim()) {
        throw new onCall.HttpsError("invalid-argument", "Para inquilinos, el campo 'identificacionFiscalNumero' (DNI) en datosIdentidad es obligatorio y debe ser una cadena.");
      }
      finalDocId = `${searchId.trim()}-${datosIdentidad.identificacionFiscalNumero.trim()}`;
    }

    const validationDocRef = db.collection("validaciones").doc(finalDocId);
    const existingDoc = await validationDocRef.get();
    if (existingDoc.exists) {
      throw new onCall.HttpsError(
        "already-exists",
        `Ya existe una validación con ID '${finalDocId}'.`
      );
    }

    const internalId = uuidv4();

    const newValidationData = {
      internalId,
      searchIdDocument: finalDocId,
      tipoUsuario,
      ownerUid: userInfo.uid,
      datosIdentidad,
      estadoValidacion: "pendiente",
      fechaCreacion: FieldValue.serverTimestamp(),
      pagoConfirmado: false,
      apiValidacionExitosa: false,
      fechaVencimiento: null,
      logAuditoria: [],
      isValidationActive: true, // NUEVO: Inicialmente activa
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
              throw new onCall.HttpsError(error.code.substring(5) || 'internal', error.message);
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

      console.info(`Nueva validación creada con ID ${finalDocId} y internalId ${internalId} por usuario ${userInfo.uid}`);

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
        throw new onCall.HttpsError(error.code.substring(5), error.message);
      }
      throw new onCall.HttpsError("internal", error.message || "Error al crear la validación o el usuario asociado.");
    }
  }
);

/**
 * Cloud Function: Autentica un usuario con email/contraseña y reCAPTCHA,
 * luego emite un token personalizado.
 */
exports.authenticateAndMintToken = onCall(
  {
    secrets: [RECAPTCHA_SECRET_KEY, FIREBASE_WEB_API_KEY], // Vincula los secretos a esta función
  },
  async (data, context) => {
    // recaptchaToken solo es requerido si NO estamos en modo de desarrollo (IS_DEV_MODE es false).
    const { email, password, recaptchaToken } = data;

    console.info(`Attempting custom token login for email: ${email}`);

    // 1. Validar inputs básicos
    if (!email || !password || (!recaptchaToken && !IS_DEV_MODE)) {
      throw new onCall.HttpsError(
        'invalid-argument',
        'Faltan el correo electrónico, la contraseña o el token reCAPTCHA (requerido en producción).'
      );
    }
    if (!isValidEmailFormat(email)) {
      throw new onCall.HttpsError('invalid-argument', 'El formato del correo electrónico no es válido.');
    }

    // 2. Verificar reCAPTCHA token
    const recaptchaSecret = RECAPTCHA_SECRET_KEY.value(); // Acceso al valor del secreto
    const firebaseWebApiKey = FIREBASE_WEB_API_KEY.value(); // Acceso al valor del secreto

    if (!IS_DEV_MODE && !recaptchaSecret) {
      console.error("RECAPTCHA_SECRET_KEY is not configured. reCAPTCHA verification will fail.");
      throw new onCall.HttpsError('internal', 'Configuración de seguridad de reCAPTCHA incompleta.');
    } else if (recaptchaToken && recaptchaSecret && !IS_DEV_MODE) {
      try {
        const recaptchaVerifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${recaptchaSecret}&response=${recaptchaToken}`;
        const recaptchaResponse = await axios.post(recaptchaVerifyUrl);
        const { success, score, 'error-codes': errorCodes } = recaptchaResponse.data;

        if (!success || score < 0.5) {
          console.warn(`reCAPTCHA verification failed for email: ${email}, score: ${score}, errors: ${errorCodes ? errorCodes.join(', ') : 'N/A'}`);
          throw new onCall.HttpsError(
            'unauthenticated',
            'Fallo en la verificación de seguridad (reCAPTCHA). Intente de nuevo.'
          );
        }
        console.info(`reCAPTCHA score for ${email}: ${score}`);
      } catch (error) {
        console.error("Error verifying reCAPTCHA:", error);
        throw new onCall.HttpsError(
          'internal',
          'Error interno al verificar reCAPTCHA.'
        );
      }
    } else {
      console.info("Skipping reCAPTCHA verification (DEV_MODE or RECAPTCHA_SECRET_KEY not configured/recaptchaToken not provided).");
    }

    // 3. Autenticar el usuario con email y password usando la Firebase Authentication REST API
    if (!firebaseWebApiKey && !IS_DEV_MODE) {
      console.error("FIREBASE_WEB_API_KEY is not configured. Cannot authenticate user.");
      throw new onCall.HttpsError('internal', 'Configuración de autenticación incompleta (API Key web de Firebase).');
    }

    let uid;
    try {
      let authApiBaseUrl;
      if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
        console.info(`Redirecting Auth REST API call to emulator at ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);
        authApiBaseUrl = process.env.FIREBASE_AUTH_EMULATOR_HOST
          ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`
          : `https://identitytoolkit.googleapis.com`;
      } else {
        authApiBaseUrl = `https://identitytoolkit.googleapis.com`;
      }

      const authApiUrl = `${authApiBaseUrl}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseWebApiKey}`

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
          throw new onCall.HttpsError('unauthenticated', 'Correo electrónico o contraseña inválidos.');
        } else if (authError.message === 'USER_DISABLED') {
          throw new onCall.HttpsError('unauthenticated', 'La cuenta de usuario está deshabilitada.');
        }
      }
      throw new onCall.HttpsError('internal', error.message || 'Error al autenticar credenciales.');
    }

    // AÑADIDO: 4. Verificar si el usuario es un propietario Y tiene una validación activa.
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
          throw new onCall.HttpsError(
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
      if (error instanceof onCall.HttpsError) {
        throw error;
      }
      throw new onCall.HttpsError(
        'internal',
        'Error interno al verificar el perfil de usuario o generar el token de autenticación.',
        error.message
      );
    }
  }
);

/**
 * Cloud Function para consultar el estado de una validación.
 * Esta función es el punto principal para buscar y mostrar la información de las validaciones.
 */
exports.consultarEstadoValidacion = onCall(
  {}, // No hay opciones específicas aquí, usa las globales.
  async (data, context) => {
    // console.debug("consultarEstadoValidacion recibida", { data, auth: context.auth });

    const requestData = data.data || data;
    if (!requestData.searchQuery || typeof requestData.searchQuery !== "string" || !requestData.searchQuery.trim()) {
      throw new onCall.HttpsError("invalid-argument", "El campo searchQuery es requerido.");
    }
    const searchQuery = requestData.searchQuery.trim();

    const callerInfo = await getAuthenticatedUserRole(context);
    const { uid: callerUid, role: callerRole } = callerInfo;

    console.info(`Request por ${callerRole} (UID: ${callerUid || "N/A"}) para searchId: ${searchQuery}`);

    const validationDocRef = db.collection("validaciones").doc(searchQuery);
    const validationDoc = await validationDocRef.get();
    if (!validationDoc.exists) {
      throw new onCall.HttpsError("not-found", `No se encontró una validación con el ID '${searchQuery}'.`);
    }

    const validationData = validationDoc.data();
    const validationTipoUsuario = validationData.tipoUsuario;
    const validationOwnerUid = validationData.ownerUid;

    let accessLevel = "denied";

    // =================================== REGLAS DE ACCESO A LA VALIDACIÓN =============================
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
    // =================================== FIN REGLAS DE ACCESO =========================================

    // --- INICIO: Lógica de BYPASS DE PERMISOS para MODO DE DESARROLLO ---
    if (IS_DEV_MODE && accessLevel === "denied") {
      console.warn(`[DEV_MODE] Anulando la denegación de acceso para validación '${searchQuery}'. Forzando accessLevel a 'full' para pruebas.`);
      accessLevel = "full";
    }
    // --- FIN: Lógica de BYPASS DE PERMISOS para MODO DE DESARROLLO ---

    if (accessLevel === "denied") {
      console.warn(`Permiso denegado para consultar validación '${searchQuery}'. Caller UID: ${callerUid}, Rol: ${callerRole}, OwnerUID: ${validationOwnerUid}, Tipo Validación: ${validationTipoUsuario}`);
      throw new onCall.HttpsError("permission-denied", "No tiene permisos para ver esta validación.");
    }

    const now = Timestamp.now().toDate();
    let isValidationActive =
      validationData.apiValidacionExitosa &&
      validationData.pagoConfirmado &&
      validationData.fechaVencimiento &&
      validationData.fechaVencimiento.toDate() > now &&
      validationData.isValidationActive;

    // =================================== MODO DE DESARROLLO: FORZAR VALIDACIÓN ACTIVA =================
    // [PRODUCCIÓN: ¡ATENCIÓN!] Esta sección DEBE ser deshabilitada o eliminada en producción.
    // Simula que todas las validaciones están activas (identidad, pago, tiempo) para facilitar las pruebas
    // en el flujo completo de la aplicación sin depender de APIs externas o fechas reales.
    // if (IS_DEV_MODE) {
    //     functions.logger.warn(`[DEV_MODE] Forzando validación ${searchQuery} a ACTIVA para pruebas.`);
    //     isValidationActive = true;
    // }
    // =================================== FIN MODO DE DESARROLLO =======================================

    if (accessLevel === "full" && !isValidationActive) {
      console.warn(`Validacion ${searchQuery} no está activa.`);
    }

    const datosIdentidadEnmascarados = getMaskedIdentityData(validationData.datosIdentidad || {}, accessLevel, validationTipoUsuario);

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

/**
 * NUEVA CLOUD FUNCTION: Desactiva una validación específica, marcándola como inactiva.
 * Solo puede ser llamada por un propietario que sea el dueño de esa validación.
 */
exports.deactivateValidation = onCall(
  {}, // No hay opciones específicas aquí, usa las globales.
  async (data, context) => {
    // 1. Autenticación: Verifica si el usuario está autenticado.
    if (!context.auth) {
      throw new onCall.HttpsError(
        "unauthenticated",
        "La solicitud debe ser autenticada."
      );
    }

    const callerUid = context.auth.uid;
    const validationId = data.validationId;

    // 2. Validar Input: Asegura que se proporcionó el ID de la validación.
    if (!validationId || typeof validationId !== 'string' || validationId.trim() === '') {
      throw new onCall.HttpsError(
        "invalid-argument",
        "Se requiere el 'validationId' para dar de baja la validación."
      );
    }

    try {
      // 3. Autorización (Rol): Verifica que el usuario tenga el rol 'propietario'.
      const callerInfo = await getAuthenticatedUserRole(context);
      if (callerInfo.role !== "propietario" && callerInfo.role !== "admin") {
        console.warn(`Intento de desactivar validación por rol no autorizado: UID ${callerUid}, Rol ${callerInfo.role}`);
        throw new onCall.HttpsError(
          "permission-denied",
          "Solo los usuarios con rol 'propietario' o 'admin' pueden dar de baja validaciones."
        );
      }

      // 4. Obtener Validación: Busca el documento de validación en Firestore.
      const validationRef = db.collection("validaciones").doc(validationId);
      const validationSnap = await validationRef.get();

      if (!validationSnap.exists) {
        throw new onCall.HttpsError(
          "not-found",
          "La validación especificada no existe."
        );
      }

      const currentValidationData = validationSnap.data();

      // 5. Autorización (Propiedad): Verifica que el usuario autenticado sea el dueño de la validación.
      if (currentValidationData.ownerUid !== callerUid && callerInfo.role !== "admin") {
        console.warn(`Propietario ${callerUid} intentó dar de baja validación ${validationId} de otro propietario (${currentValidationData.ownerUid}).`);
        throw new onCall.HttpsError(
          "permission-denied",
          "No tiene permisos para dar de baja esta validación. Solo puede desactivar validaciones de las que es propietario."
        );
      }

      // 6. Estado Actual: Si la validación ya está inactiva, no se hace nada.
      if (!currentValidationData.isValidationActive) {
        console.info(`Validación ${validationId} ya estaba inactiva. No se requieren cambios.`);
        return { success: true, message: "La validación ya se encontraba inactiva." };
      }

      // 7. Actualizar Validación: Marca la validación como inactiva y registra la fecha.
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
      if (error instanceof onCall.HttpsError) {
        throw error;
      }
      throw new onCall.HttpsError(
        "internal",
        "Error interno del servidor al procesar la solicitud de baja.",
        error.message
      );
    }
  }
);

/**
 * Cloud Function para actualizar el estado de validación (simulación de API externa).
 */
exports.updateValidationStatus = onCall(
  {}, // No hay opciones específicas aquí, usa las globales.
  async (data, context) => {
    const requestData = data.data || data;
    const { uid: callerUid, role: callerRole, email: callerEmail } = await getAuthenticatedUserRole(context);

    if (callerRole !== "admin") {
      console.warn(`Intento de actualizar estado de validación por rol no autorizado: UID ${callerUid}, Rol ${callerRole}`);
      throw new onCall.HttpsError("permission-denied", "Solo administradores pueden ejecutar esta acción.");
    }

    if (!requestData.searchId || typeof requestData.searchId !== "string" || !requestData.searchId.trim()) {
      throw new onCall.HttpsError("invalid-argument", "searchId es obligatorio.");
    }

    const searchId = requestData.searchId.trim();
    const newStatus = true;

    const validationDocRef = db.collection("validaciones").doc(searchId);
    const docSnapshot = await validationDocRef.get();
    if (!docSnapshot.exists) {
      throw new onCall.HttpsError("not-found", `No se encontró validación con ID '${searchId}'.`);
    }

    const now = Timestamp.now().toDate();
    const logEntry = {
      timestamp: now,
      action: `Simulación de Certificación de Identidad (por ${callerEmail}). Estado: ${newStatus ? "Éxito" : "Fallo"}`,
      details: `searchId: ${searchId}`,
    };

    await validationDocRef.update({
      apiValidacionExitosa: newStatus,
      logAuditoria: FieldValue.arrayUnion(logEntry),
    });

    console.info(`[updateValidationStatus] Certificación simulada para ${searchId} por ${callerRole} (${callerUid})`);
    return { success: true, message: `Certificación simulada para ${searchId}. Estado: ${newStatus}.` };
  }
);

// ====================================================================================================
// =================================== NUEVAS FUNCIONES PARA CONTEO DE MÉTRICAS =======================
// ====================================================================================================

/**
 * Cloud Function: Actualiza los contadores de usuarios totales
 * en el documento de métricas al crear o eliminar un usuario en la colección 'users'.
 */
exports.updateUserCount = onDocumentWritten(
  {
    document: 'users/{userId}',
    enforceAppCheck: false, // Mantener en false para desarrollo
  },
  async (event) => { // 'change' ahora es 'event' en 2da generación
    const statsRef = db.collection('stats').doc('dashboard_metrics');

    const beforeExists = event.data.before.exists;
    const afterExists = event.data.after.exists;

    if (!beforeExists && afterExists) { // Documento creado
      await statsRef.set({ totalUsers: FieldValue.increment(1) }, { merge: true });
      console.info(`Contador de usuarios incrementado. UID: ${event.params.userId}`);

      const newRole = event.data.after.data().role;
      if (newRole === 'propietario') {
        await statsRef.set({ totalPropietarios: FieldValue.increment(1) }, { merge: true });
        console.info(`Contador de propietarios incrementado.`);
      } else if (newRole === 'inquilino') {
        await statsRef.set({ totalInquilinos: FieldValue.increment(1) }, { merge: true });
        console.info(`Contador de inquilinos incrementado.`);
      } else if (newRole === 'admin') {
        await statsRef.set({ totalAdmins: FieldValue.increment(1) }, { merge: true });
        console.info(`Contador de admins incrementado.`);
      }
    } else if (beforeExists && !afterExists) { // Documento eliminado
      await statsRef.set({ totalUsers: FieldValue.increment(-1) }, { merge: true });
      console.info(`Contador de usuarios decrementado. UID: ${event.params.userId}`);

      const oldRole = event.data.before.data().role;
      if (oldRole === 'propietario') {
        await statsRef.set({ totalPropietarios: FieldValue.increment(-1) }, { merge: true });
        console.info(`Contador de propietarios decrementado.`);
      } else if (oldRole === 'inquilino') {
        await statsRef.set({ totalInquilinos: FieldValue.increment(-1) }, { merge: true });
        console.info(`Contador de inquilinos decrementado.`);
      } else if (oldRole === 'admin') {
        await statsRef.set({ totalAdmins: FieldValue.increment(-1) }, { merge: true });
        console.info(`Contador de admins decrementado.`);
      }
    } else if (beforeExists && afterExists) { // Documento actualizado
      const oldRole = event.data.before.data().role;
      const newRole = event.data.after.data().role;

      if (oldRole !== newRole) {
        console.info(`Cambio de rol detectado para UID ${event.params.userId}: de ${oldRole} a ${newRole}`);
        if (oldRole === 'propietario') await statsRef.set({ totalPropietarios: FieldValue.increment(-1) }, { merge: true });
        else if (oldRole === 'inquilino') await statsRef.set({ totalInquilinos: FieldValue.increment(-1) }, { merge: true });
        else if (oldRole === 'admin') await statsRef.set({ totalAdmins: FieldValue.increment(-1) }, { merge: true });

        if (newRole === 'propietario') await statsRef.set({ totalPropietarios: FieldValue.increment(1) }, { merge: true });
        else if (newRole === 'inquilino') await statsRef.set({ totalInquilinos: FieldValue.increment(1) }, { merge: true });
        else if (newRole === 'admin') await statsRef.set({ totalAdmins: FieldValue.increment(1) }, { merge: true });
      }
    }
    return null;
  }
);

/**
 * Cloud Function: Actualiza los contadores de validaciones totales
 * en el documento de métricas al crear o eliminar una validación en la colección 'validaciones'.
 */
exports.updateValidationCount = onDocumentWritten(
  {
    document: 'validaciones/{validationId}',
    enforceAppCheck: false, // Mantener en false para desarrollo
  },
  async (event) => { // 'change' ahora es 'event' en 2da generación
    const statsRef = db.collection('stats').doc('dashboard_metrics');

    const beforeExists = event.data.before.exists;
    const afterExists = event.data.after.exists;

    if (!beforeExists && afterExists) { // Documento creado
      await statsRef.set({ totalValidaciones: FieldValue.increment(1) }, { merge: true });
      console.info(`Contador de validaciones incrementado. ID: ${event.params.validationId}`);
    } else if (beforeExists && !afterExists) { // Documento eliminado
      await statsRef.set({ totalValidaciones: FieldValue.increment(-1) }, { merge: true });
      console.info(`Contador de validaciones decrementado. ID: ${event.params.validationId}`);
    }
    return null;
  }
);

/**
 * Cloud Function para confirmar el pago (simulación de API externa).
 */
exports.confirmPayment = onCall(
  {}, // No hay opciones específicas aquí, usa las globales.
  async (data, context) => {
    const requestData = data.data || data;
    const { uid: callerUid, role: callerRole, email: callerEmail } = await getAuthenticatedUserRole(context);

    if (callerRole !== "admin") {
      console.warn(`Intento de confirmar pago por rol no autorizado: UID ${callerUid}, Rol ${callerRole}`);
      throw new onCall.HttpsError("permission-denied", "Solo administradores pueden ejecutar esta acción.");
    }

    if (!requestData.searchId || typeof requestData.searchId !== "string" || !requestData.searchId.trim()) {
      throw new onCall.HttpsError("invalid-argument", "searchId es obligatorio.");
    }

    const searchId = requestData.searchId.trim();
    const paymentConfirmed = true;

    const validationDocRef = db.collection("validaciones").doc(searchId);
    const docSnapshot = await validationDocRef.get();
    if (!docSnapshot.exists) {
      throw new onCall.HttpsError("not-found", `No se encontró validación con ID '${searchId}'.`);
    }

    const now = Timestamp.now().toDate();
    const logEntry = {
      timestamp: now,
      action: `Simulación de Pago Confirmado (por ${callerEmail}). Estado: ${paymentConfirmed ? "Éxito" : "Fallo"}`,
      details: `searchId: ${searchId}`,
    };

    await validationDocRef.update({
      pagoConfirmado: paymentConfirmed,
      estadoValidacion: paymentConfirmed ? "validado" : "pendiente_pago",
      logAuditoria: FieldValue.arrayUnion(logEntry),
    });

    console.info(`[confirmPayment] Pago simulado para ${searchId} por ${callerRole} (${callerUid})`);
    return { success: true, message: `Pago simulado para ${searchId}. Estado: ${paymentConfirmed}.` };
  }
);

/**
 * Cloud Function para buscar el historial completo de validaciones de un usuario
 * por DNI y/o Nombre y Apellido.
 */
exports.searchUserValidations = onCall(
  {
    enforceAppCheck: false, // Deshabilitar App Check para desarrollo
  },
  async (data, context) => {
    // 1. Verificación de Autenticación y Rol
    const callerInfo = await getAuthenticatedUserRole(context);
    const { uid: callerUid, role: callerRole } = callerInfo;

    if (callerRole !== "admin") {
      console.warn(`Intento de buscar historial de validaciones por rol no autorizado: UID ${callerUid}, Rol ${callerRole}`);
      throw new onCall.HttpsError("permission-denied", "Solo administradores pueden buscar historial de validaciones.");
    }

    // 2. Validar Parámetros de Entrada
    const { dni, name } = data;

    const trimmedDni = dni ? dni.trim() : '';
    const trimmedName = name ? name.trim() : '';

    if (!trimmedDni && !trimmedName) {
      throw new onCall.HttpsError('invalid-argument', 'Se requiere al menos un DNI o un Nombre y Apellido para la búsqueda.');
    }

    let validationsSnapshot;
    let queryRef = db.collection('validaciones');
    let userFound = false;

    // PRIORIDAD: Buscar por DNI (es el identificador más preciso)
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
