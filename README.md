# svitloBot

Node.js бот для Telegram, який:
- приймає webhook події статусу світла (`online` / `offline`);
- надсилає повідомлення про зміну статусу;
- автоматично перевіряє графік відключень для `GPV5.1` та надсилає PNG у окремий тред.

## Технології

- Node.js
- Fastify
- Sequelize
- PostgreSQL
- Vitest

## Швидкий старт

1. Встановити залежності:
   - `npm install`
2. Заповнити `.env`.
3. Запустити:
   - `npm start`

## Скрипти

- `npm start` — запуск сервера
- `npm test` — запуск тестів

## Структура

- `src/app.js` — старт застосунку
- `src/routes/` — HTTP маршрути
- `src/controllers/` — контролери
- `src/services/` — бізнес-логіка (Telegram, scheduler, status)
- `src/models/` — Sequelize моделі
- `src/utils/` — утиліти

## API

### Health

- `GET /`
- відповідь: `{ "message": "Request received" }`

### Monitor webhook

- `POST /`
- body:
  - `monitor_status`: `online` або `offline`
  - `timestamp`: Unix timestamp (секунди)

При валідному запиті:
- обчислюється тривалість попереднього стану;
- надсилається повідомлення в Telegram;
- зберігається новий стан у БД.

## Telegram: треди

- `CHAT_ID` — чат
- `THREAD_ID` — тред для статусних повідомлень
- `DAILY_THREAD_ID` — окремий тред для графіків

## Логіка щоденних перевірок графіка

> 📋 Детальний опис усіх сценаріїв та таблиця покриття: [SCENARIOS.md](./SCENARIOS.md)

Scheduler працює у часовій зоні `TIMEZONE` (рекомендовано `Europe/Kyiv`):

- старт вікна перевірок: `20:00`;
- крок: кожні `30` хв;
- остання перевірка: `00:00`.

На кожній ітерації:

1. Завантажує `DAILY_JSON_URL` (`kyiv-region.json`).
2. Шукає дані на завтра для групи `DAILY_GROUP_KEY` (за замовчуванням `GPV5.1`) у `fact.data`.
3. Якщо дані вперше з'явились — надсилає PNG (`DAILY_PNG_URL`) в `DAILY_THREAD_ID`.
4. Якщо дані вже були і JSON змінився — надсилає оновлений графік з поміткою про оновлення.
5. Якщо до `00:00` даних немає — надсилає повідомлення:
   - `Графік відключень на {{date}} відсутній`

### Перевірка графіка на сьогодні

Бот також перевіряє зміни у графіку **на сьогодні**:

- Відстежує зміни у даних для поточної дати (today).
- Якщо вчора обіцяли "без відключень", а сьогодні з'явилися відключення — **надсилає попередження** з поміткою `⚠️ ЗМІНЕНО - з'явилися відключення!`
- Якщо відключення скасували (всі години стали `yes`) — надсилає повідомлення про скасування.
- Для увімкнення відправки початкового графіка на сьогодні встановіть `DAILY_SEND_TODAY_INITIAL=true`.

## Приклад `.env`

```env
API_TOKEN=your_telegram_bot_token
DATABASE_URL=postgresql://user:password@host:5432/db

CHAT_ID=-100xxxxxxxxxx
THREAD_ID=2
DAILY_THREAD_ID=114

TIMEZONE=Europe/Kyiv

DAILY_JSON_URL=https://raw.githubusercontent.com/Baskerville42/outage-data-ua/main/data/kyiv-region.json
DAILY_GROUP_KEY=GPV5.1
DAILY_PNG_URL=https://raw.githubusercontent.com/Baskerville42/outage-data-ua/main/images/kyiv-region/gpv-5-1-emergency.png

DAILY_CHECK_START_HOUR=20
DAILY_CHECK_START_MINUTE=0
DAILY_CHECK_END_HOUR=0
DAILY_CHECK_END_MINUTE=0
DAILY_CHECK_INTERVAL_MINUTES=30
DAILY_SEND_TODAY_INITIAL=false
```

## Нотатки

- Scheduler запускається разом із застосунком.
- Для застосування змін у `.env` потрібен перезапуск процесу.
