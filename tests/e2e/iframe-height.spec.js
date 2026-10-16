import { test, expect } from '@playwright/test';

// The iframe height on a host page that does exactly what INTEGRATION.md §1 asks
// of integrators — `iframe.style.height = resize.height`, nothing else.
//
// The sandbox cannot answer this: it keeps a CSS min-height on its iframe and
// zeroes the height before every reload, which is precisely what hid the bug
// these specs pin down. The widget used to report max(its own height,
// documentElement.scrollHeight), and inside an iframe the latter is never below
// the iframe itself — so the height the parent set came straight back, and the
// iframe could only ever grow. A moment of a wide or tall iframe on the host left
// a permanent empty gap under the cards (the "floating" mobile bug).

const PARENT_PATH = '/__iframe-height-host.html';

const PARENT_HTML = `<!doctype html>
<meta name="viewport" content="width=device-width">
<style>
  body { margin: 0; }
  #wrap { padding: 0 16px; }
  #widget { display: block; width: 100%; border: 0; }
  #below { height: 600px; }
</style>
<div id="wrap"><iframe id="widget" title="Lootboxes"></iframe></div>
<div id="below">How it works</div>
<script>
  window.__resizes = [];
  window.__ready = 0;
  const iframe = document.getElementById('widget');
  window.addEventListener('message', ({ source, data }) => {
    if (source !== iframe.contentWindow || !data) return;
    if (data.type === 'ready') window.__ready += 1;
    if (data.type !== 'resize') return;
    window.__resizes.push(data.data.height);
    iframe.style.height = Math.ceil(data.data.height) + 'px';
    if (window.__afterResize) window.__afterResize();
  });
</script>`;

/** Today's card (the big one) and two upcoming days. */
const CARDS = [
  'c1_state=available&c1_date=13+Oct',
  'c2_state=locked&c2_date=14+Oct',
  'c3_state=locked&c3_date=15+Oct',
].join('&');

/** The same days once today has no big card any more. */
const CARDS_WITHOUT_TODAY = [
  { state: 'prize', date: '13 Oct', title: '20 Free Spins', prizeType: 'free-spins' },
  { state: 'locked', date: '14 Oct' },
  { state: 'locked', date: '15 Oct' },
];

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} folder brand folder, e.g. `lootbox-2`
 * @param {{ wrapWidth: number, iframeHeight?: number }} host
 */
async function openHost(page, folder, { wrapWidth, iframeHeight }) {
  await page.route(`**${PARENT_PATH}`, (route) =>
    route.fulfill({ contentType: 'text/html', body: PARENT_HTML }),
  );
  await page.goto(PARENT_PATH);
  await page.evaluate(
    ({ src, wrapWidth, iframeHeight }) => {
      document.getElementById('wrap').style.width = `${wrapWidth}px`;
      const iframe = document.getElementById('widget');
      if (iframeHeight) iframe.style.height = `${iframeHeight}px`;
      iframe.src = src;
    },
    { src: `/${folder}/index.html?lang=en&${CARDS}`, wrapWidth, iframeHeight },
  );
  await page.waitForFunction(() => window.__ready >= 1);
}

/** The iframe's height on the host, and the widget's own height inside it. */
function heights(page) {
  return page.evaluate(() => {
    const iframe = document.getElementById('widget');
    const root = iframe.contentDocument.querySelector('[data-lb-root]');
    return {
      iframe: iframe.getBoundingClientRect().height,
      widget: Math.ceil(root.getBoundingClientRect().height),
    };
  });
}

async function expectIframeToFitWidget(page) {
  await expect
    .poll(async () => {
      const { iframe, widget } = await heights(page);
      return iframe - widget;
    })
    .toBe(0);
}

/** @param {import('@playwright/test').Page} page */
function setWrapWidth(page, width) {
  return page.evaluate((w) => {
    document.getElementById('wrap').style.width = `${w}px`;
  }, width);
}

for (const [brand, folder] of [
  ['vegas', 'lootbox'],
  ['thor', 'lootbox-2'],
]) {
  test.describe(`${brand} iframe height`, () => {
    test('comes back down after the host was wide for a moment', async ({ page }) => {
      await openHost(page, folder, { wrapWidth: 390 });
      await expectIframeToFitWidget(page);
      const phone = await heights(page);

      // The host's desktop layout for a moment: the cards scale up with it.
      await setWrapWidth(page, 1600);
      await expect.poll(async () => (await heights(page)).iframe).toBeGreaterThan(phone.iframe + 100);

      await setWrapWidth(page, 390);
      await expectIframeToFitWidget(page);
      expect((await heights(page)).iframe).toBe(phone.iframe);
    });

    test('an iframe the host made tall before boot is brought down to the widget', async ({
      page,
    }) => {
      await openHost(page, folder, { wrapWidth: 390, iframeHeight: 700 });
      await expectIframeToFitWidget(page);
      expect((await heights(page)).iframe).toBeLessThan(700);
    });

    test('content that gets shorter shrinks the iframe with it', async ({ page }) => {
      await openHost(page, folder, { wrapWidth: 390 });
      await expectIframeToFitWidget(page);
      const before = await heights(page);

      await page.evaluate((cards) => {
        document
          .getElementById('widget')
          .contentWindow.postMessage({ type: 'setContent', data: { cards } }, '*');
      }, CARDS_WITHOUT_TODAY);
      await expect.poll(async () => (await heights(page)).widget).toBeLessThan(before.widget);
      await expectIframeToFitWidget(page);
    });

    test('a host scrollbar that comes and goes does not make the height bounce', async ({
      page,
    }) => {
      await openHost(page, folder, { wrapWidth: 1200 });
      await expectIframeToFitWidget(page);

      const sentBefore = await page.evaluate(() => {
        // A classic scrollbar, simulated so the spec does not depend on the OS: it
        // takes 17px of the host's width whenever the page is taller than the
        // viewport, and the viewport sits 3px short of the page — exactly where
        // shrinking by a scrollbar's worth of card height would drop the scrollbar,
        // widen the cards, grow the page, bring the scrollbar back, and so on.
        const wrap = document.getElementById('wrap');
        const iframe = document.getElementById('widget');
        const below = document.getElementById('below');
        const pageHeight = () =>
          iframe.getBoundingClientRect().height + below.getBoundingClientRect().height;
        const viewport = pageHeight() - 3;
        window.__afterResize = () => {
          wrap.style.width = `${pageHeight() > viewport ? 1200 - 17 : 1200}px`;
        };
        const sent = window.__resizes.length;
        window.__afterResize();
        return sent;
      });

      await page.waitForTimeout(1500);
      const sent = await page.evaluate((before) => window.__resizes.length - before, sentBefore);
      expect(sent).toBeLessThanOrEqual(2);

      const { iframe, widget } = await heights(page);
      expect(iframe).toBeGreaterThanOrEqual(widget); // nothing is clipped
      expect(iframe - widget).toBeLessThan(16); // and the slack stays a few transparent px
    });
  });
}
