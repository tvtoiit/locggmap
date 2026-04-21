const express = require("express");
const puppeteer = require("puppeteer");
const XLSX = require("xlsx");

const app = express();
app.use(express.json());
app.use(express.static("public"));

// delay
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// scroll load list
async function autoScroll(page) {
    const feed = await page.$('div[role="feed"]');

    for (let i = 0; i < 10; i++) {
        await page.evaluate(el => el.scrollBy(0, 1000), feed);
        await sleep(1000);
    }
}

// =======================
// REALTIME CRAWL (SSE)
// =======================
app.get("/crawl-stream", async (req, res) => {
    const { keyword, location } = req.query;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox"]
    });

    const page = await browser.newPage();

    try {
        const query = encodeURIComponent(`${keyword} ${location}`);
        const url = `https://www.google.com/maps/search/${query}`;

        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForSelector('div[role="feed"]');

        await autoScroll(page);

        const links = await page.$$eval(
            'a[href*="/maps/place/"]',
            els => [...new Set(els.map(e => e.href))]
        );

        for (let i = 0; i < links.length; i++) {
            try {
                await page.goto(links[i], { waitUntil: "domcontentloaded" });
                await page.waitForSelector("h1", { timeout: 5000 });

                const data = await page.evaluate(() => ({
                    name: document.querySelector("h1")?.innerText || "",
                    address: document.querySelector('button[data-item-id="address"]')?.innerText || "",
                    phone: document.querySelector('button[data-item-id^="phone"]')?.innerText || "",
                    website: document.querySelector('a[data-item-id="authority"]')?.href || ""
                }));

                // gửi realtime
                res.write(`data: ${JSON.stringify(data)}\n\n`);

                await sleep(800);

            } catch { }
        }

        res.write(`data: DONE\n\n`);
        await browser.close();
        res.end();

    } catch (err) {
        res.write(`data: ERROR\n\n`);
        await browser.close();
        res.end();
    }
});

// =======================
// EXPORT EXCEL
// =======================
app.post("/export", (req, res) => {
    const data = req.body;

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");

    const buffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx"
    });

    res.setHeader(
        "Content-Disposition",
        "attachment; filename=maps-data.xlsx"
    );

    res.send(buffer);
});

// start server
app.listen(3000, () => {
    console.log("🚀 http://localhost:3000");
});