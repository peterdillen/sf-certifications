const puppeteer = require('puppeteer');
(async () => {
    console.log('Launching browser with dumpio...');
    try {
        const browser = await puppeteer.launch({ 
            headless: 'new',
            dumpio: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        console.log('Browser launched!');
        await browser.close();
        console.log('Browser closed!');
    } catch(e) {
        console.error('Error:', e);
    }
})();
