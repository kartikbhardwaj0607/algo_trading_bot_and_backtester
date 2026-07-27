# 📊 TradeVed Paper Trading Backend
### Built by: Kartik Sharma | Quant Intern at TradeVed
---

## 🧠 What Did I Build?

I built the **complete backend server** for TradeVed's Paper Trading feature.

**Paper Trading** = Trading with fake (virtual) money but with **real stock prices** from NSE/BSE. Users can practice buying and selling stocks without any financial risk. The system automatically tracks their trades, applies stop losses and targets, and logs every trade into a journal that prompts them to reflect on their decisions.

Think of it like a **flight simulator** — but for stock trading.

---

## 💡 Why Does This Matter?

Most people *know* what to do in theory when a stock falls — but when it actually happens with real money, emotions take over. Paper Trading creates that emotional experience without real consequences. You train your **psychology**, not just your knowledge.

**Arjun's story (the real use case):**
> Arjun has completed the "Earnings Season Playbook" Quest on TradeVed. He wants to try trading a live earnings event. He opens a paper trade on TCS — buys 10 virtual shares at ₹3,800, sets a target of ₹3,900 and stop loss at ₹3,750.
>
> TCS results disappoint. The stock drops to ₹3,730 — his stop loss triggers automatically. Virtual loss: ₹700.
>
> He didn't lose real money — but he experienced the feeling. He goes to his Journal, reflects on the trade, and realises he didn't account for the broader IT sector sentiment that day. **That's a lesson worth more than any classroom.**

---

## 🏗️ What I Actually Built (Technical)

### Technology Stack
| Tool | Purpose |
|------|---------|
| **Node.js + Express.js** | The web server — handles all API requests |
| **MongoDB + Mongoose** | Database — stores users, trades, journals |
| **JWT (JSON Web Tokens)** | Authentication — keeps users logged in securely |
| **bcryptjs** | Password hashing — never stores plain passwords |
| **yahoo-finance2** | Live NSE/BSE stock prices (e.g. TCS.NS, INFY.NS) |
| **node-cron / setInterval** | Background job — checks SL/TP every 3 seconds |
| **winston** | Structured logging — all server activity is logged |
| **helmet + rate-limiter** | Security — protects against attacks |
| **express-validator** | Input validation — no bad data gets through |
| **swagger-jsdoc** | Auto-generated API documentation |
| **Jest** | Automated testing — 6 tests, all passing ✅ |

---

### Folder Structure (22 files built from scratch)

```
paper_trading/
├── server.js                      ← Entry point, starts everything
├── .env                           ← Secret config (not in GitHub)
├── GEMINI.md                      ← Coding rules for the project
│
└── src/
    ├── config/
    │   ├── database.js            ← MongoDB connection with retry
    │   ├── marketHours.js         ← Checks if NSE is open (9:15–3:30 IST)
    │   └── swagger.js             ← Auto API documentation
    │
    ├── models/                    ← Database schemas
    │   ├── User.js                ← Username, email, hashed password
    │   ├── Account.js             ← ₹1,00,000 virtual balance per user
    │   ├── Position.js            ← Each trade (symbol, qty, SL, TP, P&L)
    │   └── Journal.js             ← Auto-created after every trade closes
    │
    ├── services/                  ← Core business logic
    │   ├── marketDataService.js   ← Fetches live prices from Yahoo Finance
    │   ├── riskEngine.js          ← ⭐ THE HEART — checks SL/TP every 3s
    │   └── journalService.js      ← Generates reflection prompts
    │
    ├── controllers/               ← Thin handlers that call services
    │   ├── authController.js      ← Register / Login / Profile
    │   └── tradeController.js     ← Place trade, portfolio, journal
    │
    ├── routes/                    ← URL definitions
    │   ├── authRoutes.js
    │   └── tradeRoutes.js
    │
    ├── middlewares/               ← Request filters
    │   ├── authMiddleware.js      ← JWT verification on every request
    │   ├── validate.js            ← Input validation error handler
    │   └── rateLimiter.js         ← Prevents brute force (10 req/15min)
    │
    ├── utils/
    │   └── logger.js              ← Winston structured logging
    │
    └── tests/
        └── tcsScenarios.test.js   ← 6 integration tests (all pass ✅)
```

---

## ⚙️ How the System Works (Flow)

```
1. User registers → gets ₹1,00,000 virtual balance
          ↓
2. User places a trade:
   "Buy 10 TCS @ ₹3,800 | SL: ₹3,750 | TP: ₹3,900"
   → ₹38,000 deducted from balance
          ↓
3. Risk Engine runs every 3 seconds:
   → Fetches live TCS price from Yahoo Finance
   → If price ≤ ₹3,750 → STOP LOSS fires → trade auto-closes
   → If price ≥ ₹3,900 → TARGET fires → trade auto-closes
          ↓
4. Position closes with P&L calculated:
   (Close Price - Entry Price) × Quantity
          ↓
5. Journal entry auto-created:
   → WIN: "What indicator gave you conviction to hold until target?"
   → LOSS: "Did you miss any macro headlines affecting this stock?"
          ↓
6. User writes their reflection → learns from the trade
```

---

## 🔌 API Endpoints — How to Use

### Base URL: `http://localhost:5000/api`
### Full Docs: `http://localhost:5000/api/docs` (Swagger UI)

---

### 🔐 Authentication (No token needed)

#### 1. Register a new user
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "arjun_trader",
  "email": "arjun@example.com",
  "password": "SecurePass123"
}
```
**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "user": { "username": "arjun_trader", "email": "arjun@example.com" },
  "account": { "balance": 100000, "buyingPower": 100000 }
}
```

---

#### 2. Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "arjun@example.com",
  "password": "SecurePass123"
}
```
**Response:** Returns a `token` — copy this, you need it for all other requests.

---

#### 3. Get your profile + balance
```http
GET /api/auth/me
Authorization: Bearer <your_token_here>
```

---

### 📈 Trading (Token required)

#### 4. Place a paper trade
```http
POST /api/trades
Authorization: Bearer <your_token_here>
Content-Type: application/json

{
  "symbol": "TCS",
  "quantity": 10,
  "entryPrice": 3800,
  "stopLoss": 3750,
  "targetPrice": 3900,
  "tradeType": "BUY"
}
```
> Auto-appends `.NS` (NSE suffix). Balance reduced by ₹38,000 instantly.

---

#### 5. View your portfolio
```http
GET /api/portfolio
Authorization: Bearer <your_token_here>
```
Returns open positions with **live LTP + unrealised P&L**, closed history, and account summary.

---

#### 6. Cancel an open position
```http
DELETE /api/trades/:positionId
Authorization: Bearer <your_token_here>
```
Refunds locked capital. No P&L on manual cancel.

---

### 📓 Journal (Token required)

#### 7. View all journal entries
```http
GET /api/journal
Authorization: Bearer <your_token_here>
```
Returns auto-created entries with behavioral prompt for each closed trade.

---

#### 8. Write your reflection
```http
PUT /api/journal/:journalId
Authorization: Bearer <your_token_here>
Content-Type: application/json

{
  "reflection": "I didn't check the IT sector sentiment before entering. Next time I'll check the index trend first."
}
```

---

## 🧪 Tests — All Passing ✅

```
PASS src/tests/tcsScenarios.test.js

  Arjun's TCS Trade Story
    ✓ Step 1: Creates user with ₹1,00,000 virtual account
    ✓ Step 2: Places TCS trade and deducts cost from balance
    ✓ Step 3-5: Risk engine closes position when SL is hit (₹3,730 < ₹3,750)
    ✓ Step 6: Auto-creates LOSS journal entry with prompt
    ✓ Bonus: Closes position as WIN when TP is hit (₹3,910 ≥ ₹3,900)
    ✓ Idempotency: Position only closed once even if engine fires twice

Tests: 6 passed, 6 total ✅
```

---

## 🔒 Security Features

| Feature | Implementation |
|---------|---------------|
| Passwords never stored plain | bcrypt, cost factor 12 |
| Password never in API response | `toJSON()` hook removes it |
| All routes require login | JWT middleware on every endpoint |
| Brute force protection | Rate limiter: 10 auth requests / 15 min |
| HTTP header security | Helmet.js |
| Input always validated | express-validator on every route |
| No double-trade closure | Idempotency Set in Risk Engine |
| Atomic DB updates | Mongoose transactions on production |

---

## 🚀 Running the Project

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run all tests
npm test
```

**Live at:**
- 🌐 API: `http://localhost:5000/api`
- 📖 Docs: `http://localhost:5000/api/docs`
- ❤️ Health: `http://localhost:5000/health`

---

## 📌 Key Design Decisions

1. **Risk Engine uses `setInterval` (3s)** — node-cron can't do sub-minute intervals precisely.
2. **Idempotency Set** — Prevents double-closure if two engine ticks overlap. First one wins.
3. **Auto mock price fallback** — If Yahoo Finance rate-limits, switches to realistic random walk mock. Server never crashes.
4. **Market hours check (IST)** — Engine silently skips outside 9:15 AM–3:30 PM Mon–Fri. Uses `Intl.DateTimeFormat` with no external library.
5. **Thin controllers, fat services** — All business logic in services. Controllers just handle HTTP.
6. **Tests use `mongodb-memory-server`** — No real database needed to run tests.

---

*Built during internship at TRADEVED | Paper Trading Backend v1.0.0*
