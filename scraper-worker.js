const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

async function scrape(userAlias) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();

        // Pipe browser console to Node stderr
        page.on('console', msg => {
            console.error(`BROWSER [${msg.type()}]: ${msg.text()}`);
        });

        await page.setViewport({ width: 1280, height: 3000 }); // Much taller

        // Random user agent to further mimic a real user
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        const url = `https://www.salesforce.com/trailblazer/${userAlias}`;
        console.error(`Scraping: ${url}`); // Using stderr for logs to keep stdout clean for JSON

        const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        await page.screenshot({ path: 'worker_debug_initial.png' });
        console.error('Initial screenshot saved');

        // Handle common blocks
        const title = await page.title();
        console.error('Page Title:', title);
        if (title.includes('Access Denied')) {
            throw new Error('Blocked by Akamai (Access Denied)');
        }

        // Handle Cookie Banner
        try {
            const cookieBtnSelector = '#onetrust-accept-btn-handler';
            console.error('Waiting for cookie banner...');
            await page.waitForSelector(cookieBtnSelector, { timeout: 10000 });
            await page.click(cookieBtnSelector);
            console.error('Cookie banner clicked');
            await new Promise(r => setTimeout(r, 2000));
            await page.screenshot({ path: 'worker_debug_after_cookie.png' });
            console.error('Screenshot after cookie saved');
        } catch (e) {
            console.error('Cookie banner issue:', e.message);
        }

        // Check for private profile with a short wait
        await new Promise(r => setTimeout(r, 2000));
        const isPrivate = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            if (bodyText.includes('This profile is private')) return true;
            // Check shadow roots if needed
            function findTextInShadow(root = document) {
                if (root.innerText && root.innerText.includes('This profile is private')) return true;
                const children = Array.from(root.querySelectorAll('*'));
                for (const child of children) {
                    if (child.shadowRoot && findTextInShadow(child.shadowRoot)) return true;
                }
                return false;
            }
            return findTextInShadow();
        });
        if (isPrivate) {
            console.error('Detected private profile');
            return { error: 'Profile is private' };
        }

        // Wait for certifications section
        await page.waitForSelector('button', { timeout: 10000 });

        // Extraction logic
        const certifications = await page.evaluate(async () => {
            // Helper to find all elements matching selector, including those inside shadow roots
            function findAllInShadow(selector, root = document) {
                const elements = Array.from(root.querySelectorAll(selector));
                const children = Array.from(root.querySelectorAll('*'));
                for (const child of children) {
                    if (child.shadowRoot) {
                        elements.push(...findAllInShadow(selector, child.shadowRoot));
                    }
                }
                return elements;
            }

            console.log('Searching for topics...');
            const buttons = findAllInShadow('button, div[role="button"]');
            console.log(`Found ${buttons.length} total clickable elements (including Shadow DOM)`);

            const topicInfo = buttons.map(btn => {
                const rect = btn.getBoundingClientRect();
                const text = btn.innerText || '';
                const ariaLabel = btn.getAttribute('aria-label') || '';
                const combinedText = (text + ' ' + ariaLabel).toLowerCase();

                // Identify topic buttons: they usually have "certifications" or are under a section with that name
                // Or they might just be the accordion headers
                const isCertTopic = combinedText.includes('certifications') &&
                    (rect.width > 0 && rect.height > 0);

                return {
                    text: text.split('\n')[0].trim(),
                    fullText: text,
                    ariaLabel: ariaLabel,
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                    isCert: isCertTopic
                };
            }).filter(info => info.isCert);

            console.log(`Found ${topicInfo.length} certification topic buttons`);
            return topicInfo;
        });

        console.error('Target topics:', JSON.stringify(certifications));

        // Sorting topics by Y to handle them in order
        const sortedTopics = certifications.sort((a, b) => a.y - b.y);
        const finalResults = [];

        for (let i = 0; i < certifications.length; i++) {
            const topicName = certifications[i].text;
            console.error(`Processing topic: ${topicName}`);

            // Re-find topic to get fresh coordinates (since they shift after expansion)
            const freshTopic = await page.evaluate((targetText) => {
                function findAllInShadow(selector, root = document) {
                    let elements = Array.from(root.querySelectorAll(selector));
                    const children = Array.from(root.querySelectorAll('*'));
                    for (const child of children) {
                        if (child.shadowRoot) {
                            elements = elements.concat(findAllInShadow(selector, child.shadowRoot));
                        }
                    }
                    return elements;
                }
                const buttons = findAllInShadow('button, div[role="button"]');
                // Target button more precisely: must contain topic text AND certifications count
                const btn = buttons.find(b => {
                    const t = (b.innerText || '').toLowerCase();
                    return t.includes(targetText.toLowerCase()) && t.includes('certifications');
                });
                if (!btn) return null;

                btn.scrollIntoView({ behavior: 'instant', block: 'center' });
                const rect = btn.getBoundingClientRect();
                return {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                    isExpanded: btn.getAttribute('aria-expanded') === 'true' || btn.classList.contains('slds-is-open')
                };
            }, topicName);

            if (!freshTopic) {
                console.error(`Could not find fresh coordinates for ${topicName}`);
                continue;
            }

            // Click to expand if not already
            if (!freshTopic.isExpanded) {
                await page.mouse.move(freshTopic.x, freshTopic.y);
                await page.mouse.down();
                await new Promise(r => setTimeout(r, 100));
                await page.mouse.up();
                await new Promise(r => setTimeout(r, 6000)); // Wait for expansion & data
            } else {
                console.error(`Topic ${topicName} already expanded, skipping click`);
            }

            // Debug screenshot for each topic expansion
            await page.screenshot({ path: `debug_topic_${i}_${topicName.replace(/\s+/g, '_')}.png`, fullPage: true });

            // Extraction using horizontal/vertical proximity
            const pageData = await page.evaluate(async (targetTopicName) => {
                function findAllInShadow(selector, root = document) {
                    let elements = Array.from(root.querySelectorAll(selector));
                    const children = Array.from(root.querySelectorAll('*'));
                    for (const child of children) {
                        if (child.shadowRoot) {
                            elements = elements.concat(findAllInShadow(selector, child.shadowRoot));
                        }
                    }
                    return elements;
                }

                const allButtons = findAllInShadow('button, div[role="button"]');
                const certTopics = allButtons.map(btn => {
                    const rect = btn.getBoundingClientRect();
                    const text = (btn.innerText || '').toLowerCase() + (btn.getAttribute('aria-label') || '').toLowerCase();
                    return {
                        btn,
                        rect,
                        isTopic: text.includes('certifications') && rect.width > 0
                    };
                }).filter(t => t.isTopic).sort((a, b) => a.rect.top - b.rect.top);

                const currentTopicIdx = certTopics.findIndex(t => t.btn.innerText.includes(targetTopicName));
                const currentTopic = certTopics[currentTopicIdx];
                if (!currentTopic) return [];

                const nextTopic = certTopics[currentTopicIdx + 1];
                const minY = currentTopic.rect.bottom;

                // If last topic, try to find a boundary (like another H2 header or a large section divider)
                let maxY = nextTopic ? nextTopic.rect.top : 20000;
                if (!nextTopic) {
                    const h2s = findAllInShadow('h2');
                    const nextHeader = h2s.find(h => h.getBoundingClientRect().top > minY);
                    if (nextHeader) maxY = nextHeader.getBoundingClientRect().top;
                }

                console.log(`Topic ${targetTopicName}: Searching for items between Y=${minY.toFixed(0)} and Y=${maxY.toFixed(0)}`);

                const allNodes = findAllInShadow('*');
                const certResults = [];
                const seen = new Set();

                allNodes.forEach(node => {
                    // Filter out nodes that are too large (containers) unless they are slds-card
                    if (node.children.length > 5 && !node.classList.contains('slds-card')) return;

                    const text = (node.innerText || '').trim();
                    if (text.length < 10 || text.length > 500) return;

                    const dateMatch = text.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/);

                    if (dateMatch) {
                        const rect = node.getBoundingClientRect();
                        const midY = rect.top + rect.height / 2;

                        if (midY > minY && midY < maxY) {
                            let name = '';
                            // Priority: find a link or header that IS NOT the topic name or 'Issued...'
                            const possibleTitleElems = Array.from(node.querySelectorAll('a, h3, h4, b, [class*="title"]'));
                            const bestTitleElem = possibleTitleElems.find(el => {
                                const t = el.innerText.trim();
                                return t.length > 5 &&
                                    !t.toLowerCase().includes('issued') &&
                                    t.toLowerCase() !== targetTopicName.toLowerCase();
                            });

                            if (bestTitleElem) {
                                name = bestTitleElem.innerText.trim();
                            } else {
                                const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
                                name = lines.find(l => !l.includes(dateMatch[0]) &&
                                    !l.toLowerCase().includes('issued') &&
                                    l.toLowerCase() !== targetTopicName.toLowerCase()) || lines[0];
                            }

                            if (name && name.length > 5 && name.length < 100) {
                                // Clean name from common noise and metadata
                                let cleanName = name.replace(/^(Virtual|In-person|Online|Specialist|Issued|Achieved)\s*(•|:)?\s*/i, '').trim();

                                // Explicitly filter out noise
                                const noisePatterns = [/TrailblazerDX/i, /World Tour/i, /Dreamforce/i];
                                const isNoise = noisePatterns.some(p => p.test(cleanName));

                                if (!isNoise &&
                                    cleanName.toLowerCase() !== targetTopicName.toLowerCase() &&
                                    !cleanName.toLowerCase().startsWith('issued') &&
                                    !cleanName.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}$/i) &&
                                    cleanName.length > 5) {

                                    const key = `${cleanName}|${dateMatch[0]}`;
                                    if (!seen.has(key)) {
                                        certResults.push({ topic: targetTopicName, name: cleanName, date: dateMatch[0] });
                                        seen.add(key);
                                    }
                                }
                            }
                        }
                    }
                });

                return certResults;
            }, topicName);

            if (pageData.length === 0) {
                console.error(`No results found for topic: ${topicName}`);
            }

            finalResults.push(...pageData);
        }

        await page.screenshot({ path: 'worker_debug_final_state.png', fullPage: true });
        console.error('Final state screenshot saved');

        return { certifications: finalResults };

    } catch (error) {
        return { error: error.message };
    } finally {
        if (browser) await browser.close();
    }
}

// Handle CLI execution
if (require.main === module) {
    const alias = process.argv[2];
    if (!alias) {
        console.log(JSON.stringify({ error: 'No alias provided' }));
        process.exit(1);
    }

    scrape(alias).then(result => {
        console.log(JSON.stringify(result));
    });
}
