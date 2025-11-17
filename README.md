# Retro Snake Soccer

Un juego multijugador que combina la mecánica clásica de Snake con el fútbol. Los jugadores controlan serpientes en un campo de juego, con el objetivo de empujar la pelota hacia la portería del oponente para marcar goles.

## Características

- **Juego Multijugador en Tiempo Real:** Compite contra otros jugadores en partidas rápidas y dinámicas.
- **Modos de Juego Flexibles:** Soporta diferentes configuraciones de equipos, como 1v1, 2v2 y 3v3.
- **Física de Pelota Realista:** La pelota reacciona a los empujes de las serpientes, creando un juego emergente y estratégico.
- **Escalado Dinámico:** El área de juego se ajusta automáticamente según el modo de juego seleccionado para una experiencia óptima.
- **Chat Rápido:** Comunícate con tu equipo o con todos los jugadores usando mensajes predefinidos.
- **Personalización:** Elige entre diferentes skins para la pelota para personalizar tu experiencia.
- **Estadísticas y Ranking Global:** Sigue tu progreso con estadísticas detalladas y compite por el primer puesto en el ranking.
- **Movimiento Suavizado:** Interpolación del lado del cliente para una experiencia visual más fluida.

## Tecnologías Utilizadas

- **Frontend:** HTML5, CSS3, JavaScript
- **Backend:** Node.js, Express
- **Comunicación en Tiempo Real:** Socket.IO
- **Base de Datos:** SQLite3

## Instalación

Sigue estos pasos para configurar el entorno de desarrollo local.

1. **Clona el repositorio:**
   ```bash
   git clone https://github.com/tu-usuario/rale-snake.git
   cd rale-snake
   ```

2. **Instala las dependencias:**
   Asegúrate de tener [Node.js](https://nodejs.org/) instalado. Luego, ejecuta el siguiente comando en la raíz del proyecto:
   ```bash
   npm install
   ```

## Uso

Para iniciar el servidor del juego, ejecuta el siguiente comando:

```bash
npm start
```

El servidor se iniciará en modo de desarrollo con `nodemon`, lo que significa que se reiniciará automáticamente cada vez que realices cambios en los archivos del servidor.

Una vez que el servidor esté en funcionamiento, abre tu navegador y ve a `http://localhost:3000` (o el puerto que hayas configurado) para empezar a jugar.

## Futuras Mejoras

- Efectos de sonido.
- Modo práctica. 

## Despliegue en Fly.io (recordatorio)

### Primera vez (o cuando cambias la configuración de Fly)

1. **Asegurarte de tener flyctl instalado y en PATH**
   - En Windows, desde PowerShell:
     ```powershell
     powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
     ```
   - Si `fly` no se reconoce, puedes usar directamente el ejecutable:
     ```powershell
     & "$HOME\.fly\bin\fly.exe" version
     ```

2. **Configurar la app en Fly**
   - El archivo `fly.toml` debe tener (resumen):
     ```toml
     app = "rale-snake"
     primary_region = "eze"

     [build]
       builder = "heroku/builder:24"

     [env]
       NODE_ENV = "production"

     [processes]
       web = "npm start"

     [http_service]
     auto_start_machines = true
     auto_stop_machines = true
     force_https = true
     internal_port = 3_000
     min_machines_running = 0
     processes = [ "web" ]

     [[mounts]]
     destination = "/data"
     source = "rale_snake_db"
     ```

3. **Crear el volumen de base de datos (si no existe)**
   - Solo la primera vez o si Fly lo pide:
     ```powershell
     & "$HOME\.fly\bin\fly.exe" volume create rale_snake_db --size 1 --region eze
     ```

### Flujo de deploy habitual (código nuevo)

> Importante: hay **una sola máquina** (`e82d930b4344e8`) usando el volumen `rale_snake_db`. No crear máquinas nuevas con `fly deploy` si ya existe una.

1. **Construir y subir nueva imagen**
   ```powershell
   & "$HOME\.fly\bin\fly.exe" deploy
   ```
   - Aunque al final se queje de que no puede crear una nueva máquina por el volumen, la imagen se sube igual.

2. **Actualizar la máquina existente a la nueva imagen**
   - Toma el tag `deployment-...` que muestra el deploy y ejecútalo así:
     ```powershell
     & "$HOME\.fly\bin\fly.exe" machines update e82d930b4344e8 `
       --image registry.fly.io/rale-snake:deployment-XXXXXXXX
     ```

3. **Reiniciar la máquina (cuando cambias variables de entorno)**
   ```powershell
   & "$HOME\.fly\bin\fly.exe" machines restart e82d930b4344e8
   ```

4. **Ver logs**
   ```powershell
   & "$HOME\.fly\bin\fly.exe" logs
   ```
   - Comprobar que aparece:
     ```text
     Connected to SQLite database at /data/rale_snake.db
     ```

### Persistencia real de la base de datos

- En `server/database.js`, la ruta es:
  ```js
  const dbPath = process.env.NODE_ENV === 'production' 
    ? '/data/rale_snake.db' 
    : path.join(__dirname, 'rale_snake.db');
  ```
- En producción (Fly), con `NODE_ENV=production`, la DB se guarda en `/data/rale_snake.db`, que está montado sobre el volumen `rale_snake_db`.
- Si alguna vez se usó `/workspace/server/rale_snake.db` y hay datos allí, se pueden copiar manualmente dentro de la máquina:
  ```bash
  cp /workspace/server/rale_snake.db /data/rale_snake.db
  ```
  para migrarlos al volumen.

