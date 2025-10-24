// public/ingresar-datos-equifax.js

// --- Importaciones ---
import {
    auth,
    db,
    functions,
    httpsCallable,
    doc,
    getDoc,
    collection,
    onAuthStateChanged,
    updateDoc
} from './firebaseClient.js';

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
const initiateEquifaxSimpleValidationCallable = httpsCallable(functions, 'initiateEquifaxSimpleValidation');
const initiateEquifaxFullValidationCallable = httpsCallable(functions, 'initiateEquifaxFullValidation');
const submitEquifaxQuestionnaireAnswersCallable = httpsCallable(functions, 'submitEquifaxQuestionnaireAnswers');
const testCORSCallable = httpsCallable(functions, 'testCORSFunction');


// --- 4. Variables de estado locales (globales para el script) ---
let currentTransactionId = null;
let currentQuestionnaire = null; // Guardará el array de preguntas
let currentEquifaxGeneratedId = null; // ID del cuestionario generado por Equifax
let currentUserUID = null;
let isPageInitializing = false;


// --- Funciones de Utilidad (Deben ir aquí, antes del DOMContentLoaded) ---
function showSection(sectionId) {
    // Oculta todas las secciones
    if (mainValidationContent) mainValidationContent.classList.add('hidden');
    if (equifaxResultsDiv) equifaxResultsDiv.classList.add('hidden');
    if (equifaxQuestionnaireDiv) equifaxQuestionnaireDiv.classList.add('hidden');

    // Muestra la sección específica
    if (sectionId === 'main' && mainValidationContent) {
        mainValidationContent.classList.remove('hidden');
    } else if (sectionId === 'results' && equifaxResultsDiv) {
        equifaxResultsDiv.classList.remove('hidden');
    } else if (sectionId === 'questionnaire' && equifaxQuestionnaireDiv) {
        equifaxQuestionnaireDiv.classList.remove('hidden');
    }
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
    // Lista todos los elementos que quieres habilitar/deshabilitar
    const elementsToToggle = [
        inputDocumentNumber, inputGender, inputFullName,
        btnRunSimpleValidation, btnRunFullValidation, btnSubmitAnswers,
        btnRetryEquifax, testCorsBtn, logoutBtn
    ];
    elementsToToggle.forEach(el => {
        if (el) el.disabled = !enable;
    });
}

function renderQuestionnaire(questionsArray) {
    if (!questionnaireQuestionsDiv) {
        console.error("¡ERROR! El elemento 'questionnaire-questions' no fue encontrado en el DOM.");
        return;
    }

    if (!questionsArray || !Array.isArray(questionsArray) || questionsArray.length === 0) {
        console.log("No se encontraron preguntas o datos válidos para renderizar.");
        questionnaireQuestionsDiv.innerHTML = '<p>No hay preguntas disponibles para este cuestionario.</p>';
        if (btnSubmitAnswers) btnSubmitAnswers.classList.add('hidden');
        showSection('main');
        return;
    }

    questionnaireQuestionsDiv.innerHTML = '';

    questionsArray.forEach((q, index) => {
        const questionDiv = document.createElement('div');
        questionDiv.classList.add('question-item');
        questionDiv.setAttribute('data-question-id', q.id); 
        
        // Escapar el contenido HTML para prevenir XSS
        const escapedDescription = q.description.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        let optionsHTML = '';
        q.options.forEach(option => {
            const escapedOptionDescription = option.description.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            optionsHTML += `
                <label>
                    <input type="radio" name="question_${q.id}" value="${option.id}">
                    ${escapedOptionDescription}
                </label>
            `;
        });

        questionDiv.innerHTML = `
            <p>${index + 1}. ${escapedDescription}</p>
            <div class="options-container">
                ${optionsHTML}
            </div>
        `;
        questionnaireQuestionsDiv.appendChild(questionDiv);
    });

    if (btnSubmitAnswers) btnSubmitAnswers.classList.remove('hidden');
    
    showSection('questionnaire');
}


async function initEquifaxPageLogic(user) {
    if (isPageInitializing) {
        console.log("initEquifaxPageLogic ya está en un ciclo de inicialización, omitiendo.");
        return;
    }
    isPageInitializing = true;

    enableUI(false);
    if (userStatusEquifax) userStatusEquifax.textContent = 'Cargando estado del usuario...';

    if (!user) {
        showMessage('error', 'No se detectó un usuario autenticado. Redirigiendo a inicio...', 3000);
        setTimeout(() => window.location.href = '/ingresoAValidacion.html', 3000);
        isPageInitializing = false;
        return;
    }

    currentUserUID = user.uid;
    showMessage('info', `Autenticado como: ${currentUserUID}.`, 0);

    try {
        const userDocRef = doc(db, 'users', currentUserUID);
        const userDocSnap = await getDoc(userDocRef, { source: 'server' });

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const validationProcess = userData.validationProcess || {};

            console.log("Datos completos de validationProcess:", JSON.stringify(validationProcess, null, 2));
            console.log("Estado de validación actual en Firestore:", validationProcess.status);

            if (validationProcess.status === 'payment_confirmed') {
                showMessage('success', 'Pago confirmado. Por favor, ingrese sus datos para iniciar la validación de Equifax.', 0);
                if (inputDocumentNumber) inputDocumentNumber.value = validationProcess.equifax?.person?.documentNumber || "";
                if (inputGender) inputGender.value = validationProcess.equifax?.person?.gender || "";
                if (inputFullName) inputFullName.value = validationProcess.equifax?.person?.fullName || "";
                showSection('main');
            }
            // >>>>>>> INICIO DE LA LÓGICA CORREGIDA PARA QUESTIONNAIRE_PENDING <<<<<<<
            else if (validationProcess.status === 'questionnaire_pending' && validationProcess.equifax && validationProcess.equifax.lastTransactionId) {
                currentTransactionId = validationProcess.equifax.lastTransactionId; // Nuestro ID interno
                currentEquifaxGeneratedId = validationProcess.equifax.idQuestionnaireGenerated; // ID de Equifax

                // Necesitamos leer el documento de la colección 'equifaxValidations' para obtener las preguntas completas
                const equifaxValidationDocRef = doc(db, 'equifaxValidations', currentTransactionId);
                const equifaxValidationDocSnap = await getDoc(equifaxValidationDocRef, { source: 'server' });

                if (equifaxValidationDocSnap.exists()) {
                    const equifaxValidationData = equifaxValidationDocSnap.data();
                    // Asumimos que las preguntas están guardadas aquí:
                    currentQuestionnaire = equifaxValidationData.questionnaire?.questionsOfGeneratedQuestionnaire;

                    if (currentQuestionnaire && currentQuestionnaire.length > 0) {
                        console.log("currentTransactionId después de carga de Firestore (EQ_PENDING):", currentTransactionId);
                        console.log("currentEquifaxGeneratedId después de carga de Firestore (EQ_PENDING):", currentEquifaxGeneratedId);
                        console.log("currentQuestionnaire después de carga de Firestore (EQ_PENDING):", JSON.stringify(currentQuestionnaire, null, 2));

                        showMessage('info', 'Continuando validación con cuestionario pendiente...', 0);
                        renderQuestionnaire(currentQuestionnaire);
                    } else {
                        console.error("No se encontraron preguntas válidas en el documento equifaxValidations para", currentTransactionId);
                        showMessage('warning', 'Validación pendiente pero sin preguntas. Intente de nuevo o contacte a soporte.', 0);
                        showSection('main'); // Volver a la sección principal si no hay preguntas válidas
                    }
                } else {
                    console.error("Documento equifaxValidations no encontrado para transactionId:", currentTransactionId);
                    showMessage('warning', 'Validación pendiente, pero no se encontró el detalle del cuestionario. Contacte a soporte.', 0);
                    showSection('main'); // Volver a la sección principal si el documento de validación no existe
                }
            }
            // >>>>>>> FIN DE LA LÓGICA CORREGIDA PARA QUESTIONNAIRE_PENDING <<<<<<<
            // Otros estados de validación completada
            else if (validationProcess.status === 'equifax_validation_approved' || validationProcess.status === 'completed_validated') {
                showMessage('success', 'Validación de identidad aprobada. Redirigiendo a los datos fiscales...', 3000);

                setTimeout(() => window.location.href = '/datos_fiscales.html', 3000);
                showSection('none');
            }
            // Cualquier otro estado (initial, failed, expired, o desconocido)
            else {
                showMessage('warning', `Estado actual: ${validationProcess.status}. Redirigiendo a inicio...`, 3000);
                showSection('main');
                setTimeout(() => window.location.href = '/ingresoAValidacion.html', 3000);
            }
        } else { // Si el documento del usuario no existe en Firestore
            showMessage('warning', 'Documento de usuario no encontrado en Firestore. Redirigiendo a inicio...', 3000);
            showSection('main');
            setTimeout(() => window.location.href = '/ingresoAValidacion.html', 3000);
        }
    } catch (error) {
        console.error("Error al cargar datos de usuario en Equifax page:", error);
        showMessage('error', 'Error al cargar los datos del proceso. Intente de nuevo.', 0);
        showSection('main');
    } finally {
        enableUI(true);
        isPageInitializing = false;
    }
}
// --- Bloque Principal de Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {

    // --- Event Listener para btnRunSimpleValidation ---
    if (btnRunSimpleValidation) {
        btnRunSimpleValidation.addEventListener('click', async () => {
            enableUI(false);
            showMessage('info', 'Ejecutando Validación Simple...', 0);
            if (outputEquifax) outputEquifax.textContent = 'Procesando...';
            showSection('results');

            try {
                const documentNumber = inputDocumentNumber.value.trim();
                const gender = inputGender.value.trim().toUpperCase(); 
                const fullName = inputFullName.value.trim(); 
                const userRole = localStorage.getItem('userSelectedValidationRole');

                if (!documentNumber || !gender || !fullName || !userRole) {
                    showMessage('error', 'Por favor, complete todos los campos obligatorios (Número de Documento, Género, Nombre Completo) y asegúrese de que su rol esté definido.', 5000);
                    enableUI(true);
                    console.error("Fallo en validación de campos del cliente.");
                    showSection('main');
                    return;
                }

                const dataToSend = {
                    documentNumber: documentNumber,
                    gender: gender,
                    fullName: fullName,
                    role: userRole
                };

                const result = await initiateEquifaxSimpleValidationCallable(dataToSend);

                if (result.data && result.data.success) {
                    if (outputEquifax) outputEquifax.textContent = JSON.stringify(result.data, null, 2);
                    showMessage('success', result.data.message || 'Validación Simple Finalizada con éxito.', 0);
                    showSection('results');
                } else {
                    console.error("Cloud Function reportó un error de NEGOCIO:", result.data?.message || "Error desconocido en CF.");
                    showMessage('error', result.data?.message || 'Error desconocido en Cloud Function.', 0);
                    if (outputEquifax) outputEquifax.textContent = `Error: ${result.data?.message || 'Error desconocido'}`;
                    showSection('main');
                }

            } catch (error) {
                console.error('Error CRÍTICO en la llamada a Cloud Function initiateEquifaxSimpleValidationCallable:', error);
                if (error.code) console.error("Código de error:", error.code);
                if (error.details) console.error("Detalles del error:", error.details);
                if (outputEquifax) outputEquifax.textContent = `Error: ${error.message}\n${JSON.stringify(error.details || error, null, 2)}`;
                showMessage('error', `Error en Validación Simple: ${error.message}.`);
                showSection('main');
            } finally {
                enableUI(true);
            }
        });
    }

    // --- Event Listener para btnRunFullValidation ---
    if (btnRunFullValidation) {
        btnRunFullValidation.addEventListener('click', async () => {
            enableUI(false);
            showMessage('info', 'Ejecutando Validación Completa (obteniendo cuestionario)...', 0);
            if (outputEquifax) outputEquifax.textContent = 'Procesando...';
            showSection('results');

            try {
                const documentNumber = inputDocumentNumber.value.trim();
                const gender = inputGender.value.trim().toUpperCase(); 
                const fullName = inputFullName.value.trim();
                const userRole = localStorage.getItem('userSelectedValidationRole');

                if (!documentNumber || !gender || !fullName || !userRole) {
                    showMessage('error', 'Por favor, complete todos los campos obligatorios (Número de Documento, Género, Nombre Completo) y asegúrese de que su rol esté definido.', 5000);
                    enableUI(true);
                    console.error("Fallo en validación de campos del cliente (userRole podría ser null).");
                    showSection('main');
                    return;
                }

                const dataToSend = {
                    documentNumber: documentNumber,
                    gender: gender,
                    fullName: fullName
                    // questionnaireConfigurationId NO se envía desde el frontend; la CF lo obtiene de un secreto
                };

                const result = await initiateEquifaxFullValidationCallable(dataToSend);

                if (result.data && !result.data.success) {
                    console.error("Cloud Function reportó un error de NEGOCIO:", result.data.message || "Error desconocido en CF.");
                    showMessage('error', result.data.message || 'Error desconocido en Cloud Function.', 0);
                    if (outputEquifax) outputEquifax.textContent = `Error: ${result.data.message || 'Error desconocido'}`;
                    showSection('main');
                    return;
                }

                // --- LÓGICA CLAVE: Si la CF devuelve un cuestionario, guardarlo y renderizarlo ---
                // Aquí usamos result.data.questionnaire y result.data.idQuestionnaireGenerated
                if (result.data && result.data.success && result.data.questionnaire && result.data.questionnaire.length > 0) {
                    currentTransactionId = result.data.transactionId; // Nuestro ID interno
                    currentQuestionnaire = result.data.questionnaire; // Array de preguntas
                    currentEquifaxGeneratedId = result.data.idQuestionnaireGenerated; // ID de Equifax

                    showMessage('success', 'Cuestionario de Equifax recibido. Por favor, responda las preguntas.', 0);
                    renderQuestionnaire(currentQuestionnaire);
                    return;
                } else {
                    showMessage('warning', 'Validación iniciada, pero no se recibió un cuestionario o está vacío. Contacte a soporte o reintente.', 0);
                    showSection('main');
                    return;
                }

            } catch (error) {
                console.error('Error CRÍTICO en la llamada a Cloud Function initiateEquifaxFullValidationCallable:', error);
                if (error.code) console.error("Código de error:", error.code);
                if (error.details) console.error("Detalles del error:", error.details);

                if (outputEquifax) outputEquifax.textContent = `Error: ${error.message}\n${JSON.stringify(error.details || error, null, 2)}`;
                showMessage('error', `Error en Validación Completa: ${error.message}.`);
                showSection('main');
            } finally {
                enableUI(true);
            }
        });
    } else {
        console.error("¡ERROR! El botón 'btnRunFullValidation' no fue encontrado en el DOM al cargar la página.");
    }

    if (btnSubmitAnswers) {
        btnSubmitAnswers.addEventListener('click', async () => {
            enableUI(false);
            showMessage('info', 'Enviando respuestas del cuestionario...', 0);

            if (!currentTransactionId || !currentQuestionnaire || !currentEquifaxGeneratedId) {
                showMessage('error', 'No hay cuestionario o transacción activa para enviar respuestas. (Falta Transaction ID, Cuestionario o ID Generado por Equifax).');
                enableUI(true);
                return;
            }

            const totalQuestions = currentQuestionnaire.length;
            const checkedRadioButtons = questionnaireQuestionsDiv.querySelectorAll('input[type="radio"]:checked');

            if (checkedRadioButtons.length !== totalQuestions) {
                console.error("Falla la validación del cliente: preguntas respondidas no coincide con el total.");
                showMessage('error', 'Por favor, responde todas las preguntas del cuestionario.');
                enableUI(true);
                return;
            }

            const questionnaireResponse = Array.from(checkedRadioButtons).map(input => ({
                idOption: parseInt(input.value),
                idQuestion: parseInt(input.name.split('_')[1])
            }));

            const userRole = localStorage.getItem('userSelectedValidationRole');

            if (!userRole) {
                showMessage('error', 'No se pudo determinar el rol del usuario para enviar las respuestas.');
                enableUI(true);
                return;
            }

            try {
                const dataToSend = {
                    transactionId: currentTransactionId, // Nuestro ID interno
                    questionnaireResponses: questionnaireResponse,
                    userUid: currentUserUID,
                    userRole: userRole,
                    // idQuestionnaireGenerated NO se envía desde el frontend; la CF lo obtiene de Firestore
                };

                const result = await submitEquifaxQuestionnaireAnswersCallable(dataToSend);

                const { success, validationStatus, questionnaire: newQuestionnaireFromCallable } = result.data;

                console.log(`Estado de validación recibido: ${validationStatus}`);
                if (newQuestionnaireFromCallable) {
                    console.log(`Cuestionario nuevo recibido (ID: ${newQuestionnaireFromCallable.id || 'N/A'}, Nivel: ${newQuestionnaireFromCallable.level || 'N/A'})`);
                }

                if (validationStatus === 'PENDING_SECOND_LEVEL_QUESTIONNAIRE' && newQuestionnaireFromCallable && newQuestionnaireFromCallable.length > 0) {
                    currentQuestionnaire = newQuestionnaireFromCallable; // Carga el nuevo cuestionario
                    showMessage('info', 'Por favor, responda el cuestionario de segundo nivel.', 0);
                    renderQuestionnaire(currentQuestionnaire);
                    return;
                } else if (success && (validationStatus === 'equifax_validation_approved' || validationStatus === 'completed_validated')) {
                     showMessage('success', result.data.message || 'Validación de Equifax completada y aprobada. Redirigiendo...', 3000);
                     setTimeout(() => {
                         window.location.href = '/datos_fiscales.html';
                     }, 3000);
                } else {
                    console.log("La condición 'PENDING_SECOND_LEVEL_QUESTIONNAIRE' Y 'newQuestionnaireFromCallable' NO se CUMPLIÓ. Recurriendo a initEquifaxPageLogic.");
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
    }
    
    // --- Manejador de evento para el botón de prueba CORS. ---
    if (testCorsBtn) {
        testCorsBtn.addEventListener('click', async () => {
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
    }
    
    // --- Manejador de evento para el botón de Cerrar Sesión (logoutBtn) ---
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
                showMessage('info', 'Sesión cerrada. Redirigiendo...', 1500);
                setTimeout(() => {
                    window.location.href = '/ingresoAValidacion.html';
                }, 1500);
            } catch (error) {
                console.error("Error al cerrar sesión desde Equifax page:", error);
                showMessage('error', 'Error al cerrar sesión: ' + error.message, 0);
            }
        });
    }
}); // <-- FIN DEL DOMContentLoaded

// --- Inicialización: Asegura que el usuario esté autenticado al cargar la página ---
onAuthStateChanged(auth, (user) => {
    initEquifaxPageLogic(user);
});