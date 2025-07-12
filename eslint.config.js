// @ts-check

import eslint from '@eslint/js';
import globals from 'globals';

export default [
  eslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest, // Si usas Jest para pruebas
        io: 'readonly', // Define 'io' como una variable global de solo lectura (para Socket.IO)
        uuid: 'readonly' // Define 'uuid' como una variable global de solo lectura
      },
    },
    rules: {
      'no-unused-vars': ['warn', { 'args': 'none' }], // Advierte sobre variables no utilizadas
      'no-console': 'off', // Permite el uso de console.log, útil para depuración
      'no-undef': 'warn' // Advierte sobre variables no definidas
    },
    ignores: ['node_modules/']
  }
];
