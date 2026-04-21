const puppeteer = require("puppeteer");

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function autoScroll(page) {
    const feed = await page.$('div[role="feed"]');
    for (let i = 0; i < 10; i++) {
        await page.evaluate(el => el.scrollBy(0, 1000), feed);
        await sleep(1000);
    }
}

module.exports = async function (keyword, location) {
    const browser = await puppeteer.launch({ headless: true });

    const page = await browser.newPage();

    const query = encodeURIComponent(`${keyword} ${location}`);
    const url = `https://www.google.com/maps/search/${query}`;

    await page.goto(url, { waitUntil: "domcontentloaded" });

    await page.waitForSelector('div[role="feed"]');

    await autoScroll(page);

    const links = await page.$$eval('a[href*="/maps/place/"]',
        els => [...new Set(els.map(e => e.href))]
    );

    let results = [];

    for (let link of links.slice(0, 20)) {
        try {
            await page.goto(link, { waitUntil: "domcontentloaded" });

            await page.waitForSelector("h1");

            const data = await page.evaluate(() => {
                return {
                    name: document.querySelector("h1")?.innerText || "",
                    address: document.querySelector('button[data-item-id="address"]')?.innerText || "",
                    phone: document.querySelector('button[data-item-id^="phone"]')?.innerText || "",
                    website: document.querySelector('a[data-item-id="authority"]')?.href || ""
                };
            });

            results.push(data);

        } catch { }
    }

    await browser.close();

    return results;
};