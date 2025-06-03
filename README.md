# Recipe Book

A Jekyll-based recipe collection site with AI-powered recipe generation, deployed on Cloudflare Workers.

## Development Setup

### Prerequisites

- Ruby and Jekyll
- Node.js and Yarn
- Wrangler CLI

### Jekyll Development Server

1. Install Ruby dependencies:
   ```bash
   bundle install
   ```

2. Install Node.js dependencies:
   ```bash
   yarn install
   ```

3. Start the Jekyll development server with live reload:
   ```bash
   bundle exec jekyll serve --livereload
   ```

   The site will be available at `http://localhost:4000` with automatic browser refresh on file changes.

## Testing with Wrangler

### Local Development

1. Test the Cloudflare Worker locally:
   ```bash
   yarn wrangler dev
   ```

   This starts a local development server for the worker at `http://localhost:8787`.

### Environment Setup

Before testing, set up required secrets:

```bash
# Set your OpenAI/Groq API key
yarn wrangler secret put OPENAI_API_KEY

# Set your GitHub personal access token
yarn wrangler secret put GITHUB_TOKEN
```

Update the account ID in `wrangler.toml` with your Cloudflare account ID.

## Deployment

### Deploy to Cloudflare Workers

1. Login to Cloudflare:
   ```bash
   yarn wrangler auth login
   ```

2. Deploy the worker:
   ```bash
   yarn wrangler deploy
   ```

### Deploy Jekyll Site

The Jekyll site should be built and deployed to your hosting provider of choice. The worker handles API endpoints while the static site serves the recipe collection.

## Configuration

- **Jekyll Config**: `_config.yml`
- **Worker Config**: `wrangler.toml`
- **Styling**: Uses Tailwind CSS with PostCSS processing

## Project Structure

- `_recipes/`: Recipe markdown files
- `_layouts/`: Jekyll layout templates
- `_includes/`: Reusable Jekyll components
- `worker.js`: Cloudflare Worker for AI recipe generation
- `assets/css/`: Compiled CSS styles