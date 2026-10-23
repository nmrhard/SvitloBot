# API Documentation - Configuration Management

## Огляд

API для керування конфігурацією бота через базу даних замість env змінних.

**Base URL:** `http://your-server.com`

**Автентифікація:** Firebase ID Token (Bearer token в header `Authorization`)

---

## Contacts API

### GET /api/contacts

Отримати список усіх контактів з їх розкладами.

**Request:**
```http
GET /api/contacts
Authorization: Bearer <firebase_id_token>
```

**Response:** `200 OK`
```json
{
  "contacts": [
    {
      "id": 1,
      "name": "default",
      "chatId": "-100xxxxxxxxxx",
      "threadId": "2",
      "dailyThreadId": "114",
      "dailyGroupKey": "GPV5.1",
      "dailyPngUrl": "https://raw.githubusercontent.com/.../gpv-5-1-emergency.png",
      "dailyJsonUrl": "https://raw.githubusercontent.com/.../kyiv-region.json",
      "isActive": true,
      "createdAt": "2026-03-09T20:00:00.000Z",
      "updatedAt": "2026-03-09T20:00:00.000Z",
      "schedules": [
        {
          "id": 1,
          "contactId": 1,
          "startHour": 20,
          "startMinute": 0,
          "endHour": 23,
          "endMinute": 59,
          "intervalMinutes": 30,
          "timezone": "Europe/Kyiv",
          "jsonMaxAgeHours": "24.00",
          "requireNonYesValues": true,
          "sendTodayInitial": false,
          "isActive": true,
          "createdAt": "2026-03-09T20:00:00.000Z",
          "updatedAt": "2026-03-09T20:00:00.000Z"
        }
      ]
    }
  ]
}
```

---

### GET /api/contacts/:id

Отримати конкретний контакт з розкладами.

**Request:**
```http
GET /api/contacts/1
Authorization: Bearer <firebase_id_token>
```

**Response:** `200 OK`
```json
{
  "contact": {
    "id": 1,
    "name": "default",
    "chatId": "-100xxxxxxxxxx",
    "threadId": "2",
    "dailyThreadId": "114",
    "dailyGroupKey": "GPV5.1",
    "dailyPngUrl": "https://raw.githubusercontent.com/.../gpv-5-1-emergency.png",
    "dailyJsonUrl": "https://raw.githubusercontent.com/.../kyiv-region.json",
    "isActive": true,
    "createdAt": "2026-03-09T20:00:00.000Z",
    "updatedAt": "2026-03-09T20:00:00.000Z",
    "schedules": [...]
  }
}
```

**Response:** `404 Not Found`
```json
{
  "error": "Contact not found"
}
```

---

### POST /api/contacts

Створити новий контакт.

**Request:**
```http
POST /api/contacts
Authorization: Bearer <firebase_id_token>
Content-Type: application/json

{
  "name": "Kyiv Group",
  "chatId": "-100xxxxxxxxxx",
  "threadId": "2",
  "dailyThreadId": "114",
  "dailyGroupKey": "GPV5.1",
  "dailyPngUrl": "https://raw.githubusercontent.com/.../gpv-5-1-emergency.png",
  "dailyJsonUrl": "https://raw.githubusercontent.com/.../kyiv-region.json",
  "isActive": true
}
```

**Required fields:**
- `chatId` (string) - Telegram chat ID

**Optional fields:**
- `name` (string, default: "default")
- `threadId` (string, nullable)
- `dailyThreadId` (string, nullable)
- `dailyGroupKey` (string, nullable)
- `dailyPngUrl` (string, nullable)
- `dailyJsonUrl` (string, nullable)
- `isActive` (boolean, default: true)

**Response:** `201 Created`
```json
{
  "contact": {
    "id": 2,
    "name": "Kyiv Group",
    "chatId": "-100xxxxxxxxxx",
    ...
  }
}
```

**Response:** `400 Bad Request`
```json
{
  "error": "chatId is required"
}
```

---

### PUT /api/contacts/:id

Оновити існуючий контакт.

**Request:**
```http
PUT /api/contacts/1
Authorization: Bearer <firebase_id_token>
Content-Type: application/json

{
  "name": "Updated Name",
  "dailyGroupKey": "GPV5.2",
  "isActive": false
}
```

**Note:** Всі поля опціональні. Оновлюються тільки передані поля.

**Response:** `200 OK`
```json
{
  "contact": {
    "id": 1,
    "name": "Updated Name",
    "dailyGroupKey": "GPV5.2",
    "isActive": false,
    ...
  }
}
```

---

### DELETE /api/contacts/:id

Видалити контакт та всі пов'язані розклади.

**Request:**
```http
DELETE /api/contacts/1
Authorization: Bearer <firebase_id_token>
```

**Response:** `204 No Content`

---

## Schedules API

### GET /api/schedules

Отримати список розкладів (опціонально фільтрувати по contactId).

**Request:**
```http
GET /api/schedules
Authorization: Bearer <firebase_id_token>
```

**Request with filter:**
```http
GET /api/schedules?contactId=1
Authorization: Bearer <firebase_id_token>
```

**Response:** `200 OK`
```json
{
  "schedules": [
    {
      "id": 1,
      "contactId": 1,
      "startHour": 20,
      "startMinute": 0,
      "endHour": 23,
      "endMinute": 59,
      "intervalMinutes": 30,
      "timezone": "Europe/Kyiv",
      "jsonMaxAgeHours": "24.00",
      "requireNonYesValues": true,
      "sendTodayInitial": false,
      "isActive": true,
      "createdAt": "2026-03-09T20:00:00.000Z",
      "updatedAt": "2026-03-09T20:00:00.000Z",
      "contact": {
        "id": 1,
        "name": "default",
        "chatId": "-100xxxxxxxxxx"
      }
    }
  ]
}
```

---

### GET /api/schedules/:id

Отримати конкретний розклад.

**Request:**
```http
GET /api/schedules/1
Authorization: Bearer <firebase_id_token>
```

**Response:** `200 OK`
```json
{
  "schedule": {
    "id": 1,
    "contactId": 1,
    "startHour": 20,
    "startMinute": 0,
    "endHour": 23,
    "endMinute": 59,
    "intervalMinutes": 30,
    "timezone": "Europe/Kyiv",
    "jsonMaxAgeHours": "24.00",
    "requireNonYesValues": true,
    "sendTodayInitial": false,
    "isActive": true,
    "createdAt": "2026-03-09T20:00:00.000Z",
    "updatedAt": "2026-03-09T20:00:00.000Z",
    "contact": {
      "id": 1,
      "name": "default",
      "chatId": "-100xxxxxxxxxx"
    }
  }
}
```

---

### POST /api/contacts/:id/schedules

Створити новий розклад для контакту.

**Request:**
```http
POST /api/contacts/1/schedules
Authorization: Bearer <firebase_id_token>
Content-Type: application/json

{
  "startHour": 20,
  "startMinute": 0,
  "endHour": 23,
  "endMinute": 59,
  "intervalMinutes": 30,
  "timezone": "Europe/Kyiv",
  "jsonMaxAgeHours": 24,
  "requireNonYesValues": true,
  "sendTodayInitial": false,
  "isActive": true
}
```

**Field descriptions:**
- `startHour` (integer, 0-23, default: 20) - Година початку перевірок
- `startMinute` (integer, 0-59, default: 0) - Хвилина початку
- `endHour` (integer, 0-23, default: 23) - Година кінця перевірок
- `endMinute` (integer, 0-59, default: 59) - Хвилина кінця
- `intervalMinutes` (integer, >0, default: 30) - Інтервал між перевірками
- `timezone` (string, default: "Europe/Kyiv") - Часова зона
- `jsonMaxAgeHours` (number, default: 24) - Макс. вік JSON для свіжості
- `requireNonYesValues` (boolean, default: true) - Чи потрібні non-yes значення
- `sendTodayInitial` (boolean, default: false) - Надсилати початковий графік на сьогодні
- `isActive` (boolean, default: true) - Активність розкладу

**Response:** `201 Created`
```json
{
  "schedule": {
    "id": 2,
    "contactId": 1,
    "startHour": 20,
    ...
  }
}
```

**Response:** `404 Not Found`
```json
{
  "error": "Contact not found"
}
```

---

### PUT /api/schedules/:id

Оновити існуючий розклад.

**Request:**
```http
PUT /api/schedules/1
Authorization: Bearer <firebase_id_token>
Content-Type: application/json

{
  "startHour": 21,
  "intervalMinutes": 60,
  "isActive": false
}
```

**Note:** Всі поля опціональні.

**Response:** `200 OK`
```json
{
  "schedule": {
    "id": 1,
    "startHour": 21,
    "intervalMinutes": 60,
    "isActive": false,
    ...
  }
}
```

---

### DELETE /api/schedules/:id

Видалити розклад.

**Request:**
```http
DELETE /api/schedules/1
Authorization: Bearer <firebase_id_token>
```

**Response:** `204 No Content`

---

## Автентифікація

Всі endpoints захищені Firebase Auth і доступні лише користувачам з custom claim `admin: true`.
Видати/забрати доступ: `node scripts/setAdminClaim.js <email> [--revoke]` (після видачі користувач має перелогінитися).

Отримайте ID token з Firebase на клієнті:

```javascript
import { getAuth } from 'firebase/auth';

const auth = getAuth();
const user = auth.currentUser;
const token = await user.getIdToken();

// Використання в запиті
fetch('https://your-api.com/api/contacts', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

---

## Помилки

| Код | Опис |
|-----|------|
| 401 | Unauthorized - невалідний, відкликаний або відсутній токен |
| 403 | Forbidden - користувач без claim `admin` |
| 503 | Service Unavailable - Firebase Auth не налаштований на сервері |
| 404 | Not Found - ресурс не знайдено |
| 400 | Bad Request - невалідні дані |
| 500 | Internal Server Error - помилка сервера |

**Приклад помилки:**
```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

---

## Fallback на env vars

Якщо в БД немає активних контактів, бот автоматично fallback на environment variables:
- `CHAT_ID`
- `THREAD_ID`
- `DAILY_THREAD_ID`
- `DAILY_GROUP_KEY`
- `DAILY_CHECK_START_HOUR`
- і т.д.

Це дозволяє поступово переносити конфігурацію в БД без простою.

---

## Приклад використання (TypeScript)

```typescript
interface Contact {
  id?: number;
  name: string;
  chatId: string;
  threadId?: string;
  dailyThreadId?: string;
  dailyGroupKey?: string;
  dailyPngUrl?: string;
  dailyJsonUrl?: string;
  isActive?: boolean;
}

interface Schedule {
  id?: number;
  contactId: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  intervalMinutes: number;
  timezone: string;
  jsonMaxAgeHours: number;
  requireNonYesValues: boolean;
  sendTodayInitial: boolean;
  isActive: boolean;
}

// Створити контакт
async function createContact(token: string, contact: Contact) {
  const response = await fetch('https://api.example.com/api/contacts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(contact)
  });
  return response.json();
}

// Створити розклад
async function createSchedule(token: string, contactId: number, schedule: Schedule) {
  const response = await fetch(`https://api.example.com/api/contacts/${contactId}/schedules`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(schedule)
  });
  return response.json();
}
```
