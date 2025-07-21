const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware di sicurezza
app.use(helmet());
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
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minuti
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // max 100 richieste
  message: {
    error: 'Troppe richieste. Riprova più tardi.',
    retryAfter: '15 minuti'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Serve static files (frontend)
app.use(express.static(path.join(__dirname, '../frontend')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV 
  });
});

// Mistral API Proxy Endpoint
app.post('/api/mistral/analyze', async (req, res) => {
  try {
    const { ocrText } = req.body;

    if (!ocrText || typeof ocrText !== 'string') {
      return res.status(400).json({
        error: 'Testo OCR mancante o non valido'
      });
    }

    if (ocrText.length > 5000) {
      return res.status(400).json({
        error: 'Testo troppo lungo (max 5000 caratteri)'
      });
    }

    const prompt = `
Analizza questo testo estratto da un documento di identità italiano e restituisci SOLO un oggetto JSON valido con questi campi:

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

Testo da analizzare:
${ocrText}

Regole:
- Se un campo non è presente, lascialo vuoto ""
- Le date in formato DD/MM/YYYY o DD-MM-YYYY
- Il codice fiscale deve essere di 16 caratteri
- Rispondi SOLO con il JSON, senza spiegazioni

JSON:`;

    console.log('Chiamata Mistral API in corso...');

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [{
          role: "user",
          content: prompt
        }],
        max_tokens: 300,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Errore Mistral API:', response.status, errorText);
      
      if (response.status === 401) {
        return res.status(500).json({
          error: 'Errore di autenticazione con Mistral API'
        });
      } else if (response.status === 429) {
        return res.status(429).json({
          error: 'Rate limit raggiunto. Riprova più tardi.'
        });
      } else {
        return res.status(500).json({
          error: 'Errore del servizio Mistral AI'
        });
      }
    }

    const result = await response.json();
    const content = result.choices[0].message.content.trim();
    
    // Estrai JSON dalla risposta
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const extractedData = JSON.parse(jsonMatch[0]);
      
      // Log per monitoraggio (senza dati sensibili)
      console.log('Analisi completata con successo');
      
      res.json({
        success: true,
        data: extractedData,
        usage: result.usage,
        cost: calculateCost(result.usage)
      });
    } else {
      console.error('Formato JSON non trovato nella risposta:', content);
      res.status(500).json({
        error: 'Formato risposta non valido da Mistral'
      });
    }

  } catch (error) {
    console.error('Errore server:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Calcola costo approssimativo
function calculateCost(usage) {
  if (!usage) return null;
  
  const costPer1kTokens = 0.0001; // €0.0001 per 1K token (Mistral Small)
  const totalTokens = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
  const cost = (totalTokens / 1000) * costPer1kTokens;
  
  return {
    tokens: totalTokens,
    estimatedCost: `€${cost.toFixed(6)}`,
    model: 'mistral-small-latest'
  };
}

// Endpoint per statistiche (opzionale)
app.get('/api/stats', (req, res) => {
  res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV,
    nodeVersion: process.version
  });
});

// Catch-all per servire il frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Errore non gestito:', err);
  res.status(500).json({
    error: 'Errore interno del server'
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutdown graceful del server...');
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🚀 Server avviato su porta ${PORT}`);
  console.log(`📝 Ambiente: ${process.env.NODE_ENV}`);
  console.log(`🔑 Mistral API configurata: ${!!process.env.MISTRAL_API_KEY}`);
});