# LiveAcquarium
Next Gen Acquarium
# 🐠 LiveAcquarium

**Next Gen Aquarium** — un acquario 3D interattivo nel browser, realizzato con [Three.js](https://threejs.org/).

## ✨ Funzionalità

- 🦈 **Ecosistema simulato**: squali che cacciano, pesci pagliaccio che fuggono, granchi sul fondale e coralli statici
- 🎨 **Modelli procedurali**: ogni creatura è costruita da primitive geometriche (nessun asset esterno richiesto)
- 📡 **Configurazione esterna**: popolazione, colori e comportamenti definiti in `config.json` (con fallback interno automatico)
- 🎛️ **Pannello di controllo live**: moltiplicatore pesci, velocità di nuoto, luce ambiente e colore dell'acqua
- 🫧 **Atmosfera**: nebbia subacquea, particelle sospese e fondale ondulato procedurale
- 🔄 **Respawn automatico**: le prede mangiate riappaiono altrove, così l'ecosistema resta in equilibrio

## 🚀 Avvio

Apri semplicemente `index.html` in un browser moderno (serve connessione internet per il CDN di Three.js), oppure servi la cartella con un web server locale:

```bash
npx serve .
# oppure
python -m http.server 8000
```

## ⚙️ Configurazione

Il file `config.json` definisce ambiente e abitanti dell'acquario:


| Campo                       | Descrizione                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `environment`               | Colore acqua, densità nebbia, intensità luci                                                                        |
| `entities[].id`             | Nome identificativo della specie                                                                                    |
| `entities[].count`          | Numero di esemplari                                                                                                 |
| `entities[].tags`           | Ruolo ecologico: `predator`, `prey`, `neutral`, `obstacle`                                                          |
| `entities[].fallback_model` | Parti geometriche (shape, scala, posizione, rotazione, colore)                                                      |
| `entities[].behavior`       | Tipo di movimento (`swim_random`, `zigzag`, `bottom_crawl`, `static`), velocità, bounding box, raggi di caccia/fuga |


Se `config.json` non è raggiungibile, l'app usa una configurazione interna equivalente.

## 🧱 Struttura

```
LiveAcquarium/
├── index.html      # UI e import map Three.js
├── config.json     # Configurazione ambiente e specie
└── script/
    └── app.js      # Motore 3D, comportamenti e fisica
```

## 📄 Licenza

Distribuito sotto licenza [Apache 2.0](LICENSE).