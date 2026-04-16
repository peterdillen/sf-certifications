import { NextResponse } from 'next/server';
import { getComparisonData, addTrailblazer, removeTrailblazer } from '../../../lib/db';

export async function GET() {
    try {
        const data = await getComparisonData();
        return NextResponse.json(data);
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch trailblazers' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { alias } = await req.json();
        if (!alias) {
            return NextResponse.json({ error: 'Alias is required' }, { status: 400 });
        }

        const trailblazer = await addTrailblazer(alias);
        return NextResponse.json(trailblazer);
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Failed to add trailblazer' }, { status: 500 });
    }
}
export async function DELETE(req) {
    try {
        const body = await req.json();
        const id = parseInt(body.id);
        if (isNaN(id)) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }
        await removeTrailblazer(id);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Failed to remove trailblazer' }, { status: 500 });
    }
}
