import { NextResponse } from 'next/server';
import { getTrailblazerDetail } from '../../../../lib/db';

export async function GET(req, { params }) {
    try {
        const { aliasOrId } = params;
        const data = await getTrailblazerDetail(aliasOrId);
        if (!data) {
            return NextResponse.json({ error: 'Trailblazer not found' }, { status: 404 });
        }
        return NextResponse.json(data);
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch trailblazer detail' }, { status: 500 });
    }
}
