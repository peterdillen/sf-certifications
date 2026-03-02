import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';

export async function POST(req) {
    try {
        const { userAlias } = await req.json();

        if (!userAlias) {
            return NextResponse.json({ error: 'User alias is required' }, { status: 400 });
        }

        const workerPath = path.join(process.cwd(), 'scraper-worker.js');

        const result = await new Promise((resolve, reject) => {
            exec(`node "${workerPath}" ${userAlias}`, (error, stdout, stderr) => {
                if (stderr) console.error('Worker Stderr:', stderr);
                if (error) {
                    console.error('Worker Error:', error);
                    return reject(new Error('Scraper worker failed: ' + error.message));
                }
                try {
                    const data = JSON.parse(stdout);
                    resolve(data);
                } catch (e) {
                    console.error('JSON Parse Error:', e, 'Raw output:', stdout);
                    reject(new Error('Failed to parse scraper output'));
                }
            });
        });

        if (result.error) {
            const status = result.error.includes('private') ? 403 : 500;
            return NextResponse.json({ error: result.error }, { status });
        }

        return NextResponse.json({ certifications: result.certifications || [] });

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch certifications: ' + error.message }, { status: 500 });
    }
}
