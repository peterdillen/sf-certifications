import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import { addTrailblazer, syncCertifications } from '../../../lib/db';

export async function POST(req) {
    try {
        const body = await req.json();
        const userAlias = body.userAlias;

        if (!userAlias) {
            return NextResponse.json({ error: 'User alias is required' }, { status: 400 });
        }

        const workerPath = path.join(process.cwd(), 'scraper-worker.js');

        const result = await new Promise((resolve) => {
            exec(`node "${workerPath}" ${userAlias}`, (error, stdout, stderr) => {
                if (stderr) console.error('Worker Stderr:', stderr);
                if (error) {
                    console.error('Worker Error:', error);
                    return resolve({ error: 'Scraper worker failed: ' + error.message });
                }
                try {
                    const data = JSON.parse(stdout);
                    resolve(data);
                } catch (e) {
                    console.error('JSON Parse Error:', e, 'Raw output:', stdout);
                    resolve({ error: 'Failed to parse scraper output' });
                }
            });
        });

        if (result.error === 'PRIVATE_PROFILE') {
            return NextResponse.json({ error: 'Trailblazer has profile set to private' }, { status: 403 });
        }

        if (result.error || !result.name || result.name === '404' || result.name.toLowerCase().includes('not found')) {
            return NextResponse.json({ error: 'Trailblazer not found' }, { status: 404 });
        }

        // 1. Ensure trailblazer exists in DB
        const trailblazer = await addTrailblazer(userAlias, result.name);

        // 2. Sync certifications and name with DB
        if (result.certifications) {
            await syncCertifications(trailblazer.id, result.certifications, result.name, result.picture, result.profileUrl);
        }

        return NextResponse.json({ certifications: result.certifications || [], name: result.name });

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch certifications: ' + error.message }, { status: 500 });
    }
}
