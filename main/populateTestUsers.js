// populateTestUsers.js
// Este script se ejecuta para poblar los emuladores de Firebase con datos de prueba.
// Asegúrate de que los emuladores de Auth y Firestore estén corriendo ANTES de ejecutar este script.

const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid'); // Para generar UUIDs

// --- Inicialización del Admin SDK ---
// ¡IMPORTANTE!: Esta sección ahora maneja la conexión a los emuladores o a producción.
// Si las variables de entorno del emulador están configuradas (p.ej. al ejecutar 'firebase emulators:start'),
// el Admin SDK se conectará automáticamente a ellos.
// Si no están configuradas, intentará usar 'serviceAccountKey.json' para conectar a producción.
if (!admin.apps.length) {
    if (process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST) {
        console.log(`Conectando Admin SDK al emulador de Firestore en: ${process.env.FIRESTORE_EMULATOR_HOST}`);
        console.log(`Conectando Admin SDK al emulador de Auth en: ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);
        
        // Inicializa el Admin SDK sin credenciales específicas; confiará en las variables de entorno del emulador.
        admin.initializeApp({
            // Puedes usar un project ID genérico o el de tu proyecto para emulación
           projectId: 'validacionesonline-26d4c'
        });

        // Configura explícitamente Firestore para usar el host del emulador.
        admin.firestore().settings({
            host: process.env.FIRESTORE_EMULATOR_HOST,
            ssl: false, // El emulador no usa SSL/TLS
            ignoreUndefinedProperties: true, // Buena práctica
        });

    } else {
        // Si no se detectan variables de entorno del emulador, conectar a producción.
        // ¡ATENCIÓN!: La ruta a serviceAccountKey.json debe ser CORRECTA para tu proyecto.
        // Es común que esté en el directorio raíz o en un directorio específico (p.ej. '../serviceAccountKey.json').
        try {
            const serviceAccount = require('../serviceAccountKey.json'); 
            console.log('Conectando Admin SDK a la base de datos de producción (no se detectó configuración de emulador).');
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
        } catch (e) {
            console.error('Error: serviceAccountKey.json no encontrado o inaccesible. No se puede conectar a Firebase sin credenciales o configuración de emulador.');
            console.error('Asegúrate de que serviceAccountKey.json existe en la ruta correcta, o que los emuladores están corriendo.');
            process.exit(1); // Salir si no se puede inicializar
        }
    }
}
const db = admin.firestore();
const auth = admin.auth(); // También obtenemos la instancia de Auth aquí

// --- Datos de Prueba ---
const testUsersData = [
    // --- ADMINISTRADOR ---
    {
        authEmail: 'admin@sistema.com',
        authPassword: 'AdminSecure2024!',
        role: 'admin',
        tipoUsuario: 'admin',
        searchId: 'SYSADMIN001',
        identityData: {
            nombreCompleto: 'Administrador del Sistema',
            domicilio: 'Av. Central 1000',
            localidad: 'Buenos Aires',
            pais: 'Argentina',
            identificacionFiscalTipo: 'DNI',
            identificacionFiscalNumero: '00.000.001',
            emailContacto: 'admin@sistema.com',
            telefonoContacto: '+54 11 0000 0001',
            permisos: ['superuser', 'gestion_usuarios', 'reportes', 'configuracion_sistema']
        }
    },
    
    // --- INQUILINOS EXISTENTES (5) ---
    {
        authEmail: 'juan.perez@email.com',
        authPassword: 'Juan2024mail',
        role: 'inquilino',
        tipoUsuario: 'inquilino',
        searchId: 'ARGPER2024001',
        identityData: {
            nombreCompleto: 'Juan Martín Pérez',
            domicilio: 'Calle Mitre 1234, Piso 1',
            localidad: 'Buenos Aires',
            pais: 'Argentina',
            identificacionFiscalTipo: 'DNI',
            identificacionFiscalNumero: '32.123.456',
            emailContacto: 'juan.perez@email.com',
            telefonoContacto: '+54 11 5678 4321',
        }
    },
    {
        authEmail: 'maria.ramirez@email.com',
        authPassword: 'MariaCelu24',
        role: 'inquilino',
        tipoUsuario: 'inquilino',
        searchId: 'ARGPER2024002',
        identityData: {
            nombreCompleto: 'María Celeste Ramírez',
            domicilio: 'Av. Santa Fe 567, Departamento 4',
            localidad: 'Córdoba',
            pais: 'Argentina',
            identificacionFiscalTipo: 'DNI',
            identificacionFiscalNumero: '28.765.432',
            emailContacto: 'maria.ramirez@email.com',
            telefonoContacto: '+54 351 234 5678',
        }
    },
    {
        authEmail: 'pablo.gutierrez@email.com',
        authPassword: 'PabloGut2024',
        role: 'inquilino',
        tipoUsuario: 'inquilino',
        searchId: 'ARGPER2024003',
        identityData: {
            nombreCompleto: 'Pablo Andrés Gutiérrez',
            domicilio: 'Calle San Juan 890',
            localidad: 'Rosario',
            pais: 'Argentina',
            identificacionFiscalTipo: 'DNI',
            identificacionFiscalNumero: '23.456.789',
            emailContacto: 'pablo.gutierrez@email.com',
            telefonoContacto: '+54 341 678 1234',
            habilitacionMunicipal: 'No aplicable',
        }
    },
    {
        authEmail: 'valeria.diaz@email.com',
        authPassword: 'ValDiaz24',
        role: 'inquilino',
        tipoUsuario: 'inquilino',
        searchId: 'ARGPER2024004',
        identityData: {
            nombreCompleto: 'Valeria Susana Díaz',
            domicilio: 'Calle Belgrano 234, Piso 3',
            localidad: 'Mendoza',
            pais: 'Argentina',
            identificacionFiscalTipo: 'DNI',
            identificacionFiscalNumero: '30.987.654',
            emailContacto: 'valeria.diaz@email.com',
            telefonoContacto: '+54 261 456 7890',
            habilitacionMunicipal: 'No aplicable',
        }
    },
    {
        authEmail: 'diego.lopez@email.com',
        authPassword: 'DiegoF2024',
        role: 'inquilino',
        tipoUsuario: 'inquilino',
        searchId: 'ARGPER2024005',
        identityData: {
            nombreCompleto: 'Diego Fernando López',
            domicilio: 'Av. Roca 345',
            localidad: 'Mar del Plata',
            pais: 'Argentina',
            identificacionFiscalTipo: 'DNI',
            identificacionFiscalNumero: '20.987.654',
            emailContacto: 'diego.lopez@email.com',
            telefonoContacto: '+54 223 567 8901',
            habilitacionMunicipal: 'No aplicable',
        }
    },
    
    // --- INQUILINOS NUEVOS (50) ---
    ...Array.from({ length: 50 }, (_, i) => {
        const id = i + 1;
        const paddedId = id.toString().padStart(3, '0');
        return {
            authEmail: `inquilino${paddedId}@test.com`,
            authPassword: `Inquilino${paddedId}2024`,
            role: 'inquilino',
            tipoUsuario: 'inquilino',
            searchId: `ARGTST2024${paddedId}`,
            identityData: {
                nombreCompleto: `Inquilino ${id} de Prueba`,
                domicilio: `Calle Test ${100 + id}, Piso ${(id % 5) + 1}`,
                localidad: ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza', 'Mar del Plata'][id % 5],
                pais: 'Argentina',
                identificacionFiscalTipo: 'DNI',
                identificacionFiscalNumero: `40.${paddedId}.${paddedId}`,
                emailContacto: `inquilino${paddedId}@test.com`,
                telefonoContacto: `+54 11 1000 ${paddedId.toString().padStart(4, '0')}`,
                habilitacionMunicipal: 'No aplicable',
            }
        };
    }),
    
    // --- PROPIETARIOS EXISTENTES (5) ---
    {
        authEmail: 'contacto@textilba.com.ar',
        authPassword: 'Textil2024ba',
        role: 'propietario',
        tipoUsuario: 'propietario',
        searchId: 'ARG2024001',
        identityData: {
            razonSocial: 'Textil Buenos Aires S.A.',
            titular: 'Martín Federico Ruiz',
            direccion: 'Av. Rivadavia 1500, Piso 2',
            localidad: 'Buenos Aires',
            pais: 'Argentina',
            identificacionFiscalTipo: 'CUIT',
            identificacionFiscalNumero: '30-12345678-9',
            emailContacto: 'contacto@textilba.com.ar',
            telefonoContacto: '+54 11 4321 5678',
            paginaWeb: 'www.textilba.com.ar',
            alias: 'TEXTIL.BA',
            habilitacionMunicipal: 'HBM-12345-BA',
        }
    },
    {
        authEmail: 'info@innovarsrl.com.ar',
        authPassword: 'Innovar2024',
        role: 'propietario',
        tipoUsuario: 'propietario',
        searchId: 'ARG2024002',
        identityData: {
            razonSocial: 'Consultora Innovar SRL',
            titular: 'Laura Isabel Fernández',
            direccion: 'Calle Corrientes 920, Oficina 10',
            localidad: 'Córdoba',
            pais: 'Argentina',
            identificacionFiscalTipo: 'CUIL',
            identificacionFiscalNumero: '27-34567890-7',
            emailContacto: 'info@innovarsrl.com.ar',
            telefonoContacto: '+54 351 678 1234',
            paginaWeb: 'www.innovarsrl.com.ar',
            alias: 'INNOVA.SRL',
            habilitacionMunicipal: null,
        }
    },
    {
        authEmail: 'contacto@viajeshorizonte.com.ar',
        authPassword: 'Viajes2024hor',
        role: 'propietario',
        tipoUsuario: 'propietario',
        searchId: 'ARG2024003',
        identityData: {
            razonSocial: 'Agencia de Viajes Horizonte',
            titular: 'Javier Alejandro Méndez',
            direccion: 'Av. Libertador 1234',
            localidad: 'Rosario',
            pais: 'Argentina',
            identificacionFiscalTipo: 'DNI',
            identificacionFiscalNumero: '20.345.678',
            emailContacto: 'contacto@viajeshorizonte.com.ar',
            telefonoContacto: '+54 341 456 7890',
            paginaWeb: 'www.viajeshorizonte.com.ar',
            alias: 'VIAJES.HORIZONTE',
            habilitacionMunicipal: 'HVM-RZ-9876',
        }
    },
    {
        authEmail: 'soporte@softwaresolutions.com.ar',
        authPassword: 'Soft2024-sol',
        role: 'propietario',
        tipoUsuario: 'propietario',
        searchId: 'ARG2024004',
        identityData: {
            razonSocial: 'Software Solutions',
            titular: 'María Fernanda López',
            direccion: 'Calle San Martín 450, Piso 3',
            localidad: 'Mendoza',
            pais: 'Argentina',
            identificacionFiscalTipo: 'CUIT',
            identificacionFiscalNumero: '27-87654321-2',
            emailContacto: 'soporte@softwaresolutions.com.ar',
            telefonoContacto: '+54 261 789 1234',
            paginaWeb: 'www.softwaresolutions.com.ar',
            alias: 'SOFT.SOLUTIONS',
            habilitacionMunicipal: null,
        }
    },
    {
        authEmail: 'hola@cafelaesquina.com.ar',
        authPassword: 'Cafe2024esc',
        role: 'propietario',
        tipoUsuario: 'propietario',
        searchId: 'ARG2024005',
        identityData: {
            razonSocial: 'Cafetería La Esquina',
            titular: 'Patricia Gomez',
            direccion: 'Calle San Juan 678',
            localidad: 'Mar del Plata',
            pais: 'Argentina',
            identificacionFiscalTipo: 'DNI',
            identificacionFiscalNumero: '23.456.789',
            emailContacto: 'hola@cafelaesquina.com.ar',
            telefonoContacto: '+54 223 456 7890',
            paginaWeb: 'www.cafelaesquina.com.ar',
            alias: 'CAFE.ESQUINA',
            habilitacionMunicipal: 'HBM-MDP-45678',
        }
    },
    
    // --- PROPIETARIOS NUEVOS (50) ---
    ...Array.from({ length: 50 }, (_, i) => {
        const id = i + 1;
        const paddedId = id.toString().padStart(3, '0');
        const tiposNegocio = [
            'Textil', 'Consultora', 'Agencia de Viajes', 'Software', 'Cafetería',
            'Restaurante', 'Farmacia', 'Supermercado', 'Librería', 'Gimnasio',
            'Taller Mecánico', 'Joyeria', 'Inmobiliaria', 'Estudio Contable', 'Clínica Médica'
        ];
        const localidades = ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza', 'Mar del Plata'];
        
        const negocio = tiposNegocio[id % tiposNegocio.length];
        const localidad = localidades[id % localidades.length];
        const razonSocial = `${negocio} ${id} S.A.`;
        
        return {
            authEmail: `propietario${paddedId}@test.com`,
            authPassword: `Propietario${paddedId}2024`,
            role: 'propietario',
            tipoUsuario: 'propietario',
            searchId: `ARGTSTP2024${paddedId}`,
            identityData: {
                razonSocial: razonSocial,
                titular: `Titular ${id} de Prueba`,
                direccion: `Av. Empresarial ${100 + id}, Piso ${(id % 5) + 1}`,
                localidad: localidad,
                pais: 'Argentina',
                identificacionFiscalTipo: id % 3 === 0 ? 'DNI' : (id % 3 === 1 ? 'CUIT' : 'CUIL'),
                identificacionFiscalNumero: id % 3 === 0 ? 
                    `2${paddedId}.${paddedId}.${paddedId}` : 
                    `3${paddedId}-${paddedId}${paddedId}${paddedId}${paddedId}${paddedId}-${id % 10}`,
                emailContacto: `propietario${paddedId}@test.com`,
                telefonoContacto: `+54 11 2000 ${paddedId.toString().padStart(4, '0')}`,
                paginaWeb: `www.${negocio.toLowerCase()}${id}.com.ar`,
                alias: `${negocio.toUpperCase().substring(0, 5)}.${id}`,
                habilitacionMunicipal: id % 4 === 0 ? null : `HBM-${paddedId}${paddedId}-${localidad.substring(0, 2)}`,
            }
        };
    }),
];

async function populateTestUsers() {
    console.log('Iniciando la población de usuarios de prueba...');

    const userPromises = testUsersData.map(async (userData) => {
        let uid;
        let finalDocId;

        // 1. Crear o obtener usuario en Firebase Authentication
        try {
            const userRecord = await auth.createUser({ // Usar la instancia 'auth'
                email: userData.authEmail,
                password: userData.authPassword,
                displayName: userData.identityData.nombreCompleto || userData.identityData.razonSocial || userData.authEmail.split('@')[0],
            });
            uid = userRecord.uid;
            console.log(`  ✅ Usuario Auth creado: ${userData.authEmail} (UID: ${uid})`);
        } catch (error) {
            if (error.code === 'auth/email-already-exists') {
                const userRecord = await auth.getUserByEmail(userData.authEmail); // Usar la instancia 'auth'
                uid = userRecord.uid;
                console.log(`  ⚠️ Usuario Auth ya existe: ${userData.authEmail} (UID: ${uid})`);
            } else {
                console.error(`  ❌ Error al crear usuario Auth ${userData.authEmail}:`, error.message);
                // Si falla la creación de Auth, no podemos continuar con Firestore para este usuario
                return; 
            }
        }

        // Usamos un batch para agrupar las operaciones de Firestore para este usuario
        const batch = db.batch();

        // 2. Crear/Actualizar perfil de usuario en Firestore (colección 'users')
        const userDocRef = db.collection('users').doc(uid);
        batch.set(userDocRef, {
            email: userData.authEmail,
            role: userData.role,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            nombreCompleto: userData.identityData.nombreCompleto || userData.identityData.titular || userData.identityData.razonSocial || null,
            identificacionFiscalNumero: userData.identityData.identificacionFiscalNumero || null,
        }, { merge: true });
        console.log(`  ✅ Perfil de usuario en Firestore preparado para UID: ${uid}`);

        // 3. Para usuarios admin, no crear validación
        if (userData.role === 'admin') {
            console.log(`  ⚡ Usuario admin detectado, omitiendo creación de validación para: ${userData.authEmail}`);
        } else {
            // 4. Crear entrada de validación en Firestore (colección 'validaciones')
            if (userData.tipoUsuario === "inquilino") {
                finalDocId = `${userData.searchId}-${userData.identityData.identificacionFiscalNumero.replace(/\./g, '')}`; 
            } else {
                finalDocId = userData.searchId;
            }

            const now = new Date();
            const fechaVencimiento = new Date();
            if (userData.tipoUsuario === "propietario") {
                fechaVencimiento.setFullYear(now.getFullYear() + 1); // Vence en 1 año para propietarios
            } else {
                fechaVencimiento.setMonth(now.getMonth() + 1); // Vence en 1 mes para inquilinos
            }

            const validationData = {
                internalId: uuidv4(),
                searchIdDocument: finalDocId,
                tipoUsuario: userData.tipoUsuario,
                ownerUid: uid,
                datosIdentidad: userData.identityData,
                estadoValidacion: "validado",
                fechaCreacion: admin.firestore.FieldValue.serverTimestamp(),
                pagoConfirmado: true,
                apiValidacionExitosa: true,
                fechaVencimiento: admin.firestore.Timestamp.fromDate(fechaVencimiento),
                logAuditoria: [{
                    timestamp: admin.firestore.Timestamp.now(), 
                    action: 'Creación de validación simulada por script',
                    details: 'Datos cargados para pruebas.'
                }],
                apiEquifaxToken: `TOKEN_EQUIFAX_${userData.searchId}`,
                isValidationActive: true,
            };

            const validationDocRef = db.collection('validaciones').doc(finalDocId);
            batch.set(validationDocRef, validationData);
            console.log(`  ✅ Validación '${finalDocId}' preparada en Firestore.`);
        }
        
        // Ejecutar el batch para este usuario (perfil de usuario y validación si aplica)
        try {
            await batch.commit();
            console.log(`  ✅ Operaciones de Firestore completadas para ${userData.authEmail}`);
        } catch (error) {
            console.error(`  ❌ Error al commitear batch para ${userData.authEmail}:`, error.message);
        }
        console.log('---');
    });

    // Ejecutar todas las promesas en paralelo
    await Promise.all(userPromises);

    console.log('\nProceso de población de usuarios de prueba finalizado.');
}

// Ejecutar la función
populateTestUsers()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Error general durante la población de usuarios:', error);
        process.exit(1);
    });
