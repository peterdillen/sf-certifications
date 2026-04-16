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
            const html = document.documentElement.innerHTML;
            const privateTexts = [
                'profile is private',
                'set their profile to private',
                'isn\'t public',
                'doesn\'t have a public profile',
                'profile is not public'
            ];
            const hasPrivateText = privateTexts.some(text =>
                bodyText.toLowerCase().includes(text.toLowerCase()) ||
                html.toLowerCase().includes(text.toLowerCase())
            );

            // Fallback: If name exists but certain public-only sections are missing
            const hasCertsSection = html.includes('Certifications') || html.includes('credentials-topic');
            return hasPrivateText || (bodyText.length > 0 && !hasCertsSection);
        });

        if (isPrivate) {
            console.error('Detected private profile');
            return { error: 'PRIVATE_PROFILE', name: title.replace(' - Trailblazer Profile', '').trim() || userAlias };
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
            const potentialTopics = findAllInShadow('button, div[role="button"], h2.title, h2, h3');
            console.log(`Found ${potentialTopics.length} potential topic elements`);

            const topicInfo = potentialTopics.map(el => {
                const rect = el.getBoundingClientRect();
                const text = el.innerText || '';
                const ariaLabel = el.getAttribute('aria-label') || '';
                const combinedText = (text + ' ' + ariaLabel).toLowerCase();

                // Identify topic buttons or headers: they usually have "certifications"
                const isCertTopic = combinedText.includes('certifications') &&
                    (rect.width > 0 && rect.height > 0);

                return {
                    text: text.split('\n')[0].trim(),
                    fullText: text,
                    ariaLabel: ariaLabel,
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                    isCert: isCertTopic,
                    isButton: el.tagName === 'BUTTON' || el.getAttribute('role') === 'button',
                    isExpanded: el.getAttribute('aria-expanded') === 'true' || el.classList.contains('slds-is-open')
                };
            }).filter(info => info.isCert);

            console.log(`Found ${topicInfo.length} certification topic elements`);
            return topicInfo;
        });

        console.error('Target topics:', JSON.stringify(certifications));

        // Sorting topics by Y to handle them in order
        const sortedTopics = certifications.sort((a, b) => a.y - b.y);
        // Helper for Shadow DOM
        const findOneInShadow = async (selector) => {
            return await page.evaluate((sel) => {
                function findOne(root, targetSel) {
                    const el = root.querySelector(targetSel);
                    if (el) return el;
                    const all = root.querySelectorAll('*');
                    for (const child of all) {
                        if (child.shadowRoot) {
                            const found = findOne(child.shadowRoot, targetSel);
                            if (found) return found;
                        }
                    }
                    return null;
                }
                const found = findOne(document, sel);
                return found ? found.innerText : null;
            }, selector);
        };

        // Get Profile Data
        const profileData = await page.evaluate(() => {
            function find(root, sel) {
                const el = root.querySelector(sel);
                if (el) return el;
                const all = root.querySelectorAll('*');
                for (const child of all) {
                    if (child.shadowRoot) {
                        const found = find(child.shadowRoot, sel);
                        if (found) return found;
                    }
                }
                return null;
            }

            // Try to find the global profile object or extract it from script tags
            let profile = window.profile;
            if (!profile) {
                const scripts = Array.from(document.querySelectorAll('script'));
                const profileScript = scripts.find(s => s.innerText.includes('var profile = {'));
                if (profileScript) {
                    try {
                        const match = profileScript.innerText.match(/var profile = (\{.*?\});/s);
                        if (match) {
                            profile = JSON.parse(match[1]);
                        }
                    } catch (e) {
                        console.error('Failed to parse profile JSON from script:', e);
                    }
                }
            }

            const nameEl = find(document, 'h1.slds-text-heading_large') || find(document, 'h1') || find(document, '.slds-media__body h1');
            const avatarEl = find(document, 'span.tds-avatar img') || find(document, 'img[src*="profile-photo"]') || find(document, 'img.slds-avatar');

            return {
                name: profile?.firstName ? `${profile.firstName} ${profile.lastName}` : (nameEl ? nameEl.innerText.split('|')[0].trim() : null),
                picture: profile?.photoUrl || (avatarEl ? avatarEl.src : null),
                username: profile?.username || null,
                profileUrl: profile?.profileUrl || null
            };
        });

        const content = await page.content();
        let nickname = profileData.username;
        if (!nickname) {
            // Priority 1: username (usually the vanity part)
            const usernameMatch = content.match(/"username"\s*:\s*"([^"]+)"/);
            if (usernameMatch) {
                nickname = usernameMatch[1];
            } else {
                // Priority 2: nickname (fallback)
                const nicknameMatch = content.match(/"nickname"\s*:\s*"([^"]+)"/);
                nickname = nicknameMatch ? nicknameMatch[1] : null;
            }
        }

        const fullName = profileData.name || (await page.title()).split(' - ')[0].trim();
        const profilePictureUrl = profileData.picture;
        const profileUrl = profileData.profileUrl || (nickname ? `https://www.salesforce.com/trailblazer/${nickname}` : `https://www.salesforce.com/trailblazer/${alias}`);

        const results = {
            name: fullName,
            picture: profilePictureUrl,
            profileUrl: profileUrl,
            certifications: []
        };

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
                const potential = findAllInShadow('button, div[role="button"], h2.title, h2, h3');
                // Target item more precisely: must contain topic text
                const el = potential.find(b => {
                    const t = (b.innerText || '').toLowerCase();
                    return t.includes(targetText.toLowerCase());
                });
                if (!el) return null;

                el.scrollIntoView({ behavior: 'instant', block: 'center' });
                const rect = el.getBoundingClientRect();
                const isButton = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button';
                return {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                    isButton: isButton,
                    isExpanded: !isButton || el.getAttribute('aria-expanded') === 'true' || el.classList.contains('slds-is-open')
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

                    // Support date ranges: "Oct 2018 - Apr 2019"
                    const dateMatch = text.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}(\s*-\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})?/i);

                    if (dateMatch) {
                        const rect = node.getBoundingClientRect();
                        const midY = rect.top + rect.height / 2;

                        if (midY > minY && midY < maxY) {
                            let link = '';
                            // Priority: find a link or header that IS NOT the topic name or 'Issued...'
                            const possibleTitleElems = Array.from(node.querySelectorAll('a, h3, h4, b, [class*="title"]'));
                            const bestTitleElem = possibleTitleElems.find(el => {
                                const t = el.innerText.trim();
                                return t.length > 5 &&
                                    !t.toLowerCase().includes('issued') &&
                                    !t.toLowerCase().includes('achieved by') &&
                                    t.toLowerCase() !== targetTopicName.toLowerCase();
                            });

                            if (bestTitleElem) {
                                name = bestTitleElem.innerText.trim();

                                // Look for any <a> with trailheadacademy link in the whole node
                                const allLinks = Array.from(node.querySelectorAll('a'));
                                const certLinkElem = allLinks.find(a =>
                                    a.href && a.href.toLowerCase().includes('trailheadacademy.salesforce.com/certificate')
                                );
                                if (certLinkElem) {
                                    link = certLinkElem.href;
                                } else {
                                    const linkElem = bestTitleElem.tagName === 'A' ? bestTitleElem : bestTitleElem.querySelector('a');
                                    if (linkElem) link = linkElem.href;
                                }
                            } else {
                                const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
                                name = lines.find(l => {
                                    const lower = l.toLowerCase();
                                    return !lower.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/i) &&
                                        !lower.includes('issued') &&
                                        !lower.includes('achieved by') &&
                                        lower !== targetTopicName.toLowerCase();
                                }) || lines[0];
                            }

                            if (name && name.length > 5 && name.length < 100) {
                                // Clean name from common noise and metadata
                                let cleanName = name.replace(/^(Virtual|In-person|Online|Specialist|Issued|Achieved|Achieved by)\s*(•|:)?\s*/i, '').trim();

                                // Explicitly filter out nodes that are JUST dates
                                const isJustDate = cleanName.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}(\s*-\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})?$/i);

                                // Explicitly filter out noise
                                const noisePatterns = [/TrailblazerDX/i, /World Tour/i, /Dreamforce/i];
                                const isNoise = noisePatterns.some(p => p.test(cleanName));

                                if (!isNoise && !isJustDate &&
                                    cleanName.toLowerCase() !== targetTopicName.toLowerCase() &&
                                    !cleanName.toLowerCase().startsWith('issued') &&
                                    cleanName.length > 5) {

                                    // Determine if expired
                                    let isExpired = false;
                                    const fullDateStr = dateMatch[0];
                                    if (fullDateStr.includes('-')) {
                                        const parts = fullDateStr.split('-').map(p => p.trim());
                                        const endDateStr = parts[1];
                                        const now = new Date();
                                        const endDate = new Date(endDateStr);
                                        if (endDate < now) {
                                            isExpired = true;
                                        }
                                    }

                                    const key = `${targetTopicName}|${cleanName}`;
                                    if (!seen.has(key)) {
                                        // Extract description if possible
                                        const fullNodeTextLines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
                                        const desc = fullNodeTextLines.find(l =>
                                            l !== name &&
                                            !l.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/i) &&
                                            !l.includes('Achieved by') &&
                                            !l.includes('Issued')
                                        ) || '';

                                        // Extract image if possible
                                        const img = node.querySelector('img');
                                        const imageUrl = img ? img.src : '';

                                        // Normalize name
                                        const normalizedName = cleanName
                                            .replace(/^Salesforce Certified\s+/i, '')
                                            .replace(/Accredited Professional/gi, '(Accreditation)')
                                            .trim();

                                        certResults.push({
                                            topic: targetTopicName,
                                            name: normalizedName,
                                            description: desc,
                                            image: imageUrl,
                                            date: fullDateStr,
                                            isExpired: isExpired,
                                            link: link
                                        });
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

            results.certifications.push(...pageData);
        }

        await page.screenshot({ path: 'worker_debug_final_state.png', fullPage: true });
        console.error('Final state screenshot saved');

        return results;

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
        process.exit(0);
    });
}
