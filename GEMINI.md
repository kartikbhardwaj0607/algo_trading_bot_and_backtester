# GEMINI.md — Coding Rules for This Project

Always use ES6+ async/await syntax. Keep controllers thin; all business logic must go into services.
Use JSDoc comments for every service function. All monetary values must be handled as Numbers
(avoid floating-point precision issues by rounding to 2 decimals using Math.round(value * 100) / 100).
Database updates involving balance and positions MUST be wrapped in Mongoose transactions.
Use winston logger (src/utils/logger.js) — never use console.log directly.
All incoming request data must be validated with express-validator before reaching the controller.

Never expose hashed passwords or internal ObjectIds in API responses.
