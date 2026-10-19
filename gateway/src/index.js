require('dotenv').config();
const express = require('express');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');
const winston   = require('winston');
const auth      = require('./middlewares/auth');

const app = express();
app.use(express.json());

// Logger centralizado
const logger = winston.createLogger({
  transports: [new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message }) =>
        `[${timestamp}] ${level}: ${message}`)
    )
  })]
});

// Rate Limiting: max 100 peticiones por minuto
app.use(rateLimit({
  windowMs: 60_000, max: 100,
  message: { error: 'Demasiadas peticiones, intenta en 1 minuto.' }
}));

// Logging de todas las peticiones entrantes
app.use((req, _, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Ruta publica: login (NO requiere JWT)
app.use('/auth/login', require('./routes/auth'));

// Funcion auxiliar para crear opciones del proxy
// (sintaxis de http-proxy-middleware v2, que es la version del package.json)
const proxyOpts = (target, name) => ({
  target,
  changeOrigin: true,
  // CORRECCION 1: quitar el prefijo /api antes de reenviar
  //   /api/empleados  -> http://empleados:3001/empleados
  pathRewrite: { '^/api': '' },
  // CORRECCION 2: express.json() ya leyo el body; fixRequestBody lo vuelve
  //   a escribir en la peticion reenviada (sin esto los POST/PUT se cuelgan)
  onProxyReq: fixRequestBody,
  // CORRECCION 3: en v2 el manejador de errores es onError (no "on: { error }")
  onError: (err, req, res) => {
    logger.error(`[${name}] ${err.message}`);
    res.status(503).json({
      error: `Servicio ${name} no disponible`,
      detalle: err.message
    });
  }
});

// Rutas protegidas: redirigen al servicio correspondiente
app.use('/api/empleados',
  auth,
  createProxyMiddleware(proxyOpts(
    process.env.EMPLEADOS_URL || 'http://localhost:3001',
    'Empleados'
  ))
);
app.use('/api/nomina',
  auth,
  createProxyMiddleware(proxyOpts(
    process.env.NOMINA_URL || 'http://localhost:3002',
    'Nomina'
  ))
);
app.use('/api/reclutamiento',
  auth,
  createProxyMiddleware(proxyOpts(
    process.env.RECLUTAMIENTO_URL || 'http://localhost:3003',
    'Reclutamiento'
  ))
);

// Health check: verifica que el gateway esta vivo
app.get('/health', (_, res) => res.json({
  status: 'ok',
  servicios: {
    empleados:     process.env.EMPLEADOS_URL     || 'http://localhost:3001',
    nomina:        process.env.NOMINA_URL        || 'http://localhost:3002',
    reclutamiento: process.env.RECLUTAMIENTO_URL || 'http://localhost:3003',
  }
}));

// Manejo de rutas no encontradas
app.use((req, res) =>
  res.status(404).json({ error: `Ruta ${req.url} no encontrada` })
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  logger.info(`Gateway corriendo en http://localhost:${PORT}`)
);
