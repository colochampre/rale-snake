# Retro Snake Soccer

Un juego multijugador que combina la mecánica clásica de Snake con el fútbol. Los jugadores controlan serpientes en un campo de juego, con el objetivo de empujar la pelota hacia la portería del oponente para marcar goles.

## Características

- **Juego Multijugador en Tiempo Real:** Compite contra otros jugadores en partidas rápidas y dinámicas.
- **Modos de Juego Flexibles:** Soporta diferentes configuraciones de equipos, como 1v1, 2v2 y 3v3.
- **Física de Pelota Realista:** La pelota reacciona a los empujes de las serpientes, creando un juego emergente y estratégico.
- **Escalado Dinámico:** El área de juego se ajusta automáticamente según el modo de juego seleccionado para una experiencia óptima.

## Tecnologías Utilizadas

- **Frontend:** HTML5, CSS3, JavaScript
- **Backend:** Node.js, Express
- **Comunicación en Tiempo Real:** Socket.IO
- **Base de Datos:** SQLite3 (para futuras implementaciones como rankings o guardado de partidas)

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

- Animación visual para la pelota.
- Efectos de sonido.
- Interpolación de movimientos.
