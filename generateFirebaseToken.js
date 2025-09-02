// generateFirebaseToken.js

// 1. Importa el SDK de Firebase Admin.
// Asegúrate de haberlo instalado con: npm install firebase-admin
const admin = require('firebase-admin');

// 2. Carga tus credenciales de cuenta de servicio.
//    *** ¡LA RUTA YA ESTÁ CONFIGURADA PARA TI! ***
//    Asume que 'serviceAccountKey.json' está en la misma carpeta que este script.
const serviceAccount = require('./serviceAccountKey.json');

// 3. Inicializa el SDK de Firebase Admin con tus credenciales.
//    Esto autentica tu script Node.js con tu proyecto de Firebase.
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // Opcional: Si necesitas acceder a Realtime Database, puedes añadir la URL aquí
  // databaseURL: "https://validacionesonline-26d4c-default-rtdb.firebaseio.com"
});

// 4. Define el UID (User ID) para el cual quieres generar el token.
//    Este UID es un identificador único para el usuario que quieres que se autentique
//    en tu aplicación (por ejemplo, "usuario_prueba_1", "id_sesion_temporal_xyz").
//    ¡Es muy importante que este UID sea único y represente al usuario real!
//    Puedes cambiarlo cada vez que ejecutes el script para un usuario diferente.
const uidDeUsuario = 'usuario_de_desarrollo_001'; // <-- ¡Cámbialo según tu necesidad!

// 5. Opcional: Define reclamos (claims) adicionales para incluir en el token.
//    Estos reclamos son datos personalizados que puedes usar en tus reglas de seguridad
//    de Firestore o para personalizar la experiencia del usuario después de la autenticación.
//    Por ejemplo, puedes indicar que este usuario es un administrador o tiene ciertos permisos.
const reclamosAdicionales = {
  esAdmin: true,
  nivelAcceso: 10,
  // Puedes usar esto en tus reglas de Firestore, por ejemplo:
  // allow read, write: if request.auth.token.esAdmin == true;
};

// 6. Genera el Custom Token.
console.log(`\nGenerando token personalizado para el UID: "${uidDeUsuario}"...`);
admin.auth().createCustomToken(uidDeUsuario, reclamosAdicionales)
  .then((customToken) => {
    // 7. Imprime el token generado.
    //    Este es el token que enviarías a tu aplicación cliente (web) para que el usuario inicie sesión.
    console.log('\n✅ ¡Token personalizado de Firebase generado con éxito!\n');
    console.log('--------------------------------------------------------------------------------');
    console.log(customToken);
    console.log('--------------------------------------------------------------------------------\n');
    console.log('💡 Consejo: Copia este token y úsalo en tu aplicación cliente');
    console.log('   (ej. en tu archivo JS de "public/" usando firebase.auth().signInWithCustomToken(token)).');
  })
  .catch((error) => {
    // Manejo de errores si la generación del token falla.
    console.error('\n❌ ¡Error al generar el token personalizado! Detalles:\n');
    console.error(error);
    if (error.code === 'app/invalid-credential') {
      console.error('\nSugerencia: Verifica que el archivo "serviceAccountKey.json" exista en esta carpeta y no esté corrupto.');
      console.error('           Asegúrate de que no tenga errores de formato JSON.');
    } else if (error.code === 'auth/invalid-uid') {
        console.error('\nSugerencia: El UID proporcionado es inválido.');
        console.error('           Debe ser una cadena no vacía de máximo 128 caracteres.');
    } else {
        console.error('\nSugerencia: Revisa la configuración de tu proyecto y las dependencias.');
    }
    console.log('\n'); // Salto de línea para mejor legibilidad al final
  });
