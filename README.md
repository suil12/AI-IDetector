# AI-IDetector by Souhail Nmili
# OCR Documenti Identità

Applicazione web per l'estrazione automatica di dati da documenti di identità italiani utilizzando OCR (Tesseract.js) e intelligenza artificiale (Mistral AI).

## 🚀 Caratteristiche

- **OCR Gratuito**: Estrazione testo con Tesseract.js (lato client)
- **IA Avanzata**: Elaborazione intelligente con Mistral AI
- **Design Responsive**: Interfaccia moderna e mobile-friendly
- **Sicurezza**: API key protette nel backend
- **Zero Costi Base**: Hosting gratuito su Render

## 📋 Documenti Supportati

- Carta d'Identità italiana
- Patente di guida
- Altri documenti con testo chiaro

**Formati**: JPG, PNG (max 5MB)

## 🛠️ Installazione

### Prerequisiti
- Node.js 18+
- Account Mistral AI ([console.mistral.ai](https://console.mistral.ai))

### Setup Locale

1. **Clona il repository**
   ```bash
   git clone <repository-url>
   cd ocr-documenti-identita
   ```

2. **Setup Backend**
   ```bash
   cd backend
   npm install
   ```

3. **Configura Variabili d'Ambiente**
   ```bash
   cp .env.example .env
   ```
   
   Modifica `.env`:
   ```env
   MISTRAL_API_KEY=mistral_your_api_key_here
   PORT=3000
   NODE_ENV=development
   ```

4. **Avvia il Server**
   ```bash
   npm start
   ```

5. **Apri l'Applicazione**
   ```
   http://localhost:3000
   ```

## 📁 Struttura del Progetto

```
ocr-documenti-identita/
├── frontend/
│   └── index.html          # Frontend completo
├── backend/
│   ├── server.js           # Server Express
│   ├── package.json        # Dipendenze
│   └── .env               # Variabili d'ambiente
├── .gitignore
└── README.md
```

## 🔧 Configurazione Mistral AI

1. Registrati su [console.mistral.ai](https://console.mistral.ai)
2. Crea una nuova API key
3. Aggiungi la chiave nel file `.env`
4. Assicurati di avere crediti sufficienti

## 🌐 Deploy su Render

### Opzione 1: Deploy Automatico

1. Carica il codice su GitHub
2. Connetti il repository a Render
3. Configura come "Web Service"
4. Aggiungi `MISTRAL_API_KEY` nelle environment variables
5. Deploy automatico

### Opzione 2: Deploy Manuale

1. Crea nuovo Web Service su Render
2. Collega il repository GitHub
3. Configurazione:
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm start`
   - **Environment**: Node.js

## 📖 Come Usare

1. **Carica Documento**: Trascina o seleziona un'immagine del documento
2. **Analizza**: Clicca "Analizza Documento"
3. **Visualizza**: I dati estratti appariranno nei campi sottostanti
4. **Copia**: Usa il pulsante "Copia Dati JSON" per esportare

## 🎨 Personalizzazione

### Aggiungere Logo
Sostituisci nell'`index.html`:
```html
<div class="logo-area">
    <img src="tuo-logo.png" alt="Logo" style="max-height: 80px;">
</div>
```

### Aggiungere Immagini
Sostituisci i placeholder nella sezione immagini:
```html
<div class="image-placeholder">
    <img src="esempio.jpg" alt="Esempio" style="width: 100%; height: 120px; object-fit: cover; border-radius: 8px;">
</div>
```



## 📊 Prestazioni

- **OCR**: ~2-5 secondi (dipende dalla dimensione immagine)
- **Mistral AI**: ~1-3 secondi
- **Totale**: ~3-8 secondi per documento

## 🐛 Risoluzione Problemi

### Errore 401 (Unauthorized)
- Verifica che la chiave API Mistral sia corretta
- Controlla di avere crediti sufficienti

### OCR Non Funziona
- Assicurati che l'immagine sia chiara e ben illuminata
- Prova con formato PNG invece di JPG
- Ridimensiona l'immagine se troppo grande

### Errori di Connessione
- Verifica la connessione internet
- Controlla che il server backend sia avviato
- Verifica le configurazioni CORS


## 🤝 Contributi

I contributi sono benvenuti! Apri una issue o invia una pull request.

