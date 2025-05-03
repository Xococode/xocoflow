# XOCOFLOW

![XOCOFLOW](xocoflow.jpg)

## Acceso Rápido a la Aplicación

[XOCOFLOW − Demo en vivo](https://xococode.github.io/xocoflow/)

Unicornio 3D CAD es una aplicación web que permite crear, editar y manipular modelos 3D de forma intuitiva y visual. Utiliza la librería Three.js para renderizado en 3D y ofrece herramientas avanzadas de modelado y dibujo en 2D y 3D.

### Paleta de nodos (sidebar izquierdo)

- Buscador y lista de tipos de nodo disponibles: texto, concatenar, fetch, temporizadores, código JavaScript, carga/descarga de ficheros, etc.  
- Arrastra el nodo al canvas para empezar a construir tu flujo.

### Canvas principal

- Área donde se colocan y enlazan los nodos.  
- Conexiones gráficas entre entradas (inputs) y salidas (outputs) para definir el paso de datos.

### Menú superior (gestión de proyectos y módulos)

- **Cargar (Ctrl + O):** abre un JSON previamente guardado.  
- **Guardar (Ctrl + S):** salva el proyecto actual bajo el nombre activo.  
- **Guardar como… (Ctrl + Shift + S):** pide un nuevo nombre para exportar.  
- **Exportar JSON:** obtiene el JSON crudo del flujo para integraciones externas.  
- **Limpiar módulo:** elimina todos los nodos del módulo activo.  
- Soporta múltiples “módulos” (pestañas) dentro de un mismo proyecto.

### Controles inferiores

#### Historial y edición (izquierda)

- Deshacer/Rehacer, Copiar/Pegar/Duplicar nodos, Recalcular flujo.  
- Muestran iconos y tooltips con atajos.

#### Lock & Zoom (derecha)

- Bloquear/desbloquear edición para evitar cambios accidentales.  
- Zoom in/out/reset en el canvas.

### Barra de estado

- Muestra el nivel de zoom y la posición del nodo seleccionado en tiempo real.

### Editor de código (sidebar derecho)

- Para nodos de tipo “texto” o “javascript_code”, abre un panel con CodeMirror donde editar scripts o plantillas HTML/CSS/JS en contexto.

---

## Teclas rápidas principales

| Atajo               | Acción                                           |
|---------------------|--------------------------------------------------|
| Ctrl + Z            | Deshacer última acción.                          |
| Ctrl + Y            | Rehacer.                                         |
| Ctrl + C            | Copiar nodo seleccionado.                        |
| Ctrl + V            | Pegar nodo copiado.                              |
| Ctrl + D            | Duplicar nodo seleccionado.                      |
| Ctrl + R            | Recalcular flujo del módulo actual.              |
| Ctrl + S            | Guardar proyecto.                                |
| Ctrl + Shift + S    | Guardar proyecto como…                           |
| Ctrl + O            | Cargar proyecto desde JSON.                     |
| Supr / Backspace    | Eliminar nodo seleccionado.                      |
| Escape              | Cerrar modales o deseleccionar nodos.            |

---

## Casos de uso y quién puede beneficiarse

- **Automatización de tareas:** programar fetch de datos, temporizadores, loops, disparadores basados en tiempo.  
- **Procesamiento de texto:** concatenar cadenas, extraer valores con expresiones regulares, mostrar resultados.  
- **Prototipado de APIs:** configurar nodos de fetch y visualizar respuestas HTML/JSON.  
- **Generación y descarga de archivos:** cargar/guardar texto o binarios directamente desde el flujo.  
- **Creación de diagramas de lógica:** ideal para educadores, formadores y presentaciones visuales de algoritmos.  
- **Desarrollo de integraciones low-code:** diseñadores de procesos, analistas de datos y desarrolladores que quieren un entorno rápido y visual.

En resumen, **Xocoflow** interesa a cualquier profesional o entusiasta que quiera diseñar, documentar y ejecutar flujos de trabajo de manera visual, combinando nodos predefinidos y scripts a medida, sin renunciar al control que brinda el código cuando se necesita.
