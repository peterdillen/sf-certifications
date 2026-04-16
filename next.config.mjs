/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverComponentsExternalPackages: ['sqlite3'],
        outputFileTracingExcludes: {
            '*': ['node_modules/sqlite3/**/*']
        },
        outputFileTracingIncludes: {
            '/api/**/*': ['./trailblazer*.db']
        }
    },
};

export default nextConfig;
