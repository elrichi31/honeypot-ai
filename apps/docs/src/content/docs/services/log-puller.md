---
title: Log Puller (deprecated)
description: El log-puller bash fue reemplazado por Vector. Esta pagina se conserva por referencia historica.
---

import { Aside } from '@astrojs/starlight/components';

<Aside type="caution">
**Este componente ya no se usa.** El log-puller bash fue reemplazado por [Vector](/services/vector/), que ofrece offset persistente en disco, buffer de 256 MB, retry automatico y mejor rendimiento. Esta pagina se conserva solo por referencia historica.
</Aside>

El log-puller era un script Bash (`scripts/pull-cowrie-logs.sh`) que leia el archivo `cowrie.json` de forma continua y enviaba los eventos nuevos a `ingest-api` en batches.

---

## Por que fue reemplazado

| Aspecto | Log Puller (bash) | Vector |
|---------|------------------|--------|
| Offset persistente | No (reinicia desde el final) | Si (guardado en disco) |
| Buffer ante caidas de API | No | Si (256 MB en disco) |
| Retry automatico | No | Si (360 intentos) |
| Parsing | Basico | Transformaciones VRL completas |
| Multi-source | No | Si (cowrie + galah en paralelo) |

Ver [Vector](/services/vector/) para la documentacion actual del log shipper.
