# Инварианты репозитория

Мультибрендовый набор iFrame-виджетов лутбоксов для Smartico. Vanilla HTML/CSS/JS,
без рантайм-фреймворков. Тулинг (`esbuild`, `sharp`) — только удобство разработки.

Сборка анимированных фонов карточек Thor дополнительно требует **системных**
бинарников, а не npm-пакетов: `brew install ffmpeg libavif webp`. ffmpeg там только
декодирует и масштабирует — кодируют `avifenc` и `img2webp`, потому что формула
ffmpeg 9.0 в Homebrew лишилась `libaom` и `libwebp`. Подробности — в шапке
`scripts/build-card-animations.mjs`.

## Структура

```
core/           brand-agnostic ядро: протокол, парсер параметров, шина сообщений,
                стор, карусель, resize, skeleton, таймер, FLIP-переходы, рантайм,
                базовый CSS и общие шрифты
lootbox/        бренд Vegas Lootboxes  — адаптер: config, render, open, icons, theme
lootbox-thor/   бренд Thor Fortune Drop — адаптер: config, render, open, icons, theme,
                bg-anim (гейт загрузки анимированных фонов), animation-source/ (исходные
                видео — вход сборки, на CDN не уезжают)
lootbox-test/   одна песочница на все бренды, с переключателем проектов
scripts/        build (esbuild), dev-сервер, конвертер WebP, сборка анимированных
                фонов карточек (ffmpeg + avifenc + img2webp)
tests/          юнит-тесты ядра (node --test) и e2e (playwright)
```

## Правила

1. **Имена папок одинаковы в репозитории, в `dist/` и на CDN.** `lootbox/` →
   `dist/lootbox/` → `widgets-smartico/lootbox/`. Из-за этого сиблинг-путь
   `../lootbox/index.html` из песочницы работает и локально, и в сборке, и на
   CDN — без детекта окружения. Не переименовывать папки брендов.

2. **Контракт интеграции живёт в одном экземпляре в `core/`.** `protocol.js`,
   `params.js`, `message-bus.js`, `content-store.js` — единственный источник
   истины. Бренд не дублирует и не расширяет контракт в обход ядра.

3. **Бренд не правит `core/`.** Если для бренда нужна правка ядра, значит это
   brand-agnostic возможность: параметризуй её через `brand.config.js`.

4. **URL и протокол Vegas не меняются.** По `widgets-smartico/lootbox/` уже идёт
   продакшен-интеграция. Любое изменение `lootbox/` проверяется диффом с
   golden-снапшотом (см. `.project-context/thor/progress.md`).

5. **Ассеты бренда лежат только в папке бренда.** Общее — шрифты Sora — лежит в
   `core/assets/fonts/` и копируется в каждый бренд при сборке. Дублирование
   48 КБ на бренд осознанное: папка на CDN должна быть самодостаточной.

6. **Входы сборки не лежат в `assets/`.** `scripts/build.js` копирует всю папку
   `assets/` в `dist/` через `fs.cpSync`, поэтому всё, что там окажется, уедет на
   CDN. Исходные видео лежат в `lootbox-thor/animation-source/` именно поэтому.

7. **`lootbox-thor/backgrounds-anim.generated.js` не править руками.** Он
   генерируется `npm run build:animations` вместе с растрами; хэши в именах файлов
   — это ключ кэша CDN. Правка вручную рассинхронизирует манифест с диском.
   Как устроен весь конвейер (ffmpeg → avifenc/img2webp → манифест → гейт в
   рантайме) — `lootbox-thor/ANIMATIONS.md`.

## Добавить новый бренд

1. Скопировать `lootbox-thor/` в `lootbox-<id>/`, заменить config/render/open/
   icons/theme и ассеты.
2. Добавить `<id>` в `BRANDS` в `scripts/build.js`.
3. Добавить запись в `lootbox-test/projects.js`.

Ядро при этом не трогается — это и есть тест на то, что архитектура работает.

## Рабочий контекст

`.project-context/` (в gitignore) — постановки, планы, прогресс, карта node id
Figma, манифест ассетов, golden-снапшоты. Начинать чтение оттуда:
`.project-context/thor/progress.md`.
