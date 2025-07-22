const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Helmet SENZA CSP per evitare problemi con Tesseract.js
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS Configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') 
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    error: 'Troppe richieste. Riprova più tardi.',
    retryAfter: '15 minuti'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    mistralConfigured: !!process.env.MISTRAL_API_KEY,
    nodeVersion: process.version,
    cspDisabled: true
  });
});

// Test Mistral endpoint
app.get('/api/test-mistral', async (req, res) => {
  try {
    if (!process.env.MISTRAL_API_KEY) {
      return res.status(500).json({
        error: 'Chiave API Mistral non configurata',
        configured: false
      });
    }

    console.log('Testando connessione Mistral...');

    const response = await fetch('https://api.mistral.ai/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
        'User-Agent': 'OCR-Test/1.0'
      }
    });

    if (response.ok) {
      const data = await response.json();
      res.json({
        status: 'Mistral API connessa correttamente',
        configured: true,
        models: data.data ? data.data.length : 0
      });
    } else {
      const errorText = await response.text();
      console.error('Errore test Mistral:', response.status, errorText);
      res.status(response.status).json({
        error: 'Errore connessione Mistral API',
        status: response.status,
        configured: false
      });
    }
  } catch (error) {
    console.error('Errore test Mistral:', error);
    res.status(500).json({
      error: 'Errore durante il test di connessione',
      details: error.message,
      configured: false
    });
  }
});

// Mistral API Proxy Endpoint
app.post('/api/mistral/analyze', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { ocrText } = req.body;

    // Validazione input
    if (!ocrText || typeof ocrText !== 'string') {
      return res.status(400).json({
        error: 'Testo mancante o formato non valido',
        success: false
      });
    }

    if (ocrText.trim().length < 5) {
      return res.status(400).json({
        error: 'Testo troppo corto. Il sistema necessita di almeno 5 caratteri.',
        success: false
      });
    }

    if (ocrText.length > 15000) {
      return res.status(400).json({
        error: 'Testo troppo lungo (max 15000 caratteri)',
        success: false
      });
    }

    if (!process.env.MISTRAL_API_KEY) {
      console.error('Chiave API Mistral non configurata');
      return res.status(500).json({
        error: 'Servizio temporaneamente non disponibile - API non configurata',
        success: false
      });
    }

    const prompt = `Sei un esperto nell'estrazione di dati da testi OCR di documenti di identità italiani/europei bilingue. Il testo è stato pre-elaborato per evidenziare coppie ETICHETTA: VALORE.

TESTO PRE-ELABORATO:
${ocrText}

Estrai i seguenti dati e restituisci ESCLUSIVAMENTE questo JSON:
{
    "nome": "",
    "cognome": "",
    "dataNascita": "",
    "luogoNascita": "",
    "codiceFiscale": "",
    "numeroDocumento": "",
    "dataRilascio": "",
    "dataScadenza": ""
}

MAPPATURA CAMPI (italiano/inglese):
- NOME/NAME/GIVEN_NAME → nome
- COGNOME/SURNAME/FAMILY_NAME/LAST_NAME → cognome  
- DATONASCITA/BORN/DATE_OF_BIRTH/BIRTH → dataNascita
- LUOGONASCITA/PLACE_OF_BIRTH/BIRTHPLACE → luogoNascita
- CODICEFISCALE/TAX_CODE/FISCAL_CODE → codiceFiscale
- NUMERODOCUMENTO/NUMBER/DOCUMENT_NUMBER → numeroDocumento
- DATARILASCIO/ISSUED/ISSUE_DATE → dataRilascio
- DATASCADENZA/EXPIRES/VALID_UNTIL/EXPIRY → dataScadenza

REGOLE DI ESTRAZIONE:
1. Cerca prima le coppie ETICHETTA: VALORE già strutturate
2. Se vedi "NOME: Souhail" → nome = "Souhail"
3. Se vedi "COGNOME: Rossi" → cognome = "Rossi" 
4. Per VALORE_LIBERO, analizza il contenuto:
   - Se è solo un nome (es: "Marco", "Souhail") potrebbe essere nome o cognome
   - Se è una data DD/MM/YYYY, potrebbe essere nascita/rilascio/scadenza
   - Se è 16 caratteri alfanumerici, è il codice fiscale
   - Se è formato AX123456, è numero documento

CONTEXT ANALYSIS:
- I nomi italiani comuni: Marco, Luca, Francesco, Giulia, etc.
- I cognomi italiani comuni: Rossi, Bianchi, Ferrari, Romano, etc.
- I nomi stranieri sono validi: Souhail, Ahmed, etc.
- Le date sono sempre DD/MM/YYYY
- I codici fiscali sono sempre 16 caratteri: RSSMRA85C15F205X

PRIORITÀ NELLA RICERCA:
1. Prima usa le coppie ETICHETTA: VALORE strutturate
2. Se manca qualcosa, cerca nei VALORE_LIBERO
3. Se ancora manca, cerca pattern nel testo residuo

IMPORTANTE:
- Restituisci SOLO il JSON
- Non inventare dati se non li trovi
- Se un campo è vuoto, lascia ""

JSON:`;

    console.log(`[${new Date().toISOString()}] Chiamata Mistral API in corso...`);
    console.log(`Lunghezza testo OCR: ${ocrText.length} caratteri`);
    console.log(`Anteprima testo: "${ocrText.substring(0, 100)}..."`);

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
        'User-Agent': 'OCR-Documenti-Identita/1.0'
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [{
          role: "user",
          content: prompt
        }],
        max_tokens: 500,
        temperature: 0.1,
        top_p: 0.9
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Errore Mistral API [${response.status}]:`, errorText);
      
      let errorMessage = 'Errore del servizio di analisi';
      
      if (response.status === 401) {
        errorMessage = 'Errore di autenticazione - Verifica la chiave API Mistral';
        console.error('Chiave API Mistral non valida o scaduta');
      } else if (response.status === 429) {
        errorMessage = 'Servizio sovraccarico. Riprova tra qualche minuto.';
      } else if (response.status >= 500) {
        errorMessage = 'Servizio Mistral temporaneamente non disponibile.';
      }
      
      return res.status(500).json({
        error: errorMessage,
        success: false
      });
    }

    const result = await response.json();
    
    if (!result.choices || !result.choices[0] || !result.choices[0].message) {
      console.error('Risposta Mistral malformata:', result);
      return res.status(500).json({
        error: 'Risposta non valida dal servizio di analisi',
        success: false
      });
    }

    const content = result.choices[0].message.content.trim();
    console.log(`Risposta Mistral ricevuta: "${content.substring(0, 200)}..."`);
    
    // Estrazione JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const extractedData = JSON.parse(jsonMatch[0]);
        
        // Validazione e pulizia dati
        const validatedData = {
          nome: extractedData.nome ? String(extractedData.nome).trim() : '',
          cognome: extractedData.cognome ? String(extractedData.cognome).trim() : '',
          dataNascita: extractedData.dataNascita ? String(extractedData.dataNascita).trim() : '',
          luogoNascita: extractedData.luogoNascita ? String(extractedData.luogoNascita).trim() : '',
          codiceFiscale: extractedData.codiceFiscale ? String(extractedData.codiceFiscale).trim().toUpperCase() : '',
          numeroDocumento: extractedData.numeroDocumento ? String(extractedData.numeroDocumento).trim() : '',
          dataRilascio: extractedData.dataRilascio ? String(extractedData.dataRilascio).trim() : '',
          dataScadenza: extractedData.dataScadenza ? String(extractedData.dataScadenza).trim() : ''
        };
        
        const processingTime = Date.now() - startTime;
        console.log(`[${new Date().toISOString()}] Analisi completata in ${processingTime}ms`);
        
        // Log risultati (senza dati sensibili per privacy)
        const fieldsFound = Object.values(validatedData).filter(v => v.length > 0).length;
        console.log(`Campi estratti con successo: ${fieldsFound}/8`);
        
        res.json({
          success: true,
          data: validatedData,
          processingTime: processingTime,
          usage: result.usage || null,
          fieldsExtracted: fieldsFound
        });
        
      } catch (parseError) {
        console.error('Errore parsing JSON estratto:', parseError);
        console.error('Contenuto problematico:', jsonMatch[0]);
        
        res.status(500).json({
          error: 'Errore nell\'interpretazione dei dati estratti. Il testo potrebbe essere troppo confuso.',
          success: false
        });
      }
    } else {
      console.error('JSON non trovato nella risposta Mistral');
      console.error('Contenuto completo risposta:', content);
      
      res.status(500).json({
        error: 'Il servizio non è riuscito a strutturare i dati. Verifica che l\'immagine contenga un documento di identità leggibile.',
        success: false
      });
    }

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] Errore server dopo ${processingTime}ms:`, error);
    
    let errorMessage = 'Errore interno del server';
    
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      errorMessage = 'Errore di connessione al servizio di analisi. Verifica la connessione internet.';
    } else if (error.name === 'AbortError') {
      errorMessage = 'Richiesta interrotta. Riprova.';
    }
    
    res.status(500).json({
      error: errorMessage,
      success: false,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Endpoint per statistiche
app.get('/api/stats', (req, res) => {
  res.json({
    uptime: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    platform: process.platform,
    timestamp: new Date().toISOString()
  });
});

// Endpoint info API
app.get('/api/info', (req, res) => {
  res.json({
    name: 'OCR Documenti Identità API',
    version: '1.0.0',
    description: 'API per estrazione automatica dati da documenti di identità con OCR + Mistral AI',
    endpoints: {
      health: '/api/health',
      analyze: '/api/mistral/analyze', 
      test: '/api/test-mistral',
      stats: '/api/stats'
    },
    features: [
      'OCR automatico con Tesseract.js',
      'Analisi intelligente con Mistral AI',
      'Supporto documenti italiani',
      'Validazione e pulizia dati',
      'Rate limiting e sicurezza'
    ],
    supportedDocuments: [
      'Carta di Identità italiana',
      'Patente di guida',
      'Documenti con testo in italiano/inglese'
    ]
  });
});

// Catch-all per frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handler globale
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Errore non gestito:`, err);
  res.status(500).json({
    error: 'Errore interno del server',
    success: false,
    timestamp: new Date().toISOString()
  });
});

// Gestione 404 per API
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint non trovato',
    success: false,
    availableEndpoints: ['/api/health', '/api/mistral/analyze', '/api/test-mistral', '/api/stats', '/api/info']
  });
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n[${new Date().toISOString()}] Ricevuto segnale ${signal}. Avvio shutdown graceful...`);
  
  server.close(() => {
    console.log(`[${new Date().toISOString()}] Server chiuso correttamente.`);
    process.exit(0);
  });
  
  setTimeout(() => {
    console.log(`[${new Date().toISOString()}] Forzando la chiusura...`);
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Gestione errori non catturati
process.on('uncaughtException', (err) => {
  console.error(`[${new Date().toISOString()}] Uncaught Exception:`, err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[${new Date().toISOString()}] Unhandled Rejection at:`, promise, 'reason:', reason);
  process.exit(1);
});

// Avvio server
const server = app.listen(PORT, () => {
  console.log('='.repeat(70));
  console.log(`🚀 OCR Documenti Identità Server v1.0`);
  console.log('='.repeat(70));
  console.log(`📡 Server avviato su porta: ${PORT}`);
  console.log(`📝 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 Mistral API configurata: ${!!process.env.MISTRAL_API_KEY ? '✅' : '❌'}`);
  console.log(`🌐 URL locale: http://localhost:${PORT}`);
  console.log(`🔓 CSP disabilitato per compatibilità OCR`);
  console.log(`⚡ Endpoints disponibili:`);
  console.log(`   - Health: http://localhost:${PORT}/api/health`);
  console.log(`   - Test Mistral: http://localhost:${PORT}/api/test-mistral`);
  console.log(`   - Analizza: http://localhost:${PORT}/api/mistral/analyze`);
  console.log(`   - Info: http://localhost:${PORT}/api/info`);
  console.log(`   - Stats: http://localhost:${PORT}/api/stats`);
  console.log('='.repeat(70));
  
  if (!process.env.MISTRAL_API_KEY) {
    console.log('⚠️  ATTENZIONE: Configura MISTRAL_API_KEY nel file .env');
    console.log('   Registrati su: https://console.mistral.ai');
    console.log('='.repeat(70));
  } else {
    console.log('✅ Sistema pronto per l\'estrazione automatica OCR + AI');
    console.log('='.repeat(70));
  }
});

module.exports = app;