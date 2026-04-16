import { NextResponse } from 'next/server';
import { getCertificationDetail } from '../../../../lib/db';

export async function GET(req, { params }) {
    try {
        const { id } = params;
        const data = await getCertificationDetail(id);
        if (!data) {
            return NextResponse.json({ error: 'Certification not found' }, { status: 404 });
        }
        return NextResponse.json(data);
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch certification detail' }, { status: 500 });
    }
}
