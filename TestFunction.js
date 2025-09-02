// Importa las funciones necesarias del SDK modular de Firebase
const { initializeApp } = require('firebase/app');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');

// Configura Firebase para conectar a los emuladores
const firebaseConfig = {
  // Solo necesitas el projectId aquí para los emuladores,
  // los demás campos son placeholders para una app real, los emuladores los sobrescriben.
  projectId: "validacionesonline-26d4c",
  // Puedes añadir otros placeholders si lo deseas, pero no son estrictamente necesarios para los emuladores
  apiKey: "your-api-key",
  authDomain: "your-project-id.firebaseapp.com",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};

// Inicializa la aplicación Firebase
const app = initializeApp(firebaseConfig);

// Obtén la instancia del servicio de Functions para esta aplicación
const functionsInstance = getFunctions(app);

// Conecta la instancia de Functions al emulador local
// Asegúrate de que el puerto 5001 sea el que se muestra en tu terminal de emuladores
connectFunctionsEmulator(functionsInstance, 'localhost', 5001);

async function testCrearNuevaValidacion() {
  // Obtiene la referencia a la función callable 'crearNuevaValidacion'
  const crearNuevaValidacion = httpsCallable(functionsInstance, 'crearNuevaValidacion');
  
  try {
    const dataToSend = {
      searchId: "prueba-001", // ID que intentaremos crear
      tipoUsuario: "propietario",
      datosIdentidad: {
        pais: "Argentina",
        localidad: "Buenos Aires",
        direccion: "Calle Falsa 123",
        titular: "Empresa Falsa S.A.",
        identificacionFiscalTipo: "CUIT",
        identificacionFiscalNumero: "20-12345678-9",
        emailContacto: "contacto@falsa.com",
        telefonoContacto: "1122334455",
        nombreEstablecimiento: "Falsa Store",
        paginaWeb: "www.falsa.com"
      }
    };
    
    // --- Primer intento: Crear la validación ---
    console.log("Intentando crear la validación con searchId: 'prueba-001'");
    const result1 = await crearNuevaValidacion(dataToSend);
    console.log("¡Éxito! Primera creación. Respuesta de la función:", result1.data);
    
    // --- Segundo intento: Crear con el mismo ID para probar la unicidad ---
    console.log("\nIntentando crear con el MISMO searchId ('prueba-001') para probar unicidad...");
    await crearNuevaValidacion(dataToSend); // Debería lanzar un error 'already-exists'

  } catch (error) {
    // Manejo de errores de la función callable
    if (error.code) {
      console.error("Error al llamar a la función:", error.code, error.message);
    } else {
      console.error("Error inesperado:", error);
    }
  }
}

// Ejecuta la función de prueba
testCrearNuevaValidacion();
