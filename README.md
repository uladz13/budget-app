# Бюджет — PWA для личного бюджета

Работает офлайн, данные хранятся только на телефоне (IndexedDB). Без аккаунтов и серверов. Перенос данных — бэкап-файл JSON (экран «Ещё»).

## Публикация

Каждый push в `main` собирается GitHub Actions и публикуется на `https://<логин>.github.io/budget-app/` (Settings → Pages → Source: GitHub Actions).

## Локальная разработка

```
npm ci
npm run dev
```
