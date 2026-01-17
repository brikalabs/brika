# Contributing to Brika Verified Plugins

Thank you for your interest in having your plugin verified! This document explains how to submit your plugin for verification.

## Requirements

To be considered for verification, your plugin must:

1. **Be published to npm** – Your plugin must be available on the npm registry
2. **Include the `brika` keyword** - Add `"brika"` to your `package.json` keywords array (required for discovery)
3. **Depend on `@brika/sdk`** - Include `@brika/sdk` in dependencies (required for all plugins)
4. **Specify engine compatibility** - Include `engines.brika` field in your `package.json` (required for plugin identification)
5. **Follow the plugin schema** – Use the correct structure defined in https://schema.brika.dev/plugin.schema.json
6. **Be functional and well-tested** - The plugin should work as described
7. **Have clear documentation** – Include a README with usage instructions

## Submission Process

### 1. Prepare Your Plugin

Ensure your `package.json` includes:

```json
{
  "name": "@yourscope/your-plugin",
  "version": "1.0.0",
  "description": "A great plugin for Brika",
  "keywords": ["brika-plugin", "your-category"],
  "engines": {
    "brika": "^0.2.0"
  },
  "dependencies": {
    "@brika/sdk": "^0.2.0"
  },
  "$schema": "https://schema.brika.dev/plugin.schema.json"
}
```

**Note:** The `@brika/sdk` dependency is **required** for all plugins. This is how Brika discovers plugins on npm.

### 2. Publish to npm

```bash
npm publish
```

### 3. Submit a Pull Request

1. Fork this repository
2. Edit `verified-plugins.json` and add your plugin:

```json
{
  "name": "@yourscope/your-plugin",
  "verifiedAt": "2026-01-17T00:00:00Z",
  "verifiedBy": "your-github-username",
  "minVersion": "1.0.0",
  "featured": false,
  "category": "community"
}
```

3. Submit a pull request with:
   - **Title**: `Add verified plugin: @yourscope/your-plugin`
   - **Description**: Brief explanation of what your plugin does

### 4. Wait for Review

The Brika team will review your submission and:
- Verify the plugin works as described
- Check code quality and security
- Test compatibility with the current Brika version
- Approve or request changes

## Categories

- `official` - Official Brika plugins (reserved for maintainers)
- `community` - Community-contributed plugins
- `utility` - General utility plugins
- `integration` - Third-party service integrations
- `workflow` - Workflow automation plugins

## Featured Plugins

Featured plugins are selected by the Brika team based on:
- Quality and usefulness
- Popularity and community feedback
- Maintenance and support
- Documentation quality

Only set `featured: false` in your submission. The team will decide if it should be featured.

## Verification Criteria

Your plugin will be evaluated on:

1. **Functionality** – Does it work as advertised?
2. **Code Quality** – Is the code well-written and maintainable?
3. **Security** – Are there any security concerns?
4. **Documentation** – Is it well-documented?
5. **Compatibility** – Does it work with the specified Brika version?
6. **Maintenance** – Is the plugin actively maintained?

## Maintaining Verified Status

Once verified, your plugin should:
- Remain compatible with supported Brika versions
- Address reported issues promptly
- Maintain documentation
- Follow semantic versioning

Plugins that become unmaintained or have security issues may be removed from the verified list.

## Questions?

If you have questions about the verification process, please:
- Open an issue in this repository
- Join our community chat
- Email the maintainers

Thank you for contributing to the Brika ecosystem!
