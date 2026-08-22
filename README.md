# nexo-releases

Canal **público** de actualizaciones de Nexo Dimensional.

El repo principal `Fabrica-cimiento` es privado; el botón `sys.ver_*` descarga desde aquí.

## Flujo
1. Se suben aquí los JS/CSS de cada release.
2. `version.json` declara la versión y la lista de archivos.
3. La app (nexo-update.js) compara versión, descarga a IndexedDB y recarga.

## Revertir
Mantén 2 segundos el botón de versión en la app.
