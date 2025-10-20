// public/ingresar-datos-equifax.js

// --- Importaciones ---
import {
    auth,
    db,
    functions,
    httpsCallable,
    doc,
    getDoc,
    onAuthStateChanged,
    updateDoc
} from './firebaseClient.js';

// **NUEVA IMPORTACIÓN: signOut directamente desde Firebase Auth SDK**
import { signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";



// --- 2. Referencias a los elementos del DOM (constantes globales) ---
const userStatusEquifax = document.getElementById('user-status-equifax');
const messageDisplay = document.getElementById('messageDisplay'); 
const mainValidationContent = document.getElementById('main-validation-content'); 
const inputDocumentNumber = document.getElementById('input-document-number');     
const inputGender = document.getElementById('input-gender');                     
const inputFullName = document.getElementById('input-full-name');                 

const btnRunSimpleValidation = document.getElementById('btn-run-simple-validation'); 
const btnRunFullValidation = document.getElementById('btn-run-full-validation');     

const equifaxResultsDiv = document.getElementById('equifax-results');             
const outputEquifax = document.getElementById('output-equifax');                  
const equifaxQuestionnaireDiv = document.getElementById('equifax-questionnaire'); 
const questionnaireQuestionsDiv = document.getElementById('questionnaire-questions'); 
const btnSubmitAnswers = document.getElementById('btn-submit-answers');         
const btnRetryEquifax = document.getElementById('btn-retry-equifax');           

const testCorsBtn = document.getElementById('test-cors-btn');                     
const logoutBtn = document.getElementById('logoutBtn');                           


// --- 3. Referencias a las Cloud Functions de Equifax (constantes globales) ---
// ESTE BLOQUE DEBE ESTAR AQUÍ, COMO CONSTANTES GLOBALES, DESPUÉS DE LAS DEL DOM
const initiateEquifaxSimpleValidationCallable = httpsCallable(functions, 'initiateEquifaxSimpleValidation');
const initiateEquifaxFullValidationCallable = httpsCallable(functions, 'initiateEquifaxFullValidation');
const submitEquifaxQuestionnaireAnswersCallable = httpsCallable(functions, 'submitEquifaxQuestionnaireAnswers');
const testCORSCallable = httpsCallable(functions, 'testCORSFunction'); // Callable para depuración CORS


// --- 4. Variables de estado locales (globales para el script) ---
let currentTransactionId = null;
let currentQuestionnaire = null;
let currentUserUID = null;
let currentPersonData = null;
let isRenderingQuestionnaire = false;
// --- Funciones de Utilidad (Deben ir aquí, antes del DOMContentLoaded) ---
function showSection(sectionId) {
    console.log("DEBUG showSection: Llamado con sectionId:", sectionId);
    if (mainValidationContent) mainValidationContent.classList.add('hidden');
    if (equifaxResultsDiv) equifaxResultsDiv.classList.add('hidden');
    if (equifaxQuestionnaireDiv) equifaxQuestionnaireDiv.classList.add('hidden');

    if (sectionId === 'main' && mainValidationContent) {
        mainValidationContent.classList.remove('hidden');
    } else if (sectionId === 'results' && equifaxResultsDiv) {
        equifaxResultsDiv.classList.remove('hidden');
    } else if (sectionId === 'questionnaire' && equifaxQuestionnaireDiv) {
        equifaxQuestionnaireDiv.classList.remove('hidden');
    }
    console.log("DEBUG showSection: Estado final de visibilidad (después de mostrar):");
    console.log("mainValidationContent hidden:", mainValidationContent?.classList.contains('hidden'));
    console.log("equifaxResultsDiv hidden:", equifaxResultsDiv?.classList.contains('hidden'));
    console.log("equifaxQuestionnaireDiv hidden:", equifaxQuestionnaireDiv?.classList.contains('hidden'));
}

function showMessage(type, message, duration = 5000) {
    if (messageDisplay) {
        messageDisplay.classList.remove('hidden', 'success', 'error', 'info');
        messageDisplay.classList.add(type);
        messageDisplay.textContent = message;
        if (duration > 0) {
            setTimeout(() => {
                messageDisplay.classList.add('hidden');
            }, duration);
        }
    } else {
        console.log(`MESSAGE [${type.toUpperCase()}]: ${message}`);
    }
}

function enableUI(enable) {
    if (inputDocumentNumber) inputDocumentNumber.disabled = !enable;
    if (inputGender) inputGender.disabled = !enable;
    if (inputFullName) inputFullName.disabled = !enable;
    if (btnRunSimpleValidation) btnRunSimpleValidation.disabled = !enable;
    if (btnRunFullValidation) btnRunFullValidation.disabled = !enable;
    if (btnSubmitAnswers) btnSubmitAnswers.disabled = !enable;
    if (btnRetryEquifax) btnRetryEquifax.disabled = !enable;
    if (testCorsBtn) testCorsBtn.disabled = !enable;
    if (logoutBtn) logoutBtn.disabled = !enable;
}

function renderQuestionnaire(questionnaireData) {
    console.log("DEBUG RENDER: === Inicia renderQuestionnaire ===");
    console.log("DEBUG RENDER: questionnaireData recibido:", JSON.stringify(questionnaireData, null, 2));

    if (!questionnaireData || !questionnaireData.questionsOfGeneratedQuestionnaire || questionnaireData.questionsOfGeneratedQuestionnaire.length === 0) {
        console.log("DEBUG RENDER: No se encontraron preguntas o datos inválidos para renderizar.");
        if (questionnaireQuestionsDiv) questionnaireQuestionsDiv.innerHTML = '<p>No hay preguntas disponibles para este cuestionario.</p>';
        if (btnSubmitAnswers) btnSubmitAnswers.classList.add('hidden');
        if (equifaxQuestionnaireDiv) equifaxQuestionnaireDiv.classList.add('hidden');
        console.log("DEBUG RENDER: Cuestionario oculto por falta de preguntas.");
        return;
    }

    console.log("DEBUG RENDER: Limpiando contenido anterior de questionnaireQuestionsDiv.");
    if (questionnaireQuestionsDiv) questionnaireQuestionsDiv.innerHTML = '';

    console.log("DEBUG RENDER: Número de preguntas a renderizar:", questionnaireData.questionsOfGeneratedQuestionnaire.length);
    questionnaireData.questionsOfGeneratedQuestionnaire.forEach((q, index) => {
        const questionDiv = document.createElement('div');
        questionDiv.classList.add('question-item');
        questionDiv.innerHTML = `
            <p>${index + 1}. ${q.description}</p>
            <div class="options-container">
                ${q.options.map(option => `
                    <label>
                        <input type="radio" name="question_${q.id}" value="${option.id}">
                        ${option.description}
                    </label>
                `).join('')}
            </div>
        `;
        if (questionnaireQuestionsDiv) questionnaireQuestionsDiv.appendChild(questionDiv);
        console.log(`DEBUG RENDER: Añadida pregunta ${index + 1}: ${q.description.substring(0, 30)}...`);
    });

    if (btnSubmitAnswers) btnSubmitAnswers.classList.remove('hidden');
    console.log("DEBUG RENDER: Botón 'Enviar Respuestas' visible.");
    
    showSection('questionnaire');
    console.log("DEBUG RENDER: showSection('questionnaire') llamado.");
    
    console.log("DEBUG RENDER: === Finaliza renderQuestionnaire. Cuestionario ID:", questionnaireData.id, "Nivel:", questionnaireData.level, "===");
}


// --- Lógica principal de la página ---
async function initEquifaxPageLogic(user) {
    if (isRenderingQuestionnaire) {
        console.log("DEBUG FRONTEND: initEquifaxPageLogic ya está en un ciclo de renderizado, omitiendo.");
        return;
    }
    isRenderingQuestionnaire = true;

    enableUI(false);
    if (userStatusEquifax) userStatusEquifax.textContent = 'Cargando estado del usuario...';

    if (!user) {
        showMessage('error', 'No se detectó un usuario autenticado. Redirigiendo a inicio...', 3000);
        setTimeout(() => window.location.href = '/ingresoAValidacion.html', 3000);
        isRenderingQuestionnaire = false;
        return;
    }

    currentUserUID = user.uid;
    showMessage('info', `Autenticado como: ${currentUserUID}.`, 0);

    try {
        const userDocRef = doc(db, 'users', currentUserUID);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const validationProcess = userData.validationProcess || {};

            console.log("DEBUG FRONTEND: initEquifaxPageLogic - Datos completos de validationProcess:", JSON.stringify(validationProcess, null, 2));
            console.log("DEBUG FRONTEND: initEquifaxPageLogic - Estado de validación actual en Firestore:", validationProcess.status);
            console.log("DEBUG FRONTEND: initEquifaxPageLogic - Cuestionario en Firestore:", validationProcess.equifax?.questionnaire);

            if (validationProcess.status === 'payment_confirmed') {
                showMessage('success', 'Pago confirmado. Por favor, ingrese sus datos para iniciar la validación de Equifax.', 0);
                if (inputDocumentNumber) inputDocumentNumber.value = validationProcess.equifax?.person?.documentNumber || "20007481";
                if (inputGender) inputGender.value = validationProcess.equifax?.person?.gender || "M";
                if (inputFullName) inputFullName.value = validationProcess.equifax?.person?.fullName || "Juan Perez";
                showSection('main');
            } else if (validationProcess.status === 'equifax_questionnaire_pending' && validationProcess.equifax && validationProcess.equifax.questionnaire) {
                 // Si hay un cuestionario pendiente en Firestore, lo renderizamos
                currentTransactionId = validationProcess.equifax.transactionId;
                currentQuestionnaire = validationProcess.equifax.questionnaire;
                currentPersonData = validationProcess.equifax.person;

                console.log("DEBUG FRONTEND: currentTransactionId después de carga de Firestore (EQ_PENDING):", currentTransactionId);
                console.log("DEBUG FRONTEND: currentQuestionnaire después de carga de Firestore (EQ_PENDING):", JSON.stringify(currentQuestionnaire, null, 2));

                showMessage('info', 'Continuando validación con cuestionario pendiente...', 0);
                renderQuestionnaire(currentQuestionnaire); // Renderiza el cuestionario de Firestore
            }
            // Bloque 2: Si la validación de Equifax se completó y aprobó
            else if (validationProcess.status === 'equifax_completed_pending_data' ||
                     validationProcess.status === 'equifax_full_validation_completed' ||
                     validationProcess.status === 'equifax_simple_validation_completed' ||
                     validationProcess.status === 'equifax_validation_approved') {
                
                showMessage('success', 'Validación de identidad aprobada. Redirigiendo a tu perfil...', 3000);
                
                const userRole = validationProcess.role;
                let redirectPage = '/ingresoAValidacion.html';

                if (userRole === 'propietario') {
                    redirectPage = '/propietario_test.html';
                } else if (userRole === 'inquilino') {
                    redirectPage = '/inquilino_test.html';
                }

                setTimeout(() => window.location.href = redirectPage, 3000);
                
                if (equifaxResultsDiv) equifaxResultsDiv.classList.add('hidden');
                if (equifaxQuestionnaireDiv) equifaxQuestionnaireDiv.classList.add('hidden');
                if (btnSubmitAnswers) btnSubmitAnswers.classList.add('hidden');
            }
            // Bloque 3: Si la validación completa ya ha sido marcada como 'completed_validated'
            else if (validationProcess.status === 'completed_validated') {
                showMessage('success', 'Su validación está completa y activa. Redirigiendo a su panel de usuario.', 3000);
                if (validationProcess.role === 'propietario') {
                    window.location.href = 'propietario_test.html';
                } else if (validationProcess.role === 'inquilino') {
                    window.location.href = 'inquilino_test.html';
                } else {
                    window.location.href = 'index.html';
                }
            }
            // Bloque 4: Cualquier otro estado (initial, failed, expired, o desconocido)
            else {
                showMessage('warning', `Estado actual: ${validationProcess.status}. Redirigiendo a inicio...`, 3000);
                setTimeout(() => window.location.href = '/ingresoAValidacion.html', 3000);
            }
        } else { // Si el documento del usuario no existe en Firestore
            showMessage('warning', 'Documento de usuario no encontrado en Firestore. Redirigiendo a inicio...', 3000);
            setTimeout(() => window.location.href = '/ingresoAValidacion.html', 3000);
        }
    } catch (error) {
        console.error("Error al cargar datos de usuario en Equifax page:", error);
        showMessage('error', 'Error al cargar los datos del proceso. Intente de nuevo.', 0);
    } finally {
        enableUI(true);
        isRenderingQuestionnaire = false;
    }
}


// --- Bloque Principal de Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: DOMContentLoaded fired. Attempting to attach listeners.");

    // --- Event Listener para btnRunSimpleValidation ---
    if (btnRunSimpleValidation) {
        btnRunSimpleValidation.addEventListener('click', async () => {
            console.log("DEBUG: ¡Botón Ejecutar Validación Simple clickeado!");
            enableUI(false);
            showMessage('info', 'Ejecutando Validación Simple...', 0);
            if (outputEquifax) outputEquifax.textContent = 'Procesando...';
            showSection('results');

            try {
                const documentNumber = inputDocumentNumber.value.trim();
                const gender = inputGender.value.trim().toUpperCase(); 
                const fullName = inputFullName.value.trim(); 
                const userRole = localStorage.getItem('userSelectedValidationRole');

                console.log(`DEBUG FRONTEND: Valores de los campos para CF: Documento=${documentNumber}, Género=${gender}, Nombre=${fullName}, Rol=${userRole}`);

                if (!documentNumber || !gender || !fullName || !userRole) {
                    showMessage('error', 'Por favor, complete todos los campos obligatorios (Número de Documento, Género, Nombre Completo) y asegúrese de que su rol esté definido.', 5000);
                    enableUI(true);
                    console.error("DEBUG FRONTEND: Fallo en validación de campos del cliente.");
                    return;
                }

                const dataToSend = {
                    documentNumber: documentNumber,
                    gender: gender,
                    fullName: fullName,
                    role: userRole
                };
                console.log("DEBUG FRONTEND: Datos que se van a enviar a initiateEquifaxSimpleValidationCallable:", JSON.stringify(dataToSend, null, 2));

                const result = await initiateEquifaxSimpleValidationCallable(dataToSend);
                console.log("DEBUG FRONTEND: Resultado COMPLETO de initiateEquifaxSimpleValidationCallable:", JSON.stringify(result, null, 2));

                if (result.data && !result.data.success) {
                    console.error("DEBUG FRONTEND: Cloud Function reportó un error de NEGOCIO:", result.data.message || "Error desconocido en CF.");
                    showMessage('error', result.data.message || 'Error desconocido en Cloud Function.', 0);
                    if (outputEquifax) outputEquifax.textContent = `Error: ${result.data.message || 'Error desconocido'}`;
                    showSection('main');
                    return;
                }

                if (outputEquifax) outputEquifax.textContent = JSON.stringify(result.data, null, 2);
                showMessage('success', 'Validación Simple Finalizada.');

            } catch (error) {
                console.error('DEBUG FRONTEND: Error CRÍTICO en la llamada a Cloud Function initiateEquifaxSimpleValidationCallable:', error);
                if (error.code) console.error("DEBUG FRONTEND: Código de error:", error.code);
                if (error.details) console.error("DEBUG FRONTEND: Detalles del error:", error.details);
                if (outputEquifax) outputEquifax.textContent = `Error: ${error.message}\n${JSON.stringify(error.details || error, null, 2)}`;
                showMessage('error', `Error en Validación Simple: ${error.message}.`);
            } finally {
                enableUI(true);
                console.log("DEBUG FRONTEND: Bloque finally de btnRunSimpleValidation ejecutado.");
                await initEquifaxPageLogic(auth.currentUser); // Reevaluar estado para ver qué hacer después
            }
        });
        console.log("DEBUG: Listener attached to btnRunSimpleValidation successfully.");
    } else {
        console.error("DEBUG: ¡ERROR! El botón 'btnRunSimpleValidation' no fue encontrado en el DOM al cargar la página.");
    }

    // --- Event Listener para btnRunFullValidation ---
    if (btnRunFullValidation) {
        btnRunFullValidation.addEventListener('click', async () => {
            console.log("DEBUG: ¡Botón Ejecutar Validación Completa clickeado!");
            enableUI(false);
            showMessage('info', 'Ejecutando Validación Completa (obteniendo cuestionario)...', 0);
            if (outputEquifax) outputEquifax.textContent = 'Procesando...';
            if (equifaxQuestionnaireDiv) equifaxQuestionnaireDiv.classList.add('hidden');
            if (btnSubmitAnswers) btnSubmitAnswers.classList.add('hidden');
            showSection('results');

            try {
                const documentNumber = inputDocumentNumber.value.trim();
                const gender = inputGender.value.trim().toUpperCase(); 
                const fullName = inputFullName.value.trim();
                const userRole = localStorage.getItem('userSelectedValidationRole');

                console.log(`DEBUG FRONTEND: Valores de los campos para CF: Documento=${documentNumber}, Género=${gender}, Nombre=${fullName}, Rol=${userRole}`); // <-- AÑADE ESTE LOG!
                
                if (!documentNumber || !gender || !fullName || !userRole) {
                    showMessage('error', 'Por favor, complete todos los campos obligatorios (Número de Documento, Género, Nombre Completo) y asegúrese de que su rol esté definido.', 5000);
                    enableUI(true);
                    console.error("DEBUG FRONTEND: Fallo en validación de campos del cliente (userRole podría ser null)."); // <-- Nuevo log
                    return;
                }

                const dataToSend = {
                    documentNumber: documentNumber,
                    gender: gender,
                    fullName: fullName,
                    role: userRole
                };
                
                console.log("DEBUG FRONTEND: Datos que se van a enviar a initiateEquifaxFullValidationCallable:", JSON.stringify(dataToSend, null, 2));
                
                const result = await initiateEquifaxFullValidationCallable(dataToSend);
                
                console.log("DEBUG FRONTEND: Resultado COMPLETO de initiateEquifaxFullValidationCallable:", JSON.stringify(result, null, 2));
                console.log("DEBUG FRONTEND: Propiedad 'success' de la respuesta:", result.data.success);
                console.log("DEBUG FRONTEND: Propiedad 'questionnaire' de la respuesta:", result.data.questionnaire);
                        
                if (result.data && !result.data.success) {
                    console.error("DEBUG FRONTEND: Cloud Function reportó un error de NEGOCIO:", result.data.message || "Error desconocido en CF.");
                    showMessage('error', result.data.message || 'Error desconocido en Cloud Function.', 0);
                    if (outputEquifax) outputEquifax.textContent = `Error: ${result.data.message || 'Error desconocido'}`;
                    showSection('main');
                    return;
                }
                
                // --- NUEVA LÓGICA: Si la CF devuelve un cuestionario, guardarlo localmente y luego re-evaluar ---
                if (result.data && result.data.success && result.data.questionnaire) {
                    currentTransactionId = result.data.transactionId;
                    currentQuestionnaire = result.data.questionnaire;
                    currentPersonData = result.data.person;
                    showMessage('success', 'Cuestionario de Equifax recibido. Por favor, responda las preguntas.', 5000);
                    renderQuestionnaire(currentQuestionnaire); // Renderizar directamente el cuestionario
                    // No necesitamos llamar a initEquifaxPageLogic aquí si renderizamos directamente.
                    // La re-evaluación se hará si el usuario recarga o termina el cuestionario.
                    // Eliminamos la llamada a outputEquifax.textContent si no queremos mostrar el JSON completo aquí.
                } else if (result.data && result.data.success && !result.data.questionnaire) {
                     // Caso: CF exitosa pero sin cuestionario (podría ser para simple validation, o un error lógico)
                    showMessage('warning', 'Validación iniciada, pero no se recibió un cuestionario. Contacte a soporte o reintente.', 0);
                    showSection('main');
                } else {
                    // Este else debería ser capturado por el if (result.data && !result.data.success) anterior.
                    // Pero como fallback, si no es éxito ni error explícito.
                    showMessage('warning', 'Respuesta inesperada de la validación. Contacte a soporte.', 0);
                    showSection('main');
                }

            } catch (error) {
                console.error('DEBUG FRONTEND: Error CRÍTICO en la llamada a Cloud Function initiateEquifaxFullValidationCallable:', error);
                if (error.code) console.error("DEBUG FRONTEND: Código de error:", error.code);
                if (error.details) console.error("DEBUG FRONTEND: Detalles del error:", error.details);
                
                if (outputEquifax) outputEquifax.textContent = `Error: ${error.message}\n${JSON.stringify(error.details || error, null, 2)}`;
                showMessage('error', `Error en Validación Completa: ${error.message}.`);
                // await initEquifaxPageLogic(auth.currentUser); // Comentado, ya que renderizamos directamente
            } finally {
                enableUI(true);
                console.log("DEBUG FRONTEND: Bloque finally de btnRunFullValidation ejecutado.");
            }
        });
        console.log("DEBUG: Listener attached to btnRunFullValidation successfully.");
    } else {
        console.error("DEBUG: ¡ERROR! El botón 'btnRunFullValidation' no fue encontrado en el DOM al cargar la página.");
    }

    // --- Event Listener para enviar respuestas del cuestionario ---
    if (btnSubmitAnswers) {
        btnSubmitAnswers.addEventListener('click', async () => {
            console.log("DEBUG: ¡Botón Enviar Respuestas clickeado!");
            enableUI(false);
            showMessage('info', 'Enviando respuestas del cuestionario...', 0);

            if (!currentTransactionId || !currentQuestionnaire) {
                showMessage('error', 'No hay cuestionario o transacción activa para enviar respuestas.');
                enableUI(true);
                return;
            }

            const totalQuestions = currentQuestionnaire.questionsOfGeneratedQuestionnaire.length;
            const checkedRadioButtons = questionnaireQuestionsDiv.querySelectorAll('input[type="radio"]:checked');

            if (checkedRadioButtons.length !== totalQuestions) {
                console.error("DEBUG FRONTEND: Falla la validación del cliente: preguntas respondidas no coincide con el total.");
                showMessage('error', 'Por favor, responde todas las preguntas del cuestionario.');
                enableUI(true);
                return;
            }

            const questionnaireResponse = Array.from(checkedRadioButtons).map(input => ({
                idOption: parseInt(input.value),
                idQuestion: parseInt(input.name.split('_')[1])
            }));

            try {
                const dataToSend = {
                    idQuestionnaireGenerated: currentQuestionnaire.id,
                    idTransaction: currentTransactionId,
                    questionnaireResponse: questionnaireResponse,
                    userUid: currentUserUID,
                    personData: currentPersonData
                };
                console.log("DEBUG FRONTEND: Datos que se van a enviar a submitEquifaxQuestionnaireAnswersCallable:", JSON.stringify(dataToSend, null, 2));

                const result = await submitEquifaxQuestionnaireAnswersCallable(dataToSend);
                console.log("DEBUG FRONTEND: Resultado envío respuestas (desde Cloud Function):", result.data);

                const { success, validationStatus, questionnaire: newQuestionnaireFromCallable } = result.data;

                console.log(`DEBUG FRONTEND: Estado de validación recibido: ${validationStatus}`);
                if (newQuestionnaireFromCallable) {
                    console.log(`DEBUG FRONTEND: Cuestionario nuevo recibido (ID: ${newQuestionnaireFromCallable.id}, Nivel: ${newQuestionnaireFromCallable.level})`);
                }

                if (validationStatus === 'PENDING_SECOND_LEVEL_QUESTIONNAIRE' && newQuestionnaireFromCallable) {
                    console.log("DEBUG FRONTEND: La condición 'PENDING_SECOND_LEVEL_QUESTIONNAIRE' Y 'newQuestionnaireFromCallable' se CUMPLIÓ.");
                    currentQuestionnaire = newQuestionnaireFromCallable;
                    showMessage('success', 'Cuestionario de segundo nivel recibido. Por favor, responda las nuevas preguntas.', 0);
                    renderQuestionnaire(currentQuestionnaire);

                    const userDocRef = doc(db, 'users', currentUserUID);
                    await updateDoc(userDocRef, {
                        'validationProcess.status': 'equifax_questionnaire_pending',
                        'validationProcess.equifax.questionnaire': newQuestionnaireFromCallable,
                        'validationProcess.equifax.timestamp': new Date(), // <-- Cambiado a 'equifax.timestamp'
                    }, { merge: true });
                    console.log("DEBUG FRONTEND: Cuestionario de segundo nivel renderizado directamente y Firestore actualizado localmente.");

                } else {
                    console.log("DEBUG FRONTEND: La condición 'PENDING_SECOND_LEVEL_QUESTIONNAIRE' Y 'newQuestionnaireFromCallable' NO se CUMPLIÓ. Recurriendo a initEquifaxPageLogic.");
                    showMessage('info', 'Respuestas enviadas. Actualizando estado general...', 0);
                    await initEquifaxPageLogic(auth.currentUser);
                }

            } catch (error) {
                console.error('Error al enviar respuestas:', error);
                showMessage('error', `Error al enviar respuestas: ${error.message}.`);
                await initEquifaxPageLogic(auth.currentUser);
            } finally {
                enableUI(true);
            }
        });
        console.log("DEBUG: Listener attached to btnSubmitAnswers successfully.");
    } else {
        console.error("DEBUG: ¡ERROR! El botón 'btnSubmitAnswers' no fue encontrado en el DOM al cargar la página.");
    }

    // --- Manejador de evento para el botón de prueba CORS. ---
    if (testCorsBtn) {
        testCorsBtn.addEventListener('click', async () => {
            console.log("DEBUG: ¡Botón Probar CORS Función clickeado!");
            enableUI(false);
            showMessage('info', 'Probando función CORS...', 0);
            try {
                const result = await testCORSCallable();
                console.log("Resultado test CORS:", result.data);
                showMessage('success', result.data.message, 5000);
            } catch (error) {
                console.error("Error test CORS:", error);
                showMessage('error', `Error en test CORS: ${error.message}.`);
            } finally {
                enableUI(true);
            }
        });
        console.log("DEBUG: Listener attached to testCorsBtn successfully.");
    } else {
        console.error("DEBUG: ¡ERROR! El botón 'testCorsBtn' no fue encontrado en el DOM al cargar la página.");
    }
    
    // --- Manejador de evento para el botón de Cerrar Sesión (logoutBtn) ---
    // Si no tienes un logoutBtn en ingresar-datos-equifax.html, este bloque debe eliminarse.
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            console.log("DEBUG: ¡Botón Cerrar Sesión clickeado!");
            try {
                await signOut(auth); // Asegúrate de que signOut esté importado
                showMessage('info', 'Sesión cerrada. Redirigiendo...', 1500);
                setTimeout(() => {
                    window.location.href = '/ingresoAValidacion.html';
                }, 1500);
            } catch (error) {
                console.error("Error al cerrar sesión desde Equifax page:", error);
                showMessage('error', 'Error al cerrar sesión: ' + error.message, 0);
            }
        });
        console.log("DEBUG: Listener attached to logoutBtn successfully.");
    }
}); // <-- FIN DEL DOMContentLoaded


// --- Inicialización: Asegura que el usuario esté autenticado al cargar la página ---
onAuthStateChanged(auth, (user) => {
    console.log("DEBUG: onAuthStateChanged fired from ingresar-datos-equifax.js");
    initEquifaxPageLogic(user);
});