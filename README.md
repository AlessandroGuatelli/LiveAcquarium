# 🐠 LiveAcquarium

**Next Gen Aquarium** — un acquario 3D interattivo nel browser, costruito con Three.js.

LiveAcquarium simula un piccolo ecosistema sottomarino: predatori, prede e creature del fondale si muovono autonomamente e interagiscono tra loro.

## ✨ Funzionalità

- 🦈 **Ecosistema dinamico** — squali che inseguono le prede e pesci pagliaccio che reagiscono ai predatori
- 🦀 **Creature del fondale** — granchi con movimento dedicato
- 🪸 **Ambiente procedurale** — fondale ondulato, nebbia subacquea e particelle sospese
- 🎨 **Modelli procedurali** — nessun asset 3D esterno necessario
- ⚙️ **Configurazione esterna** — specie, popolazioni, colori e comportamenti in config.json
- 🛟 **Fallback automatico** — configurazione interna se config.json non è disponibile
- 🎛️ **Controlli live** — popolazione dei pesci, velocità, illuminazione e colore dell'acqua
- ⚡ **Ottimizzazioni** — geometrie e materiali condivisi, pixel ratio limitato
- 📱 **Responsive** — canvas e camera si adattano alla finestra

## 🚀 Avvio

È consigliato usare un web server locale perché fetch() può essere bloccato dal browser quando config.json viene caricato da file://.

```bash
npx serve .
# oppure
python -m http.server 8000
```

Poi apri l'URL mostrato dal server. È necessaria una connessione internet per caricare Three.js dal CDN.

## 🎮 Controlli

| Controllo | Effetto |
|---|---|
| Moltiplicatore pesci | Mostra una parte maggiore o minore della popolazione configurata |
| Velocità nuoto | Modifica la velocità globale |
| Luce ambiente | Regola l'illuminazione |
| Colore acqua | Aggiorna sfondo e nebbia in tempo reale |

Puoi esplorare la scena con il mouse tramite OrbitControls.

## ⚙️ Configurazione

config.json definisce ambiente e abitanti. Tra i campi principali: environment.water_color, environment.fog_density, environment.ambient_light, entities[].count, entities[].tags, entities[].fallback_model e entities[].behavior.

Comportamenti disponibili: swim_random, zigzag, bottom_crawl e static.

## 🧱 Struttura

```text
LiveAcquarium/
├── index.html      # Interfaccia e import map Three.js
├── config.json     # Configurazione dell'ecosistema
└── script/
    └── app.js      # Motore 3D, AI comportamentale e simulazione
```

## 📄 Licenza

Distribuito sotto licenza Apache 2.0.