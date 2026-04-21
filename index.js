const puppeteer = require("puppeteer");
const fs = require("fs");

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function normalizePhone(phone) {
    if (!phone) return "";
    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.startsWith("84")) cleaned = "0" + cleaned.slice(2);
    return cleaned;
}

// scroll để load thêm item
async function autoScroll(page, maxRounds = 12) {
    const feed = await page.$('div[role="feed"]');
    if (!feed) return;

    let prevCount = 0;

    for (let i = 0; i < maxRounds; i++) {
        const links = await page.$$eval('a[href*="/maps/place/"]', els =>
            [...new Set(els.map(e => e.href))]
        );

        console.log(`🔄 Scroll round ${i} | links: ${links.length}`);

        if (links.length === prevCount) {
            console.log("🛑 Không load thêm nữa, dừng scroll");
            break;
        }

        prevCount = links.length;

        await page.evaluate(el => el.scrollBy(0, 1200), feed);
        await sleep(1200);
    }
}

// lấy data trong trang place
async function extractData(page) {
    return await page.evaluate(() => {
        const name = document.querySelector("h1")?.innerText || "";

        const address =
            document.querySelector('button[data-item-id="address"]')?.innerText || "";

        const phone =
            document.querySelector('button[data-item-id^="phone"]')?.innerText || "";

        return { name, address, phone };
    });
}

// mở link với retry
async function openPlace(page, url) {
    for (let i = 0; i < 3; i++) {
        try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
            await page.waitForSelector("h1", { timeout: 7000 });
            return true;
        } catch {
            console.log("🔁 retry open:", i + 1);
            await sleep(1000);
        }
    }
    return false;
}

async function main() {
    const browser = await puppeteer.launch({
        headless: false,
        args: ["--start-maximized", "--lang=vi"]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    const searchUrl =
        "https://www.google.com/maps/search/quán ăn Quy Nhơn";

    await page.goto(searchUrl, { waitUntil: "domcontentloaded" });

    await page.waitForSelector('div[role="feed"]');

    console.log("🚀 Start lấy danh sách...");

    // 🔥 scroll lấy nhiều quán hơn
    await autoScroll(page, 15);

    // 🔥 lấy link unique
    let links = await page.$$eval('a[href*="/maps/place/"]', els =>
        [...new Set(els.map(e => e.href))]
    );

    console.log("📊 Tổng link:", links.length);

    // ⚠️ giới hạn để test
    // links = links.slice(0, 50);

    let results = [];

    for (let i = 0; i < links.length; i++) {
        try {
            console.log(`👉 ${i + 1}/${links.length}`);

            const ok = await openPlace(page, links[i]);

            if (!ok) {
                console.log("❌ mở fail:", links[i]);
                continue;
            }

            await sleep(800);

            const data = await extractData(page);
            data.phone = normalizePhone(data.phone);

            if (!data.phone) {
                console.log("⚠️ không có phone:", data.name);
            }

            results.push(data);
            console.log("✅", data);

            // delay chống block
            await sleep(1000 + Math.random() * 1000);

        } catch (err) {
            console.log("❌ lỗi:", err.message);
        }
    }

    // 🔥 export CSV
    let csv = "Name,Address,Phone\n";

    results.forEach(i => {
        csv += `"${i.name}","${i.address}","${i.phone}"\n`;
    });

    fs.writeFileSync("maps-hybrid.csv", csv, "utf8");

    console.log("📁 DONE:", results.length);

    await browser.close();
}

main();