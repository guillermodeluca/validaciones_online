// public/ingresoAValidacion.js

// *********************************************************************************
// * IMPORTACIONES (TODAS AL PRINCIPIO DEL ARCHIVO)                                *
// *********************************************************************************
import { 
    auth, 
    db, 
    functions, 
    httpsCallable, 
    signInAnonymously, 
    signInWithCustomToken, 
    onAuthStateChanged, 
    doc, 
    getDoc,
    initiatePaymentClient,
    processPaymentConfirmationClient
} from './firebaseClient.js';

// *********************************************************************************
// * CONFIGURACIÓN DE DATOS DE PRUEBA (PARA LLAMADAS A EQUIFAX Y PAGOS)            *
// *********************************************************************************
const TEST_PAYMENT_AMOUNT_PROPIETARIO = 100.00;
const TEST_PAYMENT_AMOUNT_INQUILINO = 10.00;
const TEST_DOCUMENT_NUMBER = "12345678";
const TEST_GENDER = "M";
const TEST_FULL_NAME = "Juan Perez";

// *********************************************************************************
// * REFERENCIAS A LOS ELEMENTOS DEL DOM                                           *
// *********************************************************************************
const userStatusMsg = document.getElementById('user-status-msg');
const mainValidationContent = document.getElementById('main-validation-content');
const initialSelectionSection = document.getElementById('initial-selection-section');
const questionnaireSection = document.getElementById('questionnaire-section');
const messageDisplay = document.getElementById('message-display');

const validatePropietarioBtn = document.getElementById('validate-propietario-btn');
const validateInquilinoBtn = document.getElementById('validate-inquilino-btn');
const recoveryTokenBtn = document.getElementById('recovery-token-btn');

const questionnaireInfo = document.getElementById('questionnaire-info');
const questionsContainer = document.getElementById('questions-container');
const submitAnswersBtn = document.getElementById('submit-answers-btn');

// *********************************************************************************
// * VARIABLES DE ESTADO GLOBALES (Mantenerlas al mínimo necesario)                *
// *********************************************************************************
let currentTransactionId = null;
let currentQuestionnaire = null;
let currentValidationRole = null;

// *********************************************************************************
// * REFERENCIAS A LAS CLOUD FUNCTIONS CALLABLE                                    *
// *********************************************************************************
const initiateEquifaxFullValidation = httpsCallable(functions, 'initiateEquifaxFullValidation');
const submitEquifaxQuestionnaireAnswers = httpsCallable(functions, 'submitEquifaxQuestionnaireAnswers');
const testAuthFunction = httpsCallable(functions, 'testAuth');

// *********************************************************************************
// * FUNCIONES DE UTILIDAD                                                         *
// *********************************************************************************

function showMessage(type, message, duration = 5000) {
    messageDisplay.classList.remove('hidden', 'success', 'error', 'info');
    messageDisplay.classList.add(type);
    messageDisplay.textContent = message;
    if (duration > 0) {
        setTimeout(() => {
            messageDisplay.classList.add('hidden');
        }, duration);
    }
}

function enableUI(enable) {
    const actionButtons = [validatePropietarioBtn, validateInquilinoBtn, recoveryTokenBtn, submitAnswersBtn];
    actionButtons.forEach(btn => {
        if (btn) btn.disabled = !enable;
    });
}

function showSection(sectionId) {
    initialSelectionSection.classList.add('hidden');
    questionnaireSection.classList.add('hidden');
    document.getElementById(sectionId).classList.remove('hidden');
}

function renderQuestionnaire(questions) {
    questionsContainer.innerHTML = '';
    if (!questions || questions.length === 0) {
        questionnaireInfo.textContent = 'No hay preguntas disponibles.';
        return;
    }

    questionnaireInfo.textContent = 'Responde las siguientes preguntas para continuar tu validación:';
    questions.forEach((q, index) => {
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
        questionsContainer.appendChild(questionDiv);
    });
    submitAnswersBtn.classList.remove('hidden');
}

// *********************************************************************************
// * LÓGICA DE RETORNO DE LA PASARELA DE PAGO                                      *
// *********************************************************************************

async function handleReturnFromPaymentGateway(transactionId, role) {
    enableUI(false);
    showMessage('info', 'Verificando su pago...', 0);

    try {
        const paymentDetails = {
            transactionId: transactionId,
            amount: (role === 'propietario') ? TEST_PAYMENT_AMOUNT_PROPIETARIO : TEST_PAYMENT_AMOUNT_INQUILINO,
            currency: "ARS",
        };

        const result = await processPaymentConfirmationClient({
            paymentDetails,
            validationRole: role,
        });
        const data = result.data;

        if (data.success) {
            console.log("Pago procesado por Cloud Function. No se requiere Custom Token en esta fase de desarrollo.");
            showMessage('success', data.message || 'Pago confirmado y proceso iniciado. Actualizando estado...', 3000);
        } else {
            console.error("Error al procesar el pago:", data.message);
            showMessage('error', `Error al confirmar el pago: ${data.message || 'Error desconocido'}.`, 0);
            showSection('initial-selection-section');
        }
    } catch (error) {
        console.error("Error al llamar a processPaymentConfirmation Cloud Function:", error);
        showMessage('error', `Error en el servidor al procesar el pago: ${error.message}.`, 0);
        showSection('initial-selection-section');
    } finally {
        // No habilitar UI aquí, dejar que initAppLogic lo haga
    }
}

// *********************************************************************************
// * LÓGICA DE INICIO DE PAGO (PARA BOTONES "Validar como...")                     *
// *********************************************************************************

async function handlePaymentInitiation(role) {
    enableUI(false);
    showMessage('info', 'Preparando el pago...', 0);
    currentValidationRole = role;

    console.log("DEBUG handlePaymentInitiation: Intentando guardar en localStorage 'userSelectedValidationRole' con valor:", role);
    localStorage.setItem('userSelectedValidationRole', role);
    console.log("DEBUG handlePaymentInitiation: Valor de 'userSelectedValidationRole' en localStorage DESPUÉS de setItem:", localStorage.getItem('userSelectedValidationRole'));

    try {
        const amount = (role === 'propietario') ? TEST_PAYMENT_AMOUNT_PROPIETARIO : TEST_PAYMENT_AMOUNT_INQUILINO;
        const returnUrl = window.location.origin + window.location.pathname + '?payment_status=success&transaction_id={TRANSACTION_ID_PLACEHOLDER}';
        const payload = { role, amount, returnUrl };

        const result = await initiatePaymentClient(payload);
        console.log("Pago iniciado:", result);

        if (result?.transactionId) {
            localStorage.setItem("lastTransactionId", result.transactionId);
            if (result.paymentUrl) {
                showMessage('info', 'Redirigiendo a la pasarela de pago...', 3000);
                window.location.href = result.paymentUrl;
            } else {
                throw new Error("Respuesta inválida del servicio de pago: falta paymentUrl.");
            }
        } else {
            throw new Error("Respuesta inválida del servicio de pago.");
        }
    } catch (error) {
        console.error("Error en handlePaymentInitiation:", error);
        showMessage('error', `No se pudo iniciar el pago: ${error.message}.`, 5000);
        enableUI(true);
    }
}

// *********************************************************************************
// * LÓGICA DE INICIALIZACIÓN Y GESTIÓN DE ESTADOS (Disparada por onAuthStateChanged) *
// *********************************************************************************

async function initAppLogic(user) {
    enableUI(false);
    userStatusMsg.textContent = 'Cargando estado del proceso...';
    mainValidationContent.classList.add('hidden');

    if (!user) {
        try {
            console.log("initAppLogic: No user found. Attempting signInAnonymously.");
            await signInAnonymously(auth);
            return;
        } catch (error) {
            console.error("Error al iniciar sesión anónimamente:", error);
            showMessage('error', 'Error crítico: No se pudo iniciar sesión para continuar.', 0);
            mainValidationContent.classList.remove('hidden');
            enableUI(true);
            return;
        }
    }

    const currentUserUID = user.uid;
    userStatusMsg.textContent = `Autenticado como: ${currentUserUID}.`;

    try {
        const userDocRef = doc(db, 'users', currentUserUID);
        const userDocSnap = await getDoc(userDocRef);

        console.log("userDocSnap exists:", userDocSnap.exists());
        console.log("userDocSnap data:", userDocSnap.data());

        const userData = userDocSnap.exists() && userDocSnap.data() !== undefined && userDocSnap.data() !== null
            ? userDocSnap.data()
            : {};

        let validationProcess = (userData.validationProcess && typeof userData.validationProcess === 'object' && userData.validationProcess !== null)
            ? { ...userData.validationProcess }
            : { status: 'initial' };

        if (!validationProcess.status || !['initial', 'payment_initiated', 'payment_confirmed', 'equifax_questionnaire_pending', 'equifax_completed_pending_data', 'completed_validated', 'failed', 'expired'].includes(validationProcess.status)) {
            validationProcess.status = 'initial';
        }

        const urlParams = new URLSearchParams(window.location.search);
        const paymentStatus = urlParams.get('payment_status');
        const transactionIdFromUrl = urlParams.get('transaction_id');
        const roleFromLocalStorage = localStorage.getItem('userSelectedValidationRole');

        const newQueryString = new URLSearchParams(window.location.search).toString();
        if (newQueryString !== window.location.search.substring(1)) {
            history.replaceState(null, '', window.location.pathname + (newQueryString ? '?' + newQueryString : ''));
        }

        if (paymentStatus === 'success' && transactionIdFromUrl && roleFromLocalStorage && validationProcess.status !== 'payment_confirmed' && validationProcess.status !== 'completed_validated') {
            showMessage('info', 'Procesando confirmación de pago...');
            await handleReturnFromPaymentGateway(transactionIdFromUrl, roleFromLocalStorage);
            await initAppLogic(user);
            return;
        } else if (paymentStatus === 'failed') {
            showMessage('error', 'El pago no se realizó con éxito. Por favor, inténtelo de nuevo.', 0);
            showSection('initial-selection-section');
        } else if (validationProcess.status === 'initial' || validationProcess.status === 'failed' || validationProcess.status === 'expired') {
            showMessage('info', 'Bienvenido. Selecciona el tipo de validación que deseas iniciar.', 0);
            showSection('initial-selection-section');
        } else if (validationProcess.status === 'payment_initiated') {
            showMessage('info', 'Detectamos un pago iniciado. Por favor, complete la transacción en la pasarela o inicie un nuevo intento.', 0);
            showSection('initial-selection-section');
        } else if (validationProcess.status === 'payment_confirmed') {
            showMessage('info', 'Su pago ha sido confirmado. Redirigiendo para continuar con la validación.', 3000);
            window.location.href = '/ingresar-datos-equifax.html';
        } else if (validationProcess.status === 'equifax_questionnaire_pending' && validationProcess.equifax && validationProcess.equifax.questionnaire) {
            showMessage('info', 'Continúe con su proceso de validación respondiendo el cuestionario.', 3000);
            showSection('questionnaire-section');
            renderQuestionnaire(validationProcess.equifax.questionnaire.questionsOfGeneratedQuestionnaire);
            currentTransactionId = validationProcess.equifax.idTransaccion;
            currentQuestionnaire = validationProcess.equifax.questionnaire;
            currentValidationRole = validationProcess.role;
        } else if (validationProcess.status === 'equifax_completed_pending_data' || validationProcess.status === 'completed_validated') {
            showMessage('success', 'Validación completada y aprobada. Redirigiendo a su panel de usuario.', 3000);
            if (validationProcess.role === 'propietario') {
                window.location.href = 'propietario_test.html';
            } else if (validationProcess.role === 'inquilino') {
                window.location.href = 'inquilino_test.html';
            } else {
                window.location.href = 'index.html';
            }
        } else {
            showMessage('info', `Estado actual desconocido: ${validationProcess.status}. Contacte a soporte.`, 0);
            showSection('initial-selection-section');
        }

    } catch (error) {
        console.error("Error en initAppLogic:", error);
        userStatusMsg.textContent = 'Error al cargar. Intente de nuevo.';
        showMessage('error', 'Ocurrió un error al cargar su proceso. Por favor, recargue la página.');
        showSection('initial-selection-section');
    } finally {
        mainValidationContent.classList.remove('hidden');
        enableUI(true);
    }
}

// *********************************************************************************
// * MANEJO DE LA VALIDACIÓN DE IDENTIDAD CON EQUIFAX                              *
// *********************************************************************************
async function handleEquifaxValidationInitiation() {
    enableUI(false);
    showMessage('info', 'Iniciando validación de identidad con Equifax...', 0);

    try {
        const result = await initiateEquifaxFullValidation({
            documentNumber: TEST_DOCUMENT_NUMBER,
            gender: TEST_GENDER,
            fullName: TEST_FULL_NAME
        });
        const data = result.data;

        if (data.success) {
            currentTransactionId = data.transactionId;
            currentQuestionnaire = data.questionnaire;

            if (currentQuestionnaire && currentQuestionnaire.questionsOfGeneratedQuestionnaire && currentQuestionnaire.questionsOfGeneratedQuestionnaire.length > 0) {
                showMessage('info', 'Por favor, responda el cuestionario de Equifax.', 0);
                showSection('questionnaire-section');
                renderQuestionnaire(currentQuestionnaire.questionsOfGeneratedQuestionnaire);
            } else {
                showMessage('success', 'Validación inicial Equifax exitosa. No se requiere cuestionario. Finalizando proceso...', 3000);
                initAppLogic(auth.currentUser);
            }
        } else {
            showMessage('error', `Error al iniciar validación con Equifax: ${data.message || 'Error desconocido'}.`);
        }
    } catch (error) {
        console.error('Error en initiateEquifaxFullValidation:', error);
        showMessage('error', `Error del servidor al iniciar Equifax: ${error.message}.`);
    } finally {
        enableUI(true);
    }
}

submitAnswersBtn.addEventListener('click', async () => {
    enableUI(false);
    messageDisplay.classList.add('hidden');

    if (!currentQuestionnaire || !currentQuestionnaire.questionsOfGeneratedQuestionnaire) {
        showMessage('error', 'No hay un cuestionario cargado para enviar.');
        enableUI(true);
        return;
    }

    const totalQuestions = currentQuestionnaire.questionsOfGeneratedQuestionnaire.length;
    const answeredQuestions = questionsContainer.querySelectorAll('input[type="radio"]:checked');

    if (answeredQuestions.length !== totalQuestions) {
        showMessage('error', 'Por favor, responde todas las preguntas del cuestionario.');
        enableUI(true);
        return;
    }

    const questionnaireResponses = Array.from(answeredQuestions).map(input => ({
        idQuestion: parseInt(input.name.split('_')[1]),
        idOption: parseInt(input.value)
    }));

    try {
        const result = await submitEquifaxQuestionnaireAnswers({
            transactionId: currentTransactionId,
            questionnaireResponses: questionnaireResponses,
            userRole: currentValidationRole
        });
        const data = result.data;

        if (data.success) {
            showMessage('success', `Validación completada. Estado: ${data.validationStatus}.`, 3000);
            initAppLogic(auth.currentUser);
        } else {
            showMessage('error', `Error al enviar respuestas: ${data.message || 'Error desconocido'}.`);
        }

    } catch (error) {
        console.error('Error en submitEquifaxFullValidation:', error);
        showMessage('error', `Error del servidor al enviar respuestas: ${error.message}.`);
    } finally {
        enableUI(true);
    }
});

// *********************************************************************************
// * LISTENERS DE EVENTOS                                                          *
// *********************************************************************************

validatePropietarioBtn.addEventListener('click', () => handlePaymentInitiation('propietario'));
validateInquilinoBtn.addEventListener('click', () => handlePaymentInitiation('inquilino'));

recoveryTokenBtn.addEventListener('click', () => {
    window.location.href = '/recuperar-validacion.html';
});

// *********************************************************************************
// * INICIALIZACIÓN GENERAL DE LA APP AL CARGAR EL DOCUMENTO                       *
// *********************************************************************************

onAuthStateChanged(auth, (user) => {
    console.log("onAuthStateChanged fired. User:", user ? user.uid : "null");
    initAppLogic(user);
});

(async () => {
    try {
        const result = await testAuthFunction({});
        console.log('Resultado de testAuth:', result.data);
    } catch (error) {
        console.error('Error al llamar testAuth desde cliente:', error);
    }
})();
