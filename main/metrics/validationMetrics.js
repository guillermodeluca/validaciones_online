// main/metrics/validationMetrics.js

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const db = admin.firestore();
const { FieldValue } = require("firebase-admin/firestore");

/**
 * Cloud Function: Actualiza los contadores de validaciones totales
 * en el documento de métricas al crear o eliminar una validación en la colección 'validaciones'.
 */
exports.updateValidationCount = onDocumentWritten(
  {
    document: 'validaciones/{validationId}',
    // [PRODUCCIÓN: ¡ATENCIÓN!] Revisa si necesitas enforceAppCheck para triggers de background.
    enforceAppCheck: false,
  },
  async (event) => { // 'event' contiene 'before' y 'after' para el estado del documento
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
    return null; // Los triggers de fondo siempre deben retornar null o una Promise<void>
  }
);
// TODO EL CÓDIGO A PARTIR DE AQUÍ HA SIDO ELIMINADO PARA DEJAR UNA ÚNICA DEFINICIÓN DE LA FUNCIÓN.
