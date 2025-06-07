# Recipe Collection System - Deployment Guide

## Overview

This project is a complete recipe collection system that consists of:
- **Jekyll Static Site**: Displays recipes with a clean, responsive interface
- **Cloudflare Worker**: Handles Telegram bot integration and recipe processing
- **Telegram Bot**: Accepts recipe links and text for automatic processing
- **AI Integration**: Summarizes recipes using OpenAI-compatible APIs
- **GitHub Integration**: Automatically commits new recipes to trigger site rebuilds

## Prerequisites

- GitHub account
- Cloudflare account
- Telegram account
- OpenAI API key or compatible service (Groq, DeepSeek, etc.)
- Ruby and Jekyll (for local development)
- Node.js and Yarn (for local development)

## Part 1: GitHub Repository Setup

### 1.1 Repository Configuration

1. **Fork/Clone** this repository to your GitHub account
2. **Update** `wrangler.toml` with your details:
   ```toml
   GITHUB_OWNER = "your-username"
   GITHUB_REPO = "your-repo-name"
   ```

### 1.2 Generate GitHub Personal Access Token

1. Go to **GitHub Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. Click **Generate new token (classic)**
3. Give it a name like "Recipe Bot Access"
4. Select these scopes:
   - `repo` (Full control of private repositories)
   - `workflow` (Update GitHub Action workflows)
5. **Save the token** - you'll need it for the Cloudflare Worker

### 1.3 GitHub Actions Setup

Create the workflow file for automatic deployment:

```yaml
# .github/workflows/jekyll.yml
name: Build and Deploy Jekyll Site

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Ruby
        uses: ruby/setup-ruby@v1
        with:
          ruby-version: '3.1'
          bundler-cache: true

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'yarn'

      - name: Install dependencies
        run: |
          bundle install
          yarn install

      - name: Build CSS
        run: yarn build-css

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Build with Jekyll
        run: bundle exec jekyll build --baseurl "${{ steps.pages.outputs.base_path }}"
        env:
          JEKYLL_ENV: production

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

## Part 2: GitHub Pages Deployment

### 2.1 Enable GitHub Pages

1. Go to your repository **Settings** → **Pages**
2. Under **Source**, select **GitHub Actions**
3. The site will be available at `https://yourusername.github.io/your-repo-name`

### 2.2 Update Jekyll Configuration

Update `_config.yml` with your GitHub Pages URL:

```yaml
url: 'https://yourusername.github.io'
baseurl: '/your-repo-name'
title: 'My Recipe Collection'
```

## Part 3: Cloudflare Worker Deployment

### 3.1 Install Wrangler CLI

```bash
npm install -g wrangler
# or
yarn global add wrangler
```

### 3.2 Authenticate with Cloudflare

```bash
wrangler login
```

### 3.3 Set Environment Variables

Set sensitive environment variables using Wrangler:

```bash
# Set your OpenAI API key (or compatible service)
wrangler secret put OPENAI_API_KEY

# Set your GitHub personal access token
wrangler secret put GITHUB_TOKEN

# Set your Telegram bot token (from step 4)
wrangler secret put TELEGRAM_BOT_TOKEN
```

### 3.4 Update Worker Configuration

Edit `wrangler.toml` with your account details:

```toml
name = "recipe-worker"
account_id = "your-cloudflare-account-id"  # Find in Cloudflare dashboard
workers_dev = true
compatibility_date = "2023-10-01"

[vars]
OPENAI_API_URL = "https://api.groq.com/openai/v1/chat/completions"  # or your preferred API
OPENAI_MODEL = "deepseek-r1-distill-llama-70b"  # or your preferred model
GITHUB_OWNER = "your-username"
GITHUB_REPO = "your-repo-name"
GITHUB_BRANCH = "main"
```

### 3.5 Deploy the Worker

```bash
wrangler deploy
```

After deployment, note the worker URL (e.g., `https://recipe-worker.your-subdomain.workers.dev`)

## Part 4: Telegram Bot Setup

### 4.1 Create Telegram Bot

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot`
3. Choose a name and username for your bot
4. **Save the bot token** - you'll need this for the worker

### 4.2 Set Bot Webhook

Replace `YOUR_WORKER_URL` with your actual Cloudflare Worker URL:

```bash
curl -X POST "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "YOUR_WORKER_URL"}'
```

### 4.3 Test the Bot

1. Start a chat with your bot on Telegram
2. Send a recipe URL or paste recipe text
3. The bot should respond with a confirmation message
4. Check your GitHub repository for the new recipe file
5. Wait for GitHub Actions to deploy the updated site

## Part 5: Local Development Setup

### 5.1 Install Dependencies

```bash
# Install Ruby dependencies
bundle install

# Install Node.js dependencies  
yarn install
```

### 5.2 Build CSS

```bash
yarn build-css
```

### 5.3 Run Jekyll Locally

```bash
bundle exec jekyll serve
```

Visit `http://localhost:4000` to see your site.

### 5.4 Test Worker Locally

```bash
wrangler dev
```

## Part 6: Alternative Deployment Options

### 6.1 Cloudflare Pages

Instead of GitHub Pages, you can deploy to Cloudflare Pages:

1. Go to **Cloudflare Dashboard** → **Pages**
2. **Connect to Git** and select your repository
3. Use these build settings:
   - **Build command**: `bundle install && yarn install && yarn build-css && bundle exec jekyll build`
   - **Build output directory**: `_site`
   - **Root directory**: `/`

### 6.2 Netlify Deployment

For Netlify deployment:

1. Connect your GitHub repository to Netlify
2. Use these build settings:
   - **Build command**: `bundle install && yarn install && yarn build-css && bundle exec jekyll build`
   - **Publish directory**: `_site`
3. Add environment variables if needed

### 6.3 Vercel Deployment

For Vercel deployment, create `vercel.json`:

```json
{
  "buildCommand": "bundle install && yarn install && yarn build-css && bundle exec jekyll build",
  "outputDirectory": "_site",
  "installCommand": "bundle install && yarn install"
}
```

## Part 7: Configuration and Customization

### 7.1 Customize OpenAI Settings

You can use different AI providers by updating the worker configuration:

**For OpenAI:**
```toml
OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_MODEL = "gpt-4"
```

**For Groq:**
```toml
OPENAI_API_URL = "https://api.groq.com/openai/v1/chat/completions"
OPENAI_MODEL = "mixtral-8x7b-32768"
```

**For DeepSeek:**
```toml
OPENAI_API_URL = "https://api.deepseek.com/chat/completions"
OPENAI_MODEL = "deepseek-chat"
```

### 7.2 Customize Recipe Format

Edit the system prompt in `worker.js` to change how recipes are formatted:

```javascript
const systemPrompt = `You are an expert in cooking and food. You are given a text output of a recipe webpage and you need to convert it into a markdown file in english that is easy to understand and follow in the following format strictly:
// ... customize the format as needed
`;
```

### 7.3 Styling Customization

- Edit `assets/css/main.css` for custom styles
- Modify `tailwind.config.js` for Tailwind customizations
- Update `_layouts/` for structural changes

## Part 8: Troubleshooting

### Common Issues

1. **GitHub Actions failing**: Check that all secrets are set correctly
2. **Worker not responding**: Verify webhook URL and bot token
3. **Recipes not appearing**: Check GitHub API token permissions
4. **CSS not loading**: Run `yarn build-css` and commit changes

### Debug Tips

- Check Cloudflare Worker logs in the dashboard
- Use `wrangler tail` to see real-time logs
- Test the worker locally with `wrangler dev`
- Check GitHub Actions logs for build failures

## Part 9: Security Considerations

1. **Never commit API keys** - always use environment variables
2. **Use specific GitHub token permissions** - only grant necessary scopes
3. **Regularly rotate API keys** - especially if they're compromised
4. **Monitor Cloudflare Worker usage** - to avoid unexpected charges

## Support

If you encounter issues:
1. Check the GitHub repository issues
2. Review Cloudflare Worker logs
3. Verify all environment variables are set correctly
4. Test each component individually

Your recipe collection system is now ready to automatically collect, process, and display recipes from Telegram!