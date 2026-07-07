# Vegas Lootboxes — віджет Fortune Drops: посібник з інтеграції

Довідник для фронтенд-команди. Інтерактивна пісочниця для перевірки —
`lootbox-test/index.html`.

> **Ключовий принцип:** iframe-віджет — це **лише рендерер**. Він не робить API-запитів,
> не визначає приз і не зберігає стан. Popup, blur і будь-який UI поза каруселлю —
> відповідальність батьківської сторінки.

## 1. Вбудовування

Віджет вбудовується через `<iframe>`. Дані карток передаються query-параметрами (§3).
Заголовок секції та підзаголовок — на батьківській сторінці, у iframe лише карусель.

```html
<iframe
  id="lootbox-widget"
  src="https://cdn.example.com/widgets-smartico/lootbox/index.html?c1_state=available&c1_date=1%20Mar&c1_title=See%20what%27s%20inside&c2_state=locked&c2_date=2%20Mar"
  style="width: 100%; border: 0;"
  title="Fortune Drops"
></iframe>
```

Висоту iframe не фіксуйте — віджет повідомляє актуальну висоту через подію `resize` (§4).

## 2. Кроки інтеграції

Нижче — **логіка взаємодії**, без готового коду. Конкретну реалізацію (фреймворк, бібліотеку,
popup, blur) FE робить самостійно. Формати повідомлень — у §4.

1. **Вставити iframe** з query-параметрами карток (§3).
   Якщо дані ще не готові — iframe без параметрів покаже скелетон; після відповіді
   бекенду надішліть `setContent` (§4).
2. **Слухати `ready`** — після цієї події безпечно надсилати команди в iframe.
3. **На `resize`** — оновити висоту iframe значенням з `data.height`.
4. **На `cardClick`** (`state: 'available'`) — анімація вже йде всередині iframe;
   чекайте `animationComplete`.
5. **На `animationComplete`** — зробити запит до **свого** API, **показати свій popup
   результату** (поза iframe), потім надіслати в iframe `setCardState` з результатом
   (`prize` / `prediction`, `active: true`).
6. **Повторний `cardClick`** по сьогоднішньому `prize` (`active: true`, є `cta`) —
   знову показати popup (без повторної анімації).
7. **Після дії в popup** (напр. «Go to Bonuses») — навігація на вашому боці +
   за потреби `setCardState { cta: '' }`, щоб прибрати CTA з картки.

## 3. Query-параметри (Parent → iFrame)

Параметри кожної картки згруповані за індексом: `c1_*`, `c2_*`, `c3_*` тощо.
Додати/прибрати день — додати/прибрати одну групу `c{i}_*`.

### Глобальні

| Параметр | Тип     | За замовч. | Опис |
|----------|---------|------------|------|
| `lang`   | string  | `en`       | Код мови для локалізації та аналітики. |
| `count`  | number  | —          | Гарантує рендер `1..count` індексів (пропущені = `locked`). |
| `origin` | string  | `*`        | Origin батьківської сторінки зі схемою для обмеження `postMessage`. |
| `debug`  | boolean | `false`    | Відкриває `window.__lootboxWidget` в devtools. |

### Картка — `c{i}_*`

| Параметр       | Тип    | Опис |
|----------------|--------|------|
| `c{i}_state`   | enum   | `available`, `locked`, `prize`, `prediction`, `missed`. Невідомі → `locked`. |
| `c{i}_id`      | string | Стабільний ідентифікатор. За замовч. — рядок з індексу. |
| `c{i}_date`    | string | Дата для відображення (`1 Mar`). |
| `c{i}_title`   | string | Заголовок картки. |
| `c{i}_cta`     | string | Підпис CTA для `prize` (`"Go to Bonuses"`). |
| `c{i}_prize`   | enum   | Арт призу: `bonus-money`, `cash`, `coin`, `free-spins`. В postMessage — поле `prizeType`. |
| `c{i}_active`  | bool   | `true` = сьогоднішній результат (свічення, без бейджа «Opened»). Лише для `prize`/`prediction`. |
| `c{i}_tag`     | string | Перевизначення бейджа статусу. |

#### Стани карток

| Slug          | Назва в Figma            | Коли використовувати |
|---------------|--------------------------|----------------------|
| `available`   | Ready to open            | Сьогоднішній день, можна відкрити |
| `locked`      | Locked / Upcoming        | Майбутній день |
| `prize`       | Opened with prize        | Відкрито, випав приз |
| `prediction`  | Opened without prize     | Відкрито, без призу (передбачення) |
| `missed`      | Missed                   | Пропущений день |

Приклад URL з різними станами:

```text
?c1_state=prize&c1_date=1%20Mar&c1_title=20%20CAD%20bonus&c1_prize=bonus-money
&c2_state=missed&c2_date=2%20Mar
&c3_state=available&c3_date=3%20Mar
&c4_state=locked&c4_date=4%20Mar
```

Без параметрів карток — валідний стан: віджет покаже скелетон до отримання `setContent`.

## 4. Протокол postMessage

Формат усіх повідомлень: `{ type: string, data?: object }`.

### iFrame → Parent

| `type`              | `data`                   | Опис |
|---------------------|--------------------------|------|
| `ready`             | `{ count }`              | Перший рендер завершено, безпечно надсилати команди. |
| `cardClick`         | `{ index, id, state }`   | Клік по `available` або сьогоднішньому `prize` (active + cta). |
| `animationComplete` | `{ index, id, state }`   | Анімація завершена — час робити запит до API і показувати popup. |
| `resize`            | `{ height }`             | Висота рендеру змінилась. |

### Parent → iFrame

| `type`         | `data`                                                                | Опис |
|----------------|-----------------------------------------------------------------------|------|
| `setContent`   | `{ cards[] }`                                                         | Замінює **всі** картки. Єдиний спосіб наповнити порожній скелетон. |
| `setCardState` | `{ index\|id, state, title?, cta?, tag?, date?, prizeType?, active? }` | Оновлює **одну** наявну картку. Не створює нових. |

Поля масиву `cards[]` у `setContent` збігаються з query-параметрами без префікса `c{i}_`;
замість `c{i}_prize` — `prizeType`.

## 5. Тільки для пісочниці

Ці команди **не використовуються в продакшен-інтеграції**.

| `type`       | `data`          | Призначення |
|--------------|-----------------|-------------|
| `playOpen`   | `{ index\|id }` | Запуск draft-анімації без кліку. |
| `setLoading` | `{ loading }`   | Примусове вмикання/вимикання скелетону. |

## 6. Розгортання

Ручне завантаження на CDN. Див. `README.md` → `widgets-smartico/lootbox`.
