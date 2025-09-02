const test = require('firebase-functions-test')({
  projectId: 'validacionesonline-26d4c'  // Tu Project ID de Firebase
});

const myFunctions = require('../index.js'); // Ajusta si tu index.js está en otra ruta

describe('Pruebas Cloud Functions', () => {
  after(() => {
    test.cleanup(); // Limpia y restaura stubs después de las pruebas
  });

  it('crearNuevaValidacion debe retornar id y mensaje', async () => {
    // Envuelve la función cloud callable para poder llamarla en test
    const wrapped = test.wrap(myFunctions.crearNuevaValidacion);

    const fakeData = {
      searchId: "test-validacion-123",
      tipoUsuario: "inquilino",
      datosIdentidad: {
        pais: "Argentina",
        localidad: "CABA",
        direccion: "Av. Siempre Viva 742",
        titular: "Laura Giménez",
        identificacionFiscalTipo: "DNI",
        identificacionFiscalNumero: "30123456",
        emailContacto: "laura.g@ejemplo.com",
        telefonoContacto: "11-2222-3333"
      }
    };

    const context = {
      auth: { uid: "fakeUid123" }
    };

    const result = await wrapped(fakeData, context);

    console.log('Respuesta:', result);

    if (!result.id) throw new Error("No se retornó un id válido");
    if (!result.mensaje) throw new Error("No se retornó un mensaje");
  });
});

