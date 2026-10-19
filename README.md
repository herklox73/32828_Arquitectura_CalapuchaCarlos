# Sistema de Gestión de RRHH con Arquitectura Orientada a Servicios (SOA)

Práctica de laboratorio N° 2 — Arquitectura de Software (ESPE, período 202651).

Sistema de Recursos Humanos dividido en **tres servicios de negocio independientes** (Empleados, Nómina y Reclutamiento), cada uno con su propia base de datos, coordinados por un **API Gateway** que actúa como Bus de Servicios Empresariales (ESB): autenticación JWT, enrutamiento dinámico, logging centralizado y control de tasa de peticiones.

![Arquitectura SOA](docs/arquitectura-soa.png)

## Componentes

| Componente | Carpeta / archivo principal | Puerto | Tecnología | Base de datos |
|---|---|---|---|---|
| API Gateway (ESB) | `gateway/src/index.js` | 3000 | Express, http-proxy-middleware, JWT, Winston, express-rate-limit | — |
| Servicio Empleados | `services/empleados/src/index.js` | 3001 | Express + Sequelize | PostgreSQL `empleados_db` |
| Servicio Nómina | `services/nomina/src/index.js` | 3002 | Express + Sequelize | PostgreSQL `nomina_db` |
| Servicio Reclutamiento | `services/reclutamiento/src/index.js` | 3003 | Express + Mongoose | MongoDB `reclutamiento_db` |

```
rrhh-soa/
├── gateway/                  API Gateway (ESB) - puerto 3000
│   └── src/
│       ├── index.js          proxy, logging, rate limit, health
│       ├── middlewares/auth.js   validación del token JWT
│       └── routes/auth.js        POST /auth/login (genera el JWT)
├── services/
│   ├── empleados/            puerto 3001 - PostgreSQL
│   ├── nomina/               puerto 3002 - PostgreSQL
│   └── reclutamiento/        puerto 3003 - MongoDB
├── pruebas/
│   ├── rrhh-soa.postman_collection.json   colección Postman (token automático)
│   └── pruebas.http                       pruebas para REST Client (VS Code)
├── docs/
│   ├── arquitectura-soa.drawio            diagrama editable en draw.io
│   └── arquitectura-soa.png
└── docker-compose.yml        orquesta los 7 contenedores
```

## Ejecución

### Opción A — Docker (recomendada)

Requiere Docker Desktop abierto.

```bash
cd rrhh-soa
docker compose up --build        # o: docker-compose up --build
```

El sistema está listo cuando aparecen los mensajes:

```
Servicio Empleados en http://localhost:3001
Servicio Nomina en http://localhost:3002
Servicio Reclutamiento en http://localhost:3003
Gateway corriendo en http://localhost:3000
```

Detener: `docker compose down` · Detener y borrar los datos: `docker compose down -v`

### Opción B — Manual (sin Docker)

Requiere Node.js 18+, PostgreSQL y MongoDB en ejecución.

1. Crear las bases en PostgreSQL: `CREATE DATABASE empleados_db;` y `CREATE DATABASE nomina_db;`
2. En cada carpeta (`services/empleados`, `services/nomina`, `services/reclutamiento`, `gateway`) copiar `.env.example` a `.env` y ajustar la contraseña de PostgreSQL si no es `1234`.
3. En 4 terminales, dentro de cada carpeta: `npm install` y `node src/index.js` (el gateway al final).

## Endpoints (todos a través del Gateway, puerto 3000)

| Método | Ruta | Descripción | JWT |
|---|---|---|---|
| POST | `/auth/login` | Obtener token (`admin` / `1234` o `rrhh` / `1234`) | No |
| GET | `/health` | Estado del gateway | No |
| GET | `/api/empleados` | Listar (filtro opcional `?departamento=TI`) | Sí |
| GET | `/api/empleados/:id` | Obtener por ID | Sí |
| POST | `/api/empleados` | Crear empleado | Sí |
| PUT | `/api/empleados/:id` | Actualizar | Sí |
| DELETE | `/api/empleados/:id` | Desactivar (baja lógica) | Sí |
| POST | `/api/nomina/calcular` | Calcular y registrar nómina | Sí |
| GET | `/api/nomina/:empleado_id` | Historial de nóminas | Sí |
| GET | `/api/nomina/:empleado_id/:periodo` | Rol de pago de un período | Sí |
| GET | `/api/reclutamiento/vacantes` | Listar vacantes | Sí |
| POST | `/api/reclutamiento/vacantes` | Publicar vacante | Sí |
| PUT | `/api/reclutamiento/vacantes/:id` | Actualizar vacante | Sí |
| GET | `/api/reclutamiento/candidatos` | Listar candidatos | Sí |
| POST | `/api/reclutamiento/candidatos` | Registrar candidato | Sí |
| PUT | `/api/reclutamiento/candidatos/:id/estado` | Cambiar estado del candidato | Sí |

## Pruebas

- **Postman:** *Import* → `pruebas/rrhh-soa.postman_collection.json`. Ejecutar en orden; el login guarda el token y la vacante/candidato guardan sus IDs automáticamente. Incluye pruebas de éxito y de error (401, 400, 409).
- **VS Code REST Client:** abrir `pruebas/pruebas.http` y pulsar *Send Request* en cada bloque.

## Correcciones respecto al código de la guía

Al probar el código de la guía se detectaron tres problemas en el Gateway y uno en Nómina, corregidos aquí:

1. **Ruta reenviada con el prefijo `/api`** — http-proxy-middleware v2 reenvía la URL original (`/api/empleados`), pero los servicios escuchan en `/empleados`, por lo que respondían `404 Cannot GET /api/empleados`. Se agregó `pathRewrite: { '^/api': '' }`.
2. **POST/PUT se quedaban colgados** — `express.json()` consume el cuerpo de la petición antes del proxy y el servicio nunca lo recibía. Se agregó `onProxyReq: fixRequestBody`.
3. **Manejador de errores sin efecto** — la guía usa la sintaxis `on: { error }` de la v3, pero el `package.json` instala la v2, cuya opción es `onError`. Ahora un servicio caído responde `503 Servicio X no disponible`.
4. **Redondeo de horas extra (Nómina)** — el valor de la hora extra se redondeaba antes de multiplicar (5 × 9.38 = 46.90). Ahora se redondea al final (5 × 9.375 = 46.88), y el neto da 1579.38, igual que el resultado esperado de la guía.
