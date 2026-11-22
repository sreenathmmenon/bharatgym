/** @type {import('next').NextConfig} */
export default {
  output: 'standalone',
  webpack(config) {
    // Source imports use ESM .js specifiers, including for TypeScript modules.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.js', '.ts', '.tsx'],
    };
    return config;
  },
};
