// main/metrics/userMetrics.js

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin"); // Asume que admin se inicializa en el punto de entrada
const db = admin.firestore();
const { FieldValue } = require("firebase-admin/firestore");

/**
 * Cloud Function: Actualiza los contadores de usuarios totales, propietarios, inquilinos y admins
 * en el documento de métricas ('dashboard_metrics') al crear, eliminar o actualizar un usuario en la colección 'users'.
 */
exports.updateUserCount = onDocumentWritten(
  {
    document: 'users/{userId}',
    enforceAppCheck: false,
  },
  async (event) => { // 'event' contiene 'before' y 'after' para el estado del documento
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
    } else if (beforeExists && afterExists) { // Documento actualizado (específicamente, cambio de rol)
      const oldRole = event.data.before.data().role;
      const newRole = event.data.after.data().role;

      if (oldRole !== newRole) {
        console.info(`Cambio de rol detectado para UID ${event.params.userId}: de ${oldRole} a ${newRole}`);
        // Decrementa el contador del rol antiguo
        if (oldRole === 'propietario') await statsRef.set({ totalPropietarios: FieldValue.increment(-1) }, { merge: true });
        else if (oldRole === 'inquilino') await statsRef.set({ totalInquilinos: FieldValue.increment(-1) }, { merge: true });
        else if (oldRole === 'admin') await statsRef.set({ totalAdmins: FieldValue.increment(-1) }, { merge: true });

        // Incrementa el contador del rol nuevo
        if (newRole === 'propietario') await statsRef.set({ totalPropietarios: FieldValue.increment(1) }, { merge: true });
        else if (newRole === 'inquilino') await statsRef.set({ totalInquilinos: FieldValue.increment(1) }, { merge: true });
        else if (newRole === 'admin') await statsRef.set({ totalAdmins: FieldValue.increment(1) }, { merge: true });
      }
    }
    return null;
  }
);
