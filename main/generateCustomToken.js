// generateCustomToken.js

const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert(require('./serviceAccountKey.json'))
});

const uidDePrueba = 'test_user_equifax_001';
const customClaims = {}; // Sin claims personalizados por ahora para simplificar

admin.auth().createCustomToken(uidDePrueba, customClaims)
  .then((customToken) => {
    console.log('¡Custom Token generado con éxito!');
    console.log('\n========================================================================');
    console.log('Copia este token y pégalo en TEST_CUSTOM_TOKEN en tu frontend:');
    console.log('========================================================================\n');
    console.log(customToken);
    console.log('\n========================================================================\n');

    // === NUEVO: Decodificar y mostrar el payload para inspección ===
    try {
        const parts = customToken.split('.');
        if (parts.length === 3) {
            const payloadBase64 = parts[1];
            const decodedPayload = Buffer.from(payloadBase64, 'base64').toString('utf8');
            console.log('Payload decodificado del token generado:');
            console.log(JSON.parse(decodedPayload)); // Imprimirlo como objeto JSON legible
        } else {
            console.log('Token generado no tiene el formato JWT esperado.');
        }
    } catch (e) {
        console.error('Error al decodificar el payload del token:', e);
    }
    // ===============================================================

    console.log(`\nUID asociado al token: ${uidDePrueba}`);

    process.exit(0);
  })
  .catch((error) => {
    console.error('Error al generar el Custom Token:', error);
    process.exit(1);
  });
